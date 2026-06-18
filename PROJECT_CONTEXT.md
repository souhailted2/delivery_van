# PROJECT_CONTEXT.md — ERP Van Sales (Delivery Van)

> Generated 2026-06-15, last updated 2026-06-15 (same day: production factory
> reset executed, warehouse→truck transfer removal started but NOT committed).
> This document is meant to let a new Claude Code session understand the
> project without re-analyzing the whole repository. It summarizes
> architecture, workflows, sync internals, deployment, and current status as
> of this date.

---

## 1. Project Overview

**ERP Van Sales** (`delivery_van`) is a full-featured ERP system for **van/truck
sales operations in Algeria**. UI language is **French**, currency is **DZD**
(Algerian Dinar). It manages:

- Product catalogue & categories
- Suppliers & purchase orders
- Warehouse stock (per branch) and truck stock
- Truck fleet, dispatch of stock to trucks
- Client management (with debt/credit limits, GPS coordinates)
- Sales invoices (cash/credit), with retail/half-wholesale/wholesale pricing
- Returns (client returns & truck returns)
- Cash transfers between trucks and admin ("Caisse")
- Truck driver commission payments
- Reports (dashboard stats, daily reports)
- Role-based access: **admin** (full access) vs **vendeur** (configurable
  permissions) vs **truck** (driver login, restricted truck-scoped view)

It ships as **three clients** against **one cloud Postgres database**:
1. **Web admin app** (React, served from the cloud server)
2. **Desktop app** (Electron, Windows installer, offline-first with local
   SQLite + background sync)
3. **Mobile app** (Android APK, Expo/React Native, offline-first with local
   SQLite + background sync) — used by truck drivers

---

## 2. Repository Layout

```
delivery_van/
├── artifacts/
│   ├── api-server/          # Cloud backend: Express + TS + Drizzle ORM + Postgres
│   ├── erp-van-sales/        # Shared web/desktop admin frontend (React + Vite)
│   └── erp-van-sales-mobile/ # Mobile app (Expo/React Native) — truck driver app
├── desktop/                   # Electron wrapper: main.js, preload.js, local server
│   └── server/                # Desktop-local Express + better-sqlite3 server
├── lib/
│   ├── db/                    # Drizzle schema + Postgres connection (@workspace/db)
│   ├── api-spec/              # OpenAPI spec
│   ├── api-client-react/      # Generated React Query hooks (orval)
│   ├── api-zod/                # Zod validation schemas
│   └── object-storage-web/    # Object storage helpers
├── .github/workflows/
│   ├── deploy-hetzner.yml     # Deploys api-server + frontend to Hetzner VPS
│   ├── build-exe.yml          # Builds Windows Electron installer
│   └── build-android.yml      # Builds Android APK
├── SYNC_TEST_PLAN_AND_RESULTS.md  # Sync test plan + 118/118 passing proof (C1-C7)
├── replit.md                   # Original Replit project description
└── README.md
```

This is a **pnpm workspace** monorepo (Node 20/24, TypeScript ~5.9).

---

## 3. Architecture

### 3.1 Cloud Server (`artifacts/api-server`)

- **Stack**: Express + TypeScript + Drizzle ORM + PostgreSQL
- Entry: `src/index.ts` → `src/app.ts`
- `app.ts` wires: `pino-http` logging, CORS (credentials), JSON/urlencoded
  body parsing, cookie-parser, **express-session** backed by
  **`connect-pg-simple`** (table `user_sessions`, see C5 below), and mounts
  `src/routes/index.ts` under `/api`.
- Routes (`src/routes/`): `health`, `auth`, `users`, `branches`, `categories`,
  `products`, `suppliers`, `purchases`, `clients`, `trucks`, `stock`,
  `invoices`, `returns`, `cash`, `reports`, `storage`, `settings`,
  `sync-v2` (sync engine endpoints), `dispatches`.
- DB layer: `lib/db` (`@workspace/db`) — exports `db` (Drizzle instance) and
  `pool` (pg Pool), requires `DATABASE_URL` env var (throws at import time if
  missing).
- Auth: session-based (`express-session`), password hashing = `SHA256(password
  + "erp-salt-dzd")`.
- Logging: `pino` via `src/lib/logger.ts`.
- Object storage: `src/lib/objectStorage.ts` / `objectAcl.ts` (image uploads,
  e.g. product photos).

### 3.2 Web/Desktop Shared Frontend (`artifacts/erp-van-sales`)

- React 19 + TypeScript + Vite, Tailwind CSS + shadcn/ui, TanStack Query,
  Wouter for routing.
- `src/App.tsx` — top-level router + providers. Notably mounts **two**
  toast systems: shadcn `<Toaster />` (from `useToast()`) AND sonner's
  `<SonnerToaster />` (from `@/components/ui/sonner`) — both are needed
  because different parts of the app use different toast APIs (see §15).
- Pages (`src/pages/`): `Dashboard`, `Connexion`, `Produits`, `Categories`,
  `Fournisseurs`, `Achats`, `Clients`, `Camions`, `Stock`, `Factures`,
  `Retours`, `Caisse`, `Rapports`, `Utilisateurs`, `TruckPortal`.
- `TruckPortal` is shown instead of the admin layout when
  `user.role === "truck"` (truck driver web login).
- Built with `vite build`, output to `dist/public`. `vite.config.ts` requires
  `PORT` and `BASE_PATH` env vars at build time (BASE_PATH=`/` for
  production/desktop, `/api` calls go relative).
