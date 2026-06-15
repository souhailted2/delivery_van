const { Router } = require("express");
const { getDb } = require("../db");

const router = Router();

router.get("/stock/warehouse", (_req, res) => {
  const db = getDb();
  const stock = db.prepare(`
    SELECT p.id AS product_id, p.name AS product_name, c.name AS category_name,
      p.stock_quantity AS quantity, p.unit, p.purchase_price
    FROM products p LEFT JOIN categories c ON p.category_id = c.id
    ORDER BY p.name
  `).all();
  res.json(stock.map(s => ({
    productId: s.product_id, productName: s.product_name,
    categoryName: s.category_name, quantity: Number(s.quantity),
    unit: s.unit, purchasePrice: Number(s.purchase_price),
  })));
});

router.post("/stock/transfer", (req, res) => {
  const { truckId, items } = req.body;
  if (!truckId || !items?.length) return res.status(400).json({ error: "Camion et articles requis" });
  const db = getDb();

  const truckIdNum = parseInt(truckId);
  if (!Number.isInteger(truckIdNum)) return res.status(400).json({ error: "Camion invalide" });
  const truckExists = db.prepare("SELECT id FROM trucks WHERE id = ? AND is_deleted = 0").get(truckIdNum);
  if (!truckExists) return res.status(400).json({ error: "Camion introuvable" });

  const doTransfer = db.transaction(() => {
    const info = db.prepare("INSERT INTO stock_transfers (truck_id) VALUES (?)").run(truckIdNum);
    const transferId = info.lastInsertRowid;

    for (const item of items) {
      const qty = Number(item.quantity);
      const productId = parseInt(item.productId);
      if (!Number.isInteger(productId) || !Number.isFinite(qty) || qty <= 0) {
        throw new Error("Article invalide");
      }
      const product = db.prepare("SELECT * FROM products WHERE id = ?").get(productId);
      if (!product || Number(product.stock_quantity) < qty) {
        throw new Error(`Stock insuffisant pour ${product?.name ?? "produit"}`);
      }
      db.prepare("UPDATE products SET stock_quantity = ? WHERE id = ?")
        .run(Number(product.stock_quantity) - qty, productId);

      const existing = db.prepare("SELECT * FROM truck_stock WHERE truck_id = ? AND product_id = ?")
        .get(truckIdNum, productId);
      if (existing) {
        db.prepare("UPDATE truck_stock SET quantity = ? WHERE id = ?")
          .run(Number(existing.quantity) + qty, existing.id);
      } else {
        db.prepare("INSERT INTO truck_stock (truck_id, product_id, quantity) VALUES (?,?,?)")
          .run(truckIdNum, productId, qty);
      }
      db.prepare("INSERT INTO stock_transfer_items (transfer_id, product_id, quantity) VALUES (?,?,?)")
        .run(transferId, productId, qty);
    }
    return transferId;
  });

  try {
    const transferId = doTransfer();
    const truck = db.prepare("SELECT * FROM trucks WHERE id = ?").get(truckIdNum);
    const transferItems = db.prepare(`
      SELECT sti.product_id, p.name AS product_name, sti.quantity
      FROM stock_transfer_items sti LEFT JOIN products p ON sti.product_id = p.id
      WHERE sti.transfer_id = ?
    `).all(transferId);
    const transfer = db.prepare("SELECT * FROM stock_transfers WHERE id = ?").get(transferId);
    res.json({
      id: transfer.id, truckId: transfer.truck_id, truckName: truck?.name ?? "",
      items: transferItems.map(i => ({ productId: i.product_id, productName: i.product_name, quantity: Number(i.quantity) })),
      createdAt: transfer.created_at,
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get("/stock/transfers", (_req, res) => {
  const db = getDb();
  const transfers = db.prepare(`
    SELECT st.*, t.name AS truck_name
    FROM stock_transfers st LEFT JOIN trucks t ON st.truck_id = t.id
    ORDER BY st.created_at
  `).all();
  const result = transfers.map(t => {
    const items = db.prepare(`
      SELECT sti.product_id, p.name AS product_name, sti.quantity
      FROM stock_transfer_items sti LEFT JOIN products p ON sti.product_id = p.id
      WHERE sti.transfer_id = ?
    `).all(t.id);
    return {
      id: t.id, truckId: t.truck_id, truckName: t.truck_name,
      items: items.map(i => ({ productId: i.product_id, productName: i.product_name, quantity: Number(i.quantity) })),
      createdAt: t.created_at,
    };
  });
  res.json(result);
});

module.exports = router;
