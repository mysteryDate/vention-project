import {Matrix3, Vector3} from "three";
import Atom from "./atom";
import Config from "./config.json";

export type CollisionPair = [Atom, Atom];
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

  constructor(atoms: Atom[]) {
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
          collisionPairs.push([cubeA, cubeB]);
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

// Separating axis theorem. Like shining a flashlight perpendicular to each axis of each atom, then along each
// https://dyn4j.org/2010/01/sat/
class SATCollisionDetector {
  private static readonly EPSILON = 1e-6;

  private static meshToOBB(atom: Atom): OrientedBoundingBox {
    // Get the world position.
    const center = atom.position.clone();

    // Extract rotation matrix from the mesh's world matrix
    atom.updateMatrixWorld(true);
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
  private static testSeparatingAxis(obbA: OrientedBoundingBox, obbB: OrientedBoundingBox, axis: Vector3): boolean {
    const projA = this.projectOBBOntoAxis(obbA, axis);
    const projB = this.projectOBBOntoAxis(obbB, axis);

    return projA.max >= projB.min && projB.max >= projA.min;
  }

  public static testCollision(atomA: Atom, atomB: Atom): boolean {
    const obbA = this.meshToOBB(atomA);
    const obbB = this.meshToOBB(atomB);

    // Test the 6 face normals (3 from each OBB)
    for (let i = 0; i < 3; i++) {
      if (!this.testSeparatingAxis(obbA, obbB, obbA.axes[i])) {
        return false; // Found separating axis
      }
      if (!this.testSeparatingAxis(obbA, obbB, obbB.axes[i])) {
        return false; // Found separating axis
      }
    }

    // Test the 9 cross products between edge directions
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) {
        const crossProduct = new Vector3().crossVectors(obbA.axes[i], obbB.axes[j]);

        // Skip parallel edges (cross product near zero)
        if (crossProduct.length() > this.EPSILON) {
          if (!this.testSeparatingAxis(obbA, obbB, crossProduct.normalize())) {
            return false; // Found separating axis
          }
        }
      }
    }

    // No separating axis found - objects are colliding
    return true;
  }
}

export default class CollisionDetector extends SweepAndPrune {

  detectCollisions(): CollisionPair[] {
    // First, get potential collision pairs from sweep-and-prune (broad phase)
    const broadPhaseCollisions = this.detectSAPCollisions();

    // Then, filter using SAT for precise collision detection (narrow phase)
    const preciseCollisions: CollisionPair[] = [];

    for (const [atomA, atomB] of broadPhaseCollisions) {
      if (SATCollisionDetector.testCollision(atomA, atomB)) {
        preciseCollisions.push([atomA, atomB]);
      }
    }

    return preciseCollisions;
  }
}