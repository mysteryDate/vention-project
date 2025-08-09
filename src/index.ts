// index.ts - Updated with dat.gui integration
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
import CollisionDetector, {CollisionPair} from "./collision-detector";
import Config, {configManager} from "./config";
import Molecule from "./molecule";

class Main {
  /** The scene */
  private scene: Scene;

  /** The camera */
  private camera: PerspectiveCamera | OrthographicCamera;

  /** The renderer */
  private renderer: WebGLRenderer;

  /** The orbit controls */
  private controls: OrbitControls;

  /** The stats */
  private stats: Stats;

  private atoms: Atom[];
  private molecules: {[key: number]: Molecule};

  /** The boundaries of the simulation */
  private bounds: Mesh;

  /** some materials for the cubes */
  private notCollidingMaterial: any;
  private standardMaterials: MeshStandardMaterial[];

  /** The collision detector */
  private collisionDetector: CollisionDetector;

  /** Animation state */
  private isAnimating: boolean = true;
  private lastTime: number = 0;
  private frameCount: number = 0;
  private fps: number = 60;

  constructor() {
    this.initViewport();
    this.setupGUICallbacks();
  }

  private setupGUICallbacks(): void {
    configManager.setCallbacks({
      onResetRequired: () => {
        this.resetSimulation();
      },
      onRealTimeUpdate: (property: string, value: any) => {
        this.handleRealTimeUpdate(property, value);
      }
    });
  }

  private handleRealTimeUpdate(property: string, value: any): void {
    switch (property) {
      case 'velocity_multiplier':
        // Update existing atom velocities
        this.atoms.forEach(atom => {
          if (atom.velocity.length() > 0) {
            atom.velocity.normalize().multiplyScalar(value);
          }
        });
        break;

      case 'use_normal_material':
        this.updateMaterials();
        this.atoms.forEach(atom => {
          if (atom.last_collision > 40) {
            atom.material = this.notCollidingMaterial;
          }
        });
        break;

      case 'pauseSimulation':
        this.isAnimating = !value;
        break;

      case 'atom_mass':
        // This affects collision calculations but doesn't require reset
        break;

      case 'restitution_coefficient':
        // This affects collision calculations but doesn't require reset
        break;
    }
  }

  private resetSimulation(): void {
    // Clear existing objects
    this.clearSimulation();

    // Recreate everything with new config
    this.updateMaterials();
    this.createScenario();
    this.collisionDetector = new CollisionDetector(this.atoms, Object.values(this.molecules));

    // Update bounds
    this.scene.remove(this.bounds);
    this.bounds = this.createBoundaryMesh();
    this.scene.add(this.bounds);

    this.render();
  }

  private clearSimulation(): void {
    // Remove all atoms
    this.atoms.forEach(atom => {
      this.scene.remove(atom);
      atom.geometry.dispose();
      if (Array.isArray(atom.material)) {
        atom.material.forEach(mat => mat.dispose());
      } else {
        atom.material.dispose();
      }
    });

    // Remove all molecules
    Object.values(this.molecules).forEach(molecule => {
      this.scene.remove(molecule.pivotGroup);
      // Molecules contain atoms, so we don't need to dispose their geometry/materials separately
    });

    this.atoms = [];
    this.molecules = {};
  }

  private updateMaterials(): void {
    if (Config.use_normal_material) {
      this.notCollidingMaterial = new MeshNormalMaterial();
    } else {
      // Dispose old materials if they exist
      if (this.standardMaterials) {
        this.standardMaterials.forEach(mat => mat.dispose());
      }

      this.standardMaterials = [
        new MeshStandardMaterial({color: 0xff0000}), // Red: Right face
        new MeshStandardMaterial({color: 0x00ff00}), // Green: Left face
        new MeshStandardMaterial({color: 0x0000ff}), // Blue: Top face
        new MeshStandardMaterial({color: 0xffff00}), // Yellow: Bottom face
        new MeshStandardMaterial({color: 0xff00ff}), // Magenta: Front face
        new MeshStandardMaterial({color: 0x00ffff})  // Cyan: Back face
      ];
      this.notCollidingMaterial = this.standardMaterials;
    }
  }

