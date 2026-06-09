import type { SQLiteDatabase } from "expo-sqlite";
import { Directory, File, Paths } from "expo-file-system";
import { API_URL } from "./api";
import { getDb, getSyncMeta, setSyncMeta, upsertRecord, getPendingCount, resetSyncMeta } from "./db";
import { newSyncId } from "./uuid";

const PULL_TABLES = [
  "categories", "products", "suppliers", "clients", "trucks", "users",
  "truck_stock", "purchases", "purchase_items",
  "invoices", "invoice_items", "returns", "return_items",
  "cash_transfers", "stock_transfers", "stock_transfer_items",
];
// Tables the mobile device can create/modify and push back to the cloud.
// Read-only on mobile (admin-only): users, suppliers, purchases, purchase_items, truck_stock.
const PUSH_TABLES = [
  "categories", "products", "clients",
  "invoices", "invoice_items",
  "returns", "return_items",
  "cash_transfers",
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

export async function pullSync(cookie: string): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const since = await getSyncMeta(db, "last_pull_at") ?? "1970-01-01T00:00:00.000Z";
  const res = await fetch(
    `${API_URL}/api/sync/v2/pull?since=${encodeURIComponent(since)}`,
    { headers: { Cookie: `connect.sid=${cookie}` } },
  );
  if (!res.ok) throw new Error(`Pull ${res.status}`);
  const { tables } = await res.json();
  for (const [tableName, records] of Object.entries(tables as Record<string, unknown[]>)) {
    if (!PULL_TABLES.includes(tableName) || !Array.isArray(records)) continue;
    for (const rec of records) {
      await upsertRecord(db, tableName, rec as Record<string, unknown>);
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
      const res = await fetch(`${API_URL}/api/products/upload-image`, {
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
  const res = await fetch(`${API_URL}/api/sync/v2/push`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: `connect.sid=${cookie}` },
    body: JSON.stringify({ deviceId, tables }),
  });
  if (!res.ok) throw new Error(`Push ${res.status}`);

  // Clear _pending only for the rows that were actually pushed
  for (const t of PUSH_TABLES) {
    if (t === "products") {
      await db.runAsync(
        "UPDATE products SET _pending = 0 WHERE _pending = 1 AND (local_image_uri IS NULL OR local_image_uri = '' OR (image_url IS NOT NULL AND image_url != ''))"
      );
    } else {
      await db.runAsync(`UPDATE ${t} SET _pending = 0 WHERE _pending = 1`);
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
          const fullUrl = image_url.startsWith("http") ? image_url : `${API_URL}${image_url}`;
          await File.downloadFileAsync(fullUrl, localFile, {
            headers: { Cookie: `connect.sid=${cookie}` },
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
