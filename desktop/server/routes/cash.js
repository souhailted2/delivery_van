const { Router } = require("express");
const { getDb } = require("../db");

const router = Router();

router.get("/cash/trucks/:truckId", (req, res) => {
  const truckId = parseInt(req.params.truckId);
  const db = getDb();
  const truck = db.prepare("SELECT * FROM trucks WHERE id = ?").get(truckId);
  if (!truck) return res.status(404).json({ error: "Camion non trouvé" });
  const transfers = db.prepare("SELECT * FROM cash_transfers WHERE truck_id = ?").all(truckId);
  const pendingTotal = transfers.filter(t => t.status === "pending").reduce((s, t) => s + Number(t.amount), 0);
  res.json({
    truckId: truck.id, truckName: truck.name,
    cashBalance: Number(truck.cash_balance), pendingTransfers: pendingTotal,
  });
});

router.get("/cash/transfers", (_req, res) => {
  const db = getDb();
  const transfers = db.prepare(`
    SELECT ct.*, t.name AS truck_name
    FROM cash_transfers ct LEFT JOIN trucks t ON ct.truck_id = t.id
    ORDER BY ct.created_at
  `).all();
  res.json(transfers.map(t => ({ ...t, amount: Number(t.amount), truckName: t.truck_name, createdAt: t.created_at })));
});

router.post("/cash/transfers", (req, res) => {
  const { truckId, amount, note } = req.body;
  if (!truckId || !amount || amount <= 0) return res.status(400).json({ error: "Camion et montant requis" });
  const db = getDb();
  const info = db.prepare("INSERT INTO cash_transfers (truck_id, amount, status, note) VALUES (?,?,'pending',?)")
    .run(parseInt(truckId), Number(amount), note || null);
  const transfer = db.prepare("SELECT * FROM cash_transfers WHERE id = ?").get(info.lastInsertRowid);
  const truck = db.prepare("SELECT name FROM trucks WHERE id = ?").get(parseInt(truckId));
  res.status(201).json({ ...transfer, amount: Number(transfer.amount), truckName: truck?.name ?? "", createdAt: transfer.created_at });
});

router.post("/cash/transfers/:id/approve", (req, res) => {
  const id = parseInt(req.params.id);
  const db = getDb();
  const transfer = db.prepare("SELECT * FROM cash_transfers WHERE id = ?").get(id);
  if (!transfer) return res.status(404).json({ error: "Transfert non trouvé" });
  if (transfer.status !== "pending") return res.status(400).json({ error: "Transfert déjà traité" });
  db.transaction(() => {
    db.prepare("UPDATE cash_transfers SET status = 'approved' WHERE id = ?").run(id);
    const truck = db.prepare("SELECT * FROM trucks WHERE id = ?").get(transfer.truck_id);
    if (truck) {
      db.prepare("UPDATE trucks SET cash_balance = ? WHERE id = ?")
        .run(Math.max(0, Number(truck.cash_balance) - Number(transfer.amount)), truck.id);
    }
  })();
  const updated = db.prepare(`
    SELECT ct.*, t.name AS truck_name FROM cash_transfers ct
    LEFT JOIN trucks t ON ct.truck_id = t.id WHERE ct.id = ?
  `).get(id);
  res.json({ ...updated, amount: Number(updated.amount), truckName: updated.truck_name, createdAt: updated.created_at });
});

router.post("/cash/transfers/:id/reject", (req, res) => {
  const id = parseInt(req.params.id);
  const db = getDb();
  db.prepare("UPDATE cash_transfers SET status = 'rejected' WHERE id = ?").run(id);
  const updated = db.prepare(`
    SELECT ct.*, t.name AS truck_name FROM cash_transfers ct
    LEFT JOIN trucks t ON ct.truck_id = t.id WHERE ct.id = ?
  `).get(id);
  res.json({ ...updated, amount: Number(updated.amount), truckName: updated.truck_name, createdAt: updated.created_at });
});

module.exports = router;
