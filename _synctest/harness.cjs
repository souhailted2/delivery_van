/* SYNC P0 REPRODUCTION HARNESS — runs the REAL desktop sync code against a
 * node:sqlite-backed better-sqlite3 shim (no Postgres / no native build), plus
 * faithful SQL-level repros of the cloud upsert semantics (the exact
 * INSERT ... ON CONFLICT(sync_id) DO UPDATE the cloud's Drizzle generates).
 *
 * Each P0 prints  ===> REPRODUCED  or  ===> DISPROVEN  with evidence.
 * Pass MODE=fixed to re-run against the patched desktop code.
 */
const Module = require("node:module");
const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");
const { DatabaseSync } = require("node:sqlite");

const DESKTOP = path.resolve(__dirname, "..", "desktop", "server");
const MODE = process.env.MODE || "current";

// ── better-sqlite3 shim over node:sqlite ────────────────────────────────────
class Stmt {
  constructor(db, sql) { this.s = db.prepare(sql); }
  run(...a) { const r = this.s.run(...a); return { changes: Number(r.changes), lastInsertRowid: Number(r.lastInsertRowid) }; }
  get(...a) { return this.s.get(...a); }
  all(...a) { return this.s.all(...a); }
}
class BetterShim {
  constructor(file) { this.db = new DatabaseSync(file); }
  pragma(str) { try { this.db.exec(`PRAGMA ${str}`); } catch {} return []; }
  exec(sql) { this.db.exec(sql); return this; }
  prepare(sql) { return new Stmt(this.db, sql); }
  transaction(fn) { const db = this.db; return (...args) => { db.exec("BEGIN"); try { const r = fn(...args); db.exec("COMMIT"); return r; } catch (e) { try { db.exec("ROLLBACK"); } catch {} throw e; } }; }
  backup() { return Promise.resolve(); }
  close() { try { this.db.close(); } catch {} }
}

// Redirect require("better-sqlite3") -> shim, only while we load db.js
const origResolve = Module._resolveFilename;
const SHIM_ID = path.resolve(__dirname, "__bettershim.cjs");
fs.writeFileSync(SHIM_ID, `module.exports = require(${JSON.stringify(path.resolve(__dirname, "shimclass.cjs"))});`);
fs.writeFileSync(path.resolve(__dirname, "shimclass.cjs"), "module.exports = global.__BetterShim;");
global.__BetterShim = BetterShim;
Module._resolveFilename = function (request, ...rest) {
  if (request === "better-sqlite3") return SHIM_ID;
  return origResolve.call(this, request, ...rest);
};

// ── load REAL desktop db.js + config, init a temp DB ────────────────────────
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "synctest-"));
const config = require(path.join(DESKTOP, "config.js"));
if (config.setUserDataPath) config.setUserDataPath(tmpDir);
const db = require(path.join(DESKTOP, "db.js"));
db.initDb(tmpDir);
const { getDb, getSyncMeta, setSyncMeta } = db;

// ── load REAL sync-engine.js with internals exposed + mockable request ──────
function loadSyncEngine() {
  const file = path.join(DESKTOP, "sync-engine.js");
  let src = fs.readFileSync(file, "utf8");
  src += `\n;module.exports.__test = { push, getLocalChanges, attachFkSyncIds, upsertRecord, PUSH_TABLES, countPending, _setRequest: (f) => { request = f } };\n`;
  const m = new Module(file, module);
  m.filename = file;
  m.paths = Module._nodeModulePaths(path.dirname(file));
  m._compile(src, file);
  return m.exports.__test;
}
const eng = loadSyncEngine();

const results = [];
function record(id, name, reproduced, evidence) {
  results.push({ id, name, reproduced, evidence });
  console.log(`\n[${id}] ${name}`);
  for (const line of evidence) console.log("   " + line);
  console.log(`   ===> ${reproduced ? "REPRODUCED" : "DISPROVEN"}`);
}

function isoMinus(iso, ms) { return new Date(new Date(iso).getTime() - ms).toISOString(); }

// helper: a raw node:sqlite db for cloud-semantics repros
function rawDb() { return new DatabaseSync(":memory:"); }

