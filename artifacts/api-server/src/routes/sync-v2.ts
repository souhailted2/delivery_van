/**
 * Bidirectional sync v2 endpoints for desktop ↔ cloud sync.
 *
 * GET  /api/sync/v2/pull?since=ISO  — return all records changed after `since`
 * POST /api/sync/v2/push            — upsert records sent from desktop by sync_id
 */

import { Router } from "express";
import { db } from "@workspace/db";
import {
  categoriesTable, productsTable, suppliersTable, clientsTable,
  trucksTable, usersTable, purchasesTable, purchaseItemsTable,
  invoicesTable, invoiceItemsTable, returnsTable, returnItemsTable,
  cashTransfersTable, truckStockTable, stockTransfersTable, stockTransferItemsTable,
} from "@workspace/db";
import { gt, or, isNull, sql } from "drizzle-orm";

const router = Router();

// Require auth for all sync routes — accept both user sessions and truck sessions
function requireAuth(req: any, res: any, next: any) {
  if (!req.session?.userId && !req.session?.truckId) {
    return res.status(401).json({ error: "Non authentifié" });
  }
  next();
}

// Tables a truck session may pull (operational data only).
// Excluded from truck pull: users (contains auth data), suppliers, purchases, purchase_items.
const TRUCK_PULL_ALLOWLIST = new Set([
  "categories", "products", "clients", "trucks",
  "truck_stock",
  "invoices", "invoice_items",
  "returns", "return_items",
  "cash_transfers",
  "stock_transfers", "stock_transfer_items",
]);

// Tables a truck session is allowed to push (operational data only).
// Admin-only tables (users, suppliers, purchases, purchase_items, truck_stock) are excluded.
const TRUCK_PUSH_ALLOWLIST = new Set([
  "categories", "clients",
  "invoices", "invoice_items",
  "returns", "return_items",
  "cash_transfers",
  "stock_transfers", "stock_transfer_items",
]);

// Columns to strip from rows before sending to any client (sensitive auth fields)
const COLUMN_STRIP: Record<string, string[]> = {
  users: ["password_hash", "passwordHash"],
  trucks: ["password_hash", "passwordHash"],
};

// All syncable tables with their drizzle table objects
const SYNC_TABLES = [
  { name: "categories",           table: categoriesTable,          hasUpdatedAt: true },
  { name: "products",             table: productsTable,            hasUpdatedAt: true },
  { name: "suppliers",            table: suppliersTable,           hasUpdatedAt: true },
  { name: "clients",              table: clientsTable,             hasUpdatedAt: true },
  { name: "trucks",               table: trucksTable,              hasUpdatedAt: true },
  { name: "users",                table: usersTable,               hasUpdatedAt: true },
  { name: "purchases",            table: purchasesTable,           hasUpdatedAt: true },
  { name: "purchase_items",       table: purchaseItemsTable,       hasUpdatedAt: true },
  { name: "invoices",             table: invoicesTable,            hasUpdatedAt: true },
  { name: "invoice_items",        table: invoiceItemsTable,        hasUpdatedAt: true },
  { name: "returns",              table: returnsTable,             hasUpdatedAt: true },
  { name: "return_items",         table: returnItemsTable,         hasUpdatedAt: true },
  { name: "cash_transfers",       table: cashTransfersTable,       hasUpdatedAt: true },
  { name: "truck_stock",          table: truckStockTable,          hasUpdatedAt: true },
  { name: "stock_transfers",      table: stockTransfersTable,      hasUpdatedAt: true },
  { name: "stock_transfer_items", table: stockTransferItemsTable,  hasUpdatedAt: true },
] as const;

// ─── STATUS ───────────────────────────────────────────────────────────────────

router.get("/sync/status", requireAuth, async (_req, res) => {
  res.json({ ok: true, version: "v2", timestamp: new Date().toISOString() });
});

// ─── PULL ─────────────────────────────────────────────────────────────────────