- This SAME built frontend is used by **both** the cloud deployment (served
  by api-server's static middleware / Hetzner nginx) and the **Electron
  desktop app** (copied into `desktop/renderer/`).

### 3.3 Desktop App (`desktop/`)

- **Electron** app. `main.js` = Electron main process, `preload.js` = preload
  script, `renderer/` = built copy of `artifacts/erp-van-sales/dist/public`.
- `desktop/server/` is a **separate, independent** Express server
  (`desktop/server/index.js`) that re-implements the same `/api/*` routes
  using **better-sqlite3** (local SQLite DB at
  `%APPDATA%\ERP Van Sales\erp-van-sales.db` or similar, path resolved via
  `getUserDataPath()` in `desktop/server/config.js`).
  - Routes in `desktop/server/routes/`: `auth`, `categories`, `products`,
    `suppliers`, `purchases`, `clients`, `trucks`, `stock`, `invoices`,
    `users`, `sync`, `cash`, `returns`, `reports`, `sync-status`, `backup`,
    `debug`, `dispatches` (proxy to cloud, see §8).
  - Session: `express-session` with **MemoryStore is no longer used for the
    CLOUD** (cloud uses connect-pg-simple, C5); the **desktop** local server
    still uses `express-session` with default in-memory store but this is
    fine since it's a single-user local process with a per-install secret
    file (`.session-secret`).
- **`desktop/server/sync-engine.js`** — the offline-first bidirectional sync
  engine. Runs every `SYNC_INTERVAL = 30_000` ms (30s) against
  `REMOTE_BASE = "https://deleveri.alllal.com/api"` (hardcoded production
  URL). See §7 for full sync details.
- **Critical packaging note**: the sync engine and all of `desktop/server` are
  bundled into `app.asar` by `electron-builder`. **Editing source files in
  this repo has NO EFFECT on an already-installed desktop app** — a new
  installer must be built (`cd desktop && npm run dist`, or via CI
  `build-exe.yml`) and (re)installed.
- `desktop/standalone/server.js` — likely a standalone/dev entry point for
  running the desktop server outside Electron.

### 3.4 Mobile App (`artifacts/erp-van-sales-mobile`)

- **Separate codebase** — Expo + React Native (Expo Router, file-based
  routing under `app/`), built into an **Android APK** via GitHub Actions
  (`build-android.yml`, uses `expo prebuild` + Gradle).
- Talks to `EXPO_PUBLIC_API_URL=https://deleveri.alllal.com` (production
  cloud) — same `/api/sync/v2/*` endpoints as desktop.
- Local SQLite via `expo-sqlite` (`lib/db.ts`), sync logic in `lib/sync.ts`
  + `contexts/SyncContext.tsx`.
- Key screens (`app/(tabs)/`): dashboard (`index`), products, categories,
  clients, suppliers, purchases, invoices, returns, caisse, trucks,
  truck-dashboard, truck (truck stock view), dispatch, branches, users,
  rapports, settings.
- Primarily used by **truck drivers** (role "truck") for offline
  invoice/return/cash-transfer creation while on the road.
- **Important**: the mobile app is a different codebase than the web/desktop
  admin frontend and does **not** automatically get features added only to
  `artifacts/erp-van-sales` / `artifacts/api-server` / `desktop/server`
  (e.g., the Excel product-import feature, §15, is NOT in mobile).

---

## 4. Database Schema Summary (`lib/db/src/schema/index.ts`)

PostgreSQL via Drizzle ORM. All "syncable" tables have a common trio of
columns: `sync_id TEXT UNIQUE DEFAULT gen_random_uuid()::text`, `updated_at
TIMESTAMP NOT NULL DEFAULT now()`, `is_deleted BOOLEAN NOT NULL DEFAULT
false`.

| Table | Key columns | Notes |
|---|---|---|
| `branches` | id, name, address, phone | Points of sale (نقاط البيع). No sync columns (not synced to desktop/mobile individually — global). |
| `categories` | id, name | syncable |
| `users` | id, username, password_hash, full_name, role (admin/vendeur), branch_id, truck_id, can_delete_invoice, can_edit_price, can_sell_on_credit, can_view_reports | syncable |
| `products` | id, name, barcode, category_id, stock_quantity, purchase_price, selling_price_retail/half_wholesale/wholesale, commission_retail/half/wholesale, image_url, unit | syncable, shared across branches |
| `suppliers` | id, name, phone, email, balance | syncable |
| `purchases` | id, branch_id, supplier_id, total_amount, paid_amount, payment_status | syncable |
| `purchase_items` | id, purchase_id, product_id, quantity, purchase_price, subtotal | syncable |
| `warehouse_stock` | id, branch_id, product_id, quantity | NOT syncable (no sync columns) |
| `clients` | id, name, phone, client_type (retail/half_wholesale/wholesale), branch_id, truck_id, latitude, longitude, balance (negative=debt), credit_limit | syncable |
| `trucks` | id, name, plate_number, phone, branch_id, vendeur_id, driver_name, password_hash, location, cash_balance, can_sell_on_credit, latitude, longitude | syncable |
| `truck_stock` | id, truck_id, product_id, quantity | syncable; UNIQUE(truck_id, product_id) |
| `stock_transfers` | id, branch_id, truck_id (legacy), from_truck_id, to_truck_id, from_warehouse, note | syncable |
| `stock_transfer_items` | id, transfer_id, product_id, quantity | syncable |
| `invoices` | id, invoice_number, truck_id, client_id, payment_type (cash/credit), total_amount, total_commission, latitude, longitude | syncable |
| `invoice_items` | id, invoice_id, product_id, product_name, quantity, price_type, unit_price, commission, subtotal | syncable |
| `returns` | id, type (client_return/truck_return), truck_id, client_id, invoice_id, total_amount | syncable |
| `return_items` | id, return_id, product_id, product_name, quantity, unit_price, subtotal | syncable |
| `truck_dispatches` | id, truck_id (FK→trucks), status (pending/received/closed), stock_items (JSON), note, created_at, received_at, closed_at, created_by | NOT syncable — cloud-only, desktop accesses via proxy (§8) |
| `company_settings` | id, store_name, phone, address | single global row, NOT syncable |
| `truck_commission_payments` | id, truck_id (FK→trucks), amount, note, paid_at | syncable (added in C3, §6) |
| `cash_transfers` | id, truck_id, amount, direction (in/out), status (pending/approved/rejected), note | syncable |

**16 syncable tables total** are registered in `SYNC_TABLES` /
`PUSH_FK_RULES` / `PULL_TABLES` / `FK_SYNC_RULES` (cloud `sync-v2.ts` and
desktop `sync-engine.js`).

---

## 5. Synchronization Architecture

All three clients converge on one cloud Postgres via `/api/sync/v2/*`
(`artifacts/api-server/src/routes/sync-v2.ts`):

- **Web admin**: writes directly to cloud via normal REST routes (no local
  sync needed — it IS the cloud).
- **Desktop**: `desktop/server/sync-engine.js` runs `syncOnce()` every 30s —
  pulls (`GET /sync/v2/pull?since=...`) then pushes (`POST /sync/v2/push`)
  local SQLite changes. `REMOTE_BASE` is hardcoded to
  `https://deleveri.alllal.com/api`.
- **Mobile**: `lib/sync.ts` + `contexts/SyncContext.tsx`, same
  `/sync/v2/pull` / `/sync/v2/push` endpoints, local SQLite via `lib/db.ts`.

### Sync matching key: `sync_id`

All upserts match by `sync_id` (`onConflictDoUpdate(target: syncId)`), with
last-write-wins via `setWhere: excluded.updated_at > current.updated_at OR
current.updated_at IS NULL`.

### Push flow (desktop/mobile → cloud)

1. `getLocalChanges(table, since)` — rows with `updated_at > since` (or
   `sync_id LIKE 'cloud_%'` excluded from push, see C4).
2. `attachFkSyncIds(tableName, rows)` (desktop) — for each FK column listed in
   `FK_SYNC_RULES[tableName]`, looks up the referenced row's `sync_id` locally
   and attaches it as a `*_sync_id` companion field (e.g.
   `truck_sync_id`, `client_sync_id`, `product_sync_id`).
3. Cloud `sync-v2.ts`:
   - `camelCaseRecord` / `snakeCaseRecord` convert between SQLite snake_case
     and Drizzle camelCase.
   - `resolveFkId(refTable, syncId)` translates a `*SyncId` → the cloud's
     real integer `id` for that table, per `PUSH_FK_RULES[table]`. Rules
     marked `required: true` cause the **whole row to be rejected** (with an
     explicit error, surfaced via C6) if the FK can't be resolved.
   - `sanitizeForTable(table, row)` drops unmapped/`id`/non-column fields,
     casts timestamp strings → `Date`, requires `sync_id` (rows without it
     are rejected — `null`).
   - `buildUpdateSet(...)` builds the `onConflictDoUpdate` SET clause
     (excludes `id`/`syncId`/`createdAt`).
   - Response: `{ ok, cursor, results: { [table]: {received, written,
     errors} } }` — per-table error detail (C6).

### Pull flow (cloud → desktop/mobile)

- `GET /sync/v2/pull?since=<cursor>` returns `{ tables: {...}, cursor,
  authoritativeTables: [...] }`.
- Desktop `upsertRecord(tableName, record)`:
  - If `record.sync_id` is missing (legacy NULL rows — should no longer
    happen post-fix), fabricates `cloud_<table>_<id>` as a placeholder.
  - **C4**: if the local row currently holds a `cloud_<table>_<id>`
    placeholder AND the incoming cloud record now has a real `sync_id`,
    **upgrades** the local placeholder to the real `sync_id` (independent of
    the `updated_at` last-write-wins gate) — this makes the row eligible for
    push again (no longer filtered by the `cloud_*` push exclusion).
  - Last-write-wins: a stale incoming record (older `updated_at`) does NOT
    overwrite a locally-newer row.
- Mobile `upsertRecord` similarly upserts by `sync_id`; for
  `authoritativeTables`, any local committed row whose `sync_id` is not in
  the response is pruned (soft-delete for tables with `is_deleted`,
  hard-delete otherwise — e.g. `truck_stock`).

### Known/fixed pitfalls

- **`sync_id = NULL` duplication bug** (fixed 2026-06-14): cloud schema had
  no DB default for `sync_id`; web-created rows had NULL `sync_id`, making
  them invisible to mobile (`upsertRecord` skips NULL) and causing desktop to
  fabricate `cloud_*` placeholders that re-pushed as **duplicates** every
  cycle. Fixed via DB-level `DEFAULT gen_random_uuid()::text` on all 16
  syncable tables + backfill, and `.default(sql\`gen_random_uuid()::text\`)`
  in the Drizzle schema (must NOT be reverted to `$defaultFn`, which is
  app-side only and a future `drizzle-kit push` would drop the DB default).
- **Truck dispatch ID mismatch** (fixed, commit a9f2b4a): desktop local
  integer ids ≠ cloud integer ids; the dispatch proxy (§8) must translate via
  `sync_id`.

---

## 6. Fixed Synchronization Issues (C1, C3, C4, C5, C6, C7)

A full sync audit was performed 2026-06-15 (`SYNC_TEST_PLAN_AND_RESULTS.md`,
118/118 assertions passed). Six confirmed issues were fixed (C2 was
investigated and refuted — not a real issue):

| ID | Issue | Fix |
|---|---|---|
| **C1** | Missing FK ID translation in desktop generic push — local FK ids pushed verbatim could collide with wrong cloud rows. | Desktop `attachFkSyncIds()` attaches `*_sync_id` companion fields per `FK_SYNC_RULES`; cloud `resolveFkId()` translates `*SyncId` → cloud `id` per `PUSH_FK_RULES` before insert/update, **rejecting rows with unresolved required FKs**. Verified for 16 tables / 18 FK rules (60 checks). |
| **C3** | `truck_commission_payments` was not synchronized at all. | Added `sync_id`/`updated_at`/`is_deleted` columns to the table (both cloud schema and desktop SQLite); registered in `SYNC_TABLES`/`PUSH_FK_RULES`/`PULL_TABLES`/`FK_SYNC_RULES` on both sides; its `DELETE` route converted from hard-delete to soft-delete on cloud AND desktop. |
| **C4** | `cloud_*` placeholder `sync_id`s (fabricated when pulling NULL-sync_id legacy rows) were never upgraded to the cloud's real `sync_id`, permanently blocking FK resolution / re-push for those rows. | `upsertRecord()` in `sync-engine.js` now detects a local `cloud_<table>_<id>` placeholder + matching `id`, and upgrades it to the cloud's real `sync_id` as soon as one is seen on pull — independent of the `updated_at` last-write-wins gate. Regression-checked: stale cloud data still doesn't overwrite newer local rows. |
| **C5** | Session storage used in-memory `MemoryStore` on the cloud server — sessions lost on every redeploy/restart. | Replaced with `connect-pg-simple` (table `user_sessions`) in `artifacts/api-server/src/app.ts`. `createTableIfMissing: false` (table created via migration, since connect-pg-simple's default table.sql hardcodes constraint names that would collide). |
| **C6** | Sync push errors were swallowed silently — no visibility into per-row/per-table failures. | Push response shape changed to `{ ok, cursor, results: { [table]: { received, written, errors } } }`; desktop tracks `lastPushErrors`/`lastPushTables`, exposed via `/api/sync/status`. |
| **C7** | Desktop `/stock/transfer` route could write invalid `truck_stock`/`stock_transfer_items` rows (nonexistent/soft-deleted truck id, `NaN`/negative quantities). | `desktop/server/routes/stock.js` now validates the truck exists (`is_deleted=0`) and each item's quantity is a positive finite number **before** any write; returns 400 with no DB mutation on invalid input. |

**Status**: All fixes implemented, `tsc --noEmit` clean (pre-existing
TS7030 "not all code paths return a value" warnings in `trucks.ts` etc. are
unrelated/pre-existing), `node --check` passes on desktop JS files. 118/118
live-execution assertions pass against real source via a custom
`node:sqlite`-backed test harness (no Postgres/Electron-ABI native module
required — see `desktop-sqlite-test-harness` memory).

**Outstanding for these fixes to be LIVE for end users**:
1. `lib/db/src/schema/index.ts` changes (C3's new columns on
   `truck_commission_payments`, the `sync_id` DB defaults) must be applied to
   the production Postgres via `drizzle-kit push` (or already-applied SQL —
   confirm before assuming).
2. **Desktop Electron app must be rebuilt and reinstalled** (`cd desktop &&
   npm run dist`, or via `build-exe.yml` CI) — editing
   `desktop/server/sync-engine.js` source has no effect on an already-running
   installed app (bundled in `app.asar`).
3. C5 (session persistence) and the live cloud push/pull/resolve round-trip
   were not exercised against a real Postgres in the sandbox — verify on
   staging/production per the procedure in `SYNC_TEST_PLAN_AND_RESULTS.md`
   §2B.

---

## 7. Authentication Flow

- **Web/Desktop-via-cloud admin login**: `POST /api/auth/login` with
  `{username, password}`. Password verified as
  `SHA256(password + "erp-salt-dzd") === user.passwordHash`. On success,
  `req.session.userId` is set; session persisted in Postgres `user_sessions`
  (C5) for the cloud, or desktop's local express-session for the desktop
  server.
- **Truck driver login**: `POST /api/auth/truck-login` with `{truckName,
  password}` — checks `trucksTable.passwordHash`. Sets
  `req.session.truckId`. Returns a synthetic user object with
  `role: "truck"`.
- **Session check**: `GET /api/auth/me` — returns truck-shaped user if
  `session.truckId` set, else normal user if `session.userId` set, else 401.
- **Logout**: `POST /api/auth/logout` clears both `userId`/`truckId`.
- Demo credentials (per `replit.md`): `admin`/`admin123` (full access),
  `vendeur1`/`vendeur123` (limited).
- Frontend role-based routing: `App.tsx`'s `Router()` shows `<TruckPortal />`
  for `role === "truck"`, otherwise the full admin `<Layout>` with all pages.

---

## 8. Truck Dispatch Workflow

- `truck_dispatches` is **cloud-only** (not in the sync tables) — represents
  admin loading stock onto a truck. Status flow: `pending` → `received` →
  `closed`. `stock_items` is a JSON array of `{productId, productName,
  quantity, unit, sellingPriceRetail}`.
- Cloud route: `artifacts/api-server/src/routes/dispatches.ts`.
- **Desktop**: has NO local dispatches table/route of its own —
  `desktop/server/routes/dispatches.js` is a **pure proxy** to
  `https://deleveri.alllal.com/api/dispatches*`, using the sync engine's
  stored admin session cookie (`cloudRequest()` exported from
  `sync-engine.js`).
- **Critical translation requirement**: a desktop row's **local** integer
  `id` ≠ the **cloud's** integer `id` for the same logical entity (truck,
  product). The proxy must translate `truckId` / `stockItems[].productId`
  from local ids to cloud ids via `sync_id` before forwarding — otherwise the
  cloud returns `404 الشاحنة غير موجودة` (truck not found) on "إرسال للشاحنة"
  (send to truck). Implemented: proxy reads the row's local `sync_id`, maps
  to the cloud id via a 30s-cached `GET /sync/v2/pull`. `sync_id`s of form
  `cloud_<table>_<id>` encode the cloud id directly. Unsynced rows → 409.
  Hardened further (commit 64a689a): `resolveCloudId` requires the resolved
  id to still exist in the pull snapshot's id-set, else 409 (protects against
  phantom/deleted ids).
