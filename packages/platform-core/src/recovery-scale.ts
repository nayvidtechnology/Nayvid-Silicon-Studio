import * as fs from 'fs';
import * as path from 'path';
import type { RunRecord, RunStatus } from './types.js';

export interface PersistentRunDatabase {
  saveRun(run: RunRecord): Promise<void>;
  getRun(id: string): Promise<RunRecord | undefined>;
  listRuns(filter?: { projectDigest?: string; status?: RunStatus }): Promise<RunRecord[]>;
  deleteRun(id: string): Promise<boolean>;
}

export class JsonFileRunDatabase implements PersistentRunDatabase {
  private runs = new Map<string, RunRecord>();

  constructor(private filePath: string) {
    if (fs.existsSync(filePath)) {
      const data = fs.readFileSync(filePath, 'utf-8');
      for (const line of data.split(/\r?\n/).filter(Boolean)) {
        try {
          const run = JSON.parse(line) as RunRecord;
          this.runs.set(run.id, run);
        } catch {
          // ignore invalid line
        }
      }
    }
  }

  async saveRun(run: RunRecord): Promise<void> {
    this.runs.set(run.id, run);
    this.flush();
  }

  async getRun(id: string): Promise<RunRecord | undefined> {
    return this.runs.get(id);
  }

  async listRuns(filter?: { projectDigest?: string; status?: RunStatus }): Promise<RunRecord[]> {
    let list = [...this.runs.values()];
    if (filter?.projectDigest) list = list.filter((r) => r.projectDigest === filter.projectDigest);
    if (filter?.status) list = list.filter((r) => r.status === filter.status);
    return list;
  }

  async deleteRun(id: string): Promise<boolean> {
    const existed = this.runs.delete(id);
    if (existed) this.flush();
    return existed;
  }

  private flush(): void {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    const content = [...this.runs.values()].map((r) => JSON.stringify(r)).join('\n') + '\n';
    fs.writeFileSync(this.filePath, content, 'utf-8');
  }
}

export interface RetentionPolicy {
  maxAgeDays?: number;
  maxRunsPerProject?: number;
}

export class RunRecoveryManager {
  recoverInterruptedRuns(runs: RunRecord[]): RunRecord[] {
    return runs.map((run) => {
      if (run.status === 'running') {
        return {
          ...run,
          status: 'failed',
          exitCode: 137,
          completedAt: new Date().toISOString(),
          metadata: { ...run.metadata, recoveryNote: 'Recovered from unexpected host termination / crash' },
        };
      }
      return run;
    });
  }

  applyRetentionPolicy(runs: RunRecord[], policy: RetentionPolicy, now = new Date()): { retained: RunRecord[]; pruned: RunRecord[] } {
    const retained: RunRecord[] = [];
    const pruned: RunRecord[] = [];
    const sorted = [...runs].sort((a, b) => (b.completedAt ?? b.startedAt).localeCompare(a.completedAt ?? a.startedAt));

    const maxAgeMs = policy.maxAgeDays ? policy.maxAgeDays * 86400 * 1000 : undefined;

    for (const run of sorted) {
      const runTime = new Date(run.completedAt ?? run.startedAt).getTime();
      const ageMs = now.getTime() - runTime;

      let keep = true;
      if (maxAgeMs !== undefined && ageMs > maxAgeMs) keep = false;
      if (policy.maxRunsPerProject !== undefined && retained.length >= policy.maxRunsPerProject) keep = false;

      if (keep) retained.push(run);
      else pruned.push(run);
    }

    return { retained, pruned };
  }
}
