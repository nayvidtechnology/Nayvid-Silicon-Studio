import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  EdaLicenseInjector,
  HashChainedAuditLog,
  KmsSecretsManager,
  RunLedger,
  SecretRedactor,
  VaultSecretsManager,
} from '../src/index.js';

describe('Secrets & Licensing Infrastructure Hardening', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'secrets-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('retrieves secrets from Vault and KMS managers', async () => {
    const vault = new VaultSecretsManager({
      vaultUrl: 'https://vault.enterprise.com',
      token: 'vault-token',
      mockSecrets: { SNPSLMD_LICENSE_FILE: '27000@lic.synopsys.com' },
    });

    const kms = new KmsSecretsManager({
      region: 'us-west-2',
      keyId: 'arn:aws:kms:us-west-2:123456789012:key/eda-key',
      mockSecrets: { CDS_LIC_FILE: '5280@lic.cadence.com' },
    });

    expect(await vault.getSecret('SNPSLMD_LICENSE_FILE')).toBe('27000@lic.synopsys.com');
    expect(await kms.getSecret('CDS_LIC_FILE')).toBe('5280@lic.cadence.com');
  });

  it('injects EDA license environment variables securely', async () => {
    const vault = new VaultSecretsManager({
      vaultUrl: 'https://vault.enterprise.com',
      token: 'vault-token',
      mockSecrets: {
        LM_LICENSE_FILE: '1700@flex.enterprise.com',
        SNPSLMD_LICENSE_FILE: '27000@lic.synopsys.com',
      },
    });

    const injector = new EdaLicenseInjector(vault);
    const env = await injector.buildEnv({ cadenceLicense: '5280@lic.cadence.com' });

    expect(env.LM_LICENSE_FILE).toBe('1700@flex.enterprise.com');
    expect(env.SNPSLMD_LICENSE_FILE).toBe('27000@lic.synopsys.com');
    expect(env.CDS_LIC_FILE).toBe('5280@lic.cadence.com');
  });

  it('verifies secret values never leak into logs, audit events, or run records', () => {
    const redactor = new SecretRedactor();
    const sensitiveOutput = 'Command stdout with authorization: bearer sk-proj1234567890123456 and token=AKIAIOSFODNN7EXAMPLE';
    const redacted = redactor.redact(sensitiveOutput);

    expect(redacted).not.toContain('sk-proj1234567890123456');
    expect(redacted).not.toContain('AKIAIOSFODNN7EXAMPLE');

    // Audit log check
    const auditLog = new HashChainedAuditLog(tmpDir);
    auditLog.append({
      actor: 'engineer@enterprise.com',
      action: 'eda:run',
      resource: 'dc_shell',
      outcome: 'success',
      details: { stdout: redacted },
    });

    const events = auditLog.read();
    expect(JSON.stringify(events)).not.toContain('sk-proj1234567890123456');

    // Run ledger check
    const runLedger = new RunLedger(tmpDir);
    const run = runLedger.begin({
      kind: 'synthesis',
      command: 'dc_shell',
      args: ['-f', 'synth.tcl'],
      cwd: tmpDir,
      projectDigest: 'pd1',
      toolchainDigest: 'td1',
      metadata: { stdout: redacted },
    });

    expect(JSON.stringify(runLedger.get(run.id))).not.toContain('sk-proj1234567890123456');
  });
});
