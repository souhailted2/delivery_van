# CLAUDE.md

Instructions for Claude Code working in this repo. For full details (schema,
workflows, CI, env vars) see [PROJECT_CONTEXT.md](PROJECT_CONTEXT.md) — read
it once per session instead of re-exploring the repo.

## Project

ERP for van/truck sales in Algeria (French UI, DZD currency, Arabic
error/end-user strings). Three clients, one cloud Postgres:
- **Web admin** (`artifacts/erp-van-sales`, React+Vite) — served by cloud.
- **Desktop** (`desktop/`, Electron) — offline-first, local SQLite, own
  Express server.
- **Mobile** (`artifacts/erp-van-sales-mobile`, Expo/Android) — truck driver
  app, offline-first, separate codebase.

pnpm workspace, Node 20/24, TypeScript ~5.9.

## Architecture (quick map)

| Layer | Path | Stack |
|---|---|---|
| Cloud API | `artifacts/api-server` | Express + TS + Drizzle + Postgres (`DATABASE_URL` required) |
| Shared admin frontend | `artifacts/erp-van-sales` | React 19 + Vite + shadcn/ui, used by BOTH web and desktop |
| Desktop local server | `desktop/server` | Express + better-sqlite3, **separate reimplementation** of cloud API |
| Mobile | `artifacts/erp-van-sales-mobile` | Expo/React Native, **separate codebase**, separate feature set |
| Schema (source of truth) | `lib/db/src/schema/index.ts` | Drizzle, Postgres |
| Sync engines | `artifacts/api-server/src/routes/sync-v2.ts` (cloud), `desktop/server/sync-engine.js` (desktop), `artifacts/erp-van-sales-mobile/lib/sync.ts` (mobile) | `/api/sync/v2/{pull,push}` |

**Key fact**: cloud and desktop are independent reimplementations of the same
API. A feature added to `api-server` does NOT exist on desktop until also
added to `desktop/server/routes/*.js`, and vice versa. Mobile is a third,
separate codebase — assume nothing is shared unless verified.

## Current Production State (read before assuming data exists)

- **2026-06-15: production Postgres was factory-reset** (hard DELETE, see
  PROJECT_CONTEXT.md §22). Only `products` (57 rows + stock), 1 admin user
  (`id=1`/`admin`), 1 category ("Général"), `branches`, `company_settings`
  remain. `clients`, `suppliers`, `trucks`, `users` (other than id=1),
  `invoices`, `returns`, `purchases`, `cash_transfers`, `truck_stock`,
  `stock_transfers`, `truck_commission_payments`, `truck_dispatches` are all
  empty. Pre-reset backup: `/root/erp-backup-pre-factory-reset-20260615.dump`
  on the Hetzner host.
- This was a **hard delete**, which violates Sync Rule #2 below. Any
  previously-synced Desktop/Mobile device that hasn't had its local SQLite
  DB wiped + sync cursors reset can **resurrect the deleted rows** on its
  next sync push. Do this cleanup (PROJECT_CONTEXT.md §22) before relying on
  production row counts being stable, and re-check counts if a stale device
  may have synced.
- **Truck driver logins are currently broken** (`trucks` table is empty) and
  only `admin` (no `vendeur1` etc.) can log in — expected until trucks/users
  are recreated.
- **Uncommitted work in progress**: the working tree on
  `fix/image-upload-improvements` has 9 files (+6/-716 lines) removing the
  warehouse→truck transfer feature ("تحويل إلى شاحنة") from `Stock.tsx`,
  `stock.ts`/`stock.js` routes, and the generated API clients/OpenAPI spec —
  **not committed, not pushed, not deployed** (PROJECT_CONTEXT.md §23).
  Production still shows that button. Don't discard these changes without
  checking with the user first.

## Critical Business Rules

- Currency DZD: prices `numeric(12,2)`, quantities `numeric(10,3)`.
- Password hash = `SHA256(password + "erp-salt-dzd")` — do not change without
  a migration plan (breaks all existing logins).
