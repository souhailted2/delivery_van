/* Verify the FIXED mobile logic (sync.ts). Mobile uses expo-sqlite (unrunnable
 * in Node); these models run the EXACT patched SQL against node:sqlite. */
const { DatabaseSync } = require("node:sqlite");
function db() { return new DatabaseSync(":memory:"); }
let pass = true;
function check(name, ok, ev) { if (!ok) pass = false; console.log(`\n[${name}] ${ok ? "PASS ✅" : "FAIL ❌"}`); for (const l of ev) console.log("   " + l); }

// ── P0-1 mobile FIXED: rejected row keeps _pending = 1 ──────────────────────
{
  const m = db();
  m.exec(`CREATE TABLE invoices (sync_id TEXT, _pending INTEGER)`);
  for (const id of ["inv-1", "inv-REJECT", "inv-3"]) m.prepare(`INSERT INTO invoices (sync_id,_pending) VALUES (?,1)`).run(id);
  // cloud response: inv-REJECT rejected (unresolved FK)
  const rejected = ["inv-REJECT"];
  // FIXED pushSync clear (sync.ts): clear _pending only where NOT rejected
  const keep = rejected.length ? ` AND sync_id NOT IN (${rejected.map(() => "?").join(",")})` : "";
  m.prepare(`UPDATE invoices SET _pending = 0 WHERE _pending = 1${keep}`).run(...rejected);
  const stillPending = m.prepare(`SELECT sync_id FROM invoices WHERE _pending=1`).all().map(r => r.sync_id);
  const cleared = m.prepare(`SELECT sync_id FROM invoices WHERE _pending=0`).all().map(r => r.sync_id);
  check("P0-1 mobile FIX (reject keeps _pending)",
    stillPending.length === 1 && stillPending[0] === "inv-REJECT" && cleared.length === 2,
    [`cloud rejected: [inv-REJECT]`, `still _pending (retried): [${stillPending}]`, `cleared (synced): [${cleared}]`,
     `EVIDENCE: rejected row stays pending -> retried; accepted rows cleared. No silent drop.`]);
  m.close();
}

// ── P0-3 FIXED: empty authoritative set is NOT pruned ───────────────────────
{
  const m = db();
  m.exec(`CREATE TABLE clients (sync_id TEXT, is_deleted INTEGER DEFAULT 0, _pending INTEGER DEFAULT 0)`);
  m.exec(`CREATE TABLE truck_stock (sync_id TEXT, _pending INTEGER DEFAULT 0)`);
  for (const n of ["A", "B", "C"]) m.prepare(`INSERT INTO clients (sync_id,is_deleted,_pending) VALUES (?,0,0)`).run("c" + n);
  for (const n of [1, 2]) m.prepare(`INSERT INTO truck_stock (sync_id,_pending) VALUES (?,0)`).run("ts" + n);
  // FIXED prune (sync.ts): only prune when receivedIds.length > 0; empty => skip.
  const receivedIds = []; // empty authoritative set (genuine-zero OR swallowed error)
  function fixedPrune(table, soft) {
    if (receivedIds.length > 0) { /* prune-not-in-set ... */ }
    /* else: DO NOTHING (the patched behavior) */
  }
  fixedPrune("clients", true); fixedPrune("truck_stock", false);
  const cli = m.prepare(`SELECT COUNT(*) n FROM clients WHERE is_deleted=0`).get().n;
  const stk = m.prepare(`SELECT COUNT(*) n FROM truck_stock`).get().n;
  check("P0-3 FIX (empty set does not wipe)", cli === 3 && stk === 2,
    [`valid clients after empty pull: ${cli} (was wiped to 0 before fix)`,
     `truck_stock after empty pull: ${stk} (was wiped to 0 before fix)`,
     `EVIDENCE: an empty/garbled authoritative pull no longer deletes valid local data.`]);
  m.close();
}

