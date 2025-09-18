export {};

declare global {
  interface Window {
    electron: {
      ipcRenderer: {
        send: (channel: string, ...args: any[]) => void;
        on: (channel: string, listener: (...args: any[]) => void) => void;
        off: (channel: string, listener?: (...args: any[]) => void) => void;
        request: (channel: string, ...args: any[]) => Promise<any>;
      };
    };
  }
}
