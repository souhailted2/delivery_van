/**
 * Bidirectional Auto-Sync Engine
 * Syncs local SQLite ↔ cloud PostgreSQL every 30 seconds when online.
 * Strategy: pull catalog from cloud first, then push all local changes.
 * Conflict resolution: latest updated_at wins.
 */

const https = require("https");
const http  = require("http");
const fs    = require("fs");
const path  = require("path");
const { getDb, getSyncMeta, setSyncMeta } = require("./db");
const { getUserDataPath } = require("./config");

const REMOTE_BASE    = "https://deleveri.alllal.com/api";
const SYNC_INTERVAL  = 30_000;  // 30 seconds
const ONLINE_CHECK   = 20_000;  // 20 seconds
const REQUEST_TIMEOUT = 15_000;

// Tables included in sync — order matters for FK dependencies on pull:
//   1. FK-free tables first
//   2. Then tables that reference them
const PULL_TABLES = [
  // FK-free
  "categories", "suppliers",
  // trucks before users (users.truck_id) and before clients (clients.truck_id)
  "trucks",
  // users may reference trucks
  "users",
  // clients reference trucks
  "clients",
  // products reference categories
  "products",
  // transactional — reference trucks/clients/products/suppliers
  "purchases", "purchase_items",
  "invoices", "invoice_items",
  "returns", "return_items",
  "cash_transfers", "truck_stock",
  "stock_transfers", "stock_transfer_items",
  "truck_commission_payments",
  "client_payments",
];
// Push order must also respect FK dependencies: a row's FK targets must be
// pushed (and thus resolvable by sync_id on the cloud, see C1/FK_SYNC_RULES
// below) before the row itself, so reuse the same dependency-safe ordering
// as PULL_TABLES.
const PUSH_TABLES = PULL_TABLES;

// Only exclude SQLite internal rowid — we KEEP the cloud `id` to preserve
// FK references (invoice.truck_id, invoice.client_id, etc.)
const EXCLUDE_ON_UPSERT = new Set(["rowid"]);

// FK columns that reference local-id rows of another synced table. Before
// push, each row gets a `*_sync_id` companion field (resolved via a local
// join) so the cloud can translate the local FK id to its own cloud id by
// sync_id instead of trusting the raw local id (C1) — local and cloud ids
// diverge for any row created on desktop after the initial sync.
const FK_SYNC_RULES = {
  products:             [{ idCol: "category_id", refTable: "categories",      syncCol: "category_sync_id" }],
  trucks:               [{ idCol: "vendeur_id",   refTable: "users",          syncCol: "vendeur_sync_id" }],
  users:                [{ idCol: "truck_id",     refTable: "trucks",         syncCol: "truck_sync_id" }],
  clients:              [{ idCol: "truck_id",     refTable: "trucks",         syncCol: "truck_sync_id" }],
  purchases:            [{ idCol: "supplier_id",  refTable: "suppliers",      syncCol: "supplier_sync_id" }],
  purchase_items:       [
    { idCol: "purchase_id", refTable: "purchases", syncCol: "purchase_sync_id" },
    { idCol: "product_id",  refTable: "products",  syncCol: "product_sync_id" },
  ],
  invoices: [
    { idCol: "truck_id",  refTable: "trucks",  syncCol: "truck_sync_id" },
    { idCol: "client_id", refTable: "clients", syncCol: "client_sync_id" },
  ],
  invoice_items: [
    { idCol: "invoice_id", refTable: "invoices", syncCol: "invoice_sync_id" },
    { idCol: "product_id", refTable: "products",  syncCol: "product_sync_id" },
  ],
  returns: [
    { idCol: "truck_id",   refTable: "trucks",   syncCol: "truck_sync_id" },
    { idCol: "client_id",  refTable: "clients",  syncCol: "client_sync_id" },
    { idCol: "invoice_id", refTable: "invoices", syncCol: "invoice_sync_id" },
  ],
  return_items: [
    { idCol: "return_id",  refTable: "returns",  syncCol: "return_sync_id" },
    { idCol: "product_id", refTable: "products", syncCol: "product_sync_id" },
  ],
  cash_transfers: [{ idCol: "truck_id", refTable: "trucks", syncCol: "truck_sync_id" }],
  truck_stock: [
    { idCol: "truck_id",   refTable: "trucks",   syncCol: "truck_sync_id" },
    { idCol: "product_id", refTable: "products", syncCol: "product_sync_id" },
  ],
  stock_transfers: [{ idCol: "truck_id", refTable: "trucks", syncCol: "truck_sync_id" }],
  stock_transfer_items: [
    { idCol: "transfer_id", refTable: "stock_transfers", syncCol: "transfer_sync_id" },
    { idCol: "product_id",  refTable: "products",        syncCol: "product_sync_id" },
  ],
  truck_commission_payments: [{ idCol: "truck_id", refTable: "trucks", syncCol: "truck_sync_id" }],
  client_payments: [
    { idCol: "truck_id",  refTable: "trucks",  syncCol: "truck_sync_id" },
    { idCol: "client_id", refTable: "clients", syncCol: "client_sync_id" },
  ],
};