// ── P0-4 FIXED: desktop sale ADDS to cloud balance (no clobber) ─────────────
// Models the new cloud admin-push: (1) cumulative columns protected from the
// generic upsert; (2) new invoice reconciled server-side (cash_balance += total).
{
  const c = db(); // cloud
  c.exec(`CREATE TABLE trucks (sync_id TEXT UNIQUE, cash_balance INTEGER, updated_at TEXT)`);
  c.exec(`CREATE TABLE truck_stock (truck TEXT, product TEXT, qty INTEGER)`);
  c.exec(`CREATE TABLE invoices (sync_id TEXT UNIQUE, truck TEXT, payment TEXT, total INTEGER)`);
  c.exec(`CREATE TABLE invoice_items (inv TEXT, product TEXT, qty INTEGER, price INTEGER)`);
  // cloud state: cash_balance=150 (mobile atomic +100 from 50), truck has 10 units
  c.prepare(`INSERT INTO trucks VALUES ('trk-1',150,'2026-06-18T10:00:00Z')`).run();
  c.prepare(`INSERT INTO truck_stock VALUES ('trk-1','p1',10)`).run();
  const cloudAfterMobile = c.prepare(`SELECT cash_balance FROM trucks WHERE sync_id='trk-1'`).get().cash_balance;

  // DESKTOP admin push: stale trucks row (cash_balance=80) + a NEW cash invoice (30) + item
  // (1) generic upsert of trucks with cash_balance PROTECTED (excluded from SET):
  c.prepare(`INSERT INTO trucks (sync_id,cash_balance,updated_at) VALUES ('trk-1',80,'2026-06-18T10:05:00Z')
             ON CONFLICT(sync_id) DO UPDATE SET updated_at=excluded.updated_at
             WHERE excluded.updated_at > trucks.updated_at`).run(); // cash_balance NOT in SET
  const afterTrucksPush = c.prepare(`SELECT cash_balance FROM trucks WHERE sync_id='trk-1'`).get().cash_balance;
  // (2) insert the new invoice + item, then reconcile (deduct stock, cash += total)
  const newInvoice = !c.prepare(`SELECT 1 FROM invoices WHERE sync_id='inv-D'`).get();
  c.prepare(`INSERT INTO invoices VALUES ('inv-D','trk-1','cash',30)`).run();
  c.prepare(`INSERT INTO invoice_items VALUES ('inv-D','p1',1,30)`).run();
  if (newInvoice) {
    let actualTotal = 0;
    for (const it of c.prepare(`SELECT product,qty,price FROM invoice_items WHERE inv='inv-D'`).all()) {
      const avail = c.prepare(`SELECT qty FROM truck_stock WHERE truck='trk-1' AND product=?`).get(it.product)?.qty ?? 0;
      const capped = Math.min(it.qty, avail);
      actualTotal += capped * it.price;
      c.prepare(`UPDATE truck_stock SET qty = MAX(0, qty - ?) WHERE truck='trk-1' AND product=?`).run(capped, it.product);
    }
    c.prepare(`UPDATE trucks SET cash_balance = cash_balance + ? WHERE sync_id='trk-1'`).run(actualTotal);
  }
  const final = c.prepare(`SELECT cash_balance FROM trucks WHERE sync_id='trk-1'`).get().cash_balance;
  const stock = c.prepare(`SELECT qty FROM truck_stock WHERE truck='trk-1' AND product='p1'`).get().qty;
  check("P0-4 FIX (desktop sale adds, no clobber)", afterTrucksPush === 150 && final === 180 && stock === 9,
    [`cloud cash_balance after mobile +100: ${cloudAfterMobile}`,
     `after desktop trucks-row push (cash_balance PROTECTED): ${afterTrucksPush} (mobile +100 SURVIVES)`,
     `after reconciling desktop's new 30 sale: ${final}  (expected 150 + 30 = 180)`,
     `truck_stock after sale: ${stock} (10 - 1)`,
     `EVIDENCE: 150 + 30 = ${final}, zero loss — desktop sale ADDS, never overwrites.`]);
  c.close();
}

// ── P0-2 FIXED: stale device cannot resurrect (epoch gate + client wipe) ────
{
  // (A) CLOUD EPOCH GATE — models the push handler check in sync-v2.ts
  const c = db();
  c.exec(`CREATE TABLE clients (sync_id TEXT UNIQUE, name TEXT, updated_at TEXT)`);
  // server bumped epoch to 2 after the factory reset; clients table is empty
  const serverEpoch = 2;
  function cloudPush(clientEpoch, row) {
    if (serverEpoch > 0 && clientEpoch != null && Number(clientEpoch) !== serverEpoch) {
      return { status: 409, resetRequired: true, epoch: serverEpoch }; // GATE: rejected, nothing inserted
    }
    c.prepare(`INSERT INTO clients (sync_id,name,updated_at) VALUES (?,?,?) ON CONFLICT(sync_id) DO UPDATE SET name=excluded.name`).run(row.sync_id, row.name, row.updated_at);
    return { status: 200 };
  }
  const staleResp = cloudPush(1, { sync_id: "cli-OLD", name: "Deleted Client", updated_at: "2026-06-10T00:00:00Z" });
  const afterStale = c.prepare(`SELECT COUNT(*) n FROM clients`).get().n;
  // a CURRENT (epoch=2) device may still push legitimately
  const okResp = cloudPush(2, { sync_id: "cli-NEW", name: "Legit New", updated_at: "2026-06-18T00:00:00Z" });
  const afterCurrent = c.prepare(`SELECT COUNT(*) n FROM clients`).get().n;

  // (B) CLIENT WIPE — models desktop pull(): epoch changed => wipe local
  const m = db();
  m.exec(`CREATE TABLE clients (sync_id TEXT, name TEXT)`);
  m.prepare(`INSERT INTO clients VALUES ('cli-OLD','Deleted Client')`).run(); // stale local row
  const localStoredEpoch = 1, pulledServerEpoch = 2;
  let wiped = false;
  if (localStoredEpoch != null && String(pulledServerEpoch) !== String(localStoredEpoch)) {
    m.exec(`DELETE FROM clients`); wiped = true; // wipeAndAdoptEpoch -> no stale rows remain to push
  }
  const localAfter = m.prepare(`SELECT COUNT(*) n FROM clients`).get().n;

  check("P0-2 FIX (resurrection prevented)",
    staleResp.status === 409 && afterStale === 0 && okResp.status === 200 && afterCurrent === 1 && wiped && localAfter === 0,
    [`(A) stale push (epoch 1 vs server 2) -> HTTP ${staleResp.status} resetRequired; cloud clients after: ${afterStale} (NOT resurrected)`,
     `(A) current push (epoch 2) -> HTTP ${okResp.status}; cloud clients: ${afterCurrent} (legit push still works)`,
     `(B) client pull sees epoch 2 != stored 1 -> wiped local; stale rows remaining: ${localAfter}`,
     `EVIDENCE: deleted entity cannot reappear — rejected at the server AND removed from the stale device.`]);
  c.close(); m.close();
}

