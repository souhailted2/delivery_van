import { Router } from "express";
import { db } from "@workspace/db";
import {
  productsTable, categoriesTable, trucksTable,
  truckStockTable, stockTransfersTable, stockTransferItemsTable,
  warehouseStockTable, usersTable, branchesTable,
} from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";

const router = Router();

async function getSessionBranchId(req: any): Promise<number | null> {
  const userId = req.session?.userId;
  if (!userId) return null;
  const [user] = await db.select({ branchId: usersTable.branchId, role: usersTable.role })
    .from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  if (!user) return null;
  if (user.role === "admin" && !user.branchId) return null;
  return user.branchId ?? null;
}

router.get("/stock/warehouse", async (req, res) => {
  const branchId = await getSessionBranchId(req);
  const reqBranchId = req.query.branchId ? parseInt(req.query.branchId as string) : null;
  const effectiveBranchId = branchId ?? reqBranchId;

  if (!effectiveBranchId) {
    // Super admin: return all products with aggregated stock across branches
    // Falls back to products.stock_quantity when no warehouse_stock records exist
    const products = await db.select({
      productId: productsTable.id,
      productName: productsTable.name,
      categoryName: categoriesTable.name,
      unit: productsTable.unit,
      purchasePrice: productsTable.purchasePrice,
      stockQuantity: productsTable.stockQuantity,
    }).from(productsTable)
      .leftJoin(categoriesTable, eq(productsTable.categoryId, categoriesTable.id))
      .orderBy(productsTable.name);

    // Get all warehouse stock
    const allStock = await db.select().from(warehouseStockTable);
    const stockByProduct = new Map<number, number>();
    for (const s of allStock) {
      stockByProduct.set(s.productId, (stockByProduct.get(s.productId) ?? 0) + Number(s.quantity));
    }

    return res.json(products.map(p => ({
      ...p,
      // Use warehouse_stock sum if any records exist, otherwise fall back to products.stock_quantity
      quantity: stockByProduct.has(p.productId)
        ? stockByProduct.get(p.productId)!
        : Number(p.stockQuantity ?? 0),
      purchasePrice: Number(p.purchasePrice),
    })));
  }

  // Branch-specific warehouse stock
  // Falls back to products.stock_quantity when no warehouse_stock record exists for this branch
  const stock = await db.select({
    productId: productsTable.id,
    productName: productsTable.name,
    categoryName: categoriesTable.name,
    unit: productsTable.unit,
    purchasePrice: productsTable.purchasePrice,
    quantity: warehouseStockTable.quantity,
    stockQuantity: productsTable.stockQuantity,
  }).from(productsTable)
    .leftJoin(categoriesTable, eq(productsTable.categoryId, categoriesTable.id))
    .leftJoin(
      warehouseStockTable,
      and(
        eq(warehouseStockTable.productId, productsTable.id),
        eq(warehouseStockTable.branchId, effectiveBranchId)
      )
    )
    .orderBy(productsTable.name);

  res.json(stock.map(s => ({
    ...s,
    // Use warehouse_stock if a record exists, otherwise fall back to products.stock_quantity
    quantity: s.quantity !== null ? Number(s.quantity) : Number(s.stockQuantity ?? 0),
    purchasePrice: Number(s.purchasePrice),
  })));
});

router.post("/stock/transfer", async (req, res) => {
  const { truckId, items } = req.body;
  if (!truckId || !items?.length) return res.status(400).json({ error: "Camion et articles requis" });

  // Get the truck's branch
  const [truck] = await db.select().from(trucksTable).where(eq(trucksTable.id, parseInt(truckId))).limit(1);
  if (!truck) return res.status(404).json({ error: "Camion non trouvé" });
  const branchId = truck.branchId;

  const [transfer] = await db.insert(stockTransfersTable).values({
    truckId: parseInt(truckId),
    branchId: branchId ?? null,
  }).returning();

  for (const item of items) {
    const qty = Number(item.quantity);
    const productId = parseInt(item.productId);

    if (branchId) {
      // Try branch warehouse_stock first
      const [ws] = await db.select().from(warehouseStockTable)
        .where(and(eq(warehouseStockTable.branchId, branchId), eq(warehouseStockTable.productId, productId)))
        .limit(1);

      if (ws) {
        // warehouse_stock record exists — deduct from it
        const currentQty = Number(ws.quantity);
        if (currentQty < qty) {
          const [product] = await db.select({ name: productsTable.name }).from(productsTable)
            .where(eq(productsTable.id, productId)).limit(1);
          return res.status(400).json({ error: `الكمية غير كافية في المخزن للمنتج: ${product?.name ?? 'منتج غير معروف'}` });
        }
        await db.update(warehouseStockTable).set({
          quantity: String(currentQty - qty),
        }).where(eq(warehouseStockTable.id, ws.id));
      } else {
        // No warehouse_stock record — fall back to products.stock_quantity
        const [product] = await db.select().from(productsTable).where(eq(productsTable.id, productId)).limit(1);
        if (!product) {
          return res.status(400).json({ error: `منتج غير موجود: ${productId}` });
        }
        const currentQty = Number(product.stockQuantity);
        if (currentQty < qty) {
          return res.status(400).json({ error: `الكمية غير كافية في المخزن للمنتج: ${product.name}` });
        }
        // Deduct from products.stock_quantity
        await db.update(productsTable).set({
          stockQuantity: String(currentQty - qty),
        }).where(eq(productsTable.id, productId));
      }
    } else {
      // No branch on truck — use products.stock_quantity directly
      const [product] = await db.select().from(productsTable).where(eq(productsTable.id, productId)).limit(1);
      if (!product) {
        return res.status(400).json({ error: `منتج غير موجود: ${productId}` });
      }
      const currentQty = Number(product.stockQuantity);
      if (currentQty < qty) {
        return res.status(400).json({ error: `الكمية غير كافية في المخزن للمنتج: ${product.name}` });
      }
      await db.update(productsTable).set({
        stockQuantity: String(currentQty - qty),
      }).where(eq(productsTable.id, productId));
    }

    // Increase truck stock — atomic upsert keyed on (truck_id, product_id).
    // Avoids a SELECT-then-write race that could violate the unique index.
    await db.insert(truckStockTable)
      .values({
        truckId: parseInt(truckId), productId, quantity: String(qty),
        syncId: `ts-${parseInt(truckId)}-${productId}-${Date.now()}`,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [truckStockTable.truckId, truckStockTable.productId],
        set: {
          quantity: sql`${truckStockTable.quantity} + ${qty}`,
          updatedAt: new Date(),
          isDeleted: false,
        },
      });

    await db.insert(stockTransferItemsTable).values({
      transferId: transfer.id, productId, quantity: String(qty),
    });
  }

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
    branchId: transfer.branchId,
    truckName: truck?.name ?? "",
    items: transferItems.map(i => ({ ...i, quantity: Number(i.quantity) })),
    createdAt: transfer.createdAt,
  });
});

