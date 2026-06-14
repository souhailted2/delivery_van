/**
 * PWA Sync Engine — browser-side bidirectional sync.
 * Mirrors desktop/server/sync-engine.js but runs in the browser via fetch.
 * Pull: GET /api/sync/v2/pull → upsert into Dexie
 * Push: collect _pending=true rows → POST /api/sync/v2/push
 */
import { localDb, getSyncMeta, setSyncMeta, upsertBySyncId } from "./local-db";

const SYNC_INTERVAL = 30_000; // 30 s
const PUSH_TABLES = [
  "categories", "suppliers", "clients", "trucks", "products",
  "purchases", "purchase_items",
  "invoices", "invoice_items",
  "returns", "return_items",
  "cash_transfers", "truck_stock",
  "stock_transfers", "stock_transfer_items",
] as const;

type TableName = typeof PUSH_TABLES[number];

// ─── State ────────────────────────────────────────────────────────────────

export interface SyncState {
  online: boolean;
  syncing: boolean;
  lastSync: string | null;
  error: string | null;
  pending: number;
}

let _state: SyncState = {
  online: navigator.onLine,
  syncing: false,
  lastSync: null,
  error: null,
  pending: 0,
};

const _listeners = new Set<(s: SyncState) => void>();

function emit(update: Partial<SyncState>) {
  _state = { ..._state, ...update };
  for (const fn of _listeners) {
    try { fn({ ..._state }); } catch {}
  }
}

export function onSyncState(fn: (s: SyncState) => void): () => void {
  _listeners.add(fn);
  fn({ ..._state });
  return () => _listeners.delete(fn);
}

export function getSyncState(): SyncState { return { ..._state }; }

// ─── Online detection ─────────────────────────────────────────────────────

window.addEventListener("online",  () => { emit({ online: true  }); scheduleSync(1000); });
window.addEventListener("offline", () => { emit({ online: false }); });

// ─── Count pending ────────────────────────────────────────────────────────

async function countPending(): Promise<number> {
  let total = 0;
  for (const tbl of PUSH_TABLES) {
    try {
      const t = localDb[tbl as keyof typeof localDb] as any;
      total += await t.where("_pending").equals(1).count();
    } catch {}
  }
  return total;
}

// ─── PULL ─────────────────────────────────────────────────────────────────

async function pull(): Promise<void> {
  const since = await getSyncMeta("last_pull_at") || "1970-01-01T00:00:00.000Z";
  const res = await fetch(`/api/sync/v2/pull?since=${encodeURIComponent(since)}`, {
    credentials: "include",
  });
  if (!res.ok) throw new Error(`Pull failed: HTTP ${res.status}`);
  const { tables } = await res.json();

  const tableMap: Record<string, any> = {
    categories:           localDb.categories,
    products:             localDb.products,
    suppliers:            localDb.suppliers,
    clients:              localDb.clients,
    trucks:               localDb.trucks,
    users:                localDb.users,
    purchases:            localDb.purchases,
    purchase_items:       localDb.purchase_items,
    invoices:             localDb.invoices,
    invoice_items:        localDb.invoice_items,
    returns:              localDb.returns,
    return_items:         localDb.return_items,
    cash_transfers:       localDb.cash_transfers,
    truck_stock:          localDb.truck_stock,
    stock_transfers:      localDb.stock_transfers,
    stock_transfer_items: localDb.stock_transfer_items,
  };

  for (const [name, records] of Object.entries(tables as Record<string, any[]>)) {
    if (!Array.isArray(records) || !tableMap[name]) continue;
    await upsertBySyncId(tableMap[name], records);
  }

  await setSyncMeta("last_pull_at", new Date().toISOString());

  // Pre-cache product images in background so they're available offline.
  // fire-and-forget: SW's cacheFirstImages intercepts each fetch and stores
  // in IMAGE_CACHE (erp-v4-images). CacheFirst means already-cached images
  // are returned instantly with zero network cost.
  preCacheImages();
}

