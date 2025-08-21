import {MathUtils, Matrix3, Vector3} from "three";
import Atom from "./atom";
import Config from "./config";
import {areMatchingFacesColliding} from "./matching-faces-test";
import Molecule from "./molecule";

export type CollisionPair = [Atom, Atom];
type Axis = {
  dimension: string;
  getMin: (atom: Atom) => number;
  getMax: (atom: Atom) => number;
}

class SpacePartition {
  private _atoms: Atom[];
  private _grid: Atom[][][][];
  // private _grid_size: number = Config.atom_size * Math.sqrt(3);
  private _grid_size: number = Config.atom_size;
  private _num_rows: number = Math.floor(Config.simulation_size / this._grid_size) + 1;
  private _NEIGHBORS: [number, number, number][] = [];

  constructor(atoms: Atom[]) {
    this._atoms = atoms;
    for (let i = 0; i < 27; i++) {
      this._NEIGHBORS.push([
        Math.floor((i % 3) - 1),
        Math.floor((i / 3) % 3 - 1),
        Math.floor((i / 9) % 3 - 1)
      ]);
    }
    this._grid = [];
    for (let x = 0; x < this._num_rows; x++) {
      this._grid[x] = [];
      for (let y = 0; y < this._num_rows; y++) {
        this._grid[x][y] = [];
        for (let z = 0; z < this._num_rows; z++) {
          this._grid[x][y][z] = [];
        }
      }
    }
  }

  private getAddress(atom: Atom): [number, number, number] {
    const position = atom.getWorldPosition(new Vector3);
    const x = Math.floor(Math.min(Config.simulation_size / this._grid_size, Math.max(0, (position.x + Config.simulation_size / 2) / this._grid_size)));
    const y = Math.floor(Math.min(Config.simulation_size / this._grid_size, Math.max(0, (position.y + Config.simulation_size / 2) / this._grid_size)));
    const z = Math.floor(Math.min(Config.simulation_size / this._grid_size, Math.max(0, (position.z + Config.simulation_size / 2) / this._grid_size)));
    return [x, y, z];
  }

  private fillGrid() {
    this.clearGrid();
    this._atoms.forEach((atom) => {
      const [x, y, z] = this.getAddress(atom);
      if (x && y && z) {
        this._grid[x][y][z].push(atom);
      }
    });
  }

  private clearGrid() {
    // TODO: I'm sure there's a clever way to avoid GC
    for (let x = 0; x < this._num_rows; x++) {
      for (let y = 0; y < this._num_rows; y++) {
        for (let z = 0; z < this._num_rows; z++) {
          this._grid[x][y][z] = [];
        }
      }
    }
  }

  detectSpacePartitionCollisions(): CollisionPair[] {
    this.fillGrid();
    const grid = this._grid;
    const collisionPairSet: Set<string> = new Set();
    this._atoms.forEach((atom) => {
      const [x, y, z] = this.getAddress(atom);
      this._NEIGHBORS.forEach(neighbor => {
        const [a, b, c] = [x + neighbor[0], y + neighbor[1], z + neighbor[2]];
        if (a != -1 && b != -1 && c != -1 && a < grid.length && b < grid.length && c < grid.length) {
          const neighbors = grid[a][b][c];
          if (neighbors) {
            neighbors.filter(atom2 => { return atom2.key != atom.key).forEach(atom2 => {
              if ((atom.molecule_id == atom2.molecule_id) && atom.is_in_molecule) {
              } else {
                const keyPair = atom.key < atom2.key ? `${atom.key}-${atom2.key}` : `${atom2.key}-${atom.key}`;
                collisionPairSet.add(keyPair);
              }
            });
          }
        }
      });
    });

    const collisionPairs: CollisionPair[] = [];
    collisionPairSet.forEach(keyPair => {
      const keyA = parseInt(keyPair.split('-')[0]);
      const keyB = parseInt(keyPair.split('-')[1]);
      const atomA = this._atoms[keyA];
      const atomB = this._atoms[keyB];
      collisionPairs.push([atomA, atomB]);
    });

    return collisionPairs;
  }
}

// A rotated bounding box
// I don't need the size because it's always the same.
interface OrientedBoundingBox {
  center: Vector3;
  axes: Vector3[]; // Equivalent to the orientation of the box, its local coordinate system.
}

interface CollisionInfo {
  atomA: Atom; // First atom of the collision.
  atomB: Atom; // Second atom of the collision.
  contactPoint: Vector3; // In world space, where the collision is happening.
  contactNormal: Vector3; // The direction that would take the smallest delta to push the atoms apart.
  penetrationDepth: number; // How far the overlap is between atomA and atomB.
  isMatchingFaces: boolean; // For sticking, if the two faces have the same color.
}

// Separating axis theorem. Like shining a flashlight perpendicular to each axis of each atom (3 + 3 = 6 total), and
// then along each combined axis, which is the normalized cross product of each combination of axes (3 x 3 = 9 total).
// So 15 total checks take place. This is a bit heavy, which is why we do the "broad phase" sweep and prune first.
// https://dyn4j.org/2010/01/sat/
class SATCollisionDetector {
  // For testing that the combined axes aren't degenerate.
  private static readonly EPSILON = 1e-6;

