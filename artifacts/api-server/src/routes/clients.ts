import { Router } from "express";
import { db } from "@workspace/db";
import { clientsTable } from "@workspace/db";
import { eq, like } from "drizzle-orm";

const router = Router();

router.get("/clients", async (req, res) => {
  const { search } = req.query;
  let query = db.select().from(clientsTable);
  const clients = search
    ? await db.select().from(clientsTable).where(like(clientsTable.name, `%${search}%`)).orderBy(clientsTable.name)
    : await db.select().from(clientsTable).orderBy(clientsTable.name);
  res.json(clients.map(c => ({ ...c, balance: Number(c.balance) })));
});

router.post("/clients", async (req, res) => {
  const { name, phone, clientType, latitude, longitude } = req.body;
  if (!name) return res.status(400).json({ error: "Nom requis" });
  const validTypes = ["retail", "half_wholesale", "wholesale"];
  const [client] = await db.insert(clientsTable).values({
    name, phone: phone || null,
    clientType: validTypes.includes(clientType) ? clientType : "retail",
    latitude: latitude || null, longitude: longitude || null,
    balance: "0",
  }).returning();
  res.status(201).json({ ...client, balance: Number(client.balance) });
});

router.get("/clients/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  const [client] = await db.select().from(clientsTable).where(eq(clientsTable.id, id)).limit(1);
  if (!client) return res.status(404).json({ error: "Client non trouvé" });
  res.json({ ...client, balance: Number(client.balance) });
});

router.put("/clients/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  const { name, phone, clientType, latitude, longitude } = req.body;
  const validTypes = ["retail", "half_wholesale", "wholesale"];
  const updates: Record<string, unknown> = {};
  if (name !== undefined) updates.name = name;
  if (phone !== undefined) updates.phone = phone;
  if (clientType !== undefined && validTypes.includes(clientType)) updates.clientType = clientType;
  if (latitude !== undefined) updates.latitude = latitude;
  if (longitude !== undefined) updates.longitude = longitude;
  const [client] = await db.update(clientsTable).set(updates).where(eq(clientsTable.id, id)).returning();
  if (!client) return res.status(404).json({ error: "Client non trouvé" });
  res.json({ ...client, balance: Number(client.balance) });
});

router.delete("/clients/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  await db.delete(clientsTable).where(eq(clientsTable.id, id));
  res.status(204).send();
});

export default router;
