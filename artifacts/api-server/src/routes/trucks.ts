import { Router } from "express";
import { db } from "@workspace/db";
import {
  trucksTable, usersTable, truckStockTable, productsTable,
  clientsTable, invoicesTable, invoiceItemsTable, cashTransfersTable,
  branchesTable, truckCommissionPaymentsTable, truckDispatchesTable,
  returnsTable, returnItemsTable, stockTransfersTable,
} from "@workspace/db";
import { eq, and, sql, sum } from "drizzle-orm";
import { hashPassword } from "./auth";

const router = Router();

function truckFromSession(req: any): number | null {
  return req.session?.truckId ?? null;
}

async function getSessionBranchId(req: any): Promise<number | null> {
  const userId = req.session?.userId;
  if (!userId) return null;
  const [user] = await db.select({ branchId: usersTable.branchId, role: usersTable.role })
    .from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  if (!user) return null;
  if (user.role === "admin" && !user.branchId) return null;
  return user.branchId ?? null;
}

router.get("/trucks", async (req, res) => {
  const branchId = await getSessionBranchId(req);
  const reqBranchId = req.query.branchId ? parseInt(req.query.branchId as string) : null;
  const effectiveBranchId = branchId ?? reqBranchId;

  const query = db.select({
    id: trucksTable.id,
    name: trucksTable.name,
    plateNumber: trucksTable.plateNumber,
    phone: trucksTable.phone,
    branchId: trucksTable.branchId,
    branchName: branchesTable.name,
    vendeurId: trucksTable.vendeurId,
    vendeurName: usersTable.fullName,
    driverName: trucksTable.driverName,
    location: trucksTable.location,
    cashBalance: trucksTable.cashBalance,
    canSellOnCredit: trucksTable.canSellOnCredit,
    latitude: trucksTable.latitude,
    longitude: trucksTable.longitude,
    createdAt: trucksTable.createdAt,
  }).from(trucksTable)
    .leftJoin(usersTable, eq(trucksTable.vendeurId, usersTable.id))
    .leftJoin(branchesTable, eq(trucksTable.branchId, branchesTable.id));

  const trucks = effectiveBranchId
    ? await query.where(eq(trucksTable.branchId, effectiveBranchId)).orderBy(trucksTable.name)
    : await query.orderBy(trucksTable.name);

  res.json(trucks.map(t => ({ ...t, cashBalance: Number(t.cashBalance) })));
});

router.post("/trucks", async (req, res) => {
  const { name, plateNumber, phone, branchId, vendeurId, driverName, password, location } = req.body;
  if (!name) return res.status(400).json({ error: "Nom requis" });
  const sessionBranchId = await getSessionBranchId(req);
  const [truck] = await db.insert(trucksTable).values({
    name,
    plateNumber: plateNumber || null,
    phone: phone || null,
    branchId: sessionBranchId ?? (branchId ? parseInt(branchId) : null),
    vendeurId: vendeurId || null,
    driverName: driverName || null,
    passwordHash: password ? hashPassword(password) : null,
    location: location || null,
    cashBalance: "0",
  }).returning();
  res.status(201).json({ ...truck, cashBalance: Number(truck.cashBalance) });
});

router.get("/trucks/me/stock", async (req, res) => {
  const truckId = truckFromSession(req);
  if (!truckId) return res.status(401).json({ error: "Non authentifié comme camion" });
  const stock = await db.select({
    productId: truckStockTable.productId,
    productName: productsTable.name,
    quantity: truckStockTable.quantity,
    unit: productsTable.unit,
    imageUrl: productsTable.imageUrl,
    sellingPriceRetail: productsTable.sellingPriceRetail,
    sellingPriceHalfWholesale: productsTable.sellingPriceHalfWholesale,
    sellingPriceWholesale: productsTable.sellingPriceWholesale,
  }).from(truckStockTable)
    .leftJoin(productsTable, eq(truckStockTable.productId, productsTable.id))
    .where(eq(truckStockTable.truckId, truckId));
  res.json(stock.map(s => ({
    ...s,
    quantity: Number(s.quantity),
    sellingPriceRetail: Number(s.sellingPriceRetail ?? 0),
    sellingPriceHalfWholesale: Number(s.sellingPriceHalfWholesale ?? 0),
    sellingPriceWholesale: Number(s.sellingPriceWholesale ?? 0),
  })));
});

