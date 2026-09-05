import { describe, it, expect } from 'vitest';
import { UniversalToolBus } from '../src/index.js';

describe('UniversalToolBus', () => {
  it('dispatches synthesis intent to Yosys adapter', async () => {
    const bus = new UniversalToolBus();
    const result = await bus.dispatchIntent('synthesize', {
      topModule: 'counter',
      files: ['counter.sv'],
    }, 'yosys');

    expect(result.success).toBe(true);
    expect(result.toolUsed).toContain('Yosys');
    expect(result.metrics?.areaUm2).toBeGreaterThan(0);
  });

  it('dispatches STA intent to OpenSTA', async () => {
    const bus = new UniversalToolBus();
    const result = await bus.dispatchIntent('run_sta', {
      topModule: 'counter',
      netlistPath: 'counter_synth.v',
      sdcPath: 'counter.sdc',
    }, 'opensta');

    expect(result.success).toBe(true);
    expect(result.toolUsed).toContain('OpenSTA');
    expect(result.metrics?.wnsNs).toBe(0.018);
  });

  it('dispatches P&R intent to OpenROAD', async () => {
    const bus = new UniversalToolBus();
    const result = await bus.dispatchIntent('place_route', {
      topModule: 'counter',
      netlistPath: 'counter_synth.v',
      sdcPath: 'counter.sdc',
    }, 'openroad');

    expect(result.success).toBe(true);
    expect(result.toolUsed).toContain('OpenROAD');
    expect(result.artifactsGenerated).toContain('counter.gds');
  });
});
