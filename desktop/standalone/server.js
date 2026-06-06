"use strict";

const path = require("path");
const os   = require("os");
const net  = require("net");
const { execSync } = require("child_process");

// ─── Data directory ────────────────────────────────────────────────────────────
function getUserDataPath() {
  if (process.env.ERP_DATA_DIR) return process.env.ERP_DATA_DIR;
  if (process.platform === "win32") {
    const appdata = process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming");
    return path.join(appdata, "ERP Van Sales");
  }
  return path.join(os.homedir(), ".erp-van-sales");
}

// ─── Find available port ───────────────────────────────────────────────────────
function findPort(preferred) {
  return new Promise((resolve) => {
    const s = net.createServer();
    s.listen(preferred, "127.0.0.1", () => {
      const { port } = s.address();
      s.close(() => resolve(port));
    });
    s.on("error", () => {
      const s2 = net.createServer();
      s2.listen(0, "127.0.0.1", () => {
        const { port } = s2.address();
        s2.close(() => resolve(port));
      });
    });
  });
}

// ─── Open default browser ──────────────────────────────────────────────────────
function openBrowser(url) {
  try {
    if (process.platform === "win32") {
      execSync(`start "" "${url}"`, { shell: true, stdio: "ignore" });
    } else if (process.platform === "darwin") {
      execSync(`open "${url}"`, { stdio: "ignore" });
    } else {
      execSync(`xdg-open "${url}"`, { stdio: "ignore" });
    }
  } catch (_) {}
}

// ─── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  const userDataPath = getUserDataPath();
  const port = await findPort(37891);
  const url  = `http://localhost:${port}`;

  // Optional sync engine (don't fail if it can't load)
  let syncEngine = null;
  try {
    syncEngine = require("../server/sync-engine");
  } catch (_) {}

  // Start Express server (reuses existing desktop/server/ code)
  const { initServer } = require("../server/index");
  // Listen on 0.0.0.0 so other devices on LAN can connect via http://[IP]:port
  await initServer(port, userDataPath, syncEngine, "0.0.0.0");

  if (syncEngine) {
    try { syncEngine.start(); } catch (_) {}
  }

  console.log("");
  console.log("╔══════════════════════════════════════════════╗");
  console.log("║   ERP Van Sales — نظام إدارة مبيعات الشاحنات ║");
  console.log("╠══════════════════════════════════════════════╣");
  console.log(`║  السيرفر: ${url.padEnd(35)}║`);
  console.log(`║  البيانات: ${userDataPath.slice(0, 34).padEnd(34)}║`);
  console.log("║  اضغط Ctrl+C لإيقاف البرنامج                 ║");
  console.log("╚══════════════════════════════════════════════╝");
  console.log("");

  // Open browser shortly after server is ready
  setTimeout(() => openBrowser(url), 1500);

  // Keep process alive
  process.on("SIGTERM", () => {
    console.log("\nجاري الإيقاف...");
    process.exit(0);
  });
  process.on("SIGINT", () => {
    console.log("\nجاري الإيقاف...");
    process.exit(0);
  });
}

main().catch((err) => {
  console.error("خطأ في بدء التطبيق:", err.message);
  if (process.platform === "win32") {
    // Keep window open so user can read the error
    console.error("\nاضغط Enter للإغلاق...");
    process.stdin.resume();
    process.stdin.once("data", () => process.exit(1));
  } else {
    process.exit(1);
  }
});