  /** Initialize the viewport */
  public initViewport() {
    // Init scene.
    this.scene = new Scene();
    this.scene.background = new Color("#191919");

    // Init camera.
    const aspect = window.innerWidth / window.innerHeight;
    this.camera = new PerspectiveCamera(50, aspect, 1, 5000);
    this.camera.position.z = 200;

    // Init renderer.
    this.renderer = new WebGLRenderer({
      powerPreference: "high-performance",
      antialias: true
    });
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.render(this.scene, this.camera);
    this.renderer.setAnimationLoop((time) => this.animate(time));
    document.body.appendChild(this.renderer.domElement);
    window.addEventListener("resize", () => this.onResize());

    // Init stats.
    this.stats = new Stats();
    document.body.appendChild(this.stats.dom);

    // Init orbit controls.
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.update();
    this.controls.addEventListener("change", () => this.render());

    // Add the boundaries
    this.bounds = this.createBoundaryMesh();
    this.scene.add(this.bounds);

    this.updateMaterials();

    // Add lights to the scene (needed for MeshStandardMaterial)
    const ambientLight = new AmbientLight(0xffffff, 0.6);
    this.scene.add(ambientLight);

    // Add atoms.
    this.atoms = [];
    this.molecules = {};
    this.createScenario();
    this.collisionDetector = new CollisionDetector(this.atoms, Object.values(this.molecules));
    this.render();
  }

  private createAtoms() {
    for (let i = 0; i < Config.number_of_atoms; i++) {
      this.atoms.push(new Atom(i, this.notCollidingMaterial));
      this.scene.add(this.atoms[i]);
    }
  }

  private createScenario() {
    if (Config.scenario < 2) {
      // A simple tests of two large boxes colliding.
      Config.number_of_atoms = 2;
      Config.atom_size = 20;
      this.createAtoms();

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

      if (Config.scenario == 1) {
        this.atoms[0].position.y = 10;
        this.atoms[0].rotateY(Math.PI / 2);
        this.atoms[0].position.z = 10;
        this.atoms[1].position.y = -10;
      }
    } else if (Config.scenario == 2) {
      // Newton's cradle
      Config.number_of_atoms = 4;
      Config.atom_size = 15;
      this.createAtoms();

      this.atoms.forEach(atom => {
        atom.velocity.multiplyScalar(0);
        atom.position.multiplyScalar(0);
        atom.setRotationFromEuler(new Euler(0, 0, 0));
        atom.rotation_speed = 0;
      });

      this.atoms[0].position.x = -40;
      this.atoms[0].velocity.x = 0.1;
      this.atoms[1].position.x = 20;
      this.atoms[2].position.x = 40;
    } else if (Config.scenario == 3) {
      // Stick test
      Config.number_of_atoms = 3;
      Config.atom_size = 10;
      this.createAtoms();

      this.atoms.forEach(atom => {
        atom.velocity.multiplyScalar(0);
        atom.position.multiplyScalar(0);
        atom.setRotationFromEuler(new Euler(0, 0, 0));
        atom.rotation_speed = 0;
      });

      this.atoms[0].position.x = -30;
      this.atoms[0].velocity.x = 0.1;
      this.atoms[1].position.x = -10;
      this.atoms[2].position.x = 40;

      this.atoms[0].rotateZ(Math.PI);
      this.atoms[2].rotateZ(Math.PI);
    } else if (Config.scenario == 4) {
      // One atom bouncing around a lattice.
      Config.number_of_atoms = 512;
      Config.atom_size = 2;

      this.createAtoms();

      this.atoms.forEach(atom => {
        if (atom.key < 5) {
          atom.velocity.normalize().multiplyScalar(0.5);
        } else {
          const grid_size = Math.ceil(Math.pow(Config.number_of_atoms, 1 / 3));
          const x_rank = (atom.key % grid_size);
          const y_rank = Math.floor(atom.key / grid_size) % grid_size;
          const z_rank = Math.floor(atom.key / grid_size / grid_size);

          atom.position.x = x_rank / grid_size * Config.simulation_size - Config.simulation_size / 2 + Config.atom_size * 2;
          atom.position.y = y_rank / grid_size * Config.simulation_size - Config.simulation_size / 2 + Config.atom_size * 2;
          atom.position.z = z_rank / grid_size * Config.simulation_size - Config.simulation_size / 2 + Config.atom_size * 2;
          atom.velocity.multiplyScalar(0.0);
          atom.rotation_speed = 0;
          atom.rotation.setFromVector3(new Vector3(0, 0, 0));
        }
      });
    } else {
      this.createAtoms();
    }
  }

