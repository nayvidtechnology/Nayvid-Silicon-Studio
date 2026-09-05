import { describe, it, expect } from 'vitest';
import { SiliconKnowledgeGraph } from '../src/index.js';

describe('SiliconKnowledgeGraph', () => {
  it('adds and queries nodes and edges correctly', () => {
    const graph = new SiliconKnowledgeGraph();
    graph.addNode({
      id: 'req_1',
      kind: 'Requirement',
      name: 'REQ-101-Timing',
      attributes: { description: '1 GHz clock target' },
    });

    graph.addNode({
      id: 'path_1',
      kind: 'TimingPath',
      name: 'PATH_alu_reg',
      attributes: { slackNs: -0.175, group: 'clk_core', startpoint: 'alu/a', endpoint: 'alu/out' },
    });

    graph.link('req_1', 'constrained_by', 'path_1');

    const timingPaths = graph.queryTimingPaths({ slackLessThan: 0 });
    expect(timingPaths.length).toBe(1);
    expect(timingPaths[0].name).toBe('PATH_alu_reg');

    const edges = graph.getOutgoingEdges('req_1');
    expect(edges.length).toBe(1);
    expect(edges[0].relation).toBe('constrained_by');
  });

  it('ingests design graph IR', () => {
    const graph = new SiliconKnowledgeGraph();
    graph.ingestDesignGraph({
      topModule: 'counter',
      modules: {
        counter: {
          name: 'counter',
          file: 'counter.sv',
          ports: [{ name: 'clk', direction: 'input', width: 1 }],
          signals: [{ name: 'count', width: 8, isRegister: true, drivers: [], loads: [] }],
          instances: [],
          fsms: [],
          clockDomains: ['clk'],
          resetDomains: ['rst_n'],
        },
      },
    });

    const modules = graph.findNodes('Module');
    expect(modules.length).toBe(1);
    expect(modules[0].name).toBe('counter');

    const registers = graph.findNodes('Register');
    expect(registers.length).toBe(1);
    expect(registers[0].name).toBe('count');
  });
});
