const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  checkOnline: () => ipcRenderer.invoke("check-online"),
  getVersion: () => ipcRenderer.invoke("get-app-version"),
  isElectron: true,
});
