const { Router } = require("express");
const { getDb } = require("../db");

const router = Router();

const SQL_INVOICE_HEADER = `
  SELECT i.id, i.invoice_number, i.truck_id, t.name AS truck_name,
    i.client_id, c.name AS client_name, i.payment_type,
    i.total_amount, i.total_commission, i.latitude, i.longitude, i.created_at
  FROM invoices i
  LEFT JOIN trucks t ON i.truck_id = t.id
  LEFT JOIN clients c ON i.client_id = c.id
`;

const SQL_INVOICE_ITEMS = `
  SELECT ii.id, ii.invoice_id, ii.product_id, p.name AS product_name,
    ii.quantity, ii.price_type, ii.unit_price, ii.commission, ii.subtotal
  FROM invoice_items ii
  LEFT JOIN products p ON ii.product_id = p.id
  WHERE ii.invoice_id = ?
`;

function mapInvoice(i, items) {
  return {
    id: i.id, invoiceNumber: i.invoice_number,
    truckId: i.truck_id, truckName: i.truck_name,
    clientId: i.client_id, clientName: i.client_name,
    paymentType: i.payment_type,
    totalAmount: Number(i.total_amount),
    totalCommission: Number(i.total_commission),
    latitude: i.latitude, longitude: i.longitude,
    createdAt: i.created_at,
    items: (items || []).map(it => ({
      id: it.id, productId: it.product_id, productName: it.product_name,
      quantity: Number(it.quantity), priceType: it.price_type,
      unitPrice: Number(it.unit_price), commission: Number(it.commission),
      subtotal: Number(it.subtotal),
    })),
  };
}

function getInvoiceWithItems(db, id) {
  const inv = db.prepare(SQL_INVOICE_HEADER + " WHERE i.id = ? AND i.is_deleted = 0").get(id);
  if (!inv) return null;
  const items = db.prepare(SQL_INVOICE_ITEMS).all(id);
  return mapInvoice(inv, items);
}

router.get("/invoices", (req, res) => {
  const { truckId, clientId, dateFrom, dateTo, paymentType, page, limit } = req.query;
  const db = getDb();

  const conds  = ["i.is_deleted = 0"];
  const params = [];
  if (truckId)     { conds.push("i.truck_id = ?");    params.push(parseInt(truckId)); }
  if (clientId)    { conds.push("i.client_id = ?");   params.push(parseInt(clientId)); }
  if (paymentType) { conds.push("i.payment_type = ?"); params.push(paymentType); }
  if (dateFrom)    { conds.push("i.created_at >= ?"); params.push(dateFrom); }
  if (dateTo)      { conds.push("i.created_at <= ?"); params.push(dateTo); }

  const where = "WHERE " + conds.join(" AND ");

  const pageNum  = Math.max(1, parseInt(page)  || 1);
  const pageSize = Math.min(200, Math.max(1, parseInt(limit) || 50));
  const offset   = (pageNum - 1) * pageSize;

  const invoices = db.prepare(
    `${SQL_INVOICE_HEADER} ${where} ORDER BY i.created_at DESC LIMIT ? OFFSET ?`
  ).all(...params, pageSize, offset);

  if (!invoices.length) return res.json([]);

  const ids = invoices.map(i => i.id);
  const placeholders = ids.map(() => "?").join(",");
  const allItems = db.prepare(
    `SELECT ii.id, ii.invoice_id, ii.product_id, p.name AS product_name,
       ii.quantity, ii.price_type, ii.unit_price, ii.commission, ii.subtotal
     FROM invoice_items ii
     LEFT JOIN products p ON ii.product_id = p.id
     WHERE ii.invoice_id IN (${placeholders})`
  ).all(...ids);

  const itemsByInvoice = new Map();
  for (const it of allItems) {
    if (!itemsByInvoice.has(it.invoice_id)) itemsByInvoice.set(it.invoice_id, []);
    itemsByInvoice.get(it.invoice_id).push(it);
  }

  res.json(invoices.map(i => mapInvoice(i, itemsByInvoice.get(i.id) || [])));
});

