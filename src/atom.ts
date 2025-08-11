import {
  Box3,
  BoxBufferGeometry,
  Material,
  Mesh,
  Vector3
} from "three";

import Config from "./config";
import Molecule from "./molecule";

export default class Atom extends Mesh {
  public key: number; // Can't use "id" :'(
  public rotation_axis: Vector3;
  public rotation_speed: number;
  public velocity: Vector3;
  public last_collision: number = Infinity;
  public molecule_id: number = -1;
  public is_in_molecule: boolean = false;
  public molecule: Molecule;

  private _boundingBox: Box3 = new Box3();
  private _boundingBoxDirty: boolean = true;

  constructor(key: number, material: Material) {
    super(new BoxBufferGeometry(Config.atom_size, Config.atom_size, Config.atom_size), material);
    this.key = key;

    function randomVector3() {
      return new Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5);
    }

    this.rotation_axis = randomVector3().normalize();
    this.rotation_speed = Math.random() / 10;

    this.velocity = randomVector3().normalize().multiplyScalar(Math.random());

    this.position.copy(randomVector3().multiplyScalar(Config.simulation_size - 1));

    this.setRotationFromAxisAngle(randomVector3().normalize(), Math.PI * 2 * Math.random());
  }

  public setMolecule(mol: Molecule) {
    this.molecule_id = mol.id;
    this.molecule = mol;
    this.is_in_molecule = true;
  }

  public getMass(): number {
    return Config.atom_mass;
  }

  public getMoleculeMass(): number {
    if (this.is_in_molecule) {
      return Config.atom_mass;
    }
    return this.molecule.atoms.length * Config.atom_mass;
  }

  public getSize(): number {
    if (this.is_in_molecule) {
      return this.molecule.getSize();
    }

    return Config.atom_size;
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
    if (this.molecule_id == -1) {
      this.rotateOnAxis(this.rotation_axis, this.rotation_speed);
      this.position.add(this.velocity);
    }

    if (this.velocity.length() > 1) {
      this.velocity.multiplyScalar(0.99);
    }
    if (this.rotation_speed > 0.2) {
      this.rotation_speed
    }

    this._boundingBoxDirty = true;
    const bb = this.getBoundingBox();
    // Bounce off the walls.
    if (bb.max.x > Config.simulation_size / 2) {
      this.velocity.x = -Math.abs(this.velocity.x);
    }
    if (bb.max.y > Config.simulation_size / 2) {
      this.velocity.y = -Math.abs(this.velocity.y);
    }
    if (bb.max.z > Config.simulation_size / 2) {
      this.velocity.z = -Math.abs(this.velocity.z);
    }
    if (bb.min.x < -Config.simulation_size / 2) {
      this.velocity.x = Math.abs(this.velocity.x);
    }
    if (bb.min.y < -Config.simulation_size / 2) {
      this.velocity.y = Math.abs(this.velocity.y);
    }
    if (bb.min.z < -Config.simulation_size / 2) {
      this.velocity.z = Math.abs(this.velocity.z);
    }

  }
}
