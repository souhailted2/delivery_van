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
  truckCommissionPaymentsTable, clientPaymentsTable,
} from "@workspace/db";
import { and, eq, gt, or, isNull, sql, getTableName, inArray } from "drizzle-orm";
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
  "client_payments",
  "stock_transfers", "stock_transfer_items",
]);

// Tables a truck session is allowed to push (operational data only).
// Admin-only tables (users, suppliers, purchases, purchase_items, truck_stock) are excluded.
const TRUCK_PUSH_ALLOWLIST = new Set([
  "categories", "clients",
  "invoices", "invoice_items",
  "returns", "return_items",
  "cash_transfers",
  "client_payments",
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
  { name: "truck_commission_payments", table: truckCommissionPaymentsTable, hasUpdatedAt: true },
  { name: "client_payments",          table: clientPaymentsTable,      hasUpdatedAt: true },
] as const;

// ─── STATUS ───────────────────────────────────────────────────────────────────

router.get("/sync/status", requireAuth, async (_req, res) => {
  res.json({ ok: true, version: "v2", timestamp: new Date().toISOString() });
});

// P0-2: server sync epoch (bumped on destructive resets). Read from sync_state;
// returns 0 if the table isn't migrated yet, which leaves the epoch gate INACTIVE
// (safe default — zero behaviour change until the migration is applied).
async function getSyncEpoch(): Promise<number> {
  try {
    const r: any = await db.execute(sql`SELECT epoch FROM sync_state WHERE id = 1 LIMIT 1`);
    const rows = r?.rows ?? r;
    const e = rows?.[0]?.epoch;
    return e == null ? 0 : Number(e);
  } catch {
    return 0;
  }
}

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
    epoch: await getSyncEpoch(),
  });
});

// ─── PUSH ─────────────────────────────────────────────────────────────────────

