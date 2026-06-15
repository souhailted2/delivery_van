const { Router } = require("express");
const { getDb } = require("../db");
const { getUserDataPath } = require("../config");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith("image/")) cb(null, true);
    else cb(new Error("يُسمح برفع ملفات الصور فقط"));
  },
});

router.post("/products/upload-image", (req, res, next) => {
  if (!req.session?.userId && !req.session?.truckId) {
    return res.status(401).json({ error: "Non authentifié" });
  }
  next();
}, (req, res, next) => {
  upload.single("file")(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message || "خطأ في معالجة الملف" });
    next();
  });
}, (req, res) => {
  if (!req.file) return res.status(400).json({ error: "ملف الصورة مطلوب" });
  try {
    const uploadsDir = path.join(getUserDataPath(), "uploads");
    fs.mkdirSync(uploadsDir, { recursive: true });
    const filename = `${crypto.randomUUID()}.jpg`;
    fs.writeFileSync(path.join(uploadsDir, filename), req.file.buffer);
    res.json({ imageUrl: `/api/storage/uploads/${filename}` });
  } catch (err) {
    console.error("Image upload error:", err);
    res.status(500).json({ error: "حدث خطأ أثناء حفظ الصورة" });
  }
});

router.get("/storage/uploads/:filename", (req, res) => {
  const filename = path.basename(req.params.filename);
  const filePath = path.join(getUserDataPath(), "uploads", filename);

  if (fs.existsSync(filePath)) {
    res.setHeader("Content-Type", "image/jpeg");
    return res.sendFile(filePath);
  }

  // File not found locally — proxy from cloud using sync session cookie
  const { getSessionCookie } = require("../sync-engine");
  const cookie = getSessionCookie();
  if (!cookie) return res.status(404).json({ error: "الملف غير موجود" });

  const https = require("https");
  const cloudUrl = `https://deleveri.alllal.com/api/storage/uploads/${filename}`;
  const cloudReq = https.get(cloudUrl, { headers: { cookie } }, (cloudRes) => {
    if (cloudRes.statusCode !== 200) return res.status(404).end();
    const ct = cloudRes.headers["content-type"] || "image/jpeg";
    res.setHeader("Content-Type", ct);
    res.setHeader("Cache-Control", "public, max-age=86400");
    cloudRes.pipe(res);
  });
  cloudReq.on("error", () => res.status(500).end());
});

function formatProduct(p) {
  return {
    id: p.id, name: p.name, barcode: p.barcode,
    categoryId: p.category_id, categoryName: p.category_name,
    stockQuantity: Number(p.stock_quantity ?? 0),
    purchasePrice: Number(p.purchase_price ?? 0),
    sellingPriceRetail: Number(p.selling_price_retail ?? 0),
    sellingPriceHalfWholesale: Number(p.selling_price_half_wholesale ?? 0),
    sellingPriceWholesale: Number(p.selling_price_wholesale ?? 0),
    commissionRetail: Number(p.commission_retail ?? 0),
    commissionHalf: Number(p.commission_half ?? 0),
    commissionWholesale: Number(p.commission_wholesale ?? 0),
    imageUrl: p.image_url ?? null, unit: p.unit, createdAt: p.created_at,
  };
}

const SELECT_PRODUCT = `
  SELECT p.*, c.name AS category_name
  FROM products p LEFT JOIN categories c ON p.category_id = c.id
`;

router.get("/products", (req, res) => {
  const { categoryId, search, page, limit } = req.query;
  const db = getDb();
  const conds = ["p.is_deleted = 0"];
  const params = [];
  if (categoryId) { conds.push("p.category_id = ?"); params.push(parseInt(categoryId)); }
  if (search)     { conds.push("p.name LIKE ?");      params.push(`%${search}%`); }
  const where = " WHERE " + conds.join(" AND ");

  if (page !== undefined || limit !== undefined) {
    const pageNum  = Math.max(1, parseInt(page) || 1);
    const pageSize = Math.min(500, Math.max(1, parseInt(limit) || 100));
    const offset   = (pageNum - 1) * pageSize;
    const products = db.prepare(SELECT_PRODUCT + where + " ORDER BY p.name LIMIT ? OFFSET ?")
      .all(...params, pageSize, offset);
    res.json(products.map(formatProduct));
  } else {
    const products = db.prepare(SELECT_PRODUCT + where + " ORDER BY p.name").all(...params);
    res.json(products.map(formatProduct));
  }
});

router.post("/products", (req, res) => {
  const { name, barcode, categoryId, stockQuantity, purchasePrice, sellingPriceRetail,
    sellingPriceHalfWholesale, sellingPriceWholesale, commissionRetail,
    commissionHalf, commissionWholesale, imageUrl, unit } = req.body;
  if (!name) return res.status(400).json({ error: "Nom requis" });
  const db = getDb();
  const info = db.prepare(`
    INSERT INTO products (name, barcode, category_id, stock_quantity, purchase_price,
      selling_price_retail, selling_price_half_wholesale, selling_price_wholesale,
      commission_retail, commission_half, commission_wholesale, image_url, unit)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
  `).run(name, barcode || null, categoryId || null,
    Number(stockQuantity ?? 0), Number(purchasePrice ?? 0),
    Number(sellingPriceRetail ?? 0), Number(sellingPriceHalfWholesale ?? 0),
    Number(sellingPriceWholesale ?? 0), Number(commissionRetail ?? 0),
    Number(commissionHalf ?? 0), Number(commissionWholesale ?? 0),
    imageUrl || null, unit || "unité");
  const product = db.prepare(SELECT_PRODUCT + " WHERE p.id = ? AND p.is_deleted = 0").get(info.lastInsertRowid);
  res.status(201).json(formatProduct(product));
});

