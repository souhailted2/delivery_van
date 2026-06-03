const { Router } = require("express");
const { getDb } = require("../db");

const router = Router();

function getPurchaseWithItems(db, id) {
  const p = db.prepare(`
    SELECT pu.*, s.name AS supplier_name
    FROM purchases pu LEFT JOIN suppliers s ON pu.supplier_id = s.id
    WHERE pu.id = ? AND pu.is_deleted = 0
  `).get(id);
  if (!p) return null;
  const items = db.prepare(`
    SELECT pi.*, pr.name AS product_name
    FROM purchase_items pi LEFT JOIN products pr ON pi.product_id = pr.id
    WHERE pi.purchase_id = ? AND pi.is_deleted = 0
  `).all(id);
  return {
    id: p.id, supplierId: p.supplier_id, supplierName: p.supplier_name,
    totalAmount: Number(p.total_amount), paidAmount: Number(p.paid_amount),
    remainingAmount: Number(p.total_amount) - Number(p.paid_amount),
    paymentStatus: p.payment_status, createdAt: p.created_at,
    items: items.map(i => ({
      id: i.id, productId: i.product_id, productName: i.product_name,
      quantity: Number(i.quantity), purchasePrice: Number(i.purchase_price),
      subtotal: Number(i.subtotal),
    })),
  };
}

router.get("/purchases", (_req, res) => {
  const db = getDb();
  const ids = db.prepare(
    `SELECT pu.id FROM purchases pu WHERE pu.is_deleted = 0 ORDER BY pu.created_at`
  ).all();
  res.json(ids.map(r => getPurchaseWithItems(db, r.id)).filter(Boolean));
});

router.post("/purchases", (req, res) => {
  const { supplierId, items, initialPayment } = req.body;
  if (!supplierId || !items?.length) return res.status(400).json({ error: "Fournisseur et articles requis" });
  const db = getDb();

  const doPurchase = db.transaction(() => {
    let total = 0;
    for (const item of items) total += Number(item.quantity) * Number(item.purchasePrice);
    const paid   = initialPayment ? Math.min(Number(initialPayment), total) : 0;
    const status = paid >= total ? "paid" : paid > 0 ? "partial" : "pending";

    const info = db.prepare(`
      INSERT INTO purchases (supplier_id, total_amount, paid_amount, payment_status)
      VALUES (?,?,?,?)
    `).run(parseInt(supplierId), total, paid, status);
    const purchaseId = info.lastInsertRowid;

    for (const item of items) {
      const qty   = Number(item.quantity);
      const price = Number(item.purchasePrice);
      db.prepare(`INSERT INTO purchase_items (purchase_id, product_id, quantity, purchase_price, subtotal) VALUES (?,?,?,?,?)`)
        .run(purchaseId, parseInt(item.productId), qty, price, qty * price);
      const product = db.prepare("SELECT * FROM products WHERE id = ? AND is_deleted = 0").get(parseInt(item.productId));
      if (product) {
        db.prepare("UPDATE products SET stock_quantity = ? WHERE id = ?")
          .run(Number(product.stock_quantity) + qty, parseInt(item.productId));
      }
    }

    const supplier = db.prepare("SELECT * FROM suppliers WHERE id = ? AND is_deleted = 0").get(parseInt(supplierId));
    if (supplier) {
      db.prepare("UPDATE suppliers SET balance = ? WHERE id = ?")
        .run(Number(supplier.balance) + total - paid, parseInt(supplierId));
    }
    return purchaseId;
  });

  const purchaseId = doPurchase();
  res.status(201).json(getPurchaseWithItems(db, purchaseId));
});

router.get("/purchases/:id", (req, res) => {
  const db = getDb();
  const result = getPurchaseWithItems(db, parseInt(req.params.id));
  if (!result) return res.status(404).json({ error: "Bon d'achat non trouvé" });
  res.json(result);
});

router.post("/purchases/:id/payment", (req, res) => {
  const id = parseInt(req.params.id);
  const { amount } = req.body;
  if (!amount || amount <= 0) return res.status(400).json({ error: "Montant invalide" });
  const db = getDb();
  const purchase = db.prepare("SELECT * FROM purchases WHERE id = ? AND is_deleted = 0").get(id);
  if (!purchase) return res.status(404).json({ error: "Bon non trouvé" });
  const newPaid   = Math.min(Number(purchase.paid_amount) + Number(amount), Number(purchase.total_amount));
  const newStatus = newPaid >= Number(purchase.total_amount) ? "paid" : "partial";
  db.prepare("UPDATE purchases SET paid_amount = ?, payment_status = ? WHERE id = ?")
    .run(newPaid, newStatus, id);
  const supplier = db.prepare("SELECT * FROM suppliers WHERE id = ? AND is_deleted = 0").get(purchase.supplier_id);
  if (supplier) {
    db.prepare("UPDATE suppliers SET balance = ? WHERE id = ?")
      .run(Math.max(0, Number(supplier.balance) - Number(amount)), purchase.supplier_id);
  }
  res.json(getPurchaseWithItems(db, id));
});

module.exports = router;
