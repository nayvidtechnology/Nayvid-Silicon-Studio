import { describe, expect, it } from 'vitest';
import {
  ExecutionRuntimeManager,
  type ExecOptions,
  type ExecResult,
  type ExecutionBackend,
  type RuntimeType,
} from '@nayvid/execution-runtime';
import { BUILTIN_TOOLS, NayvidDoctorService, ToolRegistry } from '../src/index.js';

class FakeBackend implements ExecutionBackend {
  constructor(readonly type: RuntimeType, private available = true) {}
  async isAvailable(): Promise<boolean> { return this.available; }
  toHostPath(p: string): string { return p; }
  toGuestPath(p: string): string { return p; }
  async execute(command: string, _args: string[], _options?: ExecOptions): Promise<ExecResult> {
    if (command === 'missing-tool') return { code: 127, stdout: '', stderr: 'not found', durationMs: 1 };
    return { code: 0, stdout: `${command} 1.2.3`, stderr: '', durationMs: 1 };
  }
}

describe('ToolRegistry & Nayvid Doctor', () => {
  it('registers the expanded open-source EDA tool suite', () => {
    const registry = new ToolRegistry();
    expect(registry.getAllTools().length).toBe(BUILTIN_TOOLS.length);
    for (const id of ['slang', 'verible', 'iverilog', 'verilator', 'ghdl', 'cocotb', 'surfer', 'yosys', 'nextpnr', 'sby', 'openroad', 'opensta', 'klayout', 'ollama']) {
      expect(registry.getTool(id), `expected ${id} in registry`).toBeDefined();
    }
    expect(registry.getTool('openroad')?.supportedRuntimes['native-windows']).toBe('unsupported');
  });

  it('uses compatible runtimes and counts only zero-exit probes as installed', async () => {
    const registry = new ToolRegistry([
      {
        id: 'ok', name: 'OK Tool', category: 'language', binaryName: 'ok-tool', versionFlag: '--version',
        supportedRuntimes: { 'native-windows': 'unsupported', wsl2: 'preferred', linux: 'supported', docker: 'supported', auto: 'supported' },
      },
      {
        id: 'missing', name: 'Missing Tool', category: 'language', binaryName: 'missing-tool', versionFlag: '--version',
        supportedRuntimes: { 'native-windows': 'unsupported', wsl2: 'preferred', linux: 'supported', docker: 'supported', auto: 'supported' },
      },
    ]);
    const runtime = new ExecutionRuntimeManager([
      new FakeBackend('wsl2', true),
      new FakeBackend('docker', true),
    ]);
    const report = await new NayvidDoctorService(registry, runtime).runDiagnostics('auto');

    expect(report.checks).toHaveLength(2);
    expect(report.checks[0]).toMatchObject({ installed: true, runtimeUsed: 'wsl2' });
    expect(report.checks[1]).toMatchObject({ installed: false, runtimeUsed: 'wsl2' });
    expect(report.summary).toEqual({ total: 2, passed: 1, failed: 1 });
  });
});
