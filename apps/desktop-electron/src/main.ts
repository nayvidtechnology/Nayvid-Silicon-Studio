import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import * as path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import * as fs from 'fs';
import { ExecutionRuntimeManager, type RuntimeType } from '@nayvid/execution-runtime';
import { NayvidDoctorService } from '@nayvid/tool-registry';
import { AgentToolGateway, type ToolResult } from '@nayvid/agent-tools';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface DoctorLike {
  runDiagnostics(runtime?: RuntimeType): Promise<any>;
}
interface GatewayLike {
  executeTool(name: string, args: Record<string, any>, approved?: boolean): Promise<ToolResult>;
}
interface StudioLike {
  openFile(filePath: string, customContent?: string, topModule?: string): Promise<any>;
  getBlockDiagram(): Promise<any>;
  runSimulation(request: { topModule?: string; files: string[]; output?: string; waveformPath: string }): Promise<any>;
  askNavi(query: string, skill?: any, options?: any): Promise<any>;
  getTimeline(): any[];
  setPrivacyPolicy(policy: any): void;
}

export interface DesktopProjectManifest {
  schemaVersion: 1;
  name: string;
  topModule: string;
  sources: string[];
  includeDirs?: string[];
  constraints?: string[];
  verification?: { testbenchTop: string; sources: string[]; output?: string; waveformPath: string };
  defines?: Record<string, string | number | boolean>;
  parameters?: Record<string, string | number | boolean>;
  toolchain?: Array<{ toolId: string; version?: string; required?: boolean; runtimes?: Array<'native-windows' | 'wsl2' | 'linux' | 'docker'> }>;
  signoff?: { requireCompile?: boolean; requireSimulation?: boolean; requireToolchainLock?: boolean };
  security?: { allowedRuntimes?: Array<'native-windows' | 'wsl2' | 'linux' | 'docker'>; cloudAi?: 'disabled' | 'approval-required' | 'allowed'; requireLockedToolchain?: boolean };
}

export interface DesktopProjectDescriptor {
  root: string;
  manifestPath: string;
  manifest: DesktopProjectManifest;
  files: string[];
}

export interface DesktopBridgeOptions {
  workspaceRoot?: string;
  runtimeManager?: ExecutionRuntimeManager;
  doctor?: DoctorLike;
  gateway?: GatewayLike;
  studioFactory?: (gateway: GatewayLike) => StudioLike;
}

function toPosix(value: string): string {
  return value.replace(/\\/g, '/');
}

function safeProjectFolder(name: string): string {
  const folder = name.trim().replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
  if (!folder) throw new Error('Project name must contain at least one letter or number.');
  return folder;
}

function validateProjectName(name: string): void {
  if (!name?.trim()) throw new Error('Project name is required.');
  if (name.length > 80) throw new Error('Project name must be 80 characters or fewer.');
  if (!/^[a-zA-Z0-9][a-zA-Z0-9 ._-]*$/.test(name)) {
    throw new Error('Project name may contain letters, numbers, spaces, dot, underscore and dash only.');
  }
}

function validateModuleName(name: string): void {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) throw new Error(`Invalid SystemVerilog top module name: ${name}`);
}

function validateManifest(manifest: DesktopProjectManifest): string[] {
  const errors: string[] = [];
  if (manifest.schemaVersion !== 1) errors.push('schemaVersion must be 1');
  if (!manifest.name?.trim()) errors.push('Project name is required');
  if (!manifest.topModule?.trim()) errors.push('topModule is required');
  if (!manifest.sources?.length) errors.push('At least one RTL source is required');
  const validateRelative = (value: string, label: string) => {
    if (!value || path.isAbsolute(value) || value.split(/[\\/]+/).includes('..')) errors.push(`${label} must stay inside the project workspace: ${value}`);
  };
  for (const source of manifest.sources ?? []) validateRelative(source, 'Source path');
  for (const source of manifest.verification?.sources ?? []) validateRelative(source, 'Verification source path');
  for (const source of manifest.constraints ?? []) validateRelative(source, 'Constraint path');
  return errors;
}

function loadManifest(filePath: string): DesktopProjectManifest {
  const manifest = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as DesktopProjectManifest;
  const errors = validateManifest(manifest);
  if (errors.length) throw new Error(`Invalid project manifest: ${errors.join('; ')}`);
  return manifest;
}

