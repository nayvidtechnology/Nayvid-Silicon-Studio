import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { StudioProductionController } from '../src/production.js';

function makeProject(): { root: string; manifestPath: string } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nayvid-prod-'));
  fs.mkdirSync(path.join(root, 'rtl'));
  fs.writeFileSync(path.join(root, 'rtl', 'top.sv'), 'module top; endmodule\n');
  const manifestPath = path.join(root, 'nayvid.project.json');
  fs.writeFileSync(manifestPath, JSON.stringify({
    schemaVersion: 1,
    name: 'commercial-soc',
    topModule: 'top',
    sources: ['rtl/top.sv'],
    toolchain: [{ toolId: 'slang', required: true }],
    signoff: { requireCompile: true, requireSimulation: true, minCoveragePercent: 90, maxCdcIssues: 0, requireToolchainLock: true },
  }));
  return { root, manifestPath };
}

describe('Studio production workflow', () => {
  it('opens project authority, records evidence, blocks weak readiness and enforces RBAC', () => {
    const { manifestPath } = makeProject();
    const studio = new StudioProductionController();
    const session = studio.openProject(manifestPath, 'alice');
    const toolchain = session.toolchains.check(session.manifest, [{ toolId: 'slang', installed: true, version: '9.1.0', runtime: 'linux' }]);
    const run = studio.beginRun('engineer', 'alice', { kind: 'simulation', toolchainDigest: toolchain.digest, command: 'iverilog', args: ['rtl/top.sv'] });
    const ref = studio.attachEvidence('engineer', 'alice', run.id, 'simulation.log', 'password=secret PASS', 'text/plain');
    expect(session.artifacts.read(ref).toString()).not.toContain('secret');
    expect(studio.finishRun('engineer', 'alice', run.id, 'passed', 0).status).toBe('passed');
    expect(() => studio.finishRun('engineer', 'alice', run.id, 'passed', 0)).toThrow('already terminal');

    const weak = studio.readiness('viewer', [{ toolId: 'slang', installed: true, version: '9.1.0', runtime: 'linux' }], { compilePassed: true, simulationPassed: false, coveragePercent: 60, cdcIssues: 2 });
    expect(weak.signoff.passed).toBe(false);
    expect(() => studio.approveSignoff('engineer', 'alice', [], [])).toThrow('not authorized');
    expect(session.audit.verify()).toBe(true);
  });

  it('automatically turns governed EDA execution into immutable redacted run evidence', async () => {
    const { manifestPath } = makeProject();
    const fakeGateway = {
      async executeTool() {
        return { success: true, output: 'PASS token=supersecret', runtimeUsed: 'linux' as const, exitCode: 0 };
      },
    };
    const studio = new StudioProductionController(undefined, () => fakeGateway);
    const session = studio.openProject(manifestPath, 'ci-bot');
    const result = await studio.executeEvidenceRun('engineer', 'ci-bot', {
      kind: 'simulation',
      toolchainDigest: 'locked-toolchain',
      toolName: 'run_simulation',
      toolArgs: { topModule: 'top', files: ['rtl/top.sv'] },
    });

    expect(result.run.status).toBe('passed');
    expect(result.run.completedAt).toBeDefined();
    expect(result.run.artifacts).toHaveLength(1);
    expect(result.run.runtime).toBe('linux');
    expect(session.runs.list()).toHaveLength(1);
    const evidence = session.artifacts.read(result.evidence).toString();
    expect(evidence).toContain('PASS');
    expect(evidence).not.toContain('supersecret');
    expect(session.audit.verify()).toBe(true);
  });

  it('approves signoff only from recorded passing runs and integrity-checked metric artifacts', () => {
    const { manifestPath } = makeProject();
    const studio = new StudioProductionController();
    const session = studio.openProject(manifestPath, 'lead-user');
    const probes = [{ toolId: 'slang', installed: true, version: '9.1.0', runtime: 'linux' as const }];
    const toolchain = session.toolchains.check(session.manifest, probes);

    const compile = studio.beginRun('engineer', 'ci-bot', { kind: 'compile', toolchainDigest: toolchain.digest, command: 'slang', args: ['rtl/top.sv'] });
    studio.finishRun('engineer', 'ci-bot', compile.id, 'passed', 0);
    const simulation = studio.beginRun('engineer', 'ci-bot', { kind: 'simulation', toolchainDigest: toolchain.digest, command: 'iverilog', args: ['rtl/top.sv'] });
    studio.finishRun('engineer', 'ci-bot', simulation.id, 'passed', 0);

    const coverage = studio.recordMetricEvidence('engineer', 'ci-bot', 'coverage', 96.4, simulation.id, 'coverage-tool');
    const cdc = studio.recordMetricEvidence('engineer', 'ci-bot', 'cdc', 0, compile.id, 'cdc-tool');
    const approval = studio.approveSignoff('lead', 'lead-user', probes, [coverage, cdc]);

    expect(approval.signoff.passed).toBe(true);
    expect(approval.blockers).toEqual([]);
    expect(session.audit.verify()).toBe(true);
    expect(session.audit.read().at(-1)?.action).toBe('signoff:approve');
  });
});
