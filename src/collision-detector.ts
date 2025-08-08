import {Matrix3, Vector3} from "three";
import Atom from "./atom";
import Config from "./config";
import Molecule from "./molecule";

export type CollisionPair = [Atom, Atom, boolean];
type Axis = {
  dimension: string;
  getMin: (atom: Atom) => number;
  getMax: (atom: Atom) => number;
}

// https://en.wikipedia.org/wiki/Sweep_and_prune
class SweepAndPrune {
  private _atoms: Atom[];
  private _sortedAxes: Map<string, Atom[]>; // Atoms stored sorted by x, y, and z axis.
  private _axes: Axis[];

  constructor(atoms: Atom[], molecules: Molecule[]) {
    this._atoms = atoms;
    this._sortedAxes = new Map();

    this._axes = [
      {dimension: 'x', getMin: (atom) => atom.getMinX(), getMax: (atom) => atom.getMaxX()},
      {dimension: 'y', getMin: (atom) => atom.getMinY(), getMax: (atom) => atom.getMaxY()},
      {dimension: 'z', getMin: (atom) => atom.getMinZ(), getMax: (atom) => atom.getMaxZ()},
    ];

    this._axes.forEach(axis => {
      this._sortedAxes.set(axis.dimension, []);
      this._atoms.forEach(atom => {
        this._sortedAxes.get(axis.dimension)!.push(atom);
      });
    });
  }

  private sortAxis(axis: Axis): void {
    const sorted = this._sortedAxes.get(axis.dimension)!;
    sorted.sort((a, b) => axis.getMax(a) - axis.getMin(b));
  }


  // TODO: string is not ideal
  private sweepAxis(axis: Axis): Set<string> {
    const overlappingPairs = new Set<string>();
    const sorted = this._sortedAxes.get(axis.dimension)!;

    for (let i = 0; i < sorted.length; i++) {
      const atomA = sorted[i];

      for (let j = i + 1; j < sorted.length; j++) {
        const atomB = sorted[j];

        if (axis.getMin(atomB) > axis.getMax(atomA)) {
          break;
        }

        // TODO: sorry, this is so ugly. A simple list of two numbers doesn't work with Set.has()
        const keyPair = atomA.key < atomB.key ? `${atomA.key}-${atomB.key}` : `${atomB.key}-${atomA.key}`;
        overlappingPairs.add(keyPair);
      }
    }

    return overlappingPairs;
  }

  // Quick collision detection for overlapping axis-aligned boudning boxes.
  detectSAPCollisions(): CollisionPair[] {
    // Sort AABBs on all axes and get overlaps.
    const axisOverlaps = this._axes.map(axis => {
      this.sortAxis(axis);
      return this.sweepAxis(axis);
    });

    // Find pairs that overlap on ALL axes.
    const collisionPairs: CollisionPair[] = [];
    const [xOverlaps, yOverlaps, zOverlaps] = axisOverlaps;

    for (const pair of xOverlaps) {
      if (yOverlaps.has(pair) && zOverlaps.has(pair)) {
        const keyA = parseInt(pair.split('-')[0]);
        const keyB = parseInt(pair.split('-')[1]);
        const cubeA = this._atoms.find(atom => atom.key === keyA);
        const cubeB = this._atoms.find(atom => atom.key === keyB);
        if (cubeA && cubeB) {
          if ((cubeA.molecule_id == cubeB.molecule_id) && cubeA.is_in_molecule) {
            // Ignore cubes colliding within their own molecules.
          } else {
            collisionPairs.push([cubeA, cubeB, false]);
          }
        }
      }
    }

    return collisionPairs;
  }
}

// A rotated bounding box, don't need the size because it's always the same.
interface OrientedBoundingBox {
  center: Vector3;
  axes: Vector3[]; // 3 orthonormal vectors representing local coordinate system
}

interface CollisionInfo {
  atomA: Atom;
  atomB: Atom;
  contactPoint: Vector3;
  contactNormal: Vector3;
  penetrationDepth: number;
  isMatchingFaces: boolean;
}

// Separating axis theorem. Like shining a flashlight perpendicular to each axis of each atom (3 + 3 = 6 total), and
// then along each combined axis, which is the normalized cross product of each combination of axes (3 x 3 = 9 total).
// So 15 total checks take place. This is a big heavy, which is why we do the "broad phase" sweep and prune first.
// https://dyn4j.org/2010/01/sat/
class SATCollisionDetector {
  private static readonly EPSILON = 1e-6;

