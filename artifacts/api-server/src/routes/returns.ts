import { Router } from "express";
import { db } from "@workspace/db";
import {
  returnsTable, returnItemsTable, trucksTable, clientsTable,
  productsTable, truckStockTable,
} from "@workspace/db";
import { eq, and } from "drizzle-orm";

const router = Router();

async function getReturnWithItems(id: number) {
  const [ret] = await db.select({
    id: returnsTable.id,
    type: returnsTable.type,
    truckId: returnsTable.truckId,
    truckName: trucksTable.name,
    clientId: returnsTable.clientId,
    clientName: clientsTable.name,
    invoiceId: returnsTable.invoiceId,
    totalAmount: returnsTable.totalAmount,
    createdAt: returnsTable.createdAt,
  }).from(returnsTable)
    .leftJoin(trucksTable, eq(returnsTable.truckId, trucksTable.id))
    .leftJoin(clientsTable, eq(returnsTable.clientId, clientsTable.id))
    .where(eq(returnsTable.id, id)).limit(1);
  if (!ret) return null;

  const items = await db.select({
    productId: returnItemsTable.productId,
    productName: productsTable.name,
    quantity: returnItemsTable.quantity,
    unitPrice: returnItemsTable.unitPrice,
    subtotal: returnItemsTable.subtotal,
  }).from(returnItemsTable)
    .leftJoin(productsTable, eq(returnItemsTable.productId, productsTable.id))
    .where(eq(returnItemsTable.returnId, id));

  return {
    ...ret,
    totalAmount: Number(ret.totalAmount),
    items: items.map(i => ({ ...i, quantity: Number(i.quantity), unitPrice: Number(i.unitPrice), subtotal: Number(i.subtotal) })),
  };
}

router.get("/returns", async (_req, res) => {
  const returns = await db.select({ id: returnsTable.id }).from(returnsTable).orderBy(returnsTable.createdAt);
  const result = await Promise.all(returns.map(r => getReturnWithItems(r.id)));
  res.json(result.filter(Boolean));
});

router.post("/returns", async (req, res) => {
  const { type, truckId, clientId, invoiceId, items } = req.body;
  if (!type || !items?.length) return res.status(400).json({ error: "Type et articles requis" });

  let totalAmount = 0;
  const [ret] = await db.insert(returnsTable).values({
    type, truckId: truckId || null, clientId: clientId || null,
    invoiceId: invoiceId || null, totalAmount: "0",
  }).returning();

  for (const item of items) {
    const qty = Number(item.quantity);
    const unitPrice = Number(item.unitPrice);
    const subtotal = qty * unitPrice;
    totalAmount += subtotal;

    await db.insert(returnItemsTable).values({
      returnId: ret.id, productId: parseInt(item.productId),
      quantity: String(qty), unitPrice: String(unitPrice), subtotal: String(subtotal),
    });

    if (type === "client_return" && truckId) {
      // Return to truck stock
      const [ts] = await db.select().from(truckStockTable)
        .where(and(eq(truckStockTable.truckId, parseInt(truckId)), eq(truckStockTable.productId, parseInt(item.productId))))
        .limit(1);
      if (ts) {
        await db.update(truckStockTable).set({ quantity: String(Number(ts.quantity) + qty) }).where(eq(truckStockTable.id, ts.id));
      } else {
        await db.insert(truckStockTable).values({ truckId: parseInt(truckId), productId: parseInt(item.productId), quantity: String(qty) });
      }
    } else if (type === "truck_return") {
      // Return to warehouse stock
      const [product] = await db.select().from(productsTable).where(eq(productsTable.id, parseInt(item.productId))).limit(1);
      if (product) {
        await db.update(productsTable).set({ stockQuantity: String(Number(product.stockQuantity) + qty) }).where(eq(productsTable.id, parseInt(item.productId)));
      }
    }
  }

  await db.update(returnsTable).set({ totalAmount: String(totalAmount) }).where(eq(returnsTable.id, ret.id));
  const result = await getReturnWithItems(ret.id);
  res.status(201).json(result);
});

router.get("/returns/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  const result = await getReturnWithItems(id);
  if (!result) return res.status(404).json({ error: "Retour non trouvé" });
  res.json(result);
});

export default router;
