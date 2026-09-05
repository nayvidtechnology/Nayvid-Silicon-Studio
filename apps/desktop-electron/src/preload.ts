import { contextBridge, ipcRenderer } from 'electron';

const ALLOWED_CHANNELS = new Set([
  'nayvid:doctor',
  'nayvid:exec',
  'navi:tool',
  'nayvid:project-create',
  'nayvid:project-open',
  'nayvid:project-current',
  'nayvid:project-files',
  'nayvid:read-file',
  'nayvid:write-file',
  'nayvid:format-rtl',
  'nayvid:studio-open-file',
  'nayvid:studio-diagram',
  'nayvid:studio-simulation',
  'nayvid:studio-navi',
  'nayvid:studio-timeline',
  'nayvid:studio-privacy',
]);

contextBridge.exposeInMainWorld('nayvidDesktop', {
  handleIPC: (channel: string, payload?: unknown) => {
    if (!ALLOWED_CHANNELS.has(channel)) {
      return Promise.reject(new Error(`Desktop IPC channel '${channel}' is not allowed.`));
    }
    return ipcRenderer.invoke('desktop:ipc', { channel, payload });
  },
  openFileDialog: () => ipcRenderer.invoke('dialog:open-file'),
  selectDirectory: () => ipcRenderer.invoke('dialog:select-directory'),
  openProjectDialog: () => ipcRenderer.invoke('dialog:open-project'),
});
