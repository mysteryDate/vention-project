import {
  BoxBufferGeometry,
  Mesh,
  MeshNormalMaterial,
  Vector3
} from "three";

import Config from "./config.json";

export default class Atom {
  // public position: Vector3;
  public rotation_axis: Vector3;
  public rotation_speed: number;
  public velocity: Vector3;
  public mesh: Mesh;

  constructor() {
    function randomVector3() {
      return new Vector3(Math.random(), Math.random(), Math.random());
    }


    this.rotation_axis = randomVector3().normalize();
    this.rotation_speed = Math.random() / 10;

    this.velocity = randomVector3().normalize();

    const geometry = new BoxBufferGeometry( Config.atom_size, Config.atom_size, Config.atom_size);
    const material = new MeshNormalMaterial();
    this.mesh = new Mesh(geometry, material);
    this.mesh.position.copy(randomVector3().multiplyScalar(Config.simulation_size).sub(new Vector3(
      Config.simulation_size / 2,
      Config.simulation_size / 2,
      Config.simulation_size / 2
    )));
    // TODO all atoms start with default orientation
  }

  public update() {
    this.mesh.rotateOnAxis(this.rotation_axis, this.rotation_speed);
    this.mesh.position.add(this.velocity);

    if (this.mesh.position.x > Config.simulation_size / 2) {
      this.velocity.x *= -1;
    }
    if (this.mesh.position.y > Config.simulation_size / 2) {
      this.velocity.y *= -1;
    }
    if (this.mesh.position.z > Config.simulation_size / 2) {
      this.velocity.z *= -1;
    }
    if (this.mesh.position.x < -Config.simulation_size / 2) {
      this.velocity.x *= -1;
    }
    if (this.mesh.position.y < -Config.simulation_size / 2) {
      this.velocity.y *= -1;
    }
    if (this.mesh.position.z < -Config.simulation_size / 2) {
      this.velocity.z *= -1;
    }
  }
}