router.post("/sync/v2/push", requireAuth, async (req, res): Promise<void> => {
  const { tables } = req.body as { deviceId?: string; tables?: Record<string, any[]>; epoch?: number };
  if (!tables || typeof tables !== "object") {
    res.status(400).json({ error: "tables object required" }); return;
  }

  // P0-2 (resurrection) — SYNC-EPOCH GATE. The server bumps `sync_state.epoch`
  // on any destructive reset (e.g. the 2026-06-15 factory reset). A device that
  // last synced under an OLDER epoch still holds rows the cloud hard-deleted; if
  // it pushed, the upsert's ON CONFLICT would miss (sync_id gone) and INSERT,
  // RESURRECTING them. We reject such a push and tell the client to wipe + re-pull
  // before it may push again. Clients that don't yet send an epoch are not gated
  // (safe rollout); once they send it AND it mismatches, the gate engages.
  const clientEpoch = (req.body as any)?.epoch;
  const serverEpoch = await getSyncEpoch();
  if (serverEpoch > 0 && clientEpoch != null && Number(clientEpoch) !== serverEpoch) {
    res.status(409).json({ resetRequired: true, epoch: serverEpoch });
    return;
  }

  // Upgraded installs may carry cash_transfers rows whose `direction` column was
  // added without a backfill (NULL). The cloud column is NOT NULL, so a NULL would
  // abort the truck-push transaction; coerce it to the default before any insert.
  if (Array.isArray(tables.cash_transfers)) {
    for (const r of tables.cash_transfers) {
      if (r && (r.direction == null || r.direction === "")) r.direction = "in";
    }
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

  const results: SyncResults = {};

  // Per-request cache for FK sync_id -> cloud id lookups (C1).
  const fkCache = new Map<string, number | null>();
  const resolveFkId = async (tag: string, refTable: any, syncVal: any): Promise<number | null> => {
    const key = tag + ":" + String(syncVal);
    if (fkCache.has(key)) return fkCache.get(key)!;
    const [row] = await db.select({ id: refTable.id }).from(refTable)
      .where(eq(refTable.syncId, String(syncVal))).limit(1);
    const id = row?.id ?? null;
    fkCache.set(key, id);
    return id;
  };

  // P0-4: snapshot which pushed invoices/returns ALREADY exist, so after the
  // generic upsert we reconcile ONLY the genuinely-new ones, exactly once.
  const pushedInvoiceSyncIds = (tables.invoices ?? []).map((r: any) => r?.sync_id).filter(Boolean) as string[];
  const pushedReturnSyncIds = (tables.returns ?? []).map((r: any) => r?.sync_id).filter(Boolean) as string[];
  const preExistingInvoiceSyncIds = new Set<string>(
    pushedInvoiceSyncIds.length
      ? (await db.select({ s: invoicesTable.syncId }).from(invoicesTable).where(inArray(invoicesTable.syncId, pushedInvoiceSyncIds))).map((r: any) => r.s)
      : [],
  );
  const preExistingReturnSyncIds = new Set<string>(
    pushedReturnSyncIds.length
      ? (await db.select({ s: returnsTable.syncId }).from(returnsTable).where(inArray(returnsTable.syncId, pushedReturnSyncIds))).map((r: any) => r.s)
      : [],
  );
  const pushedClientPaymentSyncIds = (tables.client_payments ?? []).map((r: any) => r?.sync_id).filter(Boolean) as string[];
  const preExistingClientPaymentSyncIds = new Set<string>(
    pushedClientPaymentSyncIds.length
      ? (await db.select({ s: clientPaymentsTable.syncId }).from(clientPaymentsTable).where(inArray(clientPaymentsTable.syncId, pushedClientPaymentSyncIds))).map((r: any) => r.s)
      : [],
  );

  for (const [tableName, records] of Object.entries(tables)) {
    const t = tableMap[tableName] as any;
    if (!t || !Array.isArray(records)) continue;

    const tableResult: SyncTableResult = { received: records.length, written: 0, errors: [] };
    results[tableName] = tableResult;
    const fkRules = PUSH_FK_RULES[tableName];

    for (const rawRecord of records) {
      if (!rawRecord.sync_id) {
        tableResult.errors.push({ error: "missing sync_id" });
        continue;
      }

      try {
        const rec = camelCaseRecord(rawRecord);

        // C1: never trust the desktop's raw local FK id — resolve it from the
        // `*SyncId` companion field the desktop attaches via local joins. A
        // required FK that can't be resolved means the parent hasn't synced
        // yet (or never will); reject the row rather than write a wrong/null id.
        if (fkRules) {
          let unresolved: FkRule | null = null;
          for (const rule of fkRules) {
            const syncVal = rec[rule.syncCol];
            rec[rule.idCol] = (syncVal != null && syncVal !== "")
              ? await resolveFkId(rule.tag, rule.refTable, syncVal)
              : null;
            if (rule.required && rec[rule.idCol] == null) { unresolved = rule; break; }
          }
          if (unresolved) {
            tableResult.errors.push({
              syncId: rawRecord.sync_id,
              error: `unresolved required FK '${unresolved.tag}' (${unresolved.syncCol}=${rec[unresolved.syncCol] ?? "null"})`,
            });
            continue;
          }
        }

        // Remove local-only or unrecognised fields that don't exist in cloud schema
        const clean = sanitizeForTable(t, rec);
        if (!clean) {
          tableResult.errors.push({ syncId: rawRecord.sync_id, error: "sanitize failed (missing sync_id after mapping)" });
          continue;
        }

        // Never let a missing/empty local password_hash blank out the cloud's
        // value (e.g. a desktop truck synced before a password was set).
        if ((tableName === "trucks" || tableName === "users") && !clean.passwordHash) {
          delete clean.passwordHash;
        }

        // Upsert by sync_id: only overwrite if incoming updated_at is newer
        await db.insert(t).values(clean)
          .onConflictDoUpdate({
            target: t.syncId,
            set: buildUpdateSet(t, clean),
            setWhere: sql`excluded.updated_at > ${t.updatedAt} OR ${t.updatedAt} IS NULL`,
          });
        tableResult.written++;
      } catch (err: any) {
        const message = err?.message || String(err);
        tableResult.errors.push({ syncId: rawRecord.sync_id, error: message });
        req.log?.warn?.({ err, table: tableName, syncId: rawRecord.sync_id }, "sync push: row rejected");
      }
    }

    if (tableResult.errors.length > 0) {
      req.log?.warn?.(
        { table: tableName, received: tableResult.received, written: tableResult.written, errorCount: tableResult.errors.length },
        "sync push: table completed with errors",
      );
    }
  }

  // P0-4: reconcile the genuinely-new invoices/returns (apply stock/cash/balance
  // deltas server-side) so a DESKTOP sale additively updates the cloud balance
  // instead of overwriting it. The cumulative columns themselves are protected
  // from the generic upsert (RECONCILED_COLUMNS), so the only way they change is
  // via these once-per-invoice deltas. Atomic per request; effect applied once.
  try {
    const newInvoiceSyncIds = pushedInvoiceSyncIds.filter((s) => !preExistingInvoiceSyncIds.has(s));
    const newReturnSyncIds = pushedReturnSyncIds.filter((s) => !preExistingReturnSyncIds.has(s));
    const newClientPaymentSyncIds = pushedClientPaymentSyncIds.filter((s) => !preExistingClientPaymentSyncIds.has(s));
    if (newInvoiceSyncIds.length || newReturnSyncIds.length || newClientPaymentSyncIds.length) {
      await db.transaction(async (tx) => {
        if (newInvoiceSyncIds.length) {
          const invs = await tx.select({
            id: invoicesTable.id, truckId: invoicesTable.truckId,
            clientId: invoicesTable.clientId, paymentType: invoicesTable.paymentType,
          }).from(invoicesTable).where(inArray(invoicesTable.syncId, newInvoiceSyncIds));
          for (const inv of invs) {
            if (inv.truckId == null) continue;
            await applyInvoiceEffects(tx, { id: inv.id, truckId: inv.truckId, clientId: inv.clientId ?? null, paymentType: inv.paymentType }, req);
          }
        }
        if (newReturnSyncIds.length) {
          const rets = await tx.select({ id: returnsTable.id, truckId: returnsTable.truckId, type: returnsTable.type, invoiceId: returnsTable.invoiceId })
            .from(returnsTable).where(inArray(returnsTable.syncId, newReturnSyncIds));
          for (const ret of rets) {
            if ((ret.type === "client_return" || ret.type === "void") && ret.truckId != null) {
              await applyReturnEffects(tx, { id: ret.id, truckId: ret.truckId, type: ret.type, invoiceId: ret.invoiceId ?? null }, req);
            }
          }
        }
        if (newClientPaymentSyncIds.length) {
          const pays = await tx.select({ id: clientPaymentsTable.id, truckId: clientPaymentsTable.truckId, clientId: clientPaymentsTable.clientId, amount: clientPaymentsTable.amount })
            .from(clientPaymentsTable).where(inArray(clientPaymentsTable.syncId, newClientPaymentSyncIds));
          for (const pay of pays) {
            if (pay.clientId != null) {
              await applyClientPaymentEffects(tx, { id: pay.id, truckId: pay.truckId ?? null, clientId: pay.clientId, amount: Number(pay.amount) }, req);
            }
          }
        }
      });
    }
  } catch (err: any) {
    req.log?.error?.({ err }, "sync push (admin): invoice/return reconciliation failed");
  }

  res.json({ ok: true, cursor: new Date().toISOString(), results });
});

// Per-table push outcome, surfaced to the caller so sync errors are never silent.
type SyncTableResult = { received: number; written: number; errors: Array<{ syncId?: string; error: string }> };
type SyncResults = Record<string, SyncTableResult>;

// A foreign-key column on a pushed row that the device only knows by sync_id.
// `required` rows whose FK cannot be resolved are rejected rather than written
// with a null/wrong id (see PUSH_FK_RULES below for the desktop generic push).
type FkRule = { idCol: string; syncCol: string; refTable: any; tag: string; required?: boolean };

// FK columns the desktop generic push must translate from local SQLite ids to
// cloud ids via sync_id (C1). The desktop attaches a `*SyncId` companion field
// for each rule (see desktop/server/sync-engine.js FK_SYNC_RULES); the cloud
// resolves it to a real cloud id here and NEVER trusts the raw local id in
// `idCol`, since local and cloud ids diverge for any row created on desktop
// after the initial sync. Table order matters: a row's FK targets must be
// pushed (and resolvable) before the row itself — see PUSH_TABLES order.
const PUSH_FK_RULES: Record<string, FkRule[]> = {
  products: [
    { idCol: "categoryId", syncCol: "categorySyncId", refTable: categoriesTable, tag: "category" },
  ],
  trucks: [
    { idCol: "vendeurId", syncCol: "vendeurSyncId", refTable: usersTable, tag: "user" },
  ],
  users: [
    { idCol: "truckId", syncCol: "truckSyncId", refTable: trucksTable, tag: "truck" },
  ],
  clients: [
    { idCol: "truckId", syncCol: "truckSyncId", refTable: trucksTable, tag: "truck" },
  ],
  purchases: [
    { idCol: "supplierId", syncCol: "supplierSyncId", refTable: suppliersTable, tag: "supplier", required: true },
  ],
  purchase_items: [
    { idCol: "purchaseId", syncCol: "purchaseSyncId", refTable: purchasesTable, tag: "purchase", required: true },
    { idCol: "productId", syncCol: "productSyncId", refTable: productsTable, tag: "product", required: true },
  ],
  invoices: [
    { idCol: "truckId", syncCol: "truckSyncId", refTable: trucksTable, tag: "truck", required: true },
    { idCol: "clientId", syncCol: "clientSyncId", refTable: clientsTable, tag: "client", required: true },
  ],
  invoice_items: [
    { idCol: "invoiceId", syncCol: "invoiceSyncId", refTable: invoicesTable, tag: "invoice", required: true },
    { idCol: "productId", syncCol: "productSyncId", refTable: productsTable, tag: "product", required: true },
  ],
  returns: [
    { idCol: "truckId", syncCol: "truckSyncId", refTable: trucksTable, tag: "truck" },
    { idCol: "clientId", syncCol: "clientSyncId", refTable: clientsTable, tag: "client" },
    { idCol: "invoiceId", syncCol: "invoiceSyncId", refTable: invoicesTable, tag: "invoice" },
  ],
  return_items: [
    { idCol: "returnId", syncCol: "returnSyncId", refTable: returnsTable, tag: "return", required: true },
    { idCol: "productId", syncCol: "productSyncId", refTable: productsTable, tag: "product", required: true },
  ],
  cash_transfers: [
    { idCol: "truckId", syncCol: "truckSyncId", refTable: trucksTable, tag: "truck", required: true },
  ],
  truck_stock: [
    { idCol: "truckId", syncCol: "truckSyncId", refTable: trucksTable, tag: "truck", required: true },
    { idCol: "productId", syncCol: "productSyncId", refTable: productsTable, tag: "product", required: true },
  ],
  stock_transfers: [
    { idCol: "truckId", syncCol: "truckSyncId", refTable: trucksTable, tag: "truck" },
  ],
  stock_transfer_items: [
    { idCol: "transferId", syncCol: "transferSyncId", refTable: stockTransfersTable, tag: "transfer", required: true },
    { idCol: "productId", syncCol: "productSyncId", refTable: productsTable, tag: "product", required: true },
  ],
  truck_commission_payments: [
    { idCol: "truckId", syncCol: "truckSyncId", refTable: trucksTable, tag: "truck", required: true },
  ],
  client_payments: [
    { idCol: "truckId", syncCol: "truckSyncId", refTable: trucksTable, tag: "truck", required: true },
    { idCol: "clientId", syncCol: "clientSyncId", refTable: clientsTable, tag: "client", required: true },
  ],
};

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
  const newReturns: Array<{ id: number; truckId: number; type: string; invoiceId: number | null }> = [];
  const newClientPayments: Array<{ id: number; truckId: number | null; clientId: number; amount: number }> = [];

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
          { idCol: "invoiceId", syncCol: "invoiceSyncId", refTable: invoicesTable, tag: "invoice" },
        ]);
        const clean = sanitizeForTable(returnsTable, rec);
        if (!clean) continue;
        if (sessionTruckId != null) clean.truckId = sessionTruckId; // truck-scope enforcement
        if (!clean.type) continue; // NOT NULL
        const inserted = await tx.insert(returnsTable).values(clean)
          .onConflictDoNothing({ target: returnsTable.syncId })
          .returning({ id: returnsTable.id, truckId: returnsTable.truckId, type: returnsTable.type, invoiceId: returnsTable.invoiceId });
        if (inserted.length > 0 && (inserted[0].type === "client_return" || inserted[0].type === "void") && inserted[0].truckId != null) {
          newReturns.push({ id: inserted[0].id, truckId: inserted[0].truckId, type: inserted[0].type, invoiceId: inserted[0].invoiceId ?? null });
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

      // 5b. Client payments (تحصيل دفعة) — resolve client + truck, insert-only.
      for (const raw of (tables["client_payments"] ?? [])) {
        if (!raw.sync_id) continue;
        const rec = camelCaseRecord(raw);
        await applyFk(rec, [
          { idCol: "clientId", syncCol: "clientSyncId", refTable: clientsTable, tag: "client" },
          { idCol: "truckId", syncCol: "truckSyncId", refTable: trucksTable, tag: "truck" },
        ]);
        const clean = sanitizeForTable(clientPaymentsTable, rec);
        if (!clean) continue;
        if (sessionTruckId != null) clean.truckId = sessionTruckId; // truck-scope enforcement
        if (clean.clientId == null) {
          req.log?.warn?.({ syncId: clean.syncId, clientId: clean.clientId }, "truck push: client_payment skipped, unresolved client FK");
          continue;
        }
        const inserted = await tx.insert(clientPaymentsTable).values(clean)
          .onConflictDoNothing({ target: clientPaymentsTable.syncId })
          .returning({ id: clientPaymentsTable.id, truckId: clientPaymentsTable.truckId, clientId: clientPaymentsTable.clientId, amount: clientPaymentsTable.amount });
        if (inserted.length > 0 && inserted[0].clientId != null) {
          newClientPayments.push({ id: inserted[0].id, truckId: inserted[0].truckId ?? null, clientId: inserted[0].clientId, amount: Number(inserted[0].amount) });
        }
      }

      // 6. Reconciliation — once-only for invoices/returns inserted above.
      //    Sale: decrement truck_stock per line item; cash sale credits the truck
      //    cash_balance; credit sale debits the client balance. Mirrors the web
      //    POST /invoices side effects. All money/stock mutations use atomic SQL
      //    expressions (read-modify-write would lose concurrent updates).
      for (const inv of newInvoices) {
        const items = await tx
          .select({
            syncId: invoiceItemsTable.syncId,
            productId: invoiceItemsTable.productId,
            quantity: invoiceItemsTable.quantity,
            unitPrice: invoiceItemsTable.unitPrice,
          })
          .from(invoiceItemsTable)
          .where(eq(invoiceItemsTable.invoiceId, inv.id));

        let actualTotal = 0;
        for (const it of items) {
          const qty = Number(it.quantity);
          const unitPrice = Number(it.unitPrice ?? 0);
          if (!qty || it.productId == null) continue;

          const [stockRow] = await tx
            .select({ quantity: truckStockTable.quantity })
            .from(truckStockTable)
            .where(and(eq(truckStockTable.truckId, inv.truckId), eq(truckStockTable.productId, it.productId)))
            .limit(1);
          const available = Number(stockRow?.quantity ?? 0);
          const cappedQty = Math.min(qty, available);

          if (qty > available) {
            req.log.warn(
              { truckId: inv.truckId, invoiceId: inv.id, syncId: it.syncId, productId: it.productId, available, requestedQty: qty, cappedQty },
              "sync push: invoice line qty exceeds truck stock — capping persisted quantity and subtotal",
            );
            // Cap by syncId (unique per line) to avoid touching sibling lines for same product.
            const cappedSubtotal = (cappedQty * unitPrice).toFixed(2);
            await tx.update(invoiceItemsTable)
              .set({ quantity: String(cappedQty), subtotal: cappedSubtotal })
              .where(eq(invoiceItemsTable.syncId, it.syncId!));
          }

          actualTotal += cappedQty * unitPrice;

          if (cappedQty <= 0) continue; // nothing to deduct from stock
          await tx.update(truckStockTable).set({
            quantity: sql`GREATEST(0, ${truckStockTable.quantity} - ${cappedQty})`,
            updatedAt: new Date(),
          }).where(and(eq(truckStockTable.truckId, inv.truckId), eq(truckStockTable.productId, it.productId)));
        }

        // Recompute invoice total from accepted (possibly capped) line amounts.
        await tx.update(invoicesTable)
          .set({ totalAmount: actualTotal.toFixed(2) })
          .where(eq(invoicesTable.id, inv.id));

        // Financial side-effects use the corrected actualTotal (not the device-pushed figure).
        if (inv.paymentType === "cash" && actualTotal > 0) {
          await tx.update(trucksTable).set({
            cashBalance: sql`${trucksTable.cashBalance} + ${actualTotal}`,
            updatedAt: new Date(),
          }).where(eq(trucksTable.id, inv.truckId));
        }
        if (inv.paymentType === "credit" && actualTotal > 0 && inv.clientId != null) {
          await tx.update(clientsTable).set({
            balance: sql`${clientsTable.balance} - ${actualTotal}`,
            updatedAt: new Date(),
          }).where(eq(clientsTable.id, inv.clientId));
        }
      }
      // Returns & voids: restore stock + reverse money (and soft-delete the
      // invoice on a void). Client payments: reduce client debt + add truck cash.
      // Shared with the desktop generic-push path via the same helpers so the two
      // never diverge. Once-only — driven by the rows inserted in this request.
      for (const ret of newReturns) {
        await applyReturnEffects(tx, ret, req);
      }
      for (const pay of newClientPayments) {
        await applyClientPaymentEffects(tx, pay, req);
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
  // never abort the sale transaction above. Every outcome is recorded in
  // `results` so the caller (and desktop UI) can see exactly what failed.
  // Stock transfers from mobile arrive header-first with children that reference
  // the parent only by sync_id. Resolve the parent id before inserting items (the
  // server column is NOT NULL), processing the header first so the lookup can hit.
  const results: SyncResults = {};
  const recordResult = (table: string, syncId: string | undefined, err: any) => {
    const r = (results[table] ??= { received: 0, written: 0, errors: [] });
    const message = err?.message || String(err);
    r.errors.push({ syncId, error: message });
    req.log?.warn?.({ err, table, syncId }, "non-critical sync row failed");
  };
  const recordWritten = (table: string) => {
    const r = (results[table] ??= { received: 0, written: 0, errors: [] });
    r.written++;
  };
  for (const [tableName, records] of Object.entries(tables)) {
    if (Array.isArray(records)) (results[tableName] ??= { received: 0, written: 0, errors: [] }).received = records.length;
  }

  const stHeaders = tables["stock_transfers"];
  if (Array.isArray(stHeaders)) {
    for (const raw of stHeaders) {
      if (!raw.sync_id) { recordResult("stock_transfers", undefined, "missing sync_id"); continue; }
      try {
        const clean = sanitizeForTable(stockTransfersTable, camelCaseRecord(raw));
        if (!clean) { recordResult("stock_transfers", raw.sync_id, "sanitize failed"); continue; }
        await db.insert(stockTransfersTable).values(clean).onConflictDoUpdate({
          target: stockTransfersTable.syncId,
          set: buildUpdateSet(stockTransfersTable, clean),
          setWhere: sql`excluded.updated_at > ${stockTransfersTable.updatedAt} OR ${stockTransfersTable.updatedAt} IS NULL`,
        });
        recordWritten("stock_transfers");
      } catch (e) { recordResult("stock_transfers", raw.sync_id, e); }
    }
  }

  const stItems = tables["stock_transfer_items"];
  if (Array.isArray(stItems)) {
    for (const raw of stItems) {
      if (!raw.sync_id) { recordResult("stock_transfer_items", undefined, "missing sync_id"); continue; }
      try {
        const rec = camelCaseRecord(raw);
        if (rec.transferId == null && rec.stockTransferSyncId) {
          const [parent] = await db.select({ id: stockTransfersTable.id })
            .from(stockTransfersTable)
            .where(eq(stockTransfersTable.syncId, String(rec.stockTransferSyncId))).limit(1);
          if (parent) rec.transferId = parent.id;
        }
        if (rec.transferId == null) { recordResult("stock_transfer_items", raw.sync_id, "parent stock_transfer not found"); continue; }
        const clean = sanitizeForTable(stockTransferItemsTable, rec);
        if (!clean) { recordResult("stock_transfer_items", raw.sync_id, "sanitize failed"); continue; }
        await db.insert(stockTransferItemsTable).values(clean).onConflictDoUpdate({
          target: stockTransferItemsTable.syncId,
          set: buildUpdateSet(stockTransferItemsTable, clean),
          setWhere: sql`excluded.updated_at > ${stockTransferItemsTable.updatedAt} OR ${stockTransferItemsTable.updatedAt} IS NULL`,
        });
        recordWritten("stock_transfer_items");
      } catch (e) { recordResult("stock_transfer_items", raw.sync_id, e); }
    }
  }

  const handled = new Set(["categories", "clients", "cash_transfers", "invoices", "returns", "invoice_items", "return_items", "stock_transfers", "stock_transfer_items"]);
  for (const [tableName, records] of Object.entries(tables)) {
    if (handled.has(tableName)) continue;
    const t = tableMap[tableName];
    if (!t || !Array.isArray(records)) continue;
    for (const raw of records) {
      if (!raw.sync_id) { recordResult(tableName, undefined, "missing sync_id"); continue; }
      try {
        const rec = camelCaseRecord(raw);
        const clean = sanitizeForTable(t, rec);
        if (!clean) { recordResult(tableName, raw.sync_id, "sanitize failed"); continue; }
        await db.insert(t).values(clean).onConflictDoUpdate({
          target: t.syncId,
          set: buildUpdateSet(t, clean),
          setWhere: sql`excluded.updated_at > ${t.updatedAt} OR ${t.updatedAt} IS NULL`,
        });
        recordWritten(tableName);
      } catch (e) {
        recordResult(tableName, raw.sync_id, e);
      }
    }
  }

  res.json({ ok: true, cursor: new Date().toISOString(), results });
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
// Cumulative money/stock columns are CLOUD-AUTHORITATIVE: the cloud derives them
// by applying invoice/return/transfer effects as atomic deltas (see
// applyInvoiceEffects / handleTruckPush). A client's full-row push must NEVER
// overwrite them — doing so let a desktop sale clobber a concurrent mobile cash
// delta (reproduced P0-4: lost update). We strip these columns from the generic
// upsert SET, so a client push can update profile fields but never the balance.
// (On a first INSERT the row's value is still used; only the on-conflict UPDATE
// is protected.) Keyed by SQL table name -> camelCase column names.
const RECONCILED_COLUMNS: Record<string, Set<string>> = {
  trucks: new Set(["cashBalance"]),
  clients: new Set(["balance"]),
  suppliers: new Set(["balance"]),
  truck_stock: new Set(["quantity"]),
};

function buildUpdateSet(t: any, clean: any): any {
  const protectedCols = RECONCILED_COLUMNS[getTableName(t)];
  const set: any = {};
  for (const [k, v] of Object.entries(clean)) {
    if (k === "id" || k === "syncId" || k === "createdAt") continue;
    if (protectedCols && protectedCols.has(k)) continue; // server-reconciled, never overwritten by a push
    set[k] = sql.raw("excluded." + k.replace(/([A-Z])/g, m => "_" + m.toLowerCase()));
  }
  return set;
}

// ── Shared invoice/return reconciliation (server-authoritative money/stock) ──
// Applies a NEW invoice's effects ONCE: deduct truck_stock per line (capped to
// available), recompute the invoice total from accepted lines, then credit the
// truck cash_balance (cash) or debit the client balance (credit) — all as atomic
// SQL deltas. This is the mechanism that makes balances cloud-authoritative, so a
// client's pushed balance is never trusted (P0-4 fix). Mirrors the truck-push
// reconciliation in handleTruckPush — keep the two in sync (dedupe after staging
// validation). Caller MUST invoke this inside a db.transaction and only for
// invoices it just inserted (RETURNING-gated) so the effect is applied once.
async function applyInvoiceEffects(
  tx: any,
  inv: { id: number; truckId: number; clientId: number | null; paymentType: string },
  req: any,
) {
  const items = await tx.select({
    syncId: invoiceItemsTable.syncId, productId: invoiceItemsTable.productId,
    quantity: invoiceItemsTable.quantity, unitPrice: invoiceItemsTable.unitPrice,
  }).from(invoiceItemsTable).where(eq(invoiceItemsTable.invoiceId, inv.id));

  let actualTotal = 0;
  for (const it of items) {
    const qty = Number(it.quantity);
    const unitPrice = Number(it.unitPrice ?? 0);
    if (!qty || it.productId == null) continue;
    const [stockRow] = await tx.select({ quantity: truckStockTable.quantity }).from(truckStockTable)
      .where(and(eq(truckStockTable.truckId, inv.truckId), eq(truckStockTable.productId, it.productId))).limit(1);
    const available = Number(stockRow?.quantity ?? 0);
    const cappedQty = Math.min(qty, available);
    if (qty > available) {
      req.log?.warn?.({ truckId: inv.truckId, invoiceId: inv.id, syncId: it.syncId, available, requestedQty: qty, cappedQty }, "sync push (admin): invoice line qty exceeds truck stock — capping");
      await tx.update(invoiceItemsTable).set({ quantity: String(cappedQty), subtotal: (cappedQty * unitPrice).toFixed(2) }).where(eq(invoiceItemsTable.syncId, it.syncId!));
    }
    actualTotal += cappedQty * unitPrice;
    if (cappedQty <= 0) continue;
    await tx.update(truckStockTable).set({
      quantity: sql`GREATEST(0, ${truckStockTable.quantity} - ${cappedQty})`, updatedAt: new Date(),
    }).where(and(eq(truckStockTable.truckId, inv.truckId), eq(truckStockTable.productId, it.productId)));
  }

  await tx.update(invoicesTable).set({ totalAmount: actualTotal.toFixed(2) }).where(eq(invoicesTable.id, inv.id));
  if (inv.paymentType === "cash" && actualTotal > 0) {
    await tx.update(trucksTable).set({ cashBalance: sql`${trucksTable.cashBalance} + ${actualTotal}`, updatedAt: new Date() }).where(eq(trucksTable.id, inv.truckId));
  }
  if (inv.paymentType === "credit" && actualTotal > 0 && inv.clientId != null) {
    await tx.update(clientsTable).set({ balance: sql`${clientsTable.balance} - ${actualTotal}`, updatedAt: new Date() }).where(eq(clientsTable.id, inv.clientId));
  }
}

// Apply a NEW return/void ONCE. Restore the returned stock to the truck, then
// reverse the money against the original invoice: a credit sale reduces the
// client's debt (balance += amount); a cash sale removes the refunded cash from
// the truck (cash_balance −= amount). A "void" reverses the WHOLE invoice (using
// the server-authoritative invoice total) and soft-deletes the invoice + its
// items so it leaves history, commission and report totals. A "client_return"
// reverses only the value of the returned lines. Caller MUST run this inside a
// db.transaction, only for returns it just inserted (RETURNING/snapshot-gated),
// so the effect is applied exactly once.
async function applyReturnEffects(
  tx: any,
  ret: { id: number; truckId: number; type: string; invoiceId: number | null },
  _req: any,
) {
  const items = await tx.select({
    productId: returnItemsTable.productId,
    quantity: returnItemsTable.quantity,
    subtotal: returnItemsTable.subtotal,
  }).from(returnItemsTable).where(eq(returnItemsTable.returnId, ret.id));

  let reversedTotal = 0;
  for (const it of items) {
    const qty = Number(it.quantity);
    reversedTotal += Number(it.subtotal ?? 0);
    if (!qty || it.productId == null) continue;
    const updated = await tx.update(truckStockTable).set({ quantity: sql`${truckStockTable.quantity} + ${qty}`, updatedAt: new Date() })
      .where(and(eq(truckStockTable.truckId, ret.truckId), eq(truckStockTable.productId, it.productId))).returning({ id: truckStockTable.id });
    if (updated.length === 0) {
      await tx.insert(truckStockTable).values({ truckId: ret.truckId, productId: it.productId, quantity: String(qty), syncId: randomUUID(), updatedAt: new Date() });
    }
  }

  if (ret.invoiceId == null) return; // unattributed return — stock only
  const [inv] = await tx.select({
    paymentType: invoicesTable.paymentType, clientId: invoicesTable.clientId,
    truckId: invoicesTable.truckId, totalAmount: invoicesTable.totalAmount,
  }).from(invoicesTable).where(eq(invoicesTable.id, ret.invoiceId)).limit(1);
  if (!inv || inv.truckId !== ret.truckId) return; // never touch another truck's invoice

  const reverseAmount = ret.type === "void" ? Number(inv.totalAmount ?? 0) : reversedTotal;
  if (reverseAmount > 0) {
    if (inv.paymentType === "credit" && inv.clientId != null) {
      await tx.update(clientsTable).set({ balance: sql`${clientsTable.balance} + ${reverseAmount}`, updatedAt: new Date() }).where(eq(clientsTable.id, inv.clientId));
    } else if (inv.paymentType === "cash") {
      await tx.update(trucksTable).set({ cashBalance: sql`GREATEST(0, ${trucksTable.cashBalance} - ${reverseAmount})`, updatedAt: new Date() }).where(eq(trucksTable.id, inv.truckId));
    }
  }

  if (ret.type === "void") {
    await tx.update(invoicesTable).set({ isDeleted: true, updatedAt: new Date() }).where(eq(invoicesTable.id, ret.invoiceId));
    await tx.update(invoiceItemsTable).set({ isDeleted: true, updatedAt: new Date() }).where(eq(invoiceItemsTable.invoiceId, ret.invoiceId));
  }
}

// Apply a NEW client payment ONCE: reduce the client's debt and add the collected
// cash to the truck. Both columns are cloud-authoritative (RECONCILED_COLUMNS),
// so this delta is the only way they move for a payment.
async function applyClientPaymentEffects(
  tx: any,
  pay: { id: number; truckId: number | null; clientId: number; amount: number },
  _req: any,
) {
  if (!(pay.amount > 0)) return;
  await tx.update(clientsTable).set({ balance: sql`${clientsTable.balance} + ${pay.amount}`, updatedAt: new Date() }).where(eq(clientsTable.id, pay.clientId));
  if (pay.truckId != null) {
    await tx.update(trucksTable).set({ cashBalance: sql`${trucksTable.cashBalance} + ${pay.amount}`, updatedAt: new Date() }).where(eq(trucksTable.id, pay.truckId));
  }
}

export default router;
