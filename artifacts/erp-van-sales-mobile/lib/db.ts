import type { SQLiteDatabase } from "expo-sqlite";
import { Platform } from "react-native";

export interface Product {
  _lid?: number; sync_id: string; id?: number | null; name: string;
  barcode?: string | null; category_id?: number | null;
  stock_quantity?: number; purchase_price?: number;
  selling_price_retail?: number; selling_price_half_wholesale?: number;
  selling_price_wholesale?: number; image_url?: string | null;
  local_image_uri?: string | null;
  unit?: string | null; updated_at?: string; is_deleted?: number; _pending?: number;
}
export interface Category {
  _lid?: number; sync_id: string; id?: number | null; name: string;
  updated_at?: string; is_deleted?: number; _pending?: number;
}
export interface Client {
  _lid?: number; sync_id: string; id?: number | null; name: string;
  phone?: string | null; client_type?: string | null; truck_id?: number | null;
  credit_balance?: number; updated_at?: string; is_deleted?: number; _pending?: number;
}
export interface Truck {
  _lid?: number; sync_id: string; id?: number | null; name: string;
  plate_number?: string | null; cash_balance?: number; vendeur_id?: number | null;
  updated_at?: string; is_deleted?: number; _pending?: number;
}
export interface TruckStock {
  _lid?: number; sync_id: string; id?: number | null;
  truck_id?: number | null; product_id?: number | null;
  quantity?: number; updated_at?: string; _pending?: number;
}
export interface Invoice {
  _lid?: number; sync_id: string; id?: number | null;
  truck_id?: number | null; truck_sync_id?: string | null;
  client_id?: number | null; client_sync_id?: string | null;
  payment_type?: string; total_amount?: number;
  created_at?: string; updated_at?: string; is_deleted?: number; _pending?: number;
}
export interface InvoiceItem {
  _lid?: number; sync_id: string; id?: number | null;
  invoice_id?: number | null; invoice_sync_id?: string | null;
  product_id?: number | null; product_sync_id?: string | null;
  product_name?: string | null; quantity?: number;
  price_type?: string; unit_price?: number; commission?: number; subtotal?: number;
  updated_at?: string; _pending?: number;
}
export interface Return {
  _lid?: number; sync_id: string; id?: number | null;
  type?: string; truck_id?: number | null; client_id?: number | null;
  invoice_id?: number | null; total_amount?: number;
  created_at?: string; updated_at?: string; is_deleted?: number; _pending?: number;
}
export interface Supplier {
  _lid?: number; sync_id: string; id?: number | null;
  name: string; phone?: string | null; address?: string | null;
  updated_at?: string; is_deleted?: number; _pending?: number;
}
export interface Purchase {
  _lid?: number; sync_id: string; id?: number | null;
  supplier_id?: number | null; supplier_sync_id?: string | null;
  total_amount?: number; status?: string;
  created_at?: string; updated_at?: string; is_deleted?: number; _pending?: number;
}
export interface PurchaseItem {
  _lid?: number; sync_id: string; id?: number | null;
  purchase_id?: number | null; purchase_sync_id?: string | null;
  product_id?: number | null; product_sync_id?: string | null;
  product_name?: string | null; quantity?: number; unit_price?: number; subtotal?: number;
  updated_at?: string; _pending?: number;
}
export interface MobileUser {
  _lid?: number; sync_id: string; id?: number | null;
  username: string; role?: string; full_name?: string | null;
  branch_id?: number | null; updated_at?: string; is_deleted?: number; _pending?: number;
}
export interface CashTransfer {
  _lid?: number; sync_id: string; id?: number | null;
  truck_id?: number | null; truck_sync_id?: string | null;
  amount?: number; direction?: string; note?: string | null; status?: string;
  created_at?: string; updated_at?: string; is_deleted?: number; _pending?: number;
}
export interface StockTransfer {
  _lid?: number; sync_id: string; id?: number | null;
  from_truck_id?: number | null; to_truck_id?: number | null;
  from_warehouse?: number; note?: string | null;
  created_at?: string; updated_at?: string; is_deleted?: number; _pending?: number;
}
export interface StockTransferItem {
  _lid?: number; sync_id: string; id?: number | null;
  stock_transfer_id?: number | null; stock_transfer_sync_id?: string | null;
  product_id?: number | null; product_sync_id?: string | null;
  product_name?: string | null; quantity?: number;
  updated_at?: string; _pending?: number;
}