function defaultRtl(topModule: string): string {
  return `module ${topModule} (\n  input  logic       clk,\n  input  logic       rst_n,\n  input  logic       enable,\n  output logic [1:0] count,\n  output logic       done\n);\n\n  always_ff @(posedge clk or negedge rst_n) begin\n    if (!rst_n) begin\n      count <= 2'b00;\n      done  <= 1'b0;\n    end else if (enable) begin\n      if (count == 2'b11) begin\n        count <= 2'b00;\n        done  <= 1'b1;\n      end else begin\n        count <= count + 1'b1;\n        done  <= 1'b0;\n      end\n    end\n  end\nendmodule\n`;
}

function defaultTestbench(topModule: string): string {
  const tb = `${topModule}_tb`;
  return `\`timescale 1ns/1ps\nmodule ${tb};\n  logic clk = 0;\n  logic rst_n = 0;\n  logic enable = 0;\n  logic [1:0] count;\n  logic done;\n\n  ${topModule} dut (.clk, .rst_n, .enable, .count, .done);\n  always #5 clk = ~clk;\n\n  initial begin\n    $dumpfile("sim.vcd");\n    $dumpvars(0, ${tb});\n    #12 rst_n = 1; enable = 1;\n    repeat (4) @(posedge clk);\n    #1;\n    if (count !== 2'b00 || done !== 1'b1) $fatal(1, "counter rollover failed");\n    $display("PASS: ${topModule} rollover verified");\n    #5 $finish;\n  end\nendmodule\n`;
}

function defaultSdc(topModule: string): string {
  return `# Nayvid Silicon Studio starter constraints for ${topModule}\ncreate_clock -name core_clk -period 10.000 [get_ports clk]\n`;
}

export class DesktopBridge {
  private runtimeManager: ExecutionRuntimeManager;
  private doctor: DoctorLike;
  private gateway: GatewayLike;
  private workspaceRoot: string;
  private activeProject?: DesktopProjectDescriptor;
  private injectedGateway?: GatewayLike;
  private studioFactory?: (gateway: GatewayLike) => StudioLike;
  private studio?: StudioLike;

  constructor(options: DesktopBridgeOptions = {}) {
    this.workspaceRoot = path.resolve(options.workspaceRoot ?? process.cwd());
    this.runtimeManager = options.runtimeManager ?? new ExecutionRuntimeManager();
    this.doctor = options.doctor ?? new NayvidDoctorService();
    this.injectedGateway = options.gateway;
    this.gateway = options.gateway ?? new AgentToolGateway(this.runtimeManager, { workspaceRoot: this.workspaceRoot });
    this.studioFactory = options.studioFactory;
    if (this.studioFactory) this.studio = this.studioFactory(this.gateway);
  }

  private activateWorkspace(root: string): void {
    this.workspaceRoot = path.resolve(root);
    this.gateway = this.injectedGateway ?? new AgentToolGateway(this.runtimeManager, { workspaceRoot: this.workspaceRoot });
    this.studio = this.studioFactory ? this.studioFactory(this.gateway) : undefined;
  }

  private async getStudio(): Promise<StudioLike> {
    if (this.studio) return this.studio;
    const appModulePath = path.resolve(__dirname, '../../renderer/dist/app.js');
    if (!fs.existsSync(appModulePath)) throw new Error(`Renderer Studio core is not built: ${appModulePath}`);
    const module = await import(pathToFileURL(appModulePath).href);
    this.studio = new module.SiliconStudioApp({ agentGateway: this.gateway }) as StudioLike;
    return this.studio;
  }

  private resolveWorkspacePath(inputPath: string): string {
    const resolved = path.resolve(this.workspaceRoot, inputPath);
    const relative = path.relative(this.workspaceRoot, resolved);
    if (relative.startsWith('..') || path.isAbsolute(relative)) {
      throw new Error(`Path '${inputPath}' is outside the active workspace.`);
    }
    return resolved;
  }

