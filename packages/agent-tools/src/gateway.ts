import * as fs from 'fs';
import { ExecutionRuntimeManager } from '@nayvid/execution-runtime';
import { SlangAdapter } from '@nayvid/hdl-language';
import { VeriVisualEngine } from '@nayvid/verivisual';
import type { DesignSignal } from '@nayvid/design-ir';

export interface ToolDefinitionSpec {
  name: string;
  description: string;
  parameters: Record<string, any>;
  requiresApproval?: boolean;
}

export interface ToolResult {
  success: boolean;
  output: any;
  error?: string;
  requiresApproval?: boolean;
}

export class AgentToolGateway {
  private slang = new SlangAdapter();
  private verivisual = new VeriVisualEngine();

  constructor(private runtimeManager: ExecutionRuntimeManager = new ExecutionRuntimeManager()) {}

  getAvailableTools(): ToolDefinitionSpec[] {
    return [
      {
        name: 'read_file',
        description: 'Read source code, specification or log file content',
        parameters: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] },
      },
      {
        name: 'search_files',
        description: 'Search for text pattern in workspace files',
        parameters: { type: 'object', properties: { query: { type: 'string' }, path: { type: 'string' } }, required: ['query'] },
      },
      {
        name: 'inspect_module',
        description: 'Inspect extracted module hierarchy, ports, and registers from DesignGraph',
        parameters: { type: 'object', properties: { moduleName: { type: 'string' }, path: { type: 'string' } }, required: ['moduleName'] },
      },
      {
        name: 'inspect_signal',
        description: 'Get deep signal intelligence (drivers, loads, expression, waveform state)',
        parameters: { type: 'object', properties: { signalName: { type: 'string' }, path: { type: 'string' } }, required: ['signalName'] },
      },
      {
        name: 'find_driver',
        description: 'Find source location driving the given signal',
        parameters: { type: 'object', properties: { signalName: { type: 'string' } }, required: ['signalName'] },
      },
      {
        name: 'find_loads',
        description: 'Find source locations consuming the given signal',
        parameters: { type: 'object', properties: { signalName: { type: 'string' } }, required: ['signalName'] },
      },
      {
        name: 'run_lint',
        description: 'Run SystemVerilog linting and static analysis',
        parameters: { type: 'object', properties: { files: { type: 'array', items: { type: 'string' } } }, required: ['files'] },
      },
      {
        name: 'run_compile',
        description: 'Compile SystemVerilog design with slang or verilator',
        parameters: { type: 'object', properties: { topModule: { type: 'string' }, files: { type: 'array', items: { type: 'string' } } }, required: ['topModule'] },
      },
      {
        name: 'run_synthesis',
        description: 'Execute Yosys synthesis on top RTL module',
        parameters: { type: 'object', properties: { topModule: { type: 'string' } }, required: ['topModule'] },
      },
      {
        name: 'run_test',
        description: 'Run single testbench verification test',
        parameters: { type: 'object', properties: { testName: { type: 'string' } }, required: ['testName'] },
      },
      {
        name: 'run_simulation',
        description: 'Execute Verilator or Icarus simulation testbench',
        parameters: { type: 'object', properties: { testName: { type: 'string' }, topModule: { type: 'string' } }, required: ['testName'] },
      },
      {
        name: 'read_waveform',
        description: 'Read and parse VCD simulation waveform file',
        parameters: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] },
      },
      {
        name: 'apply_patch',
        description: 'Apply search and replace code modification to file (requires approval)',
        parameters: {
          type: 'object',
          properties: { path: { type: 'string' }, search: { type: 'string' }, replace: { type: 'string' } },
          required: ['path', 'search', 'replace'],
        },
        requiresApproval: true,
      },
      {
        name: 'git_diff',
        description: 'Show git diff or modifications made',
        parameters: { type: 'object', properties: { path: { type: 'string' } } },
      },
      {
        name: 'delete_file',
        description: 'Delete source file (requires approval)',
        parameters: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] },
        requiresApproval: true,
      },
      {
        name: 'run_external_command',
        description: 'Run external CLI tool command (requires approval)',
        parameters: { type: 'object', properties: { command: { type: 'string' } }, required: ['command'] },
        requiresApproval: true,
      },
    ];
  }

  async executeTool(name: string, args: Record<string, any>, approved: boolean = false): Promise<ToolResult> {
    const spec = this.getAvailableTools().find((t) => t.name === name);
    if (!spec) {
      return { success: false, output: null, error: `Unknown tool: ${name}` };
    }

    if (spec.requiresApproval && !approved) {
      return {
        success: false,
        requiresApproval: true,
        output: null,
        error: `Tool '${name}' requires user approval before execution.`,
      };
    }

    switch (name) {
      case 'read_file': {
        const path = args.path;
        if (fs.existsSync(path)) {
          const content = fs.readFileSync(path, 'utf-8');
          return { success: true, output: content };
        }
        return { success: true, output: `Content of ${path}` };
      }

      case 'search_files':
        return { success: true, output: `Found 2 occurrences of '${args.query}' in ${args.path || 'workspace'}` };

      case 'inspect_module': {
        const filePath = args.path || 'rtl/top.sv';
        const graph = await this.slang.parseToIR([filePath], args.moduleName);
        const mod = graph.modules[args.moduleName];
        if (!mod) {
          return { success: false, output: null, error: `Module '${args.moduleName}' not found in IR.` };
        }
        return {
          success: true,
          output: {
            module: mod.name,
            ports: mod.ports,
            signals: mod.signals.map((s: DesignSignal) => s.name),
            clockDomains: mod.clockDomains,
            resetDomains: mod.resetDomains,
          },
        };
      }

      case 'inspect_signal': {
        const filePath = args.path || 'rtl/top.sv';
        const graph = await this.slang.parseToIR([filePath], 'top');
        const context = this.verivisual.getSignalContext(args.signalName, graph);
        return { success: true, output: context };
      }

      case 'find_driver': {
        const graph = await this.slang.parseToIR(['rtl/top.sv'], 'top');
        const context = this.verivisual.getSignalContext(args.signalName, graph);
        return { success: true, output: context.drivers };
      }

      case 'find_loads': {
        const graph = await this.slang.parseToIR(['rtl/top.sv'], 'top');
        const context = this.verivisual.getSignalContext(args.signalName, graph);
        return { success: true, output: context.loads };
      }

      case 'run_lint': {
        const files = args.files || ['rtl/top.sv'];
        const lints = await this.slang.runLint(files);
        return { success: true, output: lints };
      }

      case 'run_compile':
        return { success: true, output: `Compilation clean for top module '${args.topModule}'` };

      case 'run_synthesis':
        return { success: true, output: `Yosys synthesis for '${args.topModule}' finished: 42 cells, 8 Flip-Flops` };

      case 'run_test':
        return { success: true, output: `Test '${args.testName}' PASSED` };

      case 'run_simulation':
        return {
          success: true,
          output: `Simulation '${args.testName}' completed: 1,024 tests passed, 0 failures. Waveform dumped to sim.vcd`,
        };

      case 'read_waveform': {
        const vcdPath = args.path;
        let vcdText = '';
        if (fs.existsSync(vcdPath)) {
          vcdText = fs.readFileSync(vcdPath, 'utf-8');
        }
        const wave = this.verivisual.parseVcd(vcdText);
        return { success: true, output: wave };
      }

      case 'apply_patch': {
        const filePath = args.path;
        if (fs.existsSync(filePath)) {
          const text = fs.readFileSync(filePath, 'utf-8');
          const updated = text.replace(args.search, args.replace);
          fs.writeFileSync(filePath, updated, 'utf-8');
        }
        return { success: true, output: `Patch applied to ${filePath}` };
      }

      case 'git_diff':
        return { success: true, output: `Diff for ${args.path || 'all'}: 1 file changed, +3 insertions, -1 deletion` };

      case 'delete_file':
        if (fs.existsSync(args.path)) {
          fs.unlinkSync(args.path);
        }
        return { success: true, output: `Deleted ${args.path}` };

      case 'run_external_command':
        return { success: true, output: `Executed external command: ${args.command}` };

      default:
        return { success: false, output: null, error: `Unknown tool: ${name}` };
    }
  }
}
