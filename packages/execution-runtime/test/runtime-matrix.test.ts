import { describe, expect, it } from 'vitest';
import { ExecutionRuntimeManager, type ExecOptions, type ExecResult, type ExecutionBackend, type RuntimeType } from '../src/index.js';

class FakeBackend implements ExecutionBackend {
  constructor(readonly type: RuntimeType, private available: boolean) {}
  async isAvailable(): Promise<boolean> { return this.available; }
  toHostPath(p: string): string { return p; }
  toGuestPath(p: string): string { return p; }
  async execute(_command: string, _args: string[], _options?: ExecOptions): Promise<ExecResult> {
    return { code: 0, stdout: 'ok', stderr: '', durationMs: 1 };
  }
}

describe('runtime support-matrix resolution', () => {
  it('never selects a runtime explicitly marked unsupported', async () => {
    const manager = new ExecutionRuntimeManager([
      new FakeBackend('native-windows', true),
      new FakeBackend('wsl2', true),
      new FakeBackend('docker', true),
    ]);

    const backend = await manager.resolveBestBackendFor({
      'native-windows': 'unsupported',
      wsl2: 'preferred',
      docker: 'supported',
    });

    expect(backend.type).toBe('wsl2');
  });

  it('falls back from unavailable preferred runtime to supported runtime', async () => {
    const manager = new ExecutionRuntimeManager([
      new FakeBackend('wsl2', false),
      new FakeBackend('docker', true),
    ]);

    const backend = await manager.resolveBestBackendFor({
      wsl2: 'preferred',
      docker: 'supported',
      'native-windows': 'unsupported',
      linux: 'unsupported',
    });

    expect(backend.type).toBe('docker');
  });

  it('fails instead of silently choosing an unsupported backend', async () => {
    const manager = new ExecutionRuntimeManager([
      new FakeBackend('native-windows', true),
    ]);

    await expect(manager.resolveBestBackendFor({
      'native-windows': 'unsupported',
    })).rejects.toThrow(/No available execution backend/);
  });
});
