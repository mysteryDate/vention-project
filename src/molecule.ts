import {
  Box3,
  BoxHelper,
  Group,
  Object3D,
  Scene,
  Vector3
} from "three";
import Atom from "./atom";
import Config from "./config";

// A way to enforce that molecules orbit around their center of mass
function rebuildPivotSystemPreservePosition(
    parentObject: Object3D,
    scene: Scene,
    centerOfMass: Vector3,
): Group {
    // Calculate bounding box center before any changes
    // const boundingBox = new Box3().setFromObject(parentObject);
    // const center = boundingBox.getCenter(new Vector3());

    // Create pivot group at center
    const newPivotGroup = new Group();
    newPivotGroup.position.copy(centerOfMass);
    scene.add(newPivotGroup);

    // Use attach() to preserve world position
    newPivotGroup.attach(parentObject);

    return newPivotGroup;
}

export default class Molecule extends Object3D {
  public atoms: Atom[] = [];
  public rotation_axis: Vector3 = new Vector3(0, 0, 0).normalize();
  public rotation_speed: number = 0;
  public velocity: Vector3 = new Vector3(0, 0, 0);
  public mass: number = 0;
  public boxHelper: BoxHelper;
  public pivotGroup: Group = new Group();
  public scene: Scene;

  public boundingBox: Box3 = new Box3();
  // TODO: This is a kludge to keep the simulation looking better because otherwise molecules are too bouncy.
  public static lerp_amt: number = 0.05;

  constructor(atom1: Atom, atom2: Atom, scene: Scene) {
    super();
    this.scene = scene;
    this.pivotGroup.add(this); // this feels bad
    this.addAtom(atom1);
    this.addAtom(atom2);
  }

  public getCenterOfMass(): Vector3 {
    if (this.atoms.length === 0) {
      return new Vector3(0, 0, 0);
    }

    const center = new Vector3(0, 0, 0);

    // Sum all positions
    for (const atom of this.atoms) {
      // Get world position of the atom
      const worldPos = new Vector3();
      atom.getWorldPosition(worldPos);
      center.add(worldPos);
    }

    // Divide by number of atoms to get average
    center.divideScalar(this.atoms.length);
    return center;
  }

  public rebuildPivot() {
    this.pivotGroup = rebuildPivotSystemPreservePosition(this, this.scene, this.getCenterOfMass());
  }

  public addAtom(atom: Atom) {
    function lerp(a: number, b: number, t: number) {
      return a + t * (b - a);
    }

    const initialMass = this.atoms.length * Config.atom_mass;
    this.atoms.push(atom);

    const currentMass = this.atoms.length * Config.atom_mass;

    // TODO: this is greatly oversimplfied
    const initialMomentum = this.velocity.clone().multiplyScalar(initialMass);
    const newAtomMomentum = atom.velocity.clone().multiplyScalar(Config.atom_mass);
    const finalMomentum = initialMomentum.add(newAtomMomentum);
    const newVelocity = finalMomentum.multiplyScalar(1 / currentMass);
    this.velocity.copy(newVelocity);

    // TODO: This is extremely simplified, ignoring moments of inertia.
    const currentRotationalMomentum = this.rotation_speed * initialMass;
    const atomRM = atom.rotation_speed * Config.atom_mass;
    const newRM = currentRotationalMomentum + atomRM;
    const newRS = newRM / currentMass;

    this.rotation_axis.lerp(atom.rotation_axis, Config.atom_mass / (currentMass) * Molecule.lerp_amt).normalize();
    // A linear interpolation.
    this.rotation_speed = this.rotation_speed + Molecule.lerp_amt * (newRS - this.rotation_speed);

    this.attach(atom);
    atom.setMolecule(this);

    // Recalculate bounding box with new child
    this.updateMatrixWorld(true);

    // Adjust parent object position to account for new center
    // console.log(centerDiff);
    atom.velocity.multiplyScalar(0);
    atom.rotation_speed = 0;

    this.rebuildPivot();
  };

  public getMass(): number {
    return this.atoms.length * Config.atom_mass;
  }

  public getSize(): number {
    const bb = this.boundingBox;
    const size = bb.getSize(new Vector3);
    return (size.x + size.y + size.z) / 3;
  }

  public addMolecule(other: Molecule) {
    // TODO: this is greatly oversimplfied
    const m1 = this.getMass();
    const m2 = other.getMass();

    const p1 = this.velocity.clone().multiplyScalar(m1);
    const p2 = other.velocity.clone().multiplyScalar(m2);
    const finalMomentum = p1.add(p2);
    const newVelocity = finalMomentum.multiplyScalar(1 / (m1 + m2));

    this.velocity.copy(newVelocity);

    other.atoms.forEach((atom) => {
      this.atoms.push(atom);
      this.attach(atom);
      atom.molecule_id = this.id;
      atom.setMolecule(this);
    });

    this.pivotGroup = rebuildPivotSystemPreservePosition(this, this.scene, this.getCenterOfMass());
  }

  public update(): void {
    // TODO: I probably shouldn't have to do this every frame.
    this.scene.remove(this.pivotGroup);
    this.rebuildPivot();

    this.pivotGroup.position.add(this.velocity);
    this.pivotGroup.rotateOnAxis(this.rotation_axis, this.rotation_speed);

    this.updateMatrixWorld(true);
    this.boundingBox.makeEmpty();
    this.boundingBox.expandByObject(this.pivotGroup);

    // TODO: these are kludges to keep things from blowing up.
    if (this.velocity.length() > 1) {
      this.velocity.multiplyScalar(0.99);
    }
    if (this.rotation_speed > 0.1) {
      this.rotation_speed *= 0.9;
    }

    // Bounce off the walls.
    if (this.boundingBox.max.x > Config.simulation_size / 2 && this.velocity.x > 0) {
      this.velocity.x *= -1;
    }
    if (this.boundingBox.max.y > Config.simulation_size / 2 && this.velocity.y > 0) {
      this.velocity.y *= -1;
    }
    if (this.boundingBox.max.z > Config.simulation_size / 2 && this.velocity.z > 0) {
      this.velocity.z *= -1;
    }
    if (this.boundingBox.min.x < -Config.simulation_size / 2 && this.velocity.x < 0) {
      this.velocity.x *= -1;
    }
    if (this.boundingBox.min.y < -Config.simulation_size / 2 && this.velocity.y < 0) {
      this.velocity.y *= -1;
    }
    if (this.boundingBox.min.z < -Config.simulation_size / 2 && this.velocity.z < 0) {
      this.velocity.z *= -1;
    }

    const center = this.boundingBox.getCenter(new Vector3());
    // Because molecules can be physically quite large, they can rotate themselves outside the simulation.
    // Pull them back in if they get far away.
    if (center.length() > Config.simulation_size) {
      this.velocity.add(center.normalize().multiplyScalar(-0.1))
    }

  }
  }