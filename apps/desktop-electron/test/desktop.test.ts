import { describe, it, expect } from 'vitest';
import { DesktopBridge } from '../src/main.js';

describe('Desktop Bridge IPC', () => {
  it('handles doctor, exec, and navi tool IPC channels', async () => {
    const bridge = new DesktopBridge();

    const doctorRes = await bridge.handleIPC('nayvid:doctor', { runtime: 'auto' });
    expect(doctorRes.summary).toBeDefined();

    const toolRes = await bridge.handleIPC('navi:tool', { name: 'run_simulation', args: { testName: 'tb_counter' } });
    expect(toolRes.success).toBe(true);
  });
});