  private static meshToOBB(atom: Atom): OrientedBoundingBox {
    // Get the world position.
    atom.updateMatrixWorld(true);
    const center = new Vector3();
    atom.getWorldPosition(center);

    // Extract rotation matrix from the mesh's world matrix
    // atom.updateMatrixWorld(true);
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

  // Like sweep and prune, objects that are colliding need their extents to overlap on relevant axes.
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
    interface vert {
      index: number;
      position: Vector3;
    }
    function getWorldSpaceVertices(atom: Atom): vert[] {
        /*
               E-------F
              /|      /|
             / |     / |
            A--|----B  |
            |  G----|--H
            | /     | /
            |/      |/
            C-------D
            */
        const vertices = [
          new Vector3(-0.5, 0.5, -0.5).multiplyScalar(Config.atom_size), // A
          new Vector3(0.5, 0.5, -0.5).multiplyScalar(Config.atom_size), // B
          new Vector3(-0.5, -0.5, -0.5).multiplyScalar(Config.atom_size), // C
          new Vector3(0.5, -0.5, -0.5).multiplyScalar(Config.atom_size), // D
          new Vector3(-0.5, 0.5, 0.5).multiplyScalar(Config.atom_size), // E
          new Vector3(0.5, 0.5, 0.5).multiplyScalar(Config.atom_size), // F
          new Vector3(-0.5, -0.5, 0.5).multiplyScalar(Config.atom_size), // G
          new Vector3(0.5, -0.5, 0.5).multiplyScalar(Config.atom_size), // H
        ];

        const worldVertices: vert[] = []
        // Extract all vertex positions and transform to world coordinates
        vertices.forEach((vertex, index) => {
            const vertexWorld = vertex.clone();

            // Transform to world coordinates
            vertexWorld.applyMatrix4(atom.matrixWorld);
            const v: vert = {index: index, position: vertexWorld};
            worldVertices.push(v);
        });

        return worldVertices;
    }

    function vertexIndexToFaces(index: number): number[] {
      // Look at the diagram in getWorldSpaceVertices.
      // defining the faces in order as: [front (0), back (1), left (2), right (3), top (4), bottom (5)]
      switch (index) {
        case 0: // A
          return [0, 2, 4]; // front left top
        case 1: // B
          return [0, 3, 4]; // front right top
        case 2: // C
          return [0, 2, 5]; // front left bottom
        case 3: // D
          return [0, 3, 5]; // front right bottom
        case 4: // E
          return [1, 2, 4]; // back left top
        case 5: // F
          return [1, 3, 4]; // back right top
        case 6: // G
          return [1, 2, 5]; // back left bottom
        case 7: // H
          return [1, 3, 5]; // back right bottom
      }


      return [-1, -1, -1];
    }


    const obbA = this.meshToOBB(atomA);
    const obbB = this.meshToOBB(atomB);


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

    // Approximate contact point as midpoint between closest surfaces.
    const contactPoint = obbA.center.clone()
      .add(obbB.center)
      .multiplyScalar(0.5);

    // const isMatchingFaces = areMatchingFacesColliding(atomA, atomB, collisionNormal);
    const verticesA = getWorldSpaceVertices(atomA);
    const verticesB = getWorldSpaceVertices(atomB);
    interface vertexPair {
      indexA: number,
      indexB: number,
      distance: number
    }
    const vertexDistances: vertexPair[] = [];
    verticesA.forEach((vertA) => {
      verticesB.forEach((vertB) => {
        const d = vertA.position.distanceTo(vertB.position);
        vertexDistances.push({
          indexA: vertA.index,
          indexB: vertB.index,
          distance: d,
        })
      });
    });
    vertexDistances.sort((a, b) => a.distance - b.distance);
    // Big assumption time: if the three closest vertices share a face, then the faces are colliding.
    const sharedFaces = [];
    for (let i = 0; i < 3; i++) {
      sharedFaces.push(vertexIndexToFaces(vertexDistances[i].indexA).filter(
        element => vertexIndexToFaces(vertexDistances[i].indexB).includes(element)));
    }
    const sharedFace = sharedFaces[0].filter(e => sharedFaces.slice(1).every(sublist => sublist.includes(e)) );
    const isMatchingFaces = sharedFace.length > 0;


    return {
      atomA,
      atomB,
      contactPoint,
      contactNormal: collisionNormal,
      penetrationDepth: minOverlap,
      isMatchingFaces,
    };
  }

