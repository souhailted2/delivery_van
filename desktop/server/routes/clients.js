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
  const { search } = req.query;
  const db = getDb();
  const clients = search
    ? db.prepare("SELECT * FROM clients WHERE name LIKE ? ORDER BY name").all(`%${search}%`)
    : db.prepare("SELECT * FROM clients ORDER BY name").all();
  res.json(clients.map(formatClient));
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
  const client = db.prepare("SELECT * FROM clients WHERE id = ?").get(parseInt(req.params.id));
  if (!client) return res.status(404).json({ error: "Client non trouvé" });
  res.json(formatClient(client));
});

router.put("/clients/:id", (req, res) => {
  const id = parseInt(req.params.id);
  const { name, phone, clientType, latitude, longitude } = req.body;
  const validTypes = ["retail", "half_wholesale", "wholesale"];
  const db = getDb();
  const existing = db.prepare("SELECT * FROM clients WHERE id = ?").get(id);
  if (!existing) return res.status(404).json({ error: "Client non trouvé" });
  db.prepare(`
    UPDATE clients SET
      name = COALESCE(?,name), phone = COALESCE(?,phone),
      client_type = COALESCE(?,client_type),
      latitude = COALESCE(?,latitude), longitude = COALESCE(?,longitude)
    WHERE id = ?
  `).run(name ?? null, phone ?? null,
    clientType && validTypes.includes(clientType) ? clientType : null,
    latitude ?? null, longitude ?? null, id);
  const client = db.prepare("SELECT * FROM clients WHERE id = ?").get(id);
  res.json(formatClient(client));
});

router.delete("/clients/:id", (req, res) => {
  const db = getDb();
  db.prepare("DELETE FROM clients WHERE id = ?").run(parseInt(req.params.id));
  res.status(204).send();
});

module.exports = router;