  private listProjectFiles(root = this.workspaceRoot): string[] {
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.name === '.git' || entry.name === '.nayvid' || entry.name === 'node_modules') continue;
        const absolute = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(absolute);
        else files.push(toPosix(path.relative(root, absolute)));
      }
    };
    if (fs.existsSync(root)) walk(root);
    return files.sort();
  }

  private verifyManifestFiles(root: string, manifest: DesktopProjectManifest): void {
    const validate = (source: string, label: string) => {
      const absolute = path.resolve(root, source);
      const relative = path.relative(root, absolute);
      if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error(`${label} escapes project root: ${source}`);
      if (!fs.existsSync(absolute) || !fs.statSync(absolute).isFile()) throw new Error(`${label} not found: ${source}`);
    };
    for (const source of manifest.sources) validate(source, 'Project source');
    for (const source of manifest.verification?.sources ?? []) validate(source, 'Verification source');
    for (const source of manifest.constraints ?? []) validate(source, 'Constraint file');
  }

  createProject(input: { parentDirectory: string; name: string; topModule?: string }): DesktopProjectDescriptor {
    const parent = path.resolve(input.parentDirectory || '');
    if (!fs.existsSync(parent) || !fs.statSync(parent).isDirectory()) throw new Error(`Project parent directory does not exist: ${input.parentDirectory}`);
    validateProjectName(input.name);
    const topModule = (input.topModule || 'top').trim();
    validateModuleName(topModule);
    const root = path.join(parent, safeProjectFolder(input.name));
    if (fs.existsSync(root) && fs.readdirSync(root).length > 0) throw new Error(`Project directory is not empty: ${root}`);

    let createdRoot = false;
    try {
      if (!fs.existsSync(root)) {
        fs.mkdirSync(root, { recursive: false });
        createdRoot = true;
      }
      fs.mkdirSync(path.join(root, 'rtl'), { recursive: true });
      fs.mkdirSync(path.join(root, 'tb'), { recursive: true });
      fs.mkdirSync(path.join(root, 'constraints'), { recursive: true });

      const rtlPath = `rtl/${topModule}.sv`;
      const tbPath = `tb/${topModule}_tb.sv`;
      const sdcPath = `constraints/${topModule}.sdc`;
      const manifest: DesktopProjectManifest = {
        schemaVersion: 1,
        name: input.name.trim(),
        topModule,
        sources: [rtlPath],
        constraints: [sdcPath],
        verification: {
          testbenchTop: `${topModule}_tb`,
          sources: [tbPath],
          output: `.nayvid/sim/${topModule}_tb.out`,
          waveformPath: 'sim.vcd',
        },
        toolchain: [
          { toolId: 'slang', required: false },
          { toolId: 'verilator', required: false },
          { toolId: 'iverilog', required: true },
          { toolId: 'yosys', required: false },
        ],
        signoff: { requireCompile: true, requireSimulation: true, requireToolchainLock: false },
        security: { cloudAi: 'approval-required' },
      };
      const errors = validateManifest(manifest);
      if (errors.length) throw new Error(`Generated project manifest is invalid: ${errors.join('; ')}`);

      fs.writeFileSync(path.join(root, rtlPath), defaultRtl(topModule), 'utf-8');
      fs.writeFileSync(path.join(root, tbPath), defaultTestbench(topModule), 'utf-8');
      fs.writeFileSync(path.join(root, sdcPath), defaultSdc(topModule), 'utf-8');
      fs.writeFileSync(path.join(root, 'README.md'), `# ${input.name.trim()}\n\nCreated with Nayvid Silicon Studio.\n`, 'utf-8');
      const manifestPath = path.join(root, 'nayvid.project.json');
      fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf-8');
      return this.openProject(manifestPath);
    } catch (error) {
      if (createdRoot) fs.rmSync(root, { recursive: true, force: true });
      throw error;
    }
  }

  openProject(inputPath: string): DesktopProjectDescriptor {
    const candidate = path.resolve(inputPath);
    const manifestPath = fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()
      ? path.join(candidate, 'nayvid.project.json')
      : candidate;
    if (!fs.existsSync(manifestPath) || !fs.statSync(manifestPath).isFile()) throw new Error(`Nayvid project manifest not found: ${inputPath}`);
    const manifest = loadManifest(manifestPath);
    const root = path.dirname(manifestPath);
    this.verifyManifestFiles(root, manifest);
    this.activateWorkspace(root);
    this.activeProject = { root, manifestPath, manifest, files: this.listProjectFiles(root) };
    return this.activeProject;
  }

  getActiveProject(): DesktopProjectDescriptor | null {
    if (!this.activeProject) return null;
    return { ...this.activeProject, files: this.listProjectFiles(this.activeProject.root) };
  }

  private normalizeRtl(content: string): string {
    return `${content.replace(/\r\n/g, '\n').split('\n').map((line) => line.replace(/[\t ]+$/g, '')).join('\n').trimEnd()}\n`;
  }

  async handleIPC(channel: string, payload: any = {}): Promise<any> {
    switch (channel) {
      case 'nayvid:doctor':
        return this.doctor.runDiagnostics(payload.runtime ?? 'auto');
      case 'navi:tool':
        return this.gateway.executeTool(payload.name, payload.args || {}, payload.approved ?? false);
      case 'nayvid:project-create':
        return this.createProject(payload);
      case 'nayvid:project-open':
        return this.openProject(payload.path);
      case 'nayvid:project-current':
        return this.getActiveProject();
      case 'nayvid:project-files':
        return this.activeProject ? this.listProjectFiles(this.activeProject.root) : [];
      case 'nayvid:read-file': {
        const targetPath = this.resolveWorkspacePath(payload.path);
        if (!fs.existsSync(targetPath) || !fs.statSync(targetPath).isFile()) return { success: false, error: 'File not found' };
        return { success: true, content: fs.readFileSync(targetPath, 'utf-8') };
      }
      case 'nayvid:write-file': {
        const targetPath = this.resolveWorkspacePath(payload.path);
        if (!fs.existsSync(path.dirname(targetPath))) throw new Error('Parent directory does not exist.');
        fs.writeFileSync(targetPath, String(payload.content ?? ''), 'utf-8');
        return { success: true };
      }
      case 'nayvid:format-rtl': {
        const content = this.normalizeRtl(String(payload.content ?? ''));
        if (payload.path) {
          const targetPath = this.resolveWorkspacePath(payload.path);
          fs.writeFileSync(targetPath, content, 'utf-8');
        }
        return { success: true, content, formatter: 'nayvid-whitespace-normalizer' };
      }
      case 'nayvid:studio-open-file':
        return (await this.getStudio()).openFile(payload.path, payload.content, payload.topModule ?? this.activeProject?.manifest.topModule);
      case 'nayvid:studio-diagram':
        return (await this.getStudio()).getBlockDiagram();
      case 'nayvid:studio-simulation':
        return (await this.getStudio()).runSimulation(payload);
      case 'nayvid:studio-navi':
        return (await this.getStudio()).askNavi(payload.query, payload.skill, payload.options);
      case 'nayvid:studio-timeline':
        return (await this.getStudio()).getTimeline();
      case 'nayvid:studio-privacy':
        (await this.getStudio()).setPrivacyPolicy(payload.policy);
        return { success: true };
      default:
        throw new Error(`Unknown desktop IPC channel: ${channel}`);
    }
  }
}