  private static meshToOrientedBoundingBox(atom: Atom): OrientedBoundingBox {
    atom.updateMatrixWorld(true);
    const center = atom.getWorldPosition(new Vector3());

    // Extract rotation matrix from the mesh's world matrix
    const rotationMatrix = new Matrix3().setFromMatrix4(atom.matrixWorld);

    // Get the local axes from rotation matrix
    const axes = [
      new Vector3().setFromMatrix3Column(rotationMatrix, 0).normalize(),
      new Vector3().setFromMatrix3Column(rotationMatrix, 1).normalize(),
      new Vector3().setFromMatrix3Column(rotationMatrix, 2).normalize()
    ];

    return {
      center,
      axes
    };
  }

  // Project an oriented bounding box onto a vector 3, return the minimum and maximum extent of the projection.
  private static projectOBBOntoAxis(obb: OrientedBoundingBox, axis: Vector3): {min: number; max: number} {
    // Project center onto axis.
    const centerProjection = obb.center.dot(axis);

    // Calculate radius by projecting each local axis
    let radius = 0;
    radius += Math.abs(obb.axes[0].dot(axis)) * Config.atom_size / 2;
    radius += Math.abs(obb.axes[1].dot(axis)) * Config.atom_size / 2;
    radius += Math.abs(obb.axes[2].dot(axis)) * Config.atom_size / 2;

    return {
      min: centerProjection - radius,
      max: centerProjection + radius
    };
  }

  // Like sweep and prune, objects that are colliding need their extents to overlap on all axes.
  // The difference here is that there are no false positives. i.e. objects that overlap on all axes are known to be
  // colliding.
  private static testSeparatingAxis(
    obbA: OrientedBoundingBox,
    obbB: OrientedBoundingBox,
    axis: Vector3): {separated: boolean; overlap: number } {

    const projA = this.projectOBBOntoAxis(obbA, axis);
    const projB = this.projectOBBOntoAxis(obbB, axis);

    const separated = !(projA.max >= projB.min && projB.max >= projA.min);
    // How much the two objects overlap along this axis.
    const overlap = separated ? 0 : Math.min(projA.max - projB.min, projB.max - projA.min);

    return {separated, overlap};
  }

