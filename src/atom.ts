import {
  Box3,
  BufferGeometry,
  Material,
  Mesh,
  Vector3
} from "three";

import Config from "./config.json";

export default class Atom extends Mesh {
  public key: number; // Can't use "id" :'(
  public rotation_axis: Vector3;
  public rotation_speed: number;
  public velocity: Vector3;

  private _boundingBox: Box3 = new Box3();
  private _boundingBoxDirty: boolean = true;

  constructor(key: number, geometry: BufferGeometry, material: Material) {
    super(geometry, material);
    this.key = key;

    function randomVector3() {
      return new Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5);
    }

    this.rotation_axis = randomVector3().normalize();
    this.rotation_speed = Math.random() / 100;

    this.velocity = randomVector3().normalize().multiplyScalar(0.1);

    this.position.copy(randomVector3().multiplyScalar(Config.simulation_size));

    // this.setRotationFromAxisAngle(randomVector3().normalize(), Math.PI * 2 * Math.random());

    this.rotation_speed = 0;
    this.position.y = 0;
    this.velocity.y = 0;
    this.position.z = 0;
    this.velocity.z = 0;

    if (key % 2 == 0) {
      // this.setRotationFromAxisAngle(new Vector3(0, 0, 0.1).normalize(), Math.PI/3);
      this.position.x = -20;
      this.velocity.x = 0.15;

    } else {
      this.position.x = 20;
      this.velocity.x = -0.15;
      // this.position.z = 5;
      this.position.y = 5;
    }

  }

  private updateBoundingBox(): void {
    if (!this._boundingBoxDirty) {
      throw new Error("Updating a non-dirty bounding box.");
    }
    this.updateMatrixWorld(true); // not sure if this is necessary

    this._boundingBox.makeEmpty()
    this._boundingBox.expandByObject(this);
    this._boundingBoxDirty = false;
  }

  public getBoundingBox(): Box3 {
    if (this._boundingBoxDirty) {
      this.updateBoundingBox();
    }
    return this._boundingBox;
  }

  // TODO: a prettier way to do this?
  public getMinX(): number {return this.getBoundingBox().min.x;}
  public getMinY(): number {return this.getBoundingBox().min.y;}
  public getMinZ(): number {return this.getBoundingBox().min.z;}
  public getMaxX(): number {return this.getBoundingBox().max.x;}
  public getMaxY(): number {return this.getBoundingBox().max.y;}
  public getMaxZ(): number {return this.getBoundingBox().max.z;}

  public update(): void {
    this.rotateOnAxis(this.rotation_axis, this.rotation_speed);
    this.position.add(this.velocity);

    // Bounce off the walls.
    if (this.position.x > Config.simulation_size / 2) {
      // this.velocity.x *= -1;
      this.velocity.multiplyScalar(0.9);
      this.velocity.x -= 0.1;
    }
    if (this.position.y > Config.simulation_size / 2) {
      // this.velocity.y *= -1;
      this.velocity.multiplyScalar(0.9);
      this.velocity.y -= 0.1;
    }
    if (this.position.z > Config.simulation_size / 2) {
      // this.velocity.z *= -1;
      this.velocity.multiplyScalar(0.9);
      this.velocity.z -= 0.1;
    }
    if (this.position.x < -Config.simulation_size / 2) {
      // this.velocity.x *= -1;
      this.velocity.multiplyScalar(0.9);
      this.velocity.x += 0.1;
    }
    if (this.position.y < -Config.simulation_size / 2) {
      // this.velocity.y *= -1;
      this.velocity.multiplyScalar(0.9);
      this.velocity.y += 0.1;
    }
    if (this.position.z < -Config.simulation_size / 2) {
      // this.velocity.z *= -1;
      this.velocity.multiplyScalar(0.9);
      this.velocity.z += 0.1;
    }

    this._boundingBoxDirty = true;
  }
}
