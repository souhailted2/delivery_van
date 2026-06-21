import type { SQLiteDatabase } from "expo-sqlite";
import { Directory, File, Paths } from "expo-file-system";
import { API_URL, getActiveApiUrl } from "./api";
import { getDb, getSyncMeta, setSyncMeta, upsertRecord, getPendingCount, resetSyncMeta, TABLES_WITH_SOFT_DELETE } from "./db";
import { newSyncId } from "./uuid";

const PULL_TABLES = [
  "branches", "categories", "products", "suppliers", "clients", "trucks", "users",
  "truck_stock", "purchases", "purchase_items",
  "invoices", "invoice_items", "returns", "return_items",
  "cash_transfers", "client_payments", "stock_transfers", "stock_transfer_items",
];
// Tables the mobile device can create/modify and push back to the cloud.
// Read-only on mobile (admin-only): users, suppliers, purchases, purchase_items, truck_stock.
const PUSH_TABLES = [
  "categories", "products", "clients",
  "invoices", "invoice_items",
  "returns", "return_items",
  "cash_transfers", "client_payments",
  "stock_transfers", "stock_transfer_items",
];

async function getDeviceId(db: SQLiteDatabase): Promise<string> {
  let id = await getSyncMeta(db, "device_id");
  if (!id) {
    id = "mobile-" + newSyncId();
    await setSyncMeta(db, "device_id", id);
  }
  return id;
}

// P0-2: wipe every syncable table, reset cursors, and adopt a new sync epoch.
// Triggered when the cloud's sync epoch changes (e.g. after a factory reset) so a
// stale device starts clean and re-pulls instead of re-pushing rows the cloud
// deleted (which would resurrect them). Pending local changes are intentionally
// discarded — the cloud was reset, so they are no longer valid.
async function wipeAndAdoptEpoch(db: SQLiteDatabase, newEpoch: unknown): Promise<void> {
  for (const t of PULL_TABLES) {
    try { await db.runAsync(`DELETE FROM ${t}`); } catch {}
  }
  await setSyncMeta(db, "last_pull_at", "1970-01-01T00:00:00.000Z");
  await setSyncMeta(db, "sync_epoch", String(newEpoch));
}

export async function pullSync(
  cookie: string,
  options?: {
    since?: string;
    apiUrl?: string;
    onProgress?: (tableName: string, count: number) => void;
  },
): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const baseUrl = options?.apiUrl ?? (await getActiveApiUrl());
  const since =
    options?.since ??
    (await getSyncMeta(db, "last_pull_at")) ??
    "1970-01-01T00:00:00.000Z";
  const res = await fetch(
    `${baseUrl}/api/sync/v2/pull?since=${encodeURIComponent(since)}`,
    { headers: { Cookie: `connect.sid=${cookie}` } },
  );
  if (!res.ok) throw new Error(`Pull ${res.status}`);
  const payload = await res.json();
  const tables = payload.tables as Record<string, unknown[]>;
  // authoritativeTables: tables where the server sent the FULL set (not an incremental delta).
  // For these tables we prune any local committed row whose sync_id wasn't in the response,
  // which handles reassignment (e.g. a client moved from this truck to another).
  const authoritativeTables: string[] = Array.isArray(payload.authoritativeTables)
    ? payload.authoritativeTables
    : [];

  // P0-2: if the cloud's sync epoch changed (destructive reset), wipe local and
  // re-pull clean BEFORE applying anything — stale rows can never be re-pushed.
  const serverEpoch = payload.epoch;
  if (serverEpoch != null) {
    const storedEpoch = await getSyncMeta(db, "sync_epoch");
    if (storedEpoch != null && String(serverEpoch) !== String(storedEpoch)) {
      await wipeAndAdoptEpoch(db, serverEpoch);
      return; // next pull re-fills from a clean state under the new epoch
    }
    if (storedEpoch == null) await setSyncMeta(db, "sync_epoch", String(serverEpoch));
  }

  for (const [tableName, records] of Object.entries(tables)) {
    if (!PULL_TABLES.includes(tableName) || !Array.isArray(records)) continue;
    for (const rec of records) {
      await upsertRecord(db, tableName, rec as Record<string, unknown>);
    }
    if (options?.onProgress) {
      options.onProgress(tableName, records.length);
    }
    // Prune stale local rows for authoritative tables.
    // The server's response is the complete set — any local committed row
    // (pending=0) not in it has been reassigned/removed and should be pruned.
    // • Tables WITH is_deleted: soft-delete (set is_deleted=1) so foreign-key
    //   references remain intact and the app doesn't crash on stale joins.
    // • Tables WITHOUT is_deleted (e.g. truck_stock): hard-delete the missing rows
    //   since they are server-managed and have no FK dependents on mobile.
    // Wrapped in try/catch so one table failure never aborts the whole pull.
    if (authoritativeTables.includes(tableName)) {
      try {
        const receivedIds = records
          .map((r) => (r as Record<string, unknown>).sync_id as string)
          .filter(Boolean);
        const hasSoftDelete = TABLES_WITH_SOFT_DELETE.has(tableName);

        if (receivedIds.length > 0) {
          const placeholders = receivedIds.map(() => "?").join(", ");
          if (hasSoftDelete) {
            await db.runAsync(
              `UPDATE ${tableName} SET is_deleted = 1 WHERE is_deleted = 0 AND _pending = 0 AND sync_id NOT IN (${placeholders})`,
              receivedIds,
            );
          } else {
            await db.runAsync(
              `DELETE FROM ${tableName} WHERE _pending = 0 AND sync_id NOT IN (${placeholders})`,
              receivedIds,
            );
          }
        }
        // NOTE: an EMPTY authoritative set is intentionally NOT pruned. An empty
        // set is ambiguous — it can mean the cloud genuinely has zero rows, OR
        // that the server's per-table query failed and was swallowed to [].
        // Pruning on empty previously wiped the device's entire customer / truck
        // -stock list on a single transient error (reproduced P0-3). Leaving
        // stale rows is harmless and self-corrects on the next non-empty pull.
      } catch {
        // Prune failure is non-fatal — stale rows will be pruned on the next pull
      }
    }
  }
  await setSyncMeta(db, "last_pull_at", new Date().toISOString());
  preCacheImages(db, cookie).catch(() => {});
}

