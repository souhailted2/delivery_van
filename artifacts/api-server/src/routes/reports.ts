import { Router } from "express";
import { db } from "@workspace/db";
import {
  invoicesTable, invoiceItemsTable, clientsTable, suppliersTable,
  trucksTable, usersTable, productsTable, cashTransfersTable,
} from "@workspace/db";
import { eq, gte, lte, and, lt, SQL } from "drizzle-orm";
import { sql } from "drizzle-orm";

const router = Router();

router.get("/reports/dashboard", async (_req, res) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

  // Today's invoices
  const todayInvoices = await db.select().from(invoicesTable)
    .where(and(gte(invoicesTable.createdAt, today), lt(invoicesTable.createdAt, tomorrow)));

  const todaySales = todayInvoices.reduce((sum, inv) => sum + Number(inv.totalAmount), 0);
  const todayCashSales = todayInvoices.filter(i => i.paymentType === "cash").reduce((sum, inv) => sum + Number(inv.totalAmount), 0);
  const todayCreditSales = todayInvoices.filter(i => i.paymentType === "credit").reduce((sum, inv) => sum + Number(inv.totalAmount), 0);

  // Month sales
  const monthInvoices = await db.select().from(invoicesTable).where(gte(invoicesTable.createdAt, firstOfMonth));
  const monthSales = monthInvoices.reduce((sum, inv) => sum + Number(inv.totalAmount), 0);

  // Clients
  const clients = await db.select({ balance: clientsTable.balance }).from(clientsTable);
  const totalClients = clients.length;
  const totalClientsDebt = clients.filter(c => Number(c.balance) < 0).reduce((sum, c) => sum + Math.abs(Number(c.balance)), 0);

  // Suppliers debt
  const suppliers = await db.select({ balance: suppliersTable.balance }).from(suppliersTable);
  const totalSuppliersDebt = suppliers.reduce((sum, s) => sum + Number(s.balance), 0);

  // Trucks
  const trucks = await db.select({ id: trucksTable.id }).from(trucksTable);

  // Low stock (< 10 units)
  const lowStockProducts = await db.select().from(productsTable)
    .where(lt(sql`${productsTable.stockQuantity}::numeric`, sql`10`));

  // Pending cash transfers
  const pendingCash = await db.select().from(cashTransfersTable)
    .where(eq(cashTransfersTable.status, "pending"));

  // Recent invoices (last 5)
  const recentInvs = await db.select({
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
    .orderBy(sql`${invoicesTable.createdAt} DESC`)
    .limit(5);

  res.json({
    todaySales,
    todayCashSales,
    todayCreditSales,
    todayInvoices: todayInvoices.length,
    monthSales,
    totalClients,
    totalClientsDebt,
    totalSuppliersDebt,
    activeTrucks: trucks.length,
    lowStockProducts: lowStockProducts.length,
    pendingCashTransfers: pendingCash.length,
    recentInvoices: recentInvs.map(inv => ({
      ...inv,
      totalAmount: Number(inv.totalAmount),
      totalCommission: Number(inv.totalCommission),
      items: [],
    })),
  });
});

router.get("/reports/daily", async (req, res) => {
  const { date, truckId } = req.query;
  const targetDate = date ? new Date(date as string) : new Date();
  targetDate.setHours(0, 0, 0, 0);
  const nextDay = new Date(targetDate);
  nextDay.setDate(nextDay.getDate() + 1);

  const conditions: SQL[] = [gte(invoicesTable.createdAt, targetDate), lt(invoicesTable.createdAt, nextDay)];
  if (truckId) conditions.push(eq(invoicesTable.truckId, parseInt(truckId as string)));

  const invoices = await db.select().from(invoicesTable).where(and(...conditions));
  const totalSales = invoices.reduce((sum, i) => sum + Number(i.totalAmount), 0);
  const cashSales = invoices.filter(i => i.paymentType === "cash").reduce((sum, i) => sum + Number(i.totalAmount), 0);
  const creditSales = invoices.filter(i => i.paymentType === "credit").reduce((sum, i) => sum + Number(i.totalAmount), 0);
  const totalCommission = invoices.reduce((sum, i) => sum + Number(i.totalCommission), 0);

  // Top products for the day
  const invIds = invoices.map(i => i.id);
  let topProducts: any[] = [];
  if (invIds.length > 0) {
    const items = await db.select({
      productId: invoiceItemsTable.productId,
      productName: productsTable.name,
      quantity: invoiceItemsTable.quantity,
      subtotal: invoiceItemsTable.subtotal,
    }).from(invoiceItemsTable)
      .leftJoin(productsTable, eq(invoiceItemsTable.productId, productsTable.id));

    const filtered = items.filter(i => invIds.includes(i.productId ?? -1) || true);
    const grouped = new Map<number, { productId: number; productName: string; totalQuantity: number; totalRevenue: number; invoiceCount: number }>();
    for (const item of filtered) {
      const pId = item.productId!;
      const existing = grouped.get(pId) ?? { productId: pId, productName: item.productName ?? "", totalQuantity: 0, totalRevenue: 0, invoiceCount: 0 };
      existing.totalQuantity += Number(item.quantity);
      existing.totalRevenue += Number(item.subtotal);
      existing.invoiceCount++;
      grouped.set(pId, existing);
    }
    topProducts = Array.from(grouped.values()).sort((a, b) => b.totalRevenue - a.totalRevenue).slice(0, 5);
  }

  // Per truck
  const trucks = await db.select({
    id: trucksTable.id, name: trucksTable.name, vendeurName: usersTable.fullName,
  }).from(trucksTable).leftJoin(usersTable, eq(trucksTable.vendeurId, usersTable.id));

  const byTruck = trucks.map(truck => {
    const truckInvoices = invoices.filter(i => i.truckId === truck.id);
    return {
      truckId: truck.id,
      truckName: truck.name,
      vendeurName: truck.vendeurName ?? null,
      totalSales: truckInvoices.reduce((s, i) => s + Number(i.totalAmount), 0),
      cashSales: truckInvoices.filter(i => i.paymentType === "cash").reduce((s, i) => s + Number(i.totalAmount), 0),
      creditSales: truckInvoices.filter(i => i.paymentType === "credit").reduce((s, i) => s + Number(i.totalAmount), 0),
      totalCommission: truckInvoices.reduce((s, i) => s + Number(i.totalCommission), 0),
      invoiceCount: truckInvoices.length,
    };
  });

  res.json({
    date: targetDate.toISOString().split("T")[0],
    totalSales, cashSales, creditSales, totalCommission,
    invoiceCount: invoices.length,
    topProducts,
    byTruck,
  });
});

router.get("/reports/trucks", async (req, res) => {
  const { dateFrom, dateTo } = req.query;
  const conditions: SQL[] = [];
  if (dateFrom) conditions.push(gte(invoicesTable.createdAt, new Date(dateFrom as string)));
  if (dateTo) conditions.push(lte(invoicesTable.createdAt, new Date(dateTo as string)));

  const trucks = await db.select({
    id: trucksTable.id, name: trucksTable.name, vendeurName: usersTable.fullName,
  }).from(trucksTable).leftJoin(usersTable, eq(trucksTable.vendeurId, usersTable.id));

  const invoices = await db.select().from(invoicesTable)
    .where(conditions.length > 0 ? and(...conditions) : undefined);

  const result = trucks.map(truck => {
    const truckInvoices = invoices.filter(i => i.truckId === truck.id);
    return {
      truckId: truck.id,
      truckName: truck.name,
      vendeurName: truck.vendeurName ?? null,
      totalSales: truckInvoices.reduce((s, i) => s + Number(i.totalAmount), 0),
      cashSales: truckInvoices.filter(i => i.paymentType === "cash").reduce((s, i) => s + Number(i.totalAmount), 0),
      creditSales: truckInvoices.filter(i => i.paymentType === "credit").reduce((s, i) => s + Number(i.totalAmount), 0),
      totalCommission: truckInvoices.reduce((s, i) => s + Number(i.totalCommission), 0),
      invoiceCount: truckInvoices.length,
    };
  });

  res.json(result);
});

router.get("/reports/debts", async (_req, res) => {
  const clients = await db.select().from(clientsTable);
  const clientDebts = clients
    .filter(c => Number(c.balance) < 0)
    .map(c => ({ clientId: c.id, clientName: c.name, phone: c.phone, debtAmount: Math.abs(Number(c.balance)) }));

  const suppliers = await db.select().from(suppliersTable);
  const supplierDebts = suppliers
    .filter(s => Number(s.balance) > 0)
    .map(s => ({ supplierId: s.id, supplierName: s.name, phone: s.phone, debtAmount: Number(s.balance) }));

  res.json({
    clientDebts,
    supplierDebts,
    totalClientDebt: clientDebts.reduce((s, c) => s + c.debtAmount, 0),
    totalSupplierDebt: supplierDebts.reduce((s, s2) => s + s2.debtAmount, 0),
  });
});

router.get("/reports/top-products", async (req, res) => {
  const limit = parseInt(req.query.limit as string) || 10;
  const items = await db.select({
    productId: invoiceItemsTable.productId,
    productName: productsTable.name,
    quantity: invoiceItemsTable.quantity,
    subtotal: invoiceItemsTable.subtotal,
  }).from(invoiceItemsTable)
    .leftJoin(productsTable, eq(invoiceItemsTable.productId, productsTable.id));

  const grouped = new Map<number, { productId: number; productName: string; totalQuantity: number; totalRevenue: number; invoiceCount: number }>();
  for (const item of items) {
    const pId = item.productId!;
    const existing = grouped.get(pId) ?? { productId: pId, productName: item.productName ?? "", totalQuantity: 0, totalRevenue: 0, invoiceCount: 0 };
    existing.totalQuantity += Number(item.quantity);
    existing.totalRevenue += Number(item.subtotal);
    existing.invoiceCount++;
    grouped.set(pId, existing);
  }

  const result = Array.from(grouped.values()).sort((a, b) => b.totalRevenue - a.totalRevenue).slice(0, limit);
  res.json(result);
});

export default router;
