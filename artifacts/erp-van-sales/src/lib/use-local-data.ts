/**
 * Offline-first data hooks — read from Dexie (IndexedDB).
 * Uses dexie-react-hooks useLiveQuery for reactive updates.
 * Falls back to [] when DB is empty (will populate after first sync).
 */
import { useLiveQuery } from "dexie-react-hooks";
import {
  localDb, newSyncId,
  LocalProduct, LocalClient, LocalCategory,
  LocalInvoice, LocalInvoiceItem, LocalReturn, LocalReturnItem,
} from "./local-db";
import { scheduleSync } from "./pwa-sync";

// ─── Categories ───────────────────────────────────────────────────────────

export function useLocalCategories() {
  return useLiveQuery(
    () => localDb.categories.filter(r => !r.is_deleted).toArray(),
    [], []
  );
}

// ─── Products ─────────────────────────────────────────────────────────────

export function useLocalProducts() {
  return useLiveQuery(
    () => localDb.products.filter(r => !r.is_deleted).toArray(),
    [], []
  );
}

export function useLocalProduct(syncId: string | undefined) {
  return useLiveQuery(
    () => syncId ? localDb.products.where("sync_id").equals(syncId).first() : Promise.resolve(undefined),
    [syncId]
  );
}

// ─── Suppliers ────────────────────────────────────────────────────────────

export function useLocalSuppliers() {
  return useLiveQuery(
    () => localDb.suppliers.filter(r => !r.is_deleted).toArray(),
    [], []
  );
}

// ─── Clients ──────────────────────────────────────────────────────────────

export function useLocalClients() {
  return useLiveQuery(
    () => localDb.clients.filter(r => !r.is_deleted).toArray(),
    [], []
  );
}

// ─── Trucks ───────────────────────────────────────────────────────────────

export function useLocalTrucks() {
  return useLiveQuery(
    () => localDb.trucks.filter(r => !r.is_deleted).toArray(),
    [], []
  );
}

// ─── Truck stock ──────────────────────────────────────────────────────────

export function useLocalTruckStock(truckId?: number | null) {
  return useLiveQuery(
    () => truckId != null
      ? localDb.truck_stock.where("truck_id").equals(truckId).toArray()
      : localDb.truck_stock.toArray(),
    [truckId], []
  );
}

// ─── Invoices ─────────────────────────────────────────────────────────────

export function useLocalInvoices(truckId?: number | null) {
  return useLiveQuery(
    () => truckId != null
      ? localDb.invoices.where("truck_id").equals(truckId).filter(r => !r.is_deleted).toArray()
      : localDb.invoices.filter(r => !r.is_deleted).toArray(),
    [truckId], []
  );
}

export function useLocalInvoiceItems(invoiceId?: number | null) {
  return useLiveQuery(
    async () => {
      if (invoiceId == null) return [] as LocalInvoiceItem[];
      return localDb.invoice_items.where("invoice_id").equals(invoiceId).toArray();
    },
    [invoiceId], [] as LocalInvoiceItem[]
  );
}

// ─── Returns ──────────────────────────────────────────────────────────────

export function useLocalReturns(truckId?: number | null) {
  return useLiveQuery(
    () => truckId != null
      ? localDb.returns.where("truck_id").equals(truckId).filter(r => !r.is_deleted).toArray()
      : localDb.returns.filter(r => !r.is_deleted).toArray(),
    [truckId], []
  );
}

// ─── Cash transfers ───────────────────────────────────────────────────────

export function useLocalCashTransfers(truckId?: number | null) {
  return useLiveQuery(
    () => truckId != null
      ? localDb.cash_transfers.where("truck_id").equals(truckId).filter(r => !r.is_deleted).toArray()
      : localDb.cash_transfers.filter(r => !r.is_deleted).toArray(),
    [truckId], []
  );
}

// ─── Purchases ────────────────────────────────────────────────────────────

export function useLocalPurchases() {
  return useLiveQuery(
    () => localDb.purchases.filter(r => !r.is_deleted).toArray(),
    [], []
  );
}

// ─── Pending count ────────────────────────────────────────────────────────

export function useLocalPendingCount() {
  return useLiveQuery(async () => {
    const tables = [
      localDb.invoices, localDb.invoice_items, localDb.returns, localDb.return_items,
      localDb.clients, localDb.products, localDb.categories,
    ];
    let total = 0;
    for (const t of tables) {
      total += await (t as any).filter((r: any) => r._pending === true).count();
    }
    return total;
  }, [], 0);
}