router.get("/trucks/me/clients", async (req, res) => {
  const truckId = truckFromSession(req);
  if (!truckId) return res.status(401).json({ error: "Non authentifié comme camion" });
  const clients = await db.select().from(clientsTable)
    .where(eq(clientsTable.truckId, truckId))
    .orderBy(clientsTable.name);
  res.json(clients.map(c => ({ ...c, balance: Number(c.balance) })));
});

router.post("/trucks/me/clients", async (req, res) => {
  const truckId = truckFromSession(req);
  if (!truckId) return res.status(401).json({ error: "Non authentifié comme camion" });
  const { name, phone, clientType, latitude, longitude } = req.body;
  if (!name) return res.status(400).json({ error: "Nom requis" });

  // Get truck's branchId
  const [truck] = await db.select({ branchId: trucksTable.branchId }).from(trucksTable)
    .where(eq(trucksTable.id, truckId)).limit(1);

  const validTypes = ["retail", "half_wholesale", "wholesale"];
  const [client] = await db.insert(clientsTable).values({
    name, phone: phone || null,
    clientType: validTypes.includes(clientType) ? clientType : "retail",
    truckId,
    branchId: truck?.branchId ?? null,
    latitude: latitude || null, longitude: longitude || null,
    balance: "0",
  }).returning();
  res.status(201).json({ ...client, balance: Number(client.balance) });
});

router.put("/trucks/me/clients/:id", async (req, res) => {
  const truckId = truckFromSession(req);
  if (!truckId) return res.status(401).json({ error: "Non authentifié comme camion" });
  const id = parseInt(req.params.id);
  const [existing] = await db.select().from(clientsTable).where(eq(clientsTable.id, id)).limit(1);
  if (!existing || existing.truckId !== truckId) return res.status(403).json({ error: "Accès refusé" });
  const { name, phone, clientType, latitude, longitude } = req.body;
  const validTypes = ["retail", "half_wholesale", "wholesale"];
  const updates: Record<string, unknown> = {};
  if (name !== undefined) updates.name = name;
  if (phone !== undefined) updates.phone = phone;
  if (clientType !== undefined && validTypes.includes(clientType)) updates.clientType = clientType;
  if (latitude !== undefined) updates.latitude = latitude;
  if (longitude !== undefined) updates.longitude = longitude;
  const [client] = await db.update(clientsTable).set(updates).where(eq(clientsTable.id, id)).returning();
  res.json({ ...client, balance: Number(client.balance) });
});

router.get("/trucks/me/vendeurs", async (req, res) => {
  const truckId = truckFromSession(req);
  if (!truckId) return res.status(401).json({ error: "Non authentifié comme camion" });
  const vendeurs = await db.select({
    id: usersTable.id,
    fullName: usersTable.fullName,
    username: usersTable.username,
  }).from(usersTable)
    .where(and(eq(usersTable.truckId, truckId), eq(usersTable.role, "vendeur")));
  res.json(vendeurs);
});

