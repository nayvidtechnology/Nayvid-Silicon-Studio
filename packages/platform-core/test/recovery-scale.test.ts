import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { JsonFileRunDatabase, RunRecord, RunRecoveryManager } from '../src/index.js';

describe('Recovery & Scale Hardening', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'recovery-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('recovers orphan running jobs after a process crash and database restart', async () => {
    const dbPath = path.join(tmpDir, 'runs.jsonl');
    const db1 = new JsonFileRunDatabase(dbPath);

    const crashedRun: RunRecord = {
      id: 'crashed-run-1',
      kind: 'synthesis',
      status: 'running',
      startedAt: new Date().toISOString(),
      projectDigest: 'digest-abc',
      toolchainDigest: 'tc-digest-1',
      command: 'genus',
      args: ['-batch'],
      cwd: tmpDir,
      artifacts: [],
    };

    await db1.saveRun(crashedRun);

    // Simulate process crash and restart by instantiating new database instance db2
    const db2 = new JsonFileRunDatabase(dbPath);
    const unrecoveredRuns = await db2.listRuns();
    expect(unrecoveredRuns[0].status).toBe('running');

    // Run recovery manager to detect orphan jobs and recover to terminal failed state
    const recoveryManager = new RunRecoveryManager();
    const recoveredRuns = recoveryManager.recoverInterruptedRuns(unrecoveredRuns);

    await db2.saveRun(recoveredRuns[0]);

    // Verify database state after recovery
    const db3 = new JsonFileRunDatabase(dbPath);
    const finalRun = await db3.getRun('crashed-run-1');
    expect(finalRun?.status).toBe('failed');
    expect(finalRun?.exitCode).toBe(137);
    expect(JSON.stringify(finalRun?.metadata)).toContain('unexpected host termination');
  });

  it('applies retention policies to prune old runs', () => {
    const recovery = new RunRecoveryManager();
    const now = new Date();
    const oldDate = new Date(now.getTime() - 10 * 86400 * 1000).toISOString();
    const recentDate = now.toISOString();

    const runs: RunRecord[] = [
      { id: 'r-old', kind: 'lint', status: 'passed', startedAt: oldDate, completedAt: oldDate, projectDigest: 'p1', toolchainDigest: 't1', command: 'verilator', args: [], cwd: tmpDir, artifacts: [] },
      { id: 'r-recent', kind: 'lint', status: 'passed', startedAt: recentDate, completedAt: recentDate, projectDigest: 'p1', toolchainDigest: 't1', command: 'verilator', args: [], cwd: tmpDir, artifacts: [] },
    ];

    const { retained, pruned } = recovery.applyRetentionPolicy(runs, { maxAgeDays: 7 }, now);
    expect(retained.length).toBe(1);
    expect(retained[0].id).toBe('r-recent');
    expect(pruned.length).toBe(1);
    expect(pruned[0].id).toBe('r-old');
  });
});