  private static findCollisionInfo(atomA: Atom, atomB: Atom): CollisionInfo | null {
    const obbA = this.meshToOrientedBoundingBox(atomA);
    const obbB = this.meshToOrientedBoundingBox(atomB);

    let minOverlap = Infinity;
    let collisionNormal = new Vector3();

    // Test all 15 potential separating axes and track minimum separation.
    const testAxes = [
      ...obbA.axes,
      ...obbB.axes,
      // Cross products for edge-edge collisions. Filter out co-linear (degenerate) combinations and normalize the rest.
      ...obbA.axes.flatMap(axisA =>
        obbB.axes.map(axisB => new Vector3().crossVectors(axisA, axisB))
          .filter(cross => cross.length() > this.EPSILON).map(cross => cross.normalize())
      )
    ];



    for (const axis of testAxes) {
      const result = this.testSeparatingAxis(obbA, obbB, axis);

      if (result.separated) {
        return null; // No collision
      }

      // The smallest overlap respresents the smallest distance needed to push the overlapping cubes apart.
      if (result.overlap < minOverlap) {
        minOverlap = result.overlap;
        collisionNormal = axis.clone().normalize();

        // Ensure normal points from A to B.
        const centerDiff = obbB.center.clone().sub(obbA.center);
        if (collisionNormal.dot(centerDiff) < 0) {
          collisionNormal.negate();
        }
      }
    }

    // Approximate contact point as midpoint between the two atoms.
    const contactPoint = obbA.center.clone()
      .add(obbB.center)
      .multiplyScalar(0.5);


    let isMatchingFaces = false;
    if (Config.form_molecules) {
      isMatchingFaces = areMatchingFacesColliding(atomA, atomB);
    }

    return {
      atomA,
      atomB,
      contactPoint,
      contactNormal: collisionNormal,
      penetrationDepth: minOverlap,
      isMatchingFaces: isMatchingFaces,
    };
  }

  // Modify the velocity and rotation of colliding atoms.
  // https://www.cs.ubc.ca/~rhodin/2020_2021_CPSC_427/lectures/D_CollisionTutorial.pdf
  // https://en.wikipedia.org/wiki/Collision_response#Impulse-based_contact_model
  // TODO: This really doesn't handle moledcules properly.
  private static resolveCollision(collision: CollisionInfo): void {
    const {atomA, atomB, contactPoint, contactNormal, penetrationDepth} = collision;

    const objA = atomA.is_in_molecule ? atomA.molecule : atomA;
    const objB = atomB.is_in_molecule ? atomB.molecule : atomB;

    // Get individual masses
    const massA = objA.getMass();
    const massB = objB.getMass();

    // Separate objects to prevent overlap.
    const totalMass = massA + massB;
    // Push back heavier objects less.
    const separationA = contactNormal.clone().multiplyScalar(penetrationDepth * massB / totalMass);
    const separationB = contactNormal.clone().multiplyScalar(penetrationDepth * massA / totalMass);
    objA.position.sub(separationA);
    objB.position.add(separationB);

    // Calculate relative velocity at contact point.
    const rA = contactPoint.clone().sub(objA.position); // Contact point relative to A's center
    const rB = contactPoint.clone().sub(objB.position); // Contact point relative to B's center

    // Angular velocity contribution to contact point velocity
    const angularVelA = new Vector3().crossVectors(objA.rotation_axis.clone().multiplyScalar(objA.rotation_speed), rA);
    const angularVelB = new Vector3().crossVectors(objB.rotation_axis.clone().multiplyScalar(objB.rotation_speed), rB);

    // Total velocity at contact point
    const velA = objA.velocity.clone().add(angularVelA);
    const velB = objB.velocity.clone().add(angularVelB);
    const relativeVelocity = velA.sub(velB);

    // Velocity component along collision normal
    const normalVelocity = relativeVelocity.dot(contactNormal);

    // If objects are moving apart from each other, skip it.
    if (normalVelocity < 0) return;

    // Collision moment arms.
    const rA_cross_n = new Vector3().crossVectors(rA, contactNormal);
    const rB_cross_n = new Vector3().crossVectors(rB, contactNormal);

    // Calculate moments of inertia based on individual masses and sizes
    // Assuming solid sphere: I = (2/5) * m * r²
    // This greatly overestimates the moment inertia of some molecules.
    const radiusA = objA.getSize() / 2;
    const radiusB = objB.getSize() / 2;
    const momentA = (2 / 5) * massA * Math.pow(radiusA, 2);
    const momentB = (2 / 5) * massB * Math.pow(radiusB, 2);
    const denominator = (1 / massA) + (1 / massB) + (rA_cross_n.lengthSq() / momentA) + (rB_cross_n.lengthSq() / momentB);

    const impulseMagnitude = -(1 + Config.restitution_coefficient) * normalVelocity / denominator;
    const impulse = contactNormal.clone().multiplyScalar(impulseMagnitude);

    // Apply linear impulse
    objA.velocity.add(impulse.clone().multiplyScalar(1 / massA));
    objB.velocity.sub(impulse.clone().multiplyScalar(1 / massB));

    // Apply angular impulse
    const angularImpulseA = new Vector3().crossVectors(rA, impulse).multiplyScalar(1 / momentA);
    const angularImpulseB = new Vector3().crossVectors(rB, impulse).multiplyScalar(-1 / momentB);

    // Update rotation (convert angular impulse to change in angular velocity)
    const newAngularVelA = objA.rotation_axis.clone().multiplyScalar(objA.rotation_speed).add(angularImpulseA);
    const newAngularVelB = objB.rotation_axis.clone().multiplyScalar(objB.rotation_speed).add(angularImpulseB);

    function lerp(a: number, b: number, t: number) {
      return a + t * (b - a);
    }

    function slerp(startVec: Vector3, endVec: Vector3, t: number): Vector3 {
      const dot = startVec.dot(endVec);
      const theta = Math.acos(MathUtils.clamp(dot, -1, 1)); // Clamp to handle floating point errors

      if (theta === 0) {
        return startVec.clone();
      }

      const sinTheta = Math.sin(theta);
      const s0 = Math.sin((1 - t) * theta) / sinTheta;
      const s1 = Math.sin(t * theta) / sinTheta;

      const result = startVec.clone().multiplyScalar(s0).add(endVec.clone().multiplyScalar(s1));
      return result.normalize();
    }


    // I'm intentionally slowing down rotational momentum transfer from atoms to molecules here to keep things stable.
    // Update rotation axis and speed for A
    if (!(objA instanceof Molecule)) {
      objA.rotation_speed = newAngularVelA.length();
      objA.rotation_axis = newAngularVelA.clone().normalize();
    } else {
      objA.rotation_axis = slerp(objA.rotation_axis, newAngularVelA.clone().normalize(), massA / totalMass * Molecule.lerp_amt);
      objA.rotation_speed = lerp(objA.rotation_speed, newAngularVelA.length(), massA / totalMass * Molecule.lerp_amt);
    }

    // Update rotation axis and speed for B
    if (!(objB instanceof Molecule)) {
      objB.rotation_speed = newAngularVelB.length();
      objB.rotation_axis = newAngularVelB.clone().normalize();
    } else {
      objB.rotation_axis = slerp(objB.rotation_axis, newAngularVelB.clone().normalize(), massA / totalMass * Molecule.lerp_amt);
      objB.rotation_speed = lerp(objB.rotation_speed, newAngularVelA.length(), massA / totalMass * Molecule.lerp_amt);
    }
  }

