/**
 * Local IndexedDB database for PWA offline support.
 * Uses Dexie.js — mirrors the cloud PostgreSQL schema (snake_case, same fields).
 * sync_id is the cross-device primary key; Dexie auto-increments _lid internally.
 */
import Dexie, { Table } from "dexie";

// ─── Row types (snake_case, matching cloud pull payload) ───────────────────

export interface LocalCategory {
  _lid?: number;       // Dexie local autoincrement key
  sync_id: string;
  id?: number | null;  // cloud postgres id (null until first sync back)
  name: string;
  created_at?: string;
  updated_at?: string;
  is_deleted?: number;
  _pending?: boolean;  // true = not yet pushed to cloud
}

export interface LocalProduct {
  _lid?: number;
  sync_id: string;
  id?: number | null;
  name: string;
  barcode?: string | null;
  category_id?: number | null;
  stock_quantity?: number;
  purchase_price?: number;
  selling_price_retail?: number;
  selling_price_half_wholesale?: number;
  selling_price_wholesale?: number;
  commission_retail?: number;
  commission_half?: number;
  commission_wholesale?: number;
  image_url?: string | null;
  unit?: string | null;
  created_at?: string;
  updated_at?: string;
  is_deleted?: number;
  _pending?: boolean;
}

export interface LocalSupplier {
  _lid?: number;
  sync_id: string;
  id?: number | null;
  name: string;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  created_at?: string;
  updated_at?: string;
  is_deleted?: number;
  _pending?: boolean;
}

export interface LocalClient {
  _lid?: number;
  sync_id: string;
  id?: number | null;
  name: string;
  phone?: string | null;
  address?: string | null;
  client_type?: string | null;
  truck_id?: number | null;
  credit_balance?: number;
  created_at?: string;
  updated_at?: string;
  is_deleted?: number;
  _pending?: boolean;
}

export interface LocalTruck {
  _lid?: number;
  sync_id: string;
  id?: number | null;
  name: string;
  plate_number?: string | null;
  phone?: string | null;
  branch_id?: number | null;
  vendeur_id?: number | null;
  driver_name?: string | null;
  password_hash?: string | null;
  location?: string | null;
  cash_balance?: number;
  latitude?: number | null;
  longitude?: number | null;
  created_at?: string;
  updated_at?: string;
  is_deleted?: number;
  _pending?: boolean;
}

export interface LocalUser {
  _lid?: number;
  sync_id: string;
  id?: number | null;
  username: string;
  password_hash?: string;
  role?: string;
  branch_id?: number | null;
  truck_id?: number | null;
  created_at?: string;
  updated_at?: string;
  is_deleted?: number;
  _pending?: boolean;
}

export interface LocalInvoice {
  _lid?: number;
  sync_id: string;
  id?: number | null;
  truck_id?: number | null;
  client_id?: number | null;
  total_amount?: number;
  paid_amount?: number;
  payment_method?: string | null;
  payment_status?: string;
  notes?: string | null;
  created_at?: string;
  updated_at?: string;
  is_deleted?: number;
  _pending?: boolean;
}

export interface LocalInvoiceItem {
  _lid?: number;
  sync_id: string;
  id?: number | null;
  invoice_id?: number | null;
  invoice_sync_id?: string | null; // for offline linking
  product_id?: number | null;
  product_name?: string | null;
  quantity?: number;
  unit_price?: number;
  discount?: number;
  subtotal?: number;
  updated_at?: string;
  _pending?: boolean;
}

export interface LocalReturn {
  _lid?: number;
  sync_id: string;
  id?: number | null;
  invoice_id?: number | null;
  truck_id?: number | null;
  total_amount?: number;
  notes?: string | null;
  created_at?: string;
  updated_at?: string;
  is_deleted?: number;
  _pending?: boolean;
}

export interface LocalReturnItem {
  _lid?: number;
  sync_id: string;
  id?: number | null;
  return_id?: number | null;
  product_id?: number | null;
  product_name?: string | null;
  quantity?: number;
  unit_price?: number;
  subtotal?: number;
  updated_at?: string;
  _pending?: boolean;
}

export interface LocalPurchase {
  _lid?: number;
  sync_id: string;
  id?: number | null;
  branch_id?: number | null;
  supplier_id?: number | null;
  total_amount?: number;
  paid_amount?: number;
  payment_status?: string;
  created_at?: string;
  updated_at?: string;
  is_deleted?: number;
  _pending?: boolean;
}

export interface LocalPurchaseItem {
  _lid?: number;
  sync_id: string;
  id?: number | null;
  purchase_id?: number | null;
  product_id?: number | null;
  quantity?: number;
  purchase_price?: number;
  subtotal?: number;
  updated_at?: string;
  _pending?: boolean;
}

export interface LocalCashTransfer {
  _lid?: number;
  sync_id: string;
  id?: number | null;
  truck_id?: number | null;
  amount?: number;
  direction?: string;
  note?: string | null;
  created_at?: string;
  updated_at?: string;
  is_deleted?: number;
  _pending?: boolean;
}

