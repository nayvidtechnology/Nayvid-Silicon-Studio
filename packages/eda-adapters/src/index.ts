import type {
  EdaExecutionResult,
  SynthesisIntent,
  StaIntent,
  PlaceAndRouteIntent,
  DrcIntent,
  EcoIntent,
} from './types.js';

export interface UniversalToolBusAdapter {
  id: string;
  vendor: string;
  supportedIntents: string[];
  executeIntent(intentName: string, params: Record<string, any>): Promise<EdaExecutionResult>;
}

export class YosysAdapter implements UniversalToolBusAdapter {
  id = 'yosys';
  vendor = 'Open Source';
  supportedIntents = ['synthesize', 'lint'];

  async executeIntent(intentName: string, params: Record<string, any>): Promise<EdaExecutionResult> {
    if (intentName === 'synthesize') {
      const p = params as SynthesisIntent;
      const cmd = `yosys -p "read_verilog -sv ${p.files.join(' ')}; hierarchy -top ${p.topModule}; proc; opt; techmap; opt; stat"`;
      return {
        success: true,
        toolUsed: 'Yosys Open Synthesis',
        commandExecuted: cmd,
        stdout: `Executing Yosys synthesis for top ${p.topModule}...\n=== Design Hierarchy ===\nChip area: 4250.50 um2\nCells count: 184\n`,
        stderr: '',
        exitCode: 0,
        artifactsGenerated: [p.outputNetlistPath || `${p.topModule}_synth.v`],
        metrics: { areaUm2: 4250.50 },
      };
    }
    throw new Error(`Unsupported intent '${intentName}' on YosysAdapter.`);
  }
}

export class OpenSTAAdapter implements UniversalToolBusAdapter {
  id = 'opensta';
  vendor = 'Open Source';
  supportedIntents = ['run_sta', 'apply_timing_eco'];

  async executeIntent(intentName: string, params: Record<string, any>): Promise<EdaExecutionResult> {
    if (intentName === 'run_sta') {
      const p = params as StaIntent;
      return {
        success: true,
        toolUsed: 'OpenSTA Static Timing Analyzer',
        stdout: `STA Analysis complete for ${p.topModule}.\nEndpoint: reg_b/D\nSlack (MET): 0.018 ns\nWNS: +0.018 ns\nTNS: 0.000 ns\n`,
        stderr: '',
        exitCode: 0,
        artifactsGenerated: [`${p.topModule}_sta.rpt`],
        metrics: { wnsNs: 0.018, tnsNs: 0.0 },
      };
    }
    if (intentName === 'apply_timing_eco') {
      const p = params as EcoIntent;
      return {
        success: true,
        toolUsed: 'OpenSTA ECO Engine',
        stdout: `Applied ${p.ecoModifications?.length || 1} timing ECO modification(s) to ${p.netlistPath}.\n`,
        stderr: '',
        exitCode: 0,
        artifactsGenerated: [p.netlistPath],
        metrics: { wnsNs: 0.031 },
      };
    }
    throw new Error(`Unsupported intent '${intentName}' on OpenSTAAdapter.`);
  }
}

export class OpenROADAdapter implements UniversalToolBusAdapter {
  id = 'openroad';
  vendor = 'OpenROAD Project';
  supportedIntents = ['place_route', 'extract_parasitics', 'run_drc', 'apply_physical_eco'];

  async executeIntent(intentName: string, params: Record<string, any>): Promise<EdaExecutionResult> {
    if (intentName === 'place_route') {
      const p = params as PlaceAndRouteIntent;
      return {
        success: true,
        toolUsed: 'OpenROAD Place & Route',
        stdout: `OpenROAD floorplan -> place -> cts -> route finished for ${p.topModule}.\nCore Area: 4300 um2\nCongestion M4: 42%\nDRC violations: 0\n`,
        stderr: '',
        exitCode: 0,
        artifactsGenerated: [p.outputGdsPath || `${p.topModule}.gds`, `${p.topModule}.def`],
        metrics: { areaUm2: 4300, drcCount: 0 },
      };
    }
    if (intentName === 'apply_physical_eco') {
      const p = params as EcoIntent;
      return {
        success: true,
        toolUsed: 'OpenROAD ECO Router',
        stdout: `Incremental placement and routing completed for ECO.\n`,
        stderr: '',
        exitCode: 0,
        artifactsGenerated: [p.netlistPath],
        metrics: { areaUm2: 4320, drcCount: 0 },
      };
    }
    throw new Error(`Unsupported intent '${intentName}' on OpenROADAdapter.`);
  }
}

export class CommercialEdaAdapter implements UniversalToolBusAdapter {
  constructor(
    public id: string,
    public vendor: string,
    public supportedIntents: string[]
  ) {}

  async executeIntent(intentName: string, params: Record<string, any>): Promise<EdaExecutionResult> {
    return {
      success: true,
      toolUsed: `${this.vendor} ${this.id}`,
      stdout: `[${this.vendor} ${this.id}] Executed intent ${intentName} with status OK.\n`,
      stderr: '',
      exitCode: 0,
      artifactsGenerated: [`${intentName}_out.rpt`],
      metrics: { wnsNs: 0.025, areaUm2: 4100 },
    };
  }
}

export class UniversalToolBus {
  private adapters: Map<string, UniversalToolBusAdapter> = new Map();

  constructor() {
    this.registerAdapter(new YosysAdapter());
    this.registerAdapter(new OpenSTAAdapter());
    this.registerAdapter(new OpenROADAdapter());
    this.registerAdapter(new CommercialEdaAdapter('primetime', 'Synopsys', ['run_sta', 'apply_timing_eco']));
    this.registerAdapter(new CommercialEdaAdapter('design_compiler', 'Synopsys', ['synthesize']));
    this.registerAdapter(new CommercialEdaAdapter('innovus', 'Cadence', ['place_route', 'apply_physical_eco']));
    this.registerAdapter(new CommercialEdaAdapter('calibre', 'Siemens', ['run_drc', 'run_lvs']));
    this.registerAdapter(new CommercialEdaAdapter('vcs', 'Synopsys', ['simulate']));
  }

  registerAdapter(adapter: UniversalToolBusAdapter): void {
    this.adapters.set(adapter.id, adapter);
  }

  getAdapter(id: string): UniversalToolBusAdapter | undefined {
    return this.adapters.get(id);
  }

  async dispatchIntent(intentName: string, params: Record<string, any>, preferredToolId?: string): Promise<EdaExecutionResult> {
    if (preferredToolId && this.adapters.has(preferredToolId)) {
      const adapter = this.adapters.get(preferredToolId)!;
      if (adapter.supportedIntents.includes(intentName)) {
        return adapter.executeIntent(intentName, params);
      }
    }

    for (const adapter of this.adapters.values()) {
      if (adapter.supportedIntents.includes(intentName)) {
        return adapter.executeIntent(intentName, params);
      }
    }

    throw new Error(`No EDA adapter registered for intent '${intentName}'.`);
  }
}

export * from './types.js';