// ─── Write helpers (offline-safe) ─────────────────────────────────────────

// ── Products ──────────────────────────────────────────────────────────────

export async function createLocalProduct(
  data: Omit<LocalProduct, "_lid" | "sync_id" | "_pending">,
): Promise<string> {
  const syncId = newSyncId();
  const now = new Date().toISOString();
  await localDb.products.add({
    ...data,
    sync_id: syncId,
    created_at: now,
    updated_at: now,
    is_deleted: 0,
    _pending: true,
  });
  scheduleSync(500);
  return syncId;
}

export async function updateLocalProduct(
  syncId: string,
  data: Partial<Omit<LocalProduct, "_lid" | "sync_id">>,
): Promise<void> {
  const now = new Date().toISOString();
  const existing = await localDb.products.where("sync_id").equals(syncId).first();
  if (existing?._lid != null) {
    await localDb.products.update(existing._lid, { ...data, updated_at: now, _pending: true });
  }
  scheduleSync(500);
}

// ── Clients ───────────────────────────────────────────────────────────────

export async function createLocalClient(
  data: Omit<LocalClient, "_lid" | "sync_id" | "_pending">,
): Promise<string> {
  const syncId = newSyncId();
  const now = new Date().toISOString();
  await localDb.clients.add({
    ...data,
    sync_id: syncId,
    created_at: now,
    updated_at: now,
    is_deleted: 0,
    _pending: true,
  });
  scheduleSync(500);
  return syncId;
}

export async function updateLocalClient(
  syncId: string,
  data: Partial<Omit<LocalClient, "_lid" | "sync_id">>,
): Promise<void> {
  const now = new Date().toISOString();
  const existing = await localDb.clients.where("sync_id").equals(syncId).first();
  if (existing?._lid != null) {
    await localDb.clients.update(existing._lid, { ...data, updated_at: now, _pending: true });
  }
  scheduleSync(500);
}

// ── Categories ────────────────────────────────────────────────────────────

export async function createLocalCategory(
  data: Omit<LocalCategory, "_lid" | "sync_id" | "_pending">,
): Promise<string> {
  const syncId = newSyncId();
  const now = new Date().toISOString();
  await localDb.categories.add({
    ...data,
    sync_id: syncId,
    created_at: now,
    updated_at: now,
    is_deleted: 0,
    _pending: true,
  });
  scheduleSync(500);
  return syncId;
}

export async function updateLocalCategory(
  syncId: string,
  data: Partial<Omit<LocalCategory, "_lid" | "sync_id">>,
): Promise<void> {
  const now = new Date().toISOString();
  const existing = await localDb.categories.where("sync_id").equals(syncId).first();
  if (existing?._lid != null) {
    await localDb.categories.update(existing._lid, { ...data, updated_at: now, _pending: true });
  }
  scheduleSync(500);
}

// ── Invoices ──────────────────────────────────────────────────────────────

export async function createLocalInvoice(
  invoice: Omit<LocalInvoice, "_lid" | "sync_id" | "_pending">,
  items: Omit<LocalInvoiceItem, "_lid" | "sync_id" | "_pending" | "invoice_id">[],
): Promise<string> {
  const syncId = newSyncId();
  const now = new Date().toISOString();

  await localDb.transaction("rw", localDb.invoices, localDb.invoice_items, async () => {
    await localDb.invoices.add({
      ...invoice,
      sync_id: syncId,
      created_at: now,
      updated_at: now,
      _pending: true,
    });
    for (const item of items) {
      await localDb.invoice_items.add({
        ...item,
        sync_id: newSyncId(),
        invoice_sync_id: syncId,
        updated_at: now,
        _pending: true,
      });
    }
  });

  scheduleSync(500);
  return syncId;
}

export async function createLocalReturn(
  ret: Omit<LocalReturn, "_lid" | "sync_id" | "_pending">,
  items: Omit<LocalReturnItem, "_lid" | "sync_id" | "_pending" | "return_id">[],
): Promise<string> {
  const syncId = newSyncId();
  const now = new Date().toISOString();

  await localDb.transaction("rw", localDb.returns, localDb.return_items, async () => {
    await localDb.returns.add({
      ...ret,
      sync_id: syncId,
      created_at: now,
      updated_at: now,
      _pending: true,
    });
    for (const item of items) {
      await localDb.return_items.add({
        ...item,
        sync_id: newSyncId(),
        updated_at: now,
        _pending: true,
      });
    }
  });

  scheduleSync(500);
  return syncId;
}
