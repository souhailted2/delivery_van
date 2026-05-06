import { Router } from "express";
import { db } from "@workspace/db";
import {
  trucksTable, usersTable, truckStockTable, productsTable,
  clientsTable, invoicesTable, invoiceItemsTable, cashTransfersTable,
} from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";
import { hashPassword } from "./auth";

const router = Router();

function truckFromSession(req: any): number | null {
  return req.session?.truckId ?? null;
}

router.get("/trucks", async (_req, res) => {
  const trucks = await db.select({
    id: trucksTable.id,
    name: trucksTable.name,
    plateNumber: trucksTable.plateNumber,
    vendeurId: trucksTable.vendeurId,
    vendeurName: usersTable.fullName,
    driverName: trucksTable.driverName,
    location: trucksTable.location,
    cashBalance: trucksTable.cashBalance,
    latitude: trucksTable.latitude,
    longitude: trucksTable.longitude,
    createdAt: trucksTable.createdAt,
  }).from(trucksTable)
    .leftJoin(usersTable, eq(trucksTable.vendeurId, usersTable.id))
    .orderBy(trucksTable.name);
  res.json(trucks.map(t => ({ ...t, cashBalance: Number(t.cashBalance) })));
});

router.post("/trucks", async (req, res) => {
  const { name, plateNumber, vendeurId, driverName, password, location } = req.body;
  if (!name) return res.status(400).json({ error: "Nom requis" });
  const [truck] = await db.insert(trucksTable).values({
    name,
    plateNumber: plateNumber || null,
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
  const validTypes = ["retail", "half_wholesale", "wholesale"];
  const [client] = await db.insert(clientsTable).values({
    name, phone: phone || null,
    clientType: validTypes.includes(clientType) ? clientType : "retail",
    truckId,
    latitude: latitude || null, longitude: longitude || null,
    balance: "0",
  }).returning();
  res.status(201).json({ ...client, balance: Number(client.balance) });
});

router.put("/trucks/me/clients/:id", async (req, res) => {
  const truckId = truckFromSession(req);
  if (!truckId) return res.status(401).json({ error: "Non authentifié comme camion" });
  const clientId = Number(req.params.id);
  const { name, phone, clientType } = req.body;
  if (!name) return res.status(400).json({ error: "Nom requis" });
  const validTypes = ["retail", "half_wholesale", "wholesale"];
  const [existing] = await db.select().from(clientsTable)
    .where(and(eq(clientsTable.id, clientId), eq(clientsTable.truckId, truckId)));
  if (!existing) return res.status(404).json({ error: "Client non trouvé" });
  const [updated] = await db.update(clientsTable).set({
    name,
    phone: phone || null,
    clientType: validTypes.includes(clientType) ? clientType : existing.clientType,
  }).where(eq(clientsTable.id, clientId)).returning();
  res.json({ ...updated, balance: Number(updated.balance) });
});

router.get("/trucks/me/vendeurs", async (req, res) => {
  const truckId = truckFromSession(req);
  if (!truckId) return res.status(401).json({ error: "Non authentifié comme camion" });
  const vendeurs = await db.select({
    id: usersTable.id,
    username: usersTable.username,
    fullName: usersTable.fullName,
    role: usersTable.role,
    truckId: usersTable.truckId,
    canDeleteInvoice: usersTable.canDeleteInvoice,
    canEditPrice: usersTable.canEditPrice,
    canSellOnCredit: usersTable.canSellOnCredit,
    canViewReports: usersTable.canViewReports,
    createdAt: usersTable.createdAt,
  }).from(usersTable)
    .where(and(eq(usersTable.truckId, truckId), eq(usersTable.role, "vendeur")))
    .orderBy(usersTable.id);
  res.json(vendeurs);
});

router.post("/trucks/me/vendeurs", async (req, res) => {
  const truckId = truckFromSession(req);
  if (!truckId) return res.status(401).json({ error: "Non authentifié comme camion" });
  const { username, password, fullName } = req.body;
  if (!username || !password || !fullName) {
    return res.status(400).json({ error: "Champs requis manquants" });
  }
  const [user] = await db.insert(usersTable).values({
    username, passwordHash: hashPassword(password), fullName,
    role: "vendeur", truckId,
    canDeleteInvoice: false, canEditPrice: false,
    canSellOnCredit: true, canViewReports: false,
  }).returning();
  const { passwordHash: _, ...safeUser } = user;
  res.status(201).json(safeUser);
});

router.post("/trucks/me/invoices", async (req, res) => {
  const truckId = truckFromSession(req);
  if (!truckId) return res.status(401).json({ error: "Non authentifié comme camion" });

  const { clientId, newClient, paymentType, latitude, longitude, items } = req.body;
  if (!items?.length) return res.status(400).json({ error: "Articles requis" });
  if (!clientId && !newClient?.name) return res.status(400).json({ error: "Client requis" });

  // Resolve or create client — verify ownership to prevent IDOR
  let resolvedClientId: number = clientId;
  if (clientId) {
    const [existingClient] = await db.select().from(clientsTable)
      .where(and(eq(clientsTable.id, clientId), eq(clientsTable.truckId, truckId)));
    if (!existingClient) return res.status(403).json({ error: "Client non autorisé" });
  }
  if (!clientId && newClient) {
    const validTypes = ["retail", "half_wholesale", "wholesale"];
    const [created] = await db.insert(clientsTable).values({
      name: newClient.name.trim(),
      phone: newClient.phone || null,
      clientType: validTypes.includes(newClient.clientType) ? newClient.clientType : "retail",
      truckId,
      balance: "0",
    }).returning();
    resolvedClientId = created.id;
  }

  const invoiceNumber = `FAC-${Date.now()}`;
  let totalAmount = 0;
  let totalCommission = 0;

  const [invoice] = await db.insert(invoicesTable).values({
    invoiceNumber,
    truckId,
    clientId: resolvedClientId,
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

    // Deduct from truck stock
    const [ts] = await db.select().from(truckStockTable)
      .where(and(eq(truckStockTable.truckId, truckId), eq(truckStockTable.productId, parseInt(item.productId))))
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

  // Update truck cash balance if cash payment
  if ((paymentType || "cash") === "cash") {
    const [truck] = await db.select().from(trucksTable).where(eq(trucksTable.id, truckId)).limit(1);
    if (truck) {
      await db.update(trucksTable).set({
        cashBalance: String(Number(truck.cashBalance) + totalAmount),
      }).where(eq(trucksTable.id, truckId));
    }
  }

  // Update client balance if credit
  if (paymentType === "credit") {
    const [client] = await db.select().from(clientsTable).where(eq(clientsTable.id, resolvedClientId)).limit(1);
    if (client) {
      await db.update(clientsTable).set({
        balance: String(Number(client.balance) - totalAmount),
      }).where(eq(clientsTable.id, resolvedClientId));
    }
  }

  // Return full invoice
  const finalInvoice = await db.select({
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
    .where(eq(invoicesTable.id, invoice.id)).limit(1);

  res.status(201).json({
    ...finalInvoice[0],
    totalAmount,
    totalCommission,
    items: [],
  });
});

router.get("/trucks/me/invoices", async (req, res) => {
  const truckId = truckFromSession(req);
  if (!truckId) return res.status(401).json({ error: "Non authentifié comme camion" });
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
    .where(eq(invoicesTable.truckId, truckId))
    .orderBy(invoicesTable.createdAt);
  res.json(invoices.map(i => ({
    ...i,
    totalAmount: Number(i.totalAmount),
    totalCommission: Number(i.totalCommission),
    items: [],
  })));
});

router.get("/trucks/me/invoices/:id", async (req, res) => {
  const truckId = truckFromSession(req);
  if (!truckId) return res.status(401).json({ error: "Non authentifié comme camion" });
  const invoiceId = Number(req.params.id);
  const [invoice] = await db.select({
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
    .where(and(eq(invoicesTable.id, invoiceId), eq(invoicesTable.truckId, truckId)));
  if (!invoice) return res.status(404).json({ error: "Facture non trouvée" });
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
    .where(eq(invoiceItemsTable.invoiceId, invoiceId));
  res.json({
    ...invoice,
    totalAmount: Number(invoice.totalAmount),
    totalCommission: Number(invoice.totalCommission),
    items: items.map(it => ({
      ...it,
      quantity: Number(it.quantity),
      unitPrice: Number(it.unitPrice),
      commission: Number(it.commission),
      subtotal: Number(it.subtotal),
    })),
  });
});

router.get("/trucks/me/cash", async (req, res) => {
  const truckId = truckFromSession(req);
  if (!truckId) return res.status(401).json({ error: "Non authentifié comme camion" });

  const [truck] = await db.select().from(trucksTable).where(eq(trucksTable.id, truckId)).limit(1);
  if (!truck) return res.status(404).json({ error: "Camion non trouvé" });

  // Cash invoices total
  const allInvoices = await db.select({
    paymentType: invoicesTable.paymentType,
    totalAmount: invoicesTable.totalAmount,
  }).from(invoicesTable).where(eq(invoicesTable.truckId, truckId));
  const totalCashSales = allInvoices
    .filter(i => i.paymentType === "cash")
    .reduce((s, i) => s + Number(i.totalAmount), 0);

  // Transfers
  const transfers = await db.select({
    id: cashTransfersTable.id,
    truckId: cashTransfersTable.truckId,
    amount: cashTransfersTable.amount,
    status: cashTransfersTable.status,
    note: cashTransfersTable.note,
    createdAt: cashTransfersTable.createdAt,
  }).from(cashTransfersTable)
    .where(eq(cashTransfersTable.truckId, truckId))
    .orderBy(cashTransfersTable.createdAt);

  const totalTransferred = transfers
    .filter(t => t.status === "approved")
    .reduce((s, t) => s + Number(t.amount), 0);
  const pendingAmount = transfers
    .filter(t => t.status === "pending")
    .reduce((s, t) => s + Number(t.amount), 0);

  res.json({
    truckId: truck.id,
    truckName: truck.name,
    cashBalance: Number(truck.cashBalance),
    totalCashSales,
    totalTransferred,
    pendingAmount,
    transfers: transfers.map(t => ({ ...t, amount: Number(t.amount), truckName: truck.name })),
  });
});

router.post("/trucks/me/cash/transfer", async (req, res) => {
  const truckId = truckFromSession(req);
  if (!truckId) return res.status(401).json({ error: "Non authentifié comme camion" });

  const { amount, note } = req.body;
  if (!amount || Number(amount) <= 0) return res.status(400).json({ error: "Montant invalide" });

  const [truck] = await db.select().from(trucksTable).where(eq(trucksTable.id, truckId)).limit(1);
  if (!truck) return res.status(404).json({ error: "Camion non trouvé" });
  if (Number(amount) > Number(truck.cashBalance)) {
    return res.status(400).json({ error: "Montant supérieur au solde disponible" });
  }

  const [transfer] = await db.insert(cashTransfersTable).values({
    truckId,
    amount: String(Number(amount)),
    status: "pending",
    note: note?.trim() || null,
  }).returning();

  res.status(201).json({
    ...transfer,
    amount: Number(transfer.amount),
    truckName: truck.name,
  });
});

router.get("/trucks/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  const [truck] = await db.select({
    id: trucksTable.id,
    name: trucksTable.name,
    plateNumber: trucksTable.plateNumber,
    vendeurId: trucksTable.vendeurId,
    vendeurName: usersTable.fullName,
    driverName: trucksTable.driverName,
    location: trucksTable.location,
    cashBalance: trucksTable.cashBalance,
    latitude: trucksTable.latitude,
    longitude: trucksTable.longitude,
    createdAt: trucksTable.createdAt,
  }).from(trucksTable)
    .leftJoin(usersTable, eq(trucksTable.vendeurId, usersTable.id))
    .where(eq(trucksTable.id, id)).limit(1);
  if (!truck) return res.status(404).json({ error: "Camion non trouvé" });
  res.json({ ...truck, cashBalance: Number(truck.cashBalance) });
});

router.put("/trucks/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  const { name, plateNumber, vendeurId, driverName, password, location } = req.body;
  const updates: Record<string, unknown> = {};
  if (name !== undefined) updates.name = name;
  if (plateNumber !== undefined) updates.plateNumber = plateNumber;
  if (vendeurId !== undefined) updates.vendeurId = vendeurId;
  if (driverName !== undefined) updates.driverName = driverName;
  if (password !== undefined && password !== "") updates.passwordHash = hashPassword(password);
  if (location !== undefined) updates.location = location;
  const [truck] = await db.update(trucksTable).set(updates).where(eq(trucksTable.id, id)).returning();
  if (!truck) return res.status(404).json({ error: "Camion non trouvé" });
  res.json({ ...truck, cashBalance: Number(truck.cashBalance) });
});

router.delete("/trucks/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  await db.delete(trucksTable).where(eq(trucksTable.id, id));
  res.status(204).send();
});

router.get("/trucks/:id/stock", async (req, res) => {
  const id = parseInt(req.params.id);
  const stock = await db.select({
    productId: truckStockTable.productId,
    productName: productsTable.name,
    quantity: truckStockTable.quantity,
    unit: productsTable.unit,
  }).from(truckStockTable)
    .leftJoin(productsTable, eq(truckStockTable.productId, productsTable.id))
    .where(eq(truckStockTable.truckId, id));
  res.json(stock.map(s => ({ ...s, quantity: Number(s.quantity) })));
});

export default router;
