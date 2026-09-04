import { describe, it, expect } from 'vitest';
import { VeriVisualEngine } from '../src/index.js';
import type { DesignGraph } from '@nayvid/design-ir';

describe('VeriVisual Engine', () => {
  it('generates block diagram from DesignGraph IR', () => {
    const engine = new VeriVisualEngine();
    const graph: DesignGraph = {
      topModule: 'counter',
      modules: {
        counter: {
          name: 'counter',
          file: 'counter.sv',
          ports: [
            { name: 'clk', direction: 'input', width: 1 },
            { name: 'out', direction: 'output', width: 8 },
          ],
          signals: [],
          instances: [{ name: 'sub_inst', moduleName: 'sub_mod', portConnections: {} }],
          fsms: [],
          clockDomains: ['clk'],
          resetDomains: [],
        },
      },
    };

    const diagram = engine.generateBlockDiagram(graph, 'counter');
    expect(diagram.nodes.length).toBe(4);
    expect(diagram.edges.length).toBe(3);
  });

  it('parses VCD waveform into WaveformModel', () => {
    const engine = new VeriVisualEngine();
    const wave = engine.parseVcdSimple('$var wire 1 ! clk $end');
    expect(wave.signals.length).toBeGreaterThan(0);
    expect(wave.timescale).toBe('1ns');
  });
});
