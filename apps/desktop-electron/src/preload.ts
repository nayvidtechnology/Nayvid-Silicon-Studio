import { contextBridge, ipcRenderer } from 'electron';

const ALLOWED_CHANNELS = new Set([
  'nayvid:doctor',
  'nayvid:exec',
  'navi:tool',
  'nayvid:read-file',
  'nayvid:write-file',
]);

contextBridge.exposeInMainWorld('nayvidDesktop', {
  handleIPC: (channel: string, payload?: unknown) => {
    if (!ALLOWED_CHANNELS.has(channel)) {
      return Promise.reject(new Error(`Desktop IPC channel '${channel}' is not allowed.`));
    }
    return ipcRenderer.invoke('desktop:ipc', { channel, payload });
  },
  openFileDialog: () => ipcRenderer.invoke('dialog:open-file'),
});
