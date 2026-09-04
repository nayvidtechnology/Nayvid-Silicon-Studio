import { describe, it, expect } from 'vitest';
import { AgentToolGateway } from '../src/index.js';

describe('AgentToolGateway Silicon Engineering Tools', () => {
  it('exposes comprehensive silicon engineering tools', () => {
    const gateway = new AgentToolGateway();
    const tools = gateway.getAvailableTools();

    expect(tools.length).toBeGreaterThanOrEqual(15);
    expect(tools.some((t) => t.name === 'inspect_module')).toBe(true);
    expect(tools.some((t) => t.name === 'inspect_signal')).toBe(true);
    expect(tools.some((t) => t.name === 'run_simulation')).toBe(true);
    expect(tools.some((t) => t.name === 'read_waveform')).toBe(true);
    expect(tools.some((t) => t.name === 'apply_patch')).toBe(true);
    expect(tools.some((t) => t.name === 'run_synthesis')).toBe(true);
    expect(tools.some((t) => t.name === 'git_diff')).toBe(true);
  });

  it('enforces approval guardrails on modifying/destructive and arbitrary execution tools', async () => {
    const gateway = new AgentToolGateway();

    for (const [name, args] of [
      ['apply_patch', { path: 'rtl/counter.sv', search: "8'hFF", replace: "8'h7F" }],
      ['delete_file', { path: 'rtl/counter.sv' }],
      ['run_external_command', { command: 'echo', args: ['hello'] }],
      ['run_test', { command: 'echo', args: ['test'] }],
    ] as const) {
      const result = await gateway.executeTool(name, args);
      expect(result.success).toBe(false);
      expect(result.requiresApproval).toBe(true);
    }
  });
});