// Upload images for products that were created offline with a local image URI.
// Runs before the main push so the server-side imageUrl is in place before the record is synced.
async function uploadPendingProductImages(db: SQLiteDatabase, cookie: string): Promise<void> {
  const pending = await db.getAllAsync<{ sync_id: string; local_image_uri: string }>(
    "SELECT sync_id, local_image_uri FROM products WHERE _pending = 1 AND local_image_uri IS NOT NULL AND local_image_uri != '' AND (image_url IS NULL OR image_url = '')"
  );
  for (const { sync_id, local_image_uri } of pending) {
    try {
      const formData = new FormData();
      formData.append("file", { uri: local_image_uri, type: "image/jpeg", name: "product.jpg" } as any);
      const uploadUrl = await getActiveApiUrl();
      const res = await fetch(`${uploadUrl}/api/products/upload-image`, {
        method: "POST",
        headers: { Cookie: `connect.sid=${cookie}` },
        body: formData,
      });
      if (res.ok) {
        const { imageUrl } = await res.json() as { imageUrl: string };
        await db.runAsync(
          "UPDATE products SET image_url = ?, local_image_uri = NULL WHERE sync_id = ?",
          [imageUrl, sync_id]
        );
      }
    } catch {}
  }
}



export async function pushSync(cookie: string): Promise<void> {
  const db = await getDb();
  if (!db) return;

  // Upload any offline-created product images first.
  // Products whose upload fails keep local_image_uri set, so they are excluded from push below
  // and will be retried on the next sync cycle.
  await uploadPendingProductImages(db, cookie);

  const tables: Record<string, unknown[]> = {};
  for (const t of PUSH_TABLES) {
    let query: string;
    if (t === "products") {
      // Exclude products that still have a pending local image (upload failed or network is down)
      query = "SELECT * FROM products WHERE _pending = 1 AND (local_image_uri IS NULL OR local_image_uri = '' OR (image_url IS NOT NULL AND image_url != ''))";
    } else {
      query = `SELECT * FROM ${t} WHERE _pending = 1`;
    }
    const rows = await db.getAllAsync<Record<string, unknown>>(query);
    if (rows.length > 0) {
      // Strip local-only fields before sending to server
      tables[t] = rows.map(({ _lid, _pending, local_image_uri, ...rest }) => rest);
    }
  }
  if (!Object.keys(tables).length) return;
  const deviceId = await getDeviceId(db);
  const pushUrl = await getActiveApiUrl();
  const res = await fetch(`${pushUrl}/api/sync/v2/push`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: `connect.sid=${cookie}` },
    body: JSON.stringify({ deviceId, tables, epoch: await getSyncMeta(db, "sync_epoch") }),
  });
  // P0-2: the cloud rejects a stale-epoch push (it would resurrect deleted rows).
  // Wipe + adopt the new epoch; the next pull re-fills from a clean state.
  if (res.status === 409) {
    const body = (await res.json().catch(() => ({}))) as { resetRequired?: boolean; epoch?: unknown };
    if (body?.resetRequired) { await wipeAndAdoptEpoch(db, body.epoch); return; }
  }
  if (!res.ok) throw new Error(`Push ${res.status}`);

  // Read per-row results: a row the cloud REJECTED (e.g. an unresolved FK whose
  // parent will sync later) must keep _pending = 1 so it is RETRIED, not
  // silently marked synced and dropped (reproduced P0-1). The server returns
  // { results: { [table]: { errors: [{ sync_id }] } } }.
  const body = await res.json().catch(() => ({} as Record<string, unknown>));
  const results = ((body as Record<string, unknown>)?.results || {}) as Record<
    string,
    { errors?: Array<{ sync_id?: string }> }
  >;

  // Clear _pending only for rows that were actually pushed AND not rejected.
  for (const t of PUSH_TABLES) {
    const rejected = (results[t]?.errors || [])
      .map((e) => e.sync_id)
      .filter((id): id is string => !!id);
    const keepRejected = rejected.length
      ? ` AND sync_id NOT IN (${rejected.map(() => "?").join(", ")})`
      : "";
    if (t === "products") {
      await db.runAsync(
        `UPDATE products SET _pending = 0 WHERE _pending = 1 AND (local_image_uri IS NULL OR local_image_uri = '' OR (image_url IS NOT NULL AND image_url != ''))${keepRejected}`,
        rejected,
      );
    } else {
      await db.runAsync(`UPDATE ${t} SET _pending = 0 WHERE _pending = 1${keepRejected}`, rejected);
    }
  }
}

