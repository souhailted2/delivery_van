import { Router } from "express";
import { db } from "@workspace/db";
import { usersTable, trucksTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import crypto from "crypto";

const router = Router();

export function hashPassword(password: string): string {
  return crypto.createHash("sha256").update(password + "erp-salt-dzd").digest("hex");
}

router.post("/auth/login", async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: "Username et mot de passe requis" });
  }
  const [user] = await db.select().from(usersTable).where(eq(usersTable.username, username)).limit(1);
  if (!user || user.passwordHash !== hashPassword(password)) {
    return res.status(401).json({ error: "Identifiants incorrects" });
  }
  (req.session as any).userId = user.id;
  (req.session as any).truckId = undefined;
  const { passwordHash: _, ...safeUser } = user;
  res.json({ user: safeUser });
});

router.post("/auth/truck-login", async (req, res) => {
  const { truckName, password } = req.body;
  if (!truckName || !password) {
    return res.status(400).json({ error: "Nom de camion et mot de passe requis" });
  }
  const [truck] = await db.select().from(trucksTable).where(eq(trucksTable.name, truckName)).limit(1);
  if (!truck || !truck.passwordHash || truck.passwordHash !== hashPassword(password)) {
    return res.status(401).json({ error: "Identifiants de camion incorrects" });
  }
  (req.session as any).truckId = truck.id;
  (req.session as any).userId = undefined;
  const truckUser = {
    id: truck.id,
    username: truck.name,
    fullName: truck.driverName || truck.name,
    role: "truck",
    truckId: truck.id,
    canDeleteInvoice: false,
    canEditPrice: false,
    canSellOnCredit: true,
    canViewReports: false,
    createdAt: truck.createdAt,
  };
  res.json({ user: truckUser });
});

router.post("/auth/logout", (req, res) => {
  (req.session as any).userId = undefined;
  (req.session as any).truckId = undefined;
  res.json({ success: true });
});

router.get("/auth/me", async (req, res) => {
  const truckId = (req.session as any)?.truckId;
  if (truckId) {
    const [truck] = await db.select().from(trucksTable).where(eq(trucksTable.id, truckId)).limit(1);
    if (!truck) return res.status(401).json({ error: "Camion non trouvé" });
    return res.json({
      id: truck.id,
      username: truck.name,
      fullName: truck.driverName || truck.name,
      role: "truck",
      truckId: truck.id,
      canDeleteInvoice: false,
      canEditPrice: false,
      canSellOnCredit: true,
      canViewReports: false,
      createdAt: truck.createdAt,
    });
  }
  const userId = (req.session as any)?.userId;
  if (!userId) return res.status(401).json({ error: "Non authentifié" });
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  if (!user) return res.status(401).json({ error: "Utilisateur non trouvé" });
  const { passwordHash: _, ...safeUser } = user;
  res.json(safeUser);
});

export default router;
