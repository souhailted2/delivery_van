import { Router } from "express";
import { db } from "@workspace/db";
import { cashTransfersTable, trucksTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router = Router();

router.get("/cash/trucks/:truckId", async (req, res) => {
  const truckId = parseInt(req.params.truckId);
  const [truck] = await db.select().from(trucksTable).where(eq(trucksTable.id, truckId)).limit(1);
  if (!truck) return res.status(404).json({ error: "Camion non trouvé" });

  const pendingTransfers = await db.select().from(cashTransfersTable)
    .where(eq(cashTransfersTable.truckId, truckId));
  const pendingTotal = pendingTransfers
    .filter(t => t.status === "pending")
    .reduce((sum, t) => sum + Number(t.amount), 0);

  res.json({
    truckId: truck.id,
    truckName: truck.name,
    cashBalance: Number(truck.cashBalance),
    pendingTransfers: pendingTotal,
  });
});

router.get("/cash/transfers", async (_req, res) => {
  const transfers = await db.select({
    id: cashTransfersTable.id,
    truckId: cashTransfersTable.truckId,
    truckName: trucksTable.name,
    amount: cashTransfersTable.amount,
    status: cashTransfersTable.status,
    note: cashTransfersTable.note,
    createdAt: cashTransfersTable.createdAt,
  }).from(cashTransfersTable)
    .leftJoin(trucksTable, eq(cashTransfersTable.truckId, trucksTable.id))
    .orderBy(cashTransfersTable.createdAt);
  res.json(transfers.map(t => ({ ...t, amount: Number(t.amount) })));
});

router.post("/cash/transfers", async (req, res) => {
  const { truckId, amount, note } = req.body;
  if (!truckId || !amount || amount <= 0) return res.status(400).json({ error: "Camion et montant requis" });
  const [transfer] = await db.insert(cashTransfersTable).values({
    truckId: parseInt(truckId), amount: String(amount), status: "pending", note: note || null,
  }).returning();
  const [truck] = await db.select().from(trucksTable).where(eq(trucksTable.id, parseInt(truckId))).limit(1);
  res.status(201).json({
    ...transfer,
    truckName: truck?.name ?? "",
    amount: Number(transfer.amount),
  });
});

router.post("/cash/transfers/:id/approve", async (req, res) => {
  const id = parseInt(req.params.id);
  const [transfer] = await db.select({
    id: cashTransfersTable.id,
    truckId: cashTransfersTable.truckId,
    amount: cashTransfersTable.amount,
    status: cashTransfersTable.status,
    note: cashTransfersTable.note,
    createdAt: cashTransfersTable.createdAt,
  }).from(cashTransfersTable).where(eq(cashTransfersTable.id, id)).limit(1);
  if (!transfer) return res.status(404).json({ error: "Transfert non trouvé" });
  if (transfer.status !== "pending") return res.status(400).json({ error: "Transfert déjà traité" });

  await db.update(cashTransfersTable).set({ status: "approved" }).where(eq(cashTransfersTable.id, id));

  // Deduct from truck cash
  const [truck] = await db.select().from(trucksTable).where(eq(trucksTable.id, transfer.truckId)).limit(1);
  if (truck) {
    await db.update(trucksTable).set({
      cashBalance: String(Math.max(0, Number(truck.cashBalance) - Number(transfer.amount))),
    }).where(eq(trucksTable.id, transfer.truckId));
  }

  const [updated] = await db.select({
    id: cashTransfersTable.id,
    truckId: cashTransfersTable.truckId,
    truckName: trucksTable.name,
    amount: cashTransfersTable.amount,
    status: cashTransfersTable.status,
    note: cashTransfersTable.note,
    createdAt: cashTransfersTable.createdAt,
  }).from(cashTransfersTable)
    .leftJoin(trucksTable, eq(cashTransfersTable.truckId, trucksTable.id))
    .where(eq(cashTransfersTable.id, id)).limit(1);
  res.json({ ...updated, amount: Number(updated?.amount ?? 0) });
});

router.post("/cash/transfers/:id/reject", async (req, res) => {
  const id = parseInt(req.params.id);
  await db.update(cashTransfersTable).set({ status: "rejected" }).where(eq(cashTransfersTable.id, id));
  const [updated] = await db.select({
    id: cashTransfersTable.id,
    truckId: cashTransfersTable.truckId,
    truckName: trucksTable.name,
    amount: cashTransfersTable.amount,
    status: cashTransfersTable.status,
    note: cashTransfersTable.note,
    createdAt: cashTransfersTable.createdAt,
  }).from(cashTransfersTable)
    .leftJoin(trucksTable, eq(cashTransfersTable.truckId, trucksTable.id))
    .where(eq(cashTransfersTable.id, id)).limit(1);
  res.json({ ...updated, amount: Number(updated?.amount ?? 0) });
});

export default router;