router.post("/trucks/me/invoices", async (req, res) => {
  const truckId = truckFromSession(req);
  if (!truckId) return res.status(401).json({ error: "Non authentifié comme camion" });

  const { clientId, newClient, paymentType, latitude, longitude, items } = req.body;
  if (!items?.length) return res.status(400).json({ error: "Articles requis" });

  // Resolve or create client
  let resolvedClientId = clientId ? parseInt(clientId) : null;
  if (!resolvedClientId && newClient?.name) {
    const [truck] = await db.select({ branchId: trucksTable.branchId }).from(trucksTable)
      .where(eq(trucksTable.id, truckId)).limit(1);
    const [c] = await db.insert(clientsTable).values({
      name: newClient.name,
      phone: newClient.phone || null,
      clientType: newClient.clientType || "retail",
      truckId,
      branchId: truck?.branchId ?? null,
      latitude: newClient.latitude || null,
      longitude: newClient.longitude || null,
      balance: "0",
    }).returning();
    resolvedClientId = c.id;
  }
  if (!resolvedClientId) return res.status(400).json({ error: "Client requis" });

  // Check client ownership
  const [client] = await db.select().from(clientsTable).where(eq(clientsTable.id, resolvedClientId)).limit(1);
  if (!client) return res.status(404).json({ error: "Client non trouvé" });
  if (client.truckId && client.truckId !== truckId) return res.status(403).json({ error: "Client appartient à un autre camion" });

  // Compute totals
  let total = 0;
  let totalCommission = 0;
  const invoiceItems: any[] = [];
  for (const item of items) {
    const [product] = await db.select().from(productsTable).where(eq(productsTable.id, parseInt(item.productId))).limit(1);
    if (!product) return res.status(400).json({ error: "Produit non trouvé" });
    const qty = Number(item.quantity);
    const priceType = item.priceType || "retail";
    let unitPrice = Number(product.sellingPriceRetail);
    let commission = Number(product.commissionRetail);
    if (priceType === "half_wholesale") { unitPrice = Number(product.sellingPriceHalfWholesale); commission = Number(product.commissionHalf); }
    if (priceType === "wholesale") { unitPrice = Number(product.sellingPriceWholesale); commission = Number(product.commissionWholesale); }
    if (item.unitPrice !== undefined) unitPrice = Number(item.unitPrice);
    const subtotal = qty * unitPrice;
    total += subtotal;
    totalCommission += commission * qty;
    invoiceItems.push({ productId: parseInt(item.productId), quantity: qty, priceType, unitPrice, commission, subtotal });
  }

  // Generate invoice number
  const count = await db.select({ id: invoicesTable.id }).from(invoicesTable);
  const invoiceNumber = `F-${String(count.length + 1).padStart(5, "0")}`;

  const [invoice] = await db.insert(invoicesTable).values({
    invoiceNumber,
    truckId,
    clientId: resolvedClientId,
    paymentType: paymentType || "cash",
    totalAmount: String(total),
    totalCommission: String(totalCommission),
    latitude: latitude || null,
    longitude: longitude || null,
  }).returning();

  for (const item of invoiceItems) {
    await db.insert(invoiceItemsTable).values({
      invoiceId: invoice.id,
      productId: item.productId,
      quantity: String(item.quantity),
      priceType: item.priceType,
      unitPrice: String(item.unitPrice),
      commission: String(item.commission),
      subtotal: String(item.subtotal),
    });
    // Decrease truck stock
    const [ts] = await db.select().from(truckStockTable)
      .where(and(eq(truckStockTable.truckId, truckId), eq(truckStockTable.productId, item.productId))).limit(1);
    if (ts) {
      await db.update(truckStockTable).set({
        quantity: String(Math.max(0, Number(ts.quantity) - item.quantity)),
      }).where(eq(truckStockTable.id, ts.id));
    }
  }

  // Update truck cash balance or client balance
  if (paymentType === "cash") {
    const [t] = await db.select().from(trucksTable).where(eq(trucksTable.id, truckId)).limit(1);
    if (t) await db.update(trucksTable).set({ cashBalance: String(Number(t.cashBalance) + total) }).where(eq(trucksTable.id, truckId));
  } else if (paymentType === "credit") {
    await db.update(clientsTable).set({ balance: String(Number(client.balance) - total) }).where(eq(clientsTable.id, resolvedClientId));
  }

  res.status(201).json({
    ...invoice,
    totalAmount: Number(invoice.totalAmount),
    totalCommission: Number(invoice.totalCommission),
    items: invoiceItems,
  });
});

