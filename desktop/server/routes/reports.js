const { Router } = require("express");
const { getDb } = require("../db");

const router = Router();

router.get("/reports/dashboard", (_req, res) => {
  const db = getDb();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStr = today.toISOString().replace("T", " ").slice(0, 10);
  const tomorrowStr = new Date(today.getTime() + 86400000).toISOString().slice(0, 10);
  const firstOfMonthStr = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10);

  const todayInvoices = db.prepare("SELECT * FROM invoices WHERE created_at >= ? AND created_at < ?").all(todayStr, tomorrowStr);
  const monthInvoices = db.prepare("SELECT total_amount FROM invoices WHERE created_at >= ?").all(firstOfMonthStr);
  const clients = db.prepare("SELECT balance FROM clients").all();
  const suppliers = db.prepare("SELECT balance FROM suppliers").all();
  const trucks = db.prepare("SELECT id FROM trucks").all();
  const lowStock = db.prepare("SELECT id FROM products WHERE stock_quantity < 10").all();
  const pendingCash = db.prepare("SELECT id FROM cash_transfers WHERE status = 'pending'").all();

  const recentInvs = db.prepare(`
    SELECT i.id, i.invoice_number, i.truck_id, t.name AS truck_name,
      i.client_id, c.name AS client_name, i.payment_type,
      i.total_amount, i.total_commission, i.created_at
    FROM invoices i
    LEFT JOIN trucks t ON i.truck_id = t.id
    LEFT JOIN clients c ON i.client_id = c.id
    ORDER BY i.created_at DESC LIMIT 5
  `).all();

  const todaySales = todayInvoices.reduce((s, i) => s + Number(i.total_amount), 0);
  const todayCashSales = todayInvoices.filter(i => i.payment_type === "cash").reduce((s, i) => s + Number(i.total_amount), 0);
  const todayCreditSales = todayInvoices.filter(i => i.payment_type === "credit").reduce((s, i) => s + Number(i.total_amount), 0);
  const monthSales = monthInvoices.reduce((s, i) => s + Number(i.total_amount), 0);
  const totalClientsDebt = clients.filter(c => Number(c.balance) < 0).reduce((s, c) => s + Math.abs(Number(c.balance)), 0);
  const totalSuppliersDebt = suppliers.reduce((s, s2) => s + Number(s2.balance), 0);

  res.json({
    todaySales, todayCashSales, todayCreditSales,
    todayInvoices: todayInvoices.length,
    monthSales,
    totalClients: clients.length,
    totalClientsDebt, totalSuppliersDebt,
    activeTrucks: trucks.length,
    lowStockProducts: lowStock.length,
    pendingCashTransfers: pendingCash.length,
    recentInvoices: recentInvs.map(i => ({
      id: i.id, invoiceNumber: i.invoice_number, truckId: i.truck_id, truckName: i.truck_name,
      clientId: i.client_id, clientName: i.client_name, paymentType: i.payment_type,
      totalAmount: Number(i.total_amount), totalCommission: Number(i.total_commission),
      createdAt: i.created_at, items: [],
    })),
  });
});

router.get("/reports/daily", (req, res) => {
  const { date, truckId } = req.query;
  const db = getDb();
  const targetDate = date ? new Date(date) : new Date();
  targetDate.setHours(0, 0, 0, 0);
  const dateStr = targetDate.toISOString().slice(0, 10);
  const nextDayStr = new Date(targetDate.getTime() + 86400000).toISOString().slice(0, 10);

  const conds = ["i.created_at >= ?", "i.created_at < ?"];
  const params = [dateStr, nextDayStr];
  if (truckId) { conds.push("i.truck_id = ?"); params.push(parseInt(truckId)); }

  const invoices = db.prepare(`SELECT * FROM invoices i WHERE ${conds.join(" AND ")}`).all(...params);
  const totalSales = invoices.reduce((s, i) => s + Number(i.total_amount), 0);
  const cashSales = invoices.filter(i => i.payment_type === "cash").reduce((s, i) => s + Number(i.total_amount), 0);
  const creditSales = invoices.filter(i => i.payment_type === "credit").reduce((s, i) => s + Number(i.total_amount), 0);
  const totalCommission = invoices.reduce((s, i) => s + Number(i.total_commission), 0);

  const trucks = db.prepare(`SELECT t.id, t.name, u.full_name AS vendeur_name FROM trucks t LEFT JOIN users u ON t.vendeur_id = u.id`).all();
  const byTruck = trucks.map(truck => {
    const ti = invoices.filter(i => i.truck_id === truck.id);
    return {
      truckId: truck.id, truckName: truck.name, vendeurName: truck.vendeur_name,
      totalSales: ti.reduce((s, i) => s + Number(i.total_amount), 0),
      cashSales: ti.filter(i => i.payment_type === "cash").reduce((s, i) => s + Number(i.total_amount), 0),
      creditSales: ti.filter(i => i.payment_type === "credit").reduce((s, i) => s + Number(i.total_amount), 0),
      totalCommission: ti.reduce((s, i) => s + Number(i.total_commission), 0),
      invoiceCount: ti.length,
    };
  });

  res.json({
    date: dateStr, totalSales, cashSales, creditSales, totalCommission,
    invoiceCount: invoices.length, topProducts: [], byTruck,
  });
});

