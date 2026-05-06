import { Router } from "express";
import multer from "multer";
import { db } from "@workspace/db";
import { productsTable, categoriesTable } from "@workspace/db";
import { eq, like, and, SQL } from "drizzle-orm";
import { ObjectStorageService } from "../lib/objectStorage";
import path from "path";
import fs from "fs";
import { randomUUID } from "crypto";
import sharp from "sharp";

const router = Router();
const objectStorageService = new ObjectStorageService();

const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
const MAX_DIMENSION = 1200;
const JPEG_QUALITY = 82;

const STORAGE_MODE = process.env.STORAGE_MODE || "gcs";
const UPLOADS_DIR = process.env.UPLOADS_DIR || "/var/www/erp-uploads";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_IMAGE_BYTES },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith("image/")) {
      cb(null, true);
    } else {
      cb(new Error("يُسمح برفع ملفات الصور فقط"));
    }
  },
});

async function compressToJpeg(buffer: Buffer): Promise<Buffer> {
  return sharp(buffer)
    .rotate()
    .resize(MAX_DIMENSION, MAX_DIMENSION, { fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: JPEG_QUALITY, mozjpeg: true })
    .toBuffer();
}

/**
 * POST /products/upload-image
 * multipart/form-data, field name "file"
 * Accepts any image format (JPEG/PNG/WebP/HEIC/TIFF/etc), up to 20MB.
 * Automatically resizes (max 1200px), converts to JPEG and compresses (quality 82).
 * Returns { imageUrl }.
 */
router.post(
  "/products/upload-image",
  (req, res, next) => {
    const session = req.session as Record<string, unknown>;
    if (!session?.userId && !session?.truckId) {
      res.status(401).json({ error: "Non authentifié" });
      return;
    }
    next();
  },
  (req, res, next) => {
    upload.single("file")(req, res, (err: unknown) => {
      if (err) {
        const msg =
          err instanceof Error
            ? err.message
            : "خطأ في معالجة الملف";
        res.status(400).json({ error: msg });
        return;
      }
      next();
    });
  },
  async (req, res) => {
    if (!req.file) {
      res.status(400).json({ error: "ملف الصورة مطلوب" });
      return;
    }

    try {
      let compressed: Buffer;
      try {
        compressed = await compressToJpeg(req.file.buffer);
      } catch {
        res.status(400).json({ error: "الملف المرفوع تالف أو غير مدعوم. تأكد من أن الملف صورة صالحة." });
        return;
      }

      if (STORAGE_MODE === "local") {
        fs.mkdirSync(UPLOADS_DIR, { recursive: true });
        const filename = `${randomUUID()}.jpg`;
        const filePath = path.join(UPLOADS_DIR, filename);
        fs.writeFileSync(filePath, compressed);
        const imageUrl = `/api/storage/uploads/${filename}`;
        res.json({ imageUrl });
        return;
      }

      const uploadURL = await objectStorageService.getObjectEntityUploadURL();
      const objectPath = objectStorageService.normalizeObjectEntityPath(uploadURL);

      const uploadRes = await fetch(uploadURL, {
        method: "PUT",
        headers: { "Content-Type": "image/jpeg" },
        body: compressed,
        signal: AbortSignal.timeout(30_000),
      });

      if (!uploadRes.ok) {
        req.log.error({ status: uploadRes.status }, "GCS upload failed");
        res.status(500).json({ error: "فشل رفع الصورة إلى التخزين" });
        return;
      }

      const imageUrl = `/api/storage${objectPath}`;
      res.json({ imageUrl });
    } catch (err) {
      req.log.error({ err }, "Error uploading product image");
      res.status(500).json({ error: "حدث خطأ أثناء رفع الصورة" });
    }
  },
);

