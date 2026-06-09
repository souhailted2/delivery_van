import type { SQLiteDatabase } from "expo-sqlite";
import { Platform } from "react-native";

export interface Product {
  _lid?: number; sync_id: string; id?: number | null; name: string;
  barcode?: string | null; category_id?: number | null;
  stock_quantity?: number; purchase_price?: number;
  selling_price_retail?: number; selling_price_half_wholesale?: number;
  selling_price_wholesale?: number; image_url?: string | null;
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

let _db: SQLiteDatabase | null = null;

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS sync_meta (key TEXT PRIMARY KEY, value TEXT);

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
    image_url TEXT, unit TEXT, created_at TEXT, updated_at TEXT,
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
`;

export async function getDb(): Promise<SQLiteDatabase | null> {
  if (Platform.OS === "web") return null;
  if (!_db) {
    const SQLite = await import("expo-sqlite");
    _db = await SQLite.openDatabaseAsync("erp_mobile.db");
    await _db.execAsync(SCHEMA);
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

export async function upsertRecord(
  db: SQLiteDatabase,
  tableName: string,
  record: Record<string, unknown>,
): Promise<void> {
  if (!record["sync_id"]) return;
  const existing = await db.getFirstAsync<{ _lid: number; updated_at?: string }>(
    `SELECT _lid, updated_at FROM ${tableName} WHERE sync_id = ?`,
    [record["sync_id"] as string],
  );
  if (existing) {
    const existingTs = existing.updated_at ? new Date(existing.updated_at).getTime() : 0;
    const incomingTs = record["updated_at"] ? new Date(record["updated_at"] as string).getTime() : 0;
    if (incomingTs >= existingTs) {
      const { sync_id, ...rest } = record;
      const cols = Object.keys(rest).map(k => `${k} = ?`).join(", ");
      const vals = [...Object.values(rest), existing._lid] as any[];
      await db.runAsync(`UPDATE ${tableName} SET ${cols}, _pending = 0 WHERE _lid = ?`, vals);
    }
  } else {
    const cols = Object.keys(record).join(", ");
    const placeholders = Object.keys(record).map(() => "?").join(", ");
    await db.runAsync(
      `INSERT OR IGNORE INTO ${tableName} (${cols}, _pending) VALUES (${placeholders}, 0)`,
      [...Object.values(record)] as any[],
    );
  }
}

export async function getPendingCount(db: SQLiteDatabase): Promise<number> {
  const tables = ["invoices", "invoice_items", "returns", "return_items", "clients", "products"];
  let total = 0;
  for (const t of tables) {
    const row = await db.getFirstAsync<{ cnt: number }>(
      `SELECT COUNT(*) as cnt FROM ${t} WHERE _pending = 1`,
    );
    total += row?.cnt ?? 0;
  }
  return total;
}