  // Modify the velocity and rotation of colliding atoms.
  // https://www.cs.ubc.ca/~rhodin/2020_2021_CPSC_427/lectures/D_CollisionTutorial.pdf
  // https://en.wikipedia.org/wiki/Collision_response#Impulse-based_contact_model
  private static resolveCollision(collision: CollisionInfo): void {
    const {atomA, atomB, contactPoint, contactNormal, penetrationDepth, isMatchingFaces} = collision;

    // Separate objects to prevent overlap.
    const separationVector = contactNormal.clone().multiplyScalar(penetrationDepth * 0.5);
    atomA.position.sub(separationVector);
    atomB.position.add(separationVector);

    // Calculate relative velocity at contact point.
    const rA = contactPoint.clone().sub(atomA.position); // Contact point relative to A's center
    const rB = contactPoint.clone().sub(atomB.position); // Contact point relative to B's center

    // Angular velocity contribution to contact point velocity
    const angularVelA = new Vector3().crossVectors(atomA.rotation_axis.clone().multiplyScalar(atomA.rotation_speed), rA);
    const angularVelB = new Vector3().crossVectors(atomB.rotation_axis.clone().multiplyScalar(atomB.rotation_speed), rB);

    // Total velocity at contact point
    const velA = atomA.velocity.clone().add(angularVelA);
    const velB = atomB.velocity.clone().add(angularVelB);
    const relativeVelocity = velA.sub(velB);

    // Velocity component along collision normal
    const normalVelocity = relativeVelocity.dot(contactNormal);

    // Don't resolve if objects are separating
    if (normalVelocity < 0) return;

    // Collision moment arms.
    const rA_cross_n = new Vector3().crossVectors(rA, contactNormal);
    const rB_cross_n = new Vector3().crossVectors(rB, contactNormal);

    // This is already very complicated. Give them the moment of a inertia of a solid sphere.
    const moment_of_inertia = (2 / 5) * Config.atom_mass * Math.pow(Config.atom_size / 2, 2);

    const denominator = (2 / Config.atom_mass) +
      ((rA_cross_n.lengthSq() + rB_cross_n.lengthSq()) / moment_of_inertia);

    const impulseMagnitude = -(1 + Config.restitution_coefficient) * normalVelocity / denominator;
    const impulse = contactNormal.clone().multiplyScalar(impulseMagnitude);

    // Apply linear impulse
    atomA.velocity.add(impulse.clone().multiplyScalar(1 / Config.atom_mass));
    atomB.velocity.sub(impulse.clone().multiplyScalar(1 / Config.atom_mass));

    // Apply angular impulse
    const angularImpulseA = new Vector3().crossVectors(rA, impulse).multiplyScalar(1 / moment_of_inertia);
    const angularImpulseB = new Vector3().crossVectors(rB, impulse).multiplyScalar(-1 / moment_of_inertia);

    // Update rotation (convert angular impulse to change in angular velocity)
    const newAngularVelA = atomA.rotation_axis.clone().multiplyScalar(atomA.rotation_speed).add(angularImpulseA);
    const newAngularVelB = atomB.rotation_axis.clone().multiplyScalar(atomB.rotation_speed).add(angularImpulseB);

    // Update rotation axis and speed for A
    atomA.rotation_speed = newAngularVelA.length();
    atomA.rotation_axis = newAngularVelA.normalize();

    // Update rotation axis and speed for B
    atomB.rotation_speed = newAngularVelB.length();
    atomB.rotation_axis = newAngularVelB.normalize();
  }

  public static testAndResolveCollision(atomA: Atom, atomB: Atom): {isColliding: boolean, isSticking: boolean } {
    const collisionInfo = this.findCollisionInfo(atomA, atomB);

    if(collisionInfo) {
      this.resolveCollision(collisionInfo);
      // if (!collisionInfo.isMatchingFaces) {
      // }
      return { isColliding: true, isSticking: collisionInfo.isMatchingFaces };
    }

    return { isColliding: false, isSticking: false } ;
  }
}

export default class CollisionDetector extends SweepAndPrune {
  detectCollisions(): CollisionPair[] {
    // First, get potential collision pairs from sweep-and-prune (broad phase)
    const broadPhaseCollisions = this.detectSAPCollisions();

    // Then, filter using SAT for precise collision detection (narrow phase)
    // Though it feels poorly structured. This is an easy time to actually update the velocities and rotations of the
    // cubes.
    // TODO: don't break law of demeter
    const preciseCollisions: CollisionPair[] = [];
    for (const [atomA, atomB] of broadPhaseCollisions) {
      const {isColliding, isSticking} = SATCollisionDetector.testAndResolveCollision(atomA, atomB);
      if (isColliding) {
        preciseCollisions.push([atomA, atomB, isSticking]);
      }
    }


    return preciseCollisions;
  }
}