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

function rebuildPivotSystemPreservePosition(
    parentObject: Object3D,
    scene: Scene
): Group {
    // Calculate bounding box center before any changes
    const boundingBox = new Box3().setFromObject(parentObject);
    const center = boundingBox.getCenter(new Vector3());

    // Create pivot group at center
    const newPivotGroup = new Group();
    newPivotGroup.position.copy(center);
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

  constructor(atom1: Atom, atom2: Atom, scene: Scene) {
    super();
    this.scene = scene;
    this.pivotGroup.add(this); // this feels bad
    this.addAtom(atom1);
    this.addAtom(atom2);
  }

  public rebuildPivot() {
    this.pivotGroup = rebuildPivotSystemPreservePosition(this, this.scene);
  }

  public addAtom(atom: Atom) {
    const initialMass = this.atoms.length * Config.atom_mass;
    this.atoms.push(atom);

    const currentMass = this.atoms.length * Config.atom_mass;

    // TODO: this is greatly oversimplfied
    const initialMomentum = this.velocity.clone().multiplyScalar(initialMass);
    const newAtomMomentum = atom.velocity.clone().multiplyScalar(Config.atom_mass);
    const finalMomentum = initialMomentum.add(newAtomMomentum);
    const newVelocity = finalMomentum.multiplyScalar(1 / currentMass);


    this.velocity.copy(newVelocity);
    // this.velocity.multiplyScalar(0);

    // TODO: This is extremely simplified, ignoring moments of inertia.
    const currentRotationalMomentum = this.rotation_speed * initialMass;
    const atomRM = atom.rotation_speed * Config.atom_mass;
    const newRM = currentRotationalMomentum + atomRM;
    const newRS = newRM / currentMass;
    this.rotation_axis.lerp(atom.rotation_axis, Config.atom_mass / (currentMass)).normalize();
    // const newRA = this.rotation_axis.lerp(atom.rotation_axis, Config.atom_mass / (currentMass));

    // this.rotation_axis = atom.rotation_axis;
    this.rotation_speed = newRS;


    // Molecule.addWithoutMoving(this, atom);
    this.attach(atom);
    atom.molecule_id = this.id;
    atom.setMolecule(this);
    // this.boxHelper = new BoxHelper(this, 0xffffff);
    // this.rotation_speed = 0.01;

    // Recalculate bounding box with new child
    this.updateMatrixWorld(true);

    // Adjust parent object position to account for new center
    // console.log(centerDiff);
    atom.velocity.multiplyScalar(0);
    atom.rotation_speed = 0;

    const boundingBox = new Box3().setFromObject(this);
    const center = boundingBox.getCenter(new Vector3());

    // Create pivot group at center
    // const newPivotGroup = new Group();
    // this.pivotGroup.position.copy(center);
    // this.scene.add(this.pivotGroup);
    // this.pivotGroup.attach(this);
    this.rebuildPivot();

    // if (this.atoms.length != 1) {
      //   // this.position.sub(centerDiff);
      //   // this.pivotGroup.position.add(centerDiff);
      // }

    // this.pivotGroup = rebuildPivotSystemPreservePosition(this, this.scene);
    // this.rebuildPivot();

      // console.log("FRAME----");
      // console.log("newCenter", newCenter);
      // console.log("this.pivotGroup.position", this.pivotGroup.position);
      // console.log("currentPGPosition", currentPGPosition);
    // console.log("centerDiff", centerDiff);
    // console.log("DONE FRAME FRAME----\n\n\n");
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
    const m1 = this.atoms.length * Config.atom_mass;
    const m2 = other.atoms.length * Config.atom_mass;

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

    this.pivotGroup = rebuildPivotSystemPreservePosition(this, this.scene);
  }

  public update(): void {
    // this.rebuildPivot();
    // Calculate bounding box center before any changes

    // Create pivot group at center
    // const newPivotGroup = new Group();
    // this.pivotGroup.applyMatrix4(new Matrix4().identity());
    // this.pivotGroup.rotation.set(0, 0, 0);
    // this.pivotGroup.position.copy(center);
    this.scene.remove(this.pivotGroup);
    this.rebuildPivot();
    // scene.add(newPivotGroup);

    // Use attach() to preserve world position
    // newPivotGroup.attach(parentObject);

    this.pivotGroup.position.add(this.velocity);

    this.updateMatrixWorld(true);
    this.boundingBox.makeEmpty();
    this.boundingBox.expandByObject(this);
    // for (const atom of this.atoms) {
    //   atom.updateMatrixWorld();
    //   boundingBox.expandByObject(atom);
    // }

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
    if (center.length() > Config.simulation_size * 1.1) {
      this.velocity.add(center.normalize().multiplyScalar(-0.1))
    }

    // this.position.sub(center);
    // this.rotateY(0.1);
    // this.rotateOnAxis(this.rotation_axis, this.rotation_speed);
    // this.position.add(center);

    // this.pivotGroup.position.copy(center);
    // if (this.atoms.length > 2) {
      // this.pivotGroup.rotateZ(0.01);
    // }
    this.pivotGroup.rotateOnAxis(this.rotation_axis, this.rotation_speed);

    // const geometry = new SphereGeometry(0.5, 10, 10);
    // const material = new MeshBasicMaterial(0x00ff00);
    // const sphere = new Mesh(geometry, material);
    // sphere.position.copy(center);
  }
  }