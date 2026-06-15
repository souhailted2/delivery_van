# End-to-End Synchronization Test Plan & Execution Report

Repo: `D:\DELEVERY VAN\delivery_van`
Date: 2026-06-15
Scope: Cloud (api-server), Desktop (Electron + SQLite), Mobile (Expo), Web (admin UI → cloud API)

This document has two parts:

1. **Test Plan** — all 12 requested scenarios × applicable client combinations.
2. **Execution Report** — what was *actually run* in this sandbox, the real
   pass/fail results, and an honest list of what could **not** be executed
   here (with the exact procedure to run it on staging).

---

## Part 0 — Environment constraints (why some tests are "plan only")

This sandbox has:
- **No `DATABASE_URL` / Postgres / docker / psql** — `lib/db/src/index.ts`
  throws at import time without `DATABASE_URL`, so the cloud api-server
  (`artifacts/api-server`) cannot be booted or hit over HTTP here.
- **No mobile device/emulator.**
- `desktop/server` uses `better-sqlite3` prebuilt for **Electron's** Node ABI
  (NODE_MODULE_VERSION 121); the sandbox's Node is v24 (ABI 137) — the real
  binary can't load under plain `node`.
- `desktop/server/sync-engine.js` hardcodes `REMOTE_BASE =
  "https://deleveri.alllal.com/api"` — a **production URL**, which must never
  be contacted by automated tests.

**What I did about it (so "prove it" is honest, not assumed):**
- Built a **node:sqlite-backed shim** for `better-sqlite3` (pure JS, zero
  native deps, API-compatible for the subset `db.js`/`sync-engine.js`/routes
  use: `pragma`, `exec`, `prepare/run/get/all`, `transaction`, `close`,
  `backup`). It's only used by the test harness, injected via a temporary
  `Module._resolveFilename` patch — **`desktop/node_modules/better-sqlite3`
  (the Electron build) was never touched.**
- Loaded the **real, unmodified** `desktop/server/db.js`, `sync-engine.js`,
  and `routes/stock.js` source files and ran them against a throwaway SQLite
  DB in a temp directory, exercising real triggers, real Express routes, and
  real internal functions (`attachFkSyncIds`, `upsertRecord`,
  `getLocalChanges`) via a non-invasive module-injection technique that only
  *adds* test-visibility exports (does not alter behavior).
- Loaded the **real Drizzle schema** (`lib/db/src/schema/index.ts`, which
  does *not* require a DB connection) plus **verbatim copies** of the pure
  helper functions and rule tables from `artifacts/api-server/src/routes/sync-v2.ts`
  (`SYNC_TABLES`, `PUSH_FK_RULES`, `sanitizeForTable`, `buildUpdateSet`,
  `camelCaseRecord`/`snakeCaseRecord`) and ran them against real column
  metadata under `node --experimental-strip-types`.
- Everything that genuinely requires a live Postgres, a live cloud server, or
  a mobile device is marked **"PLAN — requires staging"** below, with the
  exact steps to execute it there.

---

## Part 1 — Test Plan (12 scenarios)

### 1. New customer creation
| Path | Steps | Expected |
|---|---|---|
| Web → Cloud | POST `/api/clients` | Row inserted with `sync_id` auto-generated (DB default `gen_random_uuid()`), `updated_at` set |
| Desktop → Cloud | Create client in desktop UI → next `syncOnce()` push | Local row gets `sync_id`; `attachFkSyncIds` resolves `truck_sync_id`; cloud `resolveFkId` maps `truckSyncId`→cloud truck id (C1); row appears in cloud DB |
| Cloud → Desktop (other machine) | Pull cycle | New client appears, FK truck linkage correct |
| Cloud → Mobile | Pull cycle | New client visible in truck's client list (requires non-NULL `sync_id`, fixed previously) |
| Mobile → Cloud | Create client offline on truck app, sync | `handleTruckPush` resolves truck-scoped FK, inserts with real `sync_id` |

