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
  SourceLocation,
} from '@nayvid/design-ir';
import type { LanguageAdapter, LintResult, Diagnostic } from './types.js';

const IDENTIFIER = /\b[a-zA-Z_][a-zA-Z0-9_]*\b/g;
const KEYWORDS = new Set([
  'if', 'else', 'begin', 'end', 'case', 'endcase', 'always', 'always_ff', 'always_comb',
  'assign', 'logic', 'reg', 'wire', 'input', 'output', 'inout', 'module', 'endmodule',
  'typedef', 'enum', 'localparam', 'parameter', 'posedge', 'negedge', 'or', 'and', 'not',
]);

export function parseWidth(rangeStr?: string): number {
  if (!rangeStr) return 1;
  const match = rangeStr.match(/\[?\s*(\d+)\s*:\s*(\d+)\s*\]?/);
  if (!match) return 1;
  return Math.abs(parseInt(match[1], 10) - parseInt(match[2], 10)) + 1;
}

function identifiers(expression: string, knownSignals: Set<string>): string[] {
  const result = new Set<string>();
  for (const match of expression.matchAll(IDENTIFIER)) {
    const id = match[0];
    if (!KEYWORDS.has(id) && knownSignals.has(id)) result.add(id);
  }
  return [...result];
}

function pushLocation(list: SourceLocation[], location: SourceLocation): void {
  if (!list.some((item) => item.file === location.file && item.line === location.line && item.column === location.column)) {
    list.push(location);
  }
}

function parseEnumStates(moduleText: string): FSMState[] {
  const enumMatch = moduleText.match(/typedef\s+enum\s+(?:logic|reg)?\s*(?:\[[^\]]+\])?\s*\{([\s\S]*?)\}\s*([a-zA-Z_][a-zA-Z0-9_]*_t)\s*;/);
  if (!enumMatch) return [];
  return enumMatch[1].split(',').map((raw, index) => {
    const [nameRaw, valueRaw] = raw.trim().split('=').map((x) => x?.trim());
    return { name: nameRaw, value: valueRaw || index };
  }).filter((state) => Boolean(state.name));
}

function parseFsmTransitions(
  moduleLines: string[],
  startIdx: number,
  filePath: string,
  stateRegister: string,
  states: FSMState[]
): FSMTransition[] {
  const stateNames = new Set(states.map((state) => state.name));
  const transitions: FSMTransition[] = [];
  let activeCaseState: string | undefined;
  let pendingCondition: string | undefined;

  for (let lineOffset = 0; lineOffset < moduleLines.length; lineOffset++) {
    const line = moduleLines[lineOffset];
    const location = { file: filePath, line: startIdx + lineOffset + 1 };
    const label = line.match(/^\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*:\s*(.*)$/);
    let body = line;
    if (label && stateNames.has(label[1])) {
      activeCaseState = label[1];
      pendingCondition = undefined;
      body = label[2];
    }
    if (!activeCaseState) continue;

    const ifMatch = body.match(/\bif\s*\(([^)]+)\)/);
    if (ifMatch) pendingCondition = ifMatch[1].trim();

    const assignment = body.match(new RegExp(`\\b(?:${stateRegister}|next_${stateRegister}|next_state)\\s*(?:<=|=)\\s*([a-zA-Z_][a-zA-Z0-9_]*)`));
    if (assignment && stateNames.has(assignment[1])) {
      transitions.push({
        from: activeCaseState,
        to: assignment[1],
        condition: ifMatch?.[1]?.trim() || pendingCondition,
        location,
      });
      if (body.includes(';')) pendingCondition = undefined;
    }

    if (/\bendcase\b/.test(line)) {
      activeCaseState = undefined;
      pendingCondition = undefined;
    }
  }

  return transitions;
}

