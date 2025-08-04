import Stats from "stats.js";
import {
  BoxBufferGeometry,
  Color,
  EdgesGeometry,
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
import Config from "./config.json";
import SweepAndPrune, {CollisionPair} from "./sweep-and-prune";

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
  private collisionDetector: SweepAndPrune;

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
    const geometry = new BoxBufferGeometry(Config.atom_size, Config.atom_size, Config.atom_size);
    this.notCollidingMaterial = new MeshNormalMaterial();
    for (let i = 0; i < Config.number_of_atoms; i++) {
      this.atoms.push(new Atom(i, geometry, this.notCollidingMaterial));
      this.scene.add(this.atoms[i]);
    }
    this.collidingMaterial = new MeshBasicMaterial();

    this.collisionDetector = new SweepAndPrune(this.atoms);

    this.render();
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
    const collidingAtoms = new Set<Atom>();

    for (const pair of collisionPairs) {
      collidingAtoms.add(pair[0]);
      collidingAtoms.add(pair[1]);
    }

    for (const atom of collidingAtoms) {
      atom.material = this.collidingMaterial;
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

