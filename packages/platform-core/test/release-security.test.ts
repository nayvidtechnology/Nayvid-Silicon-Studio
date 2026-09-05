import { describe, expect, it } from 'vitest';
import {
  SbomGenerator,
  SbomPackage,
  SignedReleaseBundleService,
  VulnerabilityFinding,
  VulnerabilityScanner,
} from '../src/index.js';

describe('Release & Security Engineering Hardening', () => {
  it('generates SPDX/CycloneDX SBOM document', () => {
    const generator = new SbomGenerator();
    const pkgs: SbomPackage[] = [
      { name: 'slang', version: '11.0', license: 'MIT' },
      { name: 'iverilog', version: '12.0', license: 'GPL-2.0' },
    ];

    const sbom = generator.generateSbom('nayvid-release', '1.0.0', pkgs, 'spdx');
    expect(sbom.packages.length).toBe(2);
    expect(sbom.packages[0].name).toBe('iverilog'); // sorted
    expect(sbom.digest).toBeDefined();
  });

  it('scans dependencies for vulnerability findings and license compliance', () => {
    const scanner = new VulnerabilityScanner();
    const pkgs: SbomPackage[] = [{ name: 'vulnerable-pkg', version: '0.1.0' }];
    const advisories: Record<string, VulnerabilityFinding[]> = {
      'vulnerable-pkg@0.1.0': [
        { package: 'vulnerable-pkg', version: '0.1.0', severity: 'high', title: 'Remote Code Execution', cve: 'CVE-2026-9999' },
      ],
    };

    const res = scanner.scanDependencies(pkgs, advisories);
    expect(res.compliant).toBe(false);
    expect(res.findings.length).toBe(1);
    expect(res.findings[0].cve).toBe('CVE-2026-9999');
  });

  it('signs release bundle and verifies Ed25519 signature fails if SBOM or digest is tampered', () => {
    const { publicKeyPem, privateKeyPem } = SignedReleaseBundleService.generateKeyPair();
    const service = new SignedReleaseBundleService();

    const payload = {
      projectName: 'AxiPeripheral',
      version: '1.0.0',
      projectDigest: 'proj-digest-123',
      toolchainDigest: 'tc-digest-456',
      sbomDigest: 'sbom-digest-789',
      createdAt: new Date().toISOString(),
    };

    const signed = service.signBundle(payload, privateKeyPem);
    expect(signed.signatureBase64).toBeDefined();

    // Valid verification
    expect(service.verifyBundle(signed, publicKeyPem)).toBe(true);

    // Tampered SBOM digest check
    const tamperedSbom = { ...signed, payload: { ...payload, sbomDigest: 'tampered-sbom-digest' } };
    expect(service.verifyBundle(tamperedSbom, publicKeyPem)).toBe(false);

    // Tampered Project digest check
    const tamperedProj = { ...signed, payload: { ...payload, projectDigest: 'tampered-proj-digest' } };
    expect(service.verifyBundle(tamperedProj, publicKeyPem)).toBe(false);

    // Tampered signature check
    const tamperedSig = { ...signed, signatureBase64: 'invalid-base64-signature==' };
    expect(service.verifyBundle(tamperedSig, publicKeyPem)).toBe(false);
  });
});
