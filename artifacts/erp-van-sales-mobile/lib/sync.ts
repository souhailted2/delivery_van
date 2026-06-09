import type { SQLiteDatabase } from "expo-sqlite";
import { API_URL } from "./api";
import { getDb, getSyncMeta, setSyncMeta, upsertRecord, getPendingCount } from "./db";
import { newSyncId } from "./uuid";

const PULL_TABLES = [
  "categories", "products", "clients", "trucks", "truck_stock",
  "invoices", "invoice_items", "returns", "return_items",
];
const PUSH_TABLES = [
  "categories", "clients", "invoices", "invoice_items", "returns", "return_items",
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
}

export async function pushSync(cookie: string): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const tables: Record<string, unknown[]> = {};
  for (const t of PUSH_TABLES) {
    const rows = await db.getAllAsync<Record<string, unknown>>(
      `SELECT * FROM ${t} WHERE _pending = 1`,
    );
    if (rows.length > 0) {
      tables[t] = rows.map(({ _lid, _pending, ...rest }) => rest);
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
  for (const t of PUSH_TABLES) {
    await db.runAsync(`UPDATE ${t} SET _pending = 0 WHERE _pending = 1`);
  }
}

export async function syncNow(cookie: string): Promise<{ pending: number }> {
  await pullSync(cookie);
  await pushSync(cookie);
  const db = await getDb();
  const pending = db ? await getPendingCount(db) : 0;
  return { pending };
}
