import { describe, expect, it } from 'vitest';
import { SiliconStudioApp } from '../src/app.js';

describe('Silicon Studio App Renderer Logic', () => {
  it('switches tabs, parses supplied HDL, builds diagrams, and constructs context', async () => {
    const app = new SiliconStudioApp({ modelProviders: [] });
    expect(app.getActiveTab()).toBe('rtl');

    app.setActiveTab('block-diagram');
    expect(app.getActiveTab()).toBe('block-diagram');

    await app.openFile('virtual/counter.sv', `
      module counter(input logic clk, input logic rst_n, output logic [7:0] count);
        always_ff @(posedge clk or negedge rst_n) begin
          if (!rst_n) count <= '0;
          else count <= count + 1'b1;
        end
      endmodule
    `);

    const diagram = await app.getBlockDiagram();
    expect(diagram.nodes.length).toBeGreaterThan(0);

    const wave = app.getWaveform();
    expect(wave.signals).toEqual([]);

    const prompt = app.getPromptContext();
    expect(prompt).toContain('virtual/counter.sv');
    expect(prompt).toContain('counter');
  });

  it('fails clearly when opening a missing file without supplied content', async () => {
    const app = new SiliconStudioApp({ modelProviders: [] });
    await expect(app.openFile('does/not/exist.sv')).rejects.toThrow(/HDL file not found/);
  });

  it('exposes advanced engineering features through the cockpit API', async () => {
    const app = new SiliconStudioApp({ modelProviders: [] });
    await app.openFile('virtual/top.sv', 'module top(input logic clk, output logic done); assign done = clk; endmodule', 'top');

    const health = app.getDesignHealth({
      compile: 'pass', lint: 'pass', simulation: 'pass', assertions: 'pass', coveragePercent: 93,
    });
    expect(health.score).toBeGreaterThan(80);

    const trace = app.analyzeTraceability([{ id: 'REQ-1', text: 'done follows clk', implementation: ['top.sv'], tests: ['top_tb'], assertions: ['done_a'] }]);
    expect(trace[0].status).toBe('verified');

    const formal = app.generateFormalProperty('eventual-response', { request: 'req', response: 'ack', maxCycles: 4 });
    expect(formal.sva).toContain('##[1:4] ack');

    const plan = await app.generateVerificationPlan();
    expect(plan.some((item) => item.includes('Output done'))).toBe(true);
  });
});
