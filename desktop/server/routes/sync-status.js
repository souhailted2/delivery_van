/**
 * Sync status and credential management endpoints for the desktop.
 * GET  /api/sync/status        — current sync engine status
 * POST /api/sync/credentials   — save cloud credentials
 * POST /api/sync/trigger       — manually trigger a sync cycle
 */
const { Router } = require("express");

const router = Router();
let engine = null;

function setEngine(e) { engine = e; }

router.get("/sync/status", (_req, res) => {
  if (!engine) return res.json({ online: false, syncing: false, lastSync: null, error: null, pending: 0 });
  res.json(engine.getStatus());
});

router.post("/sync/credentials", (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: "username and password required" });
  if (!engine) return res.status(503).json({ error: "Sync engine not started" });
  engine.saveCredentials(username, password);
  // Trigger immediate sync with new credentials
  engine.syncOnce().catch(() => {});
  res.json({ ok: true });
});

router.post("/sync/trigger", (_req, res) => {
  if (!engine) return res.status(503).json({ error: "Sync engine not started" });
  engine.syncOnce().catch(() => {});
  res.json({ ok: true });
});

module.exports = { router, setEngine };
