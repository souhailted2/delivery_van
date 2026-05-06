import { Router } from "express";
import { db } from "@workspace/db";
import {
  invoicesTable, invoiceItemsTable, trucksTable, clientsTable,
  productsTable, truckStockTable,
} from "@workspace/db";
import { eq, and, gte, lte, SQL } from "drizzle-orm";

const router = Router();

async function getInvoiceWithItems(id: number) {
  const [inv] = await db.select({
    id: invoicesTable.id,
    invoiceNumber: invoicesTable.invoiceNumber,
    truckId: invoicesTable.truckId,
    truckName: trucksTable.name,
    clientId: invoicesTable.clientId,
    clientName: clientsTable.name,
    paymentType: invoicesTable.paymentType,
    totalAmount: invoicesTable.totalAmount,
    totalCommission: invoicesTable.totalCommission,
    latitude: invoicesTable.latitude,
    longitude: invoicesTable.longitude,
    createdAt: invoicesTable.createdAt,
  }).from(invoicesTable)
    .leftJoin(trucksTable, eq(invoicesTable.truckId, trucksTable.id))
    .leftJoin(clientsTable, eq(invoicesTable.clientId, clientsTable.id))
    .where(eq(invoicesTable.id, id)).limit(1);
  if (!inv) return null;

  const items = await db.select({
    id: invoiceItemsTable.id,
    productId: invoiceItemsTable.productId,
    productName: productsTable.name,
    quantity: invoiceItemsTable.quantity,
    priceType: invoiceItemsTable.priceType,
    unitPrice: invoiceItemsTable.unitPrice,
    commission: invoiceItemsTable.commission,
    subtotal: invoiceItemsTable.subtotal,
  }).from(invoiceItemsTable)
    .leftJoin(productsTable, eq(invoiceItemsTable.productId, productsTable.id))
    .where(eq(invoiceItemsTable.invoiceId, id));

  return {
    ...inv,
    totalAmount: Number(inv.totalAmount),
    totalCommission: Number(inv.totalCommission),
    items: items.map(i => ({
      ...i,
      quantity: Number(i.quantity),
      unitPrice: Number(i.unitPrice),
      commission: Number(i.commission),
      subtotal: Number(i.subtotal),
    })),
  };
}

router.get("/invoices", async (req, res) => {
  const { truckId, clientId, dateFrom, dateTo, paymentType } = req.query;
  const conditions: SQL[] = [];
  if (truckId) conditions.push(eq(invoicesTable.truckId, parseInt(truckId as string)));
  if (clientId) conditions.push(eq(invoicesTable.clientId, parseInt(clientId as string)));
  if (paymentType) conditions.push(eq(invoicesTable.paymentType, paymentType as string));
  if (dateFrom) conditions.push(gte(invoicesTable.createdAt, new Date(dateFrom as string)));
  if (dateTo) conditions.push(lte(invoicesTable.createdAt, new Date(dateTo as string)));

  const invoices = await db.select({
    id: invoicesTable.id,
    invoiceNumber: invoicesTable.invoiceNumber,
    truckId: invoicesTable.truckId,
    truckName: trucksTable.name,
    clientId: invoicesTable.clientId,
    clientName: clientsTable.name,
    paymentType: invoicesTable.paymentType,
    totalAmount: invoicesTable.totalAmount,
    totalCommission: invoicesTable.totalCommission,
    latitude: invoicesTable.latitude,
    longitude: invoicesTable.longitude,
    createdAt: invoicesTable.createdAt,
  }).from(invoicesTable)
    .leftJoin(trucksTable, eq(invoicesTable.truckId, trucksTable.id))
    .leftJoin(clientsTable, eq(invoicesTable.clientId, clientsTable.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(invoicesTable.createdAt);

  const result = await Promise.all(invoices.map(inv => getInvoiceWithItems(inv.id)));
  res.json(result.filter(Boolean));
});

router.post("/invoices", async (req, res) => {
  const { truckId, clientId, paymentType, latitude, longitude, items } = req.body;
  if (!truckId || !clientId || !items?.length) {
    return res.status(400).json({ error: "Camion, client et articles requis" });
  }

  let totalAmount = 0;
  let totalCommission = 0;
  const invoiceNumber = `FAC-${Date.now()}`;

  const [invoice] = await db.insert(invoicesTable).values({
    invoiceNumber,
    truckId: parseInt(truckId),
    clientId: parseInt(clientId),
    paymentType: paymentType || "cash",
    totalAmount: "0",
    totalCommission: "0",
    latitude: latitude || null,
    longitude: longitude || null,
  }).returning();

  for (const item of items) {
    const qty = Number(item.quantity);
    const unitPrice = Number(item.unitPrice);
    const subtotal = qty * unitPrice;

    // Get product for commission
    const [product] = await db.select().from(productsTable)
      .where(eq(productsTable.id, parseInt(item.productId))).limit(1);

    let commissionRate = 0;
    if (product) {
      if (item.priceType === "retail") commissionRate = Number(product.commissionRetail);
      else if (item.priceType === "half_wholesale") commissionRate = Number(product.commissionHalf);
      else if (item.priceType === "wholesale") commissionRate = Number(product.commissionWholesale);
    }
    const commission = (subtotal * commissionRate) / 100;

    await db.insert(invoiceItemsTable).values({
      invoiceId: invoice.id,
      productId: parseInt(item.productId),
      quantity: String(qty),
      priceType: item.priceType || "retail",
      unitPrice: String(unitPrice),
      commission: String(commission),
      subtotal: String(subtotal),
    });

    totalAmount += subtotal;
    totalCommission += commission;

    // Decrease truck stock
    const [ts] = await db.select().from(truckStockTable)
      .where(and(eq(truckStockTable.truckId, parseInt(truckId)), eq(truckStockTable.productId, parseInt(item.productId))))
      .limit(1);
    if (ts) {
      await db.update(truckStockTable).set({
        quantity: String(Math.max(0, Number(ts.quantity) - qty)),
      }).where(eq(truckStockTable.id, ts.id));
    }
  }

  // Update totals
  await db.update(invoicesTable).set({
    totalAmount: String(totalAmount),
    totalCommission: String(totalCommission),
  }).where(eq(invoicesTable.id, invoice.id));

  // Update truck cash if cash payment
  if (paymentType === "cash") {
    const [truck] = await db.select().from(trucksTable).where(eq(trucksTable.id, parseInt(truckId))).limit(1);
    if (truck) {
      await db.update(trucksTable).set({
        cashBalance: String(Number(truck.cashBalance) + totalAmount),
      }).where(eq(trucksTable.id, parseInt(truckId)));
    }
  }

  // Update client balance if credit
  if (paymentType === "credit") {
    const [client] = await db.select().from(clientsTable).where(eq(clientsTable.id, parseInt(clientId))).limit(1);
    if (client) {
      await db.update(clientsTable).set({
        balance: String(Number(client.balance) - totalAmount),
      }).where(eq(clientsTable.id, parseInt(clientId)));
    }
  }

  const result = await getInvoiceWithItems(invoice.id);
  res.status(201).json(result);
});

router.get("/invoices/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  const result = await getInvoiceWithItems(id);
  if (!result) return res.status(404).json({ error: "Facture non trouvée" });
  res.json(result);
});

router.delete("/invoices/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  await db.delete(invoiceItemsTable).where(eq(invoiceItemsTable.invoiceId, id));
  await db.delete(invoicesTable).where(eq(invoicesTable.id, id));
  res.status(204).send();
});

export default router;
