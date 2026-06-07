/**
 * Bidirectional Auto-Sync Engine
 * Syncs local SQLite ↔ cloud PostgreSQL every 30 seconds when online.
 * Strategy: pull catalog from cloud first, then push all local changes.
 * Conflict resolution: latest updated_at wins.
 */

const https = require("https");
const http  = require("http");
const { getDb, getSyncMeta, setSyncMeta } = require("./db");

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
];
const PUSH_TABLES = [
  "categories", "suppliers", "clients", "trucks", "products", "users",
  "purchases", "purchase_items",
  "invoices", "invoice_items",
  "returns", "return_items",
  "cash_transfers", "truck_stock",
  "stock_transfers", "stock_transfer_items",
];

// Only exclude SQLite internal rowid — we KEEP the cloud `id` to preserve
// FK references (invoice.truck_id, invoice.client_id, etc.)
const EXCLUDE_ON_UPSERT = new Set(["rowid"]);

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

function request(method, url, data, cookie) {
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
      timeout: REQUEST_TIMEOUT,
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
function upsertRecord(tableName, record) {
  if (!record.sync_id) {
    record = { ...record, sync_id: `cloud_${tableName}_${record.id}` };
  }

  const db       = getDb();
  const cols     = getTableColumns(tableName).filter(c => c in record);
  if (!cols.length) return;

  const updateCols = cols.filter(c => c !== "id" && c !== "sync_id" && c !== "created_at");
  const vals       = cols.map(c => record[c] ?? null);

  try {
    // Find existing local row by sync_id first, then by id
    let existingId = null;
    const bySyncId = db.prepare(`SELECT id FROM ${tableName} WHERE sync_id = ? LIMIT 1`)
                       .get(record.sync_id);
    if (bySyncId) {
      existingId = bySyncId.id;
    } else if (record.id != null) {
      const byId = db.prepare(`SELECT id FROM ${tableName} WHERE id = ? LIMIT 1`)
                     .get(record.id);
      if (byId) existingId = byId.id;
    }

    if (existingId != null) {
      // UPDATE existing row only if incoming data is newer
      if (!updateCols.length) return;
      const setClause = updateCols.map(c => `${c} = ?`).join(", ");
      const setVals   = updateCols.map(c => record[c] ?? null);
      db.prepare(`
        UPDATE ${tableName}
        SET ${setClause}
        WHERE id = ?
          AND (updated_at IS NULL OR ? > updated_at)
      `).run(...setVals, existingId, record.updated_at ?? "9999");
    } else {
      // INSERT new row — preserve cloud id so FK children resolve correctly
      const placeholders = cols.map(() => "?").join(", ");
      db.prepare(
        `INSERT OR REPLACE INTO ${tableName} (${cols.join(", ")}) VALUES (${placeholders})`
      ).run(...vals);
    }
  } catch {
    try {
      const placeholders = cols.map(() => "?").join(", ");
      db.prepare(
        `INSERT OR IGNORE INTO ${tableName} (${cols.join(", ")}) VALUES (${placeholders})`
      ).run(...vals);
    } catch {}
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
    throw new Error(`Pull failed: HTTP ${r.status}`);
  }

  const tables = r.data?.tables || {};
  const db = getDb();

  // Disable FK enforcement for the bulk pull so records can be inserted in
  // any order without cross-table dependency failures.  Re-enabled after.
  db.pragma("foreign_keys = OFF");
  try {
    db.transaction(() => {
      // Respect FK-safe insertion order (parents before children)
      for (const tblName of PULL_TABLES) {
        const records = tables[tblName];
        if (!Array.isArray(records)) continue;
        for (const rec of records) {
          upsertRecord(tblName, rec);
        }
      }
    })();
  } finally {
    db.pragma("foreign_keys = ON");
  }

  setSyncMeta("last_pull_at", new Date().toISOString());
}

// ─── PUSH ─────────────────────────────────────────────────────────────────────

async function push() {
  const since  = getSyncMeta("last_push_at") || "1970-01-01T00:00:00.000Z";
  const deviceId = getSyncMeta("device_id") || "unknown";

  const tables = {};
  for (const tbl of PUSH_TABLES) {
    const rows = getLocalChanges(tbl, since);
    if (rows.length) tables[tbl] = rows;
  }

  if (!Object.keys(tables).length) return; // nothing to push

  const r = await request("POST", `${REMOTE_BASE}/sync/v2/push`, { deviceId, tables }, sessionCookie);
  if (r.status !== 200) {
    throw new Error(`Push failed: HTTP ${r.status}`);
  }

  setSyncMeta("last_push_at", new Date().toISOString());
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

/** Reset sync cursors — forces a full re-pull on the next sync cycle */
function resetSync() {
  const { setSyncMeta } = require("./db");
  setSyncMeta("last_pull_at", "1970-01-01T00:00:00.000Z");
  setSyncMeta("last_push_at", "1970-01-01T00:00:00.000Z");
}

module.exports = { start, stop, syncOnce, saveCredentials, getCredentials, onStatus, getStatus: () => ({ ...status }), resetSync };
