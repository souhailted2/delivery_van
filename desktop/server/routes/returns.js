const { Router } = require("express");
const { getDb } = require("../db");

const router = Router();

function getReturnWithItems(db, id) {
  const ret = db.prepare(`
    SELECT r.*, t.name AS truck_name, c.name AS client_name
    FROM returns r
    LEFT JOIN trucks t ON r.truck_id = t.id
    LEFT JOIN clients c ON r.client_id = c.id
    WHERE r.id = ?
  `).get(id);
  if (!ret) return null;

  const items = db.prepare(`
    SELECT ri.*, p.name AS product_name
    FROM return_items ri LEFT JOIN products p ON ri.product_id = p.id
    WHERE ri.return_id = ?
  `).all(id);

  return {
    id: ret.id, type: ret.type,
    truckId: ret.truck_id, truckName: ret.truck_name,
    clientId: ret.client_id, clientName: ret.client_name,
    invoiceId: ret.invoice_id,
    totalAmount: Number(ret.total_amount),
    createdAt: ret.created_at,
    items: items.map(i => ({
      productId: i.product_id, productName: i.product_name,
      quantity: Number(i.quantity), unitPrice: Number(i.unit_price), subtotal: Number(i.subtotal),
    })),
  };
}

router.get("/returns", (_req, res) => {
  const db = getDb();
  const ids = db.prepare("SELECT id FROM returns ORDER BY created_at").all();
  res.json(ids.map(r => getReturnWithItems(db, r.id)).filter(Boolean));
});

router.post("/returns", (req, res) => {
  const { type, truckId, clientId, invoiceId, items } = req.body;
  if (!type || !items?.length) return res.status(400).json({ error: "Type et articles requis" });
  const db = getDb();

  const doReturn = db.transaction(() => {
    const info = db.prepare(`
      INSERT INTO returns (type, truck_id, client_id, invoice_id, total_amount)
      VALUES (?,?,?,?,0)
    `).run(type, truckId || null, clientId || null, invoiceId || null);
    const returnId = info.lastInsertRowid;

    let totalAmount = 0;
    for (const item of items) {
      const qty = Number(item.quantity);
      const unitPrice = Number(item.unitPrice);
      const subtotal = qty * unitPrice;
      totalAmount += subtotal;

      db.prepare(`INSERT INTO return_items (return_id, product_id, quantity, unit_price, subtotal) VALUES (?,?,?,?,?)`)
        .run(returnId, parseInt(item.productId), qty, unitPrice, subtotal);

      if (type === "client_return" && truckId) {
        const ts = db.prepare("SELECT * FROM truck_stock WHERE truck_id = ? AND product_id = ?")
          .get(parseInt(truckId), parseInt(item.productId));
        if (ts) {
          db.prepare("UPDATE truck_stock SET quantity = ? WHERE id = ?").run(Number(ts.quantity) + qty, ts.id);
        } else {
          db.prepare("INSERT INTO truck_stock (truck_id, product_id, quantity) VALUES (?,?,?)")
            .run(parseInt(truckId), parseInt(item.productId), qty);
        }
      } else if (type === "truck_return") {
        const product = db.prepare("SELECT * FROM products WHERE id = ?").get(parseInt(item.productId));
        if (product) {
          db.prepare("UPDATE products SET stock_quantity = ? WHERE id = ?")
            .run(Number(product.stock_quantity) + qty, parseInt(item.productId));
        }
      }
    }
    db.prepare("UPDATE returns SET total_amount = ? WHERE id = ?").run(totalAmount, returnId);
    return returnId;
  });

  const returnId = doReturn();
  res.status(201).json(getReturnWithItems(db, returnId));
});

router.get("/returns/:id", (req, res) => {
  const db = getDb();
  const result = getReturnWithItems(db, parseInt(req.params.id));
  if (!result) return res.status(404).json({ error: "Retour non trouvé" });
  res.json(result);
});

module.exports = router;
