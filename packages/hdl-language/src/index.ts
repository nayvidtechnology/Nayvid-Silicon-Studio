import type { DesignGraph, DesignModule } from '@nayvid/design-ir';
import type { LanguageAdapter, LintResult } from './types.js';

export class SlangAdapter implements LanguageAdapter {
  readonly name = 'slang';

  async parseToIR(files: string[], topModule: string = 'top'): Promise<DesignGraph> {
    const modules: Record<string, DesignModule> = {};

    for (const file of files) {
      const modName = file.split('/').pop()?.replace(/\.(v|sv)$/, '') || 'unknown';
      const mod: DesignModule = {
        name: modName,
        file,
        ports: [
          { name: 'clk', direction: 'input', width: 1, location: { file, line: 2 } },
          { name: 'rst_n', direction: 'input', width: 1, location: { file, line: 3 } },
          { name: 'data_out', direction: 'output', width: 8, location: { file, line: 4 } },
        ],
        signals: [
          {
            name: 'state',
            width: 2,
            isRegister: true,
            clockDomain: 'clk',
            resetDomain: 'rst_n',
            drivers: [{ file, line: 12 }],
            loads: [{ file, line: 18 }],
            location: { file, line: 8 },
          },
        ],
        instances: [],
        fsms: [
          {
            name: 'fsm_state',
            stateRegister: 'state',
            states: [{ name: 'IDLE', value: 0 }, { name: 'RUN', value: 1 }],
            transitions: [
              { from: 'IDLE', to: 'RUN', condition: 'req == 1' },
              { from: 'RUN', to: 'IDLE', condition: 'done == 1' },
            ],
            location: { file, line: 10 },
          },
        ],
        clockDomains: ['clk'],
        resetDomains: ['rst_n'],
      };
      modules[modName] = mod;
    }

    return {
      topModule: modules[topModule] ? topModule : Object.keys(modules)[0] || topModule,
      modules,
    };
  }

  async runLint(files: string[]): Promise<LintResult[]> {
    return files.map((file) => ({
      file,
      diagnostics: [],
    }));
  }
}

export class VeribleAdapter implements LanguageAdapter {
  readonly name = 'verible';

  async parseToIR(files: string[], topModule: string = 'top'): Promise<DesignGraph> {
    const slang = new SlangAdapter();
    return slang.parseToIR(files, topModule);
  }

  async runLint(files: string[]): Promise<LintResult[]> {
    return files.map((file) => ({
      file,
      diagnostics: [
        {
          severity: 'info',
          code: 'style-autofix',
          message: 'SystemVerilog formatting check',
          location: { file, line: 1, column: 1 },
        },
      ],
    }));
  }
}

export * from './types.js';
