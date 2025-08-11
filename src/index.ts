import Stats from "stats.js";
import {
  AmbientLight,
  BoxBufferGeometry,
  Color,
  EdgesGeometry,
  Euler,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  MeshNormalMaterial,
  MeshStandardMaterial,
  OrthographicCamera,
  PerspectiveCamera,
  Scene,
  Vector3,
  WebGLRenderer
} from "three";

import {OrbitControls} from "three/examples/jsm/controls/OrbitControls";
import Atom from "./atom";
import CollisionDetector, {Collision} from "./collision-detector";
import Config, {configManager} from "./config";
import Molecule from "./molecule";

class Main {
  /** The scene */
  private _scene: Scene;
  private _camera: PerspectiveCamera | OrthographicCamera;
  private _renderer: WebGLRenderer;
  private _controls: OrbitControls;
  private _stats: Stats;

  /** The objects that actually move around and interact
   * TODO: They should all be molecules
   */
  public atoms: Atom[];
  public molecules: {[key: number]: Molecule};

  /** The boundaries of the simulation */
  private _bounds: LineSegments;

  /** some materials for the cubes */
  private _notCollidingMaterial: any;
  private _standardMaterials: MeshStandardMaterial[];

  /** The collision detector */
  private _collisionDetector: CollisionDetector;

  /** Animation state */
  private _isAnimating: boolean = true;
  private _lastTime: number = 0;
  private _frameCount: number = 0;
  private _fps: number = 60;

  constructor() {
    this.initViewport();
    this.setupGUICallbacks();
  }

  private setupGUICallbacks(): void {
    configManager.setCallbacks({
      onResetRequired: (property?: string, value?: any) => {
        this.resetSimulation(property, value);
      },
      onRealTimeUpdate: (property: string, value: any) => {
        this.handleRealTimeUpdate(property, value);
      }
    });
  }

  private handleRealTimeUpdate(property: string, value: any): void {
    const speedChangeAmt = 0.2;
    switch (property) {
      case 'use_normal_material':
        this.updateMaterials();
        this.atoms.forEach(atom => {
          if (atom.last_collision > 40) {
            atom.material = this._notCollidingMaterial;
          }
        });
        break;

      case 'pauseSimulation':
        this._isAnimating = !value;
        break;

      case 'speedUp':
        for (const atom of this.atoms) {
          atom.velocity.multiplyScalar(1 + speedChangeAmt);
          atom.rotation_speed *= 1 + speedChangeAmt;
        }
        for (const molecule of Object.values(this.molecules)) {
          molecule.velocity.multiplyScalar(1 + speedChangeAmt);
          molecule.rotation_speed *= 1 + speedChangeAmt;
        }
        break;

      case 'slowDown':
        for (const atom of this.atoms) {
          atom.velocity.multiplyScalar(1 - speedChangeAmt);
          atom.rotation_speed *= 1 - speedChangeAmt;
        }
        for (const molecule of Object.values(this.molecules)) {
          molecule.velocity.multiplyScalar(1 - speedChangeAmt);
          molecule.rotation_speed *= 1 - speedChangeAmt;
        }
        break;

      case 'atom_mass':
      case 'restitution_coefficient':
        // These two are handled in the collider.
        break;
    }
  }

  private resetSimulation(property?: string, value?: any): void {
    if (property && property === "scenario") {
      configManager.loadPreset(value);
    }
    // Clear existing objects
    this.clearSimulation();

    // Recreate everything with new config
    this.updateMaterials();
    this.createScenario();

    this._collisionDetector = new CollisionDetector(this.atoms, Object.values(this.molecules));


    // Update bounds
    this._scene.remove(this._bounds);
    this._bounds = this.createBoundaryMesh();
    this._scene.add(this._bounds);

    this.render();
  }

  private clearSimulation(): void {
    // Remove all atoms
    this.atoms.forEach(atom => {
      this._scene.remove(atom);
      atom.geometry.dispose();
      if (Array.isArray(atom.material)) {
        atom.material.forEach(mat => mat.dispose());
      } else {
        atom.material.dispose();
      }
    });

    // Remove all molecules
    Object.values(this.molecules).forEach(molecule => {
      this._scene.remove(molecule.pivotGroup);
      // Molecules contain atoms, so we don't need to dispose their geometry/materials separately
    });

    for (const child of this._scene.children) {
      if (child instanceof Mesh) {
        this._scene.remove(child);
      }
    }

    this.atoms = [];
    this.molecules = {};
  }