// ============================================================================
// P0-1 — SILENT DATA LOSS (REAL desktop push())
// A row the cloud REJECTS (results.errors) must NOT be marked synced.
// ============================================================================
function p0_1() {
  const d = getDb();
  d.exec(`DELETE FROM clients`);
  // a committed local client, changed a minute ago (realistic: row edited, THEN
  // a sync cycle pushes it — so updated_at is in the PAST relative to push time)
  const ts = new Date(Date.now() - 60_000).toISOString();
  d.prepare(`INSERT INTO clients (sync_id, name, updated_at, is_deleted) VALUES (?,?,?,0)`)
    .run("cli-REJECT", "Boulangerie Test", ts);
  setSyncMeta("last_push_at", "1970-01-01T00:00:00.000Z");

  const pendingBefore = eng.getLocalChanges("clients", getSyncMeta("last_push_at")).map(r => r.sync_id);

  // Cloud accepts the request (HTTP 200) but REJECTS this row per-row.
  eng._setRequest(async () => ({
    status: 200,
    data: { ok: true, results: { clients: { received: 1, written: 0, errors: [{ sync_id: "cli-REJECT", error: "FK truck_sync_id unresolved" }] } } },
  }));

  return eng.push().then(() => {
    const cursorAfter = getSyncMeta("last_push_at");
    const pendingAfter = eng.getLocalChanges("clients", cursorAfter).map(r => r.sync_id);
    const stillPending = pendingAfter.includes("cli-REJECT");
    const rowExists = !!getDb().prepare(`SELECT 1 FROM clients WHERE sync_id='cli-REJECT'`).get();
    // REPRODUCED if the rejected row is NO LONGER pending (silently dropped) yet still exists locally
    const reproduced = !stillPending && rowExists;
    record("P0-1", "Silent data loss (cloud-rejected row marked synced)", reproduced, [
      `rejected row updated_at: ${ts}`,
      `pending before push: [${pendingBefore.join(", ")}]`,
      `cloud response: written=0, errors=[FK unresolved] for cli-REJECT`,
      `push() advanced cursor last_push_at -> ${cursorAfter}`,
      `rejected row still pending (will retry)? ${stillPending}`,
      `rejected row still exists locally (orphaned)? ${rowExists}`,
      reproduced ? "EVIDENCE: row rejected by cloud is NO LONGER selected for push -> permanently dropped, but still sits in local DB unsynced."
                 : "row remains pending -> would be retried (no loss).",
    ]);
    return reproduced;
  });
}

// ============================================================================
// P0-2 — RESURRECTION (cloud upsert semantics: ON CONFLICT(sync_id))
// A stale device pushing a row whose sync_id was hard-deleted re-INSERTs it.
// ============================================================================
function p0_2() {
  const c = rawDb(); // stands in for cloud Postgres
  c.exec(`CREATE TABLE clients (id INTEGER PRIMARY KEY, sync_id TEXT UNIQUE, name TEXT, is_deleted INTEGER DEFAULT 0, updated_at TEXT)`);
  c.prepare(`INSERT INTO clients (sync_id,name,is_deleted,updated_at) VALUES (?,?,?,?)`).run("cli-OLD", "Client Avant Reset", 0, "2026-06-10T00:00:00Z");
  const before = c.prepare(`SELECT COUNT(*) n FROM clients`).get().n;
  // FACTORY RESET = HARD DELETE (violates Sync Rule #2)
  c.exec(`DELETE FROM clients`);
  const afterReset = c.prepare(`SELECT COUNT(*) n FROM clients`).get().n;
  // A stale desktop/mobile pushes its still-present local row. The cloud's
  // generic upsert is exactly this (Drizzle .onConflictDoUpdate({target: syncId})):
  c.prepare(`
    INSERT INTO clients (sync_id,name,is_deleted,updated_at) VALUES (?,?,?,?)
    ON CONFLICT(sync_id) DO UPDATE SET name=excluded.name, updated_at=excluded.updated_at
    WHERE excluded.updated_at > clients.updated_at
  `).run("cli-OLD", "Client Avant Reset", 0, "2026-06-10T00:00:00Z");
  const afterPush = c.prepare(`SELECT COUNT(*) n FROM clients`).get().n;
  const resurrected = c.prepare(`SELECT name FROM clients WHERE sync_id='cli-OLD'`).get();
  const reproduced = afterReset === 0 && afterPush === 1 && !!resurrected;
  record("P0-2", "Resurrection (stale push re-inserts hard-deleted row)", reproduced, [
    `cloud rows before reset: ${before}`,
    `cloud rows after HARD DELETE (factory reset): ${afterReset}`,
    `stale device pushes row cli-OLD -> ON CONFLICT(sync_id) finds no surviving row -> falls through to INSERT`,
    `cloud rows after stale push: ${afterPush}  (resurrected: ${resurrected ? JSON.stringify(resurrected.name) : "none"})`,
    reproduced ? "EVIDENCE: a deleted entity reappears in the clean cloud DB from a stale device's push."
               : "no resurrection occurred.",
  ]);
  c.close();
  return reproduced;
}