- Roles: `admin` (full), `vendeur` (configurable perms:
  canDeleteInvoice/canEditPrice/canSellOnCredit/canViewReports), `truck`
  (driver, restricted view — `TruckPortal` on web/desktop).
- Pricing tiers per client: `retail` / `half_wholesale` / `wholesale` — drives
  `selling_price_*` and `commission_*` columns on `products` and
  `invoice_items.price_type`.
- `clients.balance` is negative = debt; `credit_limit` null = unlimited.
  Credit invoices (`payment_type = "credit"`) require
  `canSellOnCredit`/`trucks.can_sell_on_credit`.
- `truck_dispatches` is **cloud-only** (not synced). Desktop has no local
  table — `desktop/server/routes/dispatches.js` is a pure proxy to
  `https://deleveri.alllal.com/api/dispatches*`.
- Invoice creation must atomically: deduct `truck_stock`, apply commission,
  adjust `clients.balance` if credit. Mobile push must be idempotent
  (`ON CONFLICT DO NOTHING` + RETURNING-gated reconciliation) — never
  double-apply on retry.

## Synchronization Rules (do not violate)

1. Every syncable table needs exactly: `sync_id text unique
   default(sql\`gen_random_uuid()::text\`)`, `updated_at timestamp not null
   default now()`, `is_deleted boolean not null default false`. Never use
   `$defaultFn` for `sync_id` (app-side only — a `drizzle-kit push` would drop
   the DB default and reintroduce the NULL-sync_id duplication bug).
2. **Never hard-delete** a syncable row. Always soft-delete
   (`is_deleted=1`, bump `updated_at`).
3. Any new FK column on a syncable table needs an entry in `FK_SYNC_RULES`
   (both `sync-v2.ts` and `sync-engine.js`) AND `PUSH_FK_RULES` (cloud) so
   `attachFkSyncIds`/`resolveFkId` can translate local↔cloud integer ids.
   Never push a raw local FK id without its `*_sync_id` companion — local and
   cloud integer ids for the same row are **not equal**.
4. New syncable table → register in BOTH: cloud `sync-v2.ts`
   (`SYNC_TABLES`/`PUSH_FK_RULES`/`PULL_TABLES`/`FK_SYNC_RULES`) AND desktop
   `sync-engine.js` (`PULL_TABLES`/`PUSH_TABLES`/`FK_SYNC_RULES`) AND desktop
   SQLite schema/triggers (`desktop/server/db.js`, mirror columns + an
   `updated_at`-bumping trigger). Mobile only if the table is in scope for
   `lib/sync.ts` PULL/PUSH lists.
5. Conflict resolution is last-write-wins by `updated_at`
   (`setWhere: excluded.updated_at > current.updated_at OR current.updated_at
   IS NULL`) — don't introduce alternative merge logic.
6. Sync errors must surface (per-table `{received, written, errors}` in push
   response, `lastPushErrors`/`lastPushTables` on desktop) — never swallow
   silently.
7. `desktop/server/sync-engine.js` hardcodes
   `REMOTE_BASE = "https://deleveri.alllal.com/api"` (production). Never point
   this at a different URL in a commit; if testing against staging, edit
   locally only and revert before commit.

## Files Requiring Explicit Approval Before Modifying

- `lib/db/src/schema/index.ts` — schema changes need a corresponding
  production migration plan (drizzle-kit push or manual SQL); changing
  existing column types/defaults can break production data.
- `artifacts/api-server/src/routes/sync-v2.ts` and
  `desktop/server/sync-engine.js` — sync core; bugs here corrupt/duplicate
  production data across all clients. Get explicit sign-off and re-run the
  sync proof harness (see Testing) before changing `FK_SYNC_RULES`,
  `PUSH_FK_RULES`, `upsertRecord`, `resolveFkId`, `sanitizeForTable`.
- `desktop/build/icon.*` — do not delete; breaks `build-exe.yml`.
- `.github/workflows/*.yml` — changes affect production deploy/release
  pipelines (Hetzner deploy, Windows installer, Android APK).
