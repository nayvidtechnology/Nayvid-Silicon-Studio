import type { DesignGraph, DesignModule, DesignSignal } from './types.js';

export class DesignGraphBuilder {
  private graph: DesignGraph;

  constructor(topModule: string) {
    this.graph = {
      topModule,
      modules: {},
    };
  }

  addModule(module: DesignModule): this {
    this.graph.modules[module.name] = module;
    return this;
  }

  getModule(name: string): DesignModule | undefined {
    return this.graph.modules[name];
  }

  getTopModule(): DesignModule | undefined {
    return this.graph.modules[this.graph.topModule];
  }

  findSignal(moduleName: string, signalName: string): DesignSignal | undefined {
    const mod = this.getModule(moduleName);
    return mod?.signals.find((s) => s.name === signalName);
  }

  findDrivers(moduleName: string, signalName: string) {
    const sig = this.findSignal(moduleName, signalName);
    return sig?.drivers ?? [];
  }

  build(): DesignGraph {
    return this.graph;
  }
}

export * from './types.js';
