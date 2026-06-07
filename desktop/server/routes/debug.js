const { Router } = require("express");
const { getDb } = require("../db");

const router = Router();

const TABLES = [
  "categories", "suppliers", "trucks", "users", "clients", "products",
  "purchase_orders", "purchase_items", "invoices", "invoice_items",
  "returns", "return_items", "cash_transfers", "truck_stock",
  "stock_transfers", "stock_transfer_items", "warehouse_stock",
];

router.get("/debug/sqlite-counts", (req, res) => {
  try {
    const db = getDb();
    const counts = {};
    for (const table of TABLES) {
      try {
        const row = db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get();
        counts[table] = row.n;
      } catch {
        counts[table] = "N/A";
      }
    }
    res.json({ counts });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

module.exports = router;
