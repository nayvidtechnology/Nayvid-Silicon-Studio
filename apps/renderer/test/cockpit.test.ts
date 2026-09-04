import { describe, expect, it } from 'vitest';
import { SiliconStudioApp } from '../src/app.js';
import type { ModelProvider, ModelMessage, ModelResponse } from '@nayvid/model-providers';
import type { ToolResult } from '@nayvid/agent-tools';

class FakeProvider implements ModelProvider {
  id = 'fake-local';
  name = 'Fake Local';
  isLocal = true;
  supportsVision = false;
  async listModels(): Promise<string[]> { return ['fake-model']; }
  async chat(messages: ModelMessage[]): Promise<ModelResponse> {
    const last = messages[messages.length - 1]?.content || '';
    return { message: { role: 'assistant', content: `NAVI answer for: ${last}` } };
  }
}

class FakeGateway {
  async executeTool(name: string, _args: Record<string, any>, _approved?: boolean): Promise<ToolResult> {
    if (name === 'run_simulation') return { success: true, output: 'simulation passed' };
    if (name === 'read_waveform') {
      return {
        success: true,
        output: {
          timescale: '1ns',
          startTimeNs: 0,
          endTimeNs: 20,
          signals: [
            { name: 'clk', fullName: 'counter.clk', width: 1, type: 'wire', wave: [{ timeNs: 0, value: 0 }, { timeNs: 5, value: 1 }] },
            { name: 'count', fullName: 'counter.count', width: 8, type: 'reg', wave: [{ timeNs: 0, value: 0 }, { timeNs: 10, value: 1 }] },
          ],
        },
      };
    }
    return { success: false, output: null, error: `unexpected tool ${name}` };
  }
}

describe('SiliconStudioApp Interactive Cockpit Integration', () => {
  it('initializes identity, branding, tabs, and subsystem icons', () => {
    const app = new SiliconStudioApp({ modelProviders: [] });
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

  it('runs end-to-end cockpit workflow with deterministic injected simulator and NAVI provider', async () => {
    const app = new SiliconStudioApp({
      agentGateway: new FakeGateway(),
      modelProviders: [new FakeProvider()],
    });

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
        assign done = &count;
      endmodule
    `;

    const graph = await app.openFile('virtual/counter.sv', sampleSV, 'counter');
    expect(graph.topModule).toBe('counter');

    const nav = await app.getDesignNavigator();
    expect(nav.topModule).toBe('counter');
    expect(nav.modules.counter.inputs.length).toBe(3);
    expect(nav.modules.counter.outputs.length).toBe(2);

    const wave = await app.runSimulation({
      topModule: 'counter',
      files: ['virtual/counter.sv'],
      waveformPath: 'sim.vcd',
    });
    expect(wave.signals.length).toBe(2);

    const context = await app.inspectSignal('count', 10);
    expect(context.signalName).toBe('count');
    expect(context.drivers.length).toBeGreaterThan(0);
    expect(context.waveformValueAtTime).toBe(1);

    app.setPrivacyPolicy('local-only');
    const naviRes = await app.askNavi('Why is count staying low?', 'waveform-debugger');
    expect(naviRes.answer).toContain('Why is count staying low?');
    expect(naviRes.providerId).toBe('fake-local');
    expect(naviRes.timeline.length).toBeGreaterThan(0);
  });

  it('propagates simulation failures instead of producing fake waveforms', async () => {
    const failingGateway = {
      async executeTool(): Promise<ToolResult> {
        return { success: false, output: null, error: 'iverilog not installed' };
      },
    };
    const app = new SiliconStudioApp({ agentGateway: failingGateway, modelProviders: [] });
    await app.openFile('virtual/top.sv', 'module top; endmodule', 'top');

    await expect(app.runSimulation({ topModule: 'top', files: ['virtual/top.sv'], waveformPath: 'sim.vcd' }))
      .rejects.toThrow(/iverilog not installed/);
    expect(app.getWaveform().signals).toEqual([]);
  });
});