router.get("/reports/trucks", (req, res) => {
  const { dateFrom, dateTo } = req.query;
  const db = getDb();
  const conds = [];
  const params = [];
  if (dateFrom) { conds.push("created_at >= ?"); params.push(dateFrom); }
  if (dateTo) { conds.push("created_at <= ?"); params.push(dateTo); }

  const invoices = db.prepare(`SELECT * FROM invoices${conds.length ? " WHERE " + conds.join(" AND ") : ""}`).all(...params);
  const trucks = db.prepare(`SELECT t.id, t.name, u.full_name AS vendeur_name FROM trucks t LEFT JOIN users u ON t.vendeur_id = u.id`).all();

  res.json(trucks.map(truck => {
    const ti = invoices.filter(i => i.truck_id === truck.id);
    return {
      truckId: truck.id, truckName: truck.name, vendeurName: truck.vendeur_name,
      totalSales: ti.reduce((s, i) => s + Number(i.total_amount), 0),
      cashSales: ti.filter(i => i.payment_type === "cash").reduce((s, i) => s + Number(i.total_amount), 0),
      creditSales: ti.filter(i => i.payment_type === "credit").reduce((s, i) => s + Number(i.total_amount), 0),
      totalCommission: ti.reduce((s, i) => s + Number(i.total_commission), 0),
      invoiceCount: ti.length,
    };
  }));
});

router.get("/reports/debts", (_req, res) => {
  const db = getDb();
  const clients = db.prepare("SELECT id, name, phone, balance FROM clients WHERE balance < 0").all();
  const suppliers = db.prepare("SELECT id, name, phone, balance FROM suppliers WHERE balance > 0").all();
  const clientDebts = clients.map(c => ({ clientId: c.id, clientName: c.name, phone: c.phone, debtAmount: Math.abs(Number(c.balance)) }));
  const supplierDebts = suppliers.map(s => ({ supplierId: s.id, supplierName: s.name, phone: s.phone, debtAmount: Number(s.balance) }));
  res.json({
    clientDebts, supplierDebts,
    totalClientDebt: clientDebts.reduce((s, c) => s + c.debtAmount, 0),
    totalSupplierDebt: supplierDebts.reduce((s, s2) => s + s2.debtAmount, 0),
  });
});

router.get("/reports/top-products", (req, res) => {
  const limit = parseInt(req.query.limit) || 10;
  const db = getDb();
  const items = db.prepare(`
    SELECT ii.product_id, p.name AS product_name, ii.quantity, ii.subtotal
    FROM invoice_items ii LEFT JOIN products p ON ii.product_id = p.id
  `).all();

  const grouped = new Map();
  for (const item of items) {
    const pId = item.product_id;
    const existing = grouped.get(pId) ?? { productId: pId, productName: item.product_name ?? "", totalQuantity: 0, totalRevenue: 0, invoiceCount: 0 };
    existing.totalQuantity += Number(item.quantity);
    existing.totalRevenue += Number(item.subtotal);
    existing.invoiceCount++;
    grouped.set(pId, existing);
  }
  res.json(Array.from(grouped.values()).sort((a, b) => b.totalRevenue - a.totalRevenue).slice(0, limit));
});

module.exports = router;
