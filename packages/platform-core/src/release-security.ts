import { generateKeyPairSync, sign as cryptoSign, verify as cryptoVerify } from 'crypto';
import { sha256, stableJson } from './index.js';

export interface SbomPackage {
  name: string;
  version: string;
  license?: string;
  purl?: string;
  digest?: string;
}

export interface SbomDocument {
  schemaVersion: 1;
  format: 'spdx' | 'cyclonedx';
  name: string;
  version: string;
  packages: SbomPackage[];
  generatedAt: string;
  digest: string;
}

export class SbomGenerator {
  generateSbom(projectName: string, projectVersion: string, packages: SbomPackage[], format: 'spdx' | 'cyclonedx' = 'spdx'): SbomDocument {
    const sorted = [...packages].sort((a, b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version));
    const base = {
      schemaVersion: 1 as const,
      format,
      name: projectName,
      version: projectVersion,
      packages: sorted,
      generatedAt: new Date().toISOString(),
    };
    return { ...base, digest: sha256(stableJson(base)) };
  }
}

export interface VulnerabilityFinding {
  package: string;
  version: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  cve?: string;
}

export class VulnerabilityScanner {
  scanDependencies(packages: SbomPackage[], knownAdvisories: Record<string, VulnerabilityFinding[]> = {}): { compliant: boolean; findings: VulnerabilityFinding[] } {
    const findings: VulnerabilityFinding[] = [];
    for (const pkg of packages) {
      const key = `${pkg.name}@${pkg.version}`;
      const advisories = knownAdvisories[key] ?? knownAdvisories[pkg.name] ?? [];
      findings.push(...advisories);
    }
    const criticalOrHigh = findings.some((f) => f.severity === 'high' || f.severity === 'critical');
    return { compliant: !criticalOrHigh, findings };
  }
}

export interface SignedReleaseBundlePayload {
  projectName: string;
  version: string;
  projectDigest: string;
  toolchainDigest: string;
  sbomDigest: string;
  createdAt: string;
}

export interface SignedReleaseBundle {
  payload: SignedReleaseBundlePayload;
  signatureBase64: string;
}

export class SignedReleaseBundleService {
  static generateKeyPair(): { publicKeyPem: string; privateKeyPem: string } {
    const { publicKey, privateKey } = generateKeyPairSync('ed25519');
    return {
      publicKeyPem: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
      privateKeyPem: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
    };
  }

  signBundle(payload: SignedReleaseBundlePayload, privateKeyPem: string): SignedReleaseBundle {
    const data = Buffer.from(stableJson(payload));
    const sig = cryptoSign(null, data, privateKeyPem);
    return { payload, signatureBase64: sig.toString('base64') };
  }

  verifyBundle(bundle: SignedReleaseBundle, publicKeyPem: string): boolean {
    try {
      const data = Buffer.from(stableJson(bundle.payload));
      const sig = Buffer.from(bundle.signatureBase64, 'base64');
      return cryptoVerify(null, data, publicKeyPem, sig);
    } catch {
      return false;
    }
  }
}
