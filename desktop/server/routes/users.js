const { Router } = require("express");
const { getDb, hashPassword } = require("../db");

const router = Router();

function formatUser(u) {
  return {
    id: u.id, username: u.username, fullName: u.full_name, role: u.role,
    truckId: u.truck_id, canDeleteInvoice: !!u.can_delete_invoice,
    canEditPrice: !!u.can_edit_price, canSellOnCredit: !!u.can_sell_on_credit,
    canViewReports: !!u.can_view_reports, createdAt: u.created_at,
  };
}

router.get("/users", (_req, res) => {
  const db = getDb();
  res.json(db.prepare(`
    SELECT id,username,full_name,role,truck_id,can_delete_invoice,
      can_edit_price,can_sell_on_credit,can_view_reports,created_at
    FROM users ORDER BY id
  `).all().map(formatUser));
});

router.post("/users", (req, res) => {
  const { username, password, fullName, role, truckId, canDeleteInvoice, canEditPrice,
    canSellOnCredit, canViewReports } = req.body;
  if (!username || !password || !fullName) return res.status(400).json({ error: "Champs requis manquants" });
  const db = getDb();
  try {
    const info = db.prepare(`
      INSERT INTO users (username, password_hash, full_name, role, truck_id,
        can_delete_invoice, can_edit_price, can_sell_on_credit, can_view_reports)
      VALUES (?,?,?,?,?,?,?,?,?)
    `).run(username, hashPassword(password), fullName, role || "vendeur",
      truckId || null, canDeleteInvoice ? 1 : 0, canEditPrice ? 1 : 0,
      canSellOnCredit !== false ? 1 : 0, canViewReports ? 1 : 0);
    const u = db.prepare("SELECT * FROM users WHERE id = ?").get(info.lastInsertRowid);
    res.status(201).json(formatUser(u));
  } catch (err) {
    if (err.message.includes("UNIQUE")) return res.status(409).json({ error: "Nom d'utilisateur déjà pris" });
    throw err;
  }
});

router.get("/users/:id", (req, res) => {
  const db = getDb();
  const u = db.prepare("SELECT * FROM users WHERE id = ?").get(parseInt(req.params.id));
  if (!u) return res.status(404).json({ error: "Utilisateur non trouvé" });
  res.json(formatUser(u));
});

router.put("/users/:id", (req, res) => {
  const id = parseInt(req.params.id);
  const { fullName, role, truckId, canDeleteInvoice, canEditPrice, canSellOnCredit, canViewReports, password } = req.body;
  const db = getDb();
  const existing = db.prepare("SELECT * FROM users WHERE id = ?").get(id);
  if (!existing) return res.status(404).json({ error: "Utilisateur non trouvé" });
  db.prepare(`UPDATE users SET
    full_name = COALESCE(?,full_name), role = COALESCE(?,role),
    truck_id = COALESCE(?,truck_id),
    can_delete_invoice = COALESCE(?,can_delete_invoice),
    can_edit_price = COALESCE(?,can_edit_price),
    can_sell_on_credit = COALESCE(?,can_sell_on_credit),
    can_view_reports = COALESCE(?,can_view_reports),
    password_hash = COALESCE(?,password_hash)
    WHERE id = ?`).run(
    fullName ?? null, role ?? null, truckId !== undefined ? (truckId || null) : null,
    canDeleteInvoice != null ? (canDeleteInvoice ? 1 : 0) : null,
    canEditPrice != null ? (canEditPrice ? 1 : 0) : null,
    canSellOnCredit != null ? (canSellOnCredit ? 1 : 0) : null,
    canViewReports != null ? (canViewReports ? 1 : 0) : null,
    password ? hashPassword(password) : null, id);
  const u = db.prepare("SELECT * FROM users WHERE id = ?").get(id);
  res.json(formatUser(u));
});

router.delete("/users/:id", (req, res) => {
  const db = getDb();
  db.prepare("DELETE FROM users WHERE id = ?").run(parseInt(req.params.id));
  res.status(204).send();
});

module.exports = router;