router.get("/sync/v2/pull", requireAuth, async (req, res) => {
  const sinceRaw = req.query.since as string | undefined;
  const since = sinceRaw ? new Date(sinceRaw) : new Date(0);

  // Truck sessions receive only operational tables; user sessions receive all
  const isTruckSession = !!(req as any).session?.truckId && !(req as any).session?.userId;

  const result: Record<string, any[]> = {};

  for (const { name, table } of SYNC_TABLES) {
    if (isTruckSession && !TRUCK_PULL_ALLOWLIST.has(name)) continue;
    try {
      const t = table as any;
      if (!t.updatedAt) continue;
      // truck_stock is tiny and must never be missed due to device-clock skew in
      // the incremental `since` cursor, so always return all of its rows. The
      // mobile upsert is idempotent, so re-sending every pull is safe and cheap.
      const rows = name === "truck_stock"
        ? await db.select().from(t)
        : await db.select().from(t)
            .where(or(gt(t.updatedAt, since), isNull(t.updatedAt)));
      // Convert timestamps to ISO strings and snake_case; strip sensitive columns
      const strip = COLUMN_STRIP[name] ?? [];
      result[name] = rows.map((r: any) => {
        const row = snakeCaseRecord(r);
        for (const col of strip) delete row[col];
        return row;
      });
    } catch {
      result[name] = [];
    }
  }

  res.json({
    tables: result,
    cursor: new Date().toISOString(),
  });
});

// ─── PUSH ─────────────────────────────────────────────────────────────────────

router.post("/sync/v2/push", requireAuth, async (req, res): Promise<void> => {
  const { tables } = req.body as { deviceId?: string; tables?: Record<string, any[]> };
  if (!tables || typeof tables !== "object") {
    res.status(400).json({ error: "tables object required" }); return;
  }

  // Enforce table-level authorization: truck sessions may only push operational tables
  const isTruckSession = !!(req as any).session?.truckId && !(req as any).session?.userId;
  if (isTruckSession) {
    const forbidden = Object.keys(tables).filter(t => !TRUCK_PUSH_ALLOWLIST.has(t));
    if (forbidden.length > 0) {
      res.status(403).json({ error: `Forbidden tables for truck session: ${forbidden.join(", ")}` });
      return;
    }
  }

  const tableMap: Record<string, any> = {};
  for (const { name, table } of SYNC_TABLES) tableMap[name] = table;

  for (const [tableName, records] of Object.entries(tables)) {
    const t = tableMap[tableName] as any;
    if (!t || !Array.isArray(records)) continue;

    for (const rawRecord of records) {
      if (!rawRecord.sync_id) continue;

      try {
        const rec = camelCaseRecord(rawRecord);
        // Remove local-only or unrecognised fields that don't exist in cloud schema
        const clean = sanitizeForTable(t, rec);
        if (!clean) continue;

        // Upsert by sync_id: only overwrite if incoming updated_at is newer
        await db.insert(t).values(clean)
          .onConflictDoUpdate({
            target: t.syncId,
            set: buildUpdateSet(t, clean),
            setWhere: sql`excluded.updated_at > ${t.updatedAt} OR ${t.updatedAt} IS NULL`,
          })
          .catch(() => {/* ignore FK constraint errors */});
      } catch {
        // continue on any error
      }
    }
  }

  res.json({ ok: true, cursor: new Date().toISOString() });
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** snake_case row → snake_case JSON (timestamps as ISO strings) */
function snakeCaseRecord(row: any): any {
  const out: any = {};
  for (const [k, v] of Object.entries(row)) {
    const snakeKey = k.replace(/([A-Z])/g, m => "_" + m.toLowerCase());
    out[snakeKey] = v instanceof Date ? v.toISOString() : v;
  }
  return out;
}

/** snake_case incoming → camelCase for Drizzle */
function camelCaseRecord(row: any): any {
  const out: any = {};
  for (const [k, v] of Object.entries(row)) {
    const camelKey = k.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
    out[camelKey] = v;
  }
  return out;
}

/** Remove keys not present in the table columns, cast types */
function sanitizeForTable(t: any, rec: any): any | null {
  const cols = Object.keys(t);
  const clean: any = {};
  for (const col of cols) {
    if (col === "id") continue; // let DB assign
    if (rec[col] !== undefined) {
      const val = rec[col];
      // Convert ISO strings to Date for timestamp columns
      if (t[col]?.dataType === "date" && typeof val === "string") {
        clean[col] = new Date(val);
      } else {
        clean[col] = val;
      }
    }
  }
  // Must have syncId to upsert
  if (!clean.syncId) return null;
  // Always refresh updatedAt to now if not provided
  if (!clean.updatedAt) clean.updatedAt = new Date();
  return clean;
}

/** Build the SET clause for ON CONFLICT DO UPDATE (all cols except id and syncId) */
function buildUpdateSet(t: any, clean: any): any {
  const set: any = {};
  for (const [k, v] of Object.entries(clean)) {
    if (k === "id" || k === "syncId" || k === "createdAt") continue;
    set[k] = sql.raw("excluded." + k.replace(/([A-Z])/g, m => "_" + m.toLowerCase()));
  }
  return set;
}

export default router;