let mainWindow: BrowserWindow | null = null;
const bridge = new DesktopBridge();

export function createMainWindow(): BrowserWindow {
  mainWindow = new BrowserWindow({
    width: 1520,
    height: 940,
    minWidth: 1024,
    minHeight: 700,
    title: 'Nayvid Silicon Studio',
    backgroundColor: '#0a0d14',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
    autoHideMenuBar: true,
    show: false,
  });

  // The workbench is a local application. Never allow project content or links to
  // turn its privileged window into a general-purpose browser.
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.webContents.on('will-navigate', (event, navigationUrl) => {
    if (navigationUrl !== mainWindow?.webContents.getURL()) event.preventDefault();
  });

  const possiblePaths = [
    path.join(__dirname, '../../renderer/dist/index.html'),
    path.join(__dirname, '../../renderer/index.html'),
    path.join(__dirname, '../renderer/dist/index.html'),
    path.join(__dirname, 'index.html'),
  ];

  let loaded = false;
  for (const candidate of possiblePaths) {
    if (fs.existsSync(candidate)) {
      void mainWindow.loadFile(candidate);
      loaded = true;
      break;
    }
  }
  if (!loaded) void mainWindow.loadFile(path.join(__dirname, '../../renderer/dist/index.html'));

  mainWindow.once('ready-to-show', () => mainWindow?.show());
  mainWindow.on('closed', () => { mainWindow = null; });
  return mainWindow;
}

export function startDesktopApp(): void {
  if (!app) return;
  void app.whenReady().then(() => {
    ipcMain.handle('desktop:ipc', async (_event, { channel, payload }) => bridge.handleIPC(channel, payload));
    ipcMain.handle('dialog:open-file', async () => {
      if (!mainWindow) return null;
      const result = await dialog.showOpenDialog(mainWindow, {
        properties: ['openFile'],
        filters: [{ name: 'HDL Files', extensions: ['sv', 'v', 'vhd', 'vhdl'] }],
      });
      return result.canceled ? null : result.filePaths[0];
    });
    ipcMain.handle('dialog:select-directory', async () => {
      if (!mainWindow) return null;
      const result = await dialog.showOpenDialog(mainWindow, { properties: ['openDirectory', 'createDirectory'] });
      return result.canceled ? null : result.filePaths[0];
    });
    ipcMain.handle('dialog:open-project', async () => {
      if (!mainWindow) return null;
      const result = await dialog.showOpenDialog(mainWindow, {
        properties: ['openFile'],
        filters: [{ name: 'Nayvid Project', extensions: ['json'] }],
      });
      return result.canceled ? null : result.filePaths[0];
    });
    createMainWindow();
    app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createMainWindow(); });
  });
  app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
}

if (process.versions.electron && !process.env.VITEST) startDesktopApp();
