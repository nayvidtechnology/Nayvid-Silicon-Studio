import { describe, it, expect } from 'vitest';
import { SiliconStudioApp } from '../src/app.js';

describe('SiliconStudioApp Interactive Cockpit Integration', () => {
  it('initializes identity, branding, tabs, and subsystem icons', () => {
    const app = new SiliconStudioApp();
    const identity = app.getIdentity();

    expect(identity.appName).toBe('Nayvid Silicon Studio');
    expect(identity.tagline).toContain('Build Silicon');
    expect(identity.icons.SiliconStudio).toBeDefined();
    expect(identity.icons.VeriVisual).toBeDefined();
    expect(identity.icons.NAVI).toBeDefined();

    expect(app.getActiveTab()).toBe('rtl');
    app.setActiveTab('waveform');
    expect(app.getActiveTab()).toBe('waveform');
  });

  it('runs end-to-end cockpit workflow: open SV file -> parse IR -> simulation -> signal inspection -> NAVI query', async () => {
    const app = new SiliconStudioApp();

    const sampleSV = `
      module counter (
        input logic clk,
        input logic rst_n,
        input logic enable,
        output logic [7:0] count,
        output logic done
      );
        always_ff @(posedge clk or negedge rst_n) begin
          if (!rst_n) count <= '0;
          else if (enable) count <= count + 1;
        end
      endmodule
    `;

    const graph = await app.openFile('rtl/counter.sv', sampleSV);
    expect(graph.topModule).toBe('counter');

    const nav = await app.getDesignNavigator();
    expect(nav.topModule).toBe('counter');
    expect(nav.modules['counter'].inputs.length).toBe(3);
    expect(nav.modules['counter'].outputs.length).toBe(2);

    const wave = await app.runSimulation('tb_counter');
    expect(wave.signals.length).toBeGreaterThan(0);

    const context = await app.inspectSignal('count', 10);
    expect(context.signalName).toBe('count');
    expect(context.drivers.length).toBeGreaterThan(0);

    const naviRes = await app.askNavi('Why is count staying low?', 'waveform-debugger');
    expect(naviRes.answer).toBeDefined();
    expect(naviRes.timeline.length).toBeGreaterThan(0);
  });
});
