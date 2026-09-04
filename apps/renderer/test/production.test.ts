import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { StudioProductionController } from '../src/production.js';

describe('Studio production workflow', () => {
  it('opens project authority, records evidence, blocks weak signoff and enforces RBAC', () => {
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

    const studio = new StudioProductionController();
    const session = studio.openProject(manifestPath, 'alice');
    const toolchain = session.toolchains.check(session.manifest, [{ toolId: 'slang', installed: true, version: '9.1.0', runtime: 'linux' }]);
    const run = studio.beginRun('engineer', 'alice', { kind: 'simulation', toolchainDigest: toolchain.digest, command: 'iverilog', args: ['rtl/top.sv'] });
    const ref = studio.attachEvidence('engineer', 'alice', run.id, 'simulation.log', 'password=secret PASS', 'text/plain');
    expect(session.artifacts.read(ref).toString()).not.toContain('secret');
    expect(studio.finishRun('engineer', 'alice', run.id, 'passed', 0).status).toBe('passed');

    const weak = studio.readiness('viewer', [{ toolId: 'slang', installed: true, version: '9.1.0', runtime: 'linux' }], { compilePassed: true, simulationPassed: false, coveragePercent: 60, cdcIssues: 2 });
    expect(weak.signoff.passed).toBe(false);
    expect(() => studio.approveSignoff('engineer', 'alice', [], {})).toThrow('not authorized');
    expect(session.audit.verify()).toBe(true);
  });
});
