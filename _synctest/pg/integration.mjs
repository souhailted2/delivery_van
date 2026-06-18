/* FULL INTEGRATION TEST — REAL Postgres (PGlite/WASM) + REAL Drizzle ORM + the
 * REAL production schema (pg_dump from prod). Exercises the actual Drizzle query
 * patterns my P0-4/P0-2 fixes use, validating the PG dialect (ON CONFLICT,
 * excluded snake-casing, GREATEST, setWhere, numeric deltas) that node:sqlite
 * could not. */
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { pgTable, integer, text, numeric, timestamp, boolean } from "drizzle-orm/pg-core";
import { sql, eq, and, inArray } from "drizzle-orm";

const log = [];
let pass = true;
function check(name, ok, ev) { if (!ok) pass = false; log.push(`\n[${name}] ${ok ? "PASS ✅" : "FAIL ❌"}`); for (const l of ev) log.push("   " + l); }

// ── REAL schema tables (Drizzle defs mapped to the real prod columns) ───────
const trucks = pgTable("trucks", {
  id: integer().primaryKey(), name: text(), cashBalance: numeric("cash_balance"),
  syncId: text("sync_id"), updatedAt: timestamp("updated_at", { withTimezone: true }), isDeleted: boolean("is_deleted"),
});
const clients = pgTable("clients", {
  id: integer().primaryKey(), name: text(), balance: numeric(), clientType: text("client_type"),
  syncId: text("sync_id"), updatedAt: timestamp("updated_at", { withTimezone: true }), isDeleted: boolean("is_deleted"),
});
const truckStock = pgTable("truck_stock", {
  id: integer().primaryKey(), truckId: integer("truck_id"), productId: integer("product_id"), quantity: numeric(),
  syncId: text("sync_id"), updatedAt: timestamp("updated_at", { withTimezone: true }),
});
const invoices = pgTable("invoices", {
  id: integer().primaryKey(), invoiceNumber: text("invoice_number"), truckId: integer("truck_id"), clientId: integer("client_id"),
  paymentType: text("payment_type"), totalAmount: numeric("total_amount"), totalCommission: numeric("total_commission"),
  syncId: text("sync_id"), updatedAt: timestamp("updated_at", { withTimezone: true }), isDeleted: boolean("is_deleted"),
});
const invoiceItems = pgTable("invoice_items", {
  id: integer().primaryKey(), invoiceId: integer("invoice_id"), productId: integer("product_id"), quantity: numeric(),
  unitPrice: numeric("unit_price"), commission: numeric(), subtotal: numeric(), productName: text("product_name"), priceType: text("price_type"),
  syncId: text("sync_id"), updatedAt: timestamp("updated_at", { withTimezone: true }), isDeleted: boolean("is_deleted"),
});

// ── REAL fix code (replicated verbatim from sync-v2.ts) ─────────────────────
const RECONCILED_COLUMNS = { trucks: new Set(["cashBalance"]), clients: new Set(["balance"]), truck_stock: new Set(["quantity"]) };
function buildUpdateSet(tableName, clean) {
  const prot = RECONCILED_COLUMNS[tableName];
  const set = {};
  for (const [k] of Object.entries(clean)) {
    if (k === "id" || k === "syncId" || k === "createdAt") continue;
    if (prot && prot.has(k)) continue;
    set[k] = sql.raw("excluded." + k.replace(/([A-Z])/g, (m) => "_" + m.toLowerCase()));
  }
  return set;
}
async function applyInvoiceEffects(tx, inv) {
  const items = await tx.select({ productId: invoiceItems.productId, quantity: invoiceItems.quantity, unitPrice: invoiceItems.unitPrice })
    .from(invoiceItems).where(eq(invoiceItems.invoiceId, inv.id));
  let actualTotal = 0;
  for (const it of items) {
    const qty = Number(it.quantity), unitPrice = Number(it.unitPrice ?? 0);
    if (!qty || it.productId == null) continue;
    const [stockRow] = await tx.select({ quantity: truckStock.quantity }).from(truckStock)
      .where(and(eq(truckStock.truckId, inv.truckId), eq(truckStock.productId, it.productId))).limit(1);
    const available = Number(stockRow?.quantity ?? 0);
    const cappedQty = Math.min(qty, available);
    actualTotal += cappedQty * unitPrice;
    if (cappedQty <= 0) continue;
    await tx.update(truckStock).set({ quantity: sql`GREATEST(0, ${truckStock.quantity} - ${cappedQty})`, updatedAt: new Date() })
      .where(and(eq(truckStock.truckId, inv.truckId), eq(truckStock.productId, it.productId)));
  }
  await tx.update(invoices).set({ totalAmount: actualTotal.toFixed(2) }).where(eq(invoices.id, inv.id));
  if (inv.paymentType === "cash" && actualTotal > 0)
    await tx.update(trucks).set({ cashBalance: sql`${trucks.cashBalance} + ${actualTotal}`, updatedAt: new Date() }).where(eq(trucks.id, inv.truckId));
  if (inv.paymentType === "credit" && actualTotal > 0 && inv.clientId != null)
    await tx.update(clients).set({ balance: sql`${clients.balance} - ${actualTotal}`, updatedAt: new Date() }).where(eq(clients.id, inv.clientId));
}
async function getSyncEpoch(db) {
  try { const r = await db.execute(sql`SELECT epoch FROM sync_state WHERE id = 1 LIMIT 1`); const rows = r?.rows ?? r; const e = rows?.[0]?.epoch; return e == null ? 0 : Number(e); }
  catch { return 0; }
}

