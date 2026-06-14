const { Router } = require("express");
const https = require("https");
const http = require("http");

const router = Router();
const REMOTE_BASE = "https://deleveri.alllal.com/api";

// The desktop app has NO local dispatch store and does not pull `truck_dispatches`
// during sync. Truck dispatch lives only in the cloud (the mobile/truck app receives
// goods from there), so every /dispatches request from the desktop UI must be
// forwarded to the cloud server — mirroring the product-image cloud proxy.

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

async function proxyDispatch(req, res) {
  if (!req.session?.userId) {
    return res.status(401).json({ error: "Non authentifié" });
  }

  const sub = req.originalUrl.replace(/^\/api/, ""); // e.g. /dispatches?truckId=1
  const url = `${REMOTE_BASE}${sub}`;
  const hasBody = !["GET", "HEAD", "DELETE"].includes(req.method);
  const payload = hasBody ? req.body : null;

  let cookie = await getCloudCookie(false);
  if (!cookie) {
    return res.status(503).json({
      error: "تتطلب هذه العملية اتصالاً بالخادم السحابي. تأكد من الاتصال بالإنترنت وتفعيل المزامنة.",
    });
  }

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