- **truck_stock FK pollution** (partially fixed, NOT fully end-to-end):
  `truck_stock.truck_id`/`product_id` sync as raw integer ids; full FK
  translation for `truck_stock` sync itself is part of the larger
  unification effort (§14).

---

## 9. Inventory Management Workflow

- **Products** (`products` table) carry a global `stock_quantity` plus
  per-branch `warehouse_stock` and per-truck `truck_stock`.
- **Purchases**: `purchases` (header: supplier, branch, totals,
  payment_status) + `purchase_items` (product, quantity, purchase_price) —
  receiving stock from suppliers into a branch's warehouse.
- **Stock transfers**: `stock_transfers` (+ `stock_transfer_items`) move stock
  warehouse→truck (`/api/stock/transfer`, validated per C7) or truck↔truck
  (`from_truck_id`/`to_truck_id`, used by mobile warehouse↔truck transfers
  which leave `truck_id`/`branch_id` null).
- **Excel bulk import** (web/desktop admin only, `Produits` page): imports a
  list of products via `POST /products/bulk` — matches by `name`;
  `duplicateAction: "update"` adds imported quantity to existing stock,
  `"skip"` leaves existing product untouched; new names are inserted. See
  §15 for the bug history of this feature.

---

## 10. Invoice Workflow

