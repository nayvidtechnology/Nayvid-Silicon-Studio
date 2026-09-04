import { describe, it, expect } from 'vitest';
import { ExecutionRuntimeManager, WslBackend } from '../src/index.js';

describe('ExecutionRuntimeManager & Backends', () => {
  it('instantiates backends and resolves host/guest paths', () => {
    const manager = new ExecutionRuntimeManager();
    const win = manager.getBackend('native-windows');
    expect(win.type).toBe('native-windows');

    const hostPath = win.toHostPath('/c/project/rtl/top.sv');
    expect(hostPath).toContain('\\');

    const wsl = new WslBackend('Ubuntu');
    expect(wsl.toGuestPath('C:\\project\\rtl\\top.sv')).toBe('/mnt/c/project/rtl/top.sv');
    expect(wsl.toHostPath('/mnt/c/project/rtl/top.sv')).toBe('C:\\project\\rtl\\top.sv');
  });

  it('selects backend in auto mode', async () => {
    const manager = new ExecutionRuntimeManager();
    const backend = await manager.resolveBestBackend('auto');
    expect(backend).toBeDefined();
    expect(backend.type).toBeDefined();
  });
});
