import { useState, useRef, useEffect } from "react";
import { useListProducts, useListCategories, useCreateProduct, useUpdateProduct, useDeleteProduct } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatCurrency } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Pencil, Search, X, ImagePlus, Trash2, WifiOff, FileSpreadsheet } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import ExcelImportDialog from "@/components/ExcelImportDialog";

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

// Formats the browser's <img>/<canvas> can reliably decode client-side.
// HEIC/HEIF (default on iPhones) generally can't be decoded this way — those
// are sent as-is and optimized server-side instead.
const CANVAS_DECODABLE = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp", "image/avif", "image/bmp", "image/gif"]);
const CANVAS_MAX_DIM = 1200;
const CANVAS_QUALITY = 0.85;
const CANVAS_DECODE_TIMEOUT_MS = 15000;

const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
const IMAGE_EXTENSION_RE = /\.(jpe?g|png|webp|heic|heif|gif|bmp|avif|tiff?)$/i;

/**
 * Best-effort client-side resize/compress to JPEG. Never throws and never
 * hangs — on any decode/encode failure (including canvas size limits on very
 * high-resolution photos, or formats the browser can't decode like HEIC),
 * resolves with the original file so the upload can proceed and be optimized
 * server-side.
 */
async function compressClientSide(file: File): Promise<File> {
  if (!CANVAS_DECODABLE.has(file.type)) return file;

  return new Promise<File>((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    let settled = false;

    const finish = (result: File) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      URL.revokeObjectURL(url);
      resolve(result);
    };

    const timer = setTimeout(() => finish(file), CANVAS_DECODE_TIMEOUT_MS);

    img.onload = () => {
      try {
        let { width, height } = img;
        if (width > CANVAS_MAX_DIM || height > CANVAS_MAX_DIM) {
          if (width >= height) { height = Math.round(height * CANVAS_MAX_DIM / width); width = CANVAS_MAX_DIM; }
          else { width = Math.round(width * CANVAS_MAX_DIM / height); height = CANVAS_MAX_DIM; }
        }
        const canvas = document.createElement("canvas");
        canvas.width = width; canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) { finish(file); return; }
        ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob((blob) => {
          if (!blob) { finish(file); return; }
          finish(new File([blob], file.name.replace(/\.[^.]+$/, ".jpg"), { type: "image/jpeg" }));
        }, "image/jpeg", CANVAS_QUALITY);
      } catch {
        finish(file);
      }
    };
    img.onerror = () => finish(file);
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
    // Some browsers/OSes send an empty or generic mimetype for HEIC/HEIF files
    if (!file.type.startsWith("image/") && !IMAGE_EXTENSION_RE.test(file.name)) {
      const msg = "يُسمح برفع ملفات الصور فقط";
      setError(msg); toast.error(msg); return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      const msg = "حجم الصورة يتجاوز الحد الأقصى المسموح (25 ميجابايت)";
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
      if (compressed.size > MAX_UPLOAD_BYTES) {
        throw new Error("حجم الصورة يتجاوز الحد الأقصى المسموح (25 ميجابايت)");
      }
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
            accept="image/*,.heic,.heif"
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
              JPG · PNG · WebP · HEIC · HEIF — حتى 25 ميجابايت
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

export default function Produits() {
  const { data, isLoading } = useListProducts();
  const products = Array.isArray(data) ? data : [];
  const { data: catData } = useListCategories();
  const categories = Array.isArray(catData) ? catData : [];
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");

  const [addOpen, setAddOpen] = useState(false);
  const [addForm, setAddForm] = useState(emptyForm);

  const [importOpen, setImportOpen] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<{ id: number; name: string } | null>(null);

  const [editOpen, setEditOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState(emptyForm);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["/api/products"] });

  const filtered = search.trim()
    ? products.filter((p) => {
        const q = search.trim().toLowerCase();
        return (
          p.name.toLowerCase().includes(q) ||
          (p.barcode ?? "").toLowerCase().includes(q) ||
          (p.categoryName ?? "").toLowerCase().includes(q)
        );
      })
    : products;

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
          <h1 className="text-3xl font-bold tracking-tight">المنتجات</h1>
          <p className="text-muted-foreground">إدارة كتالوج المنتجات.</p>
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

      {/* Search */}
      <div className="relative">
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
      {search.trim() && (
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
    </div>
  );
}
