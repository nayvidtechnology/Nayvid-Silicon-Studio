import type { ToolDefinition } from './types.js';

const crossPlatform = {
  'native-windows': 'supported', wsl2: 'preferred', linux: 'supported', docker: 'supported', auto: 'supported',
} as const;
const linuxPreferred = {
  'native-windows': 'limited', wsl2: 'preferred', linux: 'supported', docker: 'supported', auto: 'preferred',
} as const;
const wslPhysical = {
  'native-windows': 'unsupported', wsl2: 'preferred', linux: 'supported', docker: 'supported', auto: 'preferred',
} as const;

export const BUILTIN_TOOLS: ToolDefinition[] = [
  { id: 'slang', name: 'slang SystemVerilog Compiler', category: 'language', binaryName: 'slang', versionFlag: '--version', supportedRuntimes: crossPlatform, installGuide: 'Install slang SystemVerilog compiler binaries.' },
  { id: 'verible', name: 'Verible Linter & Formatter', category: 'language', binaryName: 'verible-verilog-lint', versionFlag: '--version', supportedRuntimes: crossPlatform, installGuide: 'Install Verible release binaries.' },
  { id: 'iverilog', name: 'Icarus Verilog', category: 'simulation', binaryName: 'iverilog', versionFlag: '-V', supportedRuntimes: crossPlatform, installGuide: 'Install Icarus Verilog; vvp is expected alongside it.' },
  { id: 'verilator', name: 'Verilator', category: 'simulation', binaryName: 'verilator', versionFlag: '--version', supportedRuntimes: linuxPreferred, installGuide: 'Use Verilator in WSL2/Linux or a supported native package.' },
  { id: 'ghdl', name: 'GHDL VHDL Simulator', category: 'simulation', binaryName: 'ghdl', versionFlag: '--version', supportedRuntimes: crossPlatform, installGuide: 'Install GHDL for VHDL-2008 analysis and simulation.' },
  { id: 'cocotb', name: 'cocotb Python Verification', category: 'simulation', binaryName: 'cocotb-config', versionFlag: '--version', supportedRuntimes: crossPlatform, installGuide: 'Install cocotb in the Python environment used by the selected runtime.' },
  { id: 'surfer', name: 'Surfer Waveform Viewer', category: 'simulation', binaryName: 'surfer', versionFlag: '--version', supportedRuntimes: { ...crossPlatform, wsl2: 'supported' }, installGuide: 'Install Surfer for interactive waveform viewing.' },
  { id: 'yosys', name: 'Yosys Open Synthesis Suite', category: 'synthesis', binaryName: 'yosys', versionFlag: '-V', supportedRuntimes: crossPlatform, installGuide: 'Install Yosys or OSS CAD Suite.' },
  { id: 'nextpnr', name: 'nextpnr FPGA Place & Route', category: 'synthesis', binaryName: 'nextpnr-ice40', versionFlag: '--version', supportedRuntimes: crossPlatform, installGuide: 'Install a nextpnr architecture build; ice40 is the default probe.' },
  { id: 'sby', name: 'SymbiYosys Formal Verification', category: 'formal', binaryName: 'sby', versionFlag: '--version', supportedRuntimes: linuxPreferred, installGuide: 'Install SymbiYosys and a supported SMT/engine backend.' },
  { id: 'openroad', name: 'OpenROAD Physical Design Engine', category: 'physical', binaryName: 'openroad', versionFlag: '-version', supportedRuntimes: wslPhysical, installGuide: 'Use OpenROAD inside WSL2/Linux or Docker.' },
  { id: 'opensta', name: 'OpenSTA Static Timing Analyzer', category: 'physical', binaryName: 'sta', versionFlag: '-version', supportedRuntimes: wslPhysical, installGuide: 'Install OpenSTA or use an OpenROAD tool bundle.' },
  { id: 'klayout', name: 'KLayout Layout Viewer', category: 'physical', binaryName: 'klayout', versionFlag: '-v', supportedRuntimes: { ...crossPlatform, wsl2: 'supported' }, installGuide: 'Install KLayout standalone binaries.' },
  { id: 'ollama', name: 'Ollama AI Backend', category: 'ai', binaryName: 'ollama', versionFlag: '--version', supportedRuntimes: { ...crossPlatform, wsl2: 'supported' }, installGuide: 'Install Ollama desktop app or CLI for local/private models.' },
];

export class ToolRegistry {
  private tools: Map<string, ToolDefinition> = new Map();

  constructor(customTools: ToolDefinition[] = BUILTIN_TOOLS) {
    for (const tool of customTools) this.tools.set(tool.id, tool);
  }

  registerTool(tool: ToolDefinition): void { this.tools.set(tool.id, tool); }
  getTool(id: string): ToolDefinition | undefined { return this.tools.get(id); }
  getAllTools(): ToolDefinition[] { return Array.from(this.tools.values()); }
  getToolsByCategory(category: ToolDefinition['category']): ToolDefinition[] { return this.getAllTools().filter((t) => t.category === category); }
}
