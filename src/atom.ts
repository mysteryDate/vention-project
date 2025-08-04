import {
  BoxBufferGeometry,
  Mesh,
  MeshNormalMaterial,
  Quaternion,
  Vector3,
} from "three";

import Config from "./config.json";

export default class Atom {
  public position: Vector3;
  public rotation: Quaternion;
  public mesh: Mesh;

  constructor() {
    function randomVector3() {
      return new Vector3(Math.random(), Math.random(), Math.random());
    }

    this.position = randomVector3().multiplyScalar(Config.simulation_size).sub(new Vector3(
      Config.simulation_size / 2,
      Config.simulation_size / 2,
      Config.simulation_size / 2
    ));

    this.rotation = new Quaternion()
    this.rotation.setFromAxisAngle(
      randomVector3(), Math.random() * Math.PI * 2
    );

    const geometry = new BoxBufferGeometry( Config.atom_size, Config.atom_size, Config.atom_size);
    const material = new MeshNormalMaterial();
    this.mesh = new Mesh(geometry, material);
    this.mesh.position.copy(this.position);
  }
}
