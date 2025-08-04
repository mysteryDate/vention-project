import {
  BoxBufferGeometry,
  Mesh,
  MeshNormalMaterial,
  Vector3
} from "three";

import Config from "./config.json";

export default class Atom extends Mesh {
  public rotation_axis: Vector3;
  public rotation_speed: number;
  public velocity: Vector3;

  constructor() {
    const geometry = new BoxBufferGeometry(Config.atom_size, Config.atom_size, Config.atom_size);
    const material = new MeshNormalMaterial();
    super(geometry, material);

    function randomVector3() {
      return new Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5);
    }

    this.rotation_axis = randomVector3().normalize();
    this.rotation_speed = Math.random() / 10;

    this.velocity = randomVector3().normalize().multiplyScalar(0.1);

    this.position.copy(randomVector3().multiplyScalar(Config.simulation_size));
    this.setRotationFromAxisAngle(randomVector3().normalize(), Math.PI * 2 * Math.random())
  }

  public update() {
    this.rotateOnAxis(this.rotation_axis, this.rotation_speed);
    this.position.add(this.velocity);

    // Bounce off the walls.
    if (this.position.x > Config.simulation_size / 2) {
      this.velocity.x *= -1;
    }
    if (this.position.y > Config.simulation_size / 2) {
      this.velocity.y *= -1;
    }
    if (this.position.z > Config.simulation_size / 2) {
      this.velocity.z *= -1;
    }
    if (this.position.x < -Config.simulation_size / 2) {
      this.velocity.x *= -1;
    }
    if (this.position.y < -Config.simulation_size / 2) {
      this.velocity.y *= -1;
    }
    if (this.position.z < -Config.simulation_size / 2) {
      this.velocity.z *= -1;
    }
  }
}