router.get("/stock/transfers", async (req, res) => {
  const branchId = await getSessionBranchId(req);

  let query = db.select({
    id: stockTransfersTable.id,
    truckId: stockTransfersTable.truckId,
    branchId: stockTransfersTable.branchId,
    truckName: trucksTable.name,
    createdAt: stockTransfersTable.createdAt,
  }).from(stockTransfersTable)
    .leftJoin(trucksTable, eq(stockTransfersTable.truckId, trucksTable.id));

  const transfers = branchId
    ? await query.where(eq(stockTransfersTable.branchId, branchId)).orderBy(stockTransfersTable.createdAt)
    : await query.orderBy(stockTransfersTable.createdAt);

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

// ── مخزون كل الفروع — للقراءة من تطبيق Electron ──────────────────────────────

router.get("/stock/branches-export", async (req, res) => {
  const userId = (req.session as any)?.userId;
  if (!userId) { res.status(401).json({ error: "Non authentifié" }); return; }

  const [user] = await db
    .select({ branchId: usersTable.branchId, role: usersTable.role })
    .from(usersTable).where(eq(usersTable.id, userId)).limit(1);

  const stock = await db.select({
    branchId: warehouseStockTable.branchId,
    branchName: branchesTable.name,
    productId: warehouseStockTable.productId,
    productName: productsTable.name,
    quantity: warehouseStockTable.quantity,
    unit: productsTable.unit,
  }).from(warehouseStockTable)
    .leftJoin(productsTable, eq(warehouseStockTable.productId, productsTable.id))
    .leftJoin(branchesTable, eq(warehouseStockTable.branchId, branchesTable.id))
    .orderBy(branchesTable.name, productsTable.name);

  res.json({
    currentBranchId: user?.branchId ?? null,
    stock: stock.map((s) => ({
      branchId: s.branchId,
      branchName: s.branchName ?? `فرع ${s.branchId}`,
      productId: s.productId,
      productName: s.productName ?? "",
      quantity: Number(s.quantity),
      unit: s.unit ?? "unité",
    })),
  });
});

// ── استيراد مخزون فرع من Electron ────────────────────────────────────────────

router.post("/stock/sync-import", async (req, res) => {
  const userId = (req.session as any)?.userId;
  if (!userId) { res.status(401).json({ error: "Non authentifié" }); return; }

  const [user] = await db
    .select({ branchId: usersTable.branchId })
    .from(usersTable).where(eq(usersTable.id, userId)).limit(1);

  const branchId = user?.branchId;
  if (!branchId) { res.status(400).json({ error: "Utilisateur sans branche" }); return; }

  const { items } = req.body;
  if (!Array.isArray(items)) { res.status(400).json({ error: "items array required" }); return; }

  let count = 0;
  for (const item of items) {
    if (!item.productId || item.quantity === undefined) continue;
    const productId = parseInt(item.productId);
    const quantity = String(Number(item.quantity));

    const [existing] = await db.select().from(warehouseStockTable)
      .where(and(eq(warehouseStockTable.branchId, branchId), eq(warehouseStockTable.productId, productId)))
      .limit(1);

    if (existing) {
      await db.update(warehouseStockTable).set({ quantity }).where(eq(warehouseStockTable.id, existing.id));
    } else {
      await db.insert(warehouseStockTable).values({ branchId, productId, quantity });
    }
    count++;
  }

  res.json({ success: true, count, message: `تم تحديث ${count} منتج في المخزن` });
});

export default router;
