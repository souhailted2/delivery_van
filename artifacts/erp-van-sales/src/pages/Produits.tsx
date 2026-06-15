import { useState, useRef, useEffect } from "react";
import { useListProducts, useListCategories, useCreateProduct, useUpdateProduct, useDeleteProduct } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatCurrency, cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  Plus, Pencil, Search, X, ImagePlus, Trash2, WifiOff, FileSpreadsheet,
  Package, PackageX, AlertTriangle, CheckCircle2, LayoutGrid, TableProperties,
  Wallet, Boxes,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { motion } from "framer-motion";
import ExcelImportDialog from "@/components/ExcelImportDialog";
import { StatCard } from "@/components/StatCard";
import { fadeUp } from "@/lib/motion-tokens";

type Product = {
  id: number; name: string; barcode?: string | null; categoryId?: number | null;
  stockQuantity: number; purchasePrice: number; sellingPriceRetail: number;
  sellingPriceHalfWholesale: number; sellingPriceWholesale: number;
  commissionRetail: number; commissionHalf: number; commissionWholesale: number;
  unit: string; imageUrl?: string | null;
};

const emptyForm = {
  name: "", barcode: "", categoryId: "", unit: "قطعة",
  stockQuantity: "0", purchasePrice: "0",
  sellingPriceRetail: "0", sellingPriceHalfWholesale: "0", sellingPriceWholesale: "0",
  commissionRetail: "0", commissionHalf: "0", commissionWholesale: "0",
  imageUrl: "",
};

const toForm = (p: Product) => ({
  name: p.name,
  barcode: p.barcode ?? "",
  categoryId: p.categoryId ? String(p.categoryId) : "",
  unit: p.unit,
  stockQuantity: String(p.stockQuantity),
  purchasePrice: String(p.purchasePrice),
  sellingPriceRetail: String(p.sellingPriceRetail),
  sellingPriceHalfWholesale: String(p.sellingPriceHalfWholesale),
  sellingPriceWholesale: String(p.sellingPriceWholesale),
  commissionRetail: String(p.commissionRetail),
  commissionHalf: String(p.commissionHalf),
  commissionWholesale: String(p.commissionWholesale),
  imageUrl: p.imageUrl ?? "",
});

const toBody = (f: typeof emptyForm) => ({
  name: f.name.trim(),
  barcode: f.barcode.trim() || null,
  categoryId: f.categoryId ? Number(f.categoryId) : null,
  unit: f.unit.trim() || "قطعة",
  stockQuantity: Number(f.stockQuantity) || 0,
  purchasePrice: Number(f.purchasePrice) || 0,
  sellingPriceRetail: Number(f.sellingPriceRetail) || 0,
  sellingPriceHalfWholesale: Number(f.sellingPriceHalfWholesale) || 0,
  sellingPriceWholesale: Number(f.sellingPriceWholesale) || 0,
  commissionRetail: Number(f.commissionRetail) || 0,
  commissionHalf: Number(f.commissionHalf) || 0,
  commissionWholesale: Number(f.commissionWholesale) || 0,
  imageUrl: f.imageUrl.trim() || null,
});

const CANVAS_COMPRESSIBLE = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp", "image/avif", "image/bmp", "image/gif"]);
const CANVAS_MAX_DIM = 1200;
const CANVAS_QUALITY = 0.85;

async function compressClientSide(file: File): Promise<File> {
  if (!CANVAS_COMPRESSIBLE.has(file.type)) return file;
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      let { width, height } = img;
      if (width > CANVAS_MAX_DIM || height > CANVAS_MAX_DIM) {
        if (width >= height) { height = Math.round(height * CANVAS_MAX_DIM / width); width = CANVAS_MAX_DIM; }
        else { width = Math.round(width * CANVAS_MAX_DIM / height); height = CANVAS_MAX_DIM; }
      }
      const canvas = document.createElement("canvas");
      canvas.width = width; canvas.height = height;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob((blob) => {
        if (!blob) { resolve(file); return; }
        resolve(new File([blob], file.name.replace(/\.[^.]+$/, ".jpg"), { type: "image/jpeg" }));
      }, "image/jpeg", CANVAS_QUALITY);
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(file); };
    img.src = url;
  });
}