export interface LocalTruckStock {
  _lid?: number;
  sync_id: string;
  id?: number | null;
  truck_id?: number | null;
  product_id?: number | null;
  quantity?: number;
  updated_at?: string;
  _pending?: boolean;
}

export interface LocalStockTransfer {
  _lid?: number;
  sync_id: string;
  id?: number | null;
  branch_id?: number | null;
  truck_id?: number | null;
  notes?: string | null;
  created_at?: string;
  updated_at?: string;
  is_deleted?: number;
  _pending?: boolean;
}

export interface LocalStockTransferItem {
  _lid?: number;
  sync_id: string;
  id?: number | null;
  stock_transfer_id?: number | null;
  product_id?: number | null;
  quantity?: number;
  updated_at?: string;
  _pending?: boolean;
}

export interface SyncMeta {
  key: string;
  value: string;
}

// ─── Dexie database ────────────────────────────────────────────────────────

class ErpLocalDb extends Dexie {
  categories!:           Table<LocalCategory,          number>;
  products!:             Table<LocalProduct,           number>;
  suppliers!:            Table<LocalSupplier,          number>;
  clients!:              Table<LocalClient,            number>;
  trucks!:               Table<LocalTruck,             number>;
  users!:                Table<LocalUser,              number>;
  invoices!:             Table<LocalInvoice,           number>;
  invoice_items!:        Table<LocalInvoiceItem,       number>;
  returns!:              Table<LocalReturn,            number>;
  return_items!:         Table<LocalReturnItem,        number>;
  purchases!:            Table<LocalPurchase,          number>;
  purchase_items!:       Table<LocalPurchaseItem,      number>;
  cash_transfers!:       Table<LocalCashTransfer,      number>;
  truck_stock!:          Table<LocalTruckStock,        number>;
  stock_transfers!:      Table<LocalStockTransfer,     number>;
  stock_transfer_items!: Table<LocalStockTransferItem, number>;
  sync_meta!:            Table<SyncMeta,               string>;

  constructor() {
    super("erpVanSalesDb");
    this.version(1).stores({
      categories:           "++_lid, &sync_id, updated_at, is_deleted",
      products:             "++_lid, &sync_id, updated_at, is_deleted, category_id",
      suppliers:            "++_lid, &sync_id, updated_at, is_deleted",
      clients:              "++_lid, &sync_id, updated_at, is_deleted, truck_id, client_type",
      trucks:               "++_lid, &sync_id, updated_at, is_deleted",
      users:                "++_lid, &sync_id, updated_at, is_deleted",
      invoices:             "++_lid, &sync_id, updated_at, is_deleted, truck_id, client_id",
      invoice_items:        "++_lid, &sync_id, updated_at, invoice_id",
      returns:              "++_lid, &sync_id, updated_at, is_deleted, invoice_id, truck_id",
      return_items:         "++_lid, &sync_id, updated_at, return_id",
      purchases:            "++_lid, &sync_id, updated_at, is_deleted, supplier_id",
      purchase_items:       "++_lid, &sync_id, updated_at, purchase_id",
      cash_transfers:       "++_lid, &sync_id, updated_at, is_deleted, truck_id",
      truck_stock:          "++_lid, &sync_id, updated_at, truck_id, product_id",
      stock_transfers:      "++_lid, &sync_id, updated_at, is_deleted, truck_id",
      stock_transfer_items: "++_lid, &sync_id, updated_at, stock_transfer_id",
      sync_meta:            "key",
    });
  }
}

export const localDb = new ErpLocalDb();

// ─── Sync meta helpers ─────────────────────────────────────────────────────

export async function getSyncMeta(key: string): Promise<string | null> {
  const row = await localDb.sync_meta.get(key);
  return row?.value ?? null;
}

export async function setSyncMeta(key: string, value: string): Promise<void> {
  await localDb.sync_meta.put({ key, value });
}

// ─── Upsert helper (by sync_id) ────────────────────────────────────────────

export async function upsertBySyncId(
  table: Table<any, number>,
  records: any[],
): Promise<void> {
  for (const rec of records) {
    if (!rec.sync_id) continue;
    const existing = await table.where("sync_id").equals(rec.sync_id).first();
    if (existing) {
      // Only overwrite if incoming is newer (or existing has no updated_at)
      const existingTs = existing.updated_at ? new Date(existing.updated_at).getTime() : 0;
      const incomingTs = rec.updated_at   ? new Date(rec.updated_at).getTime()   : 0;
      if (incomingTs >= existingTs) {
        await table.update(existing._lid!, { ...rec, _pending: false });
      }
    } else {
      await table.add({ ...rec, _pending: false });
    }
  }
}

// ─── UUID helper ───────────────────────────────────────────────────────────

export function newSyncId(): string {
  return crypto.randomUUID ? crypto.randomUUID() : (
    "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, c => {
      const r = Math.random() * 16 | 0;
      return (c === "x" ? r : (r & 0x3 | 0x8)).toString(16);
    })
  );
}
