import { Router } from "express";
import { db } from "@workspace/db";
import {
  purchasesTable, purchaseItemsTable, suppliersTable, productsTable
} from "@workspace/db";
import { eq } from "drizzle-orm";

const router = Router();

async function getPurchaseWithItems(id: number) {
  const [purchase] = await db.select({
    id: purchasesTable.id,
    supplierId: purchasesTable.supplierId,
    supplierName: suppliersTable.name,
    totalAmount: purchasesTable.totalAmount,
    paidAmount: purchasesTable.paidAmount,
    paymentStatus: purchasesTable.paymentStatus,
    createdAt: purchasesTable.createdAt,
  }).from(purchasesTable)
    .leftJoin(suppliersTable, eq(purchasesTable.supplierId, suppliersTable.id))
    .where(eq(purchasesTable.id, id)).limit(1);
  if (!purchase) return null;

  const items = await db.select({
    id: purchaseItemsTable.id,
    productId: purchaseItemsTable.productId,
    productName: productsTable.name,
    quantity: purchaseItemsTable.quantity,
    purchasePrice: purchaseItemsTable.purchasePrice,
    subtotal: purchaseItemsTable.subtotal,
  }).from(purchaseItemsTable)
    .leftJoin(productsTable, eq(purchaseItemsTable.productId, productsTable.id))
    .where(eq(purchaseItemsTable.purchaseId, id));

  return {
    ...purchase,
    totalAmount: Number(purchase.totalAmount),
    paidAmount: Number(purchase.paidAmount),
    remainingAmount: Number(purchase.totalAmount) - Number(purchase.paidAmount),
    items: items.map(i => ({ ...i, quantity: Number(i.quantity), purchasePrice: Number(i.purchasePrice), subtotal: Number(i.subtotal) })),
  };
}

router.get("/purchases", async (_req, res) => {
  const purchases = await db.select({
    id: purchasesTable.id,
    supplierId: purchasesTable.supplierId,
    supplierName: suppliersTable.name,
    totalAmount: purchasesTable.totalAmount,
    paidAmount: purchasesTable.paidAmount,
    paymentStatus: purchasesTable.paymentStatus,
    createdAt: purchasesTable.createdAt,
  }).from(purchasesTable)
    .leftJoin(suppliersTable, eq(purchasesTable.supplierId, suppliersTable.id))
    .orderBy(purchasesTable.createdAt);

  const result = await Promise.all(purchases.map(p => getPurchaseWithItems(p.id)));
  res.json(result.filter(Boolean));
});

router.post("/purchases", async (req, res) => {
  const { supplierId, items, initialPayment } = req.body;
  if (!supplierId || !items?.length) return res.status(400).json({ error: "Fournisseur et articles requis" });

  let total = 0;
  for (const item of items) {
    total += Number(item.quantity) * Number(item.purchasePrice);
  }
  const paid = initialPayment ? Math.min(Number(initialPayment), total) : 0;
  const status = paid >= total ? "paid" : paid > 0 ? "partial" : "pending";

  const [purchase] = await db.insert(purchasesTable).values({
    supplierId: parseInt(supplierId),
    totalAmount: String(total),
    paidAmount: String(paid),
    paymentStatus: status,
  }).returning();

  for (const item of items) {
    const qty = Number(item.quantity);
    const price = Number(item.purchasePrice);
    await db.insert(purchaseItemsTable).values({
      purchaseId: purchase.id,
      productId: parseInt(item.productId),
      quantity: String(qty),
      purchasePrice: String(price),
      subtotal: String(qty * price),
    });
    // Update warehouse stock
    const [product] = await db.select().from(productsTable).where(eq(productsTable.id, parseInt(item.productId))).limit(1);
    if (product) {
      await db.update(productsTable).set({
        stockQuantity: String(Number(product.stockQuantity) + qty),
      }).where(eq(productsTable.id, parseInt(item.productId)));
    }
  }

  // Update supplier balance (debt = total - paid)
  const [supplier] = await db.select().from(suppliersTable).where(eq(suppliersTable.id, parseInt(supplierId))).limit(1);
  if (supplier) {
    await db.update(suppliersTable).set({
      balance: String(Number(supplier.balance) + total - paid),
    }).where(eq(suppliersTable.id, parseInt(supplierId)));
  }

  const result = await getPurchaseWithItems(purchase.id);
  res.status(201).json(result);
});

router.get("/purchases/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  const result = await getPurchaseWithItems(id);
  if (!result) return res.status(404).json({ error: "Bon d'achat non trouvé" });
  res.json(result);
});

router.post("/purchases/:id/payment", async (req, res) => {
  const id = parseInt(req.params.id);
  const { amount } = req.body;
  if (!amount || amount <= 0) return res.status(400).json({ error: "Montant invalide" });

  const [purchase] = await db.select().from(purchasesTable).where(eq(purchasesTable.id, id)).limit(1);
  if (!purchase) return res.status(404).json({ error: "Bon non trouvé" });

  const newPaid = Math.min(Number(purchase.paidAmount) + Number(amount), Number(purchase.totalAmount));
  const newStatus = newPaid >= Number(purchase.totalAmount) ? "paid" : "partial";

  await db.update(purchasesTable).set({
    paidAmount: String(newPaid),
    paymentStatus: newStatus,
  }).where(eq(purchasesTable.id, id));

  // Update supplier balance
  const [supplier] = await db.select().from(suppliersTable).where(eq(suppliersTable.id, purchase.supplierId)).limit(1);
  if (supplier) {
    await db.update(suppliersTable).set({
      balance: String(Math.max(0, Number(supplier.balance) - Number(amount))),
    }).where(eq(suppliersTable.id, purchase.supplierId));
  }

  const result = await getPurchaseWithItems(id);
  res.json(result);
});

export default router;
