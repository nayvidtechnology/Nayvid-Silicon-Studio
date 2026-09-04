import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import * as path from 'path';
import { fileURLToPath } from 'url';
import * as fs from 'fs';
import { ExecutionRuntimeManager } from '@nayvid/execution-runtime';
import { NayvidDoctorService } from '@nayvid/tool-registry';
import { AgentToolGateway } from '@nayvid/agent-tools';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class DesktopBridge {
  private runtimeManager = new ExecutionRuntimeManager();
  private doctor = new NayvidDoctorService();
  private gateway = new AgentToolGateway();

  async handleIPC(channel: string, payload: any): Promise<any> {
    switch (channel) {
      case 'nayvid:doctor':
        return await this.doctor.runDiagnostics(payload?.runtime ?? 'auto');
      case 'nayvid:exec':
        const backend = await this.runtimeManager.resolveBestBackend(payload?.runtime ?? 'auto');
        return await backend.execute(payload.command, payload.args || [], payload.options);
      case 'navi:tool':
        return await this.gateway.executeTool(payload.name, payload.args || {}, payload.approved ?? false);
      case 'nayvid:read-file':
        const targetPath = payload.path;
        if (fs.existsSync(targetPath)) {
          return { success: true, content: fs.readFileSync(targetPath, 'utf-8') };
        }
        return { success: false, error: 'File not found' };
      case 'nayvid:write-file':
        fs.writeFileSync(payload.path, payload.content, 'utf-8');
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
      sandbox: false,
    },
    autoHideMenuBar: true,
    show: false,
  });

  // Look for renderer index.html
  const possiblePaths = [
    path.join(__dirname, '../../renderer/index.html'),
    path.join(__dirname, '../renderer/index.html'),
    path.join(__dirname, 'index.html'),
  ];

  let loaded = false;
  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      mainWindow.loadFile(p);
      loaded = true;
      break;
    }
  }

  if (!loaded) {
    mainWindow.loadFile(path.join(__dirname, '../../renderer/index.html'));
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  return mainWindow;
}

export function startDesktopApp(): void {
  if (app) {
    app.whenReady().then(() => {
      // IPC Handler
      ipcMain.handle('desktop:ipc', async (_event, { channel, payload }) => {
        return await bridge.handleIPC(channel, payload);
      });

      ipcMain.handle('dialog:open-file', async () => {
        if (!mainWindow) return null;
        const result = await dialog.showOpenDialog(mainWindow, {
          properties: ['openFile'],
          filters: [{ name: 'HDL Files', extensions: ['sv', 'v', 'vhd', 'vhdl'] }],
        });
        return result.canceled ? null : result.filePaths[0];
      });

      createMainWindow();

      app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
          createMainWindow();
        }
      });
    });

    app.on('window-all-closed', () => {
      if (process.platform !== 'darwin') {
        app.quit();
      }
    });
  }
}

// Auto-start when executed as Electron main entry
if (process.versions.electron && !process.env.VITEST) {
  startDesktopApp();
}
