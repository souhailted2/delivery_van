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
