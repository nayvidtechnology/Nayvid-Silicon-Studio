import { describe, it, expect } from 'vitest';
import { ToolRegistry, NayvidDoctorService, BUILTIN_TOOLS } from '../src/index.js';

describe('ToolRegistry & Nayvid Doctor', () => {
  it('registers builtin EDA tools', () => {
    const registry = new ToolRegistry();
    expect(registry.getAllTools().length).toBeGreaterThanOrEqual(BUILTIN_TOOLS.length);

    const slang = registry.getTool('slang');
    expect(slang).toBeDefined();
    expect(slang?.category).toBe('language');
  });

  it('runs diagnostic checks and returns doctor report format', async () => {
    const doctor = new NayvidDoctorService();
    const report = await doctor.runDiagnostics('auto');

    expect(report.timestamp).toBeDefined();
    expect(report.platform).toBe(process.platform);
    expect(report.checks.length).toBeGreaterThan(0);
    expect(report.summary.total).toBe(report.checks.length);
  });
});