- Created from a truck (mobile truck app, or admin/web on behalf of a truck).
- `invoices` (header: invoice_number, truck_id, client_id, payment_type
  cash/credit, total_amount, total_commission, GPS lat/long) +
  `invoice_items` (product, product_name snapshot, quantity, price_type
  retail/half_wholesale/wholesale, unit_price, commission, subtotal).
- On creation: deducts `truck_stock`, applies commission to truck driver
  (feeds `truck_commission_payments` settlement later), and for `payment_type
  = "credit"` adjusts `clients.balance` (negative = debt).
- Mobile push (`handleTruckPush`) does this **atomically and idempotently**
  (via `ON CONFLICT DO NOTHING` + `RETURNING`-gated reconciliation) so a
  retried push after a network drop doesn't double-deduct stock or
  double-apply commission.

---

## 11. Client Workflow

- `clients`: name, phone, `client_type` (retail/half_wholesale/wholesale —
  determines which price tier applies on invoices), `branch_id` (admin-level
  if null), `truck_id` (truck-owned client if set), GPS lat/long, `balance`
  (negative = debt), `credit_limit` (null = no limit).
- Truck-owned clients (`truck_id` set) are created/managed by truck drivers
  via mobile, then synced to cloud (FK `truck_sync_id` resolved per C1).
- Credit sales adjust `balance`; `canSellOnCredit` permission (per-user and
  per-truck) gates whether a credit invoice is allowed.

---

## 12. Truck Workflow

- `trucks`: name, plate_number, phone, `branch_id`, `vendeur_id` (linked
  user), `driver_name`, `password_hash` (for truck driver login),
  `cash_balance`, `can_sell_on_credit`, GPS lat/long.
- Truck driver logs in via `/api/auth/truck-login` (web `TruckPortal` or
  mobile app) using `name` + `password_hash`.
- Receives stock via dispatch (§8) or stock transfer (§9); sells via
  invoices (§10); returns via `returns`/`return_items`; commission tracked in
  `truck_commission_payments` (synced as of C3).

---

## 13. Cash Management Workflow ("Caisse")

- `cash_transfers`: `truck_id`, `amount`, `direction` (`in` = truck→admin,
  subtracts from truck cash; `out` = admin→truck, adds), `status`
  (pending/approved/rejected), `note`.
- Truck cash balance (`trucks.cash_balance`) accumulates from cash-sale
  invoices; transfers reconcile it with admin.
- `truck_commission_payments` (C3) records payouts of accumulated commission
  to drivers — now fully syncable across desktop/cloud.

---

## 14. Known Limitations

