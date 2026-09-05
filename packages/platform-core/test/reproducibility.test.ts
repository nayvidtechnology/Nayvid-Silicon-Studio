import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { EvidenceBundleBuilder, SourceSnapshotService, ToolchainLockFileService } from '../src/reproducibility.js';
import { HashChainedAuditLog, RunLedger, SignoffPolicyEngine, ToolchainLockService, type ProjectManifest } from '../src/index.js';

function root(): string { return fs.mkdtempSync(path.join(os.tmpdir(), 'nayvid-repro-')); }

const manifest: ProjectManifest = {
  schemaVersion: 1,
  name: 'top',
  topModule: 'top',
  sources: ['rtl/top.sv'],
  toolchain: [{ toolId: 'slang', version: '9.1.0', required: true }],
};

describe('reproducibility and evidence bundles', () => {
  it('detects source mutation after snapshot', () => {
    const workspace = root();
    fs.mkdirSync(path.join(workspace, 'rtl'));
    fs.writeFileSync(path.join(workspace, 'rtl/top.sv'), 'module top; endmodule\n');
    const snapshots = new SourceSnapshotService();
    const snapshot = snapshots.snapshot(workspace, manifest);
    expect(snapshots.verify(workspace, snapshot)).toBe(true);
    fs.appendFileSync(path.join(workspace, 'rtl/top.sv'), '// changed\n');
    expect(snapshots.verify(workspace, snapshot)).toBe(false);
  });

  it('writes and validates an integrity-checked toolchain lock file', () => {
    const workspace = root();
    const check = new ToolchainLockService().check(manifest, [{ toolId: 'slang', installed: true, version: '9.1.0', runtime: 'linux' }]);
    const file = path.join(workspace, '.nayvid/toolchain.lock.json');
    const locks = new ToolchainLockFileService();
    locks.write(file, check);
    expect(locks.read(file).digest).toBe(check.digest);
    fs.writeFileSync(file, fs.readFileSync(file, 'utf-8').replace('9.1.0', '8.0.0'));
    expect(() => locks.read(file)).toThrow('integrity');
  });

  it('creates a verifiable release evidence bundle only after terminal runs and passing signoff', () => {
    const workspace = root();
    fs.mkdirSync(path.join(workspace, 'rtl'));
    fs.writeFileSync(path.join(workspace, 'rtl/top.sv'), 'module top; endmodule\n');
    const snapshot = new SourceSnapshotService().snapshot(workspace, manifest);
    const toolchain = new ToolchainLockService().check(manifest, [{ toolId: 'slang', installed: true, version: '9.1.0', runtime: 'linux' }]);
    const ledger = new RunLedger(path.join(workspace, '.nayvid/runs'));
    const run = ledger.begin({ kind: 'compile', projectDigest: 'project', toolchainDigest: toolchain.digest, command: 'slang', args: ['rtl/top.sv'], cwd: '.' });
    ledger.finish(run.id, { status: 'passed', exitCode: 0 });
    const audit = new HashChainedAuditLog(path.join(workspace, '.nayvid/audit'));
    audit.append({ actor: 'ci', action: 'run:finish', resource: run.id, outcome: 'success' });
    const signoff = new SignoffPolicyEngine().evaluate({ requireCompile: true }, { compilePassed: true });
    const builder = new EvidenceBundleBuilder();
    const bundle = builder.build({ projectDigest: 'project', sourceSnapshot: snapshot, toolchain, runs: ledger.list(), audit: audit.read(), signoff });
    expect(builder.verify(bundle)).toBe(true);
    expect(bundle.runs[0].status).toBe('passed');
  });
});
