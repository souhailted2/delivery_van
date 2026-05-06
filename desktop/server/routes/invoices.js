const { Router } = require("express");
const { getDb } = require("../db");

const router = Router();

function getInvoiceWithItems(db, id) {
  const inv = db.prepare(`
    SELECT i.*, t.name AS truck_name, c.name AS client_name
    FROM invoices i
    LEFT JOIN trucks t ON i.truck_id = t.id
    LEFT JOIN clients c ON i.client_id = c.id
    WHERE i.id = ?
  `).get(id);
  if (!inv) return null;

  const items = db.prepare(`
    SELECT ii.*, p.name AS product_name
    FROM invoice_items ii
    LEFT JOIN products p ON ii.product_id = p.id
    WHERE ii.invoice_id = ?
  `).all(id);

  return {
    id: inv.id, invoiceNumber: inv.invoice_number,
    truckId: inv.truck_id, truckName: inv.truck_name,
    clientId: inv.client_id, clientName: inv.client_name,
    paymentType: inv.payment_type,
    totalAmount: Number(inv.total_amount),
    totalCommission: Number(inv.total_commission),
    latitude: inv.latitude, longitude: inv.longitude,
    createdAt: inv.created_at,
    items: items.map(it => ({
      id: it.id, productId: it.product_id, productName: it.product_name,
      quantity: Number(it.quantity), priceType: it.price_type,
      unitPrice: Number(it.unit_price), commission: Number(it.commission),
      subtotal: Number(it.subtotal),
    })),
  };
}

router.get("/invoices", (req, res) => {
  const { truckId, clientId, dateFrom, dateTo, paymentType } = req.query;
  const db = getDb();
  const conds = [];
  const params = [];
  if (truckId) { conds.push("i.truck_id = ?"); params.push(parseInt(truckId)); }
  if (clientId) { conds.push("i.client_id = ?"); params.push(parseInt(clientId)); }
  if (paymentType) { conds.push("i.payment_type = ?"); params.push(paymentType); }
  if (dateFrom) { conds.push("i.created_at >= ?"); params.push(dateFrom); }
  if (dateTo) { conds.push("i.created_at <= ?"); params.push(dateTo); }

  const query = `
    SELECT i.id FROM invoices i
    ${conds.length ? "WHERE " + conds.join(" AND ") : ""}
    ORDER BY i.created_at
  `;
  const ids = db.prepare(query).all(...params);
  res.json(ids.map(r => getInvoiceWithItems(db, r.id)).filter(Boolean));
});

router.post("/invoices", (req, res) => {
  const { truckId, clientId, paymentType, latitude, longitude, items } = req.body;
  if (!truckId || !clientId || !items?.length) {
    return res.status(400).json({ error: "Camion, client et articles requis" });
  }
  const db = getDb();

  const insertInvoice = db.transaction(() => {
    const invoiceNumber = `FAC-${Date.now()}`;
    const invInfo = db.prepare(`
      INSERT INTO invoices (invoice_number, truck_id, client_id, payment_type, total_amount, total_commission, latitude, longitude)
      VALUES (?,?,?,?,0,0,?,?)
    `).run(invoiceNumber, parseInt(truckId), parseInt(clientId), paymentType || "cash",
      latitude || null, longitude || null);
    const invoiceId = invInfo.lastInsertRowid;

    let totalAmount = 0;
    let totalCommission = 0;

    for (const item of items) {
      const qty = Number(item.quantity);
      const unitPrice = Number(item.unitPrice);
      const subtotal = qty * unitPrice;
      const product = db.prepare("SELECT * FROM products WHERE id = ?").get(parseInt(item.productId));
      let commissionRate = 0;
      if (product) {
        if (item.priceType === "retail") commissionRate = Number(product.commission_retail);
        else if (item.priceType === "half_wholesale") commissionRate = Number(product.commission_half);
        else if (item.priceType === "wholesale") commissionRate = Number(product.commission_wholesale);
      }
      const commission = (subtotal * commissionRate) / 100;
      db.prepare(`
        INSERT INTO invoice_items (invoice_id, product_id, quantity, price_type, unit_price, commission, subtotal)
        VALUES (?,?,?,?,?,?,?)
      `).run(invoiceId, parseInt(item.productId), qty, item.priceType || "retail", unitPrice, commission, subtotal);
      totalAmount += subtotal;
      totalCommission += commission;

      const ts = db.prepare("SELECT * FROM truck_stock WHERE truck_id = ? AND product_id = ?")
        .get(parseInt(truckId), parseInt(item.productId));
      if (ts) {
        db.prepare("UPDATE truck_stock SET quantity = ? WHERE id = ?")
          .run(Math.max(0, Number(ts.quantity) - qty), ts.id);
      }
    }

    db.prepare("UPDATE invoices SET total_amount = ?, total_commission = ? WHERE id = ?")
      .run(totalAmount, totalCommission, invoiceId);

    if ((paymentType || "cash") === "cash") {
      const truck = db.prepare("SELECT * FROM trucks WHERE id = ?").get(parseInt(truckId));
      if (truck) {
        db.prepare("UPDATE trucks SET cash_balance = ? WHERE id = ?")
          .run(Number(truck.cash_balance) + totalAmount, parseInt(truckId));
      }
    }
    if (paymentType === "credit") {
      const client = db.prepare("SELECT * FROM clients WHERE id = ?").get(parseInt(clientId));
      if (client) {
        db.prepare("UPDATE clients SET balance = ? WHERE id = ?")
          .run(Number(client.balance) - totalAmount, parseInt(clientId));
      }
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
  db.prepare("DELETE FROM invoice_items WHERE invoice_id = ?").run(id);
  db.prepare("DELETE FROM invoices WHERE id = ?").run(id);
  res.status(204).send();
});

module.exports = router;
