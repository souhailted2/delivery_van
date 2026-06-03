const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  checkOnline: () => ipcRenderer.invoke("check-online"),
  getVersion:  () => ipcRenderer.invoke("get-app-version"),
  backupDb:    () => ipcRenderer.invoke("backup-db"),
  restoreDb:   () => ipcRenderer.invoke("restore-db"),
  isElectron: true,
});
