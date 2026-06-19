const { app, BrowserWindow, Menu, ipcMain, dialog } = require("electron");
const path = require("path");
const net = require("net");
const fs = require("fs");

let mainWindow;
let resolvedPort = null;
let serverStarted = false;
let syncEngine = null;

// electron-updater — loaded lazily so dev runs without it don't error
let autoUpdater = null;
try {
  autoUpdater = require("electron-updater").autoUpdater;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.logger = null; // keep logs out of prod; enable for debugging
} catch (_) { /* not installed — dev environment */ }

/** Find an available TCP port, trying preferred first then OS-assigned. */
function findAvailablePort(preferred) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.listen(preferred, "127.0.0.1", () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
    server.on("error", () => {
      // Preferred port taken — let OS pick
      const s = net.createServer();
      s.listen(0, "127.0.0.1", () => {
        const { port } = s.address();
        s.close(() => resolve(port));
      });
    });
  });
}

/** Resolve window icon path safely — return undefined if file doesn't exist. */
function getIconPath() {
  const candidates = [
    path.join(__dirname, "build", "icon.png"),
    path.join(__dirname, "build", "icon.ico"),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return undefined;
}

function createWindow(port) {
  const iconPath = getIconPath();
  mainWindow = new BrowserWindow({
    width: 1366,
    height: 768,
    minWidth: 800,
    minHeight: 600,
    title: "ERP Van Sales - إدارة مبيعات الشاحنات",
    ...(iconPath ? { icon: iconPath } : {}),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, "preload.js"),
    },
    show: false,
  });

  Menu.setApplicationMenu(null);

  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
    mainWindow.focus();
  });

  mainWindow.loadURL(`http://127.0.0.1:${port}`);

  mainWindow.webContents.on("did-fail-load", () => {
    const fallback = path.join(__dirname, "renderer", "index.html");
    if (fs.existsSync(fallback)) mainWindow.loadFile(fallback);
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

async function startServer() {
  if (serverStarted && resolvedPort) return resolvedPort;
  const preferred = 37891;
  resolvedPort = await findAvailablePort(preferred);

  // Create sync engine before server init so index.js can wire it in
  syncEngine = require("./server/sync-engine");

  const { initServer } = require("./server/index");
  await initServer(resolvedPort, app.getPath("userData"), syncEngine);
  serverStarted = true;

  // Start auto-sync loop (first sync fires after 3s delay internally)
  syncEngine.start();

  // Forward sync status changes to renderer via IPC
  syncEngine.onStatus((status) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("sync-status", status);
    }
  });

  return resolvedPort;
}

app.whenReady().then(async () => {
  try {
    const port = await startServer();
    createWindow(port);
  } catch (err) {
    dialog.showErrorBox("خطأ في بدء التطبيق", err.message);
    app.quit();
    return;
  }

  // Auto-update — only runs in packaged app (not in `electron .` dev mode)
  if (autoUpdater && app.isPackaged) {
    autoUpdater.on("update-available", () => {
      if (mainWindow && !mainWindow.isDestroyed())
        mainWindow.webContents.send("update-available");
    });
    autoUpdater.on("update-downloaded", () => {
      if (mainWindow && !mainWindow.isDestroyed())
        mainWindow.webContents.send("update-downloaded");
    });
    autoUpdater.on("error", (e) => {
      // Silently log — update failures must never crash the app
      console.error("[updater]", e.message);
    });
    // Delay the first check so the UI is fully loaded
    setTimeout(() => {
      autoUpdater.checkForUpdatesAndNotify().catch(() => {});
    }, 15000);
  }
});

app.on("window-all-closed", () => {
  if (syncEngine) syncEngine.stop();
  app.quit();
});

app.on("activate", () => {
  if (mainWindow === null && resolvedPort) createWindow(resolvedPort);
});

// ── IPC handlers ─────────────────────────────────────────────────────────────

ipcMain.handle("backup-db", async () => {
  const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
    title: "حفظ نسخة احتياطية",
    defaultPath: `erp-van-sales-backup-${new Date().toISOString().slice(0,10)}.db`,
    filters: [{ name: "SQLite Database", extensions: ["db"] }],
  });
  if (canceled || !filePath) return { success: false, canceled: true };
  try {
    const { backupDb } = require("./server/db");
    await backupDb(filePath);
    return { success: true, path: filePath };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle("restore-db", async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
    title: "اختر ملف النسخة الاحتياطية",
    filters: [{ name: "SQLite Database", extensions: ["db"] }],
    properties: ["openFile"],
  });
  if (canceled || !filePaths?.length) return { success: false, canceled: true };
  try {
    const { closeDb } = require("./server/db");
    closeDb();
    const dbDest = path.join(app.getPath("userData"), "erp-van-sales.db");
    fs.copyFileSync(filePaths[0], dbDest);
    setTimeout(() => { app.relaunch(); app.exit(0); }, 800);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle("get-sync-status", () => {
  if (!syncEngine) return { online: false, syncing: false, lastSync: null, error: null, pending: 0 };
  return syncEngine.getStatus();
});

ipcMain.handle("save-sync-credentials", async (_event, { username, password }) => {
  if (!syncEngine) return { ok: false, error: "Sync engine not ready" };
  syncEngine.saveCredentials(username, password);
  syncEngine.syncOnce().catch(() => {});
  return { ok: true };
});

ipcMain.handle("trigger-sync", async () => {
  if (!syncEngine) return { ok: false, error: "Sync engine not ready" };
  syncEngine.syncOnce().catch(() => {});
  return { ok: true };
});

ipcMain.handle("reset-sync", async () => {
  if (!syncEngine) return { ok: false, error: "Sync engine not ready" };
  syncEngine.resetSync();
  syncEngine.syncOnce().catch(() => {});
  return { ok: true };
});

ipcMain.handle("install-update", () => {
  if (autoUpdater) autoUpdater.quitAndInstall();
});
