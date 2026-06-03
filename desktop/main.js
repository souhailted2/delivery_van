const { app, BrowserWindow, Menu, ipcMain, dialog } = require("electron");
const path = require("path");
const net = require("net");
const fs = require("fs");

let mainWindow;
let resolvedPort = null;
let serverStarted = false;

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
  const { initServer } = require("./server/index");
  await initServer(resolvedPort, app.getPath("userData"));
  serverStarted = true;
  return resolvedPort;
}

app.whenReady().then(async () => {
  try {
    const port = await startServer();
    createWindow(port);
  } catch (err) {
    dialog.showErrorBox("خطأ في بدء التطبيق", err.message);
    app.quit();
  }
});

app.on("window-all-closed", () => {
  app.quit();
});

app.on("activate", () => {
  if (mainWindow === null && resolvedPort) createWindow(resolvedPort);
});

ipcMain.handle("backup-db", async () => {
  const now = new Date();
  const stamp = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}-${String(now.getDate()).padStart(2,"0")}`;
  const { filePath, canceled } = await dialog.showSaveDialog(mainWindow, {
    title: "حفظ النسخة الاحتياطية",
    defaultPath: `erp-backup-${stamp}.db`,
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
  const { filePaths, canceled } = await dialog.showOpenDialog(mainWindow, {
    title: "اختر ملف النسخة الاحتياطية",
    filters: [{ name: "SQLite Database", extensions: ["db"] }],
    properties: ["openFile"],
  });
  if (canceled || !filePaths.length) return { success: false, canceled: true };
  const srcPath = filePaths[0];
  const dbPath = path.join(app.getPath("userData"), "erp-van-sales.db");
  const { closeDb, initDb } = require("./server/db");
  closeDb();
  try {
    fs.copyFileSync(srcPath, dbPath);
    // Schedule restart from main process so renderer has time to show feedback
    setTimeout(() => { app.relaunch(); app.exit(0); }, 2500);
    return { success: true };
  } catch (err) {
    // Re-open DB so app remains functional after failed restore
    try { initDb(app.getPath("userData")); } catch (_) {}
    return { success: false, error: err.message };
  }
});

ipcMain.handle("check-online", async () => {
  try {
    const https = require("https");
    return await new Promise((resolve) => {
      const req = https.get(
        "https://deleveri.alllal.com/api/healthz",
        { timeout: 5000 },
        (res) => resolve(res.statusCode < 500)
      );
      req.on("error", () => resolve(false));
      req.on("timeout", () => { req.destroy(); resolve(false); });
    });
  } catch {
    return false;
  }
});

ipcMain.handle("get-app-version", () => app.getVersion());
