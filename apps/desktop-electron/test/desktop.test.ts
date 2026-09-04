import { afterEach, describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { DesktopBridge } from '../src/main.js';
import type { ToolResult } from '@nayvid/agent-tools';

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nayvid-desktop-'));
  roots.push(root);
  fs.mkdirSync(path.join(root, 'rtl'));
  fs.writeFileSync(path.join(root, 'rtl', 'top.sv'), 'module top; endmodule\n');

  const doctor = {
    async runDiagnostics() {
      return { timestamp: new Date().toISOString(), platform: process.platform, checks: [], summary: { total: 0, passed: 0, failed: 0 } };
    },
  };
  const gateway = {
    async executeTool(name: string): Promise<ToolResult> {
      return { success: true, output: `executed ${name}` };
    },
  };
  return { root, bridge: new DesktopBridge({ workspaceRoot: root, doctor, gateway }) };
}

describe('Desktop Bridge IPC', () => {
  it('routes Doctor and NAVI tool calls through injected services', async () => {
    const { bridge } = fixture();
    const doctorRes = await bridge.handleIPC('nayvid:doctor', { runtime: 'auto' });
    expect(doctorRes.summary).toEqual({ total: 0, passed: 0, failed: 0 });

    const toolRes = await bridge.handleIPC('navi:tool', { name: 'run_simulation', args: {} });
    expect(toolRes).toEqual({ success: true, output: 'executed run_simulation' });
  });

  it('reads and writes files only inside the active workspace', async () => {
    const { bridge, root } = fixture();
    const read = await bridge.handleIPC('nayvid:read-file', { path: 'rtl/top.sv' });
    expect(read.success).toBe(true);
    expect(read.content).toContain('module top');

    await bridge.handleIPC('nayvid:write-file', { path: 'rtl/top.sv', content: 'module top2; endmodule\n' });
    expect(fs.readFileSync(path.join(root, 'rtl', 'top.sv'), 'utf-8')).toContain('top2');

    await expect(bridge.handleIPC('nayvid:read-file', { path: '../../etc/passwd' })).rejects.toThrow(/outside the active workspace/);
    await expect(bridge.handleIPC('nayvid:write-file', { path: '../escape.sv', content: 'x' })).rejects.toThrow(/outside the active workspace/);
  });

  it('rejects unknown IPC channels', async () => {
    const { bridge } = fixture();
    await expect(bridge.handleIPC('danger:unknown', {})).rejects.toThrow(/Unknown desktop IPC channel/);
  });
});
