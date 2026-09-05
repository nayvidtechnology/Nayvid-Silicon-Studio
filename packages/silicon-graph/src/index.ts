import type { DesignGraph } from '@nayvid/design-ir';
import type {
  SiliconNode,
  SiliconEdge,
  SiliconNodeKind,
  SiliconRelationKind,
  TimingPathFilter,
  DRCFilter,
  SiliconGraphDump,
} from './types.js';

export class SiliconKnowledgeGraph {
  private nodes: Map<string, SiliconNode> = new Map();
  private edges: Map<string, SiliconEdge> = new Map();

  addNode(node: SiliconNode): SiliconNode {
    this.nodes.set(node.id, node);
    return node;
  }

  getNode(id: string): SiliconNode | undefined {
    return this.nodes.get(id);
  }

  findNodes(kind: SiliconNodeKind, filter?: (node: SiliconNode) => boolean): SiliconNode[] {
    const res: SiliconNode[] = [];
    for (const n of this.nodes.values()) {
      if (n.kind === kind && (!filter || filter(n))) {
        res.push(n);
      }
    }
    return res;
  }

  addEdge(edge: SiliconEdge): SiliconEdge {
    this.edges.set(edge.id, edge);
    return edge;
  }

  link(sourceId: string, relation: SiliconRelationKind, targetId: string, attributes?: Record<string, any>): SiliconEdge {
    const id = `edge_${sourceId}_${relation}_${targetId}`;
    const edge: SiliconEdge = { id, sourceId, targetId, relation, attributes };
    return this.addEdge(edge);
  }

  getOutgoingEdges(sourceId: string, relation?: SiliconRelationKind): SiliconEdge[] {
    const res: SiliconEdge[] = [];
    for (const e of this.edges.values()) {
      if (e.sourceId === sourceId && (!relation || e.relation === relation)) {
        res.push(e);
      }
    }
    return res;
  }

  getIncomingEdges(targetId: string, relation?: SiliconRelationKind): SiliconEdge[] {
    const res: SiliconEdge[] = [];
    for (const e of this.edges.values()) {
      if (e.targetId === targetId && (!relation || e.relation === relation)) {
        res.push(e);
      }
    }
    return res;
  }

  ingestDesignGraph(designGraph: DesignGraph): void {
    for (const modKey of Object.keys(designGraph.modules)) {
      const mod = designGraph.modules[modKey];
      const modNodeId = `module:${mod.name}`;
      this.addNode({
        id: modNodeId,
        kind: 'Module',
        name: mod.name,
        attributes: { file: mod.file },
      });

      for (const p of mod.ports) {
        const portId = `port:${mod.name}:${p.name}`;
        this.addNode({
          id: portId,
          kind: 'Port',
          name: p.name,
          attributes: { direction: p.direction, width: p.width, location: p.location },
        });
        this.link(modNodeId, 'contains', portId);
      }

      for (const s of mod.signals) {
        const sigId = `net:${mod.name}:${s.name}`;
        this.addNode({
          id: sigId,
          kind: 'Net',
          name: s.name,
          attributes: { width: s.width, isRegister: s.isRegister, dependsOn: s.dependsOn },
        });
        this.link(modNodeId, 'contains', sigId);
        if (s.isRegister) {
          const regId = `register:${mod.name}:${s.name}`;
          this.addNode({
            id: regId,
            kind: 'Register',
            name: s.name,
            attributes: { clockDomain: s.clockDomain, resetDomain: s.resetDomain },
          });
          this.link(modNodeId, 'contains', regId);
          this.link(regId, 'drives', sigId);
        }
      }

      for (const inst of mod.instances) {
        const instId = `instance:${mod.name}:${inst.name}`;
        this.addNode({
          id: instId,
          kind: 'Instance',
          name: inst.name,
          attributes: { moduleName: inst.moduleName },
        });
        this.link(modNodeId, 'contains', instId);
        this.link(instId, 'implements', `module:${inst.moduleName}`);
      }
    }
  }

  queryTimingPaths(filter: TimingPathFilter = {}): SiliconNode[] {
    let paths = this.findNodes('TimingPath');
    if (filter.slackLessThan !== undefined) {
      paths = paths.filter((p) => (p.attributes.slackNs ?? 0) < filter.slackLessThan!);
    }
    if (filter.group) {
      paths = paths.filter((p) => p.attributes.group === filter.group);
    }
    if (filter.startpoint) {
      paths = paths.filter((p) => p.attributes.startpoint === filter.startpoint);
    }
    if (filter.endpoint) {
      paths = paths.filter((p) => p.attributes.endpoint === filter.endpoint);
    }
    if (filter.corner) {
      paths = paths.filter((p) => p.attributes.corner === filter.corner);
    }
    paths.sort((a, b) => (a.attributes.slackNs ?? 0) - (b.attributes.slackNs ?? 0));
    if (filter.limit && filter.limit > 0) {
      return paths.slice(0, filter.limit);
    }
    return paths;
  }

  queryDRCViolations(filter: DRCFilter = {}): SiliconNode[] {
    let drcs = this.findNodes('DRCViolation');
    if (filter.rule) {
      drcs = drcs.filter((d) => d.attributes.rule === filter.rule);
    }
    if (filter.layer) {
      drcs = drcs.filter((d) => d.attributes.layer === filter.layer);
    }
    if (filter.severity) {
      drcs = drcs.filter((d) => d.attributes.severity === filter.severity);
    }
    if (filter.limit && filter.limit > 0) {
      return drcs.slice(0, filter.limit);
    }
    return drcs;
  }

  dump(): SiliconGraphDump {
    return {
      nodes: Array.from(this.nodes.values()),
      edges: Array.from(this.edges.values()),
    };
  }

  load(data: SiliconGraphDump): void {
    for (const n of data.nodes) {
      this.addNode(n);
    }
    for (const e of data.edges) {
      this.addEdge(e);
    }
  }
}

export * from './types.js';