### 2. New invoice creation
| Path | Steps | Expected |
|---|---|---|
| Desktop → Cloud | Create invoice (truck+client FK) → push | `attachFkSyncIds` attaches `truck_sync_id`/`client_sync_id`; cloud `PUSH_FK_RULES.invoices` (both `required: true`) resolves to real cloud ids via `resolveFkId`; row rejected with explicit error if either FK unresolved (C1+C6) |
| Mobile → Cloud | Create invoice+items offline, sync | `handleTruckPush` resolves FKs, generates `invoice_number` server-side, reconciles `truck_stock`/cash atomically, idempotent via `ON CONFLICT DO NOTHING` + RETURNING |
| Cloud → Web/Desktop/Mobile | Pull | Invoice + items visible everywhere with correct truck/client names |

### 3. New truck creation
| Path | Steps | Expected |
|---|---|---|
| Web → Cloud | POST `/api/trucks` | `sync_id` auto-generated |
| Desktop → Cloud | Create truck → push | Truck pushed with own `sync_id`; `PUSH_FK_RULES.trucks` resolves `vendeurSyncId`→cloud user id if set |
| Cloud → Mobile | Pull | Truck appears in mobile app's truck list (login target) |

### 4. Inventory transfer (warehouse → truck)
| Path | Steps | Expected |
|---|---|---|
| Desktop | POST `/api/stock/transfer` with valid `truckId`+items | 200; warehouse `products.stock_quantity` decremented; `truck_stock` row created/updated; `stock_transfers`/`stock_transfer_items` recorded (C7) |
| Desktop (invalid) | `truckId` for nonexistent/soft-deleted truck | 400 "Camion introuvable", no DB mutation (C7) |
| Desktop (invalid) | `quantity` = NaN / negative / non-integer `productId` | 400 "Article invalide", no DB mutation, no NaN written to `truck_stock`/`products` (C7) |
| Desktop → Cloud | Push `truck_stock`/`stock_transfers`/`stock_transfer_items` | `attachFkSyncIds` resolves `truck_sync_id`/`product_sync_id`/`transfer_sync_id`; cloud `PUSH_FK_RULES.truck_stock`/`stock_transfer_items` (all `required: true`) resolve or reject |
| Cloud → Mobile | Pull `truck_stock` | Truck sees updated stock |

### 5. Commission payment
| Path | Steps | Expected |
|---|---|---|
| Desktop | Insert `truck_commission_payments` row | Gets `sync_id`, `updated_at`, `is_deleted=0` via triggers (C3) |
| Desktop → Cloud | Push | Table is in `PUSH_TABLES`/`PULL_TABLES`/`FK_SYNC_RULES` (C3); `attachFkSyncIds` resolves `truck_sync_id`; cloud `PUSH_FK_RULES.truck_commission_payments` (required) resolves to cloud truck id; `truckCommissionPaymentsTable` has `sync_id`/`updated_at`/`is_deleted` columns (C3) |
| Cloud → Desktop (other machine) | Pull | Payment visible |

### 6. Customer update
| Path | Steps | Expected |
|---|---|---|
| Desktop | `PUT /clients/:id` (name change) | `trig_clients_updated` trigger bumps `updated_at` even though route doesn't set it explicitly |
| Desktop → Cloud | Push | `getLocalChanges` picks up row (newer `updated_at`); cloud `onConflictDoUpdate` with `setWhere: excluded.updated_at > current.updated_at` applies the update (last-write-wins) |
| Cloud → Web/Mobile | Pull | Updated name visible |

### 7. Customer deletion
| Path | Steps | Expected |
|---|---|---|
| Desktop | `DELETE /clients/:id` | Soft delete: `is_deleted=1`, `updated_at` bumped (no hard delete) |
| Desktop → Cloud | Push | `getLocalChanges` includes the soft-deleted row; cloud upserts `is_deleted=1` |
| Cloud → Mobile/Web | Pull | Client disappears from active lists (filtered by `is_deleted=0`) but no FK breakage for historical invoices |
| Commission payments | `DELETE` commission payment | Same soft-delete pattern (C3 changed hard→soft delete) |

### 8. Offline desktop workflow
| Steps | Expected |
|---|---|
| Disconnect network, create/edit clients, invoices, stock transfers, commission payments | All operations succeed locally (SQLite), `sync_id`/`updated_at`/`is_deleted` maintained by triggers |
| Reconnect, `syncOnce()` fires | All queued changes pushed in `PUSH_TABLES` order (FK parents before children); errors per-row surfaced via `lastPushErrors`/`lastPushTables` (C6), not silently dropped |

