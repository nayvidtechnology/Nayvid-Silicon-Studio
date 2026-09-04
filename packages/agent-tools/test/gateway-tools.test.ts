import { describe, it, expect } from 'vitest';
import { AgentToolGateway } from '../src/index.js';

describe('AgentToolGateway Silicon Engineering Tools', () => {
  it('exposes comprehensive silicon engineering tools', () => {
    const gateway = new AgentToolGateway();
    const tools = gateway.getAvailableTools();

    expect(tools.length).toBeGreaterThanOrEqual(10);
    expect(tools.some((t) => t.name === 'inspect_module')).toBe(true);
    expect(tools.some((t) => t.name === 'inspect_signal')).toBe(true);
    expect(tools.some((t) => t.name === 'run_simulation')).toBe(true);
    expect(tools.some((t) => t.name === 'read_waveform')).toBe(true);
    expect(tools.some((t) => t.name === 'apply_patch')).toBe(true);
  });

  it('enforces approval guardrails on modifying/destructive tools', async () => {
    const gateway = new AgentToolGateway();

    const resUnapproved = await gateway.executeTool('apply_patch', {
      path: 'rtl/counter.sv',
      search: '8\'hFF',
      replace: '8\'h7F',
    });

    expect(resUnapproved.success).toBe(false);
    expect(resUnapproved.requiresApproval).toBe(true);

    const resApproved = await gateway.executeTool(
      'apply_patch',
      { path: 'rtl/counter.sv', search: '8\'hFF', replace: '8\'h7F' },
      true
    );

    expect(resApproved.success).toBe(true);
  });
});
