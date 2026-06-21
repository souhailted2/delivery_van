import { Router } from "express";
import { db } from "@workspace/db";
import { cashTransfersTable, trucksTable } from "@workspace/db";
import { and, eq, sql } from "drizzle-orm";

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

  // Claim-first inside a single transaction so concurrent syncs/retries cannot
  // double-apply the balance change: the conditional UPDATE only succeeds for the
  // single caller that flips pending→approved.
  const outcome = await db.transaction(async (tx) => {
    const claimed = await tx.update(cashTransfersTable)
      // Bump updated_at so the status change propagates to the truck via the
      // incremental sync pull (Postgres does not auto-update it, and pull +
      // last-write-wins both key off updated_at).
      .set({ status: "approved", updatedAt: new Date() })
      .where(and(eq(cashTransfersTable.id, id), eq(cashTransfersTable.status, "pending")))
      .returning({
        truckId: cashTransfersTable.truckId,
        amount: cashTransfersTable.amount,
        direction: cashTransfersTable.direction,
      });

    if (claimed.length === 0) {
      // Distinguish "not found" from "already processed" for the right HTTP code.
      const [exists] = await tx.select({ id: cashTransfersTable.id })
        .from(cashTransfersTable).where(eq(cashTransfersTable.id, id)).limit(1);
      return { error: exists ? "already" : "missing" as const };
    }

    const t = claimed[0];
    // direction "in" = truck delivered cash to admin → subtract from truck balance.
    // direction "out" = admin handed cash to truck → add to truck balance.
    const delta = t.direction === "out" ? Number(t.amount) : -Number(t.amount);
    // Atomic balance update (no read-modify-write) so concurrent approvals or
    // invoice-sync reconciliations for the same truck can't lose each other's deltas.
    await tx.update(trucksTable)
      .set({ cashBalance: sql`GREATEST(0, ${trucksTable.cashBalance} + ${delta})`, updatedAt: new Date() })
      .where(eq(trucksTable.id, t.truckId));
    return { error: null };
  });

  if (outcome.error === "missing") return res.status(404).json({ error: "Transfert non trouvé" });
  if (outcome.error === "already") return res.status(400).json({ error: "Transfert déjà traité" });

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
  await db.update(cashTransfersTable).set({ status: "rejected", updatedAt: new Date() }).where(eq(cashTransfersTable.id, id));
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
