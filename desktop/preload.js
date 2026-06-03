const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  checkOnline:         () => ipcRenderer.invoke("check-online"),
  getVersion:          () => ipcRenderer.invoke("get-app-version"),
  backupDb:            (destPath) => ipcRenderer.invoke("backup-db", destPath),
  restoreDb:           (srcPath)  => ipcRenderer.invoke("restore-db", srcPath),
  isElectron: true,

  // Auto-sync IPC
  getSyncStatus:       ()                    => ipcRenderer.invoke("get-sync-status"),
  saveSyncCredentials: ({ username, password }) => ipcRenderer.invoke("save-sync-credentials", { username, password }),
  triggerSync:         ()                    => ipcRenderer.invoke("trigger-sync"),

  // Listen for push sync-status events from main
  onSyncStatus: (callback) => {
    ipcRenderer.on("sync-status", (_event, status) => callback(status));
  },
  removeSyncStatusListener: () => {
    ipcRenderer.removeAllListeners("sync-status");
  },
});
