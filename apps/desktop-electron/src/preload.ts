import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('nayvidDesktop', {
  handleIPC: (channel: string, payload?: any) => ipcRenderer.invoke(channel, payload),
  on: (channel: string, callback: (...args: any[]) => void) => {
    ipcRenderer.on(channel, (_event, ...args) => callback(...args));
  },
});
