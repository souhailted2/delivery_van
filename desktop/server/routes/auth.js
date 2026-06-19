const { Router } = require("express");
const { getDb, hashPassword } = require("../db");
const syncEngine = require("../sync-engine");

const router = Router();

// Shape the session-attached local user row into the API response.
function userResponse(user) {
  return {
    id: user.id, username: user.username, fullName: user.full_name,
    role: user.role, truckId: user.truck_id,
    canDeleteInvoice: !!user.can_delete_invoice, canEditPrice: !!user.can_edit_price,
    canSellOnCredit: !!user.can_sell_on_credit, canViewReports: !!user.can_view_reports,
    createdAt: user.created_at,
  };
}

// Mirror a cloud user (returned by the cloud /auth/login) into local SQLite so
// the session can attach to a real local row AND so subsequent OFFLINE logins
// accept the SAME password. We adopt the cloud `sync_id` so a later sync push
// reconciles with the existing cloud row instead of creating a duplicate.
// `passwordHash` is hash(the password the cloud just accepted) == the cloud's
// own stored hash, so writing it locally introduces no divergence.
function mirrorCloudUser(db, u, passwordHash) {
  const syncId   = u.syncId ?? u.sync_id ?? null;
  const fullName = u.fullName ?? u.full_name ?? u.username;
  const role     = u.role ?? "vendeur";
  const truckId  = u.truckId ?? u.truck_id ?? null;
  const cdi = u.canDeleteInvoice ? 1 : 0;
  const cep = u.canEditPrice     ? 1 : 0;
  const csc = u.canSellOnCredit  ? 1 : 0;
  const cvr = u.canViewReports   ? 1 : 0;

  let row = syncId ? db.prepare("SELECT * FROM users WHERE sync_id = ?").get(syncId) : null;
  if (!row) row = db.prepare("SELECT * FROM users WHERE username = ?").get(u.username);

  if (row) {
    db.prepare(`
      UPDATE users SET
        password_hash = ?, full_name = ?, role = ?, truck_id = ?,
        can_delete_invoice = ?, can_edit_price = ?, can_sell_on_credit = ?, can_view_reports = ?,
        sync_id = COALESCE(?, sync_id)
      WHERE id = ?
    `).run(passwordHash, fullName, role, truckId, cdi, cep, csc, cvr, syncId, row.id);
    return row.id;
  }
  const cols = ["username", "password_hash", "full_name", "role", "truck_id",
    "can_delete_invoice", "can_edit_price", "can_sell_on_credit", "can_view_reports"];
  const vals = [u.username, passwordHash, fullName, role, truckId, cdi, cep, csc, cvr];
  if (syncId) { cols.push("sync_id"); vals.push(syncId); }
  const info = db.prepare(
    `INSERT INTO users (${cols.join(", ")}) VALUES (${cols.map(() => "?").join(", ")})`
  ).run(...vals);
  return info.lastInsertRowid;
}

router.post("/auth/login", async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: "Username et mot de passe requis" });
  const db = getDb();

  // 1. ONLINE: authenticate against the SAME cloud identity source as web/mobile.
  //    A cloud 401 is authoritative (do NOT fall back to local). Only an
  //    unreachable cloud drops us to the offline path below.
  let cloud = { reachable: false };
  try { cloud = await syncEngine.cloudLogin(username, password); }
  catch { cloud = { reachable: false }; }

  if (cloud.reachable) {
    if (!cloud.ok) return res.status(401).json({ error: "Identifiants incorrects" });
    const localId = mirrorCloudUser(db, cloud.user, hashPassword(password));
    const user = db.prepare("SELECT * FROM users WHERE id = ?").get(localId);
    req.session.userId = localId;
    req.session.truckId = undefined;
    return res.json({ user: userResponse(user) });
  }

  // 2. OFFLINE: fall back to the local SQLite credential store (populated by a
  //    prior online login / sync). First-run with no connectivity has no users.
  const user = db.prepare("SELECT * FROM users WHERE username = ?").get(username);
  if (!user || user.password_hash !== hashPassword(password)) {
    return res.status(401).json({ error: "Identifiants incorrects" });
  }
  req.session.userId = user.id;
  req.session.truckId = undefined;
  res.json({ user: userResponse(user) });
});

router.post("/auth/truck-login", (req, res) => {
  const { truckName, password } = req.body;
  if (!truckName || !password) return res.status(400).json({ error: "Nom de camion et mot de passe requis" });
  const db = getDb();
  const truck = db.prepare("SELECT * FROM trucks WHERE name = ?").get(truckName);
  if (!truck || !truck.password_hash || truck.password_hash !== hashPassword(password)) {
    return res.status(401).json({ error: "Identifiants de camion incorrects" });
  }
  req.session.truckId = truck.id;
  req.session.userId = undefined;
  res.json({
    user: {
      id: truck.id, username: truck.name, fullName: truck.driver_name || truck.name,
      role: "truck", truckId: truck.id, canDeleteInvoice: false, canEditPrice: false,
      canSellOnCredit: true, canViewReports: false, createdAt: truck.created_at,
    }
  });
});

router.post("/auth/logout", (req, res) => {
  req.session.destroy(() => res.json({ success: true }));
});

router.get("/auth/me", (req, res) => {
  const db = getDb();
  const truckId = req.session?.truckId;
  if (truckId) {
    const truck = db.prepare("SELECT * FROM trucks WHERE id = ?").get(truckId);
    if (!truck) return res.status(401).json({ error: "Camion non trouvé" });
    return res.json({
      id: truck.id, username: truck.name, fullName: truck.driver_name || truck.name,
      role: "truck", truckId: truck.id, canDeleteInvoice: false, canEditPrice: false,
      canSellOnCredit: true, canViewReports: false, createdAt: truck.created_at,
    });
  }
  const userId = req.session?.userId;
  if (!userId) return res.status(401).json({ error: "Non authentifié" });
  const user = db.prepare("SELECT * FROM users WHERE id = ?").get(userId);
  if (!user) return res.status(401).json({ error: "Utilisateur non trouvé" });
  res.json({
    id: user.id, username: user.username, fullName: user.full_name,
    role: user.role, truckId: user.truck_id,
    canDeleteInvoice: !!user.can_delete_invoice, canEditPrice: !!user.can_edit_price,
    canSellOnCredit: !!user.can_sell_on_credit, canViewReports: !!user.can_view_reports,
    createdAt: user.created_at,
  });
});

module.exports = router;