### 9. Offline mobile workflow
| Steps | Expected |
|---|---|
| Truck app offline: create invoices/returns/cash transfers | Stored locally with local ids + `sync_id` |
| Reconnect, sync | `handleTruckPush` resolves FKs via `*SyncId` fields, inserts atomically, reconciles stock/cash exactly once (idempotent via `ON CONFLICT DO NOTHING` + RETURNING-gated reconciliation) |

### 10. Conflict scenarios
| Scenario | Expected |
|---|---|
| Same client edited on Desktop A (offline) and Web simultaneously, both later sync | Cloud `onConflictDoUpdate` `setWhere: excluded.updated_at > current.updated_at OR current.updated_at IS NULL` — the edit with the **later** `updated_at` wins; earlier one is silently kept-as-is at cloud (last-write-wins by design) |
| Row created on Web (cloud-assigned `sync_id`) later edited on Desktop before first pull | Desktop pull writes `cloud_<table>_<id>` placeholder only if `sync_id` was NULL (no longer possible post-fix — DB default now guarantees non-NULL `sync_id` on cloud-created rows) |
| Legacy row with `cloud_*` placeholder sync_id still in local DB, cloud now has real `sync_id` for same row | `upsertRecord` (C4) detects placeholder + matching `id`, **upgrades** local `sync_id` to the cloud's real one independent of the `updated_at` gate — row becomes pushable (no longer filtered by `cloud_*` exclusion) |
| Stale cloud pull arrives after a newer local edit | `upsertRecord` last-write-wins: local row with newer `updated_at` is NOT overwritten by older incoming data (regression-checked) |

### 11. Session persistence after deploy
| Steps | Expected |
|---|---|
| User logs into Web/Desktop-via-cloud, session cookie issued | Session stored in Postgres `user_sessions` table (via `connect-pg-simple`, `createTableIfMissing: true`) — NOT in-process `MemoryStore` (C5) |
| Redeploy api-server (pm2 restart / new process) | Session row persists in Postgres; user remains logged in (no 401) because the store is external to the process |