// ============================================================================
// P0-3 — AUTHORITATIVE PRUNE WIPEOUT (exact mobile prune SQL on empty set)
// sync.ts:99-107 — empty authoritative set => prune ALL committed local rows.
// ============================================================================
function p0_3() {
  const m = rawDb(); // stands in for the mobile expo-sqlite DB
  m.exec(`CREATE TABLE clients (sync_id TEXT, name TEXT, is_deleted INTEGER DEFAULT 0, _pending INTEGER DEFAULT 0)`);
  m.exec(`CREATE TABLE truck_stock (sync_id TEXT, qty INTEGER, _pending INTEGER DEFAULT 0)`);
  // 3 valid committed clients + 2 valid committed truck_stock rows (synced, _pending=0)
  for (const n of ["A", "B", "C"]) m.prepare(`INSERT INTO clients (sync_id,name,is_deleted,_pending) VALUES (?,?,0,0)`).run("c" + n, n);
  for (const n of [1, 2]) m.prepare(`INSERT INTO truck_stock (sync_id,qty,_pending) VALUES (?,?,0)`).run("ts" + n, 10);
  const cliBefore = m.prepare(`SELECT COUNT(*) n FROM clients WHERE is_deleted=0`).get().n;
  const stkBefore = m.prepare(`SELECT COUNT(*) n FROM truck_stock`).get().n;

  // A truck-session pull returns an EMPTY authoritative set for clients/truck_stock
  // (e.g. the cloud per-table query threw and was swallowed to [] at sync-v2.ts:124).
  // Mobile then runs the exact empty-set prune branch (sync.ts:99-107):
  function pruneEmptyAuthoritative(table, hasSoftDelete) {
    if (hasSoftDelete) m.exec(`UPDATE ${table} SET is_deleted = 1 WHERE is_deleted = 0 AND _pending = 0`);
    else m.exec(`DELETE FROM ${table} WHERE _pending = 0`);
  }
  pruneEmptyAuthoritative("clients", true);      // clients has is_deleted
  pruneEmptyAuthoritative("truck_stock", false); // truck_stock is hard-deleted

  const cliAfter = m.prepare(`SELECT COUNT(*) n FROM clients WHERE is_deleted=0`).get().n;
  const stkAfter = m.prepare(`SELECT COUNT(*) n FROM truck_stock`).get().n;
  const reproduced = cliBefore === 3 && cliAfter === 0 && stkBefore === 2 && stkAfter === 0;
  record("P0-3", "Authoritative prune wipeout (empty pull deletes valid local data)", reproduced, [
    `valid clients before: ${cliBefore}, truck_stock before: ${stkBefore}`,
    `pull returns EMPTY authoritative set -> mobile runs the empty-set prune branch`,
    `valid clients after: ${cliAfter} (soft-deleted), truck_stock after: ${stkAfter} (hard-deleted)`,
    reproduced ? "EVIDENCE: one empty/garbled pull wipes the driver's entire customer + truck-stock list."
               : "data preserved.",
  ]);
  m.close();
  return reproduced;
}