- Anything touching `passwordHash`/session secret logic
  (`auth.ts`, `app.ts` session config) — affects all existing user sessions
  and credentials.
- `pnpm-workspace.yaml` — `build-exe.yml` patches this at CI time (strips
  win32 overrides); coordinate changes with that step.

## Development Guidelines

- Check whether a fix needs to be applied in **both** `artifacts/api-server`
  (cloud) and `desktop/server` (desktop) — they are independent
  implementations of the same routes. State explicitly which side(s) you
  changed and which you didn't (and why).
- Mobile (`artifacts/erp-van-sales-mobile`) is a separate codebase with its
  own feature set — don't assume a web/desktop fix applies there.
- UI text: French for admin labels; Arabic for end-user error messages and
  toast strings (existing convention, keep consistent).
- `artifacts/erp-van-sales/src/App.tsx` mounts BOTH `<Toaster />` (shadcn
  `useToast()`) and `<SonnerToaster />` (`sonner`'s `toast.*`) — both are
  required; many pages use `sonner`.
- `desktop/server` is plain CommonJS JS (no build step) — validate with
  `node --check <file>`. `artifacts/api-server` is TypeScript.
- No `.env` files in repo — env vars come from the host (Replit
  secrets / GitHub Actions secrets / production `/etc/erp.env`). Don't create
  `.env` files; document required vars in PROJECT_CONTEXT.md instead.

## Testing Requirements

- `pnpm run typecheck` (root) before considering a TS change done. Ignore
  pre-existing TS7030 ("not all code paths return a value") warnings in
  `artifacts/api-server/src/routes/*.ts` (dispatches, invoices, purchases,
  returns, settings, stock, storage, suppliers, trucks, users, products) —
  pre-existing, not introduced by you unless you touch those exact lines.
- For `desktop/server/*.js` changes: `node --check <file>` minimum.
- For sync-engine/sync-v2 changes: re-run (or extend) the
  `node:sqlite`-shim test harness described in PROJECT_CONTEXT.md / the
  `desktop-sqlite-test-harness` approach — exercises real `db.js`/
  `sync-engine.js`/routes against a throwaway SQLite DB without needing
  Postgres or Electron's native better-sqlite3 build. `SYNC_TEST_PLAN_AND_RESULTS.md`
  has the 12-scenario test plan and a 118/118 baseline — extend it, don't
  replace it.
- Never run sync code against the real `REMOTE_BASE`
  (`https://deleveri.alllal.com`) from tests/sandboxes.
- For UI changes: start the dev server and exercise the actual feature in a
  browser (golden path + edge cases) — typecheck alone doesn't verify feature
  correctness.

## Deployment Requirements

- Cloud (api-server + frontend): auto-deploys to Hetzner on push to `main`
  via `.github/workflows/deploy-hetzner.yml` (builds, scp, pm2 reload, health
  check on `/api/healthz`). Does **not** run schema migrations — apply
  `drizzle-kit push`/SQL to production Postgres separately when schema
  changes.
- Desktop: `.github/workflows/build-exe.yml` builds the Windows installer on
  push to `main`/`v*.*.*` tags, publishes a GitHub Release
  (`build-<run_number>`). **Editing `desktop/server/*` source has zero effect
  on installed apps** until a new installer is built AND the user
  downloads/reinstalls it (bundled in `app.asar`).
- Mobile: `.github/workflows/build-android.yml` builds the APK on push to
  `main`/`v*` tags, publishes a GitHub Release. Only rebuild/notify users for
  this if the change actually touches
  `artifacts/erp-van-sales-mobile` — most fixes don't.
- `gh` CLI may be unavailable in sandboxes — use `curl` against
  `https://api.github.com/repos/souhailted2/delivery_van/...` (public repo,
  no auth needed) for CI run status.
- After any change, identify which of the three artifacts (cloud/desktop/
  mobile) actually need a rebuild and tell the user explicitly — don't assume
  all three.