router.get("/products/:id", (req, res) => {
  const db = getDb();
  const product = db.prepare(SELECT_PRODUCT + " WHERE p.id = ? AND p.is_deleted = 0").get(parseInt(req.params.id));
  if (!product) return res.status(404).json({ error: "Produit non trouvé" });
  res.json(formatProduct(product));
});

router.put("/products/:id", (req, res) => {
  const id = parseInt(req.params.id);
  const db = getDb();
  const existing = db.prepare("SELECT * FROM products WHERE id = ? AND is_deleted = 0").get(id);
  if (!existing) return res.status(404).json({ error: "Produit non trouvé" });
  const { name, barcode, categoryId, stockQuantity, purchasePrice, sellingPriceRetail,
    sellingPriceHalfWholesale, sellingPriceWholesale, commissionRetail,
    commissionHalf, commissionWholesale, imageUrl, unit } = req.body;
  db.prepare(`
    UPDATE products SET
      name = COALESCE(?,name), barcode = COALESCE(?,barcode),
      category_id = COALESCE(?,category_id),
      stock_quantity = COALESCE(?,stock_quantity),
      purchase_price = COALESCE(?,purchase_price),
      selling_price_retail = COALESCE(?,selling_price_retail),
      selling_price_half_wholesale = COALESCE(?,selling_price_half_wholesale),
      selling_price_wholesale = COALESCE(?,selling_price_wholesale),
      commission_retail = COALESCE(?,commission_retail),
      commission_half = COALESCE(?,commission_half),
      commission_wholesale = COALESCE(?,commission_wholesale),
      image_url = COALESCE(?,image_url),
      unit = COALESCE(?,unit)
    WHERE id = ?
  `).run(
    name ?? null, barcode ?? null, categoryId ?? null,
    stockQuantity != null ? Number(stockQuantity) : null,
    purchasePrice != null ? Number(purchasePrice) : null,
    sellingPriceRetail != null ? Number(sellingPriceRetail) : null,
    sellingPriceHalfWholesale != null ? Number(sellingPriceHalfWholesale) : null,
    sellingPriceWholesale != null ? Number(sellingPriceWholesale) : null,
    commissionRetail != null ? Number(commissionRetail) : null,
    commissionHalf != null ? Number(commissionHalf) : null,
    commissionWholesale != null ? Number(commissionWholesale) : null,
    imageUrl ?? null, unit ?? null, id
  );
  const product = db.prepare(SELECT_PRODUCT + " WHERE p.id = ?").get(id);
  res.json(formatProduct(product));
});

router.delete("/products/:id", (req, res) => {
  const db = getDb();
  db.prepare(
    "UPDATE products SET is_deleted = 1, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?"
  ).run(parseInt(req.params.id));
  res.status(204).send();
});

// POST /products/bulk — Excel import dialog. Matches existing products by
// name; "update" adds the imported quantity to the existing stock, "skip"
// leaves the existing product untouched. New names are inserted.
router.post("/products/bulk", (req, res) => {
  const { products, duplicateAction } = req.body || {};

  if (!Array.isArray(products) || products.length === 0) {
    return res.status(400).json({ error: "لا توجد منتجات للاستيراد" });
  }

  const db = getDb();
  let added = 0, updated = 0, skipped = 0;
  const errors = [];

  const findExisting = db.prepare("SELECT id, stock_quantity FROM products WHERE name = ? AND is_deleted = 0");
  const updateStock = db.prepare("UPDATE products SET stock_quantity = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?");
  const insertProduct = db.prepare(`
    INSERT INTO products (name, barcode, category_id, stock_quantity, purchase_price,
      selling_price_retail, selling_price_half_wholesale, selling_price_wholesale,
      commission_retail, commission_half, commission_wholesale, unit)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
  `);

  for (const p of products) {
    if (!p.name?.trim()) continue;
    try {
      const existing = findExisting.get(p.name.trim());
      if (existing) {
        if (duplicateAction === "update") {
          updateStock.run(Number(existing.stock_quantity ?? 0) + Number(p.stockQuantity ?? 0), existing.id);
          updated++;
        } else {
          skipped++;
        }
      } else {
        insertProduct.run(
          p.name.trim(),
          p.barcode?.trim() || null,
          p.categoryId ?? null,
          Number(p.stockQuantity ?? 0),
          Number(p.purchasePrice ?? 0),
          Number(p.sellingPriceRetail ?? 0),
          Number(p.sellingPriceHalfWholesale ?? 0),
          Number(p.sellingPriceWholesale ?? 0),
          Number(p.commissionRetail ?? 0),
          Number(p.commissionHalf ?? 0),
          Number(p.commissionWholesale ?? 0),
          p.unit?.trim() || "قطعة",
        );
        added++;
      }
    } catch (err) {
      console.error("Error importing product:", p.name, err);
      errors.push(p.name);
    }
  }

  res.json({ added, updated, skipped, total: added + updated + skipped, errors });
});

module.exports = router;