export function parseSystemVerilogContent(content: string, filePath: string): DesignModule[] {
  const modules: DesignModule[] = [];
  const lines = content.split(/\r?\n/);
  const foundNames: Array<{ name: string; startLine: number }> = [];

  lines.forEach((line, idx) => {
    const header = line.match(/^\s*module\s+([a-zA-Z_][a-zA-Z0-9_]*)/);
    if (header) foundNames.push({ name: header[1], startLine: idx + 1 });
  });
  if (!foundNames.length) return modules;

  for (let i = 0; i < foundNames.length; i++) {
    const info = foundNames[i];
    const startIdx = info.startLine - 1;
    const endIdx = i + 1 < foundNames.length ? foundNames[i + 1].startLine - 1 : lines.length;
    const moduleLines = lines.slice(startIdx, endIdx);
    const moduleText = moduleLines.join('\n');
    const ports: DesignPort[] = [];
    const instances: DesignInstance[] = [];
    const clockDomains = new Set<string>();
    const resetDomains = new Set<string>();
    const signalMap = new Map<string, DesignSignal>();

    moduleLines.forEach((line) => {
      for (const match of line.matchAll(/\bposedge\s+([a-zA-Z_][a-zA-Z0-9_]*)/g)) clockDomains.add(match[1]);
      for (const match of line.matchAll(/\bnegedge\s+([a-zA-Z_][a-zA-Z0-9_]*)/g)) resetDomains.add(match[1]);
    });

    const portRegex = /\b(input|output|inout)\s+(?:(logic|reg|wire|signed|unsigned|[a-zA-Z_][a-zA-Z0-9_]*_t)\s+)?(\[[^\]]+\])?\s*([a-zA-Z_][a-zA-Z0-9_]*)/g;
    moduleLines.forEach((line, offset) => {
      for (const match of line.matchAll(portRegex)) {
        const name = match[4];
        if (!ports.some((port) => port.name === name)) {
          ports.push({
            name,
            direction: match[1] as PortDirection,
            width: parseWidth(match[3]),
            type: match[2],
            location: { file: filePath, line: startIdx + offset + 1 },
          });
        }
      }
    });

    const signalRegex = /\b(logic|reg|wire|[a-zA-Z_][a-zA-Z0-9_]*_t)\s*(\[[^\]]+\])?\s*([a-zA-Z_][a-zA-Z0-9_]*)/g;
    moduleLines.forEach((line, offset) => {
      for (const match of line.matchAll(signalRegex)) {
        const name = match[3];
        if (['logic', 'reg', 'wire'].includes(name) || signalMap.has(name)) continue;
        const port = ports.find((p) => p.name === name);
        signalMap.set(name, {
          name,
          width: port?.width ?? parseWidth(match[2]),
          isRegister: match[1] === 'reg' || match[1].endsWith('_t'),
          drivers: [],
          loads: [],
          driverExpressions: [],
          dependsOn: [],
          location: port?.location ?? { file: filePath, line: startIdx + offset + 1 },
        });
      }
    });
    for (const port of ports) {
      if (!signalMap.has(port.name)) {
        signalMap.set(port.name, {
          name: port.name,
          width: port.width,
          isRegister: false,
          drivers: [],
          loads: [],
          driverExpressions: [],
          dependsOn: [],
          location: port.location,
        });
      }
    }

    const knownSignals = new Set(signalMap.keys());
    let currentClock: string | undefined;
    let currentReset: string | undefined;
    let sequentialDepth = 0;

    moduleLines.forEach((line, offset) => {
      const location = { file: filePath, line: startIdx + offset + 1 };
      const always = line.match(/always_ff\s*@\s*\(([^)]+)\)/);
      if (always) {
        const clk = always[1].match(/posedge\s+([a-zA-Z_][a-zA-Z0-9_]*)/);
        const rst = always[1].match(/negedge\s+([a-zA-Z_][a-zA-Z0-9_]*)/);
        currentClock = clk?.[1];
        currentReset = rst?.[1];
        sequentialDepth = 1;
      }

      const assignmentRegex = /(?:\bassign\s+)?\b([a-zA-Z_][a-zA-Z0-9_]*)\s*(<=|=)\s*([^;]+);/g;
      for (const assignment of line.matchAll(assignmentRegex)) {
        const target = assignment[1];
        const signal = signalMap.get(target);
        if (!signal) continue;
        const dependencies = identifiers(assignment[3], knownSignals).filter((dep) => dep !== target);
        pushLocation(signal.drivers, location);
        signal.driverExpressions?.push({ expression: assignment[3].trim(), dependencies, sequential: assignment[2] === '<=' || sequentialDepth > 0, location });
        signal.dependsOn = [...new Set([...(signal.dependsOn ?? []), ...dependencies])];
        if (assignment[2] === '<=' || sequentialDepth > 0) signal.isRegister = true;
        if (currentClock) signal.clockDomain = currentClock;
        if (currentReset) signal.resetDomain = currentReset;
        for (const dependency of dependencies) {
          const depSignal = signalMap.get(dependency);
          if (depSignal) pushLocation(depSignal.loads, location);
        }
      }

      for (const condition of line.matchAll(/\b(?:if|while)\s*\(([^)]+)\)/g)) {
        for (const dependency of identifiers(condition[1], knownSignals)) {
          const depSignal = signalMap.get(dependency);
          if (depSignal) pushLocation(depSignal.loads, location);
        }
      }

      if (sequentialDepth > 0) {
        sequentialDepth += (line.match(/\bbegin\b/g) || []).length;
        sequentialDepth -= (line.match(/\bend\b/g) || []).length;
        if (sequentialDepth <= 0) {
          sequentialDepth = 0;
          currentClock = undefined;
          currentReset = undefined;
        }
      }
    });

    const states = parseEnumStates(moduleText);
    const stateRegister = [...signalMap.keys()].find((name) => /(^state$|_state$|^current_state$)/i.test(name));
    const fsms: DesignFSM[] = [];
    if (states.length && stateRegister) {
      fsms.push({
        name: `${info.name}_fsm`,
        stateRegister,
        states,
        transitions: parseFsmTransitions(moduleLines, startIdx, filePath, stateRegister, states),
        location: signalMap.get(stateRegister)?.location,
      });
    }

    const instanceRegex = /^\s*([a-zA-Z_][a-zA-Z0-9_]*)\s+(?:#\([\s\S]*?\)\s*)?([a-zA-Z_][a-zA-Z0-9_]*)\s*\(([^;]*)\)\s*;/gm;
    for (const match of moduleText.matchAll(instanceRegex)) {
      const moduleName = match[1];
      if (KEYWORDS.has(moduleName) || moduleName === info.name) continue;
      const portConnections: Record<string, string> = {};
      for (const connection of match[3].matchAll(/\.([a-zA-Z_][a-zA-Z0-9_]*)\s*\(\s*([^\)]+)\s*\)/g)) {
        portConnections[connection[1]] = connection[2].trim();
      }
      const line = startIdx + moduleText.slice(0, match.index ?? 0).split('\n').length;
      instances.push({ name: match[2], moduleName, portConnections, location: { file: filePath, line } });
    }

    modules.push({
      name: info.name,
      file: filePath,
      ports,
      signals: [...signalMap.values()],
      instances,
      fsms,
      clockDomains: [...clockDomains],
      resetDomains: [...resetDomains],
    });
  }

  return modules;
}