router.get("/products", async (req, res) => {
  const { categoryId, search } = req.query;
  const conditions: SQL[] = [];
  if (categoryId) conditions.push(eq(productsTable.categoryId, parseInt(categoryId as string)));
  if (search) conditions.push(like(productsTable.name, `%${search}%`));

  const products = await db
    .select({
      id: productsTable.id,
      name: productsTable.name,
      barcode: productsTable.barcode,
      categoryId: productsTable.categoryId,
      categoryName: categoriesTable.name,
      stockQuantity: productsTable.stockQuantity,
      purchasePrice: productsTable.purchasePrice,
      sellingPriceRetail: productsTable.sellingPriceRetail,
      sellingPriceHalfWholesale: productsTable.sellingPriceHalfWholesale,
      sellingPriceWholesale: productsTable.sellingPriceWholesale,
      commissionRetail: productsTable.commissionRetail,
      commissionHalf: productsTable.commissionHalf,
      commissionWholesale: productsTable.commissionWholesale,
      imageUrl: productsTable.imageUrl,
      unit: productsTable.unit,
      createdAt: productsTable.createdAt,
    })
    .from(productsTable)
    .leftJoin(categoriesTable, eq(productsTable.categoryId, categoriesTable.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(productsTable.name);

  res.json(products.map(p => ({
    ...p,
    stockQuantity: Number(p.stockQuantity),
    purchasePrice: Number(p.purchasePrice),
    sellingPriceRetail: Number(p.sellingPriceRetail),
    sellingPriceHalfWholesale: Number(p.sellingPriceHalfWholesale),
    sellingPriceWholesale: Number(p.sellingPriceWholesale),
    commissionRetail: Number(p.commissionRetail),
    commissionHalf: Number(p.commissionHalf),
    commissionWholesale: Number(p.commissionWholesale),
  })));
});

router.post("/products", async (req, res) => {
  const { name, barcode, categoryId, stockQuantity, purchasePrice, sellingPriceRetail, sellingPriceHalfWholesale, sellingPriceWholesale, commissionRetail, commissionHalf, commissionWholesale, imageUrl, unit } = req.body;
  if (!name) return res.status(400).json({ error: "Nom requis" });
  const [product] = await db.insert(productsTable).values({
    name, barcode: barcode || null, categoryId: categoryId || null,
    stockQuantity: String(stockQuantity ?? 0),
    purchasePrice: String(purchasePrice ?? 0),
    sellingPriceRetail: String(sellingPriceRetail ?? 0),
    sellingPriceHalfWholesale: String(sellingPriceHalfWholesale ?? 0),
    sellingPriceWholesale: String(sellingPriceWholesale ?? 0),
    commissionRetail: String(commissionRetail ?? 0),
    commissionHalf: String(commissionHalf ?? 0),
    commissionWholesale: String(commissionWholesale ?? 0),
    imageUrl: imageUrl || null,
    unit: unit || "unité",
  }).returning();
  const [full] = await db.select({
    id: productsTable.id,
    name: productsTable.name,
    barcode: productsTable.barcode,
    categoryId: productsTable.categoryId,
    categoryName: categoriesTable.name,
    stockQuantity: productsTable.stockQuantity,
    purchasePrice: productsTable.purchasePrice,
    sellingPriceRetail: productsTable.sellingPriceRetail,
    sellingPriceHalfWholesale: productsTable.sellingPriceHalfWholesale,
    sellingPriceWholesale: productsTable.sellingPriceWholesale,
    commissionRetail: productsTable.commissionRetail,
    commissionHalf: productsTable.commissionHalf,
    commissionWholesale: productsTable.commissionWholesale,
    imageUrl: productsTable.imageUrl,
    unit: productsTable.unit,
    createdAt: productsTable.createdAt,
  }).from(productsTable)
    .leftJoin(categoriesTable, eq(productsTable.categoryId, categoriesTable.id))
    .where(eq(productsTable.id, product.id)).limit(1);
  res.status(201).json({ ...full, stockQuantity: Number(full?.stockQuantity), purchasePrice: Number(full?.purchasePrice), sellingPriceRetail: Number(full?.sellingPriceRetail), sellingPriceHalfWholesale: Number(full?.sellingPriceHalfWholesale), sellingPriceWholesale: Number(full?.sellingPriceWholesale), commissionRetail: Number(full?.commissionRetail), commissionHalf: Number(full?.commissionHalf), commissionWholesale: Number(full?.commissionWholesale) });
});

router.get("/products/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  const [product] = await db.select({
    id: productsTable.id,
    name: productsTable.name,
    barcode: productsTable.barcode,
    categoryId: productsTable.categoryId,
    categoryName: categoriesTable.name,
    stockQuantity: productsTable.stockQuantity,
    purchasePrice: productsTable.purchasePrice,
    sellingPriceRetail: productsTable.sellingPriceRetail,
    sellingPriceHalfWholesale: productsTable.sellingPriceHalfWholesale,
    sellingPriceWholesale: productsTable.sellingPriceWholesale,
    commissionRetail: productsTable.commissionRetail,
    commissionHalf: productsTable.commissionHalf,
    commissionWholesale: productsTable.commissionWholesale,
    imageUrl: productsTable.imageUrl,
    unit: productsTable.unit,
    createdAt: productsTable.createdAt,
  }).from(productsTable)
    .leftJoin(categoriesTable, eq(productsTable.categoryId, categoriesTable.id))
    .where(eq(productsTable.id, id)).limit(1);
  if (!product) return res.status(404).json({ error: "Produit non trouvé" });
  res.json({ ...product, stockQuantity: Number(product.stockQuantity), purchasePrice: Number(product.purchasePrice), sellingPriceRetail: Number(product.sellingPriceRetail), sellingPriceHalfWholesale: Number(product.sellingPriceHalfWholesale), sellingPriceWholesale: Number(product.sellingPriceWholesale), commissionRetail: Number(product.commissionRetail), commissionHalf: Number(product.commissionHalf), commissionWholesale: Number(product.commissionWholesale) });
});