  private updateMaterials(): void {
    if (Config.use_normal_material) {
      this._notCollidingMaterial = new MeshNormalMaterial();
    } else {
      // Dispose old materials if they exist
      if (this._standardMaterials) {
        this._standardMaterials.forEach(mat => mat.dispose());
      }

      this._standardMaterials = [
        new MeshStandardMaterial({color: 0xff0000}), // Red: Right face
        new MeshStandardMaterial({color: 0x00ff00}), // Green: Left face
        new MeshStandardMaterial({color: 0x0000ff}), // Blue: Top face
        new MeshStandardMaterial({color: 0xffff00}), // Yellow: Bottom face
        new MeshStandardMaterial({color: 0xff00ff}), // Magenta: Front face
        new MeshStandardMaterial({color: 0x00ffff})  // Cyan: Back face
      ];
      this._notCollidingMaterial = this._standardMaterials;
    }
  }

  /** Initialize the viewport */
  public initViewport() {
    // Init scene.
    this._scene = new Scene();
    this._scene.background = new Color("#191919");

    // Init camera.
    const aspect = window.innerWidth / window.innerHeight;
    this._camera = new PerspectiveCamera(50, aspect, 1, 5000);
    this._camera.position.z = 150;

    // Init renderer.
    this._renderer = new WebGLRenderer({
      powerPreference: "high-performance",
      antialias: true
    });
    this._renderer.setPixelRatio(window.devicePixelRatio);
    this._renderer.setSize(window.innerWidth, window.innerHeight);
    this._renderer.render(this._scene, this._camera);
    this._renderer.setAnimationLoop((time: number) => this.animate(time));
    document.body.appendChild(this._renderer.domElement);
    window.addEventListener("resize", () => this.onResize());

    // Init stats.
    this._stats = new Stats();
    document.body.appendChild(this._stats.dom);

    // Init orbit controls.
    this._controls = new OrbitControls(this._camera, this._renderer.domElement);
    this._controls.update();
    this._controls.addEventListener("change", () => this.render());

    // Add the boundaries
    this._bounds = this.createBoundaryMesh();
    this._scene.add(this._bounds);

    this.updateMaterials();

    // Add lights to the scene (needed for MeshStandardMaterial)
    const ambientLight = new AmbientLight(0xffffff, 0.6);
    this._scene.add(ambientLight);

    // Add atoms.
    this.atoms = [];
    this.molecules = {};
    this.createScenario();
    this._collisionDetector = new CollisionDetector(this.atoms, Object.values(this.molecules));
    this.render();
  }

  private createAtoms(num: number) {
    for (let i = 0; i < num; i++) {
      this.atoms.push(new Atom(i, this._notCollidingMaterial));
      this._scene.add(this.atoms[i]);
    }
  }

  private createScenario() {
    if (Config.scenario === 'collision' || Config.scenario === 'angled_collision') {
      // A simple tests of two large boxes colliding.
      this.createAtoms(2);
      this.atoms.forEach(atom => {
        atom.velocity.multiplyScalar(0);
        atom.position.multiplyScalar(0);
        atom.setRotationFromEuler(new Euler(0, 0, 0));
        atom.rotation_speed = 0;
      });

      this.atoms[0].position.x = -20;
      this.atoms[0].rotation_axis = new Vector3(0, 1, 0);
      this.atoms[0].velocity.x = 0.1;
      this.atoms[1].position.x = 10;

      this.atoms[0].rotateZ(Math.PI);
      this.atoms[0].rotateX(Math.PI);

      if (Config.scenario == 'angled_collision') {
        this.atoms[0].position.y = Config.atom_size / 4;
        this.atoms[0].rotateY(Math.PI / 2);
        this.atoms[0].position.z = Config.atom_size / 2;
        this.atoms[1].position.y = -Config.atom_size / 4;
      }
    } else if (Config.scenario == 'cradle') {
      // Newton's cradle
      let num_atoms = Config.number_of_atoms;
      if (num_atoms * Config.atom_size >= Config.simulation_size) {
        num_atoms = Math.floor(Config.simulation_size / Config.atom_size);
      }
      this.createAtoms(num_atoms);
      const atom_space = this.atoms.length * Config.atom_size;
      const remaining_space = Config.simulation_size - atom_space;
      const gap_size = remaining_space / (this.atoms.length + 1);

      this.atoms.forEach(atom => {
        atom.velocity.multiplyScalar(0);
        atom.position.multiplyScalar(0);
        atom.position.x = (gap_size + Config.atom_size) * atom.key - Config.simulation_size / 2 + Config.atom_size / 2;

        atom.setRotationFromEuler(new Euler(0, 0, 0));
        atom.rotation_speed = 0;

        if (atom.key % 4 == 0) {
          atom.rotateZ(Math.PI);
        }
      });

      this.atoms[0].velocity.x = 0.4;
    } else if (Config.scenario == 'lattice') {
      // One atom bouncing around a lattice.
      const grid_size = Math.ceil(Math.pow(Config.number_of_atoms, 1 / 3));
      const num_atoms = grid_size ** 3 + 1;

      this.createAtoms(num_atoms);

      const span = grid_size * Config.atom_size;
      const spacing = (Config.simulation_size - span) / (grid_size + 1);

      this.atoms.forEach(atom => {
        if (atom.key == num_atoms - 1) {
          atom.velocity.normalize().multiplyScalar(0.5);
          atom.position.x = -Config.simulation_size / 2;
        } else {
          const x_rank = (atom.key % grid_size);
          const y_rank = Math.floor(atom.key / grid_size) % grid_size;
          const z_rank = Math.floor(atom.key / grid_size / grid_size);

          atom.position.x = spacing + x_rank * (spacing + Config.atom_size) - Config.simulation_size / 2 + Config.atom_size / 2;
          atom.position.y = spacing + y_rank * (spacing + Config.atom_size) - Config.simulation_size / 2 + Config.atom_size / 2;
          atom.position.z = spacing + z_rank * (spacing + Config.atom_size) - Config.simulation_size / 2 + Config.atom_size / 2;
          atom.velocity.multiplyScalar(0.0);
          atom.rotation_speed = 0;
          atom.rotation.setFromVector3(new Vector3(0, 0, 0));
        }
      });
    } else {
      this.createAtoms(Config.number_of_atoms);
    }
  }

