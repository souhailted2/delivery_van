const { Router } = require("express");
const { getDb } = require("../db");

const router = Router();

function formatSupplier(s) {
  return { id: s.id, name: s.name, phone: s.phone, email: s.email,
    balance: Number(s.balance ?? 0), createdAt: s.created_at };
}

router.get("/suppliers", (_req, res) => {
  const db = getDb();
  res.json(db.prepare("SELECT * FROM suppliers WHERE is_deleted = 0 ORDER BY name").all().map(formatSupplier));
});

router.post("/suppliers", (req, res) => {
  const { name, phone, email, balance } = req.body;
  if (!name) return res.status(400).json({ error: "Nom requis" });
  const db = getDb();
  const info = db.prepare("INSERT INTO suppliers (name, phone, email, balance) VALUES (?,?,?,?)")
    .run(name, phone || null, email || null, Number(balance ?? 0));
  const s = db.prepare("SELECT * FROM suppliers WHERE id = ?").get(info.lastInsertRowid);
  res.status(201).json(formatSupplier(s));
});

router.get("/suppliers/:id", (req, res) => {
  const db = getDb();
  const s = db.prepare("SELECT * FROM suppliers WHERE id = ? AND is_deleted = 0").get(parseInt(req.params.id));
  if (!s) return res.status(404).json({ error: "Fournisseur non trouvé" });
  res.json(formatSupplier(s));
});

router.put("/suppliers/:id", (req, res) => {
  const id = parseInt(req.params.id);
  const { name, phone, email, balance } = req.body;
  const db = getDb();
  db.prepare(`UPDATE suppliers SET
    name = COALESCE(?,name), phone = COALESCE(?,phone),
    email = COALESCE(?,email), balance = COALESCE(?,balance)
    WHERE id = ? AND is_deleted = 0`).run(name ?? null, phone ?? null, email ?? null,
    balance != null ? Number(balance) : null, id);
  const s = db.prepare("SELECT * FROM suppliers WHERE id = ?").get(id);
  if (!s) return res.status(404).json({ error: "Fournisseur non trouvé" });
  res.json(formatSupplier(s));
});

router.delete("/suppliers/:id", (req, res) => {
  const db = getDb();
  db.prepare(
    "UPDATE suppliers SET is_deleted = 1, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?"
  ).run(parseInt(req.params.id));
  res.status(204).send();
});

module.exports = router;