- **Two-server divergence**: the cloud (`artifacts/api-server`, TS + Drizzle
  + Postgres) and desktop (`desktop/server`, plain JS + better-sqlite3) are
  **separate reimplementations** of the same API surface. This is the root
  cause of most "works on web, broken on desktop" bugs (e.g., missing
  `/products/bulk` route, missing `/dispatches` route historically). A
  planned (not yet started) unification — recommended approach: **PGlite**
  (WASM Postgres) so desktop runs the SAME `api-server` code/schema/SQL
  against a local file — would eliminate this class of bug. This is a large
  refactor, intentionally deferred to a branch with CI testing.
- **`truck_stock` FK translation** is not fully end-to-end (push side still
  writes some raw integer ids without full `sync_id` translation) — deeper
  unification work needed.
- **Desktop sync engine hardcodes** `REMOTE_BASE =
  "https://deleveri.alllal.com/api"` — no staging/env-based override; testing
  against staging requires temporarily editing this constant (never commit
  pointing at a non-prod URL by accident, and never point automated tests at
  prod).
- **Cloud hard-deletes don't propagate** to clients for some tables — mobile
  only prunes *authoritative* tables (`truck_stock`, `clients`); `products`/
  `trucks` persist locally even after a cloud-side dedup, requiring manual
  local DB wipe/resync after a cloud cleanup.
- **Desktop app requires manual rebuild+reinstall** for any
  `desktop/server/*` change to take effect (app.asar bundling) — there is no
  hot-reload or auto-update mechanism described in this repo.
- Pre-existing TS7030 ("not all code paths return a value") warnings exist in
  several `artifacts/api-server/src/routes/*.ts` files (dispatches, invoices,
  purchases, returns, settings, stock, storage, suppliers, trucks, users,
  products) — not addressed, considered pre-existing/non-blocking.
- `gh` CLI is not reliably available in dev sandboxes; use `curl` against the
  public GitHub REST API (`https://api.github.com/repos/souhailted2/delivery_van/...`)
  for CI status checks when `gh` is unavailable.

---

## 15. Recent Fix History (post C1-C7)

### Excel product import — "stuck on Importing..." bug (fixed, commit 0c8b2a9)

Two independent bugs combined:
1. **Missing backend route**: `POST /api/products/bulk` (used by the Excel
   import dialog) did not exist on either the cloud (`api-server/src/routes/products.ts`)
   or desktop (`desktop/server/routes/products.js`). Both now implement it:
   matches existing products by `name`; `duplicateAction: "update"` adds the
   imported quantity to existing stock, `"skip"` leaves it untouched; new
   product names are inserted. Desktop version uses better-sqlite3 prepared
   statements; cloud version uses Drizzle.
2. **Missing toast renderer**: most pages (including the Excel import dialog)
   use `sonner`'s `toast.error`/`toast.success`, but `App.tsx` only mounted
   the shadcn/Radix `<Toaster />` (which renders `useToast()` toasts) — sonner
   toasts had no render target and were silently dropped. Fixed by also
   mounting `<SonnerToaster />` (from `@/components/ui/sonner`) alongside the
   existing `<Toaster />` in `App.tsx`.

**Scope of this fix**: `artifacts/api-server/src/routes/products.ts`,
`desktop/server/routes/products.js`, `artifacts/erp-van-sales/src/App.tsx`.
**Mobile app is unaffected** (different codebase, doesn't have this import
feature) — no APK update needed for this fix. **Web is live immediately**
(no client install needed). **Desktop requires the new installer** (built via
`build-exe.yml`, run 27539230905 for commit 0c8b2a9 succeeded) to be
downloaded and installed for the fix to take effect.

### Login broken on production (fixed — see task history)

Tracked as a completed task; root cause/fix details not retained in this
summary — check git log around the C5 session-store change (likely related
to the `connect-pg-simple` migration / `user_sessions` table setup on
production).

---

## 16. Deployment Process

### Cloud (api-server + frontend) → Hetzner VPS (`.github/workflows/deploy-hetzner.yml`)

Triggers on every push to `main` (or manual dispatch):
1. Checkout, Node 20, pnpm 9.
2. `pnpm install --no-frozen-lockfile`.
3. Generate API client via orval (`@workspace/api-spec`).
4. Build api-server (`pnpm --filter @workspace/api-server run build`).
5. Build frontend with `PORT=22606 BASE_PATH=/` (`pnpm --filter
   @workspace/erp-van-sales run build`).
6. `npm install --omit=dev --ignore-scripts` in `artifacts/api-server` to get
   production `node_modules`.
7. Tar up `artifacts/api-server/dist/`, `package.json`, `node_modules/`, and
   `artifacts/erp-van-sales/dist/public/` → `deploy.tar.gz`.
8. SCP to `/tmp/` on Hetzner host (`secrets.HETZNER_HOST/USER/PASSWORD`).
9. SSH in: extract to `/var/www/erp-van-sales/{api-server/dist,frontend}`,
   `pm2 reload erp-api --update-env || pm2 restart erp-api`, then health-check
   `GET http://localhost:8080/api/healthz` (must be 200 or the job fails).

**Note**: this workflow does NOT run `drizzle-kit push` — schema/migration
changes must be applied to production Postgres separately/manually.

### Desktop Windows Installer (`.github/workflows/build-exe.yml`)

Triggers on push to `main` or `v*.*.*` tags:
1. Checkout, Node 20, pnpm 9. Patches `pnpm-workspace.yaml` to strip
   Windows-incompatible platform overrides (esbuild/lightningcss/tailwind
   oxide/rollup win32 variants).
