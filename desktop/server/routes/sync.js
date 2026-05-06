const { Router } = require("express");
const { getDb } = require("../db");
const https = require("https");
const http = require("http");

const router = Router();
const REMOTE_BASE = "https://deleveri.alllal.com/api";

// ── HTTP helper ──────────────────────────────────────────────────────────────

function httpRequest(method, url, data, cookies) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const isHttps = parsed.protocol === "https:";
    const lib = isHttps ? https : http;
    const bodyStr = data ? JSON.stringify(data) : null;
    const options = {
      hostname: parsed.hostname,
      port: parsed.port || (isHttps ? 443 : 80),
      path: parsed.pathname + parsed.search,
      method,
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
        ...(bodyStr ? { "Content-Length": Buffer.byteLength(bodyStr) } : {}),
        ...(cookies ? { "Cookie": cookies } : {}),
      },
      timeout: 20000,
    };
    const req = lib.request(options, (res) => {
      let body = "";
      res.on("data", (chunk) => (body += chunk));
      res.on("end", () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(body), headers: res.headers });
        } catch {
          resolve({ status: res.statusCode, data: body, headers: res.headers });
        }
      });
    });
    req.on("error", reject);
    req.on("timeout", () => { req.destroy(); reject(new Error("Request timeout")); });
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

function extractCookie(headers) {
  const setCookie = headers["set-cookie"];
  if (!setCookie) return null;
  return Array.isArray(setCookie)
    ? setCookie.map((c) => c.split(";")[0]).join("; ")
    : setCookie.split(";")[0];
}

// ── Sync-map helpers (incremental / idempotent) ──────────────────────────────

/**
 * Returns the already-mapped remote ID for (entityType, localId), or null
 * if this record has not been synced yet.
 */
function getMappedRemoteId(db, entityType, localId) {
  const row = db
    .prepare("SELECT remote_id FROM sync_map WHERE entity_type = ? AND local_id = ?")
    .get(entityType, localId);
  return row ? row.remote_id : null;
}

/**
 * Store or update the local→remote ID mapping after a successful push.
 */
function saveMapping(db, entityType, localId, remoteId) {
  db.prepare(`
    INSERT INTO sync_map (entity_type, local_id, remote_id)
    VALUES (?, ?, ?)
    ON CONFLICT(entity_type, local_id)
    DO UPDATE SET remote_id = excluded.remote_id,
                  synced_at = strftime('%Y-%m-%dT%H:%M:%SZ','now')
  `).run(entityType, localId, remoteId);
}

// ── Status endpoint ──────────────────────────────────────────────────────────

router.get("/sync/status", async (_req, res) => {
  try {
    const result = await httpRequest("GET", `${REMOTE_BASE}/healthz`, null, null);
    const db = getDb();
    const lastSync = db
      .prepare("SELECT * FROM sync_log ORDER BY id DESC LIMIT 1")
      .get();
    const pendingCounts = {
      categories: db.prepare("SELECT COUNT(*) AS n FROM categories").get().n,
      products: db.prepare("SELECT COUNT(*) AS n FROM products").get().n,
      clients: db.prepare("SELECT COUNT(*) AS n FROM clients").get().n,
      invoices: db.prepare("SELECT COUNT(*) AS n FROM invoices").get().n,
    };
    const syncedCounts = {
      categories: db.prepare("SELECT COUNT(*) AS n FROM sync_map WHERE entity_type='category'").get().n,
      products: db.prepare("SELECT COUNT(*) AS n FROM sync_map WHERE entity_type='product'").get().n,
      clients: db.prepare("SELECT COUNT(*) AS n FROM sync_map WHERE entity_type='client'").get().n,
      invoices: db.prepare("SELECT COUNT(*) AS n FROM sync_map WHERE entity_type='invoice'").get().n,
    };
    res.json({
      online: result.status < 500,
      remoteUrl: REMOTE_BASE,
      lastSync: lastSync
        ? { syncedAt: lastSync.synced_at, recordsPushed: lastSync.records_pushed, status: lastSync.status }
        : null,
      pendingCounts,
      syncedCounts,
    });
  } catch {
    res.json({ online: false, remoteUrl: REMOTE_BASE, lastSync: null });
  }
});

// ── Main push endpoint ───────────────────────────────────────────────────────

/**
 * Incremental, idempotent push to the remote server.
 *
 * Dependency-safe order:
 *   1. Categories      (no deps)
 *   2. Suppliers       (no deps)
 *   3. Trucks          (no deps)
 *   4. Products        (deps: category)
 *   5. Clients         (deps: truck — for truck-owned clients)
 *   6. Invoices        (deps: truck, client, product)
 *   7. Returns         (deps: truck, client, product, invoice)
 *
 * Already-synced records (present in sync_map) are skipped, making retries safe.
 * Remote IDs are captured from API responses and stored in sync_map for FK mapping.
 */
