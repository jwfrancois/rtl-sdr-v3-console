/* eslint-disable @typescript-eslint/no-require-imports */
const electron = require("electron");
const { contextBridge, ipcRenderer } = electron;

contextBridge.exposeInMainWorld("desktopApi", {
  isDesktop: () => ipcRenderer.invoke("is-desktop"),
  getBridgeUrl: () => ipcRenderer.invoke("get-bridge-url"),
  getNextUrl: () => ipcRenderer.invoke("get-next-url"),
  restartRtlTcp: () => ipcRenderer.invoke("restart-rtl-tcp"),
});