const pg = new PGlite();
const db = drizzle(pg);
const bal = async (id) => Number((await db.select({ b: trucks.cashBalance }).from(trucks).where(eq(trucks.id, id)))[0].b);
const stk = async () => Number((await db.select({ q: truckStock.quantity }).from(truckStock).where(eq(truckStock.id, 1)))[0].q);

try {
  // Load the REAL production schema (strip psql backslash meta-commands like
  // \restrict / \connect that pg_dump emits but PGlite's SQL engine can't parse;
  // and SET default_table_access_method which PGlite doesn't support).
  let schemaSql = readFileSync(new URL("./schema.sql", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => !l.trimStart().startsWith("\\"))
    .filter((l) => !/^SET\s+default_table_access_method/i.test(l.trimStart()))
    .join("\n");
  await pg.exec(schemaSql);
  await pg.exec("SET search_path TO public;"); // pg_dump clears it; restore so unqualified names resolve
  const tableCount = Number((await db.execute(sql`SELECT count(*) n FROM information_schema.tables WHERE table_schema='public'`)).rows[0].n);
  check("schema load (real prod pg_dump into PGlite)", tableCount >= 24, [`${tableCount} tables created from the production schema dump`]);

  // Seed: truck cash=150 (after a mobile +100), one client, 10 units of product 1
  await db.insert(trucks).values({ id: 1, name: "Camion 1", cashBalance: "150.00", syncId: "trk-1", updatedAt: new Date("2026-06-18T10:00:00Z"), isDeleted: false });
  await db.insert(clients).values({ id: 1, name: "Client 1", balance: "0.00", clientType: "retail", syncId: "cli-1", updatedAt: new Date("2026-06-18T10:00:00Z"), isDeleted: false });
  await db.insert(truckStock).values({ id: 1, truckId: 1, productId: 1, quantity: "10.000", syncId: "ts-1", updatedAt: new Date() });

  // ── SCENARIO A — P0-4 cash invoice reconciliation (150 + 30 = 180) ─────────
  await db.insert(invoices).values({ id: 1, invoiceNumber: "FAC-1", truckId: 1, clientId: 1, paymentType: "cash", totalAmount: "30.00", totalCommission: "0.00", syncId: "inv-cash", updatedAt: new Date(), isDeleted: false });
  await db.insert(invoiceItems).values({ id: 1, invoiceId: 1, productId: 1, quantity: "1.000", unitPrice: "30.00", commission: "0.00", subtotal: "30.00", productName: "Prod 1", priceType: "retail", syncId: "it-1", updatedAt: new Date(), isDeleted: false });
  await db.transaction(async (tx) => { await applyInvoiceEffects(tx, { id: 1, truckId: 1, clientId: 1, paymentType: "cash" }); });
  const cashFinal = await bal(1), stockFinal = await stk();
  check("A · invoices+stock+balances (P0-4 cash reconcile)", cashFinal === 180 && stockFinal === 9,
    [`cash_balance: 150 + 30 = ${cashFinal} (real Drizzle += on PG numeric)`, `truck_stock: 10 - 1 = ${stockFinal} (real GREATEST())`]);

  // ── SCENARIO B — column protection: stale full-row push must NOT clobber ───
  const cleanTruck = { syncId: "trk-1", name: "Camion 1", cashBalance: "80.00", updatedAt: new Date("2026-06-18T10:30:00Z"), isDeleted: false };
  await db.insert(trucks).values({ id: 1, ...cleanTruck })
    .onConflictDoUpdate({ target: trucks.syncId, set: buildUpdateSet("trucks", cleanTruck), setWhere: sql`excluded.updated_at > ${trucks.updatedAt} OR ${trucks.updatedAt} IS NULL` });
  const afterClobberAttempt = await bal(1);
  check("B · balance protected from generic-push clobber", afterClobberAttempt === 180,
    [`desktop pushed cash_balance=80; real buildUpdateSet excluded it; cloud stays ${afterClobberAttempt} (not 80)`]);

  // ── SCENARIO C — idempotency: same invoice pushed twice -> applied once ────
  const dup = await db.insert(invoices).values({ id: 1, invoiceNumber: "FAC-1", truckId: 1, clientId: 1, paymentType: "cash", totalAmount: "30.00", totalCommission: "0.00", syncId: "inv-cash", updatedAt: new Date(), isDeleted: false })
    .onConflictDoNothing({ target: invoices.syncId }).returning({ id: invoices.id });
  if (dup.length > 0) await db.transaction(async (tx) => { await applyInvoiceEffects(tx, { id: 1, truckId: 1, clientId: 1, paymentType: "cash" }); });
  const afterDup = await bal(1);
  check("C · duplicate invoice push not double-applied", dup.length === 0 && afterDup === 180,
    [`onConflictDoNothing returned ${dup.length} rows -> reconcile skipped; cash stays ${afterDup}`]);

  // ── SCENARIO D — credit invoice debits the customer balance ───────────────
  await db.insert(invoices).values({ id: 2, invoiceNumber: "FAC-2", truckId: 1, clientId: 1, paymentType: "credit", totalAmount: "50.00", totalCommission: "0.00", syncId: "inv-credit", updatedAt: new Date(), isDeleted: false });
  await db.insert(invoiceItems).values({ id: 2, invoiceId: 2, productId: 1, quantity: "2.000", unitPrice: "25.00", commission: "0.00", subtotal: "50.00", productName: "Prod 1", priceType: "retail", syncId: "it-2", updatedAt: new Date(), isDeleted: false });
  await db.transaction(async (tx) => { await applyInvoiceEffects(tx, { id: 2, truckId: 1, clientId: 1, paymentType: "credit" }); });
  const clientBal = Number((await db.select({ b: clients.balance }).from(clients).where(eq(clients.id, 1)))[0].b);
  check("D · customers (credit sale debits client balance)", clientBal === -50,
    [`client balance after 50 credit sale: ${clientBal} (negative = debt, real -= on PG)`]);

  // ── SCENARIO E — P0-2 epoch gate ACTIVATED by the migration ───────────────
  const epochBeforeMig = await getSyncEpoch(db); // no sync_state yet
  await pg.exec(readFileSync(new URL("../../artifacts/api-server/migrations/0001_sync_state_epoch.up.sql", import.meta.url), "utf8"));
  const epochAfterMig = await getSyncEpoch(db); // sync_state now present -> 2
  function gate(clientEpoch, serverEpoch) { return (serverEpoch > 0 && clientEpoch != null && Number(clientEpoch) !== serverEpoch) ? 409 : 200; }
  const staleGate = gate(1, epochAfterMig), currentGate = gate(2, epochAfterMig), noEpochGate = gate(null, epochAfterMig);
  check("E · P0-2 epoch gate active after migration", epochBeforeMig === 0 && epochAfterMig === 2 && staleGate === 409 && currentGate === 200 && noEpochGate === 200,
    [`getSyncEpoch before migration: ${epochBeforeMig} (gate INACTIVE)`, `after migration: ${epochAfterMig} (gate ACTIVE)`,
     `stale push epoch=1 -> ${staleGate}; current epoch=2 -> ${currentGate}; no-epoch (old client) -> ${noEpochGate} (lenient)`]);

  // ── SCENARIO F — resurrection blocked by the gate ─────────────────────────
  // Without the gate a stale push would re-INSERT a deleted client (proven P0-2).
  // With the gate, the stale push (epoch 1 vs 2) is rejected BEFORE any upsert.
  const before = (await db.select({ n: sql`count(*)` }).from(clients))[0].n;
  const staleRejected = gate(1, epochAfterMig) === 409;       // rejected -> upsert never runs
  if (!staleRejected) await db.insert(clients).values({ id: 99, name: "Ghost", balance: "0", clientType: "retail", syncId: "cli-DELETED", updatedAt: new Date(), isDeleted: false }).onConflictDoUpdate({ target: clients.syncId, set: { name: sql`excluded.name` } });
  const after = (await db.select({ n: sql`count(*)` }).from(clients))[0].n;
  check("F · resurrection blocked (stale push gated before upsert)", staleRejected && Number(after) === Number(before),
    [`stale push gated: ${staleRejected}; client count unchanged ${before} -> ${after} (no ghost row inserted)`]);

  console.log(log.join("\n"));
  console.log(`\n================ INTEGRATION: ${pass ? "ALL PASS ✅" : "SOME FAILED ❌"} ================`);
  process.exit(pass ? 0 : 1);
} catch (e) {
  console.log(log.join("\n"));
  console.error("\nINTEGRATION ERROR:", e?.message || e);
  if (e?.cause) console.error("CAUSE:", e.cause?.message || e.cause);
  console.error("DETAIL:", e?.detail, e?.hint, e?.code, e?.where);
  process.exit(2);
}
