import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("electron", {
  ipcRenderer: {
    send: (channel: string, ...args: any[]) => {
      ipcRenderer.send(channel, ...args);
    },
    on: (channel: string, listener: (...args: any[]) => void) => {
      ipcRenderer.on(channel, (_, ...args) => listener(...args));
    },
    off: (channel: string, listener?: (...args: any[]) => void) => {
      if (listener) {
        ipcRenderer.off(channel, listener);
      } else {
        ipcRenderer.removeAllListeners(channel);
      }
    },
    request: (channel: string, ...args: any[]): Promise<any> => {
      return ipcRenderer.invoke(channel, ...args);
    },
  },
});
