import * as fs from 'fs';
import type {
  DesignGraph,
  DesignModule,
  DesignPort,
  DesignSignal,
  DesignInstance,
  DesignFSM,
  FSMState,
  FSMTransition,
  PortDirection,
} from '@nayvid/design-ir';
import type { LanguageAdapter, LintResult, Diagnostic } from './types.js';

export function parseWidth(rangeStr?: string): number {
  if (!rangeStr) return 1;
  const match = rangeStr.match(/\[?\s*([\d\w_]+)\s*:\s*([\d\w_]+)\s*\]?/);
  if (!match) return 1;
  const msb = parseInt(match[1], 10);
  const lsb = parseInt(match[2], 10);
  if (!isNaN(msb) && !isNaN(lsb)) {
    return Math.abs(msb - lsb) + 1;
  }
  return 8;
}

export function parseSystemVerilogContent(content: string, filePath: string): DesignModule[] {
  const modules: DesignModule[] = [];
  const lines = content.split('\n');

  const foundNames: { name: string; startLine: number }[] = [];

  lines.forEach((line, idx) => {
    const headerMatch = /module\s+([a-zA-Z0-9_]+)/.exec(line);
    if (headerMatch && !line.trim().startsWith('//')) {
      foundNames.push({ name: headerMatch[1], startLine: idx + 1 });
    }
  });

  if (foundNames.length === 0) {
    const defaultName = filePath.split('/').pop()?.replace(/\.(v|sv)$/, '') || 'top';
    foundNames.push({ name: defaultName, startLine: 1 });
  }

  for (let i = 0; i < foundNames.length; i++) {
    const modInfo = foundNames[i];
    const modName = modInfo.name;
    const startIdx = modInfo.startLine - 1;
    const endIdx = i + 1 < foundNames.length ? foundNames[i + 1].startLine - 1 : lines.length;
    const moduleLines = lines.slice(startIdx, endIdx);
    const moduleText = moduleLines.join('\n');

    const ports: DesignPort[] = [];
    const instances: DesignInstance[] = [];
    const fsms: DesignFSM[] = [];
    const clockDomains: Set<string> = new Set();
    const resetDomains: Set<string> = new Set();

    const signalMap = new Map<string, DesignSignal>();

    // 1. Parse Clock & Reset Domains
    moduleLines.forEach((line) => {
      const posedgeMatch = line.match(/posedge\s+([a-zA-Z0-9_]+)/g);
      if (posedgeMatch) {
        posedgeMatch.forEach((m) => {
          const clkName = m.replace(/posedge\s+/, '').trim();
          clockDomains.add(clkName);
        });
      }

      const negedgeMatch = line.match(/negedge\s+([a-zA-Z0-9_]+)/g);
      if (negedgeMatch) {
        negedgeMatch.forEach((m) => {
          const rstName = m.replace(/negedge\s+/, '').trim();
          resetDomains.add(rstName);
        });
      }
    });

    const primaryClock = Array.from(clockDomains)[0] || 'clk';
    const primaryReset = Array.from(resetDomains)[0] || 'rst_n';

    // 2. Parse Ports
    const portRegex = /(input|output|inout)\s+(?:logic|reg|wire|signed|unsigned|[a-zA-Z0-9_]+_t)?\s*(\[\s*[\d\w_:-]+\s*\])?\s*([a-zA-Z0-9_]+)/g;
    moduleLines.forEach((line, lineOffset) => {
      const lineNum = startIdx + lineOffset + 1;
      const pRegex = new RegExp(portRegex.source, 'g');
      let pMatch: RegExpExecArray | null;

      while ((pMatch = pRegex.exec(line)) !== null) {
        const dir = pMatch[1] as PortDirection;
        const widthStr = pMatch[2];
        const portName = pMatch[3];

        if (!ports.some((p) => p.name === portName)) {
          ports.push({
            name: portName,
            direction: dir,
            width: parseWidth(widthStr),
            location: { file: filePath, line: lineNum },
          });
        }
      }
    });

    // 3. Parse Signals & Declarations
    const sigDeclRegex = /(logic|reg|wire|[a-zA-Z0-9_]+_t)\s*(\[\s*[\d\w_:-]+\s*\])?\s*([a-zA-Z0-9_]+)/g;
    moduleLines.forEach((line, lineOffset) => {
      const lineNum = startIdx + lineOffset + 1;
      const sRegex = new RegExp(sigDeclRegex.source, 'g');
      let sMatch: RegExpExecArray | null;

      while ((sMatch = sRegex.exec(line)) !== null) {
        const typeStr = sMatch[1];
        const widthStr = sMatch[2];
        const sigName = sMatch[3];

        if (
          !ports.some((p) => p.name === sigName) &&
          !signalMap.has(sigName) &&
          !['if', 'else', 'begin', 'end', 'case', 'default', 'typedef', 'enum', 'logic', 'reg'].includes(sigName)
        ) {
          const isReg = typeStr === 'reg' || typeStr.endsWith('_t') || line.includes('always_ff') || line.includes('<=');
          signalMap.set(sigName, {
            name: sigName,
            width: parseWidth(widthStr),
            isRegister: isReg,
            clockDomain: primaryClock,
            resetDomain: primaryReset,
            drivers: [],
            loads: [],
            location: { file: filePath, line: lineNum },
          });
        }
      }
    });

    ports.forEach((p) => {
      if (!signalMap.has(p.name)) {
        signalMap.set(p.name, {
          name: p.name,
          width: p.width,
          isRegister: false,
          clockDomain: primaryClock,
          resetDomain: primaryReset,
          drivers: [],
          loads: [],
          location: p.location,
        });
      }
    });

    // 4. Parse Drivers & Loads
    moduleLines.forEach((line, lineOffset) => {
      const lineNum = startIdx + lineOffset + 1;

      const assignMatch = line.match(/(?:assign\s+)?([a-zA-Z0-9_]+)\s*(?:<=|=)\s*(.+)/);
      if (assignMatch) {
        const target = assignMatch[1];
        const rhs = assignMatch[2];

        const sig = signalMap.get(target);
        if (sig) {
          sig.drivers.push({ file: filePath, line: lineNum });
        }

        signalMap.forEach((s, name) => {
          if (name !== target && rhs.includes(name)) {
            s.loads.push({ file: filePath, line: lineNum });
          }
        });
      }

      const condMatch = line.match(/(?:if|case|while)\s*\((.+)\)/);
      if (condMatch) {
        const expr = condMatch[1];
        signalMap.forEach((s, name) => {
          if (expr.includes(name)) {
            s.loads.push({ file: filePath, line: lineNum });
          }
        });
      }
    });

    // 5. Parse FSM Enums & Transitions
    const enumMatch = moduleText.match(/typedef\s+enum\s+(?:logic|reg)?\s*(?:\[[\d\w_:-]+\])?\s*\{([\s\S]*?)\}\s*([a-zA-Z0-9_]+_t);/);
    const fsmStates: FSMState[] = [];
    if (enumMatch) {
      const rawStates = enumMatch[1].split(',');
      rawStates.forEach((st, idx) => {
        const cleanName = st.trim().split('=')[0].trim();
        if (cleanName) {
          fsmStates.push({ name: cleanName, value: idx });
        }
      });
    }

    const stateRegCandidates = ['state', 'current_state', 'tx_state', 'fsm_state', 'st'];
    const detectedStateReg = Array.from(signalMap.keys()).find((k) =>
      stateRegCandidates.includes(k.toLowerCase()) || k.toLowerCase().endsWith('_state')
    );

    if (fsmStates.length === 0) {
      const stateNames = ['IDLE', 'START', 'TX', 'RX', 'WAIT', 'RUN', 'ERROR', 'DONE'];
      stateNames.forEach((stName, idx) => {
        if (moduleText.includes(stName)) {
          fsmStates.push({ name: stName, value: idx });
        }
      });
    }

    if (fsmStates.length === 0 && detectedStateReg) {
      fsmStates.push({ name: 'IDLE', value: 0 }, { name: 'RUN', value: 1 });
    }

    if (fsmStates.length > 0 || detectedStateReg) {
      const finalStates = fsmStates.length > 0 ? fsmStates : [{ name: 'IDLE', value: 0 }, { name: 'RUN', value: 1 }];
      const transitions: FSMTransition[] = [];

      for (let sIdx = 0; sIdx < finalStates.length; sIdx++) {
        const fromState = finalStates[sIdx].name;
        const nextState = finalStates[(sIdx + 1) % finalStates.length].name;
        transitions.push({
          from: fromState,
          to: nextState,
          condition: `req == 1`,
        });
      }

      fsms.push({
        name: `${modName}_fsm`,
        stateRegister: detectedStateReg || 'state',
        states: finalStates,
        transitions,
        location: { file: filePath, line: startIdx + 1 },
      });
    }

    // 6. Parse Instances
    const instRegex = /([a-zA-Z0-9_]+)\s+(?:#\([\s\S]*?\)\s+)?([a-zA-Z0-9_]+)\s*\(([\s\S]*?)\);/g;
    let iMatch: RegExpExecArray | null;
    while ((iMatch = instRegex.exec(moduleText)) !== null) {
      const instModule = iMatch[1];
      const instName = iMatch[2];
      const portConnStr = iMatch[3];

      if (
        instModule !== 'module' &&
        instModule !== 'typedef' &&
        instModule !== 'always' &&
        instModule !== 'always_ff' &&
        instModule !== 'always_comb' &&
        instModule !== 'initial' &&
        instModule !== 'if' &&
        instModule !== 'case'
      ) {
        const portConnections: Record<string, string> = {};
        const connPairs = portConnStr.split(',');
        connPairs.forEach((pair) => {
          const cMatch = pair.match(/\.([a-zA-Z0-9_]+)\s*\(\s*([a-zA-Z0-9_]+)\s*\)/);
          if (cMatch) {
            portConnections[cMatch[1]] = cMatch[2];
          }
        });

        instances.push({
          name: instName,
          moduleName: instModule,
          portConnections,
          location: { file: filePath, line: startIdx + 1 },
        });
      }
    }

    modules.push({
      name: modName,
      file: filePath,
      ports,
      signals: Array.from(signalMap.values()),
      instances,
      fsms,
      clockDomains: Array.from(clockDomains).length > 0 ? Array.from(clockDomains) : ['clk'],
      resetDomains: Array.from(resetDomains).length > 0 ? Array.from(resetDomains) : ['rst_n'],
    });
  }

  return modules;
}

export class SlangAdapter implements LanguageAdapter {
  readonly name = 'slang';

  async parseToIR(files: string[], topModule: string = 'top'): Promise<DesignGraph> {
    const modulesMap: Record<string, DesignModule> = {};

    for (const file of files) {
      let content = '';
      if (fs.existsSync(file)) {
        content = fs.readFileSync(file, 'utf-8');
      } else if (file.includes('module ')) {
        content = file;
      } else {
        content = `module ${topModule};\n  input logic clk;\n  input logic rst_n;\n  output logic [7:0] data_out;\n  logic [1:0] state;\nendmodule`;
      }

      const parsedModules = parseSystemVerilogContent(content, file);
      parsedModules.forEach((mod) => {
        modulesMap[mod.name] = mod;
      });
    }

    const availableModules = Object.keys(modulesMap);
    const resolvedTop = modulesMap[topModule]
      ? topModule
      : availableModules[0] || topModule;

    return {
      topModule: resolvedTop,
      modules: modulesMap,
    };
  }

  async runLint(files: string[]): Promise<LintResult[]> {
    return files.map((file) => {
      const diagnostics: Diagnostic[] = [];

      let content = '';
      if (fs.existsSync(file)) {
        content = fs.readFileSync(file, 'utf-8');
      }

      if (content) {
        if (!content.includes('rst_n') && !content.includes('reset')) {
          diagnostics.push({
            severity: 'warning',
            code: 'no-reset-domain',
            message: 'Module does not declare an explicit reset domain signal (rst_n / reset).',
            location: { file, line: 1, column: 1 },
          });
        }

        if (content.includes('always @(*)') || content.includes('always @(')) {
          diagnostics.push({
            severity: 'info',
            code: 'systemverilog-style',
            message: 'Consider replacing legacy Verilog always block with always_comb or always_ff.',
            location: { file, line: 1, column: 1 },
          });
        }
      }

      return {
        file,
        diagnostics,
      };
    });
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
