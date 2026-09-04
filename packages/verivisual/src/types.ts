import type { DesignGraph } from '@nayvid/design-ir';
import { parseVcd } from './vcd-parser.js';
import { extractSignalIntelligence, type SignalIntelligenceContext } from './signal-intelligence.js';

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

  parseVcd(vcdContent: string): WaveformModel {
    return parseVcd(vcdContent);
  }

  parseVcdSimple(vcdContent: string): WaveformModel {
    return parseVcd(vcdContent);
  }

  getSignalContext(
    signalName: string,
    graph: DesignGraph,
    waveform?: WaveformModel,
    atTimeNs?: number
  ): SignalIntelligenceContext {
    return extractSignalIntelligence(signalName, graph, waveform, atTimeNs);
  }
}

export * from './vcd-parser.js';
export * from './signal-intelligence.js';
export * from './icons.js';