2. `pnpm install`, orval codegen, build frontend (`PORT=22606 BASE_PATH=/`).
3. Copy built frontend → `desktop/renderer/`.
4. `npm install` in `desktop/` (Electron + native deps), then `npx
   electron-rebuild -f -w better-sqlite3` (rebuilds the native module for
   Electron's Node ABI).
5. Ensure `desktop/build/icon.ico` exists (downloads a placeholder if
   missing — **never commit a deleted icon**, it breaks this step's
   fallback logic indirectly via electron-builder config).
6. `npm run dist` (electron-builder) → produces `dist-electron/*Setup*.exe`.
7. Uploads as artifact `ERP-Van-Sales-Windows-Installer` AND publishes a
   GitHub Release (`build-<run_number>` for normal pushes, or the tag name
   for `v*.*.*` tags) with Arabic install/usage instructions.

### Android APK (`.github/workflows/build-android.yml`)

Triggers on push to `main` or `v*` tags:
1. Checkout, pnpm 10, Node 20, `pnpm install --frozen-lockfile`.
2. Sets `expo.android.versionCode` = `github.run_number` in `app.json`.
3. Java 17 + Android SDK (platform 35, build-tools 35.0.0, NDK
   27.1.12297006).
4. `expo prebuild --platform android --clean --no-install` with
   `EXPO_PUBLIC_API_URL=https://deleveri.alllal.com`.
5. Workaround step for pnpm virtual-store `expo-router/entry.js` missing in
   some peer-dep copies (copies the file into all variant dirs).
6. `./gradlew assembleRelease` → APK.
7. Uploads as 30-day artifact `erp-van-sales-android`, and (for non-tag
   pushes) deletes old `build-*`/`latest` releases and publishes
   `build-<run_number>` as the latest GitHub Release with Arabic install
   instructions. Tag pushes (`v*`) get a versioned release instead.

---

## 17. Environment Variables

| Variable | Used by | Purpose |
|---|---|---|
| `DATABASE_URL` | `lib/db/src/index.ts` (api-server) | Postgres connection string. **Required** — throws at import if missing. |
| `PORT` | api-server (`src/index.ts`), frontend `vite.config.ts` | HTTP listen port / Vite dev port. Required. |
| `BASE_PATH` | frontend `vite.config.ts` | Vite `base` path for asset URLs. `/` for production/desktop builds. Required. |
| `SESSION_SECRET` | api-server `app.ts` | express-session secret. **REQUIRED in production** (since Phase 1, 2026-06-18): `app.ts` throws on boot if `NODE_ENV=production` and it is unset/empty. A throwaway dev fallback is used only when not production. Set in `/etc/erp.env` on Hetzner (persists across deploys). |
| `CORS_ORIGINS` | api-server `app.ts` | Optional comma-separated browser-origin allowlist for CORS. Defaults to `https://deleveri.alllal.com`. Server-to-server callers (no Origin) are always allowed. |
| `EXPO_PUBLIC_API_URL` | mobile app | Cloud API base URL (`https://deleveri.alllal.com` in production builds). |
| `NODE_ENV` | mobile build | `production` for release APK builds. |
| `HETZNER_HOST` / `HETZNER_USER` / `HETZNER_PASSWORD` | `deploy-hetzner.yml` (GitHub secret) | SSH/SCP credentials for the deploy target. |
| `GH_TOKEN` / `GITHUB_TOKEN` | `build-exe.yml`, `build-android.yml` | GitHub Releases API access for CI-published artifacts. |
| `REPL_ID`, `REPLIT_DEV_DOMAIN`, `REPLIT_EXPO_DEV_DOMAIN` | Replit dev environment only | Used in mobile `dev` script and Vite cartographer plugin (Replit-specific, no effect outside Replit). |

No `.env` / `.env.example` files exist in the repo — env vars are supplied by
the hosting environment (Replit secrets, GitHub Actions secrets, or the
production server's process manager config, e.g. `/etc/erp.env` on the
Hetzner host per prior session notes).

---

## 18. Important Files & Folders

| Path | Purpose |
|---|---|
| `lib/db/src/schema/index.ts` | Single source of truth for the Postgres schema (Drizzle). All table defs + Zod insert schemas. |
| `lib/db/src/index.ts` | Drizzle `db` + pg `pool` exports (`@workspace/db`). |
| `artifacts/api-server/src/app.ts` | Cloud Express app setup (middleware, session store, route mounting). |
| `artifacts/api-server/src/routes/sync-v2.ts` | Cloud sync engine: `SYNC_TABLES`, `PUSH_FK_RULES`, `PULL_TABLES`, `FK_SYNC_RULES`, `resolveFkId`, `sanitizeForTable`, `buildUpdateSet`, pull/push handlers. |
| `artifacts/api-server/src/routes/dispatches.ts` | Cloud truck dispatch routes (pending/received/closed). |
| `desktop/server/sync-engine.js` | Desktop sync engine: `REMOTE_BASE`, `SYNC_INTERVAL`, `PULL_TABLES`/`PUSH_TABLES`, `FK_SYNC_RULES`, `attachFkSyncIds`, `upsertRecord`, `syncOnce`, `cloudRequest`. |
| `desktop/server/routes/dispatches.js` | Desktop dispatch proxy (local id → cloud id translation via `sync_id`). |
| `desktop/server/routes/stock.js` | Desktop `/stock/transfer` (validated per C7). |
| `desktop/server/db.js` | Desktop SQLite init/schema/triggers (better-sqlite3). |
| `desktop/server/config.js` | `setUserDataPath`/`getUserDataPath` for locating the local SQLite DB. |
| `artifacts/erp-van-sales/src/App.tsx` | Frontend router + global providers (incl. both Toaster components). |
| `artifacts/erp-van-sales-mobile/lib/sync.ts` | Mobile pull/push sync logic. |
| `artifacts/erp-van-sales-mobile/lib/db.ts` | Mobile SQLite schema/helpers (`upsertRecord`, `getSyncMeta`, etc.). |
| `SYNC_TEST_PLAN_AND_RESULTS.md` | Sync test plan (12 scenarios) + execution report for C1-C7 (118/118 pass). |
| `.github/workflows/*.yml` | CI/CD: deploy-hetzner, build-exe (Windows), build-android. |
| `replit.md` | Original high-level project description (Replit-authored). |

---

## 19. Coding Conventions

- **Language**: TypeScript for cloud/web/mobile (`~5.9.2`); plain JS
  (CommonJS) for `desktop/server`.
- **UI text/error messages**: French for the admin UI, **Arabic** for
  end-user-facing error messages and CI release notes (this codebase serves
  an Arabic-speaking deployment despite French UI labels — error strings like
  `"لا توجد منتجات للاستيراد"` are intentional).
- **Currency**: DZD, prices stored as `numeric(12,2)`, quantities as
  `numeric(10,3)`.
- **Sync columns**: any new syncable table needs `sync_id text unique
  default(sql\`gen_random_uuid()::text\`)`, `updated_at timestamp not null
  default now()`, `is_deleted boolean not null default false`, plus
  registration in both cloud (`sync-v2.ts`: `SYNC_TABLES`/`PUSH_FK_RULES`/
  `PULL_TABLES`/`FK_SYNC_RULES`) and desktop (`sync-engine.js`: same lists) —
  and the desktop SQLite schema/triggers (`db.js`) must mirror the same
  columns + an `updated_at`-bumping trigger.
- **Deletes**: always soft-delete (`is_deleted = 1`, bump `updated_at`) for
  syncable tables — never hard-delete (breaks sync propagation and FK
  history).
- **FK fields on syncable rows**: must have a corresponding `FK_SYNC_RULES`
  entry so `attachFkSyncIds`/`resolveFkId` can translate local↔cloud ids (C1
  pattern) — never push raw local integer FK ids without a `*_sync_id`
  companion.
- **Error handling in routes**: prefer explicit Arabic error messages with
  appropriate HTTP status codes (400 for validation, 404/409 for
  not-found/conflict) rather than silent failures (C6 principle).
- **Comments**: minimal; only for non-obvious invariants (sync rules, ID
  translation gotchas).
- **TypeScript checking**: `pnpm run typecheck` (root) — `tsc --build` for
  libs + per-artifact typecheck. Desktop JS files checked via `node --check`.

---

## 20. Current Project Status (as of 2026-06-15)

- **C1, C3, C4, C5, C6, C7** sync issues: fixed in source, typechecked,
  118/118 live-execution proof passed. C2 was investigated and refuted (not a
  real issue).
- **Excel import bug**: fixed (commit `0c8b2a9`), pushed to `origin/main`.
  - Web/cloud: live (Hetzner deploy auto-triggered on push to `main`).
  - Desktop installer: CI build `build-exe.yml` run **27539230905** succeeded
    — new installer available; **user still needs to download & install it**
    for the fix to take effect (old installed app won't have it until
    reinstalled).
  - Android APK: build `build-android.yml` run **27539230944** for the same
    commit was checked and **not required** for this fix (mobile codebase
    doesn't include the Excel import feature) — no action needed regardless
    of its outcome.
- **Login-broken-on-production** issue: marked completed in task history.
- A separate, not-yet-started background task exists: **"Fix
  deploy-hetzner.yml to actually sync node_modules"** (task id
  `task_0e2acfff`) — flagged but not actioned.
- **Production database factory reset executed** (same day, 2026-06-15) —
  see §22. Production now has only 1 admin user, 1 category ("Général"), 57
  products (stock intact), and empty operational tables (clients, suppliers,
  trucks, invoices, etc.). Sync-cleanup of previously-connected Desktop/Mobile
  devices is **not yet done** — resurrection risk until each device's local
  DB is wiped (§22).
- **Warehouse→truck transfer removal in progress, NOT committed** — see §23.
  9 files modified in the working tree on `fix/image-upload-improvements`,
  uncommitted. Production still shows the "تحويل إلى شاحنة" button.

---

## 21. Pending Tasks

1. Confirm `lib/db/src/schema/index.ts` changes (C3 columns on
   `truck_commission_payments`, `sync_id` DB defaults) are applied to
   **production** Postgres (via `drizzle-kit push` or equivalent manual SQL)
   — required for C3/C4 to be effective on cloud.
2. Verify C5 (session persistence across `pm2 restart erp-api`) on
   production — was not exercised against a live Postgres in the dev
   sandbox.
3. User to **download and install** the new desktop installer
   (`build-29*` / GitHub Release for commit `0c8b2a9`) — required for the
   Excel-import fix (and all of C1/C3/C4/C7) to be active in the desktop app.
4. Decide on and schedule the **PGlite-based unification** of
   `desktop/server` with `artifacts/api-server` (eliminates the two-server
   divergence class of bugs) — explicitly deferred, needs its own branch +
   CI testing plan.
5. `deploy-hetzner.yml` node_modules sync issue (task `task_0e2acfff`) —
   not yet started.
6. Complete end-to-end `truck_stock` FK `sync_id` translation (currently
   partial — see §14).
7. Execute the sync-cleanup procedure (§22) for every Desktop install and
   Mobile device that synced before the 2026-06-15 factory reset — wipe local
   SQLite + sync cursors before reconnecting, to avoid resurrecting
   hard-deleted rows.
8. Recreate `trucks` (with `password_hash`) — truck driver logins are broken
   post-reset until at least one truck exists.
9. Decide on and commit/push/deploy (or discard) the uncommitted
   warehouse→truck transfer removal (§23) — currently sitting only in the
   local working tree on `fix/image-upload-improvements`.

---

## 22. Production Database Factory Reset (executed 2026-06-15)

A full "factory reset" was executed directly against production Postgres
(Hetzner `root@5.75.144.100`, `DATABASE_URL` from `/etc/erp.env`) via a single
`BEGIN ... COMMIT` transaction.

**Kept**: all 57 `products` rows + their `stock_quantity` (untouched),
exactly one admin user (`id=1`, username `admin`), exactly one category
("Général" — all 57 products repointed to it, other 4 categories deleted),
`branches` (0 rows, unchanged), `company_settings` (1 row, unchanged).

**Hard-deleted** (in FK-safe order): `invoice_items`, `invoices`,
`return_items`, `returns`, `purchase_items`, `purchases`,
`stock_transfer_items`, `stock_transfers`, `cash_transfers`,
`truck_commission_payments`, `truck_dispatches`, `truck_stock`, `clients`,
`trucks`, all `users` except `id=1` (removed: `vendeur1`, `"Camion 01hhhh"`,
user `1111`), `suppliers`, `warehouse_stock`; `session` table truncated (logs
out all active sessions).

**Backup**: `pg_dump` taken before the reset →
`/root/erp-backup-pre-factory-reset-20260615.dump` (79K) on the Hetzner host.

**Important consequences / outstanding follow-ups**:
- This was a **hard delete**, which violates Sync Rule #2
  (never hard-delete a syncable row — always soft-delete). A coordinated
  sync-cleanup is required before any previously-synced Desktop or Mobile
  device reconnects, or it can **push its stale local cache back and
  resurrect the deleted rows** (cloud `onConflictDoUpdate` falls back to
  plain `INSERT` when the pushed `sync_id` no longer exists).
- **Required cleanup per device** (not yet performed):
  - Desktop: fully close the Electron app, delete
    `%APPDATA%\ERP Van Sales\erp-van-sales.db` (+ `-wal`/`-shm` if present),
    relaunch — `db.js` recreates an empty DB/`sync_meta`, forcing a full
    re-pull with nothing stale to push back.
  - Mobile: Settings → Apps → ERP Van Sales → Storage → Clear Data (or
    uninstall/reinstall the APK) — wipes `erp_mobile.db` including
    `sync_meta`.
- **Truck driver logins are now broken** (`trucks` table is empty — both
  desktop `TruckPortal`/web truck login and the mobile app's
  `/api/auth/truck-login` will fail) until trucks are recreated.
- Non-admin user logins (`vendeur1`, etc.) are broken — only `admin`/id=1
  remains.
- Re-run the verification `SELECT ... UNION ALL ...` row-count query against
  production periodically until all devices have been cleaned up, to confirm
  no resurrection occurred from a device that synced before its local DB was
  wiped.

---

## 23. Uncommitted Work In Progress — Warehouse→Truck Transfer Removal (NOT committed/deployed)

On branch `fix/image-upload-improvements` (1 commit ahead of `origin/main` at
`5f8fbad`), the working tree has **9 modified files, +6/-716 lines,
uncommitted and unstaged**, removing the "تحويل إلى شاحنة" (transfer to
truck) warehouse→truck stock transfer feature from the Stock page:

- `artifacts/erp-van-sales/src/pages/Stock.tsx` — removes the transfer
  dialog, `useTransferStock`/`useListTrucks` hooks, and the "تحويل إلى شاحنة"
  button (216 lines removed).
- `artifacts/api-server/src/routes/stock.ts` — removes the cloud
  `/stock/transfer` route/handler (~90 lines).
- `desktop/server/routes/stock.js` — removes the desktop equivalent (~83
  lines, including the C7 validation added earlier).
- `lib/api-spec/openapi.yaml`, `lib/api-client-react/src/generated/api.ts` +
  `api.schemas.ts`, `lib/api-zod/src/generated/api/api.ts` — regenerated to
  drop the transfer endpoint/types.
- `lib/api-client-react/tsconfig.tsbuildinfo`,
  `lib/api-zod/tsconfig.tsbuildinfo` — incremental build artifacts (should
  probably not be committed).

**Status**: not committed, not pushed, not merged to `main`, not deployed.
Production (`origin/main` @ `0c8b2a9`, last successful Hetzner deploy run
`27539230901`) still has the original `1c9bb2a` implementation — the
"تحويل إلى شاحنة" button is still live on
`https://deleveri.alllal.com/stock`.

**Note**: the `stock_transfers` / `stock_transfer_items` DB tables and their
sync registration (`FK_SYNC_RULES`/`PULL_TABLES`/`PUSH_TABLES` in
`sync-v2.ts`/`sync-engine.js`/mobile `lib/sync.ts`) are **not** touched by
this diff — only the warehouse→truck UI/route is removed. Mobile's
truck↔truck stock-transfer flow (which also writes `stock_transfers`) is
unaffected.

**Before committing this work**: decide what to do with the two
`tsconfig.tsbuildinfo` diffs (likely `git checkout` them back, they're build
cache), confirm `pnpm run typecheck` passes, and follow the normal
commit→push→`main`→Hetzner-auto-deploy flow (no separate desktop/mobile
rebuild needed — this is a web/cloud + desktop-server change; desktop
`stock.js` change requires a new installer build/reinstall to take effect on
already-installed desktop apps).

---

## 24. Future Roadmap (inferred from outstanding work)

- **Unify desktop and cloud backends** via PGlite (WASM Postgres) so a single
  `api-server` codebase/schema serves web, desktop (offline), and acts as the
  sync source-of-truth — removing the need for `desktop/server`'s parallel
  better-sqlite3 reimplementation and its associated FK-translation
  workarounds (C1, dispatch proxy, truck_stock pollution).
- **Parameterize `REMOTE_BASE`** in the desktop sync engine (currently
  hardcoded to production) to allow safe staging testing.
- **Automated desktop update mechanism** (currently requires manual
  download+install of a new installer per release) — consider
  electron-updater or similar, given how often fixes require a desktop
  rebuild.
- **Full FK `sync_id` translation for `truck_stock`** and any remaining
  tables still pushing raw integer FKs.
- Harden CI (`deploy-hetzner.yml`) to actually package/sync `node_modules`
  correctly (flagged pending task).

---

## 25. Command-Center Redesign + Security Phase 1 (deployed 2026-06-18)

The shared frontend (`artifacts/erp-van-sales`) was rebuilt into a cinematic
"Operations Center" command-center experience, and the cloud API received its
first authentication hardening pass. **This is the version running on
production** (`deleveri.alllal.com`) as of 2026-06-18.

### Frontend (UI / experience)
- One persistent command-center shell (top Command Bar + contextual subnav, no
  sidebar). The single Operations Center environment sits behind the whole app
  (`ExperienceBackground`), dimmed on work pages, bright on the dashboard.
- Login/logout are the only cinematic transitions, owned by the Arrival overlay
  and driven by ONE canonical video (`public/scenes/arrival.mp4` + the two
  poster frames). Login plays it forward; logout plays it in reverse. Page
  navigation is a fast content fade (`AppTransition`).
- Consolidation removed the old per-room scene machinery — deleted
  `experience/scenes.tsx`, `DoorwayDilation.tsx`, `HQReactiveLayer.tsx`,
  `OCReactiveLayer.tsx`; `cinematic.ts` trimmed to `ease`/`dur`. New single
  source of truth: `experience/arrival-asset.ts` (video warmer + adoption).
- Resilience: a root `ErrorBoundary` (`components/ErrorBoundary.tsx`) catches
  render errors (no more white screen); the `QueryClient` redirects to
  `/connexion` on any non-`/me` 401 and does not retry 4xx.
- Layout-stability: `html { overflow-y: scroll; scrollbar-gutter: stable }`
  (no per-route width jump). Hero heading has a scrim/text-shadow for
  readability over the bright OC wall.
- `arrival.mp4` is the optimized **1920×1440 @ ~10 Mbps H.264** encode
  (~6.1 MB, yuv420p, faststart), re-encoded 2026-06-18 from a 2903×2176 /
  50.9 Mbps source whose non-standard dimensions + bitrate caused
  hardware-decode stutter on real devices (`MediaCapabilities.smooth`
  false→true). Cinematic, timing, camera path, and posters are unchanged —
  only the encoding. nginx caches `.mp4` (30-day `Cache-Control`) so the video
  is not re-downloaded on every login. A frontend code-split for the ~1.4 MB
  JS bundle remains a future optimization.

### Cloud API security (Phase 1)
See CLAUDE.md "API Security — Cloud" for the authoritative list: global
`requireAuth` gate, `requireAdmin`, `SESSION_SECRET` enforcement, CORS
allowlist, secure cookies + `trust proxy`, global error handler. **Cloud-only**
— `desktop/server` (loopback, single-user) was intentionally not changed.

### Production state after the 2026-06-18 deploy
- `SESSION_SECRET` set in `/etc/erp.env` (was empty); unauthenticated `/api/*`
  now returns 401 (verified); login issues a `Secure; HttpOnly; SameSite=Lax`
  cookie; CORS rejects non-allowlisted origins.
- ufw: public `8080/tcp` rule removed (the API was directly reachable over
  plain HTTP, bypassing nginx/TLS). nginx still proxies via loopback
  `127.0.0.1:8080`.
- nginx already forwards `X-Forwarded-Proto`; TLS via Let's Encrypt
  (`certbot.timer` active). Box is shared (2 vCPU / 3.7 GB, ~82% disk) with
  other apps.
- Rollback assets retained on the box under `/root/erp-backups/` (timestamp
  `20260618_012041`): pre-deploy DB dump, env, and `dist`/`frontend` copies.
- The deploy was a **manual controlled rollout** (build → scp → swap →
  `pm2 restart` → verify). For CI parity, the redesign branch must be merged to
  `main` so `deploy-hetzner.yml` deploys the same code; the box's
  `SESSION_SECRET` persists across CI deploys (CI does not touch `/etc/erp.env`,
  and the server-side deploy script copies only `dist/` + `frontend/`, never
  `node_modules`, so the existing `connect-pg-simple` is reused).

### Still open (not done in this deploy)
No automated backup of `erpvansales` (the 6-hourly `/root/auto-backup.sh` cron
dumps the unrelated `tpl_factory` DB); zero `updated_at`/FK indexes on the prod
DB (Phase 3); no HSTS header; deferred P1s — SHA256 password hashing, no login
rate-limiting, non-atomic financial writes.
