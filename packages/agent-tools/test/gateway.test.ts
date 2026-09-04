import { describe, it, expect } from 'vitest';
import { AgentToolGateway } from '../src/index.js';

describe('Agent Tool Gateway', () => {
  it('lists available agent tools and executes simulation/synthesis tools', async () => {
    const gateway = new AgentToolGateway();
    const tools = gateway.getAvailableTools();
    expect(tools.length).toBeGreaterThanOrEqual(4);

    const simRes = await gateway.executeTool('run_simulation', { testName: 'tb_counter' });
    expect(simRes.success).toBe(true);
    expect(simRes.output).toContain('tb_counter');

    const synthRes = await gateway.executeTool('run_synthesis', { topModule: 'counter' });
    expect(synthRes.success).toBe(true);
    expect(synthRes.output).toContain('Yosys synthesis');
  });
});