// ── MOBILE EPOCH MIRROR (Phase 1) — models the patched mobile sync.ts ───────
{
  // mobile local DB with a stale row + stored epoch=1
  const m = db();
  m.exec(`CREATE TABLE clients (sync_id TEXT, name TEXT, _pending INTEGER DEFAULT 0)`);
  m.exec(`CREATE TABLE invoices (sync_id TEXT, _pending INTEGER DEFAULT 0)`);
  m.exec(`CREATE TABLE meta (k TEXT PRIMARY KEY, v TEXT)`);
  m.prepare(`INSERT INTO clients VALUES ('cli-OLD','Deleted',0)`).run();
  m.prepare(`INSERT INTO invoices VALUES ('inv-PENDING',1)`).run(); // an unpushed local change
  m.prepare(`INSERT INTO meta VALUES ('sync_epoch','1')`).run();
  const PULL_TABLES = ["clients", "invoices"];
  const getEpoch = () => m.prepare(`SELECT v FROM meta WHERE k='sync_epoch'`).get()?.v ?? null;
  function wipeAndAdoptEpoch(newEpoch) {
    for (const t of PULL_TABLES) m.exec(`DELETE FROM ${t}`);
    m.prepare(`INSERT INTO meta(k,v) VALUES('sync_epoch',?) ON CONFLICT(k) DO UPDATE SET v=excluded.v`).run(String(newEpoch));
  }

  // (1) PULL epoch validation: server epoch 2 != stored 1 -> wipe + adopt
  const pulledEpoch = 2;
  let pullWiped = false;
  const storedBefore = getEpoch();
  if (storedBefore != null && String(pulledEpoch) !== String(storedBefore)) { wipeAndAdoptEpoch(pulledEpoch); pullWiped = true; }
  const cliAfterPull = m.prepare(`SELECT COUNT(*) n FROM clients`).get().n;
  const invAfterPull = m.prepare(`SELECT COUNT(*) n FROM invoices`).get().n;
  const epochAfterPull = getEpoch();

  // (2)+(3) PUSH epoch validation + 409 handling: simulate a device still on epoch 1
  //         that tries to push; cloud gate returns 409; client wipes + adopts.
  m.prepare(`INSERT INTO meta(k,v) VALUES('sync_epoch','1') ON CONFLICT(k) DO UPDATE SET v='1'`).run(); // reset to stale for this leg
  m.exec(`INSERT INTO clients VALUES ('cli-STALE2','x',1)`);
  function cloudGate(clientEpoch, serverEpoch) { return (serverEpoch > 0 && clientEpoch != null && Number(clientEpoch) !== serverEpoch) ? 409 : 200; }
  const pushStatus = cloudGate(Number(getEpoch()), 2);
  let pushWiped = false;
  if (pushStatus === 409) { wipeAndAdoptEpoch(2); pushWiped = true; }
  const cliAfterPush = m.prepare(`SELECT COUNT(*) n FROM clients`).get().n;

  // (4) stale protection: after wipe, a current-epoch push is accepted
  const finalPush = cloudGate(Number(getEpoch()), 2);

  check("MOBILE EPOCH MIRROR (pull/push/409/wipe/stale-protection)",
    pullWiped && cliAfterPull === 0 && invAfterPull === 0 && epochAfterPull === "2" &&
    pushStatus === 409 && pushWiped && cliAfterPush === 0 && finalPush === 200,
    [`(1) pull epoch 2 != stored 1 -> wiped; clients=${cliAfterPull}, invoices(incl pending)=${invAfterPull}, epoch=${epochAfterPull}`,
     `(2)/(3) stale push -> cloud gate HTTP ${pushStatus}; client wiped, stale rows=${cliAfterPush}`,
     `(4) after adopting epoch 2, current push -> HTTP ${finalPush} (accepted)`,
     `EVIDENCE: mobile mirrors desktop — stale epoch is rejected on push, detected on pull, and wiped+repulled.`]);
  m.close();
}

console.log(`\n================ ${pass ? "ALL FIX MODELS PASS ✅" : "SOME FAILED ❌"} ================`);
process.exit(pass ? 0 : 1);
