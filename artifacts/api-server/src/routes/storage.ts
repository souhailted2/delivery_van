import { Router, type IRouter, type Request, type Response } from "express";
import { Readable } from "stream";
import path from "path";
import fs from "fs";
import {
  RequestUploadUrlBody,
  RequestUploadUrlResponse,
} from "@workspace/api-zod";
import { ObjectStorageService, ObjectNotFoundError } from "../lib/objectStorage";

const STORAGE_MODE = process.env.STORAGE_MODE || "gcs";
const UPLOADS_DIR = process.env.UPLOADS_DIR || "/var/www/erp-uploads";

const router: IRouter = Router();
const objectStorageService = new ObjectStorageService();

/** MIME types allowed for product image uploads */
const ALLOWED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
]);

/** Maximum allowed file size for product images: 2 MB */
const MAX_IMAGE_SIZE_BYTES = 2 * 1024 * 1024;

/** Returns true if the request has an active user OR truck session */
function isSessionAuthenticated(req: Request): boolean {
  const session = req.session as Record<string, unknown>;
  return Boolean(session?.userId) || Boolean(session?.truckId);
}

/**
 * GET /storage/uploads/:filename
 *
 * Serve locally stored product images (Hetzner / local storage mode).
 * Requires an active session (userId or truckId).
 */
router.get("/storage/uploads/:filename", (req: Request, res: Response) => {
  if (!isSessionAuthenticated(req)) {
    res.status(401).json({ error: "Non authentifié" });
    return;
  }

  const { filename } = req.params;
  const safeName = path.basename(filename);
  const filePath = path.join(UPLOADS_DIR, safeName);

  if (!fs.existsSync(filePath)) {
    res.status(404).json({ error: "الملف غير موجود" });
    return;
  }

  res.sendFile(filePath);
});

/**
 * POST /storage/uploads/request-url
 *
 * Request a presigned URL for file upload (GCS mode only).
 * In local storage mode (STORAGE_MODE=local), this endpoint is unavailable —
 * use POST /products/upload-image (multipart) instead.
 * Requires an active session (userId or truckId).
 * Enforces server-side MIME type whitelist and 2 MB size limit.
 * The client sends JSON metadata (name, size, contentType) — NOT the file.
 * The client then PUTs the file directly to the returned presigned URL.
 */
router.post("/storage/uploads/request-url", async (req: Request, res: Response) => {
  if (!isSessionAuthenticated(req)) {
    res.status(401).json({ error: "Non authentifié" });
    return;
  }

  if (STORAGE_MODE === "local") {
    res.status(501).json({
      error: "رفع الملفات عبر presigned URL غير متاح في وضع التخزين المحلي. استخدم POST /api/products/upload-image بدلاً من ذلك.",
    });
    return;
  }

  const parsed = RequestUploadUrlBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Champs requis manquants ou invalides" });
    return;
  }

  const { name, size, contentType } = parsed.data;

  if (!ALLOWED_IMAGE_TYPES.has(contentType)) {
    res.status(400).json({
      error: "نوع الملف غير مدعوم. المسموح به: JPEG، PNG، WebP",
    });
    return;
  }

  if (size > MAX_IMAGE_SIZE_BYTES) {
    res.status(400).json({
      error: "حجم الملف يتجاوز الحد الأقصى المسموح (2 MB)",
    });
    return;
  }

  try {
    const uploadURL = await objectStorageService.getObjectEntityUploadURL();
    const objectPath = objectStorageService.normalizeObjectEntityPath(uploadURL);

    res.json(
      RequestUploadUrlResponse.parse({
        uploadURL,
        objectPath,
        metadata: { name, size, contentType },
      }),
    );
  } catch (error) {
    req.log.error({ err: error }, "Error generating upload URL");
    res.status(500).json({ error: "فشل توليد رابط الرفع" });
  }
});

/**
 * GET /storage/public-objects/*
 *
 * Serve public assets from PUBLIC_OBJECT_SEARCH_PATHS.
 * These are unconditionally public — no authentication or ACL checks.
 */
router.get("/storage/public-objects/*filePath", async (req: Request, res: Response) => {
  try {
    const raw = req.params.filePath;
    const filePath = Array.isArray(raw) ? raw.join("/") : raw;
    const file = await objectStorageService.searchPublicObject(filePath);
    if (!file) {
      res.status(404).json({ error: "الملف غير موجود" });
      return;
    }

    const response = await objectStorageService.downloadObject(file);
    res.status(response.status);
    response.headers.forEach((value, key) => res.setHeader(key, value));

    if (response.body) {
      const nodeStream = Readable.fromWeb(response.body as ReadableStream<Uint8Array>);
      nodeStream.pipe(res);
    } else {
      res.end();
    }
  } catch (error) {
    req.log.error({ err: error }, "Error serving public object");
    res.status(500).json({ error: "فشل تحميل الملف" });
  }
});

/**
 * GET /storage/objects/*
 *
 * Serve private object entities (e.g. product images).
 * Requires an active session (userId or truckId).
 */
router.get("/storage/objects/*path", async (req: Request, res: Response) => {
  if (!isSessionAuthenticated(req)) {
    res.status(401).json({ error: "Non authentifié" });
    return;
  }

  try {
    const raw = req.params.path;
    const wildcardPath = Array.isArray(raw) ? raw.join("/") : raw;
    const objectPath = `/objects/${wildcardPath}`;
    const objectFile = await objectStorageService.getObjectEntityFile(objectPath);

    const response = await objectStorageService.downloadObject(objectFile);
    res.status(response.status);
    response.headers.forEach((value, key) => res.setHeader(key, value));

    if (response.body) {
      const nodeStream = Readable.fromWeb(response.body as ReadableStream<Uint8Array>);
      nodeStream.pipe(res);
    } else {
      res.end();
    }
  } catch (error) {
    if (error instanceof ObjectNotFoundError) {
      req.log.warn({ err: error }, "Object not found");
      res.status(404).json({ error: "الملف غير موجود" });
      return;
    }
    req.log.error({ err: error }, "Error serving object");
    res.status(500).json({ error: "فشل تحميل الملف" });
  }
});

export default router;