  public static testAndResolveCollision(atomA: Atom, atomB: Atom): {isColliding: boolean, isSticking: boolean } {
    const collisionInfo = this.findCollisionInfo(atomA, atomB);

    if(collisionInfo) {
      this.resolveCollision(collisionInfo);
      return {
        isColliding: true,
        isSticking: (collisionInfo.isMatchingFaces && Config.form_molecules)
      };
    }

    return { isColliding: false, isSticking: false } ;
  }
}

export type Collision = {
  pair: CollisionPair,
  isSticking: boolean,
};
export default class CollisionDetector extends SpacePartition {
  detectCollisions(): Collision[] {
    // First, get potential collision pairs from sweep-and-prune (broad phase)
    const broadPhaseCollisions = this.detectSpacePartitionCollisions();

    // Then, filter using SAT for precise collision detection (narrow phase)
    // Though it feels poorly structured. This is an easy time to actually update the velocities and rotations of the
    // cubes.
    const preciseCollisions: Collision[] = [];
    for (const [atomA, atomB] of broadPhaseCollisions) {
      const {isColliding, isSticking} = SATCollisionDetector.testAndResolveCollision(atomA, atomB);
      if (isColliding) {
        preciseCollisions.push({
          pair: [atomA, atomB],
          isSticking: isSticking
        });
      }
    }


    return preciseCollisions;
  }
}