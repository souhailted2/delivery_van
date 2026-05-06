import { Router } from "express";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { hashPassword } from "./auth";

const router = Router();

router.get("/users", async (req, res) => {
  const users = await db.select({
    id: usersTable.id,
    username: usersTable.username,
    fullName: usersTable.fullName,
    role: usersTable.role,
    truckId: usersTable.truckId,
    canDeleteInvoice: usersTable.canDeleteInvoice,
    canEditPrice: usersTable.canEditPrice,
    canSellOnCredit: usersTable.canSellOnCredit,
    canViewReports: usersTable.canViewReports,
    createdAt: usersTable.createdAt,
  }).from(usersTable).orderBy(usersTable.id);
  res.json(users);
});

router.post("/users", async (req, res) => {
  const { username, password, fullName, role, truckId, canDeleteInvoice, canEditPrice, canSellOnCredit, canViewReports } = req.body;
  if (!username || !password || !fullName) {
    return res.status(400).json({ error: "Champs requis manquants" });
  }
  const [user] = await db.insert(usersTable).values({
    username,
    passwordHash: hashPassword(password),
    fullName,
    role: role || "vendeur",
    truckId: truckId || null,
    canDeleteInvoice: canDeleteInvoice ?? false,
    canEditPrice: canEditPrice ?? false,
    canSellOnCredit: canSellOnCredit ?? true,
    canViewReports: canViewReports ?? false,
  }).returning();
  const { passwordHash: _, ...safeUser } = user;
  res.status(201).json(safeUser);
});

router.get("/users/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  const [user] = await db.select({
    id: usersTable.id,
    username: usersTable.username,
    fullName: usersTable.fullName,
    role: usersTable.role,
    truckId: usersTable.truckId,
    canDeleteInvoice: usersTable.canDeleteInvoice,
    canEditPrice: usersTable.canEditPrice,
    canSellOnCredit: usersTable.canSellOnCredit,
    canViewReports: usersTable.canViewReports,
    createdAt: usersTable.createdAt,
  }).from(usersTable).where(eq(usersTable.id, id)).limit(1);
  if (!user) return res.status(404).json({ error: "Utilisateur non trouvé" });
  res.json(user);
});

router.put("/users/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  const { fullName, role, truckId, canDeleteInvoice, canEditPrice, canSellOnCredit, canViewReports } = req.body;
  const updates: Record<string, unknown> = {};
  if (fullName !== undefined) updates.fullName = fullName;
  if (role !== undefined) updates.role = role;
  if (truckId !== undefined) updates.truckId = truckId;
  if (canDeleteInvoice !== undefined) updates.canDeleteInvoice = canDeleteInvoice;
  if (canEditPrice !== undefined) updates.canEditPrice = canEditPrice;
  if (canSellOnCredit !== undefined) updates.canSellOnCredit = canSellOnCredit;
  if (canViewReports !== undefined) updates.canViewReports = canViewReports;
  const [user] = await db.update(usersTable).set(updates).where(eq(usersTable.id, id)).returning();
  if (!user) return res.status(404).json({ error: "Utilisateur non trouvé" });
  const { passwordHash: _, ...safeUser } = user;
  res.json(safeUser);
});

router.delete("/users/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  await db.delete(usersTable).where(eq(usersTable.id, id));
  res.status(204).send();
});

export default router;