let _db: SQLiteDatabase | null = null;

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS sync_meta (key TEXT PRIMARY KEY, value TEXT);

  CREATE TABLE IF NOT EXISTS branches (
    _lid INTEGER PRIMARY KEY AUTOINCREMENT, sync_id TEXT UNIQUE, id INTEGER,
    name TEXT NOT NULL, address TEXT, phone TEXT,
    updated_at TEXT, is_deleted INTEGER DEFAULT 0, _pending INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS categories (
    _lid INTEGER PRIMARY KEY AUTOINCREMENT, sync_id TEXT UNIQUE, id INTEGER,
    name TEXT NOT NULL, updated_at TEXT, is_deleted INTEGER DEFAULT 0, _pending INTEGER DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS products (
    _lid INTEGER PRIMARY KEY AUTOINCREMENT, sync_id TEXT UNIQUE, id INTEGER,
    name TEXT NOT NULL, barcode TEXT, category_id INTEGER,
    stock_quantity REAL DEFAULT 0, purchase_price REAL DEFAULT 0,
    selling_price_retail REAL DEFAULT 0, selling_price_half_wholesale REAL DEFAULT 0,
    selling_price_wholesale REAL DEFAULT 0,
    commission_retail REAL DEFAULT 0, commission_half REAL DEFAULT 0, commission_wholesale REAL DEFAULT 0,
    image_url TEXT, local_image_uri TEXT, unit TEXT, created_at TEXT, updated_at TEXT,
    is_deleted INTEGER DEFAULT 0, _pending INTEGER DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS clients (
    _lid INTEGER PRIMARY KEY AUTOINCREMENT, sync_id TEXT UNIQUE, id INTEGER,
    name TEXT NOT NULL, phone TEXT, client_type TEXT DEFAULT 'retail',
    truck_id INTEGER, credit_balance REAL DEFAULT 0,
    created_at TEXT, updated_at TEXT, is_deleted INTEGER DEFAULT 0, _pending INTEGER DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS trucks (
    _lid INTEGER PRIMARY KEY AUTOINCREMENT, sync_id TEXT UNIQUE, id INTEGER,
    name TEXT NOT NULL, plate_number TEXT, cash_balance REAL DEFAULT 0,
    vendeur_id INTEGER, updated_at TEXT, is_deleted INTEGER DEFAULT 0, _pending INTEGER DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS truck_stock (
    _lid INTEGER PRIMARY KEY AUTOINCREMENT, sync_id TEXT UNIQUE, id INTEGER,
    truck_id INTEGER, product_id INTEGER, quantity REAL DEFAULT 0,
    updated_at TEXT, _pending INTEGER DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS invoices (
    _lid INTEGER PRIMARY KEY AUTOINCREMENT, sync_id TEXT UNIQUE, id INTEGER,
    truck_id INTEGER, truck_sync_id TEXT, client_id INTEGER, client_sync_id TEXT,
    payment_type TEXT DEFAULT 'cash', total_amount REAL DEFAULT 0,
    created_at TEXT, updated_at TEXT, is_deleted INTEGER DEFAULT 0, _pending INTEGER DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS invoice_items (
    _lid INTEGER PRIMARY KEY AUTOINCREMENT, sync_id TEXT UNIQUE, id INTEGER,
    invoice_id INTEGER, invoice_sync_id TEXT, product_id INTEGER, product_sync_id TEXT,
    product_name TEXT, quantity REAL, price_type TEXT DEFAULT 'retail',
    unit_price REAL, commission REAL DEFAULT 0, subtotal REAL,
    updated_at TEXT, _pending INTEGER DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS returns (
    _lid INTEGER PRIMARY KEY AUTOINCREMENT, sync_id TEXT UNIQUE, id INTEGER,
    type TEXT, truck_id INTEGER, client_id INTEGER, invoice_id INTEGER,
    total_amount REAL DEFAULT 0, created_at TEXT, updated_at TEXT,
    is_deleted INTEGER DEFAULT 0, _pending INTEGER DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS return_items (
    _lid INTEGER PRIMARY KEY AUTOINCREMENT, sync_id TEXT UNIQUE, id INTEGER,
    return_id INTEGER, return_sync_id TEXT, product_id INTEGER,
    product_name TEXT, quantity REAL, unit_price REAL, subtotal REAL,
    updated_at TEXT, _pending INTEGER DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS suppliers (
    _lid INTEGER PRIMARY KEY AUTOINCREMENT, sync_id TEXT UNIQUE, id INTEGER,
    name TEXT NOT NULL, phone TEXT, address TEXT,
    updated_at TEXT, is_deleted INTEGER DEFAULT 0, _pending INTEGER DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS purchases (
    _lid INTEGER PRIMARY KEY AUTOINCREMENT, sync_id TEXT UNIQUE, id INTEGER,
    supplier_id INTEGER, supplier_sync_id TEXT, total_amount REAL DEFAULT 0,
    status TEXT DEFAULT 'pending', created_at TEXT, updated_at TEXT,
    is_deleted INTEGER DEFAULT 0, _pending INTEGER DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS purchase_items (
    _lid INTEGER PRIMARY KEY AUTOINCREMENT, sync_id TEXT UNIQUE, id INTEGER,
    purchase_id INTEGER, purchase_sync_id TEXT,
    product_id INTEGER, product_sync_id TEXT, product_name TEXT,
    quantity REAL, unit_price REAL, subtotal REAL,
    updated_at TEXT, _pending INTEGER DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS users (
    _lid INTEGER PRIMARY KEY AUTOINCREMENT, sync_id TEXT UNIQUE, id INTEGER,
    username TEXT NOT NULL, role TEXT, full_name TEXT, branch_id INTEGER,
    updated_at TEXT, is_deleted INTEGER DEFAULT 0, _pending INTEGER DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS cash_transfers (
    _lid INTEGER PRIMARY KEY AUTOINCREMENT, sync_id TEXT UNIQUE, id INTEGER,
    truck_id INTEGER, truck_sync_id TEXT, amount REAL DEFAULT 0,
    direction TEXT, note TEXT, status TEXT DEFAULT 'pending', created_at TEXT, updated_at TEXT,
    is_deleted INTEGER DEFAULT 0, _pending INTEGER DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS stock_transfers (
    _lid INTEGER PRIMARY KEY AUTOINCREMENT, sync_id TEXT UNIQUE, id INTEGER,
    from_truck_id INTEGER, to_truck_id INTEGER, from_warehouse INTEGER DEFAULT 0,
    note TEXT, created_at TEXT, updated_at TEXT,
    is_deleted INTEGER DEFAULT 0, _pending INTEGER DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS stock_transfer_items (
    _lid INTEGER PRIMARY KEY AUTOINCREMENT, sync_id TEXT UNIQUE, id INTEGER,
    stock_transfer_id INTEGER, stock_transfer_sync_id TEXT,
    product_id INTEGER, product_sync_id TEXT, product_name TEXT,
    quantity REAL, updated_at TEXT, _pending INTEGER DEFAULT 0
  );
`;

export async function getDb(): Promise<SQLiteDatabase | null> {
  if (Platform.OS === "web") return null;
  if (!_db) {
    const SQLite = await import("expo-sqlite");
    _db = await SQLite.openDatabaseAsync("erp_mobile.db");
    await _db.execAsync(SCHEMA);
    // Migrations for existing databases
    try { await _db.runAsync("ALTER TABLE products ADD COLUMN local_image_uri TEXT"); } catch {}
    try { await _db.runAsync("ALTER TABLE cash_transfers ADD COLUMN status TEXT DEFAULT 'pending'"); } catch {}
    try { await _db.runAsync("CREATE TABLE IF NOT EXISTS branches (_lid INTEGER PRIMARY KEY AUTOINCREMENT, sync_id TEXT UNIQUE, id INTEGER, name TEXT NOT NULL, address TEXT, phone TEXT, updated_at TEXT, is_deleted INTEGER DEFAULT 0, _pending INTEGER DEFAULT 0)"); } catch {}
  }
  return _db;
}

export async function getSyncMeta(
  db: SQLiteDatabase,
  key: string,
): Promise<string | null> {
  const row = await db.getFirstAsync<{ value: string }>(
    "SELECT value FROM sync_meta WHERE key = ?",
    [key],
  );
  return row?.value ?? null;
}

export async function setSyncMeta(
  db: SQLiteDatabase,
  key: string,
  value: string,
): Promise<void> {
  await db.runAsync(
    "INSERT OR REPLACE INTO sync_meta (key, value) VALUES (?, ?)",
    [key, value],
  );
}

// Cache of local column names per table, used to drop any server-sent columns
// that don't exist locally (schema drift safety — e.g. server sends `created_at`
// for a table whose local SQLite schema doesn't define it).
const _tableColumns: Record<string, Set<string>> = {};

async function getTableColumns(db: SQLiteDatabase, tableName: string): Promise<Set<string>> {
  const cached = _tableColumns[tableName];
  if (cached) return cached;
  const rows = await db.getAllAsync<{ name: string }>(`PRAGMA table_info(${tableName})`);
  const cols = new Set(rows.map(r => r.name));
  _tableColumns[tableName] = cols;
  return cols;
}

// Server→local column renames. The cloud schema names a few business-data columns
// differently from the local mobile schema. Without these the values would be
// silently dropped by the column filter even though the data IS needed locally:
//   - clients.balance (cloud) → credit_balance (mobile, shown as client debt)
//   - purchases.payment_status (cloud) → status (mobile, status badge)
// Map BEFORE filtering so the real data lands in the right local column.
const COLUMN_ALIASES: Record<string, Record<string, string>> = {
  clients: { balance: "credit_balance" },
  purchases: { payment_status: "status" },
};

export async function upsertRecord(
  db: SQLiteDatabase,
  tableName: string,
  record: Record<string, unknown>,
): Promise<void> {
  if (!record["sync_id"]) return;
  // Keep only columns that actually exist in the local table. The cloud schema
  // can have extra columns (e.g. created_at) the mobile schema doesn't track;
  // including them would make the INSERT/UPDATE fail with "no column named ...".
  const validCols = await getTableColumns(db, tableName);
  const aliases = COLUMN_ALIASES[tableName];
  const clean: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(record)) {
    if (validCols.has(k)) clean[k] = v;
  }
  // Apply server→local renames for columns that didn't match directly, so
  // important data (e.g. client balance) is stored instead of dropped.
  if (aliases) {
    for (const [serverCol, localCol] of Object.entries(aliases)) {
      if (serverCol in record && validCols.has(localCol) && !(localCol in clean)) {
        clean[localCol] = record[serverCol];
      }
    }
  }
  if (!clean["sync_id"]) return;

  const existing = await db.getFirstAsync<{ _lid: number; updated_at?: string }>(
    `SELECT _lid, updated_at FROM ${tableName} WHERE sync_id = ?`,
    [clean["sync_id"] as string],
  );
  if (existing) {
    const existingTs = existing.updated_at ? new Date(existing.updated_at).getTime() : 0;
    const incomingTs = clean["updated_at"] ? new Date(clean["updated_at"] as string).getTime() : 0;
    if (incomingTs >= existingTs) {
      const { sync_id, ...rest } = clean;
      const cols = Object.keys(rest).map(k => `${k} = ?`).join(", ");
      const vals = [...Object.values(rest), existing._lid] as any[];
      await db.runAsync(`UPDATE ${tableName} SET ${cols}, _pending = 0 WHERE _lid = ?`, vals);
    }
  } else {
    const cols = Object.keys(clean).join(", ");
    const placeholders = Object.keys(clean).map(() => "?").join(", ");
    await db.runAsync(
      `INSERT OR IGNORE INTO ${tableName} (${cols}, _pending) VALUES (${placeholders}, 0)`,
      [...Object.values(clean)] as any[],
    );
  }
}

export async function getPendingCount(db: SQLiteDatabase): Promise<number> {
  const tables = [
    "categories", "products", "clients",
    "invoices", "invoice_items",
    "returns", "return_items",
    "cash_transfers",
    "stock_transfers", "stock_transfer_items",
  ];
  let total = 0;
  for (const t of tables) {
    const row = await db.getFirstAsync<{ cnt: number }>(
      `SELECT COUNT(*) as cnt FROM ${t} WHERE _pending = 1`,
    );
    total += row?.cnt ?? 0;
  }
  return total;
}

export const TABLE_LABELS: [string, string][] = [
  ["categories", "الفئات"],
  ["products", "المنتجات"],
  ["suppliers", "الموردون"],
  ["clients", "العملاء"],
  ["trucks", "الشاحنات"],
  ["users", "المستخدمون"],
  ["truck_stock", "مخزون الشاحنة"],
  ["purchases", "طلبات الشراء"],
  ["purchase_items", "بنود الطلبات"],
  ["invoices", "الفواتير"],
  ["invoice_items", "بنود الفواتير"],
  ["returns", "المرتجعات"],
  ["return_items", "بنود المرتجعات"],
  ["cash_transfers", "الصندوق"],
  ["stock_transfers", "تحويلات المخزن"],
  ["stock_transfer_items", "بنود التحويلات"],
];

// Tables that have an is_deleted soft-delete column
export const TABLES_WITH_SOFT_DELETE = new Set([
  "categories", "products", "suppliers", "clients", "trucks", "users",
  "purchases", "invoices", "returns", "cash_transfers", "stock_transfers",
]);

export async function getTableCounts(db: SQLiteDatabase): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  for (const [table] of TABLE_LABELS) {
    try {
      const query = TABLES_WITH_SOFT_DELETE.has(table)
        ? `SELECT COUNT(*) as cnt FROM ${table} WHERE is_deleted = 0 OR is_deleted IS NULL`
        : `SELECT COUNT(*) as cnt FROM ${table}`;
      const row = await db.getFirstAsync<{ cnt: number }>(query);
      counts[table] = row?.cnt ?? 0;
    } catch {
      counts[table] = 0;
    }
  }
  return counts;
}

export async function resetSyncMeta(db: SQLiteDatabase): Promise<void> {
  // Clear all sync cursors but keep device_id so this device stays identifiable
  await db.runAsync("DELETE FROM sync_meta WHERE key != 'device_id'");
}

export async function isBootstrapNeeded(db: SQLiteDatabase): Promise<boolean> {
  // Explicitly marked done — no setup needed (normal operation after first install)
  const done = await getSyncMeta(db, "bootstrap_done");
  if (done === "1") return false;

  // Data already exists → this is an existing install being upgraded; auto-mark done
  // so the user is never forced through setup on an already-working device.
  try {
    const row = await db.getFirstAsync<{ cnt: number }>(
      "SELECT COUNT(*) as cnt FROM users",
    );
    if ((row?.cnt ?? 0) > 0) {
      await setSyncMeta(db, "bootstrap_done", "1");
      return false;
    }
  } catch {}

  // Truly empty DB → first install → show setup screen
  return true;
}
