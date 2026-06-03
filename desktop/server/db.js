const Database = require("better-sqlite3");
const crypto = require("crypto");
const path = require("path");
const fs = require("fs");

let db;

function hashPassword(password) {
  return crypto.createHash("sha256").update(password + "erp-salt-dzd").digest("hex");
}

function initDb(userDataPath) {
  if (db) return db;
  const dbPath = path.join(userDataPath, "erp-van-sales.db");
  fs.mkdirSync(userDataPath, { recursive: true });
  db = new Database(dbPath);

  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.pragma("synchronous = NORMAL");
  db.pragma("cache_size = -32000");
  db.pragma("mmap_size = 268435456");
  db.pragma("temp_store = MEMORY");
  db.pragma("wal_autocheckpoint = 1000");

  createSchema();
  createIndexes();
  seedDefaultAdmin();
  return db;
}

function getDb() {
  if (!db) throw new Error("Database not initialized. Call initDb first.");
  return db;
}

function createSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
    );

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      full_name TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'vendeur',
      truck_id INTEGER,
      can_delete_invoice INTEGER NOT NULL DEFAULT 0,
      can_edit_price INTEGER NOT NULL DEFAULT 0,
      can_sell_on_credit INTEGER NOT NULL DEFAULT 1,
      can_view_reports INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
    );

    CREATE TABLE IF NOT EXISTS suppliers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      phone TEXT,
      email TEXT,
      balance REAL NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
    );

    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      barcode TEXT,
      category_id INTEGER,
      stock_quantity REAL NOT NULL DEFAULT 0,
      purchase_price REAL NOT NULL DEFAULT 0,
      selling_price_retail REAL NOT NULL DEFAULT 0,
      selling_price_half_wholesale REAL NOT NULL DEFAULT 0,
      selling_price_wholesale REAL NOT NULL DEFAULT 0,
      commission_retail REAL NOT NULL DEFAULT 0,
      commission_half REAL NOT NULL DEFAULT 0,
      commission_wholesale REAL NOT NULL DEFAULT 0,
      image_url TEXT,
      unit TEXT NOT NULL DEFAULT 'unité',
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
    );

    CREATE TABLE IF NOT EXISTS purchases (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      supplier_id INTEGER NOT NULL,
      total_amount REAL NOT NULL DEFAULT 0,
      paid_amount REAL NOT NULL DEFAULT 0,
      payment_status TEXT NOT NULL DEFAULT 'pending',
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
    );

    CREATE TABLE IF NOT EXISTS purchase_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      purchase_id INTEGER NOT NULL,
      product_id INTEGER NOT NULL,
      quantity REAL NOT NULL,
      purchase_price REAL NOT NULL,
      subtotal REAL NOT NULL
    );

    CREATE TABLE IF NOT EXISTS clients (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      phone TEXT,
      client_type TEXT NOT NULL DEFAULT 'retail',
      truck_id INTEGER,
      latitude REAL,
      longitude REAL,
      balance REAL NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
    );

    CREATE TABLE IF NOT EXISTS trucks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      plate_number TEXT,
      vendeur_id INTEGER,
      driver_name TEXT,
      password_hash TEXT,
      location TEXT,
      cash_balance REAL NOT NULL DEFAULT 0,
      latitude REAL,
      longitude REAL,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
    );

    CREATE TABLE IF NOT EXISTS truck_stock (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      truck_id INTEGER NOT NULL,
      product_id INTEGER NOT NULL,
      quantity REAL NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS stock_transfers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      truck_id INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
    );

    CREATE TABLE IF NOT EXISTS stock_transfer_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      transfer_id INTEGER NOT NULL,
      product_id INTEGER NOT NULL,
      quantity REAL NOT NULL
    );

    CREATE TABLE IF NOT EXISTS invoices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invoice_number TEXT NOT NULL,
      truck_id INTEGER NOT NULL,
      client_id INTEGER NOT NULL,
      payment_type TEXT NOT NULL DEFAULT 'cash',
      total_amount REAL NOT NULL DEFAULT 0,
      total_commission REAL NOT NULL DEFAULT 0,
      latitude REAL,
      longitude REAL,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
    );

    CREATE TABLE IF NOT EXISTS invoice_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invoice_id INTEGER NOT NULL,
      product_id INTEGER NOT NULL,
      quantity REAL NOT NULL,
      price_type TEXT NOT NULL DEFAULT 'retail',
      unit_price REAL NOT NULL,
      commission REAL NOT NULL DEFAULT 0,
      subtotal REAL NOT NULL
    );

    CREATE TABLE IF NOT EXISTS returns (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      truck_id INTEGER,
      client_id INTEGER,
      invoice_id INTEGER,
      total_amount REAL NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
    );

    CREATE TABLE IF NOT EXISTS return_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      return_id INTEGER NOT NULL,
      product_id INTEGER NOT NULL,
      quantity REAL NOT NULL,
      unit_price REAL NOT NULL,
      subtotal REAL NOT NULL
    );

    CREATE TABLE IF NOT EXISTS cash_transfers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      truck_id INTEGER NOT NULL,
      amount REAL NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      note TEXT,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
    );

    CREATE TABLE IF NOT EXISTS sync_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      synced_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
      records_pushed INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'success',
      error TEXT
    );

    CREATE TABLE IF NOT EXISTS sync_map (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      entity_type TEXT NOT NULL,
      local_id INTEGER NOT NULL,
      remote_id INTEGER NOT NULL,
      synced_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
      UNIQUE(entity_type, local_id)
    );

    CREATE TABLE IF NOT EXISTS other_branches_stock (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      branch_id INTEGER NOT NULL,
      branch_name TEXT NOT NULL,
      product_id INTEGER NOT NULL,
      product_name TEXT NOT NULL,
      quantity REAL NOT NULL DEFAULT 0,
      unit TEXT NOT NULL DEFAULT 'unité',
      fetched_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
    );
  `);
}

function createIndexes() {
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_invoices_truck_id     ON invoices(truck_id);
    CREATE INDEX IF NOT EXISTS idx_invoices_client_id    ON invoices(client_id);
    CREATE INDEX IF NOT EXISTS idx_invoices_created_at   ON invoices(created_at);
    CREATE INDEX IF NOT EXISTS idx_invoices_payment_type ON invoices(payment_type);

    CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice_id ON invoice_items(invoice_id);
    CREATE INDEX IF NOT EXISTS idx_invoice_items_product_id ON invoice_items(product_id);

    CREATE INDEX IF NOT EXISTS idx_truck_stock_truck_id    ON truck_stock(truck_id);
    CREATE INDEX IF NOT EXISTS idx_truck_stock_product_id  ON truck_stock(product_id);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_truck_stock_unique ON truck_stock(truck_id, product_id);

    CREATE INDEX IF NOT EXISTS idx_clients_truck_id ON clients(truck_id);
    CREATE INDEX IF NOT EXISTS idx_clients_name     ON clients(name);

    CREATE INDEX IF NOT EXISTS idx_products_category_id ON products(category_id);
    CREATE INDEX IF NOT EXISTS idx_products_name        ON products(name);

    CREATE INDEX IF NOT EXISTS idx_purchase_items_purchase_id ON purchase_items(purchase_id);
    CREATE INDEX IF NOT EXISTS idx_purchase_items_product_id  ON purchase_items(product_id);

    CREATE INDEX IF NOT EXISTS idx_return_items_return_id  ON return_items(return_id);
    CREATE INDEX IF NOT EXISTS idx_return_items_product_id ON return_items(product_id);

    CREATE INDEX IF NOT EXISTS idx_returns_truck_id ON returns(truck_id);

    CREATE INDEX IF NOT EXISTS idx_cash_transfers_truck_id ON cash_transfers(truck_id);
    CREATE INDEX IF NOT EXISTS idx_cash_transfers_status   ON cash_transfers(status);

    CREATE INDEX IF NOT EXISTS idx_stock_transfer_items_transfer_id ON stock_transfer_items(transfer_id);

    CREATE INDEX IF NOT EXISTS idx_other_branches_stock_branch_id ON other_branches_stock(branch_id);
  `);
}

function seedDefaultAdmin() {
  const existing = db.prepare("SELECT id FROM users WHERE username = 'admin'").get();
  if (!existing) {
    db.prepare(`
      INSERT INTO users (username, password_hash, full_name, role)
      VALUES ('admin', ?, 'Administrateur', 'admin')
    `).run(hashPassword("admin123"));
  }
}

function closeDb() {
  if (db) {
    db.close();
    db = null;
  }
}

/**
 * Atomic backup using better-sqlite3's built-in backup API.
 * Handles WAL mode correctly — includes all committed transactions.
 */
async function backupDb(destPath) {
  if (!db) throw new Error("Database not initialized.");
  await db.backup(destPath);
}

module.exports = { initDb, getDb, hashPassword, closeDb, backupDb };
