import Atom from "./atom";

export type CollisionPair = [Atom, Atom];
type Axis = {
  dimension: string;
  getMin: (atom: Atom) => number;
  getMax: (atom: Atom) => number;
}

// https://en.wikipedia.org/wiki/Sweep_and_prune
export default class SweepAndPrune {
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

        // const keyPair = [atomA.key, atomB.key];
        // TODO: sorry, this is so ugly
        const keyPair = atomA.key < atomB.key ? `${atomA.key}-${atomB.key}` : `${atomB.key}-${atomA.key}`;
        overlappingPairs.add(keyPair);
      }
    }

    return overlappingPairs;
  }

  // Main collision detection method
  detectCollisions(): CollisionPair[] {
    // Sort cubes on all axes and get overlaps
    const axisOverlaps = this._axes.map(axis => {
      this.sortAxis(axis);
      return this.sweepAxis(axis);
    });

    // Find pairs that overlap on ALL axes
    const collisionPairs: CollisionPair[] = [];
    const [xOverlaps, yOverlaps, zOverlaps] = axisOverlaps;

    for (const pair of xOverlaps) {
      if (yOverlaps.has(pair) && zOverlaps.has(pair)) {
        // Ugh, not good
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
