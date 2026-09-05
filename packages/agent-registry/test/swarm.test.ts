import { describe, it, expect } from 'vitest';
import { SiliconAgentCatalog, NineAgentTimingClosureSwarm } from '../src/index.js';

describe('Silicon Squad Agent Registry & 9-Agent Swarm', () => {
  it('lists registered agents across domain squads', () => {
    const catalog = new SiliconAgentCatalog();
    const agents = catalog.listAgents();
    expect(agents.length).toBeGreaterThanOrEqual(8);

    const rtlAgents = catalog.listAgents('rtl');
    expect(rtlAgents.some((a) => a.id === 'rtl.coder')).toBe(true);
  });

  it('executes end-to-end 9-agent timing closure ECO swarm scenario', async () => {
    const swarm = new NineAgentTimingClosureSwarm();
    const result = await swarm.runTimingClosureScenario();

    expect(result.success).toBe(true);
    expect(result.initialWnsNs).toBe(-0.220);
    expect(result.finalWnsNs).toBeGreaterThan(0);
    expect(result.steps.length).toBeGreaterThanOrEqual(10);
    expect(result.evidenceBundlePath).toContain('signoff_evidence');
  });
});
