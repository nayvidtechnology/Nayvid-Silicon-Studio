export interface Checkpoint {
  id: string;
  timestamp: string;
  agentId: string;
  filesSnapshot: Map<string, string>;
}

export class RollbackManager {
  private checkpoints: Map<string, Checkpoint> = new Map();

  createCheckpoint(agentId: string, filesSnapshot: Record<string, string>): Checkpoint {
    const id = `chk_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const checkpoint: Checkpoint = {
      id,
      timestamp: new Date().toISOString(),
      agentId,
      filesSnapshot: new Map(Object.entries(filesSnapshot)),
    };
    this.checkpoints.set(id, checkpoint);
    return checkpoint;
  }

  getCheckpoint(id: string): Checkpoint | undefined {
    return this.checkpoints.get(id);
  }

  rollback(checkpointId: string): Record<string, string> {
    const chk = this.checkpoints.get(checkpointId);
    if (!chk) throw new Error(`Checkpoint '${checkpointId}' not found for rollback.`);
    const restored: Record<string, string> = {};
    for (const [path, content] of chk.filesSnapshot.entries()) {
      restored[path] = content;
    }
    return restored;
  }
}
