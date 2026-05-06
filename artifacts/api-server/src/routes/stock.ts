import { Router } from "express";
import { db } from "@workspace/db";
import {
  productsTable, categoriesTable, trucksTable,
  truckStockTable, stockTransfersTable, stockTransferItemsTable,
} from "@workspace/db";
import { eq, and } from "drizzle-orm";

const router = Router();

router.get("/stock/warehouse", async (_req, res) => {
  const stock = await db.select({
    productId: productsTable.id,
    productName: productsTable.name,
    categoryName: categoriesTable.name,
    quantity: productsTable.stockQuantity,
    unit: productsTable.unit,
    purchasePrice: productsTable.purchasePrice,
  }).from(productsTable)
    .leftJoin(categoriesTable, eq(productsTable.categoryId, categoriesTable.id))
    .orderBy(productsTable.name);
  res.json(stock.map(s => ({ ...s, quantity: Number(s.quantity), purchasePrice: Number(s.purchasePrice) })));
});

router.post("/stock/transfer", async (req, res) => {
  const { truckId, items } = req.body;
  if (!truckId || !items?.length) return res.status(400).json({ error: "Camion et articles requis" });

  const [transfer] = await db.insert(stockTransfersTable).values({
    truckId: parseInt(truckId),
  }).returning();

  for (const item of items) {
    const qty = Number(item.quantity);
    const productId = parseInt(item.productId);

    // Decrease warehouse stock
    const [product] = await db.select().from(productsTable).where(eq(productsTable.id, productId)).limit(1);
    if (!product || Number(product.stockQuantity) < qty) {
      return res.status(400).json({ error: `Stock insuffisant pour ${product?.name ?? 'produit'}` });
    }
    await db.update(productsTable).set({
      stockQuantity: String(Number(product.stockQuantity) - qty),
    }).where(eq(productsTable.id, productId));

    // Increase truck stock
    const [existing] = await db.select().from(truckStockTable)
      .where(and(eq(truckStockTable.truckId, parseInt(truckId)), eq(truckStockTable.productId, productId)))
      .limit(1);
    if (existing) {
      await db.update(truckStockTable).set({
        quantity: String(Number(existing.quantity) + qty),
      }).where(eq(truckStockTable.id, existing.id));
    } else {
      await db.insert(truckStockTable).values({
        truckId: parseInt(truckId), productId, quantity: String(qty),
      });
    }

    await db.insert(stockTransferItemsTable).values({
      transferId: transfer.id, productId, quantity: String(qty),
    });
  }

  // Return full transfer
  const [truck] = await db.select().from(trucksTable).where(eq(trucksTable.id, parseInt(truckId))).limit(1);
  const transferItems = await db.select({
    productId: stockTransferItemsTable.productId,
    productName: productsTable.name,
    quantity: stockTransferItemsTable.quantity,
  }).from(stockTransferItemsTable)
    .leftJoin(productsTable, eq(stockTransferItemsTable.productId, productsTable.id))
    .where(eq(stockTransferItemsTable.transferId, transfer.id));

  res.json({
    id: transfer.id,
    truckId: transfer.truckId,
    truckName: truck?.name ?? "",
    items: transferItems.map(i => ({ ...i, quantity: Number(i.quantity) })),
    createdAt: transfer.createdAt,
  });
});

router.get("/stock/transfers", async (_req, res) => {
  const transfers = await db.select({
    id: stockTransfersTable.id,
    truckId: stockTransfersTable.truckId,
    truckName: trucksTable.name,
    createdAt: stockTransfersTable.createdAt,
  }).from(stockTransfersTable)
    .leftJoin(trucksTable, eq(stockTransfersTable.truckId, trucksTable.id))
    .orderBy(stockTransfersTable.createdAt);

  const result = await Promise.all(transfers.map(async (t) => {
    const items = await db.select({
      productId: stockTransferItemsTable.productId,
      productName: productsTable.name,
      quantity: stockTransferItemsTable.quantity,
    }).from(stockTransferItemsTable)
      .leftJoin(productsTable, eq(stockTransferItemsTable.productId, productsTable.id))
      .where(eq(stockTransferItemsTable.transferId, t.id));
    return { ...t, items: items.map(i => ({ ...i, quantity: Number(i.quantity) })) };
  }));

  res.json(result);
});

export default router;
