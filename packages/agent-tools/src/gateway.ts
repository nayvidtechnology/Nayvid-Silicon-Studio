import * as fs from 'fs';
import * as path from 'path';
import { ExecutionRuntimeManager, type RuntimeType } from '@nayvid/execution-runtime';
import { SlangAdapter } from '@nayvid/hdl-language';
import { VeriVisualEngine } from '@nayvid/verivisual';
import { ToolRegistry } from '@nayvid/tool-registry';
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
  runtimeUsed?: RuntimeType;
  exitCode?: number;
}

export interface AgentToolGatewayOptions {
  workspaceRoot?: string;
  preferredRuntime?: RuntimeType;
}

function walkFiles(root: string, acc: string[] = []): string[] {
  if (!fs.existsSync(root)) return acc;
  const stat = fs.statSync(root);
  if (stat.isFile()) {
    acc.push(root);
    return acc;
  }
  for (const entry of fs.readdirSync(root)) {
    if (['node_modules', '.git', 'dist', 'build', 'release'].includes(entry)) continue;
    walkFiles(path.join(root, entry), acc);
  }
  return acc;
}

export class AgentToolGateway {
  private slang = new SlangAdapter();
  private verivisual = new VeriVisualEngine();
  private registry = new ToolRegistry();
  private workspaceRoot: string;
  private preferredRuntime: RuntimeType;

  constructor(
    private runtimeManager: ExecutionRuntimeManager = new ExecutionRuntimeManager(),
    options: AgentToolGatewayOptions = {}
  ) {
    this.workspaceRoot = path.resolve(options.workspaceRoot ?? process.cwd());
    this.preferredRuntime = options.preferredRuntime ?? 'auto';
  }

  private resolveWorkspacePath(input: string): string {
    const candidate = path.resolve(this.workspaceRoot, input);
    const relative = path.relative(this.workspaceRoot, candidate);
    if (relative.startsWith('..') || path.isAbsolute(relative)) {
      throw new Error(`Path '${input}' escapes workspace root.`);
    }
    return candidate;
  }

  private async executeRegisteredTool(toolId: string, args: string[], cwd?: string): Promise<ToolResult> {
    const tool = this.registry.getTool(toolId);
    if (!tool) return { success: false, output: null, error: `Tool '${toolId}' is not registered.` };

    try {
      const backend = await this.runtimeManager.resolveBestBackendFor(tool.supportedRuntimes, this.preferredRuntime);
      const res = await backend.execute(tool.binaryName, args, { cwd, timeoutMs: 120000 });
      return {
        success: res.code === 0,
        output: (res.stdout || res.stderr).trim(),
        error: res.code === 0 ? undefined : (res.stderr || res.stdout || `${tool.binaryName} exited ${res.code}`).trim(),
        runtimeUsed: backend.type,
        exitCode: res.code,
      };
    } catch (err: any) {
      return { success: false, output: null, error: err?.message || String(err) };
    }
  }