  /** Renders the scene */
  public render() {
    this.stats.begin();
    this.renderer.render(this.scene, this.camera);
    this.stats.end();
  }

  /** Animates the scene */
  public animate(time: number) {
    this.stats.begin();

    // Calculate FPS
    if (time - this.lastTime >= 1000) {
      this.fps = this.frameCount;
      this.frameCount = 0;
      this.lastTime = time;
    }
    this.frameCount++;

    // Update GUI info
    configManager.updateInfo(this.fps, this.atoms.length, Object.keys(this.molecules).length);

    // Only update simulation if not paused
    if (this.isAnimating) {
      for (const atom of this.atoms) {
        atom.update();
      }
      for (const molecule of Object.values(this.molecules)) {
        molecule.update();
      }

      // Collisions
      const collisionPairs: CollisionPair[] = this.collisionDetector.detectCollisions();
      const collidingAtomKeys = new Set<number>();

      for (const pair of collisionPairs) {
        collidingAtomKeys.add(pair[0].key);
        collidingAtomKeys.add(pair[1].key);
      }

      for (const atom of this.atoms) {
        if (collidingAtomKeys.has(atom.key) && atom.velocity.length() > 0) {
          atom.last_collision = 0;
        }
        if (atom.last_collision < 40) {
          const material = new MeshBasicMaterial();
          const bright = ((40 - atom.last_collision) / (40 * 4)) + 0.75;
          material.color.set(new Color(bright, bright, bright))
          atom.material = material;
        } else {
          atom.material = this.notCollidingMaterial;
        }
        atom.last_collision += 1;
      }

      for (const pair of collisionPairs) {
        if (pair[2]) { // Sticky collision
          if (!pair[1].is_in_molecule && !pair[0].is_in_molecule) {
            const mol = new Molecule(pair[0], pair[1], this.scene);
            pair[0].molecule_id = mol.id;
            pair[1].molecule_id = mol.id;
            pair[0].is_in_molecule = true;
            pair[1].is_in_molecule = true;
            this.scene.add(mol.pivotGroup);
            this.molecules[mol.id] = mol;
          } else if (pair[0].is_in_molecule && !pair[1].is_in_molecule) {
            const mol = pair[0].molecule;
            mol.addAtom(pair[1]);
            pair[1].molecule_id = mol.id;
            pair[1].is_in_molecule = true;
          } else if (pair[1].is_in_molecule && !pair[0].is_in_molecule) {
            const mol = pair[1].molecule;
            mol.addAtom(pair[0]);
            pair[0].molecule_id = mol.id;
            pair[0].is_in_molecule = true;
          } else if (pair[1].is_in_molecule && pair[0].is_in_molecule) {
            const mol = pair[0].molecule;
            const mol2 = pair[1].molecule;

            if (mol && mol2) {
              mol.addMolecule(mol2);
              delete this.molecules[mol2.id];
            }
          }
        }
      }
    }

    this.controls.update();
    this.renderer.render(this.scene, this.camera);

    this.stats.end();
  }

  /** On resize event */
  public onResize() {
    if (this.camera instanceof PerspectiveCamera) {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
    }
    this.renderer.setSize(window.innerWidth, window.innerHeight);
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
    if (this.renderer) {
      this.renderer.dispose();
    }
  }
}

const main = new Main();

// Handle page unload
window.addEventListener('beforeunload', () => {
  main.destroy();
});