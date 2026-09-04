import { describe, expect, it } from 'vitest';
import { AgentToolGateway } from '../src/index.js';

describe('Agent Tool Gateway contract', () => {
  it('lists the silicon engineering tool surface with required schemas', () => {
    const gateway = new AgentToolGateway();
    const tools = gateway.getAvailableTools();
    expect(tools.length).toBeGreaterThanOrEqual(15);

    const simulation = tools.find((tool) => tool.name === 'run_simulation');
    expect(simulation?.parameters.required).toEqual(['topModule', 'files']);
    expect(simulation?.description).toContain('same backend');

    const synthesis = tools.find((tool) => tool.name === 'run_synthesis');
    expect(synthesis?.parameters.required).toEqual(['topModule', 'files']);

    const patch = tools.find((tool) => tool.name === 'apply_patch');
    expect(patch?.requiresApproval).toBe(true);
  });

  it('fails unknown tools rather than reporting simulated success', async () => {
    const result = await new AgentToolGateway().executeTool('nonexistent_eda_tool', {});
    expect(result).toMatchObject({ success: false, output: null });
    expect(result.error).toMatch(/Unknown tool/);
  });
});