router.get("/trucks/me/invoices", async (req, res) => {
  const truckId = truckFromSession(req);
  if (!truckId) return res.status(401).json({ error: "Non authentifié comme camion" });
  const invoices = await db.select({
    id: invoicesTable.id,
    invoiceNumber: invoicesTable.invoiceNumber,
    truckId: invoicesTable.truckId,
    clientId: invoicesTable.clientId,
    clientName: clientsTable.name,
    paymentType: invoicesTable.paymentType,
    totalAmount: invoicesTable.totalAmount,
    totalCommission: invoicesTable.totalCommission,
    latitude: invoicesTable.latitude,
    longitude: invoicesTable.longitude,
    createdAt: invoicesTable.createdAt,
  }).from(invoicesTable)
    .leftJoin(clientsTable, eq(invoicesTable.clientId, clientsTable.id))
    .where(eq(invoicesTable.truckId, truckId))
    .orderBy(sql`${invoicesTable.createdAt} DESC`);
  res.json(invoices.map(i => ({ ...i, totalAmount: Number(i.totalAmount), totalCommission: Number(i.totalCommission), items: [] })));
});

router.get("/trucks/me/invoices/:id", async (req, res) => {
  const truckId = truckFromSession(req);
  if (!truckId) return res.status(401).json({ error: "Non authentifié comme camion" });
  const id = parseInt(req.params.id);
  const [invoice] = await db.select().from(invoicesTable)
    .where(and(eq(invoicesTable.id, id), eq(invoicesTable.truckId, truckId))).limit(1);
  if (!invoice) return res.status(404).json({ error: "Facture non trouvée" });
  const items = await db.select({
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
  res.json({
    ...invoice,
    totalAmount: Number(invoice.totalAmount),
    totalCommission: Number(invoice.totalCommission),
    items: items.map(i => ({
      ...i,
      quantity: Number(i.quantity),
      unitPrice: Number(i.unitPrice),
      commission: Number(i.commission),
      subtotal: Number(i.subtotal),
    })),
  });
});

router.get("/trucks/me/cash", async (req, res) => {
  const truckId = truckFromSession(req);
  if (!truckId) return res.status(401).json({ error: "Non authentifié comme camion" });
  const transfers = await db.select().from(cashTransfersTable)
    .where(eq(cashTransfersTable.truckId, truckId))
    .orderBy(sql`${cashTransfersTable.createdAt} DESC`);
  res.json(transfers.map(t => ({ ...t, amount: Number(t.amount) })));
});

router.post("/trucks/me/cash", async (req, res) => {
  const truckId = truckFromSession(req);
  if (!truckId) return res.status(401).json({ error: "Non authentifié comme camion" });
  const { amount, note } = req.body;
  if (!amount || Number(amount) <= 0) return res.status(400).json({ error: "Montant invalide" });
  // Guard: amount must not exceed current cash balance
  const [truck] = await db.select({ cashBalance: trucksTable.cashBalance })
    .from(trucksTable).where(eq(trucksTable.id, truckId)).limit(1);
  const balance = Number(truck?.cashBalance ?? 0);
  if (Number(amount) > balance) {
    return res.status(400).json({ error: `المبلغ يتجاوز رصيد الصندوق (${balance} د.ج)` });
  }
  const [transfer] = await db.insert(cashTransfersTable).values({
    truckId, amount: String(amount), note: note || null,
  }).returning();
  res.status(201).json({ ...transfer, amount: Number(transfer.amount) });
});

// GET /trucks/:id/profile — clients, stock, commission summary
router.get("/trucks/:id/profile", async (req, res) => {
  const id = parseInt(req.params.id);

  // Unique clients who bought from this truck (via invoices)
  const clientRows = await db
    .selectDistinct({
      id: clientsTable.id,
      name: clientsTable.name,
      phone: clientsTable.phone,
    })
    .from(invoicesTable)
    .innerJoin(clientsTable, eq(invoicesTable.clientId, clientsTable.id))
    .where(eq(invoicesTable.truckId, id));

  // Current stock
  const stockRows = await db
    .select({
      productId: truckStockTable.productId,
      productName: productsTable.name,
      quantity: truckStockTable.quantity,
    })
    .from(truckStockTable)
    .leftJoin(productsTable, eq(truckStockTable.productId, productsTable.id))
    .where(and(eq(truckStockTable.truckId, id), sql`COALESCE(${truckStockTable.quantity}::numeric, 0) > 0`));

  // Commission totals
  const [commResult] = await db
    .select({ total: sum(invoicesTable.totalCommission) })
    .from(invoicesTable)
    .where(eq(invoicesTable.truckId, id));

  const [paidResult] = await db
    .select({ paid: sum(truckCommissionPaymentsTable.amount) })
    .from(truckCommissionPaymentsTable)
    .where(eq(truckCommissionPaymentsTable.truckId, id));

  const commissionTotal = Number(commResult?.total ?? 0);
  const commissionPaid = Number(paidResult?.paid ?? 0);

  res.json({
    clients: clientRows,
    stock: stockRows.map(s => ({
      productId: s.productId,
      productName: s.productName ?? "",
      quantity: Number(s.quantity),
    })),
    commissionTotal,
    commissionPaid,
    commissionBalance: commissionTotal - commissionPaid,
  });
});

// GET /trucks/:id/commission-payments
router.get("/trucks/:id/commission-payments", async (req, res) => {
  const id = parseInt(req.params.id);
  const payments = await db
    .select()
    .from(truckCommissionPaymentsTable)
    .where(eq(truckCommissionPaymentsTable.truckId, id))
    .orderBy(sql`${truckCommissionPaymentsTable.paidAt} DESC`);
  res.json(payments.map(p => ({ ...p, amount: Number(p.amount) })));
});

// POST /trucks/:id/commission-payments
router.post("/trucks/:id/commission-payments", async (req, res) => {
  const id = parseInt(req.params.id);
  const { amount, note, paidAt } = req.body;
  if (!amount || Number(amount) <= 0) return res.status(400).json({ error: "Montant invalide" });
  const [payment] = await db
    .insert(truckCommissionPaymentsTable)
    .values({
      truckId: id,
      amount: String(amount),
      note: note || null,
      paidAt: paidAt ? new Date(paidAt) : new Date(),
    })
    .returning();
  res.status(201).json({ ...payment, amount: Number(payment.amount) });
});

// PUT /trucks/:id/commission-payments/:paymentId
router.put("/trucks/:id/commission-payments/:paymentId", async (req, res) => {
  const id = parseInt(req.params.id);
  const paymentId = parseInt(req.params.paymentId);
  const { amount, note, paidAt } = req.body;
  const updates: Record<string, unknown> = {};
  if (amount !== undefined) updates.amount = String(amount);
  if (note !== undefined) updates.note = note || null;
  if (paidAt !== undefined) updates.paidAt = new Date(paidAt);
  const [payment] = await db
    .update(truckCommissionPaymentsTable)
    .set(updates)
    .where(and(eq(truckCommissionPaymentsTable.id, paymentId), eq(truckCommissionPaymentsTable.truckId, id)))
    .returning();
  if (!payment) return res.status(404).json({ error: "Paiement non trouvé" });
  res.json({ ...payment, amount: Number(payment.amount) });
});

// DELETE /trucks/:id/commission-payments/:paymentId
router.delete("/trucks/:id/commission-payments/:paymentId", async (req, res) => {
  const id = parseInt(req.params.id);
  const paymentId = parseInt(req.params.paymentId);
  const [deleted] = await db
    .delete(truckCommissionPaymentsTable)
    .where(and(eq(truckCommissionPaymentsTable.id, paymentId), eq(truckCommissionPaymentsTable.truckId, id)))
    .returning();
  if (!deleted) return res.status(404).json({ error: "Paiement non trouvé" });
  res.status(204).send();
});

router.get("/trucks/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  const [truck] = await db.select({
    id: trucksTable.id,
    name: trucksTable.name,
    plateNumber: trucksTable.plateNumber,
    phone: trucksTable.phone,
    branchId: trucksTable.branchId,
    branchName: branchesTable.name,
    vendeurId: trucksTable.vendeurId,
    vendeurName: usersTable.fullName,
    driverName: trucksTable.driverName,
    location: trucksTable.location,
    cashBalance: trucksTable.cashBalance,
    canSellOnCredit: trucksTable.canSellOnCredit,
    latitude: trucksTable.latitude,
    longitude: trucksTable.longitude,
    createdAt: trucksTable.createdAt,
  }).from(trucksTable)
    .leftJoin(usersTable, eq(trucksTable.vendeurId, usersTable.id))
    .leftJoin(branchesTable, eq(trucksTable.branchId, branchesTable.id))
    .where(eq(trucksTable.id, id)).limit(1);
  if (!truck) { res.status(404).json({ error: "Camion non trouvé" }); return; }
  res.json({ ...truck, cashBalance: Number(truck.cashBalance) });
});