router.post("/invoices", (req, res) => {
  const { truckId, clientId, paymentType, latitude, longitude, items } = req.body;
  if (!truckId || !clientId || !items?.length) {
    return res.status(400).json({ error: "Camion, client et articles requis" });
  }
  const db = getDb();

  const stmtInsertInvoice    = db.prepare(`
    INSERT INTO invoices (invoice_number, truck_id, client_id, payment_type, total_amount, total_commission, latitude, longitude)
    VALUES (?,?,?,?,0,0,?,?)
  `);
  const stmtInsertItem       = db.prepare(`
    INSERT INTO invoice_items (invoice_id, product_id, quantity, price_type, unit_price, commission, subtotal)
    VALUES (?,?,?,?,?,?,?)
  `);
  const stmtGetProduct        = db.prepare("SELECT commission_retail, commission_half, commission_wholesale, stock_quantity FROM products WHERE id = ? AND is_deleted = 0");
  const stmtGetTruckStock     = db.prepare("SELECT id, quantity FROM truck_stock WHERE truck_id = ? AND product_id = ?");
  const stmtUpdateTruckStock  = db.prepare("UPDATE truck_stock SET quantity = ? WHERE id = ?");
  const stmtUpdateInvoice     = db.prepare("UPDATE invoices SET total_amount = ?, total_commission = ? WHERE id = ?");
  const stmtUpdateTruckCash   = db.prepare("UPDATE trucks SET cash_balance = cash_balance + ? WHERE id = ?");
  const stmtUpdateClientBalance = db.prepare("UPDATE clients SET balance = balance - ? WHERE id = ?");

  const insertInvoice = db.transaction(() => {
    const invoiceNumber = `FAC-${Date.now()}`;
    const invInfo = stmtInsertInvoice.run(
      invoiceNumber, parseInt(truckId), parseInt(clientId),
      paymentType || "cash", latitude || null, longitude || null
    );
    const invoiceId = invInfo.lastInsertRowid;

    let totalAmount = 0;
    let totalCommission = 0;

    for (const item of items) {
      const qty       = Number(item.quantity);
      const unitPrice = Number(item.unitPrice);
      const subtotal  = qty * unitPrice;

      const product = stmtGetProduct.get(parseInt(item.productId));
      let commissionRate = 0;
      if (product) {
        if (item.priceType === "retail")           commissionRate = Number(product.commission_retail);
        else if (item.priceType === "half_wholesale") commissionRate = Number(product.commission_half);
        else if (item.priceType === "wholesale")   commissionRate = Number(product.commission_wholesale);
      }
      const commission = (subtotal * commissionRate) / 100;
      stmtInsertItem.run(invoiceId, parseInt(item.productId), qty, item.priceType || "retail", unitPrice, commission, subtotal);
      totalAmount     += subtotal;
      totalCommission += commission;

      const ts = stmtGetTruckStock.get(parseInt(truckId), parseInt(item.productId));
      if (ts) {
        stmtUpdateTruckStock.run(Math.max(0, Number(ts.quantity) - qty), ts.id);
      }
    }

    stmtUpdateInvoice.run(totalAmount, totalCommission, invoiceId);

    if ((paymentType || "cash") === "cash") {
      stmtUpdateTruckCash.run(totalAmount, parseInt(truckId));
    }
    if (paymentType === "credit") {
      stmtUpdateClientBalance.run(totalAmount, parseInt(clientId));
    }
    return invoiceId;
  });

  const invoiceId = insertInvoice();
  res.status(201).json(getInvoiceWithItems(db, invoiceId));
});

router.get("/invoices/:id", (req, res) => {
  const db = getDb();
  const result = getInvoiceWithItems(db, parseInt(req.params.id));
  if (!result) return res.status(404).json({ error: "Facture non trouvée" });
  res.json(result);
});

router.delete("/invoices/:id", (req, res) => {
  const id = parseInt(req.params.id);
  const db = getDb();
  db.prepare(
    "UPDATE invoice_items SET is_deleted = 1, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE invoice_id = ?"
  ).run(id);
  db.prepare(
    "UPDATE invoices SET is_deleted = 1, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?"
  ).run(id);
  res.status(204).send();
});

module.exports = router;
