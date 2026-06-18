import { Router } from "express";
import { db } from "@workspace/db";
import {
  truckDispatchesTable, truckStockTable, trucksTable, productsTable,
} from "@workspace/db";
import { eq, and, desc, sql } from "drizzle-orm";
import { requireAdmin } from "../lib/authMiddleware";

const router = Router();

function requireTruck(req: any, res: any, next: any) {
  if (!req.session?.truckId) return res.status(401).json({ error: "Non authentifié comme camion" });
  next();
}

// GET /api/dispatches?truckId=X — admin lists all dispatches (optionally filtered)
router.get("/dispatches", requireAdmin, async (req, res) => {
  const truckId = req.query.truckId ? parseInt(req.query.truckId as string) : null;
  const rows = truckId
    ? await db.select().from(truckDispatchesTable)
        .where(eq(truckDispatchesTable.truckId, truckId))
        .orderBy(desc(truckDispatchesTable.createdAt))
    : await db.select().from(truckDispatchesTable)
        .orderBy(desc(truckDispatchesTable.createdAt))
        .limit(100);
  res.json(rows.map(r => ({
    ...r,
    stockItems: JSON.parse(r.stockItems || "[]"),
  })));
});

// POST /api/dispatches — admin creates a dispatch
router.post("/dispatches", requireAdmin, async (req, res) => {
  const { truckId, stockItems, note } = req.body;
  if (!truckId || !Array.isArray(stockItems) || stockItems.length === 0) {
    return res.status(400).json({ error: "truckId و stockItems مطلوبان" });
  }

  // Verify truck exists
  const [truck] = await db.select({ id: trucksTable.id, name: trucksTable.name })
    .from(trucksTable).where(eq(trucksTable.id, truckId)).limit(1);
  if (!truck) return res.status(404).json({ error: "الشاحنة غير موجودة" });

  // Check no existing pending dispatch for this truck
  const [existing] = await db.select({ id: truckDispatchesTable.id })
    .from(truckDispatchesTable)
    .where(and(
      eq(truckDispatchesTable.truckId, truckId),
      eq(truckDispatchesTable.status, "pending"),
    )).limit(1);
  if (existing) {
    return res.status(409).json({ error: "يوجد أمر تحميل معلّق لهذه الشاحنة. أغلقه أولاً أو احذفه." });
  }

  const [dispatch] = await db.insert(truckDispatchesTable).values({
    truckId,
    stockItems: JSON.stringify(stockItems),
    note: note || null,
    createdBy: (req.session as any).userId,
  }).returning();

  res.status(201).json({
    ...dispatch,
    stockItems: JSON.parse(dispatch.stockItems),
  });
});

// DELETE /api/dispatches/:id — admin deletes a pending dispatch
router.delete("/dispatches/:id", requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id);
  const [row] = await db.select().from(truckDispatchesTable)
    .where(eq(truckDispatchesTable.id, id)).limit(1);
  if (!row) return res.status(404).json({ error: "غير موجود" });
  if (row.status !== "pending") return res.status(400).json({ error: "لا يمكن حذف أمر تحميل تم استلامه" });
  await db.delete(truckDispatchesTable).where(eq(truckDispatchesTable.id, id));
  res.status(204).send();
});

// POST /api/dispatches/:id/close — admin closes/archives a dispatch
router.post("/dispatches/:id/close", requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id);
  const [row] = await db.update(truckDispatchesTable)
    .set({ status: "closed", closedAt: new Date() })
    .where(eq(truckDispatchesTable.id, id))
    .returning();
  if (!row) return res.status(404).json({ error: "غير موجود" });
  res.json({ ...row, stockItems: JSON.parse(row.stockItems) });
});

// GET /api/dispatches/inbox — truck gets its pending dispatch
router.get("/dispatches/inbox", requireTruck, async (req, res) => {
  const truckId = (req.session as any).truckId as number;
  const [row] = await db.select().from(truckDispatchesTable)
    .where(and(
      eq(truckDispatchesTable.truckId, truckId),
      eq(truckDispatchesTable.status, "pending"),
    ))
    .orderBy(desc(truckDispatchesTable.createdAt))
    .limit(1);
  if (!row) return res.json(null);
  res.json({ ...row, stockItems: JSON.parse(row.stockItems) });
});

// POST /api/dispatches/:id/receive — truck confirms receipt and loads stock
router.post("/dispatches/:id/receive", requireTruck, async (req, res) => {
  const truckId = (req.session as any).truckId as number;
  const id = parseInt(req.params.id);

  const [row] = await db.select().from(truckDispatchesTable)
    .where(and(
      eq(truckDispatchesTable.id, id),
      eq(truckDispatchesTable.truckId, truckId),
    )).limit(1);
  if (!row) return res.status(404).json({ error: "أمر التحميل غير موجود" });
  if (row.status !== "pending") return res.status(400).json({ error: "تم استلام هذا الأمر مسبقاً" });

  const items: Array<{ productId: number; quantity: number }> = JSON.parse(row.stockItems);

  // Atomic + idempotent: claim the dispatch first (conditional on still being pending),
  // then apply all stock mutations in the SAME transaction. If a concurrent/retried
  // request already claimed it, the conditional update returns no row and we abort
  // before mutating any stock — preventing double truck-stock / double central deduction.
  const updated = await db.transaction(async (tx) => {
    const [claimed] = await tx.update(truckDispatchesTable)
      .set({ status: "received", receivedAt: new Date() })
      .where(and(
        eq(truckDispatchesTable.id, id),
        eq(truckDispatchesTable.status, "pending"),
      ))
      .returning();
    if (!claimed) return null;

    for (const item of items) {
      // Atomic upsert keyed on (truck_id, product_id) — race-safe with the unique index.
      await tx.insert(truckStockTable)
        .values({
          truckId,
          productId: item.productId,
          quantity: String(item.quantity),
          syncId: `ts-${truckId}-${item.productId}-${Date.now()}`,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [truckStockTable.truckId, truckStockTable.productId],
          set: {
            quantity: sql`${truckStockTable.quantity} + ${item.quantity}`,
            updatedAt: new Date(),
            isDeleted: false,
          },
        });

      // Deduct from admin/central stock now that the goods physically left the warehouse
      const [product] = await tx.select().from(productsTable)
        .where(eq(productsTable.id, item.productId)).limit(1);
      if (product) {
        await tx.update(productsTable)
          .set({
            stockQuantity: String(Math.max(0, Number(product.stockQuantity) - item.quantity)),
            updatedAt: new Date(),
          })
          .where(eq(productsTable.id, item.productId));
      }
    }

    return claimed;
  });

  if (!updated) return res.status(400).json({ error: "تم استلام هذا الأمر مسبقاً" });

  // Return updated truck stock
  const stock = await db.select({
    productId: truckStockTable.productId,
    productName: productsTable.name,
    quantity: truckStockTable.quantity,
    unit: productsTable.unit,
    sellingPriceRetail: productsTable.sellingPriceRetail,
  }).from(truckStockTable)
    .leftJoin(productsTable, eq(truckStockTable.productId, productsTable.id))
    .where(eq(truckStockTable.truckId, truckId));

  res.json({
    dispatch: { ...updated, stockItems: JSON.parse(updated.stockItems) },
    stock: stock.map(s => ({
      ...s,
      quantity: Number(s.quantity),
      sellingPriceRetail: Number(s.sellingPriceRetail ?? 0),
    })),
  });
});

export default router;
