/**
 * Build the React frontend for Electron desktop app.
 * Run from the desktop/ directory: node build-renderer.mjs
 *
 * This builds artifacts/erp-van-sales with BASE_PATH=/ so it works
 * when served from the local Express server at http://localhost:37891
 */

import { execSync } from "child_process";
import { cpSync, rmSync, existsSync, mkdirSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const RENDERER_DIR = resolve(__dirname, "renderer");

console.log("🔨 Building React frontend for Electron...");
console.log("   Root:", ROOT);
console.log("   Output:", RENDERER_DIR);

// Clean existing renderer output
if (existsSync(RENDERER_DIR)) {
  console.log("   Cleaning old renderer...");
  rmSync(RENDERER_DIR, { recursive: true, force: true });
}
mkdirSync(RENDERER_DIR, { recursive: true });

// Build the frontend with Electron-specific settings
try {
  execSync("pnpm --filter @workspace/erp-van-sales run build", {
    env: {
      ...process.env,
      NODE_ENV: "production",
      BASE_PATH: "/",
      PORT: "3000",
      REPL_ID: "",
      REPLIT_ENVIRONMENT: "",
    },
    stdio: "inherit",
    cwd: ROOT,
  });
  console.log("✅ Frontend built successfully");
} catch (err) {
  console.error("❌ Frontend build failed:", err.message);
  process.exit(1);
}

// Copy built files to renderer/
const BUILT_DIR = resolve(ROOT, "artifacts/erp-van-sales/dist/public");
console.log("📂 Copying built files to renderer/...");
cpSync(BUILT_DIR, RENDERER_DIR, { recursive: true });
console.log("✅ Renderer ready at:", RENDERER_DIR);
console.log("");
console.log("Next steps:");
console.log("  npm run start       — run Electron app in development");
console.log("  npm run dist        — build Windows installer (.exe)");
