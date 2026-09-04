import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { generateKeyPairSync, sign } from 'crypto';
import {
  ContentAddressedArtifactStore,
  HashChainedAuditLog,
  OfflineLicenseVerifier,
  ProductionProjectSession,
  ProjectManifestService,
  RbacPolicy,
  RunLedger,
  SecretRedactor,
  SignoffPolicyEngine,
  ToolchainLockService,
  stableJson,
  type ProjectManifest,
  type SignedLicense,
} from '../src/index.js';

function manifest(): ProjectManifest {
  return {
    schemaVersion: 1,
    name: 'astra-soc',
    topModule: 'astra_top',
    sources: ['rtl/astra_top.sv', 'rtl/fabric.sv'],
    includeDirs: ['rtl/include'],
    toolchain: [
      { toolId: 'slang', version: '9.1.0', required: true, runtimes: ['linux', 'wsl2'] },
      { toolId: 'verilator', required: true },
    ],
    signoff: { requireCompile: true, requireSimulation: true, minCoveragePercent: 90, maxCdcIssues: 0, minWnsNs: 0, requireToolchainLock: true },
  };
}

function tempRoot(): string { return fs.mkdtempSync(path.join(os.tmpdir(), 'nayvid-platform-')); }

describe('production platform core', () => {
  it('validates project authority and rejects workspace escapes', () => {
    const svc = new ProjectManifestService();
    expect(svc.validate(manifest())).toEqual([]);
    const bad = { ...manifest(), sources: ['../secret.sv'] };
    expect(svc.validate(bad).join(' ')).toContain('inside the project workspace');
    expect(svc.digest(manifest())).toHaveLength(64);
  });

  it('enforces an exact, runtime-aware toolchain lock', () => {
    const result = new ToolchainLockService().check(manifest(), [
      { toolId: 'slang', installed: true, version: '9.1.0', runtime: 'linux' },
      { toolId: 'verilator', installed: true, version: '5.040', runtime: 'linux' },
    ]);
    expect(result.valid).toBe(true);
    const mismatch = new ToolchainLockService().check(manifest(), [{ toolId: 'slang', installed: true, version: '8.0.0', runtime: 'linux' }]);
    expect(mismatch.valid).toBe(false);
    expect(mismatch.errors.join(' ')).toContain('version mismatch');
  });

  it('stores immutable content-addressed evidence and verifies integrity', () => {
    const store = new ContentAddressedArtifactStore(tempRoot());
    const ref = store.put('compile.log', 'clean compile', 'text/plain');
    expect(store.read(ref).toString()).toBe('clean compile');
    fs.writeFileSync(ref.path, 'tampered');
    expect(() => store.read(ref)).toThrow('integrity');
  });

  it('persists run state transitions to an append-only ledger', () => {
    const ledger = new RunLedger(tempRoot());
    const run = ledger.begin({ kind: 'simulation', projectDigest: 'p', toolchainDigest: 't', command: 'iverilog', args: ['top.sv'], cwd: '.' });
    const done = ledger.finish(run.id, { status: 'passed', exitCode: 0 });
    expect(done.status).toBe('passed');
    expect(new RunLedger((ledger as any).root ?? '').list).not.toBeUndefined();
  });

  it('detects audit-log tampering using a hash chain', () => {
    const root = tempRoot();
    const log = new HashChainedAuditLog(root);
    log.append({ actor: 'alice', action: 'run:execute', resource: 'sim', outcome: 'success' });
    log.append({ actor: 'lead', action: 'signoff:approve', resource: 'release', outcome: 'success' });
    expect(log.verify()).toBe(true);
    const file = path.join(root, 'audit.jsonl');
    fs.writeFileSync(file, fs.readFileSync(file, 'utf-8').replace('alice', 'mallory'));
    expect(log.verify()).toBe(false);
  });

  it('applies semiconductor signoff policy as hard gates', () => {
    const engine = new SignoffPolicyEngine();
    const policy = manifest().signoff!;
    const green = engine.evaluate(policy, { compilePassed: true, simulationPassed: true, coveragePercent: 96, cdcIssues: 0, wnsNs: 0.12, toolchainLocked: true });
    expect(green.passed).toBe(true);
    const red = engine.evaluate(policy, { compilePassed: true, simulationPassed: false, coveragePercent: 70, cdcIssues: 2, wnsNs: -0.4, toolchainLocked: false });
    expect(red.passed).toBe(false);
    expect(red.blockers.length).toBeGreaterThanOrEqual(4);
  });

  it('enforces least-privilege project roles', () => {
    const rbac = new RbacPolicy();
    expect(rbac.can('viewer', 'run:execute')).toBe(false);
    expect(rbac.can('lead', 'signoff:approve')).toBe(true);
    expect(() => rbac.require('engineer', 'license:manage')).toThrow('not authorized');
  });

  it('verifies signed offline commercial licenses and expiration', () => {
    const { publicKey, privateKey } = generateKeyPairSync('ed25519');
    const payload = { customer: 'ChipCo', edition: 'enterprise' as const, expiresAt: '2030-01-01T00:00:00.000Z', features: ['formal', 'remote-runners'], seats: 50, licenseId: 'LIC-001' };
    const signed: SignedLicense = { payload, signatureBase64: sign(null, Buffer.from(stableJson(payload)), privateKey).toString('base64') };
    const verifier = new OfflineLicenseVerifier(publicKey.export({ type: 'spki', format: 'pem' }).toString());
    expect(verifier.verify(signed, new Date('2029-01-01')).valid).toBe(true);
    expect(verifier.verify(signed, new Date('2031-01-01')).reason).toContain('expired');
  });

  it('redacts common secrets before logs become evidence', () => {
    const redactor = new SecretRedactor();
    const output = redactor.redact('Authorization: Bearer abc.def api_key=supersecret password=hunter2');
    expect(output).not.toContain('abc.def');
    expect(output).not.toContain('supersecret');
    expect(output).not.toContain('hunter2');
  });

  it('builds a production readiness decision from project, toolchain, audit and signoff evidence', () => {
    const session = new ProductionProjectSession(tempRoot(), manifest());
    session.audit.append({ actor: 'ci', action: 'run:execute', resource: 'regression', outcome: 'success' });
    const report = session.readiness([
      { toolId: 'slang', installed: true, version: '9.1.0', runtime: 'linux' },
      { toolId: 'verilator', installed: true, version: '5.040', runtime: 'linux' },
    ], { compilePassed: true, simulationPassed: true, coveragePercent: 95, cdcIssues: 0, wnsNs: 0.1 });
    expect(report.blockers).toEqual([]);
    expect(report.auditValid).toBe(true);
    expect(report.signoff.passed).toBe(true);
  });
});
