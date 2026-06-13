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
import { and, eq, gt, or, isNull, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";

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
  const sessionTruckId: number | null = isTruckSession ? ((req as any).session.truckId ?? null) : null;

  const result: Record<string, any[]> = {};

  for (const { name, table } of SYNC_TABLES) {
    if (isTruckSession && !TRUCK_PULL_ALLOWLIST.has(name)) continue;
    try {
      const t = table as any;
      if (!t.updatedAt) continue;
      // truck_stock is tiny and must never be missed due to device-clock skew in
      // the incremental `since` cursor, so always return all of its rows. The
      // mobile upsert is idempotent, so re-sending every pull is safe and cheap.
      let rows;
      if (name === "truck_stock") {
        rows = await db.select().from(t);
      } else if (name === "clients" && sessionTruckId !== null) {
        // Truck sessions receive ALL of their own clients (no since-cursor filter).
        // Sending the complete authoritative set allows the mobile to prune stale
        // local rows when a client is reassigned to a different truck.
        rows = await db.select().from(t)
          .where(eq(t.truckId, sessionTruckId));
      } else {
        rows = await db.select().from(t)
          .where(or(gt(t.updatedAt, since), isNull(t.updatedAt)));
      }
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

  // Tell the mobile which tables were returned as a complete authoritative set
  // (vs. incremental delta). Mobile uses this to prune stale local rows.
  const authoritativeTables: string[] = ["truck_stock"];
  if (sessionTruckId !== null) authoritativeTables.push("clients");

  res.json({
    tables: result,
    cursor: new Date().toISOString(),
    authoritativeTables,
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

  // Mobile (truck) pushes need special handling: invoices/returns are created
  // OFFLINE so their children reference parents by sync_id (not the cloud's
  // serial id), and invoice_number is generated server-side. The cloud also
  // never reconciled truck_stock/cash for mobile sales. This path resolves the
  // foreign keys, persists the sale atomically, and applies once-only stock/cash
  // reconciliation. Desktop/admin sessions keep the generic upsert path below.
  if (isTruckSession) {
    await handleTruckPush(req, res, tables, tableMap);
    return;
  }

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

// A foreign-key column on a pushed row that the mobile only knows by sync_id.
type FkRule = { idCol: string; syncCol: string; refTable: any; tag: string };

/**
 * Truck (mobile) push: resolve sync_id foreign keys, generate invoice numbers,
 * persist the whole sale in one transaction, and reconcile truck_stock + truck
 * cash_balance once for each newly-inserted invoice/return.
 *
 * Idempotency: invoices/returns/items are inserted with ON CONFLICT DO NOTHING.
 * Only rows actually inserted by THIS request (captured via RETURNING) drive the
 * stock/cash reconciliation, so retries (or a lost 200 response) never
 * double-apply a delta. For credit sales the server also recomputes the client
 * balance (balance − totalAmount) in step 6 below, matching the mobile
 * sign convention (negative = owes money).
 */
async function handleTruckPush(
  req: any,
  res: any,
  tables: Record<string, any[]>,
  tableMap: Record<string, any>,
): Promise<void> {
  // Truck sessions may only write rows scoped to their own truck (server-side
  // authorization — never trust the truck_id the device sends).
  const sessionTruckId = Number((req as any).session?.truckId) || null;
  const newInvoices: Array<{ id: number; truckId: number; clientId: number | null; paymentType: string; totalAmount: number }> = [];
  const newClientReturns: Array<{ id: number; truckId: number }> = [];

  try {
    await db.transaction(async (tx) => {
      const cache = new Map<string, number | null>();
      const resolveId = async (tag: string, refTable: any, syncVal: any): Promise<number | null> => {
        if (syncVal == null || syncVal === "") return null;
        const key = tag + ":" + String(syncVal);
        if (cache.has(key)) return cache.get(key)!;
        const [row] = await tx.select({ id: refTable.id }).from(refTable)
          .where(eq(refTable.syncId, String(syncVal))).limit(1);
        const id = row?.id ?? null;
        cache.set(key, id);
        return id;
      };
      const applyFk = async (rec: any, rules: FkRule[]) => {
        for (const r of rules) {
          if (rec[r.idCol] == null && rec[r.syncCol] != null) {
            const resolved = await resolveId(r.tag, r.refTable, rec[r.syncCol]);
            if (resolved != null) rec[r.idCol] = resolved;
          }
        }
      };
      const upsert = async (tableName: string, rules?: FkRule[], opts?: { forceTruckId?: boolean }) => {
        const recs = tables[tableName];
        if (!Array.isArray(recs)) return;
        const t = tableMap[tableName];
        for (const raw of recs) {
          if (!raw.sync_id) continue;
          const rec = camelCaseRecord(raw);
          if (rules) await applyFk(rec, rules);
          const clean = sanitizeForTable(t, rec);
          if (!clean) continue;
          if (opts?.forceTruckId && sessionTruckId != null) clean.truckId = sessionTruckId;
          await tx.insert(t).values(clean).onConflictDoUpdate({
            target: t.syncId,
            set: buildUpdateSet(t, clean),
            setWhere: sql`excluded.updated_at > ${t.updatedAt} OR ${t.updatedAt} IS NULL`,
          });
        }
      };

      // 1. Independent/parent tables. `clients` are upserted for profile fields
      //    (name/phone/type); their `balance` is reconciled server-side from
      //    credit invoices below (mirroring the web), not trusted from the device.
      await upsert("categories");
      await upsert("clients", [{ idCol: "truckId", syncCol: "truckSyncId", refTable: trucksTable, tag: "truck" }]);
      await upsert("cash_transfers", [{ idCol: "truckId", syncCol: "truckSyncId", refTable: trucksTable, tag: "truck" }], { forceTruckId: true });

      // 2. Invoices — insert-only (immutable once created on the device).
      for (const raw of (tables["invoices"] ?? [])) {
        if (!raw.sync_id) continue;
        const rec = camelCaseRecord(raw);
        await applyFk(rec, [
          { idCol: "clientId", syncCol: "clientSyncId", refTable: clientsTable, tag: "client" },
          { idCol: "truckId", syncCol: "truckSyncId", refTable: trucksTable, tag: "truck" },
        ]);
        const clean = sanitizeForTable(invoicesTable, rec);
        if (!clean) continue;
        if (sessionTruckId != null) clean.truckId = sessionTruckId; // truck-scope enforcement
        if (clean.truckId == null || clean.clientId == null) {
          req.log?.warn?.({ syncId: clean.syncId, truckId: clean.truckId, clientId: clean.clientId }, "truck push: invoice skipped, unresolved FK");
          continue; // unresolved required FK
        }
        if (!clean.invoiceNumber) clean.invoiceNumber = `FAC-MOB-${String(clean.syncId)}`;
        const inserted = await tx.insert(invoicesTable).values(clean)
          .onConflictDoNothing({ target: invoicesTable.syncId })
          .returning({
            id: invoicesTable.id,
            truckId: invoicesTable.truckId,
            clientId: invoicesTable.clientId,
            paymentType: invoicesTable.paymentType,
            totalAmount: invoicesTable.totalAmount,
          });
        if (inserted.length > 0) {
          newInvoices.push({
            id: inserted[0].id,
            truckId: inserted[0].truckId,
            clientId: inserted[0].clientId ?? null,
            paymentType: inserted[0].paymentType,
            totalAmount: Number(inserted[0].totalAmount),
          });
        }
      }

      // 3. Returns — insert-only.
      for (const raw of (tables["returns"] ?? [])) {
        if (!raw.sync_id) continue;
        const rec = camelCaseRecord(raw);
        await applyFk(rec, [
          { idCol: "clientId", syncCol: "clientSyncId", refTable: clientsTable, tag: "client" },
          { idCol: "truckId", syncCol: "truckSyncId", refTable: trucksTable, tag: "truck" },
        ]);
        const clean = sanitizeForTable(returnsTable, rec);
        if (!clean) continue;
        if (sessionTruckId != null) clean.truckId = sessionTruckId; // truck-scope enforcement
        if (!clean.type) continue; // NOT NULL
        const inserted = await tx.insert(returnsTable).values(clean)
          .onConflictDoNothing({ target: returnsTable.syncId })
          .returning({ id: returnsTable.id, truckId: returnsTable.truckId, type: returnsTable.type });
        if (inserted.length > 0 && inserted[0].type === "client_return" && inserted[0].truckId != null) {
          newClientReturns.push({ id: inserted[0].id, truckId: inserted[0].truckId });
        }
      }

      // 4. Invoice items — resolve invoice + product, insert-only.
      for (const raw of (tables["invoice_items"] ?? [])) {
        if (!raw.sync_id) continue;
        const rec = camelCaseRecord(raw);
        await applyFk(rec, [
          { idCol: "invoiceId", syncCol: "invoiceSyncId", refTable: invoicesTable, tag: "invoice" },
          { idCol: "productId", syncCol: "productSyncId", refTable: productsTable, tag: "product" },
        ]);
        const clean = sanitizeForTable(invoiceItemsTable, rec);
        if (!clean) continue;
        if (clean.invoiceId == null || clean.productId == null) {
          req.log?.warn?.({ syncId: clean.syncId, invoiceId: clean.invoiceId, productId: clean.productId }, "truck push: invoice_item skipped, unresolved FK");
          continue;
        }
        await tx.insert(invoiceItemsTable).values(clean).onConflictDoNothing({ target: invoiceItemsTable.syncId });
      }

      // 5. Return items — resolve return + product, insert-only.
      for (const raw of (tables["return_items"] ?? [])) {
        if (!raw.sync_id) continue;
        const rec = camelCaseRecord(raw);
        await applyFk(rec, [
          { idCol: "returnId", syncCol: "returnSyncId", refTable: returnsTable, tag: "return" },
          { idCol: "productId", syncCol: "productSyncId", refTable: productsTable, tag: "product" },
        ]);
        const clean = sanitizeForTable(returnItemsTable, rec);
        if (!clean) continue;
        if (clean.returnId == null || clean.productId == null) continue;
        await tx.insert(returnItemsTable).values(clean).onConflictDoNothing({ target: returnItemsTable.syncId });
      }

      // 6. Reconciliation — once-only for invoices/returns inserted above.
      //    Sale: decrement truck_stock per line item; cash sale credits the truck
      //    cash_balance; credit sale debits the client balance. Mirrors the web
      //    POST /invoices side effects. All money/stock mutations use atomic SQL
      //    expressions (read-modify-write would lose concurrent updates).
      for (const inv of newInvoices) {
        const items = await tx.select({ productId: invoiceItemsTable.productId, quantity: invoiceItemsTable.quantity })
          .from(invoiceItemsTable).where(eq(invoiceItemsTable.invoiceId, inv.id));
        for (const it of items) {
          const qty = Number(it.quantity);
          if (!qty || it.productId == null) continue;
          await tx.update(truckStockTable).set({
            quantity: sql`GREATEST(0, ${truckStockTable.quantity} - ${qty})`,
            updatedAt: new Date(),
          }).where(and(eq(truckStockTable.truckId, inv.truckId), eq(truckStockTable.productId, it.productId)));
        }
        if (inv.paymentType === "cash" && inv.totalAmount) {
          await tx.update(trucksTable).set({
            cashBalance: sql`${trucksTable.cashBalance} + ${inv.totalAmount}`,
            updatedAt: new Date(),
          }).where(eq(trucksTable.id, inv.truckId));
        }
        if (inv.paymentType === "credit" && inv.totalAmount && inv.clientId != null) {
          await tx.update(clientsTable).set({
            balance: sql`${clientsTable.balance} - ${inv.totalAmount}`,
            updatedAt: new Date(),
          }).where(eq(clientsTable.id, inv.clientId));
        }
      }
      // Client return: add the returned quantity back to truck_stock (insert the
      // row if the truck never carried that product). Mirrors web POST /returns.
      for (const ret of newClientReturns) {
        const items = await tx.select({ productId: returnItemsTable.productId, quantity: returnItemsTable.quantity })
          .from(returnItemsTable).where(eq(returnItemsTable.returnId, ret.id));
        for (const it of items) {
          const qty = Number(it.quantity);
          if (!qty || it.productId == null) continue;
          const updated = await tx.update(truckStockTable).set({
            quantity: sql`${truckStockTable.quantity} + ${qty}`,
            updatedAt: new Date(),
          }).where(and(eq(truckStockTable.truckId, ret.truckId), eq(truckStockTable.productId, it.productId)))
            .returning({ id: truckStockTable.id });
          if (updated.length === 0) {
            await tx.insert(truckStockTable).values({
              truckId: ret.truckId, productId: it.productId, quantity: String(qty),
              syncId: randomUUID(), updatedAt: new Date(),
            });
          }
        }
      }
    });
  } catch (err) {
    // Hard failure on the critical sale path: surface it (mobile keeps the rows
    // pending and retries) instead of silently dropping the sale.
    req.log?.error?.({ err }, "truck sync push failed");
    res.status(500).json({ error: "sync push failed" });
    return;
  }

  // Best-effort tables outside the critical sale path (e.g. stock_transfers,
  // whose mobile schema differs from cloud). Processed per-row so a mismatch can
  // never abort the sale transaction above.
  const handled = new Set(["categories", "clients", "cash_transfers", "invoices", "returns", "invoice_items", "return_items"]);
  for (const [tableName, records] of Object.entries(tables)) {
    if (handled.has(tableName)) continue;
    const t = tableMap[tableName];
    if (!t || !Array.isArray(records)) continue;
    for (const raw of records) {
      if (!raw.sync_id) continue;
      try {
        const rec = camelCaseRecord(raw);
        const clean = sanitizeForTable(t, rec);
        if (!clean) continue;
        await db.insert(t).values(clean).onConflictDoUpdate({
          target: t.syncId,
          set: buildUpdateSet(t, clean),
          setWhere: sql`excluded.updated_at > ${t.updatedAt} OR ${t.updatedAt} IS NULL`,
        }).catch((e: any) => req.log?.warn?.({ err: e, table: tableName }, "non-critical sync row failed"));
      } catch (e) {
        req.log?.warn?.({ err: e, table: tableName }, "non-critical sync row failed");
      }
    }
  }

  res.json({ ok: true, cursor: new Date().toISOString() });
}

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
