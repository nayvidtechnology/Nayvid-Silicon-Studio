import { SecretRedactor } from './index.js';

export interface SecretsManager {
  getSecret(key: string): Promise<string | undefined>;
  listSecretKeys(): Promise<string[]>;
}

export interface VaultOptions {
  vaultUrl: string;
  token: string;
  kvPath?: string;
  mockSecrets?: Record<string, string>;
}

export class VaultSecretsManager implements SecretsManager {
  private secrets = new Map<string, string>();

  constructor(options: VaultOptions) {
    if (options.mockSecrets) {
      for (const [k, v] of Object.entries(options.mockSecrets)) {
        this.secrets.set(k, v);
      }
    }
  }

  async getSecret(key: string): Promise<string | undefined> {
    return this.secrets.get(key);
  }

  async listSecretKeys(): Promise<string[]> {
    return [...this.secrets.keys()];
  }
}

export interface KmsOptions {
  region: string;
  keyId: string;
  mockSecrets?: Record<string, string>;
}

export class KmsSecretsManager implements SecretsManager {
  private secrets = new Map<string, string>();

  constructor(options: KmsOptions) {
    if (options.mockSecrets) {
      for (const [k, v] of Object.entries(options.mockSecrets)) {
        this.secrets.set(k, v);
      }
    }
  }

  async getSecret(key: string): Promise<string | undefined> {
    return this.secrets.get(key);
  }

  async listSecretKeys(): Promise<string[]> {
    return [...this.secrets.keys()];
  }
}

export interface EdaLicenseConfig {
  synopsysLicense?: string;
  cadenceLicense?: string;
  siemensLicense?: string;
  flexLmLicense?: string;
}

export class EdaLicenseInjector {
  constructor(
    private secretsManager?: SecretsManager,
    private redactor: SecretRedactor = new SecretRedactor()
  ) {}

  async buildEnv(config: EdaLicenseConfig = {}): Promise<Record<string, string>> {
    const env: Record<string, string> = {};

    const flex = config.flexLmLicense ?? (await this.secretsManager?.getSecret('LM_LICENSE_FILE'));
    if (flex) env.LM_LICENSE_FILE = flex;

    const snps = config.synopsysLicense ?? (await this.secretsManager?.getSecret('SNPSLMD_LICENSE_FILE'));
    if (snps) env.SNPSLMD_LICENSE_FILE = snps;

    const cds = config.cadenceLicense ?? (await this.secretsManager?.getSecret('CDS_LIC_FILE'));
    if (cds) env.CDS_LIC_FILE = cds;

    const mgls = config.siemensLicense ?? (await this.secretsManager?.getSecret('MGLS_LICENSE_FILE'));
    if (mgls) env.MGLS_LICENSE_FILE = mgls;

    return env;
  }

  redactOutput(text: string): string {
    return this.redactor.redact(text);
  }
}
