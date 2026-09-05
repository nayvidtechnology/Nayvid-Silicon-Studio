import { describe, it, expect } from 'vitest';
import { ComputeBroker, LicenseBroker } from '../src/index.js';

describe('Runner Fabric & Compute/License Broker', () => {
  it('manages EDA licenses correctly', () => {
    const licBroker = new LicenseBroker();
    const status = licBroker.getLicenseStatus('vcs');
    expect(status?.available).toBe(8);

    const reserved = licBroker.reserveLicenses(['vcs', 'innovus']);
    expect(reserved).toBe(true);

    const updated = licBroker.getLicenseStatus('vcs');
    expect(updated?.available).toBe(7);

    licBroker.releaseLicenses(['vcs', 'innovus']);
    expect(licBroker.getLicenseStatus('vcs')?.available).toBe(8);
  });

  it('selects compute environment and executes jobs', async () => {
    const broker = new ComputeBroker();
    const result = await broker.executeJob({
      id: 'job_101',
      command: 'verilator',
      args: ['--lint-only', 'counter.sv'],
      requirements: { cpus: 4 },
      preferredEnvironment: 'wsl',
    });

    expect(result.exitCode).toBe(0);
    expect(result.environmentUsed).toBe('wsl');
    expect(result.stdout).toContain('Executed');
  });
});