router.put("/products/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  const { name, barcode, categoryId, stockQuantity, purchasePrice, sellingPriceRetail, sellingPriceHalfWholesale, sellingPriceWholesale, commissionRetail, commissionHalf, commissionWholesale, imageUrl, unit } = req.body;
  const updates: Record<string, unknown> = {};
  if (name !== undefined) updates.name = name;
  if (barcode !== undefined) updates.barcode = barcode;
  if (categoryId !== undefined) updates.categoryId = categoryId;
  if (stockQuantity !== undefined) updates.stockQuantity = String(stockQuantity);
  if (purchasePrice !== undefined) updates.purchasePrice = String(purchasePrice);
  if (sellingPriceRetail !== undefined) updates.sellingPriceRetail = String(sellingPriceRetail);
  if (sellingPriceHalfWholesale !== undefined) updates.sellingPriceHalfWholesale = String(sellingPriceHalfWholesale);
  if (sellingPriceWholesale !== undefined) updates.sellingPriceWholesale = String(sellingPriceWholesale);
  if (commissionRetail !== undefined) updates.commissionRetail = String(commissionRetail);
  if (commissionHalf !== undefined) updates.commissionHalf = String(commissionHalf);
  if (commissionWholesale !== undefined) updates.commissionWholesale = String(commissionWholesale);
  if (imageUrl !== undefined) updates.imageUrl = imageUrl;
  if (unit !== undefined) updates.unit = unit;
  await db.update(productsTable).set(updates).where(eq(productsTable.id, id));
  const [product] = await db.select({
    id: productsTable.id,
    name: productsTable.name,
    barcode: productsTable.barcode,
    categoryId: productsTable.categoryId,
    categoryName: categoriesTable.name,
    stockQuantity: productsTable.stockQuantity,
    purchasePrice: productsTable.purchasePrice,
    sellingPriceRetail: productsTable.sellingPriceRetail,
    sellingPriceHalfWholesale: productsTable.sellingPriceHalfWholesale,
    sellingPriceWholesale: productsTable.sellingPriceWholesale,
    commissionRetail: productsTable.commissionRetail,
    commissionHalf: productsTable.commissionHalf,
    commissionWholesale: productsTable.commissionWholesale,
    imageUrl: productsTable.imageUrl,
    unit: productsTable.unit,
    createdAt: productsTable.createdAt,
  }).from(productsTable)
    .leftJoin(categoriesTable, eq(productsTable.categoryId, categoriesTable.id))
    .where(eq(productsTable.id, id)).limit(1);
  if (!product) return res.status(404).json({ error: "Produit non trouvé" });
  res.json({ ...product, stockQuantity: Number(product.stockQuantity), purchasePrice: Number(product.purchasePrice), sellingPriceRetail: Number(product.sellingPriceRetail), sellingPriceHalfWholesale: Number(product.sellingPriceHalfWholesale), sellingPriceWholesale: Number(product.sellingPriceWholesale), commissionRetail: Number(product.commissionRetail), commissionHalf: Number(product.commissionHalf), commissionWholesale: Number(product.commissionWholesale) });
});

router.delete("/products/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  await db.delete(productsTable).where(eq(productsTable.id, id));
  res.status(204).send();
});

export default router;
