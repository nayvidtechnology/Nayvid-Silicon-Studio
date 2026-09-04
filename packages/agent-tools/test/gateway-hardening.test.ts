import { afterEach, describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  ExecutionRuntimeManager,
  type ExecOptions,
  type ExecResult,
  type ExecutionBackend,
  type RuntimeType,
} from '@nayvid/execution-runtime';
import { AgentToolGateway } from '../src/index.js';

class FakeBackend implements ExecutionBackend {
  readonly type: RuntimeType = 'linux';
  calls: Array<{ command: string; args: string[]; options?: ExecOptions }> = [];
  async isAvailable(): Promise<boolean> { return true; }
  toHostPath(p: string): string { return p; }
  toGuestPath(p: string): string { return p; }
  async execute(command: string, args: string[], options?: ExecOptions): Promise<ExecResult> {
    this.calls.push({ command, args, options });
    if (command === 'verible-verilog-lint') return { code: 0, stdout: '', stderr: '', durationMs: 1 };
    if (command === 'verilator') return { code: 0, stdout: 'Verilator lint clean', stderr: '', durationMs: 2 };
    if (command === 'yosys') return { code: 0, stdout: '=== top ===\nNumber of cells: 10', stderr: '', durationMs: 3 };
    if (command === 'iverilog') return { code: 0, stdout: '', stderr: '', durationMs: 2 };
    if (command === 'vvp') return { code: 0, stdout: 'PASS', stderr: '', durationMs: 2 };
    if (command === 'git') return { code: 0, stdout: 'diff --git a/rtl/top.sv b/rtl/top.sv', stderr: '', durationMs: 1 };
    return { code: 0, stdout: 'ok', stderr: '', durationMs: 1 };
  }
}

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nayvid-agent-tools-'));
  roots.push(root);
  fs.mkdirSync(path.join(root, 'rtl'), { recursive: true });
  fs.writeFileSync(path.join(root, 'rtl', 'top.sv'), 'module top(input logic clk, output logic q); always_ff @(posedge clk) q <= ~q; endmodule\n');
  const backend = new FakeBackend();
  const manager = new ExecutionRuntimeManager([backend]);
  const gateway = new AgentToolGateway(manager, { workspaceRoot: root, preferredRuntime: 'linux' });
  return { root, backend, gateway };
}

describe('AgentToolGateway hardening', () => {
  it('returns a real error for missing files instead of fabricated content', async () => {
    const { gateway } = fixture();
    const result = await gateway.executeTool('read_file', { path: 'rtl/missing.sv' });
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/File not found/);
  });

  it('blocks traversal outside the workspace', async () => {
    const { gateway } = fixture();
    const result = await gateway.executeTool('read_file', { path: '../../etc/passwd' });
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/escapes workspace root/);
  });

  it('searches actual workspace content with line numbers', async () => {
    const { gateway } = fixture();
    const result = await gateway.executeTool('search_files', { query: 'always_ff', path: 'rtl' });
    expect(result.success).toBe(true);
    expect(result.output[0]).toMatchObject({ path: 'rtl/top.sv', line: 1 });
  });

  it('executes registered compile and synthesis tools through the runtime', async () => {
    const { gateway, backend } = fixture();
    const compile = await gateway.executeTool('run_compile', { topModule: 'top', files: ['rtl/top.sv'] });
    const synthesis = await gateway.executeTool('run_synthesis', { topModule: 'top', files: ['rtl/top.sv'] });

    expect(compile.success).toBe(true);
    expect(synthesis.success).toBe(true);
    expect(backend.calls.some((c) => c.command === 'verilator')).toBe(true);
    expect(backend.calls.some((c) => c.command === 'yosys')).toBe(true);
  });

  it('requires approval and exact search text before modifying a file', async () => {
    const { gateway, root } = fixture();
    const denied = await gateway.executeTool('apply_patch', { path: 'rtl/top.sv', search: '~q', replace: 'q' });
    expect(denied.requiresApproval).toBe(true);

    const miss = await gateway.executeTool('apply_patch', { path: 'rtl/top.sv', search: 'DOES_NOT_EXIST', replace: 'x' }, true);
    expect(miss.success).toBe(false);

    const applied = await gateway.executeTool('apply_patch', { path: 'rtl/top.sv', search: '~q', replace: 'q' }, true);
    expect(applied.success).toBe(true);
    expect(fs.readFileSync(path.join(root, 'rtl', 'top.sv'), 'utf-8')).toContain('q <= q');
  });
});
