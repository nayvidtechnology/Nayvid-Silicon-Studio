import { describe, it, expect } from 'vitest';
import { VeriVisualEngine, parseVcd, extractSignalIntelligence } from '../src/index.js';
import type { DesignGraph } from '@nayvid/design-ir';

describe('VeriVisual VCD Parser & Signal Intelligence', () => {
  it('parses VCD content into WaveformModel', () => {
    const vcd = `
$timescale 1ns $end
$scope module top $end
$var wire 1 ! clk $end
$var wire 1 " rst_n $end
$var wire 8 # count $end
$upscope $end
$enddefinitions $end
#0
0!
0"
b00000000 #
#10
1!
1"
b00000001 #
#20
0!
b00000010 #
    `;

    const model = parseVcd(vcd);
    expect(model.timescale).toBe('1ns');
    expect(model.signals.length).toBe(3);

    const clkSig = model.signals.find((s) => s.name === 'clk');
    expect(clkSig).toBeDefined();
    expect(clkSig?.wave.length).toBe(3);
    expect(clkSig?.wave[1].value).toBe(1);

    const countSig = model.signals.find((s) => s.name === 'count');
    expect(countSig).toBeDefined();
    expect(countSig?.wave[2].value).toBe(2);
  });

  it('extracts signal intelligence context for a given signal', () => {
    const graph: DesignGraph = {
      topModule: 'counter',
      modules: {
        counter: {
          name: 'counter',
          file: 'rtl/counter.sv',
          ports: [
            { name: 'clk', direction: 'input', width: 1, location: { file: 'rtl/counter.sv', line: 5 } },
            { name: 'done', direction: 'output', width: 1, location: { file: 'rtl/counter.sv', line: 9 } },
          ],
          signals: [
            {
              name: 'count',
              width: 8,
              isRegister: true,
              clockDomain: 'clk',
              resetDomain: 'rst_n',
              drivers: [{ file: 'rtl/counter.sv', line: 15 }],
              loads: [{ file: 'rtl/counter.sv', line: 20 }],
              location: { file: 'rtl/counter.sv', line: 10 },
            },
          ],
          instances: [],
          fsms: [],
          clockDomains: ['clk'],
          resetDomains: ['rst_n'],
        },
      },
    };

    const engine = new VeriVisualEngine();
    const wave = engine.parseVcd('');
    const context = extractSignalIntelligence('count', graph, wave, 10);

    expect(context.signalName).toBe('count');
    expect(context.declared?.line).toBe(10);
    expect(context.drivers.length).toBe(1);
    expect(context.loads.length).toBe(1);
  });
});
