// config.ts - Enhanced version with dat.gui integration
import * as dat from 'dat.gui';

export interface ConfigInterface {
  simulation_size: number;
  atom_size: number;
  number_of_atoms: number;
  velocity_multiplier: number;
  atom_mass: number;
  restitution_coefficient: number;
  scenario: string;
  use_normal_material: boolean;
  form_molecules: boolean;

  // GUI control methods
  resetSimulation?: () => void;
  pauseSimulation?: boolean;
}

class ConfigManager {
  private gui: dat.GUI;
  private config: ConfigInterface;
  private callbacks: {
    onResetRequired?: () => void;
    onRealTimeUpdate?: (property: string, value: any) => void;
  } = {};

  // Properties that require simulation reset when changed
  private readonly RESET_REQUIRED_PROPS = new Set([
    'simulation_size',
    'atom_size',
    'number_of_atoms',
    'scenario'
  ]);

  // Properties that can be updated in real-time
  private readonly REALTIME_PROPS = new Set([
    'velocity_multiplier',
    'atom_mass',
    'restitution_coefficient',
    'use_normal_material',
    'pauseSimulation'
  ]);

  // Scenario options for dropdown
  private readonly SCENARIO_OPTIONS = {
    'Random Gas': 'random',
    'Simple Collision': 'collision',
    'Angled Collision': 'angled_collision',
    'Newton\'s Cradle': 'cradle',
    'Lattice Bouncing': 'lattice'
  };

  constructor() {
    this.config = {
      simulation_size: 100,
      atom_size: 3,
      number_of_atoms: 10,
      velocity_multiplier: 2,
      atom_mass: 1,
      restitution_coefficient: 1.0,
      scenario: "angled_collision",
      use_normal_material: false,
      form_molecules: false,
      pauseSimulation: false
    };

    this.initializeGUI();
  }

  private initializeGUI(): void {
    this.gui = new dat.GUI({width: 300});

    // Simulation folder
    const simulationFolder = this.gui.addFolder('Simulation');

    simulationFolder.add(this.config, 'simulation_size', 50, 200)
      .name('Simulation Size')
      .onChange(() => this.handlePropertyChange('simulation_size'));

    simulationFolder.add(this.config, 'scenario', this.SCENARIO_OPTIONS)
      .name('Scenario')
      .onChange(() => this.handlePropertyChange('scenario'));

    simulationFolder.add(this.config, 'number_of_atoms', 2, 1000, 1)
      .name('Number of Atoms')
      .onChange(() => this.handlePropertyChange('number_of_atoms'));

    simulationFolder.add(this.config, 'pauseSimulation')
      .name('Pause')
      .onChange(() => this.handlePropertyChange('pauseSimulation'));

    // Add reset button
    this.config.resetSimulation = () => {
      if (this.callbacks.onResetRequired) {
        this.callbacks.onResetRequired();
      }
    };
    simulationFolder.add(this.config, 'resetSimulation').name('Reset Simulation');

    simulationFolder.open();

    // Atom properties folder
    const atomFolder = this.gui.addFolder('Atom Properties');

    atomFolder.add(this.config, 'atom_size', 1, 20)
      .name('Atom Size')
      .onChange(() => this.handlePropertyChange('atom_size'));

    atomFolder.add(this.config, 'atom_mass', 0.1, 10)
      .name('Atom Mass')
      .onChange(() => this.handlePropertyChange('atom_mass'));

    atomFolder.add(this.config, 'velocity_multiplier', 0, 10)
      .name('Velocity Multiplier')
      .onChange(() => this.handlePropertyChange('velocity_multiplier'));

    atomFolder.add(this.config, 'use_normal_material')
      .name('Normal Material')
      .onChange(() => this.handlePropertyChange('use_normal_material'));

    atomFolder.open();

    // Physics folder
    const physicsFolder = this.gui.addFolder('Physics');

    physicsFolder.add(this.config, 'form_molecules')
      .name('Form Molecules')
      .onChange(() => this.handlePropertyChange('form_molecules'));

    physicsFolder.add(this.config, 'restitution_coefficient', 0, 2)
      .name('Restitution')
      .onChange(() => this.handlePropertyChange('restitution_coefficient'));

    physicsFolder.open();

    // Performance info folder
    const infoFolder = this.gui.addFolder('Info');
    const info = {
      fps: '0',
      atoms: '0',
      molecules: '0'
    };

    infoFolder.add(info, 'fps').name('FPS').listen();
    infoFolder.add(info, 'atoms').name('Active Atoms').listen();
    infoFolder.add(info, 'molecules').name('Molecules').listen();

    // Store reference for updates
    (this.config as any)._info = info;
  }

  private handlePropertyChange(property: string): void {
    if (this.RESET_REQUIRED_PROPS.has(property)) {
      if (this.callbacks.onResetRequired) {
        this.callbacks.onResetRequired();
      }
    } else if (this.REALTIME_PROPS.has(property)) {
      if (this.callbacks.onRealTimeUpdate) {
        this.callbacks.onRealTimeUpdate(property, this.config[property as keyof ConfigInterface]);
      }
    }
  }

  // Public methods
  public setCallbacks(callbacks: {
    onResetRequired?: () => void;
    onRealTimeUpdate?: (property: string, value: any) => void;
  }): void {
    this.callbacks = callbacks;
  }

  public getConfig(): ConfigInterface {
    return this.config;
  }

  public updateInfo(fps: number, atomCount: number, moleculeCount: number): void {
    const info = (this.config as any)._info;
    if (info) {
      info.fps = fps.toFixed(1);
      info.atoms = atomCount.toString();
      info.molecules = moleculeCount.toString();
    }
  }

  public destroy(): void {
    if (this.gui) {
      this.gui.destroy();
    }
  }
}

// Create singleton instance
const configManager = new ConfigManager();

// Export both the manager and the config for backward compatibility
export default configManager.getConfig();
export {configManager};
