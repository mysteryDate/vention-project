import Stats from "stats.js";
import {
  BoxBufferGeometry,
  Color,
  EdgesGeometry,
  Euler,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  MeshNormalMaterial,
  OrthographicCamera,
  PerspectiveCamera,
  Scene,
  WebGLRenderer
} from "three";

import Atom from "./atom";
import CollisionDetector, {CollisionPair} from "./collision-detector";
import Config from "./config";

import {OrbitControls} from "three/examples/jsm/controls/OrbitControls";

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

  /** The boundaries of the simulation */
  private bounds: Mesh;

  /** some materials for the cubes */
  private notCollidingMaterial: MeshNormalMaterial;
  private collidingMaterial: MeshBasicMaterial;

  /** The collision detector */
  private collisionDetector: CollisionDetector;

  constructor() {
    this.initViewport();
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
    this.renderer.setAnimationLoop(() => this.animate()); // uncomment if you want to use the animation loop
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

    // Add atoms.
    this.atoms = [];

    this.notCollidingMaterial = new MeshNormalMaterial();
    this.createScenario();


    this.collidingMaterial = new MeshBasicMaterial();

    this.collisionDetector = new CollisionDetector(this.atoms);

    this.render();
  }

  private createAtoms() {
    const geometry = new BoxBufferGeometry(Config.atom_size, Config.atom_size, Config.atom_size);
    for (let i = 0; i < Config.number_of_atoms; i++) {
      this.atoms.push(new Atom(i, geometry, this.notCollidingMaterial));
      this.scene.add(this.atoms[i]);
    }

  }

  private createScenario() {
    if (Config.scenario == 0) {
      this.createAtoms();
    } if (Config.scenario == 1) {
      // A test to see two boxes colliding
      Config.number_of_atoms = 2;
      Config.atom_size = 30;
      this.createAtoms();

      this.atoms.forEach(atom => {
        atom.velocity.multiplyScalar(0);
        atom.position.multiplyScalar(0);
        atom.setRotationFromEuler(new Euler(0, 0, 0));
        atom.rotation_speed = 0;
        if (atom.key == 0) {
          atom.position.x = -40;
          atom.position.y = 10;
          atom.velocity.x = 0.1;
          atom.position.z = 10;
        } else {
          atom.position.x = 20;
          atom.position.y = -10;
        }
      });

    } else if (Config.scenario == 2) {
      // One atom bouncing around a lattice.
      Config.number_of_atoms = 512;
      Config.atom_size = 2;

      this.createAtoms();

      this.atoms.forEach(atom => {
        if (atom.key < 1) {
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
        }
      });
    }
  }

  /** Renders the scene */
  public render() {
    this.stats.begin();
    this.renderer.render(this.scene, this.camera);
    this.stats.end();
  }

  /** Animates the scene */
  public animate() {
    this.stats.begin();

    for (const atom of this.atoms) {
      atom.update();
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
        atom.material = this.collidingMaterial;
      } else {
        atom.material = this.notCollidingMaterial;
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
    return new LineSegments(edges, lineMaterial);;
  }
}

const main = new Main();

