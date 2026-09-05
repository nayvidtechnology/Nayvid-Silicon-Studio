export type AgentLevel = 'scout' | 'specialist' | 'executor' | 'director' | 'commander';

export interface SiliconAgentManifest {
  apiVersion: 'nayvid.io/v1';
  kind: 'SiliconAgent';
  metadata: {
    id: string;
    version: string;
    name?: string;
  };
  spec: {
    level: AgentLevel;
    domain: string;
    objective: string[];
    models: {
      preferred: string[];
      fallback: string[];
    };
    dataPolicy: {
      allowed: string[];
      forbiddenForCloud: string[];
    };
    tools: {
      read: string[];
      execute: string[];
      forbidden: string[];
    };
    authority: {
      proposeECO: boolean;
      executeECO: boolean;
    };
    budgets: {
      maxToolRuns: number;
      maxRuntimeMinutes: number;
      maxModelCostUSD: number;
    };
    invariants: string[];
    hooks: {
      pre: string[];
      post: string[];
    };
    rollback: {
      required: boolean;
    };
    learning: {
      projectMemory: boolean;
      organizationPlaybook: boolean;
      weightUpdates: boolean;
    };
  };
}

export interface HookContext {
  agentId: string;
  action: string;
  inputs: Record<string, any>;
  dataClassification?: 'PUBLIC' | 'INTERNAL' | 'CONFIDENTIAL' | 'RTL_SECRET' | 'NETLIST_SECRET' | 'PDK_RESTRICTED';
  toolchainVersion?: string;
  pdkVersion?: string;
  checkpointId?: string;
}

export interface HookResult {
  passed: boolean;
  hookName: string;
  reason?: string;
  modifiedInputs?: Record<string, any>;
}

export interface PostHookContext extends HookContext {
  executionOutput: any;
  executionMetrics?: Record<string, any>;
}