/** Attach `*_sync_id` companion fields to each row for FK translation on push (C1). */
function attachFkSyncIds(tableName, rows) {
  const rules = FK_SYNC_RULES[tableName];
  if (!rules || !rows.length) return rows;
  const db = getDb();
  const cache = new Map(); // "refTable:id" -> sync_id | null
  for (const row of rows) {
    for (const rule of rules) {
      const localId = row[rule.idCol];
      if (localId == null) { row[rule.syncCol] = null; continue; }
      const key = rule.refTable + ":" + localId;
      let syncId = cache.get(key);
      if (syncId === undefined) {
        const found = db.prepare(`SELECT sync_id FROM ${rule.refTable} WHERE id = ?`).get(localId);
        syncId = found ? found.sync_id : null;
        cache.set(key, syncId);
      }
      row[rule.syncCol] = syncId;
    }
  }
  return rows;
}

let syncTimer   = null;
let onlineTimer = null;
let sessionCookie = null;
let isSyncing   = false;

const status = {
  online:   false,
  syncing:  false,
  lastSync: null,   // ISO string
  error:    null,   // string | null
  pending:  0,      // records pending push
  lastPullReceived:   0,    // total records received from server in last pull
  lastPullWritten:    0,    // total records written to SQLite in last pull
  lastPullFirstError: null, // first upsert error message (diagnostic)
  lastPushTables:     {},   // per-table { received, written, errors } from last push
  lastPushFirstError: null, // first push row-rejection message (diagnostic)
  lastPushErrors:     {},   // per-table arrays of { syncId, error } from last push
};

const listeners = new Set();

function emit(update) {
  Object.assign(status, update);
  for (const fn of listeners) {
    try { fn({ ...status }); } catch {}
  }
}

