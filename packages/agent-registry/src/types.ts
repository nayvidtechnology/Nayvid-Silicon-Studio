import type { AgentLevel, SiliconAgentManifest } from '@nayvid/agent-harness';
import type { TrustLevel } from '@nayvid/agent-runtime';

export type SquadDomain =
  | 'architecture'
  | 'rtl'
  | 'verification'
  | 'timing'
  | 'physical'
  | 'signoff'
  | 'platform';

export interface SquadAgentDefinition {
  id: string;
  name: string;
  domain: SquadDomain;
  level: AgentLevel;
  trustLevel: TrustLevel;
  responsibility: string;
  manifest: SiliconAgentManifest;
}

export interface SwarmExecutionResult {
  success: boolean;
  scenario: string;
  initialWnsNs: number;
  finalWnsNs: number;
  powerDeltaPct: number;
  areaDeltaPct: number;
  steps: Array<{
    agentId: string;
    action: string;
    output: any;
  }>;
  evidenceBundlePath?: string;
}
