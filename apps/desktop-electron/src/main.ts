import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import * as path from 'path';
import { fileURLToPath } from 'url';
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

export interface DesktopBridgeOptions {
  workspaceRoot?: string;
  runtimeManager?: ExecutionRuntimeManager;
  doctor?: DoctorLike;
  gateway?: GatewayLike;
}

export class DesktopBridge {
  private runtimeManager: ExecutionRuntimeManager;
  private doctor: DoctorLike;
  private gateway: GatewayLike;
  private workspaceRoot: string;

  constructor(options: DesktopBridgeOptions = {}) {
    this.workspaceRoot = path.resolve(options.workspaceRoot ?? process.cwd());
    this.runtimeManager = options.runtimeManager ?? new ExecutionRuntimeManager();
    this.doctor = options.doctor ?? new NayvidDoctorService();
    this.gateway = options.gateway ?? new AgentToolGateway(this.runtimeManager, { workspaceRoot: this.workspaceRoot });
  }

  private resolveWorkspacePath(inputPath: string): string {
    const resolved = path.resolve(this.workspaceRoot, inputPath);
    const relative = path.relative(this.workspaceRoot, resolved);
    if (relative.startsWith('..') || path.isAbsolute(relative)) {
      throw new Error(`Path '${inputPath}' is outside the active workspace.`);
    }
    return resolved;
  }

  async handleIPC(channel: string, payload: any = {}): Promise<any> {
    switch (channel) {
      case 'nayvid:doctor':
        return this.doctor.runDiagnostics(payload.runtime ?? 'auto');
      case 'nayvid:exec': {
        if (!payload.command || typeof payload.command !== 'string') throw new Error('Executable command is required.');
        const backend = await this.runtimeManager.resolveBestBackend(payload.runtime ?? 'auto');
        return backend.execute(payload.command, payload.args || [], payload.options);
      }
      case 'navi:tool':
        return this.gateway.executeTool(payload.name, payload.args || {}, payload.approved ?? false);
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
      sandbox: false,
    },
    autoHideMenuBar: true,
    show: false,
  });

  const possiblePaths = [
    path.join(__dirname, '../../renderer/index.html'),
    path.join(__dirname, '../renderer/index.html'),
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
  if (!loaded) void mainWindow.loadFile(path.join(__dirname, '../../renderer/index.html'));

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
    createMainWindow();
    app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createMainWindow(); });
  });
  app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
}

if (process.versions.electron && !process.env.VITEST) startDesktopApp();