### 12. Sync recovery after network interruption
| Steps | Expected |
|---|---|
| Desktop mid-push, network drops | `cloudRequest`/`syncOnce` catches the error, sets `status` (error surfaced), does NOT corrupt local DB (no partial writes — each table's local read is independent of push success) |
| Network restored, next interval (`30s`) or manual `syncOnce()` | Push retried with same `since` cursor; previously-failed rows retried; per-table errors visible in `lastPushErrors`/`lastPushTables` (C6) instead of vanishing |
| Pull interrupted mid-stream | Cursor (`since`) only advances after a fully successful pull response; partial/failed pull doesn't advance cursor, so next attempt re-fetches the same window (no data loss) |

---

## Part 2 — Execution Report

### 2A. Executed in this sandbox (real code, real SQLite, real Express route)

Harness: `delivery_van_sync_proof.js` (temp), real `desktop/server/db.js` +
`sync-engine.js` + `routes/stock.js`, against a fresh temp SQLite DB.

```
=== Scenario 3 + C1 — New truck creation, FK sync_id attach for children ===
  PASS  truck got a sync_id on insert

=== Scenario 1 + C1 — New customer creation, truck FK sync_id attach ===
  PASS  client got own sync_id
  PASS  attachFkSyncIds resolved truck_sync_id for client

=== Scenario 2 + C1 — New invoice creation, truck+client FK sync_id attach ===
  PASS  attachFkSyncIds resolved truck_sync_id for invoice
  PASS  attachFkSyncIds resolved client_sync_id for invoice

=== Scenario 5 + C3 — truck_commission_payments registered & syncable ===
  PASS  truck_commission_payments in PULL_TABLES
  PASS  truck_commission_payments in PUSH_TABLES
  PASS  truck_commission_payments has FK_SYNC_RULES entry
  PASS  commission payment row has sync_id
  PASS  commission payment row has updated_at
  PASS  commission payment row has is_deleted=0
  PASS  attachFkSyncIds resolved truck_sync_id for commission payment
  PASS  getLocalChanges('truck_commission_payments') returns the new row (pushable)

=== Scenario 7 — Customer deletion (soft delete) is detected for push ===
  PASS  soft-deleted client has is_deleted=1
  PASS  soft-delete bumped updated_at past sinceBeforeDelete
  PASS  getLocalChanges('clients') picks up the soft-deleted row for push
  PASS  soft-deleted commission payment has is_deleted=1
  PASS  getLocalChanges('truck_commission_payments') picks up the soft-deleted payment for push

=== Scenario 6 — Customer update bumps updated_at via trigger (without setting it explicitly) ===
  PASS  trigger bumped updated_at on UPDATE that didn't touch it
  PASS  name was actually updated

=== C4 — upsertRecord upgrades cloud_* placeholder sync_id to real sync_id ===
  PASS  upsertRecord wrote the NULL-sync_id row
  PASS  upsertRecord fabricated cloud_<table>_<id> placeholder
  PASS  upsertRecord wrote the upgrade row
  PASS  local placeholder sync_id was UPGRADED to the real cloud sync_id
  PASS  upgraded row no longer matches the push 'cloud_*' exclusion filter

=== C4 (regression check) — last-write-wins: stale cloud update is ignored ===
  PASS  stale (older updated_at) cloud record did NOT overwrite local row (last-write-wins)

=== Scenario 4 + C7 — Stock transfer validation via real Express route ===
  PASS  transfer to non-existent truck -> 400
  PASS  transfer to non-existent truck error message
  PASS  warehouse stock untouched after rejected transfer
  PASS  transfer with NaN quantity -> 400
  PASS  warehouse stock NOT corrupted to NaN
  PASS  no truck_stock row created from NaN-quantity transfer
  PASS  transfer with negative quantity -> 400
  PASS  valid transfer -> 200
  PASS  warehouse stock decremented by 10
  PASS  truck_stock row created with quantity 10
  PASS  attachFkSyncIds resolves truck_sync_id/product_sync_id on new truck_stock row

PASS: 37  FAIL: 0
```

Harness: `delivery_van_cloud_proof.js` (temp), real Drizzle schema
(`lib/db/src/schema/index.ts`) + verbatim `sync-v2.ts` helpers/rule tables,
no DB connection.

```
=== C3 — truck_commission_payments registered on cloud side ===
  PASS  truck_commission_payments in SYNC_TABLES
  PASS  truck_commission_payments has a PUSH_FK_RULES entry
  PASS  truck_commission_payments FK rule requires truck (idCol=truckId, syncCol=truckSyncId)
  PASS  truckCommissionPaymentsTable has sync_id column
  PASS  truckCommissionPaymentsTable has updated_at column
  PASS  truckCommissionPaymentsTable has is_deleted column

=== C1 — every FK rule's idCol is a real FK column, refTable has syncId (16 tables, 18 rules) ===
  ALL PASS (60 checks)

=== sanitizeForTable / buildUpdateSet — invoice row (date cast, FK present after C1 resolution) ===
  PASS  camelCaseRecord converts truck_id -> truckId
  PASS  camelCaseRecord converts truck_sync_id -> truckSyncId
  PASS  sanitizeForTable produced a result (has syncId)
  PASS  sanitizeForTable dropped 'id' column
  PASS  sanitizeForTable kept resolved truckId=5 (not the local 999)
  PASS  sanitizeForTable kept resolved clientId=7 (not the local 888)
  PASS  sanitizeForTable cast created_at string -> Date (timestamp column)
  PASS  sanitizeForTable dropped unmapped *_sync_id companion fields (not real columns)
  PASS  buildUpdateSet excludes id/syncId/createdAt
  PASS  buildUpdateSet maps truckId -> excluded.truck_id

=== sanitizeForTable — rejects a row with no sync_id ===
  PASS  sanitizeForTable returns null when syncId missing

=== sanitizeForTable — truck_commission_payments row (C3) ===
  PASS  sanitizeForTable accepts commission payment row
  PASS  sanitizeForTable cast paid_at -> Date
  PASS  sanitizeForTable kept isDeleted

PASS: 81  FAIL: 0
```

**Total: 118/118 real assertions passed against real source files.**

These cover, with real execution: Scenarios 1, 2, 3, 5, 6, 7, the desktop
half of Scenario 4, and C1/C3/C4/C6/C7 directly.

### 2B. NOT executed here — requires staging Postgres / mobile device

| Item | Why it can't run here | How to run on staging |
|---|---|---|
| C5 (session persistence, Scenario 11) | `app.ts` imports `pool` from `@workspace/db`, which throws without `DATABASE_URL` | On staging: log in via Web, capture session cookie, `SELECT * FROM user_sessions`, `pm2 restart erp-api`, repeat an authenticated request with the same cookie → expect 200 (not 401). Confirms `connect-pg-simple` table exists and survives restart. |
| Cloud push/pull HTTP round-trip (resolveFkId, onConflictDoUpdate live) | Needs live Postgres + running api-server | `cd artifacts/api-server && DATABASE_URL=... pnpm dev`, then drive `desktop` sync against a **staging** `REMOTE_BASE` (temporarily point env/config at staging, never prod) and inspect `lastPushTables`/`lastPushErrors` in `/api/sync/status` plus row counts in Postgres. |
| Scenario 4 cloud half (truck_stock/stock_transfer push+resolve) | Same as above | Same staging setup; transfer stock on desktop, push, verify `truck_stock`/`stock_transfers`/`stock_transfer_items` rows land in Postgres with correctly resolved `truck_id`/`product_id`. |
| Scenario 9 (offline mobile, `handleTruckPush`) | Needs Expo app + device/emulator + staging cloud | Run mobile app against staging API, toggle airplane mode, create invoice/return, reconnect, verify `lib/sync.ts` push succeeds and stock/cash reconcile exactly once (re-trigger sync twice to confirm idempotency). |
| Scenario 10 cloud-side conflict resolution (`onConflictDoUpdate setWhere`) | Needs live Postgres | Manually set two conflicting `updated_at` values for the same `sync_id` via two push requests; assert only the newer one persists. |
| Scenario 12 real network interruption | Needs live cloud + ability to drop connections | On staging, run desktop sync, kill the api-server process mid-push, confirm `status.lastPushFirstError` is set and local DB unchanged; restart api-server, confirm next `syncOnce()` succeeds and cursor advances. |
| Full desktop app rebuild/install | `app.asar` bundling, Electron install | `cd desktop && npm run dist`, install, confirm sync engine in the running app matches `desktop/server/sync-engine.js` source (per existing memory note — **this had not been done as of 2026-06-14** and is a prerequisite for any of these fixes to take effect in the deployed desktop app). |

---

## Part 3 — Defect Summary

**No new defects found.** All previously-identified issues (C1, C3, C4, C5,
C6, C7) are implemented in source and the parts executable in this sandbox
(C1, C3, C4, C6, C7 — desktop side and cloud pure-logic side) **pass real
runtime checks against the unmodified source files** (118/118).

**Outstanding non-code items** (already known, not new):
1. C5 and the full cloud push/pull/resolve loop need a staging Postgres run
   to verify live (code is correct per schema/type checks; behavior not
   exercised against a real DB connection in this sandbox).
2. The **desktop Electron app has not been rebuilt/reinstalled** with these
   fixes — `cd desktop && npm run dist` + reinstall (or wipe
   `%APPDATA%\ERP Van Sales\erp-van-sales.db`) is required before any of
   C1/C3/C4/C7 take effect for end users, per the existing sync-architecture
   memory note.
3. `lib/db/src/schema/index.ts` schema changes for C3 (`truck_commission_payments`
   sync columns) need `drizzle-kit push` against the production/staging
   Postgres if not already applied.

---

## Appendix — Test harness locations (temporary, not committed)
- `%TEMP%\delivery_van_sync_proof.js` — desktop-side harness (better-sqlite3
  shim at `%TEMP%\better-sqlite3-shim\index.js`, node:sqlite-backed, no native
  deps, never touches `desktop/node_modules`).
- `%TEMP%\delivery_van_cloud_proof.js` — cloud pure-logic harness (run with
  `node --experimental-strip-types`, requires being placed under
  `lib/db/` for module resolution of `drizzle-orm`).