function onStatus(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// ─── HTTP ────────────────────────────────────────────────────────────────────

function request(method, url, data, cookie, timeoutMs) {
  return new Promise((resolve, reject) => {
    const parsed  = new URL(url);
    const isHttps = parsed.protocol === "https:";
    const lib     = isHttps ? https : http;
    const body    = data ? JSON.stringify(data) : null;
    const opts = {
      hostname: parsed.hostname,
      port: parsed.port || (isHttps ? 443 : 80),
      path: parsed.pathname + parsed.search,
      method,
      headers: {
        "Content-Type":  "application/json",
        "Accept":        "application/json",
        ...(body   ? { "Content-Length": Buffer.byteLength(body) } : {}),
        ...(cookie ? { "Cookie": cookie } : {}),
      },
      timeout: timeoutMs || REQUEST_TIMEOUT,
    };
    const req = lib.request(opts, (res) => {
      let raw = "";
      res.on("data", c => (raw += c));
      res.on("end", () => {
        let parsed2;
        try { parsed2 = JSON.parse(raw); } catch { parsed2 = raw; }
        resolve({ status: res.statusCode, data: parsed2, headers: res.headers });
      });
    });
    req.on("error",   reject);
    req.on("timeout", () => { req.destroy(); reject(new Error("timeout")); });
    if (body) req.write(body);
    req.end();
  });
}

function extractCookie(headers) {
  const sc = headers["set-cookie"];
  if (!sc) return null;
  return (Array.isArray(sc) ? sc : [sc]).map(c => c.split(";")[0]).join("; ");
}

// ─── Credentials ─────────────────────────────────────────────────────────────

function getCredentials() {
  const username = getSyncMeta("remote_username");
  const password = getSyncMeta("remote_password");
  return username && password ? { username, password } : null;
}

function saveCredentials(username, password) {
  setSyncMeta("remote_username", username);
  setSyncMeta("remote_password", password);
}

// ─── Login ───────────────────────────────────────────────────────────────────

async function ensureSession() {
  if (sessionCookie) {
    // Quick verify
    try {
      const r = await request("GET", `${REMOTE_BASE}/auth/me`, null, sessionCookie);
      if (r.status === 200) return true;
    } catch {}
    sessionCookie = null;
  }
  const creds = getCredentials();
  if (!creds) return false;
  try {
    const r = await request("POST", `${REMOTE_BASE}/auth/login`, creds);
    if (r.status === 200) {
      sessionCookie = extractCookie(r.headers);
      return !!sessionCookie;
    }
  } catch {}
  return false;
}

// ─── Online check ─────────────────────────────────────────────────────────────

async function checkOnline() {
  try {
    const r = await request("GET", `${REMOTE_BASE}/healthz`, null, null);
    return r.status < 500;
  } catch {
    return false;
  }
}

// ─── Interactive login passthrough (online identity unification) ───────────────
//
// When the desktop is ONLINE, the interactive /auth/login should authenticate
// against the SAME cloud identity source as web/mobile — not the local SQLite
// seed — so credentials never diverge (the old behaviour let a stale local
// `admin/admin123` accept a password the cloud had already changed). The desktop
// route calls this first; only when the cloud is UNREACHABLE does it fall back
// to local SQLite (true offline-first). A cloud 401 is authoritative and is NOT
// retried locally.
//
// Returns:
//   { reachable: false }                      → offline / network error → caller falls back to local
//   { reachable: true, ok: false, status }    → cloud rejected the credentials (authoritative)
//   { reachable: true, ok: true, user }        → cloud authenticated; `user` is the cloud identity
//
// On success the cloud session cookie is adopted so a sync can proceed without a
// second round-trip. A short timeout keeps the login responsive when offline.
const LOGIN_TIMEOUT = 8_000;
async function cloudLogin(username, password) {
  let r;
  try {
    r = await request("POST", `${REMOTE_BASE}/auth/login`, { username, password }, null, LOGIN_TIMEOUT);
  } catch {
    return { reachable: false };
  }
  if (r.status === 200 && r.data && r.data.user) {
    sessionCookie = extractCookie(r.headers);
    return { reachable: true, ok: true, user: r.data.user };
  }
  if (r.status === 401) return { reachable: true, ok: false, status: 401 };
  // Any other status (5xx, etc.) — treat as not authoritative so the caller can
  // still serve the user offline rather than locking them out on a cloud hiccup.
  return { reachable: false };
}

// ─── SQLite helpers ──────────────────────────────────────────────────────────

function getTableColumns(tableName) {
  const db = getDb();
  return db.prepare(`PRAGMA table_info(${tableName})`).all()
    .map(c => c.name)
    .filter(c => !EXCLUDE_ON_UPSERT.has(c));
}

/** Upsert a record from cloud into local SQLite.
 *
 *  Strategy (FK enforcement is OFF during the pull transaction):
 *
 *  1. Look for an existing local row by sync_id, then by id.
 *  2a. Found → UPDATE only if cloud updated_at is newer.
 *  2b. Not found → INSERT OR REPLACE preserving cloud id so that FK
 *      child rows (invoice.truck_id, etc.) resolve to the right parent.
 *
 *  Root cause this fixes: the old "ON CONFLICT(sync_id)" approach silently
 *  failed whenever a local row already held the same `id` but a different
 *  sync_id — the PK constraint fired first and the catch block couldn't
 *  recover, so nothing was written to SQLite.
 */
/** Returns true if a record was successfully written, false otherwise */
function upsertRecord(tableName, record) {
  if (!record.sync_id) {
    record = { ...record, sync_id: `cloud_${tableName}_${record.id}` };
  }

  const db       = getDb();
  const cols     = getTableColumns(tableName).filter(c => c in record);
  if (!cols.length) return false;

  const updateCols = cols.filter(c => c !== "id" && c !== "sync_id" && c !== "created_at");
  // SQLite doesn't support booleans — convert true/false → 1/0
  const toSqlite   = v => (typeof v === "boolean" ? (v ? 1 : 0) : (v ?? null));
  const vals       = cols.map(c => toSqlite(record[c]));

  try {
    // Find existing local row by sync_id first, then by id
    let existingId = null;
    let existingSyncId = null;
    const bySyncId = db.prepare(`SELECT id, sync_id FROM ${tableName} WHERE sync_id = ? LIMIT 1`)
                       .get(record.sync_id);
    if (bySyncId) {
      existingId = bySyncId.id;
      existingSyncId = bySyncId.sync_id;
    } else if (record.id != null) {
      const byId = db.prepare(`SELECT id, sync_id FROM ${tableName} WHERE id = ? LIMIT 1`)
                     .get(record.id);
      if (byId) { existingId = byId.id; existingSyncId = byId.sync_id; }
    }

    // Upgrade a locally-fabricated "cloud_<table>_<id>" placeholder sync_id to the
    // real cloud-assigned sync_id as soon as the cloud sends one for this row,
    // regardless of the updated_at gate below. Without this, attachFkSyncIds()/
    // resolveFkId() keep matching FK children against the placeholder, which the
    // cloud never has, so FK resolution on push fails forever for that row.
    if (
      existingId != null &&
      existingSyncId &&
      existingSyncId.startsWith(`cloud_${tableName}_`) &&
      record.sync_id &&
      record.sync_id !== existingSyncId &&
      !record.sync_id.startsWith(`cloud_${tableName}_`)
    ) {
      db.prepare(`UPDATE ${tableName} SET sync_id = ? WHERE id = ?`).run(record.sync_id, existingId);
    }

    if (existingId != null) {
      if (!updateCols.length) return true; // already exists, nothing to update
      const setClause = updateCols.map(c => `${c} = ?`).join(", ");
      const setVals   = updateCols.map(c => toSqlite(record[c]));
      db.prepare(`
        UPDATE ${tableName}
        SET ${setClause}
        WHERE id = ?
          AND (updated_at IS NULL OR ? > updated_at)
      `).run(...setVals, existingId, record.updated_at ?? "9999");
      return true;
    } else {
      const placeholders = cols.map(() => "?").join(", ");
      db.prepare(
        `INSERT OR REPLACE INTO ${tableName} (${cols.join(", ")}) VALUES (${placeholders})`
      ).run(...vals);
      return true;
    }
  } catch (e1) {
    try {
      const placeholders = cols.map(() => "?").join(", ");
      db.prepare(
        `INSERT OR IGNORE INTO ${tableName} (${cols.join(", ")}) VALUES (${placeholders})`
      ).run(...vals);
      return true;
    } catch (e2) {
      // Return the error message string so pull() can surface it in the UI
      return `${tableName}: ${e2.message || e1.message}`;
    }
  }
}

/** Get all local records changed since a timestamp */
function getLocalChanges(tableName, since) {
  const db = getDb();
  try {
    return db.prepare(
      `SELECT * FROM ${tableName} WHERE updated_at > ? OR updated_at IS NULL ORDER BY updated_at`
    ).all(since || "1970-01-01T00:00:00.000Z");
  } catch {
    return [];
  }
}

function countPending() {
  const since = getSyncMeta("last_push_at") || "1970-01-01T00:00:00.000Z";
  const db = getDb();
  let total = 0;
  for (const tbl of PUSH_TABLES) {
    try {
      const row = db.prepare(`SELECT COUNT(*) AS n FROM ${tbl} WHERE updated_at > ?`).get(since);
      total += row?.n ?? 0;
    } catch {}
  }
  return total;
}

// ─── PULL ─────────────────────────────────────────────────────────────────────

async function pull() {
  const since = getSyncMeta("last_pull_at") || "1970-01-01T00:00:00.000Z";
  const url   = `${REMOTE_BASE}/sync/v2/pull?since=${encodeURIComponent(since)}`;

  const r = await request("GET", url, null, sessionCookie);
  if (r.status !== 200) {
    throw new Error(`Pull failed: HTTP ${r.status} — ${JSON.stringify(r.data).slice(0,100)}`);
  }

  // P0-2: if the cloud's sync epoch changed (destructive reset), wipe local and
  // re-pull clean BEFORE applying anything — stale rows can never be re-pushed.
  const serverEpoch = r.data?.epoch;
  if (serverEpoch != null) {
    const storedEpoch = getSyncMeta("sync_epoch");
    if (storedEpoch != null && String(serverEpoch) !== String(storedEpoch)) {
      wipeAndAdoptEpoch(serverEpoch);
      return; // next cycle pulls a clean full set under the new epoch
    }
    if (storedEpoch == null) setSyncMeta("sync_epoch", String(serverEpoch));
  }

  const tables = r.data?.tables || {};
  const db = getDb();

  // Per-table diagnostics: { [tableName]: { received, written, error } }
  const tableDetails = {};
  let totalReceived = 0;
  let totalWritten  = 0;
  let firstError    = null;

  for (const tblName of PULL_TABLES) {
    const recs = tables[tblName];
    const cnt = Array.isArray(recs) ? recs.length : 0;
    tableDetails[tblName] = { received: cnt, written: 0, error: null };
    totalReceived += cnt;
  }

  // Use explicit BEGIN/COMMIT instead of db.transaction() to allow
  // db.prepare() calls inside the loop (better-sqlite3 can silently fail
  // when prepare() is called inside a db.transaction() callback).
  db.pragma("foreign_keys = OFF");
  try {
    db.exec("BEGIN");
    try {
      for (const tblName of PULL_TABLES) {
        const records = tables[tblName];
        if (!Array.isArray(records)) continue;
        for (const rec of records) {
          const result = upsertRecord(tblName, rec);
          if (result === true) {
            totalWritten++;
            tableDetails[tblName].written++;
          } else {
            const errMsg = result || `unknown error in ${tblName}`;
            if (!firstError) firstError = errMsg;
            if (!tableDetails[tblName].error) tableDetails[tblName].error = errMsg;
          }
        }
      }
      db.exec("COMMIT");
    } catch (txErr) {
      try { db.exec("ROLLBACK"); } catch {}
      throw txErr;
    }
  } finally {
    db.pragma("foreign_keys = ON");
  }

  setSyncMeta("last_pull_at", new Date().toISOString());
  emit({
    lastPullReceived:   totalReceived,
    lastPullWritten:    totalWritten,
    lastPullFirstError: firstError,
    lastPullTables:     tableDetails,
  });
}

// ─── Image upload to cloud ────────────────────────────────────────────────────

/**
 * Upload a local product image to the cloud server.
 * Returns the cloud imageUrl string, or null on failure.
 */
function uploadImageToCloud(filename) {
  return new Promise((resolve) => {
    let uploadsDir;
    try { uploadsDir = path.join(getUserDataPath(), "uploads"); } catch { resolve(null); return; }

    const filePath = path.join(uploadsDir, filename);
    if (!fs.existsSync(filePath)) { resolve(null); return; }

    let fileData;
    try { fileData = fs.readFileSync(filePath); } catch { resolve(null); return; }

    const boundary = "----SyncBoundary" + Date.now();
    const ext = path.extname(filename).toLowerCase();
    const mime = ext === ".png" ? "image/png" : ext === ".webp" ? "image/webp" : "image/jpeg";

    const head = Buffer.from(
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="file"; filename="${filename}"\r\n` +
      `Content-Type: ${mime}\r\n\r\n`
    );
    const tail = Buffer.from(`\r\n--${boundary}--\r\n`);
    const body = Buffer.concat([head, fileData, tail]);

    const parsed = new URL(`${REMOTE_BASE}/products/upload-image`);
    const opts = {
      hostname: parsed.hostname,
      port:     parsed.port || 443,
      path:     parsed.pathname,
      method:   "POST",
      headers: {
        "Content-Type":   `multipart/form-data; boundary=${boundary}`,
        "Content-Length": body.length,
        ...(sessionCookie ? { Cookie: sessionCookie } : {}),
      },
      timeout: 30_000,
    };

    const lib = parsed.protocol === "https:" ? https : http;
    const req = lib.request(opts, (res) => {
      let raw = "";
      res.on("data", c => (raw += c));
      res.on("end", () => {
        try { resolve(JSON.parse(raw).imageUrl || null); } catch { resolve(null); }
      });
    });
    req.on("error",   () => resolve(null));
    req.on("timeout", () => { req.destroy(); resolve(null); });
    req.write(body);
    req.end();
  });
}

// ─── PUSH ─────────────────────────────────────────────────────────────────────

async function push() {
  const since  = getSyncMeta("last_push_at") || "1970-01-01T00:00:00.000Z";
  const deviceId = getSyncMeta("device_id") || "unknown";

  const tables = {};
  for (const tbl of PUSH_TABLES) {
    // Never push back rows that ORIGINATED in the cloud but had no sync_id when
    // pulled: upsertRecord() fabricates a local `cloud_<table>_<id>` sync_id for
    // them so the local UNIQUE constraint is satisfied. Pushing that fabricated
    // id back creates a DUPLICATE in the cloud, because the cloud's matching row
    // still has sync_id = NULL (NULLs never conflict on the unique index). The
    // cloud is the source of truth for these rows, so exclude them from push.
    const rows = getLocalChanges(tbl, since).filter(
      (r) => !(typeof r.sync_id === "string" && r.sync_id.startsWith("cloud_")),
    );
    if (rows.length) tables[tbl] = attachFkSyncIds(tbl, rows);
  }

  if (!Object.keys(tables).length) return; // nothing to push

  // Upload local product images to cloud before pushing, so the cloud URL
  // references a real file on the server instead of a local-only path.
  if (tables.products) {
    const updated = [];
    for (const p of tables.products) {
      if (p.image_url && p.image_url.startsWith("/api/storage/uploads/")) {
        const filename = path.basename(p.image_url);
        const cloudUrl = await uploadImageToCloud(filename);
        updated.push(cloudUrl ? { ...p, image_url: cloudUrl } : p);
      } else {
        updated.push(p);
      }
    }
    tables.products = updated;
  }

  const r = await request("POST", `${REMOTE_BASE}/sync/v2/push`, { deviceId, tables, epoch: getSyncMeta("sync_epoch") }, sessionCookie);
  // P0-2: the cloud rejects a stale-epoch push (it would resurrect deleted rows).
  // Wipe + adopt the new epoch; the next pull re-fills from a clean state.
  if (r.status === 409 && r.data?.resetRequired) {
    wipeAndAdoptEpoch(r.data.epoch);
    return;
  }
  if (r.status !== 200) {
    throw new Error(`Push failed: HTTP ${r.status}`);
  }

  // Surface per-row sync errors instead of silently discarding them: the server
  // returns { results: { [table]: { received, written, errors: [...] } } } so a
  // row rejected by the cloud (e.g. FK violation) is visible in the sync status
  // instead of vanishing — the row's updated_at is still bumped, so without this
  // it would never be retried or reported.
  const results = r.data?.results || {};
  let firstError = null;
  const tableErrors = {};
  const rejectedSyncIds = new Set();
  for (const [table, info] of Object.entries(results)) {
    if (info?.errors?.length) {
      tableErrors[table] = info.errors;
      if (!firstError) firstError = `${table}: ${info.errors[0].error}`;
      for (const e of info.errors) if (e && e.sync_id) rejectedSyncIds.add(e.sync_id);
    }
  }
  emit({ lastPushTables: results, lastPushFirstError: firstError, lastPushErrors: tableErrors });

  // Advance the push cursor WITHOUT skipping past rejected rows. A row the cloud
  // rejected per-row (e.g. an unresolved FK whose parent syncs later) must be
  // RETRIED, not silently dropped. If every row was accepted, advance to now();
  // otherwise move the cursor to just before the earliest rejected row so it
  // (and anything after) is re-selected next cycle, while earlier accepted rows
  // are not needlessly re-pushed (the cloud upsert is idempotent regardless).
  if (rejectedSyncIds.size === 0) {
    setSyncMeta("last_push_at", new Date().toISOString());
  } else {
    let earliest = null;
    for (const rows of Object.values(tables)) {
      for (const row of rows) {
        if (rejectedSyncIds.has(row.sync_id) && row.updated_at &&
            (earliest === null || row.updated_at < earliest)) {
          earliest = row.updated_at;
        }
      }
    }
    if (earliest) {
      setSyncMeta("last_push_at", new Date(new Date(earliest).getTime() - 1).toISOString());
    }
    // If the rejected row's timestamp couldn't be located, leave the cursor
    // unchanged (== since) so nothing is skipped — a full, safe retry next cycle.
  }
}

// ─── Main sync cycle ──────────────────────────────────────────────────────────

async function syncOnce() {
  if (isSyncing) return;
  isSyncing = true;
  emit({ syncing: true, error: null });

  try {
    const online = await checkOnline();
    emit({ online });
    if (!online) { emit({ syncing: false }); isSyncing = false; return; }

    const authed = await ensureSession();
    if (!authed) {
      emit({ syncing: false, error: "لا تتوفر بيانات الدخول للسيرفر — افتح إعدادات المزامنة" });
      isSyncing = false;
      return;
    }

    await pull();
    await push();

    emit({
      syncing:  false,
      lastSync: new Date().toISOString(),
      error:    null,
      pending:  0,
    });
  } catch (err) {
    emit({ syncing: false, error: err.message });
  } finally {
    isSyncing = false;
  }
}

// ─── Lifecycle ────────────────────────────────────────────────────────────────

function start() {
  stop();
  // Update online status every 20s
  onlineTimer = setInterval(async () => {
    const online = await checkOnline();
    emit({ online, pending: countPending() });
  }, ONLINE_CHECK);

  // Full sync every 30s
  syncTimer = setInterval(syncOnce, SYNC_INTERVAL);

  // First sync after 3 seconds (give server time to start)
  setTimeout(syncOnce, 3_000);
}

function stop() {
  if (syncTimer)   { clearInterval(syncTimer);   syncTimer   = null; }
  if (onlineTimer) { clearInterval(onlineTimer); onlineTimer = null; }
  sessionCookie = null;
}

/** P0-2: wipe every syncable table, reset cursors, and adopt a new sync epoch.
 *  Triggered when the cloud's sync epoch changes (e.g. after a factory reset),
 *  so a stale device starts clean and re-pulls instead of re-pushing rows the
 *  cloud deleted (which would resurrect them). */
function wipeAndAdoptEpoch(newEpoch) {
  const db = getDb();
  db.pragma("foreign_keys = OFF");
  try {
    db.exec("BEGIN");
    try {
      for (const tbl of PULL_TABLES) {
        try { db.prepare(`DELETE FROM ${tbl}`).run(); } catch {}
      }
      db.exec("COMMIT");
    } catch (e) { try { db.exec("ROLLBACK"); } catch {} throw e; }
  } finally { db.pragma("foreign_keys = ON"); }
  setSyncMeta("last_pull_at", "1970-01-01T00:00:00.000Z");
  setSyncMeta("last_push_at", "1970-01-01T00:00:00.000Z");
  setSyncMeta("sync_epoch", String(newEpoch));
  emit({ epochReset: true, epoch: String(newEpoch) });
}

/** Reset sync cursors — forces a full re-pull on the next sync cycle */
function resetSync() {
  const { setSyncMeta } = require("./db");
  setSyncMeta("last_pull_at", "1970-01-01T00:00:00.000Z");
  setSyncMeta("last_push_at", "1970-01-01T00:00:00.000Z");
}

function getSessionCookie() { return sessionCookie; }

/**
 * Make an authenticated request to the cloud API, ensuring a valid session
 * first. Used by routes the desktop's local server doesn't implement yet
 * (e.g. truck dispatches) so they can be proxied to the cloud — which already
 * handles them and is where the mobile truck receives them. Throws when offline
 * or not authenticated so the caller can return a clear error.
 */
async function cloudRequest(method, apiPath, data) {
  const ok = await ensureSession();
  if (!ok) throw new Error("no cloud session");
  return request(method, `${REMOTE_BASE}${apiPath}`, data, sessionCookie);
}

module.exports = { start, stop, syncOnce, saveCredentials, getCredentials, onStatus, getStatus: () => ({ ...status }), resetSync, getSessionCookie, cloudRequest, cloudLogin };
