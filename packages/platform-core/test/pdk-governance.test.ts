import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { IpManifestService, PdkGovernanceService } from '../src/index.js';

describe('PDK & IP Governance Hardening', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pdk-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('detects file tampering, size changes, missing files, and manifest digest mismatch', () => {
    const pdkService = new PdkGovernanceService();
    const techPath = path.join(tmpDir, 'tsmc16.tf');
    const drcPath = path.join(tmpDir, 'drc.calibre');
    fs.writeFileSync(techPath, 'techfile header content');
    fs.writeFileSync(drcPath, 'drc rules content');

    const manifest = pdkService.computeManifest({
      pdkName: 'TSMC16FFC',
      pdkVersion: '1.2a',
      foundry: 'TSMC',
      processNodeNm: 16,
      rootDir: tmpDir,
      decks: [
        { kind: 'tech', relativePath: 'tsmc16.tf' },
        { kind: 'drc', relativePath: 'drc.calibre' },
      ],
    });

    expect(pdkService.verifyPdk(tmpDir, manifest).valid).toBe(true);

    // 1. Content Tamper
    fs.writeFileSync(drcPath, 'tampered drc rules');
    const tampered = pdkService.verifyPdk(tmpDir, manifest);
    expect(tampered.valid).toBe(false);
    expect(tampered.errors.some((e) => e.includes('mismatch'))).toBe(true);

    // 2. Missing File
    fs.rmSync(drcPath);
    const missing = pdkService.verifyPdk(tmpDir, manifest);
    expect(missing.valid).toBe(false);
    expect(missing.errors.some((e) => e.includes('Missing PDK deck file'))).toBe(true);

    // 3. Manifest Digest Mismatch
    fs.writeFileSync(drcPath, 'drc rules content');
    const corruptedManifest = { ...manifest, digest: '0000000000000000000000000000000000000000000000000000000000000000' };
    const corruptedRes = pdkService.verifyPdk(tmpDir, corruptedManifest);
    expect(corruptedRes.valid).toBe(false);
    expect(corruptedRes.errors).toContain('PDK manifest digest mismatch');
  });

  it('verifies IP library manifests and catches missing/tampered files', () => {
    const ipService = new IpManifestService();
    const libPath = path.join(tmpDir, 'stdcells.lib');
    fs.writeFileSync(libPath, 'library (stdcells) { cell (NAND2) {} }');

    const manifest = ipService.computeManifest({
      ipName: 'StandardCellLib',
      ipVersion: '2.0',
      vendor: 'ARM',
      workspaceRoot: tmpDir,
      libraries: [{ format: 'liberty', name: 'stdcells_tt', relativePath: 'stdcells.lib' }],
    });

    expect(ipService.verifyIp(tmpDir, manifest).valid).toBe(true);

    fs.writeFileSync(libPath, 'modified lib content');
    expect(ipService.verifyIp(tmpDir, manifest).valid).toBe(false);
  });
});