export class SlangAdapter implements LanguageAdapter {
  readonly name = 'slang';

  async parseContentToIR(content: string, filePath = '<memory>.sv', topModule = 'top'): Promise<DesignGraph> {
    const modules = parseSystemVerilogContent(content, filePath);
    const moduleMap = Object.fromEntries(modules.map((module) => [module.name, module]));
    const available = Object.keys(moduleMap);
    if (!available.length) throw new Error(`No SystemVerilog module declaration found in ${filePath}`);
    return { topModule: moduleMap[topModule] ? topModule : available[0], modules: moduleMap };
  }

  async parseToIR(files: string[], topModule = 'top'): Promise<DesignGraph> {
    const modules: Record<string, DesignModule> = {};
    for (let index = 0; index < files.length; index++) {
      const source = files[index];
      let content: string;
      let sourceName: string;
      if (fs.existsSync(source)) {
        content = fs.readFileSync(source, 'utf-8');
        sourceName = source;
      } else if (/\bmodule\s+[a-zA-Z_]/.test(source)) {
        content = source;
        sourceName = `<memory-${index}>.sv`;
      } else {
        throw new Error(`SystemVerilog source not found: ${source}`);
      }
      for (const module of parseSystemVerilogContent(content, sourceName)) modules[module.name] = module;
    }
    const available = Object.keys(modules);
    if (!available.length) throw new Error('No SystemVerilog modules were parsed.');
    return { topModule: modules[topModule] ? topModule : available[0], modules };
  }

  async runLint(files: string[]): Promise<LintResult[]> {
    return files.map((file) => {
      if (!fs.existsSync(file)) {
        return {
          file,
          diagnostics: [{ severity: 'error', code: 'file-not-found', message: `HDL file not found: ${file}`, location: { file, line: 1, column: 1 } }],
        };
      }
      const content = fs.readFileSync(file, 'utf-8');
      const diagnostics: Diagnostic[] = [];
      if (!/\bmodule\s+[a-zA-Z_]/.test(content)) diagnostics.push({ severity: 'error', code: 'no-module', message: 'No module declaration found.', location: { file, line: 1, column: 1 } });
      if (!content.includes('rst_n') && !/\breset\b/.test(content)) diagnostics.push({ severity: 'warning', code: 'no-reset-domain', message: 'Module does not declare an explicit reset signal.', location: { file, line: 1, column: 1 } });
      if (/always\s*@/.test(content)) diagnostics.push({ severity: 'info', code: 'systemverilog-style', message: 'Consider always_comb/always_ff for explicit intent.', location: { file, line: 1, column: 1 } });
      return { file, diagnostics };
    });
  }
}

export class VeribleAdapter implements LanguageAdapter {
  readonly name = 'verible';
  async parseToIR(files: string[], topModule = 'top'): Promise<DesignGraph> {
    return new SlangAdapter().parseToIR(files, topModule);
  }
  async runLint(files: string[]): Promise<LintResult[]> {
    return new SlangAdapter().runLint(files);
  }
}

export * from './types.js';