function preCacheImages(): void {
  localDb.products
    .filter(p => !p.is_deleted && !!p.image_url)
    .toArray()
    .then(products => {
      for (const p of products) {
        if (p.image_url) {
          fetch(p.image_url, { credentials: "include" }).catch(() => {});
        }
      }
    })
    .catch(() => {});
}

// ─── PUSH ─────────────────────────────────────────────────────────────────

async function push(): Promise<void> {
  const tables: Record<string, any[]> = {};

  for (const tbl of PUSH_TABLES) {
    const t = localDb[tbl as keyof typeof localDb] as any;
    const pending = await t.filter((r: any) => r._pending === true).toArray();
    if (pending.length) {
      // Strip Dexie-local fields before sending
      tables[tbl] = pending.map(({ _lid, _pending, ...rest }: any) => rest);
    }
  }

  if (!Object.keys(tables).length) return;

  const res = await fetch("/api/sync/v2/push", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ deviceId: await getDeviceId(), tables }),
  });

  if (!res.ok) throw new Error(`Push failed: HTTP ${res.status}`);

  // Mark all pushed records as synced
  for (const tbl of PUSH_TABLES) {
    const t = localDb[tbl as keyof typeof localDb] as any;
    await t.filter((r: any) => r._pending === true).modify({ _pending: false });
  }
}

// ─── Device ID ────────────────────────────────────────────────────────────

async function getDeviceId(): Promise<string> {
  let id = await getSyncMeta("device_id");
  if (!id) {
    id = "pwa-" + (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36));
    await setSyncMeta("device_id", id);
  }
  return id;
}

// ─── Main sync cycle ──────────────────────────────────────────────────────

let _syncing = false;

export async function syncOnce(): Promise<void> {
  if (_syncing) return;
  if (!navigator.onLine) { emit({ online: false }); return; }
  _syncing = true;
  emit({ syncing: true, error: null });

  try {
    emit({ online: true });
    await pull();
    await push();
    const pending = await countPending();
    emit({
      syncing: false,
      lastSync: new Date().toISOString(),
      error: null,
      pending,
    });
  } catch (err: any) {
    emit({ syncing: false, error: err?.message || "خطأ في المزامنة" });
  } finally {
    _syncing = false;
  }
}

// ─── Reset ────────────────────────────────────────────────────────────────

export async function resetSync(): Promise<void> {
  await setSyncMeta("last_pull_at", "1970-01-01T00:00:00.000Z");
  await setSyncMeta("last_push_at", "1970-01-01T00:00:00.000Z");
  // Clear all local tables (will be repopulated on next pull)
  // Clear tables in separate calls (Dexie transaction() supports max 6 tables inline)
  await Promise.all([
    localDb.categories.clear(), localDb.products.clear(), localDb.suppliers.clear(),
    localDb.clients.clear(), localDb.trucks.clear(), localDb.users.clear(),
    localDb.purchases.clear(), localDb.purchase_items.clear(),
    localDb.invoices.clear(), localDb.invoice_items.clear(),
    localDb.returns.clear(), localDb.return_items.clear(),
    localDb.cash_transfers.clear(), localDb.truck_stock.clear(),
    localDb.stock_transfers.clear(), localDb.stock_transfer_items.clear(),
  ]);
}

// ─── Lifecycle ────────────────────────────────────────────────────────────

let _timer: ReturnType<typeof setInterval> | null = null;

export function startSync(): void {
  stopSync();
  // First sync after 2s
  setTimeout(() => syncOnce(), 2_000);
  // Then every 30s
  _timer = setInterval(() => syncOnce(), SYNC_INTERVAL);
}

export function stopSync(): void {
  if (_timer) { clearInterval(_timer); _timer = null; }
}

let _pendingTimer: ReturnType<typeof setTimeout> | null = null;
export function scheduleSync(delayMs = 0): void {
  if (_pendingTimer) clearTimeout(_pendingTimer);
  _pendingTimer = setTimeout(() => syncOnce(), delayMs);
}
