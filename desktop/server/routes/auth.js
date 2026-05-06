const { Router } = require("express");
const { getDb, hashPassword } = require("../db");

const router = Router();

router.post("/auth/login", (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: "Username et mot de passe requis" });
  const db = getDb();
  const user = db.prepare("SELECT * FROM users WHERE username = ?").get(username);
  if (!user || user.password_hash !== hashPassword(password)) {
    return res.status(401).json({ error: "Identifiants incorrects" });
  }
  req.session.userId = user.id;
  req.session.truckId = undefined;
  res.json({
    user: {
      id: user.id, username: user.username, fullName: user.full_name,
      role: user.role, truckId: user.truck_id,
      canDeleteInvoice: !!user.can_delete_invoice, canEditPrice: !!user.can_edit_price,
      canSellOnCredit: !!user.can_sell_on_credit, canViewReports: !!user.can_view_reports,
      createdAt: user.created_at,
    }
  });
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
