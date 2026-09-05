import type { SquadAgentDefinition, SquadDomain } from './types.js';

export class SiliconAgentCatalog {
  private catalog: Map<string, SquadAgentDefinition> = new Map();

  constructor() {
    this.populateCatalog();
  }

  private registerAgent(agent: SquadAgentDefinition): void {
    this.catalog.set(agent.id, agent);
  }

  private populateCatalog(): void {
    this.registerAgent({
      id: 'arch.decomposer',
      name: 'Architecture Decomposer',
      domain: 'architecture',
      level: 'director',
      trustLevel: 'T2',
      responsibility: 'Decompose SoC/block hierarchy and allocate PPA budgets',
      manifest: this.makeManifest('arch.decomposer', 'director', 'architecture', ['decompose_hierarchy']),
    });

    this.registerAgent({
      id: 'rtl.coder',
      name: 'RTL Coder',
      domain: 'rtl',
      level: 'executor',
      trustLevel: 'T3',
      responsibility: 'Generate and modify synthesizable RTL',
      manifest: this.makeManifest('rtl.coder', 'executor', 'rtl', ['generate_rtl', 'restructure_pipeline']),
    });

    this.registerAgent({
      id: 'verification.agent',
      name: 'Verification Agent',
      domain: 'verification',
      level: 'executor',
      trustLevel: 'T3',
      responsibility: 'Run formal property checks and testbench regression suites',
      manifest: this.makeManifest('verification.agent', 'executor', 'verification', ['run_formal', 'run_regression']),
    });

    this.registerAgent({
      id: 'timing.scout',
      name: 'Timing Scout',
      domain: 'timing',
      level: 'scout',
      trustLevel: 'T0',
      responsibility: 'Interrogate timing reports and identify setup/hold root causes',
      manifest: this.makeManifest('timing.scout', 'scout', 'timing', ['inspect_path', 'identify_root_cause']),
    });

    this.registerAgent({
      id: 'eco.planner',
      name: 'ECO Planner',
      domain: 'timing',
      level: 'executor',
      trustLevel: 'T2',
      responsibility: 'Plan and formulate ECO proposals across timing/logic',
      manifest: this.makeManifest('eco.planner', 'executor', 'timing', ['plan_eco']),
    });

    this.registerAgent({
      id: 'physical.agent',
      name: 'Physical Agent',
      domain: 'physical',
      level: 'executor',
      trustLevel: 'T3',
      responsibility: 'Execute place and route and physical ECO buffering',
      manifest: this.makeManifest('physical.agent', 'executor', 'physical', ['place_route', 'apply_physical_eco']),
    });

    this.registerAgent({
      id: 'signoff.sentry',
      name: 'Signoff Sentry',
      domain: 'signoff',
      level: 'scout',
      trustLevel: 'T0',
      responsibility: 'Audit STA, DRC, LVS signoff compliance via deterministic rules',
      manifest: this.makeManifest('signoff.sentry', 'scout', 'signoff', ['audit_drc', 'audit_sta']),
    });

    this.registerAgent({
      id: 'evidence.agent',
      name: 'Evidence Agent',
      domain: 'platform',
      level: 'specialist',
      trustLevel: 'T1',
      responsibility: 'Package evidence bundle and signoff release documentation',
      manifest: this.makeManifest('evidence.agent', 'specialist', 'platform', ['package_evidence']),
    });

    this.registerAgent({
      id: 'chief.architect',
      name: 'Chief Silicon Architect',
      domain: 'architecture',
      level: 'commander',
      trustLevel: 'T4',
      responsibility: 'Hierarchical orchestration, cross-domain arbitration, and final signoff approval',
      manifest: this.makeManifest('chief.architect', 'commander', 'architecture', ['arbitrate_eco', 'approve_commit']),
    });
  }

  private makeManifest(
    id: string,
    level: any,
    domain: string,
    objectives: string[]
  ): any {
    return {
      apiVersion: 'nayvid.io/v1',
      kind: 'SiliconAgent',
      metadata: { id, version: '1.0.0' },
      spec: {
        level,
        domain,
        objective: objectives,
        models: { preferred: ['local-model'], fallback: ['openai-gpt4o'] },
        dataPolicy: { allowed: ['sanitized_graph'], forbiddenForCloud: ['pdk'] },
        tools: { read: ['read_file', 'query_graph'], execute: ['run_sta'], forbidden: [] },
        authority: { proposeECO: true, executeECO: level !== 'scout' },
        budgets: { maxToolRuns: 10, maxRuntimeMinutes: 60, maxModelCostUSD: 5 },
        invariants: ['no_latency_change'],
        hooks: { pre: ['IdentityHook'], post: ['CompileHook'] },
        rollback: { required: true },
        learning: { projectMemory: true, organizationPlaybook: true, weightUpdates: false },
      },
    };
  }

  getAgent(id: string): SquadAgentDefinition | undefined {
    return this.catalog.get(id);
  }

  listAgents(domain?: SquadDomain): SquadAgentDefinition[] {
    const all = Array.from(this.catalog.values());
    if (domain) return all.filter((a) => a.domain === domain);
    return all;
  }
}