router.post("/sync/push", async (req, res) => {
  const { remoteUsername, remotePassword } = req.body;
  if (!remoteUsername || !remotePassword) {
    return res.status(400).json({ error: "Identifiants du serveur requis" });
  }

  const db = getDb();
  let cookie = null;
  let pushed = 0;
  let skipped = 0;
  const errors = [];

  async function tryPush(label, fn) {
    try {
      return await fn();
    } catch (e) {
      errors.push(`${label}: ${e.message}`);
      return null;
    }
  }

  try {
    // ── 1. Admin login ───────────────────────────────────────────────────────
    const loginRes = await httpRequest(
      "POST",
      `${REMOTE_BASE}/auth/login`,
      { username: remoteUsername, password: remotePassword },
      null
    );
    if (loginRes.status !== 200) {
      return res.status(401).json({
        error:
          "Connexion au serveur distant échouée: " +
          (loginRes.data?.error ?? "Identifiants incorrects"),
      });
    }
    cookie = extractCookie(loginRes.headers);

    // ── 2. Categories ────────────────────────────────────────────────────────
    const categories = db.prepare("SELECT * FROM categories ORDER BY id").all();
    for (const cat of categories) {
      if (getMappedRemoteId(db, "category", cat.id)) { skipped++; continue; }
      const r = await tryPush(`Catégorie "${cat.name}"`, () =>
        httpRequest("POST", `${REMOTE_BASE}/categories`, { name: cat.name }, cookie)
      );
      if (r && r.status < 300 && r.data?.id) {
        saveMapping(db, "category", cat.id, r.data.id);
        pushed++;
      } else if (r) {
        errors.push(`Catégorie "${cat.name}": HTTP ${r.status}`);
      }
    }

    // ── 3. Suppliers ─────────────────────────────────────────────────────────
    const suppliers = db.prepare("SELECT * FROM suppliers ORDER BY id").all();
    for (const s of suppliers) {
      if (getMappedRemoteId(db, "supplier", s.id)) { skipped++; continue; }
      const r = await tryPush(`Fournisseur "${s.name}"`, () =>
        httpRequest("POST", `${REMOTE_BASE}/suppliers`, {
          name: s.name, phone: s.phone, email: s.email, balance: s.balance,
        }, cookie)
      );
      if (r && r.status < 300 && r.data?.id) {
        saveMapping(db, "supplier", s.id, r.data.id);
        pushed++;
      } else if (r) {
        errors.push(`Fournisseur "${s.name}": HTTP ${r.status}`);
      }
    }

    // ── 4. Trucks ────────────────────────────────────────────────────────────
    const trucks = db.prepare("SELECT * FROM trucks ORDER BY id").all();
    for (const truck of trucks) {
      if (getMappedRemoteId(db, "truck", truck.id)) { skipped++; continue; }
      const r = await tryPush(`Camion "${truck.name}"`, () =>
        httpRequest("POST", `${REMOTE_BASE}/trucks`, {
          name: truck.name,
          plateNumber: truck.plate_number,
          driverName: truck.driver_name,
          location: truck.location,
        }, cookie)
      );
      if (r && r.status < 300 && r.data?.id) {
        saveMapping(db, "truck", truck.id, r.data.id);
        pushed++;
      } else if (r) {
        errors.push(`Camion "${truck.name}": HTTP ${r.status}`);
      }
    }

    // ── 5. Products (with mapped category_id) ────────────────────────────────
    const products = db.prepare("SELECT * FROM products ORDER BY id").all();
    for (const p of products) {
      if (getMappedRemoteId(db, "product", p.id)) { skipped++; continue; }
      const remoteCatId = p.category_id
        ? getMappedRemoteId(db, "category", p.category_id)
        : null;
      const r = await tryPush(`Produit "${p.name}"`, () =>
        httpRequest("POST", `${REMOTE_BASE}/products`, {
          name: p.name,
          barcode: p.barcode,
          unit: p.unit,
          categoryId: remoteCatId,
          stockQuantity: p.stock_quantity,
          purchasePrice: p.purchase_price,
          sellingPriceRetail: p.selling_price_retail,
          sellingPriceHalfWholesale: p.selling_price_half_wholesale,
          sellingPriceWholesale: p.selling_price_wholesale,
          commissionRetail: p.commission_retail,
          commissionHalf: p.commission_half,
          commissionWholesale: p.commission_wholesale,
          imageUrl: p.image_url,
        }, cookie)
      );
      if (r && r.status < 300 && r.data?.id) {
        saveMapping(db, "product", p.id, r.data.id);
        pushed++;
      } else if (r) {
        errors.push(`Produit "${p.name}": HTTP ${r.status}`);
      }
    }

    // ── 6. Clients (with mapped truck_id) ────────────────────────────────────
    const clients = db.prepare("SELECT * FROM clients ORDER BY id").all();
    for (const c of clients) {
      if (getMappedRemoteId(db, "client", c.id)) { skipped++; continue; }
      const remoteTruckId = c.truck_id
        ? getMappedRemoteId(db, "truck", c.truck_id)
        : null;
      const r = await tryPush(`Client "${c.name}"`, () =>
        httpRequest("POST", `${REMOTE_BASE}/clients`, {
          name: c.name,
          phone: c.phone,
          clientType: c.client_type,
          latitude: c.latitude,
          longitude: c.longitude,
          truckId: remoteTruckId,
        }, cookie)
      );
      if (r && r.status < 300 && r.data?.id) {
        saveMapping(db, "client", c.id, r.data.id);
        pushed++;
      } else if (r) {
        errors.push(`Client "${c.name}": HTTP ${r.status}`);
      }
    }

    // ── 7. Invoices (with mapped truck_id, client_id, product_ids) ───────────
    const invoices = db.prepare("SELECT * FROM invoices ORDER BY created_at, id").all();
    for (const inv of invoices) {
      if (getMappedRemoteId(db, "invoice", inv.id)) { skipped++; continue; }

      const remoteTruckId = getMappedRemoteId(db, "truck", inv.truck_id);
      const remoteClientId = getMappedRemoteId(db, "client", inv.client_id);

      if (!remoteTruckId || !remoteClientId) {
        errors.push(`Facture ${inv.invoice_number}: truck ou client non encore synchronisé`);
        continue;
      }

      const items = db.prepare("SELECT * FROM invoice_items WHERE invoice_id = ?").all(inv.id);
      const mappedItems = [];
      let itemsMappingOk = true;
      for (const it of items) {
        const remoteProductId = getMappedRemoteId(db, "product", it.product_id);
        if (!remoteProductId) {
          errors.push(`Facture ${inv.invoice_number} article: produit #${it.product_id} non synchronisé`);
          itemsMappingOk = false;
          break;
        }
        mappedItems.push({
          productId: remoteProductId,
          quantity: it.quantity,
          priceType: it.price_type,
          unitPrice: it.unit_price,
        });
      }
      if (!itemsMappingOk) continue;

      const r = await tryPush(`Facture ${inv.invoice_number}`, () =>
        httpRequest("POST", `${REMOTE_BASE}/invoices`, {
          truckId: remoteTruckId,
          clientId: remoteClientId,
          paymentType: inv.payment_type,
          latitude: inv.latitude,
          longitude: inv.longitude,
          items: mappedItems,
        }, cookie)
      );
      if (r && r.status < 300 && r.data?.id) {
        saveMapping(db, "invoice", inv.id, r.data.id);
        pushed++;
      } else if (r) {
        errors.push(`Facture ${inv.invoice_number}: HTTP ${r.status}`);
      }
    }

    // ── 8. Returns (with mapped truck_id, client_id, product_ids, invoice_id) ─
    const returns = db.prepare("SELECT * FROM returns ORDER BY created_at, id").all();
    for (const ret of returns) {
      if (getMappedRemoteId(db, "return", ret.id)) { skipped++; continue; }

      const remoteTruckId = ret.truck_id
        ? getMappedRemoteId(db, "truck", ret.truck_id) : null;
      const remoteClientId = ret.client_id
        ? getMappedRemoteId(db, "client", ret.client_id) : null;
      const remoteInvoiceId = ret.invoice_id
        ? getMappedRemoteId(db, "invoice", ret.invoice_id) : null;

      const retItems = db.prepare("SELECT * FROM return_items WHERE return_id = ?").all(ret.id);
      const mappedRetItems = [];
      let retMappingOk = true;
      for (const it of retItems) {
        const remoteProductId = getMappedRemoteId(db, "product", it.product_id);
        if (!remoteProductId) {
          errors.push(`Retour #${ret.id} article: produit #${it.product_id} non synchronisé`);
          retMappingOk = false;
          break;
        }
        mappedRetItems.push({
          productId: remoteProductId,
          quantity: it.quantity,
          unitPrice: it.unit_price,
        });
      }
      if (!retMappingOk) continue;

      const r = await tryPush(`Retour #${ret.id}`, () =>
        httpRequest("POST", `${REMOTE_BASE}/returns`, {
          type: ret.type,
          truckId: remoteTruckId,
          clientId: remoteClientId,
          invoiceId: remoteInvoiceId,
          items: mappedRetItems,
        }, cookie)
      );
      if (r && r.status < 300 && r.data?.id) {
        saveMapping(db, "return", ret.id, r.data.id);
        pushed++;
      } else if (r) {
        errors.push(`Retour #${ret.id}: HTTP ${r.status}`);
      }
    }

    // ── Log ──────────────────────────────────────────────────────────────────
    db.prepare(
      "INSERT INTO sync_log (records_pushed, status, error) VALUES (?,?,?)"
    ).run(pushed, "success", errors.length ? errors.slice(0, 5).join("; ") : null);

    res.json({
      success: true,
      recordsPushed: pushed,
      recordsSkipped: skipped,
      errors: errors.slice(0, 10),
      message: `تمت المزامنة: ${pushed} سجل جديد، ${skipped} سبق مزامنته${errors.length ? ` (${errors.length} أخطاء)` : ""}`,
    });
  } catch (err) {
    db.prepare(
      "INSERT INTO sync_log (records_pushed, status, error) VALUES (?,?,?)"
    ).run(0, "error", err.message);
    res.status(500).json({ error: "فشلت المزامنة: " + err.message });
  }
});

module.exports = router;
