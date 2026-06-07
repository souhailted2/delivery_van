import { Router } from "express";
import { db } from "@workspace/db";
import { branchesTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router = Router();

router.get("/branches", async (_req, res) => {
  const branches = await db.select().from(branchesTable).orderBy(branchesTable.name);
  res.json(branches);
});

router.post("/branches", async (req, res) => {
  const { name, address, phone } = req.body;
  if (!name) return res.status(400).json({ error: "Nom requis" });
  const [branch] = await db.insert(branchesTable).values({
    name,
    address: address || null,
    phone: phone || null,
  }).returning();
  res.status(201).json(branch);
});

router.get("/branches/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  const [branch] = await db.select().from(branchesTable).where(eq(branchesTable.id, id)).limit(1);
  if (!branch) return res.status(404).json({ error: "Agence non trouvée" });
  res.json(branch);
});

router.put("/branches/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  const { name, address, phone } = req.body;
  const updates: Record<string, unknown> = {};
  if (name !== undefined) updates.name = name;
  if (address !== undefined) updates.address = address;
  if (phone !== undefined) updates.phone = phone;
  const [branch] = await db.update(branchesTable).set(updates).where(eq(branchesTable.id, id)).returning();
  if (!branch) return res.status(404).json({ error: "Agence non trouvée" });
  res.json(branch);
});

router.delete("/branches/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  await db.delete(branchesTable).where(eq(branchesTable.id, id));
  res.status(204).send();
});

export default router;
