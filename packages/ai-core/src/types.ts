export interface AgentTask {
  id: string;
  query: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
}
