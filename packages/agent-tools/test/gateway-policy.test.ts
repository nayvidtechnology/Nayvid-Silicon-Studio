import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { AgentToolGateway } from '../src/index.js';
import { ExecutionRuntimeManager, type ExecutionBackend, type ExecOptions } from '@nayvid/execution-runtime';
import { createProjectToolRegistry } from '@nayvid/tool-registry';

class FakeBackend implements ExecutionBackend {
  readonly type = 'linux' as const;
  lastOptions?: ExecOptions;
  lastCommand?: string;
  lastArgs?: string[];
  async isAvailable() { return true; }
  toHostPath(value: string) { return value; }
  toGuestPath(value: string) { return value; }
  async execute(command: string, args: string[], options?: ExecOptions) {
    this.lastCommand = command;
    this.lastArgs = args;
    this.lastOptions = options;
    return { code: 0, stdout: 'ok', stderr: '', durationMs: 1 };
  }
}

function workspace(): string { return fs.mkdtempSync(path.join(os.tmpdir(), 'nayvid-policy-')); }

describe('AgentToolGateway production execution policy', () => {
  it('blocks an execution backend not allowed by the project', async () => {
    const backend = new FakeBackend();
    const gateway = new AgentToolGateway(new ExecutionRuntimeManager([backend]), { workspaceRoot: workspace(), allowedRuntimes: ['docker'] });
    const result = await gateway.executeTool('run_external_command', { command: 'git', args: ['status'] }, true);
    expect(result.success).toBe(false);
    expect(result.error).toContain('blocked by project policy');
  });

  it('enforces an external executable allowlist even after user approval', async () => {
    const backend = new FakeBackend();
    const gateway = new AgentToolGateway(new ExecutionRuntimeManager([backend]), { workspaceRoot: workspace(), allowedRuntimes: ['linux'], externalCommandAllowlist: ['git'] });
    const denied = await gateway.executeTool('run_external_command', { command: 'bash', args: ['-c', 'echo unsafe'] }, true);
    expect(denied.success).toBe(false);
    expect(denied.error).toContain('blocked by project policy');
    const allowed = await gateway.executeTool('run_external_command', { command: 'git', args: ['status'] }, true);
    expect(allowed.success).toBe(true);
  });

  it('caps execution timeouts to a production policy', async () => {
    const backend = new FakeBackend();
    const gateway = new AgentToolGateway(new ExecutionRuntimeManager([backend]), { workspaceRoot: workspace(), allowedRuntimes: ['linux'], externalCommandAllowlist: ['git'], maxTimeoutMs: 5000 });
    await gateway.executeTool('run_external_command', { command: 'git', args: ['status'] }, true);
    expect(backend.lastOptions?.timeoutMs).toBe(5000);
  });

  it('runs only project-declared registered EDA binaries and still requires approval', async () => {
    const backend = new FakeBackend();
    const registry = createProjectToolRegistry(['synopsys-vcs']);
    const gateway = new AgentToolGateway(new ExecutionRuntimeManager([backend]), {
      workspaceRoot: workspace(),
      allowedRuntimes: ['linux'],
      registry,
    });

    const needsApproval = await gateway.executeTool('run_eda_tool', { toolId: 'synopsys-vcs', args: ['-full64'] });
    expect(needsApproval.requiresApproval).toBe(true);

    const allowed = await gateway.executeTool('run_eda_tool', { toolId: 'synopsys-vcs', args: ['-full64'] }, true);
    expect(allowed.success).toBe(true);
    expect(backend.lastCommand).toBe('vcs');
    expect(backend.lastArgs).toEqual(['-full64']);

    const undeclared = await gateway.executeTool('run_eda_tool', { toolId: 'cadence-xcelium', args: [] }, true);
    expect(undeclared.success).toBe(false);
    expect(undeclared.error).toContain('not enabled');
  });
});