async function preCacheImages(db: SQLiteDatabase, cookie: string): Promise<void> {
  try {
    const rows = await db.getAllAsync<{ image_url: string }>(
      "SELECT image_url FROM products WHERE image_url IS NOT NULL AND image_url != '' AND is_deleted = 0 LIMIT 200",
    );
    const cacheDir = new Directory(Paths.cache, "product_images");
    if (!cacheDir.exists) cacheDir.create();
    for (const { image_url } of rows) {
      try {
        const filename = image_url.replace(/[^a-zA-Z0-9._-]/g, "_");
        const localFile = new File(cacheDir, filename);
        if (!localFile.exists) {
          const cacheBase = await getActiveApiUrl();
          const fullUrl = image_url.startsWith("http") ? image_url : `${cacheBase}${image_url}`;
          // NOTE: `File.downloadFileAsync` (static) is the correct API in
          // expo-file-system 19.x — see the File class in
          // ExpoFileSystem.types.d.ts. There is NO instance `localFile.downloadAsync`
          // on the new File class; the only `downloadAsync` is the DEPRECATED
          // legacy function that throws at runtime. Do not "migrate" to it.
          // `idempotent: true` overwrites instead of throwing if the file
          // appears between the exists check and the download (concurrent pulls).
          await File.downloadFileAsync(fullUrl, localFile, {
            headers: { Cookie: `connect.sid=${cookie}` },
            idempotent: true,
          });
        }
      } catch {}
    }
  } catch {}
}

export async function resetSync(cookie: string): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await resetSyncMeta(db);
  await pullSync(cookie);
}

export async function syncNow(cookie: string): Promise<{ pending: number }> {
  await pullSync(cookie);
  await pushSync(cookie);
  const db = await getDb();
  const pending = db ? await getPendingCount(db) : 0;
  return { pending };
}

export function getLocalImagePath(imageUrl: string | null | undefined): string | null {
  if (!imageUrl) return null;
  const filename = imageUrl.replace(/[^a-zA-Z0-9._-]/g, "_");
  const cacheDir = new Directory(Paths.cache, "product_images");
  const localFile = new File(cacheDir, filename);
  return localFile.uri;
}
