import Stats from "stats.js";
import {
  BoxBufferGeometry,
  Color,
  Mesh,
  MeshNormalMaterial,
  OrthographicCamera,
  PerspectiveCamera,
  Scene,
  WebGLRenderer
} from "three";
import {OrbitControls} from "three/examples/jsm/controls/OrbitControls";

class Main {
  /** The scene */
  public scene: Scene;

  /** The camera */
  public camera: PerspectiveCamera | OrthographicCamera;

  /** The renderer */
  public renderer: WebGLRenderer;

  /** The orbit controls */
  public controls: OrbitControls;

  /** The stats */
  public stats: Stats;

  /** The cube mesh */
  public cube: Mesh;

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
    this.camera.position.z = 700;

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

    // Add test mesh.
    this.cube = this.createCubeMesh();
    this.scene.add(this.cube);
    this.render();

    console.log(this);
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

    this.cube.rotation.x += 0.005;
    this.cube.rotation.y += 0.001;

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

  /** Creates a cube mesh */
  public createCubeMesh() {
    const geometry = new BoxBufferGeometry(200, 200, 200);
    const material = new MeshNormalMaterial();
    const mesh = new Mesh(geometry, material);
    return mesh;
  }
}

const main = new Main();

