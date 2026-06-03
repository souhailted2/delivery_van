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

// Tables included in sync (order matters for FK dependencies on pull)
const PULL_TABLES = [
  "categories", "users", "suppliers", "clients", "trucks", "products",
];
const PUSH_TABLES = [
  "categories", "suppliers", "clients", "trucks", "products", "users",
  "purchases", "purchase_items",
  "invoices", "invoice_items",
  "returns", "return_items",
  "cash_transfers", "truck_stock",
  "stock_transfers", "stock_transfer_items",
];

// Columns excluded when upserting from cloud (local-only / auto fields)
const EXCLUDE_ON_UPSERT = new Set(["id", "rowid"]);

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

/** Upsert a record from cloud into local SQLite. Only applies if newer. */
function upsertRecord(tableName, record) {
  if (!record.sync_id) return;
  const db   = getDb();
  const cols  = getTableColumns(tableName).filter(c => c in record);
  if (!cols.length) return;

  const placeholders = cols.map(() => "?").join(", ");
  const updates = cols
    .filter(c => c !== "sync_id" && c !== "created_at")
    .map(c => `${c} = excluded.${c}`)
    .join(", ");

  try {
    db.prepare(`
      INSERT INTO ${tableName} (${cols.join(", ")})
      VALUES (${placeholders})
      ON CONFLICT(sync_id) DO UPDATE SET ${updates}
      WHERE excluded.updated_at > ${tableName}.updated_at
        OR ${tableName}.updated_at IS NULL
    `).run(...cols.map(c => record[c] ?? null));
  } catch {
    // Ignore constraint errors (FK missing, etc.)
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
  db.transaction(() => {
    for (const [tblName, records] of Object.entries(tables)) {
      if (!Array.isArray(records)) continue;
      for (const rec of records) {
        upsertRecord(tblName, rec);
      }
    }
  })();

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

module.exports = { start, stop, syncOnce, saveCredentials, getCredentials, onStatus, getStatus: () => ({ ...status }) };
