const { Router } = require("express");
const https = require("https");
const http = require("http");
const { getDb } = require("../db");

const router = Router();
const REMOTE_BASE = "https://deleveri.alllal.com/api";

// The desktop app has NO local dispatch store and does not pull `truck_dispatches`
// during sync. Truck dispatch lives only in the cloud (the mobile/truck app receives
// goods from there), so every /dispatches request from the desktop UI must be
// forwarded to the cloud server.
//
// CRITICAL: a desktop row's local integer `id` does NOT match the cloud's integer
// id. Rows created offline then pushed receive a fresh cloud id; the only stable
// cross-system key is `sync_id`. The cloud dispatch endpoint matches trucks/products
// by integer id, so we MUST translate every local id → cloud id (via sync_id) before
// forwarding — otherwise the cloud answers 404 "الشاحنة غير موجودة" (or deducts the
// wrong products). See resolveCloudId() below.

function request(method, url, data, cookie) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const isHttps = parsed.protocol === "https:";
    const lib = isHttps ? https : http;
    const body = data != null ? JSON.stringify(data) : null;
    const opts = {
      hostname: parsed.hostname,
      port: parsed.port || (isHttps ? 443 : 80),
      path: parsed.pathname + parsed.search,
      method,
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
        ...(body ? { "Content-Length": Buffer.byteLength(body) } : {}),
        ...(cookie ? { Cookie: cookie } : {}),
      },
      timeout: 20000,
    };
    const req = lib.request(opts, (res) => {
      let raw = "";
      res.on("data", (c) => (raw += c));
      res.on("end", () => {
        let parsed2;
        try { parsed2 = raw ? JSON.parse(raw) : null; } catch { parsed2 = raw; }
        resolve({ status: res.statusCode, data: parsed2, headers: res.headers });
      });
    });
    req.on("error", reject);
    req.on("timeout", () => { req.destroy(); reject(new Error("timeout")); });
    if (body) req.write(body);
    req.end();
  });
}

function extractCookie(headers) {
  const sc = headers["set-cookie"];
  if (!sc) return null;
  return (Array.isArray(sc) ? sc : [sc]).map((c) => c.split(";")[0]).join("; ");
}

// Obtain a valid cloud admin session cookie: prefer the live sync-engine cookie,
// else log in fresh with the stored sync credentials.
async function getCloudCookie(forceLogin) {
  const { getSessionCookie, getCredentials } = require("../sync-engine");
  if (!forceLogin) {
    const existing = getSessionCookie();
    if (existing) return existing;
  }
  const creds = getCredentials();
  if (!creds) return null;
  try {
    const r = await request("POST", `${REMOTE_BASE}/auth/login`, creds);
    if (r.status === 200) return extractCookie(r.headers);
  } catch { /* fall through */ }
  return null;
}

// ─── Local→cloud id translation (via sync_id) ────────────────────────────────

// Cache of sync_id → cloud_id maps, refreshed from the cloud's /sync/v2/pull.
// Short TTL: dispatch is an infrequent admin action, but the catalog can change.
let _idMapCache = null; // { at: number, trucks: Map, products: Map }
const ID_MAP_TTL = 30_000;

async function fetchCloudIdMaps(cookie) {
  // A full pull (since epoch) returns every truck/product with both `id` and
  // `sync_id` (snake_cased). This is how the desktop already reconciles rows, so
  // reusing it avoids any cloud-side change.
  const r = await request(
    "GET",
    `${REMOTE_BASE}/sync/v2/pull?since=1970-01-01T00:00:00.000Z`,
    null,
    cookie,
  );
  if (r.status !== 200 || !r.data || !r.data.tables) {
    throw new Error("sync pull failed: " + r.status);
  }
  const build = (rows) => {
    const m = new Map();
    for (const row of rows || []) {
      if (row && row.sync_id != null) m.set(String(row.sync_id), row.id);
    }
    return m;
  };
  return {
    at: Date.now(),
    trucks: build(r.data.tables.trucks),
    products: build(r.data.tables.products),
  };
}

async function getCloudIdMaps(cookie, force) {
  if (!force && _idMapCache && Date.now() - _idMapCache.at < ID_MAP_TTL) {
    return _idMapCache;
  }
  _idMapCache = await fetchCloudIdMaps(cookie);
  return _idMapCache;
}

function localSyncId(table, id) {
  try {
    const row = getDb().prepare(`SELECT sync_id FROM ${table} WHERE id = ?`).get(id);
    return row ? row.sync_id : null;
  } catch {
    return null;
  }
}

