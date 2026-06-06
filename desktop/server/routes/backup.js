/**
 * REST backup/restore endpoints for the standalone desktop installer.
 * GET  /api/backup/download  — download the local SQLite DB as a file
 * POST /api/backup/restore   — restore from a base64-encoded SQLite file
 */
const { Router } = require("express");
const path = require("path");
const os   = require("os");
const fs   = require("fs");
const { getDb, backupDb } = require("../db");
const { getUserDataPath }  = require("../config");

const router = Router();

function requireAuth(req, res, next) {
  if (!req.session?.userId) return res.status(401).json({ error: "Non authentifié" });
  next();
}

// ─── Download ─────────────────────────────────────────────────────────────────
router.get("/backup/download", requireAuth, async (_req, res) => {
  const tmpFile = path.join(os.tmpdir(), `erp-backup-${Date.now()}.db`);
  try {
    await backupDb(tmpFile);
    const date = new Date().toISOString().slice(0, 10);
    res.download(tmpFile, `erp-van-sales-backup-${date}.db`, (err) => {
      fs.unlink(tmpFile, () => {});
      if (err && !res.headersSent) res.status(500).json({ error: "فشل التنزيل" });
    });
  } catch (err) {
    fs.unlink(tmpFile, () => {});
    res.status(500).json({ error: err.message });
  }
});

// ─── Restore ──────────────────────────────────────────────────────────────────
router.post("/backup/restore", requireAuth, (req, res) => {
  const { data } = req.body;
  if (!data) return res.status(400).json({ error: "data (base64) مطلوب" });

  const tmpFile = path.join(os.tmpdir(), `erp-restore-${Date.now()}.db`);
  try {
    const buf = Buffer.from(data, "base64");

    // Validate SQLite magic bytes
    if (!buf.slice(0, 15).toString("utf8").startsWith("SQLite format 3")) {
      return res.status(400).json({ error: "ملف غير صالح — يجب أن يكون ملف SQLite" });
    }

    fs.writeFileSync(tmpFile, buf);

    const userDataPath = getUserDataPath();
    const dbPath = path.join(userDataPath, "erp-van-sales.db");

    // Close the current DB connection then replace the file
    try { getDb().close(); } catch {}

    fs.copyFileSync(tmpFile, dbPath);
    fs.unlinkSync(tmpFile);

    res.json({ ok: true, message: "تمت الاستعادة — سيُعاد تشغيل البرنامج" });

    // Restart process so the new DB is loaded
    setTimeout(() => process.exit(0), 600);
  } catch (err) {
    fs.unlink(tmpFile, () => {});
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
