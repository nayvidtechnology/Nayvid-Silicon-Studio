import type { DesignGraph } from '@nayvid/design-ir';

export interface VisualNode {
  id: string;
  label: string;
  type: 'module' | 'port' | 'signal' | 'register' | 'fsm_state';
  data?: Record<string, any>;
}

export interface VisualEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
}

export interface BlockDiagramModel {
  nodes: VisualNode[];
  edges: VisualEdge[];
}

export interface WaveformSignalValue {
  timeNs: number;
  value: string | number;
}

export interface WaveformSignal {
  name: string;
  wave: WaveformSignalValue[];
}

export interface WaveformModel {
  timescale: string;
  signals: WaveformSignal[];
}

export class VeriVisualEngine {
  generateBlockDiagram(graph: DesignGraph, moduleName?: string): BlockDiagramModel {
    const targetModule = graph.modules[moduleName || graph.topModule];
    if (!targetModule) {
      return { nodes: [], edges: [] };
    }

    const nodes: VisualNode[] = [
      { id: targetModule.name, label: targetModule.name, type: 'module' },
    ];
    const edges: VisualEdge[] = [];

    for (const port of targetModule.ports) {
      const portId = `${targetModule.name}.${port.name}`;
      nodes.push({ id: portId, label: port.name, type: 'port', data: { direction: port.direction } });
      if (port.direction === 'input') {
        edges.push({ id: `e_${portId}`, source: portId, target: targetModule.name });
      } else {
        edges.push({ id: `e_${portId}`, source: targetModule.name, target: portId });
      }
    }

    for (const inst of targetModule.instances) {
      nodes.push({ id: inst.name, label: `${inst.name}: ${inst.moduleName}`, type: 'module' });
      edges.push({ id: `e_${targetModule.name}_${inst.name}`, source: targetModule.name, target: inst.name });
    }

    return { nodes, edges };
  }

  parseVcdSimple(_vcdContent: string): WaveformModel {
    const signals: WaveformSignal[] = [
      {
        name: 'clk',
        wave: [
          { timeNs: 0, value: 0 },
          { timeNs: 5, value: 1 },
          { timeNs: 10, value: 0 },
          { timeNs: 15, value: 1 },
        ],
      },
      {
        name: 'rst_n',
        wave: [
          { timeNs: 0, value: 0 },
          { timeNs: 10, value: 1 },
        ],
      },
    ];

    return {
      timescale: '1ns',
      signals,
    };
  }
}
