import type { AgentLevel, SiliconAgentManifest } from '@nayvid/agent-harness';

export type TrustLevel = 'T0' | 'T1' | 'T2' | 'T3' | 'T4' | 'T5';

export type AgentState =
  | 'OBJECTIVE'
  | 'OBSERVE'
  | 'PLAN'
  | 'PRE_HOOK_CHAIN'
  | 'EXECUTE'
  | 'POST_HOOK_CHAIN'
  | 'VERIFY'
  | 'COMMIT'
  | 'LEARN'
  | 'ROLLBACK'
  | 'ESCALATE';

export type DataClassification =
  | 'PUBLIC'
  | 'INTERNAL'
  | 'CONFIDENTIAL'
  | 'RTL_SECRET'
  | 'NETLIST_SECRET'
  | 'PDK_RESTRICTED';

export interface AgentExecutionTask {
  id: string;
  agentId: string;
  level: AgentLevel;
  trustLevel: TrustLevel;
  objective: string;
  contextData?: Record<string, any>;
  dataClassification?: DataClassification;
}

export interface AgentExecutionStateRecord {
  taskId: string;
  currentState: AgentState;
  observations?: any;
  plan?: string;
  preHooksPassed?: boolean;
  executionOutput?: any;
  postHooksPassed?: boolean;
  verified?: boolean;
  verifiedReason?: string;
  committed?: boolean;
  rolledBack?: boolean;
  escalated?: boolean;
}
