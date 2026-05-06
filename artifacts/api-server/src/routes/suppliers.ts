import { Router } from "express";
import { db } from "@workspace/db";
import { suppliersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router = Router();

router.get("/suppliers", async (_req, res) => {
  const suppliers = await db.select().from(suppliersTable).orderBy(suppliersTable.name);
  res.json(suppliers.map(s => ({ ...s, balance: Number(s.balance) })));
});

router.post("/suppliers", async (req, res) => {
  const { name, phone, email, balance } = req.body;
  if (!name) return res.status(400).json({ error: "Nom requis" });
  const [supplier] = await db.insert(suppliersTable).values({
    name, phone: phone || null, email: email || null,
    balance: String(balance ?? 0),
  }).returning();
  res.status(201).json({ ...supplier, balance: Number(supplier.balance) });
});

router.get("/suppliers/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  const [supplier] = await db.select().from(suppliersTable).where(eq(suppliersTable.id, id)).limit(1);
  if (!supplier) return res.status(404).json({ error: "Fournisseur non trouvé" });
  res.json({ ...supplier, balance: Number(supplier.balance) });
});

router.put("/suppliers/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  const { name, phone, email, balance } = req.body;
  const updates: Record<string, unknown> = {};
  if (name !== undefined) updates.name = name;
  if (phone !== undefined) updates.phone = phone;
  if (email !== undefined) updates.email = email;
  if (balance !== undefined) updates.balance = String(balance);
  const [supplier] = await db.update(suppliersTable).set(updates).where(eq(suppliersTable.id, id)).returning();
  if (!supplier) return res.status(404).json({ error: "Fournisseur non trouvé" });
  res.json({ ...supplier, balance: Number(supplier.balance) });
});

router.delete("/suppliers/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  await db.delete(suppliersTable).where(eq(suppliersTable.id, id));
  res.status(204).send();
});

export default router;