// ============================================================================
// P0-4 — LOST UPDATE (cloud full-row LWW overwrite of a server-reconciled value)
// ============================================================================
function p0_4() {
  const c = rawDb(); // cloud
  c.exec(`CREATE TABLE trucks (sync_id TEXT UNIQUE, cash_balance INTEGER, updated_at TEXT)`);
  // Cloud truck cash_balance = 150 after a MOBILE cash sale did an atomic += 100 (from 50).
  c.prepare(`INSERT INTO trucks (sync_id,cash_balance,updated_at) VALUES (?,?,?)`).run("trk-1", 150, "2026-06-18T10:00:00.000Z");
  const cloudAfterMobile = c.prepare(`SELECT cash_balance FROM trucks WHERE sync_id='trk-1'`).get().cash_balance;

  // Desktop never saw the mobile +100. It computed locally from its stale base 50,
  // added a 30 sale -> 80, and pushes the WHOLE trucks row (buildUpdateSet copies
  // every column) with a NEWER updated_at. The cloud generic upsert:
  c.prepare(`
    INSERT INTO trucks (sync_id,cash_balance,updated_at) VALUES (?,?,?)
    ON CONFLICT(sync_id) DO UPDATE SET cash_balance=excluded.cash_balance, updated_at=excluded.updated_at
    WHERE excluded.updated_at > trucks.updated_at
  `).run("trk-1", 80, "2026-06-18T10:05:00.000Z");

  const cloudFinal = c.prepare(`SELECT cash_balance FROM trucks WHERE sync_id='trk-1'`).get().cash_balance;
  const correct = 180; // 50 + 100 (mobile) + 30 (desktop)
  const reproduced = cloudAfterMobile === 150 && cloudFinal === 80 && cloudFinal !== correct;
  record("P0-4", "Lost update (desktop full-row push clobbers mobile delta)", reproduced, [
    `cloud cash_balance after mobile atomic +100: ${cloudAfterMobile}`,
    `desktop pushes whole row cash_balance=80 (its local view) with newer updated_at`,
    `cloud cash_balance AFTER desktop push: ${cloudFinal}  (correct value should be ${correct})`,
    reproduced ? `EVIDENCE: the mobile +100 is ERASED — ${correct - cloudFinal} DZD of cash lost to a last-write-wins full-row overwrite.`
               : "no lost update.",
  ]);
  c.close();
  return reproduced;
}

// ============================================================================
// REGRESSION — happy path (REAL desktop push): all rows accepted -> cursor MUST
// advance so synced rows are not re-pushed forever (P0-1 fix must not regress).
// ============================================================================
async function regression_happy() {
  const d = getDb();
  d.exec(`DELETE FROM clients`);
  const ts = new Date(Date.now() - 60_000).toISOString();
  d.prepare(`INSERT INTO clients (sync_id, name, updated_at, is_deleted) VALUES (?,?,?,0)`).run("cli-OK", "Accepted Client", ts);
  setSyncMeta("last_push_at", "1970-01-01T00:00:00.000Z");
  eng._setRequest(async () => ({ status: 200, data: { ok: true, results: { clients: { received: 1, written: 1, errors: [] } } } }));
  await eng.push();
  const cursor = getSyncMeta("last_push_at");
  const stillPending = eng.getLocalChanges("clients", cursor).map(r => r.sync_id).includes("cli-OK");
  const advancedToNow = new Date(cursor).getTime() > new Date(ts).getTime();
  const ok = !stillPending && advancedToNow;
  console.log(`\n[REGRESSION] happy-path push (all accepted)`);
  console.log(`   cursor advanced to now(): ${advancedToNow} (${cursor})`);
  console.log(`   accepted row no longer pending (correctly synced): ${!stillPending}`);
  console.log(`   ===> ${ok ? "PASS ✅ (no regression)" : "FAIL ❌"}`);
  return ok;
}

(async () => {
  console.log(`\n================ SYNC P0 HARNESS (MODE=${MODE}) ================`);
  const r1 = await p0_1();
  const r2 = p0_2();
  const r3 = p0_3();
  const r4 = p0_4();
  await regression_happy();
  console.log("\n================ SUMMARY ================");
  for (const r of results) console.log(`${r.id}  ${r.reproduced ? "REPRODUCED " : "DISPROVEN  "}  ${r.name}`);
  // cleanup
  try { db.closeDb && db.closeDb(); } catch {}
  Module._resolveFilename = origResolve;
})().catch((e) => { console.error("HARNESS ERROR:", e); process.exit(1); });
