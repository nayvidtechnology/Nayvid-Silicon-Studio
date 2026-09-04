export type NaviSkill =
  | 'rtl-engineer'
  | 'verification-engineer'
  | 'waveform-debugger'
  | 'formal-engineer'
  | 'synthesis-engineer'
  | 'ppa-engineer'
  | 'physical-engineer'
  | 'architecture-engineer';

export interface AgentActivityItem {
  id: string;
  timestamp: string;
  skill: NaviSkill;
  toolName: string;
  arguments: Record<string, any>;
  status: 'started' | 'approved' | 'completed' | 'rejected' | 'failed';
  output?: any;
}

export interface AgentTask {
  id: string;
  query: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
}