router.put("/trucks/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  const { name, plateNumber, phone, branchId, vendeurId, driverName, password, location, canSellOnCredit } = req.body;
  const updates: Record<string, unknown> = {};
  if (name !== undefined) updates.name = name;
  if (plateNumber !== undefined) updates.plateNumber = plateNumber;
  if (phone !== undefined) updates.phone = phone || null;
  if (branchId !== undefined) updates.branchId = branchId || null;
  if (vendeurId !== undefined) updates.vendeurId = vendeurId || null;
  if (driverName !== undefined) updates.driverName = driverName;
  if (password) updates.passwordHash = hashPassword(password);
  if (location !== undefined) updates.location = location;
  if (canSellOnCredit !== undefined) updates.canSellOnCredit = Boolean(canSellOnCredit);
  const [truck] = await db.update(trucksTable).set(updates).where(eq(trucksTable.id, id)).returning();
  if (!truck) { res.status(404).json({ error: "Camion non trouvé" }); return; }
  res.json({ ...truck, cashBalance: Number(truck.cashBalance) });
});

router.delete("/trucks/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "معرّف غير صالح" }); return; }

  await db.transaction(async (tx) => {
    // 1. Hard FK constraints first (truck_dispatches, truck_commission_payments)
    await tx.delete(truckCommissionPaymentsTable).where(eq(truckCommissionPaymentsTable.truckId, id));
    await tx.delete(truckDispatchesTable).where(eq(truckDispatchesTable.truckId, id));

    // 2. Soft references — invoice items then invoices
    const invoiceIds = (await tx.select({ id: invoicesTable.id }).from(invoicesTable)
      .where(eq(invoicesTable.truckId, id))).map(r => r.id);
    if (invoiceIds.length > 0) {
      for (const iid of invoiceIds) {
        await tx.delete(invoiceItemsTable).where(eq(invoiceItemsTable.invoiceId, iid));
      }
      for (const iid of invoiceIds) {
        await tx.delete(invoicesTable).where(eq(invoicesTable.id, iid));
      }
    }

    // 3. Return items then returns
    const returnIds = (await tx.select({ id: returnsTable.id }).from(returnsTable)
      .where(eq(returnsTable.truckId, id))).map(r => r.id);
    if (returnIds.length > 0) {
      for (const rid of returnIds) {
        await tx.delete(returnItemsTable).where(eq(returnItemsTable.returnId, rid));
      }
      for (const rid of returnIds) {
        await tx.delete(returnsTable).where(eq(returnsTable.id, rid));
      }
    }

    // 4. Remaining dependent tables
    await tx.delete(cashTransfersTable).where(eq(cashTransfersTable.truckId, id));
    await tx.delete(truckStockTable).where(eq(truckStockTable.truckId, id));
    await tx.delete(stockTransfersTable).where(eq(stockTransfersTable.truckId, id));

    // 5. Detach clients & users (set truck_id to null, keep records)
    await tx.update(clientsTable).set({ truckId: null }).where(eq(clientsTable.truckId, id));
    await tx.update(usersTable).set({ truckId: null }).where(eq(usersTable.truckId, id));

    // 6. Finally delete the truck
    await tx.delete(trucksTable).where(eq(trucksTable.id, id));
  });

  res.status(204).send();
});

export default router;
