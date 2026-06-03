const { Router } = require("express");
const { getDb } = require("../db");

const router = Router();

function formatClient(c) {
  return {
    id: c.id, name: c.name, phone: c.phone,
    clientType: c.client_type, truckId: c.truck_id,
    latitude: c.latitude, longitude: c.longitude,
    balance: Number(c.balance ?? 0), createdAt: c.created_at,
  };
}

router.get("/clients", (req, res) => {
  const { search, truckId, page, limit } = req.query;
  const db = getDb();
  const conds = ["is_deleted = 0"];
  const params = [];
  if (search)  { conds.push("name LIKE ?");  params.push(`%${search}%`); }
  if (truckId) { conds.push("truck_id = ?"); params.push(parseInt(truckId)); }
  const where = "WHERE " + conds.join(" AND ");

  if (page !== undefined || limit !== undefined) {
    const pageNum  = Math.max(1, parseInt(page) || 1);
    const pageSize = Math.min(500, Math.max(1, parseInt(limit) || 100));
    const offset   = (pageNum - 1) * pageSize;
    const clients  = db.prepare(`SELECT * FROM clients ${where} ORDER BY name LIMIT ? OFFSET ?`)
      .all(...params, pageSize, offset);
    res.json(clients.map(formatClient));
  } else {
    const clients = db.prepare(`SELECT * FROM clients ${where} ORDER BY name`).all(...params);
    res.json(clients.map(formatClient));
  }
});

router.post("/clients", (req, res) => {
  const { name, phone, clientType, latitude, longitude } = req.body;
  if (!name) return res.status(400).json({ error: "Nom requis" });
  const validTypes = ["retail", "half_wholesale", "wholesale"];
  const db = getDb();
  const info = db.prepare(`
    INSERT INTO clients (name, phone, client_type, latitude, longitude, balance)
    VALUES (?,?,?,?,?,0)
  `).run(name, phone || null, validTypes.includes(clientType) ? clientType : "retail",
    latitude || null, longitude || null);
  const client = db.prepare("SELECT * FROM clients WHERE id = ?").get(info.lastInsertRowid);
  res.status(201).json(formatClient(client));
});

router.get("/clients/:id", (req, res) => {
  const db = getDb();
  const c = db.prepare("SELECT * FROM clients WHERE id = ? AND is_deleted = 0").get(parseInt(req.params.id));
  if (!c) return res.status(404).json({ error: "Client non trouvé" });
  res.json(formatClient(c));
});

router.put("/clients/:id", (req, res) => {
  const id = parseInt(req.params.id);
  const { name, phone, clientType, latitude, longitude, balance, truckId } = req.body;
  const validTypes = ["retail", "half_wholesale", "wholesale"];
  const db = getDb();
  db.prepare(`UPDATE clients SET
    name       = COALESCE(?,name),
    phone      = COALESCE(?,phone),
    client_type= COALESCE(?,client_type),
    latitude   = COALESCE(?,latitude),
    longitude  = COALESCE(?,longitude),
    balance    = COALESCE(?,balance),
    truck_id   = COALESCE(?,truck_id)
    WHERE id = ? AND is_deleted = 0`).run(
    name ?? null,
    phone ?? null,
    clientType && validTypes.includes(clientType) ? clientType : null,
    latitude ?? null, longitude ?? null,
    balance != null ? Number(balance) : null,
    truckId !== undefined ? (truckId || null) : null,
    id);
  const c = db.prepare("SELECT * FROM clients WHERE id = ?").get(id);
  if (!c) return res.status(404).json({ error: "Client non trouvé" });
  res.json(formatClient(c));
});

router.delete("/clients/:id", (req, res) => {
  const db = getDb();
  db.prepare(
    "UPDATE clients SET is_deleted = 1, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?"
  ).run(parseInt(req.params.id));
  res.status(204).send();
});

module.exports = router;
