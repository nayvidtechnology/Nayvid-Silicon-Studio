import { describe, it, expect } from 'vitest';
import { DesignGraphBuilder } from '../src/index.js';

describe('Design Graph IR', () => {
  it('constructs hierarchy, modules, signals and driver queries', () => {
    const builder = new DesignGraphBuilder('top');
    builder.addModule({
      name: 'top',
      file: 'rtl/top.sv',
      ports: [
        { name: 'clk', direction: 'input', width: 1 },
        { name: 'out', direction: 'output', width: 8 },
      ],
      signals: [
        {
          name: 'out',
          width: 8,
          isRegister: true,
          clockDomain: 'clk',
          drivers: [{ file: 'rtl/top.sv', line: 15 }],
          loads: [],
        },
      ],
      instances: [],
      fsms: [],
      clockDomains: ['clk'],
      resetDomains: ['rst_n'],
    });

    const graph = builder.build();
    expect(graph.topModule).toBe('top');
    expect(builder.getTopModule()?.name).toBe('top');

    const drivers = builder.findDrivers('top', 'out');
    expect(drivers.length).toBe(1);
    expect(drivers[0].line).toBe(15);
  });
});