  /** Renders the scene */
  public render() {
    this._stats.begin();
    this._renderer.render(this._scene, this._camera);
    this._stats.end();
  }

  /** Animates the scene */
  public animate(time: number) {
    this._stats.begin();

    // Calculate FPS
    if (time - this._lastTime >= 1000) {
      this._fps = this._frameCount;
      this._frameCount = 0;
      this._lastTime = time;
    }
    this._frameCount++;

    // Update GUI info
    configManager.updateInfo(this._fps, this.atoms.length, Object.keys(this.molecules).length);

    // Only update simulation if not paused
    if (this._isAnimating) {
      for (const atom of this.atoms) {
        atom.update();
      }
      for (const molecule of Object.values(this.molecules)) {
        molecule.update();
      }

      // Collisions
      const collisions: Collision[] = this._collisionDetector.detectCollisions();
      const collidingAtomKeys = new Set<number>();

      for (const collision of collisions) {
        collidingAtomKeys.add(collision.pair[0].key);
        collidingAtomKeys.add(collision.pair[1].key);
        const atom1 = collision.pair[0];
        const atom2 = collision.pair[1];
        if (collision.isSticking) { // Sticky collision
          // TODO: This could be made a lot cleaner if all atoms were just molecules of length 1.
          if (!atom2.is_in_molecule && !atom1.is_in_molecule) {
            const mol = new Molecule(atom1, atom2, this._scene);
            this._scene.add(mol.pivotGroup);
            this.molecules[mol.id] = mol;
          } else if (atom1.is_in_molecule && !atom2.is_in_molecule) {
            const mol = atom1.molecule;
            mol.addAtom(atom2);
          } else if (atom2.is_in_molecule && !atom1.is_in_molecule) {
            const mol = atom2.molecule;
            mol.addAtom(atom1);
          } else if (atom2.is_in_molecule && atom1.is_in_molecule) {
            const mol1 = atom1.molecule;
            const mol2 = atom2.molecule;

            if (mol1 && mol2) {
              if (mol1.getMass() > mol2.getMass()) {
                mol1.addMolecule(mol2);
                this._scene.remove(mol2);
              } else {
                mol2.addMolecule(mol1);
                this._scene.remove(mol1);
              }
            }
          }
        }

        atom1.last_collision = 0;
        atom2.last_collision = 0;
      }

      // Highlight colliding atoms.
      for (const atom of this.atoms) {
        if (atom.last_collision < 40) {
          const material = new MeshBasicMaterial();
          const bright = ((40 - atom.last_collision) / (40 * 4)) + 0.75;
          material.color.set(new Color(bright, bright, bright))
          atom.material = material;
        } else {
          atom.material = this._notCollidingMaterial;
        }
        atom.last_collision += 1;
      }
    }

    this._controls.update();
    this._renderer.render(this._scene, this._camera);

    this._stats.end();
  }

  /** On resize event */
  public onResize() {
    if (this._camera instanceof PerspectiveCamera) {
      this._camera.aspect = window.innerWidth / window.innerHeight;
      this._camera.updateProjectionMatrix();
    }
    this._renderer.setSize(window.innerWidth, window.innerHeight);
    this.render();
  }

  public createBoundaryMesh() {
    const geometry = new BoxBufferGeometry(Config.simulation_size, Config.simulation_size, Config.simulation_size);
    const edges = new EdgesGeometry(geometry);

    const lineMaterial = new LineBasicMaterial({
      color: 0x00ff00,
      linewidth: 1
    });
    return new LineSegments(edges, lineMaterial);
  }

  // Cleanup method
  public destroy(): void {
    configManager.destroy();
    this.clearSimulation();
    if (this._renderer) {
      this._renderer.dispose();
    }
  }
}

const main = new Main();

// Handle page unload
window.addEventListener('beforeunload', () => {
  main.destroy();
});