function ImageUpload({
  value,
  onChange,
}: {
  value: string;
  onChange: (url: string) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [localPreview, setLocalPreview] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isElectron = !!window.electronAPI?.isElectron;
  const [electronOnline, setElectronOnline] = useState<boolean>(true);

  useEffect(() => {
    if (!isElectron) return;
    let cancelled = false;
    const check = async () => {
      try {
        const online = await window.electronAPI!.checkOnline();
        if (!cancelled) setElectronOnline(online);
      } catch {
        if (!cancelled) setElectronOnline(false);
      }
    };
    check();
    const interval = setInterval(check, 15000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [isElectron]);

  useEffect(() => {
    return () => { if (localPreview) URL.revokeObjectURL(localPreview); };
  }, [localPreview]);

  const uploadDisabled = false;

  const processFile = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      const msg = "يُسمح برفع ملفات الصور فقط";
      setError(msg); toast.error(msg); return;
    }
    if (uploadDisabled) {
      const msg = "رفع الصور يتطلب اتصالاً بالإنترنت. تحقق من اتصالك وحاول مجدداً.";
      setError(msg); toast.error(msg); return;
    }

    setError(null);

    const preview = URL.createObjectURL(file);
    setLocalPreview(prev => { if (prev) URL.revokeObjectURL(prev); return preview; });

    setUploading(true);
    try {
      const compressed = await compressClientSide(file);
      const formData = new FormData();
      formData.append("file", compressed);

      const res = await fetch("/api/products/upload-image", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(body.error || "فشل رفع الصورة");
      }

      const { imageUrl } = await res.json() as { imageUrl: string };
      setLocalPreview(prev => { if (prev) URL.revokeObjectURL(prev); return null; });
      onChange(imageUrl);
    } catch (err: unknown) {
      setLocalPreview(prev => { if (prev) URL.revokeObjectURL(prev); return null; });
      const msg = err instanceof Error ? err.message : "حدث خطأ أثناء رفع الصورة";
      setError(msg);
      toast.error(msg);
    } finally {
      setUploading(false);
    }
  };

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) await processFile(file);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) await processFile(file);
  };

  const displaySrc = localPreview || value || null;

  return (
    <div className="space-y-2">
      <Label>صورة المنتج</Label>

      {isElectron && !electronOnline && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-blue-50 border border-blue-200 text-blue-700 text-xs">
          <WifiOff className="h-3.5 w-3.5 shrink-0" />
          <span>وضع أوفلاين — الصور تُحفظ محلياً على جهازك وتُزامَن لاحقاً.</span>
        </div>
      )}

      <div className="flex gap-3 items-start">
        <div
          className={`relative w-20 h-20 rounded-lg border-2 border-dashed flex items-center justify-center shrink-0 overflow-hidden cursor-pointer transition-colors ${
            dragOver
              ? "border-primary bg-primary/5"
              : displaySrc
              ? "border-transparent"
              : "border-muted-foreground/30 bg-muted/30 hover:border-primary/50"
          }`}
          onClick={() => !uploading && !uploadDisabled && fileRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); if (!uploadDisabled) setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
        >
          {displaySrc ? (
            <img
              src={displaySrc}
              alt=""
              className="w-full h-full object-cover"
              style={{ display: "block" }}
              onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
            />
          ) : uploadDisabled ? (
            <WifiOff className="h-6 w-6 text-muted-foreground/30" />
          ) : (
            <ImagePlus className="h-6 w-6 text-muted-foreground/50" />
          )}

          {uploading && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/40 rounded-lg">
              <div className="h-5 w-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            </div>
          )}
        </div>

        <div className="flex-1 space-y-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-full"
            onClick={() => fileRef.current?.click()}
            disabled={uploading || uploadDisabled}
            title={uploadDisabled ? "رفع الصور غير متاح في وضع أوفلاين" : undefined}
          >
            <ImagePlus className="h-4 w-4 ml-1.5" />
            {uploading
              ? "جارٍ المعالجة والرفع..."
              : uploadDisabled
              ? "الرفع غير متاح (أوفلاين)"
              : "رفع صورة من الجهاز"}
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleFile}
          />

          {!uploading && (
            <Input
              value={value.startsWith("/api/storage") ? "" : value}
              onChange={(e) => { setError(null); onChange(e.target.value); }}
              placeholder="أو أدخل رابط الصورة (URL)"
              className="text-sm"
            />
          )}

          {!uploading && !error && !displaySrc && (
            <p className="text-xs text-muted-foreground">
              JPG · PNG · WebP · HEIC وغيرها — أي حجم
            </p>
          )}

          {error && (
            <p className="text-xs text-destructive">{error}</p>
          )}

          {(value || localPreview) && !uploading && (
            <button
              type="button"
              onClick={() => {
                setLocalPreview(prev => { if (prev) URL.revokeObjectURL(prev); return null; });
                onChange("");
                setError(null);
              }}
              className="flex items-center gap-1 text-xs text-destructive hover:underline"
            >
              <Trash2 className="h-3 w-3" />
              حذف الصورة
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function ProductForm({
  form,
  setForm,
  categories,
  onSubmit,
  isPending,
  onCancel,
  submitLabel,
}: {
  form: typeof emptyForm;
  setForm: (f: typeof emptyForm) => void;
  categories: { id: number; name: string }[];
  onSubmit: (e: React.FormEvent) => void;
  isPending: boolean;
  onCancel: () => void;
  submitLabel: string;
}) {
  const set = (field: keyof typeof emptyForm) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm({ ...form, [field]: e.target.value });

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {/* Image upload */}
      <ImageUpload
        value={form.imageUrl}
        onChange={(url) => setForm({ ...form, imageUrl: url })}
      />

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2 col-span-2">
          <Label>اسم المنتج *</Label>
          <Input value={form.name} onChange={set("name")} placeholder="اسم المنتج" required autoFocus />
        </div>
        <div className="space-y-2">
          <Label>الباركود</Label>
          <Input value={form.barcode} onChange={set("barcode")} placeholder="اختياري" />
        </div>
        <div className="space-y-2">
          <Label>الوحدة</Label>
          <Input value={form.unit} onChange={set("unit")} placeholder="قطعة، كيلو، لتر..." />
        </div>
        <div className="space-y-2 col-span-2">
          <Label>الفئة</Label>
          <Select value={form.categoryId} onValueChange={(v) => setForm({ ...form, categoryId: v })}>
            <SelectTrigger><SelectValue placeholder="اختر الفئة (اختياري)" /></SelectTrigger>
            <SelectContent>
              {categories.map((c) => (
                <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>المخزون</Label>
          <Input type="number" value={form.stockQuantity} onChange={set("stockQuantity")} min="0" />
        </div>
        <div className="space-y-2">
          <Label>سعر الشراء (DZD)</Label>
          <Input type="number" value={form.purchasePrice} onChange={set("purchasePrice")} min="0" />
        </div>
        <div className="space-y-2">
          <Label>سعر التجزئة (DZD)</Label>
          <Input type="number" value={form.sellingPriceRetail} onChange={set("sellingPriceRetail")} min="0" />
        </div>
        <div className="space-y-2">
          <Label>سعر نصف الجملة (DZD)</Label>
          <Input type="number" value={form.sellingPriceHalfWholesale} onChange={set("sellingPriceHalfWholesale")} min="0" />
        </div>
        <div className="space-y-2">
          <Label>سعر الجملة (DZD)</Label>
          <Input type="number" value={form.sellingPriceWholesale} onChange={set("sellingPriceWholesale")} min="0" />
        </div>
        <div className="space-y-2">
          <Label>عمولة التجزئة (DZD)</Label>
          <Input type="number" value={form.commissionRetail} onChange={set("commissionRetail")} min="0" />
        </div>
        <div className="space-y-2">
          <Label>عمولة نصف الجملة (DZD)</Label>
          <Input type="number" value={form.commissionHalf} onChange={set("commissionHalf")} min="0" />
        </div>
        <div className="space-y-2">
          <Label>عمولة الجملة (DZD)</Label>
          <Input type="number" value={form.commissionWholesale} onChange={set("commissionWholesale")} min="0" />
        </div>
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>إلغاء</Button>
        <Button type="submit" disabled={isPending}>
          {isPending ? "جارٍ الحفظ..." : submitLabel}
        </Button>
      </DialogFooter>
    </form>
  );
}

const CATEGORY_BADGE_STYLES = [
  "bg-primary/15 text-primary ring-primary/25",
  "bg-violet-500/15 text-violet-600 dark:text-violet-400 ring-violet-500/25",
  "bg-amber-500/15 text-amber-700 dark:text-amber-400 ring-amber-500/25",
  "bg-sky-500/15 text-sky-600 dark:text-sky-400 ring-sky-500/25",
  "bg-rose-500/15 text-rose-600 dark:text-rose-400 ring-rose-500/25",
  "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 ring-emerald-500/25",
];

function categoryBadgeStyle(categoryId?: number | null) {
  if (!categoryId) return "bg-muted text-muted-foreground ring-border";
  return CATEGORY_BADGE_STYLES[categoryId % CATEGORY_BADGE_STYLES.length];
}

function getStockHealth(quantity: number) {
  if (quantity === 0) {
    return {
      label: "نفد المخزون",
      badge: "bg-destructive/15 text-destructive ring-destructive/25",
      dot: "bg-destructive",
      border: "border-t-destructive",
      text: "text-destructive",
    };
  }
  if (quantity < 10) {
    return {
      label: "مخزون منخفض",
      badge: "bg-warning/15 text-warning ring-warning/25",
      dot: "bg-warning",
      border: "border-t-warning",
      text: "text-warning",
    };
  }
  return {
    label: "متوفر",
    badge: "bg-success/15 text-success ring-success/25",
    dot: "bg-success",
    border: "border-t-success",
    text: "text-success",
  };
}

function ProductCard({
  product,
  index,
  onEdit,
  onDelete,
}: {
  product: Product & { categoryName?: string | null };
  index: number;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [imgError, setImgError] = useState(false);
  const health = getStockHealth(product.stockQuantity);
  const inventoryValue = product.stockQuantity * product.purchasePrice;
  const stockLevel = Math.max(4, Math.min(100, (product.stockQuantity / 50) * 100));

  return (
    <motion.div
      variants={fadeUp}
      initial="hidden"
      animate="show"
      transition={{ duration: 0.3, delay: Math.min(index, 16) * 0.04, ease: "easeOut" }}
      className="h-full"
    >
      <Card className={cn("group flex h-full flex-col overflow-hidden border-card-border border-t-4 bg-card/60 backdrop-blur-sm transition-shadow hover:shadow-lg hover:shadow-black/5", health.border)}>
        <div className="relative aspect-square w-full overflow-hidden bg-muted">
          {product.imageUrl && !imgError ? (
            <img
              src={product.imageUrl}
              alt={product.name}
              className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
              onError={() => setImgError(true)}
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              <Package className="h-16 w-16 text-muted-foreground/20" />
            </div>
          )}
          <div className="absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-2.5">
            <span
              className={cn(
                "inline-flex max-w-[60%] items-center truncate rounded-full px-2.5 py-1 text-xs font-medium ring-1 backdrop-blur-md",
                categoryBadgeStyle(product.categoryId)
              )}
            >
              {product.categoryName || "بدون فئة"}
            </span>
            <span className={cn("inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold ring-1 backdrop-blur-md", health.badge)}>
              <span className={cn("h-1.5 w-1.5 rounded-full", health.dot)} />
              {health.label}
            </span>
          </div>
        </div>

        <CardContent className="flex flex-1 flex-col gap-3 p-4">
          <div>
            <h3 className="text-base font-bold leading-tight text-foreground line-clamp-2">{product.name}</h3>
            {product.barcode && (
              <span className="mt-1 block font-mono text-xs text-muted-foreground truncate">{product.barcode}</span>
            )}
          </div>

          {/* Stock level */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">المخزون المتاح</span>
              <span className={cn("font-bold tabular-nums", health.text)}>
                {product.stockQuantity} {product.unit}
              </span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div className={cn("h-full rounded-full transition-all", health.dot)} style={{ width: `${stockLevel}%` }} />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2 rounded-lg bg-muted/40 p-2 text-center">
            <div>
              <p className="text-[10px] text-muted-foreground">تجزئة</p>
              <p className="text-sm font-bold tabular-nums text-foreground">{formatCurrency(product.sellingPriceRetail)}</p>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground">نصف جملة</p>
              <p className="text-sm font-semibold tabular-nums text-muted-foreground">{formatCurrency(product.sellingPriceHalfWholesale)}</p>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground">جملة</p>
              <p className="text-sm font-semibold tabular-nums text-muted-foreground">{formatCurrency(product.sellingPriceWholesale)}</p>
            </div>
          </div>

          {/* Inventory value */}
          <div className="flex items-center justify-between rounded-lg bg-primary/5 px-2.5 py-2 ring-1 ring-primary/10">
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Wallet className="h-3.5 w-3.5" /> قيمة المخزون
            </span>
            <span className="text-sm font-bold tabular-nums text-foreground">{formatCurrency(inventoryValue)}</span>
          </div>

          <div className="mt-auto flex items-center gap-2 pt-1">
            <Button
              size="sm"
              variant="outline"
              className="h-8 flex-1 text-xs font-medium hover:bg-primary/5 hover:border-primary/40 hover:text-primary transition-colors"
              onClick={onEdit}
            >
              <Pencil className="h-3 w-3 ml-1" /> تعديل
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-8 px-3 text-xs font-medium border-destructive/30 text-destructive hover:bg-destructive hover:text-white transition-colors"
              onClick={onDelete}
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

export default function Produits() {
  const { data, isLoading } = useListProducts();
  const products = Array.isArray(data) ? data : [];
  const { data: catData } = useListCategories();
  const categories = Array.isArray(catData) ? catData : [];
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [view, setView] = useState<"cards" | "table">("cards");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [stockFilter, setStockFilter] = useState<"all" | "out" | "low" | "ok">("all");

  const [addOpen, setAddOpen] = useState(false);
  const [addForm, setAddForm] = useState(emptyForm);

  const [importOpen, setImportOpen] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<{ id: number; name: string } | null>(null);

  const [editOpen, setEditOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState(emptyForm);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["/api/products"] });

  const outOfStockCount = products.filter((p) => p.stockQuantity === 0).length;
  const lowStockCount = products.filter((p) => p.stockQuantity > 0 && p.stockQuantity < 10).length;
  const healthyCount = products.length - outOfStockCount - lowStockCount;

  const totalInventoryValue = products.reduce((sum, p) => sum + p.stockQuantity * p.purchasePrice, 0);
  const totalUnits = products.reduce((sum, p) => sum + p.stockQuantity, 0);
  const avgProductValue = products.length ? totalInventoryValue / products.length : 0;

  const filtered = products.filter((p) => {
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      const matches =
        p.name.toLowerCase().includes(q) ||
        (p.barcode ?? "").toLowerCase().includes(q) ||
        (p.categoryName ?? "").toLowerCase().includes(q);
      if (!matches) return false;
    }
    if (categoryFilter === "none") {
      if (p.categoryId) return false;
    } else if (categoryFilter !== "all" && String(p.categoryId ?? "") !== categoryFilter) {
      return false;
    }
    if (stockFilter === "out" && p.stockQuantity !== 0) return false;
    if (stockFilter === "low" && !(p.stockQuantity > 0 && p.stockQuantity < 10)) return false;
    if (stockFilter === "ok" && p.stockQuantity < 10) return false;
    return true;
  });

  const createProduct = useCreateProduct({
    mutation: {
      onSuccess: () => { invalidate(); toast.success("تمت إضافة المنتج بنجاح"); setAddForm(emptyForm); setAddOpen(false); },
      onError: () => toast.error("حدث خطأ أثناء الإضافة"),
    },
  });

  const updateProduct = useUpdateProduct({
    mutation: {
      onSuccess: () => { invalidate(); toast.success("تم تحديث المنتج بنجاح"); setEditOpen(false); setEditId(null); },
      onError: () => toast.error("حدث خطأ أثناء التعديل"),
    },
  });

  const deleteProduct = useDeleteProduct({
    mutation: {
      onSuccess: () => {
        invalidate();
        toast.success("تم حذف المنتج بنجاح");
        setDeleteTarget(null);
      },
      onError: (err: unknown) => {
        const msg = err instanceof Error ? err.message : "";
        if (msg.includes("foreign key") || msg.includes("violates") || msg.includes("constraint")) {
          toast.error("لا يمكن حذف هذا المنتج لأنه مرتبط بفواتير أو مبيعات");
        } else {
          toast.error("حدث خطأ أثناء الحذف");
        }
        setDeleteTarget(null);
      },
    },
  });

  const openEdit = (p: Product) => {
    setEditId(p.id);
    setEditForm(toForm(p));
    setEditOpen(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">كتالوج المنتجات</h1>
          <p className="text-muted-foreground">العمود الفقري لعمليات ALLAL DELIVERY — المخزون، التسعير، والقيمة في مكان واحد.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setImportOpen(true)} className="text-green-700 border-green-300 hover:bg-green-50">
            <FileSpreadsheet className="ml-2 h-4 w-4" /> استيراد Excel
          </Button>
          <Button onClick={() => setAddOpen(true)}>
            <Plus className="ml-2 h-4 w-4" /> إضافة منتج
          </Button>
        </div>
      </div>

      {/* Inventory value hero */}
      <motion.div variants={fadeUp} initial="hidden" animate="show" transition={{ duration: 0.35, ease: "easeOut" }}>
        <Card className="overflow-hidden border-card-border bg-gradient-to-br from-primary/10 via-card to-card">
          <CardContent className="flex flex-col gap-5 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary ring-1 ring-primary/25">
                <Boxes className="h-6 w-6" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">القيمة الإجمالية لمخزون المنتجات (بسعر الشراء)</p>
                <p className="text-2xl sm:text-3xl font-bold tracking-tight tabular-nums text-foreground">{formatCurrency(totalInventoryValue)}</p>
              </div>
            </div>
            <div className="flex items-center gap-6 sm:gap-10">
              <div>
                <p className="text-xs text-muted-foreground">إجمالي الوحدات</p>
                <p className="text-lg font-bold tabular-nums">{totalUnits}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">متوسط قيمة المنتج</p>
                <p className="text-lg font-bold tabular-nums">{formatCurrency(avgProductValue)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">عدد المنتجات</p>
                <p className="text-lg font-bold tabular-nums">{products.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Inventory intelligence */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard index={0} label="إجمالي المنتجات" value={products.length} icon={Package} accent="primary" />
        <StatCard index={1} label="مخزون سليم" value={healthyCount} icon={CheckCircle2} accent="success" />
        <StatCard index={2} label="مخزون منخفض" value={lowStockCount} icon={AlertTriangle} accent="warning" hint="أقل من 10 وحدات" />
        <StatCard index={3} label="نفد المخزون" value={outOfStockCount} icon={PackageX} accent="destructive" />
      </div>

      {/* Filters & view toggle */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="relative flex-1 lg:max-w-sm">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="ابحث بالاسم أو الباركود أو الفئة..."
            className="pr-9 pl-9"
          />
          {search && (
            <button onClick={() => setSearch("")} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="h-9 w-auto min-w-[140px]">
              <SelectValue placeholder="الفئة" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">جميع الفئات</SelectItem>
              <SelectItem value="none">بدون فئة</SelectItem>
              {categories.map((c) => (
                <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <ToggleGroup
            type="single"
            value={stockFilter}
            onValueChange={(v) => v && setStockFilter(v as typeof stockFilter)}
            className="rounded-md border border-input bg-transparent p-0.5"
          >
            <ToggleGroupItem value="all" className="h-8 px-2.5 text-xs data-[state=on]:bg-muted">الكل</ToggleGroupItem>
            <ToggleGroupItem value="ok" className="h-8 px-2.5 text-xs data-[state=on]:bg-success/15 data-[state=on]:text-success">سليم</ToggleGroupItem>
            <ToggleGroupItem value="low" className="h-8 px-2.5 text-xs data-[state=on]:bg-warning/15 data-[state=on]:text-warning">منخفض</ToggleGroupItem>
            <ToggleGroupItem value="out" className="h-8 px-2.5 text-xs data-[state=on]:bg-destructive/15 data-[state=on]:text-destructive">نافد</ToggleGroupItem>
          </ToggleGroup>

          <ToggleGroup
            type="single"
            value={view}
            onValueChange={(v) => v && setView(v as typeof view)}
            className="rounded-md border border-input bg-transparent p-0.5"
          >
            <ToggleGroupItem value="cards" className="h-8 px-2.5 data-[state=on]:bg-muted" title="عرض البطاقات">
              <LayoutGrid className="h-4 w-4" />
            </ToggleGroupItem>
            <ToggleGroupItem value="table" className="h-8 px-2.5 data-[state=on]:bg-muted" title="عرض الجدول">
              <TableProperties className="h-4 w-4" />
            </ToggleGroupItem>
          </ToggleGroup>
        </div>
      </div>

      {(search.trim() || categoryFilter !== "all" || stockFilter !== "all") && (
        <p className="text-sm text-muted-foreground -mt-2">
          {filtered.length} نتيجة من أصل {products.length}
        </p>
      )}

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => { if (!o) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>تأكيد الحذف</AlertDialogTitle>
            <AlertDialogDescription>
              هل أنت متأكد من حذف المنتج{" "}
              <span className="font-bold text-foreground">«{deleteTarget?.name}»</span>؟
              <br />
              <span className="text-destructive font-medium">لا يمكن التراجع عن هذه العملية.</span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={() => { if (deleteTarget) deleteProduct.mutate({ id: deleteTarget.id }); }}
              disabled={deleteProduct.isPending}
            >
              {deleteProduct.isPending ? "جارٍ الحذف..." : "تأكيد الحذف"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Excel Import Dialog */}
      <ExcelImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        existingProducts={products}
        onImported={invalidate}
      />

      {/* Add Dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>إضافة منتج جديد</DialogTitle></DialogHeader>
          <ProductForm
            form={addForm}
            setForm={setAddForm}
            categories={categories}
            onSubmit={(e) => { e.preventDefault(); if (!addForm.name.trim()) return; createProduct.mutate({ data: toBody(addForm) }); }}
            isPending={createProduct.isPending}
            onCancel={() => setAddOpen(false)}
            submitLabel="حفظ المنتج"
          />
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>تعديل المنتج</DialogTitle></DialogHeader>
          <ProductForm
            form={editForm}
            setForm={setEditForm}
            categories={categories}
            onSubmit={(e) => { e.preventDefault(); if (!editId || !editForm.name.trim()) return; updateProduct.mutate({ id: editId, data: toBody(editForm) }); }}
            isPending={updateProduct.isPending}
            onCancel={() => setEditOpen(false)}
            submitLabel="حفظ التعديل"
          />
        </DialogContent>
      </Dialog>

      {/* Card view */}
      {view === "cards" && (
        isLoading ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <Card key={i} className="overflow-hidden border-card-border">
                <div className="aspect-[4/3] w-full bg-muted animate-pulse" />
                <CardContent className="space-y-3 p-4">
                  <div className="h-4 w-3/4 rounded bg-muted animate-pulse" />
                  <div className="h-8 w-full rounded bg-muted animate-pulse" />
                  <div className="h-8 w-full rounded bg-muted animate-pulse" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <Card className="border-card-border">
            <CardContent className="flex flex-col items-center gap-2 py-16 text-muted-foreground">
              <Package className="h-10 w-10 text-muted-foreground/30" />
              <span className="text-sm">
                {search.trim() || categoryFilter !== "all" || stockFilter !== "all"
                  ? "لا توجد نتائج مطابقة"
                  : "لا توجد منتجات بعد"}
              </span>
            </CardContent>
          </Card>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {filtered.map((p, i) => (
                <ProductCard
                  key={p.id}
                  product={p as Product & { categoryName?: string | null }}
                  index={i}
                  onEdit={() => openEdit(p as Product)}
                  onDelete={() => setDeleteTarget({ id: p.id, name: p.name })}
                />
              ))}
            </div>
            <p className="text-xs text-muted-foreground text-left">
              {filtered.length} منتج{filtered.length !== products.length && ` (من أصل ${products.length})`}
            </p>
          </>
        )
      )}

      {/* Table view */}
      {view === "table" && (
      <Card className="overflow-hidden shadow-sm">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/60 hover:bg-muted/60 border-b-2">
                  <TableHead className="w-[72px] text-center font-semibold text-foreground/80 py-3">صورة</TableHead>
                  <TableHead className="font-semibold text-foreground/80 py-3 min-w-[160px]">اسم المنتج</TableHead>
                  <TableHead className="font-semibold text-foreground/80 py-3 min-w-[100px]">الفئة</TableHead>
                  <TableHead className="font-semibold text-foreground/80 py-3 text-center min-w-[100px]">المخزون</TableHead>
                  <TableHead className="font-semibold text-foreground/80 py-3 text-center min-w-[120px]">سعر التجزئة</TableHead>
                  <TableHead className="font-semibold text-foreground/80 py-3 text-center min-w-[120px]">سعر الجملة</TableHead>
                  <TableHead className="font-semibold text-foreground/80 py-3 text-center w-[160px]">الإجراءات</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-16 text-muted-foreground">
                      <div className="flex flex-col items-center gap-2">
                        <div className="h-6 w-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                        <span>جارٍ التحميل...</span>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-16 text-muted-foreground">
                      <div className="flex flex-col items-center gap-2">
                        <ImagePlus className="h-10 w-10 text-muted-foreground/30" />
                        <span className="text-sm">{search.trim() ? "لا توجد نتائج مطابقة للبحث" : "لا توجد منتجات بعد"}</span>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map((p) => (
                    <TableRow key={p.id} className="hover:bg-muted/30 transition-colors border-b last:border-0">
                      <TableCell className="py-3 text-center">
                        {(p as any).imageUrl ? (
                          <img
                            src={(p as any).imageUrl}
                            alt={p.name}
                            className="w-14 h-14 rounded-xl object-cover border border-border shadow-sm mx-auto"
                            onError={(e) => {
                              const el = e.target as HTMLImageElement;
                              el.style.display = "none";
                              const ph = document.createElement("div");
                              ph.className = "w-14 h-14 rounded-xl bg-muted flex items-center justify-center mx-auto";
                              ph.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="opacity:0.3"><rect width="18" height="18" x="3" y="3" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>';
                              el.parentElement!.appendChild(ph);
                            }}
                          />
                        ) : (
                          <div className="w-14 h-14 rounded-xl bg-muted/60 border border-dashed border-border flex items-center justify-center mx-auto">
                            <ImagePlus className="h-5 w-5 text-muted-foreground/30" />
                          </div>
                        )}
                      </TableCell>

                      <TableCell className="py-3">
                        <div className="font-semibold text-foreground leading-tight">{p.name}</div>
                        {p.barcode && (
                          <div className="text-xs text-muted-foreground mt-0.5 font-mono">{p.barcode}</div>
                        )}
                      </TableCell>

                      <TableCell className="py-3">
                        {(p as any).categoryName ? (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-primary/10 text-primary">
                            {(p as any).categoryName}
                          </span>
                        ) : (
                          <span className="text-muted-foreground text-sm">—</span>
                        )}
                      </TableCell>

                      <TableCell className="py-3 text-center">
                        {p.stockQuantity === 0 ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-destructive/10 text-destructive">
                            نفد المخزون
                          </span>
                        ) : p.stockQuantity < 10 ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-orange-100 text-orange-700">
                            {p.stockQuantity} {p.unit}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700">
                            {p.stockQuantity} {p.unit}
                          </span>
                        )}
                      </TableCell>

                      <TableCell className="py-3 text-center font-medium tabular-nums">
                        {formatCurrency(p.sellingPriceRetail)}
                      </TableCell>

                      <TableCell className="py-3 text-center font-medium tabular-nums text-muted-foreground">
                        {formatCurrency(p.sellingPriceWholesale)}
                      </TableCell>

                      <TableCell className="py-3 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8 px-3 text-xs font-medium hover:bg-primary/5 hover:border-primary/40 hover:text-primary transition-colors"
                            onClick={() => openEdit(p as Product)}
                          >
                            <Pencil className="h-3 w-3 ml-1" /> تعديل
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8 px-3 text-xs font-medium border-destructive/30 text-destructive hover:bg-destructive hover:text-white transition-colors"
                            onClick={() => setDeleteTarget({ id: p.id, name: p.name })}
                          >
                            <Trash2 className="h-3 w-3 ml-1" /> حذف
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
          {!isLoading && filtered.length > 0 && (
            <div className="px-4 py-2.5 border-t bg-muted/20 text-xs text-muted-foreground text-left">
              {filtered.length} منتج{filtered.length !== products.length && ` (من أصل ${products.length})`}
            </div>
          )}
        </CardContent>
      </Card>
      )}
    </div>
  );
}