  getAvailableTools(): ToolDefinitionSpec[] {
    return [
      { name: 'read_file', description: 'Read source code, specification or log file content', parameters: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] } },
      { name: 'search_files', description: 'Search for text pattern in workspace files', parameters: { type: 'object', properties: { query: { type: 'string' }, path: { type: 'string' } }, required: ['query'] } },
      { name: 'inspect_module', description: 'Inspect extracted module hierarchy, ports, and registers from DesignGraph', parameters: { type: 'object', properties: { moduleName: { type: 'string' }, path: { type: 'string' } }, required: ['moduleName', 'path'] } },
      { name: 'inspect_signal', description: 'Get deep signal intelligence (drivers, loads, expression, waveform state)', parameters: { type: 'object', properties: { signalName: { type: 'string' }, path: { type: 'string' }, waveformPath: { type: 'string' }, atTimeNs: { type: 'number' } }, required: ['signalName', 'path'] } },
      { name: 'find_driver', description: 'Find source locations driving the given signal', parameters: { type: 'object', properties: { signalName: { type: 'string' }, path: { type: 'string' } }, required: ['signalName', 'path'] } },
      { name: 'find_loads', description: 'Find source locations consuming the given signal', parameters: { type: 'object', properties: { signalName: { type: 'string' }, path: { type: 'string' } }, required: ['signalName', 'path'] } },
      { name: 'run_lint', description: 'Run Verible lint when available; otherwise use Nayvid structural lint', parameters: { type: 'object', properties: { files: { type: 'array', items: { type: 'string' } } }, required: ['files'] } },
      { name: 'run_compile', description: 'Compile/lint SystemVerilog using Verilator', parameters: { type: 'object', properties: { topModule: { type: 'string' }, files: { type: 'array', items: { type: 'string' } } }, required: ['topModule', 'files'] } },
      { name: 'run_synthesis', description: 'Execute Yosys synthesis and return real tool output', parameters: { type: 'object', properties: { topModule: { type: 'string' }, files: { type: 'array', items: { type: 'string' } } }, required: ['topModule', 'files'] } },
      { name: 'run_test', description: 'Execute a named verification command without a shell', parameters: { type: 'object', properties: { command: { type: 'string' }, args: { type: 'array', items: { type: 'string' } }, cwd: { type: 'string' } }, required: ['command'] }, requiresApproval: true },
      { name: 'run_simulation', description: 'Compile SystemVerilog testbench using Icarus and execute with vvp', parameters: { type: 'object', properties: { topModule: { type: 'string' }, files: { type: 'array', items: { type: 'string' } }, output: { type: 'string' } }, required: ['topModule', 'files'] } },
      { name: 'read_waveform', description: 'Read and parse a VCD simulation waveform file', parameters: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] } },
      { name: 'apply_patch', description: 'Apply exact search-and-replace modification to a file', parameters: { type: 'object', properties: { path: { type: 'string' }, search: { type: 'string' }, replace: { type: 'string' } }, required: ['path', 'search', 'replace'] }, requiresApproval: true },
      { name: 'git_diff', description: 'Show the actual git diff for workspace/path', parameters: { type: 'object', properties: { path: { type: 'string' } } } },
      { name: 'delete_file', description: 'Delete a workspace file', parameters: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] }, requiresApproval: true },
      { name: 'run_external_command', description: 'Run an external executable without shell interpolation', parameters: { type: 'object', properties: { command: { type: 'string' }, args: { type: 'array', items: { type: 'string' } }, cwd: { type: 'string' } }, required: ['command'] }, requiresApproval: true },
    ];
  }

  async executeTool(name: string, args: Record<string, any>, approved: boolean = false): Promise<ToolResult> {
    const spec = this.getAvailableTools().find((t) => t.name === name);
    if (!spec) return { success: false, output: null, error: `Unknown tool: ${name}` };
    if (spec.requiresApproval && !approved) {
      return { success: false, requiresApproval: true, output: null, error: `Tool '${name}' requires user approval before execution.` };
    }

    try {
      switch (name) {
        case 'read_file': {
          const filePath = this.resolveWorkspacePath(args.path);
          if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) return { success: false, output: null, error: `File not found: ${args.path}` };
          return { success: true, output: fs.readFileSync(filePath, 'utf-8') };
        }
        case 'search_files': {
          const root = this.resolveWorkspacePath(args.path || '.');
          const query = String(args.query);
          const matches: Array<{ path: string; line: number; text: string }> = [];
          for (const file of walkFiles(root)) {
            let text: string;
            try { text = fs.readFileSync(file, 'utf-8'); } catch { continue; }
            text.split(/\r?\n/).forEach((line, index) => {
              if (line.includes(query) && matches.length < 200) matches.push({ path: path.relative(this.workspaceRoot, file), line: index + 1, text: line.trim() });
            });
            if (matches.length >= 200) break;
          }
          return { success: true, output: matches };
        }
        case 'inspect_module': {
          const filePath = this.resolveWorkspacePath(args.path);
          const graph = await this.slang.parseToIR([filePath], args.moduleName);
          const mod = graph.modules[args.moduleName];
          if (!mod) return { success: false, output: null, error: `Module '${args.moduleName}' not found in IR.` };
          return { success: true, output: { module: mod.name, ports: mod.ports, signals: mod.signals, instances: mod.instances, fsms: mod.fsms, clockDomains: mod.clockDomains, resetDomains: mod.resetDomains } };
        }
        case 'inspect_signal': {
          const filePath = this.resolveWorkspacePath(args.path);
          const graph = await this.slang.parseToIR([filePath]);
          let wave;
          if (args.waveformPath) {
            const wavePath = this.resolveWorkspacePath(args.waveformPath);
            if (fs.existsSync(wavePath)) wave = this.verivisual.parseVcd(fs.readFileSync(wavePath, 'utf-8'));
          }
          return { success: true, output: this.verivisual.getSignalContext(args.signalName, graph, wave, args.atTimeNs) };
        }
        case 'find_driver':
        case 'find_loads': {
          const filePath = this.resolveWorkspacePath(args.path);
          const graph = await this.slang.parseToIR([filePath]);
          const context = this.verivisual.getSignalContext(args.signalName, graph);
          return { success: true, output: name === 'find_driver' ? context.drivers : context.loads };
        }
        case 'run_lint': {
          const files = (args.files as string[]).map((f) => this.resolveWorkspacePath(f));
          const realLint = await this.executeRegisteredTool('verible', files);
          if (realLint.success || !/No available execution backend|not registered|ENOENT|not found/i.test(realLint.error || '')) return realLint;
          return { success: true, output: await this.slang.runLint(files) };
        }
        case 'run_compile': {
          const files = (args.files as string[]).map((f) => this.resolveWorkspacePath(f));
          return this.executeRegisteredTool('verilator', ['--lint-only', '--top-module', args.topModule, ...files], this.workspaceRoot);
        }
        case 'run_synthesis': {
          const files = (args.files as string[]).map((f) => this.resolveWorkspacePath(f));
          const script = `read_verilog -sv ${files.map((f) => `\"${f.replace(/\\/g, '/')}\"`).join(' ')}; hierarchy -check -top ${args.topModule}; proc; opt; stat`;
          return this.executeRegisteredTool('yosys', ['-p', script], this.workspaceRoot);
        }
        case 'run_test':
        case 'run_external_command': {
          const backend = await this.runtimeManager.resolveBestBackend(this.preferredRuntime);
          const cwd = args.cwd ? this.resolveWorkspacePath(args.cwd) : this.workspaceRoot;
          const result = await backend.execute(args.command, args.args || [], { cwd, timeoutMs: 120000 });
          return { success: result.code === 0, output: result.stdout, error: result.code === 0 ? undefined : result.stderr, runtimeUsed: backend.type, exitCode: result.code };
        }
        case 'run_simulation': {
          const files = (args.files as string[]).map((f) => this.resolveWorkspacePath(f));
          const output = this.resolveWorkspacePath(args.output || '.nayvid/sim/sim.out');
          fs.mkdirSync(path.dirname(output), { recursive: true });
          const compile = await this.executeRegisteredTool('iverilog', ['-g2012', '-s', args.topModule, '-o', output, ...files], this.workspaceRoot);
          if (!compile.success) return compile;
          const backend = await this.runtimeManager.resolveBestBackend(this.preferredRuntime);
          const run = await backend.execute('vvp', [output], { cwd: this.workspaceRoot, timeoutMs: 120000 });
          return { success: run.code === 0, output: run.stdout, error: run.code === 0 ? undefined : run.stderr, runtimeUsed: backend.type, exitCode: run.code };
        }
        case 'read_waveform': {
          const filePath = this.resolveWorkspacePath(args.path);
          if (!fs.existsSync(filePath)) return { success: false, output: null, error: `Waveform not found: ${args.path}` };
          return { success: true, output: this.verivisual.parseVcd(fs.readFileSync(filePath, 'utf-8')) };
        }
        case 'apply_patch': {
          const filePath = this.resolveWorkspacePath(args.path);
          if (!fs.existsSync(filePath)) return { success: false, output: null, error: `File not found: ${args.path}` };
          const text = fs.readFileSync(filePath, 'utf-8');
          if (!text.includes(args.search)) return { success: false, output: null, error: 'Patch search text was not found; file was not modified.' };
          fs.writeFileSync(filePath, text.replace(args.search, args.replace), 'utf-8');
          return { success: true, output: `Patch applied to ${args.path}` };
        }
        case 'git_diff': {
          const backend = await this.runtimeManager.resolveBestBackend(this.preferredRuntime);
          const diffArgs = ['diff', '--', ...(args.path ? [args.path] : [])];
          const result = await backend.execute('git', diffArgs, { cwd: this.workspaceRoot, timeoutMs: 30000 });
          return { success: result.code === 0, output: result.stdout, error: result.code === 0 ? undefined : result.stderr, runtimeUsed: backend.type, exitCode: result.code };
        }
        case 'delete_file': {
          const filePath = this.resolveWorkspacePath(args.path);
          if (!fs.existsSync(filePath)) return { success: false, output: null, error: `File not found: ${args.path}` };
          fs.unlinkSync(filePath);
          return { success: true, output: `Deleted ${args.path}` };
        }
        default:
          return { success: false, output: null, error: `Unknown tool: ${name}` };
      }
    } catch (err: any) {
      return { success: false, output: null, error: err?.message || String(err) };
    }
  }
}
