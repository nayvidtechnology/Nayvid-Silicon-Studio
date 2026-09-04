import type { ToolDefinition } from './types.js';

export const BUILTIN_TOOLS: ToolDefinition[] = [
  {
    id: 'slang',
    name: 'slang SystemVerilog Compiler',
    category: 'language',
    binaryName: 'slang',
    versionFlag: '--version',
    supportedRuntimes: {
      'native-windows': 'supported',
      wsl2: 'preferred',
      linux: 'supported',
      docker: 'supported',
      auto: 'supported',
    },
    installGuide: 'Download slang binary or install via package manager.',
  },
  {
    id: 'verible',
    name: 'Verible Linter & Formatter',
    category: 'language',
    binaryName: 'verible-verilog-lint',
    versionFlag: '--version',
    supportedRuntimes: {
      'native-windows': 'supported',
      wsl2: 'preferred',
      linux: 'supported',
      docker: 'supported',
      auto: 'supported',
    },
    installGuide: 'Download Verible release binaries from Chips Alliance GitHub.',
  },
  {
    id: 'iverilog',
    name: 'Icarus Verilog',
    category: 'simulation',
    binaryName: 'iverilog',
    versionFlag: '-V',
    supportedRuntimes: {
      'native-windows': 'supported',
      wsl2: 'preferred',
      linux: 'supported',
      docker: 'supported',
      auto: 'supported',
    },
    installGuide: 'Install via apt-get install iverilog or Windows installer.',
  },
  {
    id: 'verilator',
    name: 'Verilator',
    category: 'simulation',
    binaryName: 'verilator',
    versionFlag: '--version',
    supportedRuntimes: {
      'native-windows': 'limited',
      wsl2: 'preferred',
      linux: 'supported',
      docker: 'supported',
      auto: 'preferred',
    },
    installGuide: 'Install via apt-get install verilator in WSL2 / Linux.',
  },
  {
    id: 'yosys',
    name: 'Yosys Open Synthesis Suite',
    category: 'synthesis',
    binaryName: 'yosys',
    versionFlag: '-V',
    supportedRuntimes: {
      'native-windows': 'supported',
      wsl2: 'preferred',
      linux: 'supported',
      docker: 'supported',
      auto: 'supported',
    },
    installGuide: 'Install Yosys OSS CAD Suite.',
  },
  {
    id: 'sby',
    name: 'SymbiYosys Formal Verification',
    category: 'formal',
    binaryName: 'sby',
    versionFlag: '--version',
    supportedRuntimes: {
      'native-windows': 'limited',
      wsl2: 'preferred',
      linux: 'supported',
      docker: 'supported',
      auto: 'preferred',
    },
    installGuide: 'Install SymbiYosys in WSL2/Linux.',
  },
  {
    id: 'openroad',
    name: 'OpenROAD Physical Design Engine',
    category: 'physical',
    binaryName: 'openroad',
    versionFlag: '-version',
    supportedRuntimes: {
      'native-windows': 'unsupported',
      wsl2: 'preferred',
      linux: 'supported',
      docker: 'supported',
      auto: 'preferred',
    },
    installGuide: 'Use OpenROAD inside WSL2 Ubuntu or Docker.',
  },
  {
    id: 'klayout',
    name: 'KLayout Layout Viewer',
    category: 'physical',
    binaryName: 'klayout',
    versionFlag: '-v',
    supportedRuntimes: {
      'native-windows': 'supported',
      wsl2: 'supported',
      linux: 'supported',
      docker: 'supported',
      auto: 'supported',
    },
    installGuide: 'Download KLayout standalone binary.',
  },
  {
    id: 'ollama',
    name: 'Ollama AI Backend',
    category: 'ai',
    binaryName: 'ollama',
    versionFlag: '--version',
    supportedRuntimes: {
      'native-windows': 'supported',
      wsl2: 'supported',
      linux: 'supported',
      docker: 'supported',
      auto: 'supported',
    },
    installGuide: 'Install Ollama desktop app or CLI.',
  },
];

export class ToolRegistry {
  private tools: Map<string, ToolDefinition> = new Map();

  constructor(customTools: ToolDefinition[] = BUILTIN_TOOLS) {
    for (const tool of customTools) {
      this.tools.set(tool.id, tool);
    }
  }

  registerTool(tool: ToolDefinition): void {
    this.tools.set(tool.id, tool);
  }

  getTool(id: string): ToolDefinition | undefined {
    return this.tools.get(id);
  }

  getAllTools(): ToolDefinition[] {
    return Array.from(this.tools.values());
  }

  getToolsByCategory(category: ToolDefinition['category']): ToolDefinition[] {
    return this.getAllTools().filter((t) => t.category === category);
  }
}