// Resolve a local integer id → cloud integer id for `table` ('trucks' | 'products').
// Returns null when the row is unknown locally or not yet synced to the cloud.
async function resolveCloudId(table, localId, cookie) {
  if (localId == null || Number.isNaN(Number(localId))) return null;
  const sid = localSyncId(table, Number(localId));
  if (!sid) return null;
  // Rows pulled from a cloud row that had a NULL sync_id get a fabricated
  // `cloud_<table>_<cloudId>` sync_id, with the cloud id preserved as the local id.
  const fab = String(sid).match(new RegExp(`^cloud_${table}_(\\d+)$`));
  if (fab) return Number(fab[1]);
  let maps = await getCloudIdMaps(cookie, false);
  let cloudId = maps[table].get(String(sid));
  if (cloudId == null) {
    // Cache may be stale (row pushed after last refresh) — refresh once.
    maps = await getCloudIdMaps(cookie, true);
    cloudId = maps[table].get(String(sid));
  }
  return cloudId != null ? cloudId : null;
}

async function proxyDispatch(req, res) {
  const userId = req.session?.userId;
  if (!userId) {
    return res.status(401).json({ error: "Non authentifié" });
  }

  // Dispatch is an admin warehouse action. Because the proxy authenticates to the
  // cloud with shared admin sync credentials, the desktop server must enforce the
  // caller's role locally — otherwise any logged-in user would gain admin access.
  let role;
  try {
    const user = getDb().prepare("SELECT role FROM users WHERE id = ?").get(userId);
    role = user?.role;
  } catch { /* role stays undefined -> denied below */ }
  if (role !== "admin") {
    return res.status(403).json({ error: "غير مصرح: هذه العملية تتطلب صلاحية المدير" });
  }

  let cookie = await getCloudCookie(false);
  if (!cookie) {
    return res.status(503).json({
      error: "تتطلب هذه العملية اتصالاً بالخادم السحابي. تأكد من الاتصال بالإنترنت وتفعيل المزامنة.",
    });
  }

  // ── Translate local ids → cloud ids before forwarding ──────────────────────
  const cleanPath = req.originalUrl.replace(/^\/api/, "").split("?")[0];
  let cloudTruckIdForQuery = null;
  try {
    // GET /dispatches?truckId=<localId> — list dispatches for one truck.
    if (req.method === "GET" && cleanPath === "/dispatches" && req.query.truckId != null) {
      const cid = await resolveCloudId("trucks", req.query.truckId, cookie);
      // Unknown/unsynced truck simply has no cloud dispatches yet — return empty
      // rather than surfacing a confusing error in the panel.
      if (cid == null) return res.json([]);
      cloudTruckIdForQuery = cid;
    }

    // POST /dispatches — create (تحميل شاحنة). Translate truck + every product.
    if (req.method === "POST" && cleanPath === "/dispatches" && req.body && Array.isArray(req.body.stockItems)) {
      const tCloud = await resolveCloudId("trucks", req.body.truckId, cookie);
      if (tCloud == null) {
        return res.status(409).json({
          error: "هذه الشاحنة غير مُزامَنة مع الخادم السحابي بعد. شغّل المزامنة ثم أعد المحاولة.",
        });
      }
      const items = [];
      for (const it of req.body.stockItems) {
        const pCloud = await resolveCloudId("products", it.productId, cookie);
        if (pCloud == null) {
          return res.status(409).json({
            error: `المنتج "${it.productName || it.productId}" غير مُزامَن مع الخادم السحابي بعد. شغّل المزامنة ثم أعد المحاولة.`,
          });
        }
        items.push({ ...it, productId: pCloud });
      }
      req.body = { ...req.body, truckId: tCloud, stockItems: items };
    }
  } catch (e) {
    return res.status(502).json({ error: "تعذّر تحضير المزامنة مع السحابة: " + (e.message || "خطأ") });
  }

  let sub = req.originalUrl.replace(/^\/api/, ""); // e.g. /dispatches?truckId=1
  if (cloudTruckIdForQuery != null) {
    sub = sub.replace(/([?&]truckId=)[^&]+/, `$1${cloudTruckIdForQuery}`);
  }
  const url = `${REMOTE_BASE}${sub}`;
  const hasBody = !["GET", "HEAD", "DELETE"].includes(req.method);
  const payload = hasBody ? req.body : null;

  try {
    let r = await request(req.method, url, payload, cookie);
    if (r.status === 401) {
      // Session expired — re-login once and retry.
      cookie = await getCloudCookie(true);
      if (cookie) r = await request(req.method, url, payload, cookie);
    }
    if (r.data === null || r.data === undefined || r.data === "") {
      return res.status(r.status).end();
    }
    return res.status(r.status).json(r.data);
  } catch (e) {
    return res.status(502).json({ error: "تعذّر الاتصال بالخادم السحابي: " + (e.message || "خطأ") });
  }
}

router.all("/dispatches", proxyDispatch);
router.all("/dispatches/*", proxyDispatch);

module.exports = router;
