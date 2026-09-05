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

function fakeStudio() {
  let privacy = 'ask-before-cloud';
  return {
    async openFile(filePath: string, content = '', topModule = 'top') {
      const moduleName = content.match(/\bmodule\s+([a-zA-Z_][a-zA-Z0-9_]*)/)?.[1] || topModule;
      return { topModule: moduleName, modules: { [moduleName]: { name: moduleName, file: filePath, ports: [], signals: [], instances: [], fsms: [], clockDomains: [], resetDomains: [] } } };
    },
    async getBlockDiagram() { return { nodes: [], edges: [] }; },
    async runSimulation() { return { timescale: '1ns', signals: [{ name: 'clk', values: [] }] }; },
    async askNavi(query: string) { return { providerId: 'fake', answer: `answer:${query}` }; },
    getTimeline() { return []; },
    setPrivacyPolicy(value: string) { privacy = value; },
    getPrivacyForTest() { return privacy; },
  };
}

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
  return {
    root,
    bridge: new DesktopBridge({ workspaceRoot: root, doctor, gateway, studioFactory: () => fakeStudio() }),
  };
}

describe('Desktop Bridge IPC', () => {
  it('routes Doctor, NAVI tool and main-process studio calls through injected services', async () => {
    const { bridge } = fixture();
    const doctorRes = await bridge.handleIPC('nayvid:doctor', { runtime: 'auto' });
    expect(doctorRes.summary).toEqual({ total: 0, passed: 0, failed: 0 });

    const toolRes = await bridge.handleIPC('navi:tool', { name: 'run_simulation', args: {} });
    expect(toolRes).toEqual({ success: true, output: 'executed run_simulation' });

    const graph = await bridge.handleIPC('nayvid:studio-open-file', { path: 'rtl/top.sv', content: 'module top; endmodule', topModule: 'top' });
    expect(graph.topModule).toBe('top');
    const navi = await bridge.handleIPC('nayvid:studio-navi', { query: 'why?' });
    expect(navi.answer).toBe('answer:why?');
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

  it('creates a complete starter chip project and activates it as the workspace', async () => {
    const { bridge } = fixture();
    const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'nayvid-project-parent-'));
    roots.push(parent);

    const project = await bridge.handleIPC('nayvid:project-create', { parentDirectory: parent, name: 'ALU Demo', topModule: 'alu_top' });
    expect(project.manifest.name).toBe('ALU Demo');
    expect(project.manifest.topModule).toBe('alu_top');
    expect(project.files).toContain('nayvid.project.json');
    expect(project.files).toContain('rtl/alu_top.sv');
    expect(project.files).toContain('tb/alu_top_tb.sv');
    expect(project.files).toContain('constraints/alu_top.sdc');
    expect(fs.existsSync(path.join(project.root, 'nayvid.project.json'))).toBe(true);

    const read = await bridge.handleIPC('nayvid:read-file', { path: 'rtl/alu_top.sv' });
    expect(read.content).toContain('module alu_top');
    const current = await bridge.handleIPC('nayvid:project-current');
    expect(current.root).toBe(project.root);
  });

  it('opens an existing project, rejects missing sources, and rebinds file confinement', async () => {
    const { bridge } = fixture();
    const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'nayvid-open-parent-'));
    roots.push(parent);
    const created = await bridge.handleIPC('nayvid:project-create', { parentDirectory: parent, name: 'Open Me', topModule: 'open_top' });

    const reopened = await bridge.handleIPC('nayvid:project-open', { path: created.manifestPath });
    expect(reopened.manifest.topModule).toBe('open_top');
    await expect(bridge.handleIPC('nayvid:read-file', { path: '../nayvid.project.json' })).rejects.toThrow(/outside the active workspace/);

    fs.unlinkSync(path.join(created.root, 'rtl', 'open_top.sv'));
    await expect(bridge.handleIPC('nayvid:project-open', { path: created.manifestPath })).rejects.toThrow(/Project source not found/);
  });

  it('rejects missing constraint files while opening governed projects', async () => {
    const { bridge } = fixture();
    const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'nayvid-constraint-parent-'));
    roots.push(parent);
    const created = await bridge.handleIPC('nayvid:project-create', { parentDirectory: parent, name: 'Constraint Check', topModule: 'constraint_top' });
    fs.unlinkSync(path.join(created.root, 'constraints', 'constraint_top.sdc'));
    await expect(bridge.handleIPC('nayvid:project-open', { path: created.manifestPath })).rejects.toThrow(/Constraint file not found/);
  });

  it('refuses unsafe project names and non-empty project targets', async () => {
    const { bridge } = fixture();
    const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'nayvid-name-parent-'));
    roots.push(parent);
    await expect(bridge.handleIPC('nayvid:project-create', { parentDirectory: parent, name: '../escape', topModule: 'top' })).rejects.toThrow(/Project name/);
    const occupied = path.join(parent, 'occupied');
    fs.mkdirSync(occupied);
    fs.writeFileSync(path.join(occupied, 'keep.txt'), 'do not overwrite');
    await expect(bridge.handleIPC('nayvid:project-create', { parentDirectory: parent, name: 'occupied', topModule: 'top' })).rejects.toThrow(/not empty/);
    expect(fs.readFileSync(path.join(occupied, 'keep.txt'), 'utf-8')).toBe('do not overwrite');
  });

  it('normalizes RTL deterministically and can persist the result', async () => {
    const { bridge } = fixture();
    const result = await bridge.handleIPC('nayvid:format-rtl', { path: 'rtl/top.sv', content: 'module top;   \r\nendmodule\t\r\n\r\n' });
    expect(result.content).toBe('module top;\nendmodule\n');
    expect(result.formatter).toBe('nayvid-whitespace-normalizer');
  });

  it('rejects unknown IPC channels', async () => {
    const { bridge } = fixture();
    await expect(bridge.handleIPC('danger:unknown', {})).rejects.toThrow(/Unknown desktop IPC channel/);
  });

  it('does not expose an unrestricted command execution IPC', async () => {
    const { bridge } = fixture();
    await expect(bridge.handleIPC('nayvid:exec', { command: 'sh', args: ['-c', 'echo unsafe'] }))
      .rejects.toThrow(/Unknown desktop IPC channel/);
  });
});
