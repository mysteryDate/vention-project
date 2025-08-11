import {Vector3} from "three";
import Atom from "./atom";
import Config from "./config";

// Given two atoms that are known to be colliding, return true if the collision is on matching faces.
export function areMatchingFacesColliding(atomA: Atom, atomB: Atom): boolean {
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
  const sharedFaces: number[][] = [];
  for (let i = 0; i < 3; i++) {
    sharedFaces.push(vertexIndexToFaces(vertexDistances[i].indexA).filter(
      element => vertexIndexToFaces(vertexDistances[i].indexB).includes(element)));
  }
  const sharedFace = sharedFaces[0].filter(e => sharedFaces.slice(1).every(sublist => sublist.includes(e)) );
  const isMatchingFaces = sharedFace.length > 0;
  return isMatchingFaces;
}