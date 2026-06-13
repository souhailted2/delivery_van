import type { SQLiteDatabase } from "expo-sqlite";
import { newSyncId } from "./uuid";

/**
 * Safely mutate truck_stock for a (truckId, productId) pair, collapsing any
 * duplicate rows created by prior sync pull conflicts.
 *
 * - delta < 0 : decrement (sale)
 * - delta > 0 : increment (return / warehouse transfer)
 * - opts.absolute : set to an exact value (dispatch receive)
 *
 * truck_stock is server-authoritative: it is pulled (PULL_TABLES) but never
 * pushed (PUSH_TABLES excludes it). The server reconciles the real quantity
 * after the parent business record (invoice / return / transfer) is pushed.
 * These writes are therefore OPTIMISTIC only and MUST keep `_pending = 0`:
 *   1. `_pending = 1` does nothing for upload (truck_stock isn't pushed), and
 *   2. the authoritative pull only prunes rows with `_pending = 0`
 *      (DELETE ... WHERE _pending = 0 AND sync_id NOT IN (received)), so a
 *      `_pending = 1` synthetic/duplicate row would survive forever and be
 *      double-counted. Keeping `_pending = 0` lets the next pull prune stale
 *      duplicates and reconcile the canonical row. The bumped `updated_at`
 *      protects the optimistic value via last-write-wins until the server
 *      sends a newer authoritative quantity.
 */
export async function canonicalizeTruckStock(
  db: SQLiteDatabase,
  truckId: number,
  productId: number,
  delta: number,
  now: string,
  opts?: { absolute?: number }
): Promise<void> {
  // Prefer a server-backed row (id IS NOT NULL) as the canonical one. The next
  // authoritative pull keeps rows whose sync_id it sent and prunes the rest, so
  // collapsing the quantity onto a synthetic local row (id NULL) would lose it
  // on the following pull. Fall back to the oldest _lid when no server row exists.
  const rows = await db.getAllAsync<{ _lid: number; quantity: number }>(
    "SELECT _lid, quantity FROM truck_stock WHERE truck_id = ? AND product_id = ? ORDER BY CASE WHEN id IS NOT NULL THEN 0 ELSE 1 END, _lid ASC",
    [truckId, productId]
  );

  const total = rows.reduce((s, r) => s + Number(r.quantity ?? 0), 0);
  const newQty =
    opts?.absolute !== undefined ? opts.absolute : Math.max(0, total + delta);

  if (rows.length === 0) {
    // No local row yet. Only materialize an optimistic row when there's a
    // positive quantity to show; a synthetic local sync_id with _pending = 0
    // gets pruned by the next authoritative pull once the real server row lands.
    if (newQty > 0) {
      await db.runAsync(
        "INSERT INTO truck_stock (sync_id, truck_id, product_id, quantity, updated_at, _pending) VALUES (?, ?, ?, ?, ?, 0)",
        [newSyncId(), truckId, productId, newQty, now]
      );
    }
    return;
  }

  // Collapse duplicates: put the full quantity on the canonical (oldest) row.
  await db.runAsync(
    "UPDATE truck_stock SET quantity = ?, updated_at = ?, _pending = 0 WHERE _lid = ?",
    [newQty, now, rows[0]._lid]
  );

  // Zero the duplicate rows (kept at _pending = 0 so the authoritative pull
  // prunes the synthetic ones and reconciles any real one).
  if (rows.length > 1) {
    for (const row of rows.slice(1)) {
      await db.runAsync(
        "UPDATE truck_stock SET quantity = 0, updated_at = ?, _pending = 0 WHERE _lid = ?",
        [now, row._lid]
      );
    }
  }
}
