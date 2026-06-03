import { useState, useRef, useCallback } from "react";
import * as XLSX from "xlsx";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FileSpreadsheet, Upload, Download, CheckCircle, AlertCircle, X } from "lucide-react";
import { toast } from "sonner";

type ParsedProduct = {
  name: string;
  barcode: string;
  stockQuantity: number;
  purchasePrice: number;
  sellingPriceRetail: number;
  sellingPriceHalfWholesale: number;
  sellingPriceWholesale: number;
  commissionRetail: number;
  commissionHalf: number;
  commissionWholesale: number;
  unit: string;
  categoryName: string;
  _isDuplicate?: boolean;
};

type ImportResult = {
  added: number;
  updated: number;
  skipped: number;
  total: number;
  errors: string[];
};

const NAME_KEYS = ["اسم المنتج", "المنتج", "الاسم", "designation", "désignation", "nom", "name", "product", "libelle", "libellé", "article"];
const QTY_KEYS = ["الكمية", "المخزون", "كمية", "qte", "qty", "quantité", "quantite", "quantity", "stock"];
const RETAIL_KEYS = ["سعر البيع", "سعر التجزئة", "سعر", "pu", "prix", "price", "retail", "prix vente", "selling price", "prix de vente"];
const PURCHASE_KEYS = ["سعر الشراء", "purchase", "cout", "coût", "prix achat", "pa", "prix d'achat"];
const WHOLESALE_KEYS = ["سعر الجملة", "wholesale", "gros", "prix gros"];
const HALF_KEYS = ["نصف الجملة", "نصف جملة", "demi-gros", "demi gros", "half"];
const UNIT_KEYS = ["الوحدة", "unit", "unité", "unite"];
const BARCODE_KEYS = ["الباركود", "barcode", "code", "ean", "ref", "reference", "référence", "code barre"];
const CATEGORY_KEYS = ["الفئة", "الصنف", "category", "categorie", "catégorie", "famille"];

function findCol(headers: string[], keys: string[]): string | null {
  const lowerHeaders = headers.map(h => String(h ?? "").toLowerCase().trim());
  for (const key of keys) {
    const idx = lowerHeaders.findIndex(h => h === key.toLowerCase() || h.includes(key.toLowerCase()));
    if (idx !== -1) return headers[idx];
  }
  return null;
}

function numVal(row: Record<string, unknown>, col: string | null): number {
  if (!col || row[col] === undefined || row[col] === null || row[col] === "") return 0;
  const v = Number(row[col]);
  return isNaN(v) ? 0 : v;
}

function strVal(row: Record<string, unknown>, col: string | null): string {
  if (!col || row[col] === undefined || row[col] === null) return "";
  return String(row[col]).trim();
}

function parseExcel(buffer: ArrayBuffer, existingNames: Set<string>): ParsedProduct[] {
  const wb = XLSX.read(buffer, { type: "array" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "" });

  if (rows.length === 0) return [];

  const headers = Object.keys(rows[0]);
  const nameCol = findCol(headers, NAME_KEYS);
  const qtyCol = findCol(headers, QTY_KEYS);
  const retailCol = findCol(headers, RETAIL_KEYS);
  const purchaseCol = findCol(headers, PURCHASE_KEYS);
  const wholesaleCol = findCol(headers, WHOLESALE_KEYS);
  const halfCol = findCol(headers, HALF_KEYS);
  const unitCol = findCol(headers, UNIT_KEYS);
  const barcodeCol = findCol(headers, BARCODE_KEYS);
  const categoryCol = findCol(headers, CATEGORY_KEYS);

  const results: ParsedProduct[] = [];
  for (const row of rows) {
    const name = nameCol ? strVal(row, nameCol) : "";
    if (!name) continue;
    results.push({
      name,
      barcode: strVal(row, barcodeCol),
      stockQuantity: numVal(row, qtyCol),
      purchasePrice: numVal(row, purchaseCol),
      sellingPriceRetail: numVal(row, retailCol),
      sellingPriceHalfWholesale: numVal(row, halfCol),
      sellingPriceWholesale: numVal(row, wholesaleCol),
      commissionRetail: 0,
      commissionHalf: 0,
      commissionWholesale: 0,
      unit: strVal(row, unitCol) || "قطعة",
      categoryName: strVal(row, categoryCol),
      _isDuplicate: existingNames.has(name),
    });
  }
  return results;
}

function downloadTemplate() {
  const headers = [
    "اسم المنتج", "الكمية", "سعر البيع", "سعر الشراء",
    "سعر الجملة", "نصف الجملة", "الوحدة", "الباركود", "الفئة"
  ];
  const example = [
    ["منتج مثال 1", 100, 250, 150, 200, 225, "قطعة", "1234567890", "مشروبات"],
    ["منتج مثال 2", 50, 1500, 1000, 1200, 1350, "لتر", "", "منظفات"],
  ];
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([headers, ...example]);
  ws["!cols"] = headers.map(() => ({ wch: 18 }));
  XLSX.utils.book_append_sheet(wb, ws, "المنتجات");
  XLSX.writeFile(wb, "نموذج_استيراد_المنتجات.xlsx");
}

export default function ExcelImportDialog({
  open,
  onOpenChange,
  existingProducts,
  onImported,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  existingProducts: { name: string }[];
  onImported: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [parsed, setParsed] = useState<ParsedProduct[] | null>(null);
  const [fileName, setFileName] = useState("");
  const [duplicateAction, setDuplicateAction] = useState<"update" | "skip">("skip");
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);

  const existingNames = new Set(existingProducts.map(p => p.name));
  const duplicates = parsed?.filter(p => p._isDuplicate) ?? [];

  const reset = () => {
    setParsed(null);
    setFileName("");
    setResult(null);
    setParseError(null);
    setDuplicateAction("skip");
    if (fileRef.current) fileRef.current.value = "";
  };

  const handleFile = useCallback(async (file: File) => {
    if (!file.name.match(/\.(xlsx|xls)$/i)) {
      setParseError("يرجى رفع ملف بصيغة .xlsx أو .xls فقط");
      return;
    }
    setParseError(null);
    setFileName(file.name);
    const buf = await file.arrayBuffer();
    try {
      const products = parseExcel(buf, existingNames);
      if (products.length === 0) {
        setParseError("لم يتم العثور على منتجات في الملف. تأكد من أن الملف يحتوي على عمود اسم المنتج.");
        return;
      }
      setParsed(products);
    } catch {
      setParseError("تعذّر قراءة الملف. تأكد من أنه ملف Excel صالح.");
    }
  }, [existingNames]);

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) await handleFile(file);
  };

  const handleConfirm = async () => {
    if (!parsed) return;
    setImporting(true);
    try {
      const res = await fetch("/api/products/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ products: parsed, duplicateAction }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(body.error || "حدث خطأ أثناء الاستيراد");
      }
      const data = await res.json() as ImportResult;
      setResult(data);
      onImported();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "حدث خطأ أثناء الاستيراد");
    } finally {
      setImporting(false);
    }
  };

  const handleClose = () => {
    reset();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg">
            <FileSpreadsheet className="h-5 w-5 text-green-600" />
            استيراد المنتجات من Excel
          </DialogTitle>
        </DialogHeader>

        {result ? (
          <div className="space-y-4 py-4">
            <div className="flex items-center gap-3 p-4 rounded-xl bg-green-50 border border-green-200">
              <CheckCircle className="h-8 w-8 text-green-600 shrink-0" />
              <div>
                <p className="font-bold text-green-800 text-lg">تم الاستيراد بنجاح!</p>
                <p className="text-green-700 text-sm">تمت معالجة {result.total} منتج</p>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-lg border bg-muted/30 p-4 text-center">
                <p className="text-2xl font-bold text-green-600">{result.added}</p>
                <p className="text-sm text-muted-foreground mt-1">منتج جديد أُضيف</p>
              </div>
              <div className="rounded-lg border bg-muted/30 p-4 text-center">
                <p className="text-2xl font-bold text-blue-600">{result.updated}</p>
                <p className="text-sm text-muted-foreground mt-1">كمية حُدِّثت</p>
              </div>
              <div className="rounded-lg border bg-muted/30 p-4 text-center">
                <p className="text-2xl font-bold text-orange-500">{result.skipped}</p>
                <p className="text-sm text-muted-foreground mt-1">تجاوزته (مكرر)</p>
              </div>
            </div>
            {result.errors.length > 0 && (
              <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20">
                <p className="text-sm font-medium text-destructive mb-1">منتجات بها أخطاء:</p>
                <ul className="text-xs text-destructive space-y-0.5">
                  {result.errors.map((e, i) => <li key={i}>• {e}</li>)}
                </ul>
              </div>
            )}
            <DialogFooter>
              <Button onClick={handleClose}>إغلاق</Button>
            </DialogFooter>
          </div>
        ) : parsed ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                <span className="font-medium text-foreground">{parsed.length}</span> منتج جاهز للاستيراد من <span className="font-medium">{fileName}</span>
              </p>
              <Button variant="ghost" size="sm" onClick={reset}>
                <X className="h-4 w-4 ml-1" /> تغيير الملف
              </Button>
            </div>

            {duplicates.length > 0 && (
              <div className="rounded-lg border border-orange-200 bg-orange-50 p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 text-orange-500 shrink-0" />
                  <p className="text-sm font-medium text-orange-800">
                    {duplicates.length} منتج موجود مسبقاً — اختر ماذا تفعل:
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setDuplicateAction("update")}
                    className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium border transition-colors ${
                      duplicateAction === "update"
                        ? "bg-blue-600 text-white border-blue-600"
                        : "bg-white text-foreground border-border hover:bg-muted"
                    }`}
                  >
                    تحديث الكمية (إضافة للمخزون)
                  </button>
                  <button
                    onClick={() => setDuplicateAction("skip")}
                    className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium border transition-colors ${
                      duplicateAction === "skip"
                        ? "bg-blue-600 text-white border-blue-600"
                        : "bg-white text-foreground border-border hover:bg-muted"
                    }`}
                  >
                    تجاهل المكررات
                  </button>
                </div>
              </div>
            )}

            <div className="rounded-lg border overflow-hidden">
              <div className="max-h-72 overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead className="text-right">اسم المنتج</TableHead>
                      <TableHead className="text-right">الكمية</TableHead>
                      <TableHead className="text-right">سعر البيع</TableHead>
                      <TableHead className="text-right">سعر الشراء</TableHead>
                      <TableHead className="text-right">سعر الجملة</TableHead>
                      <TableHead className="text-right">الوحدة</TableHead>
                      <TableHead className="text-right">الفئة</TableHead>
                      <TableHead className="text-right w-20">الحالة</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {parsed.map((p, i) => (
                      <TableRow key={i} className={p._isDuplicate ? "bg-orange-50" : ""}>
                        <TableCell className="font-medium">{p.name}</TableCell>
                        <TableCell>{p.stockQuantity}</TableCell>
                        <TableCell>{p.sellingPriceRetail > 0 ? p.sellingPriceRetail : "-"}</TableCell>
                        <TableCell>{p.purchasePrice > 0 ? p.purchasePrice : "-"}</TableCell>
                        <TableCell>{p.sellingPriceWholesale > 0 ? p.sellingPriceWholesale : "-"}</TableCell>
                        <TableCell>{p.unit}</TableCell>
                        <TableCell>{p.categoryName || "-"}</TableCell>
                        <TableCell>
                          {p._isDuplicate ? (
                            <span className="text-xs px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 font-medium">مكرر</span>
                          ) : (
                            <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-medium">جديد</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>

            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={handleClose}>إلغاء</Button>
              <Button onClick={handleConfirm} disabled={importing} className="min-w-32">
                {importing ? (
                  <><span className="inline-block h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin ml-2" />جارٍ الاستيراد...</>
                ) : (
                  <><Upload className="h-4 w-4 ml-2" />استيراد {parsed.length} منتج</>
                )}
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-4 py-2">
            <div
              className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors ${
                dragOver ? "border-green-500 bg-green-50" : "border-muted-foreground/25 hover:border-green-400 hover:bg-muted/30"
              }`}
              onClick={() => fileRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
            >
              <FileSpreadsheet className="h-12 w-12 text-green-500 mx-auto mb-3" />
              <p className="font-semibold text-base mb-1">اسحب ملف Excel هنا أو انقر للاختيار</p>
              <p className="text-sm text-muted-foreground">يدعم .xlsx و .xls</p>
              <input
                ref={fileRef}
                type="file"
                accept=".xlsx,.xls"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
              />
            </div>

            {parseError && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {parseError}
              </div>
            )}

            <div className="rounded-lg border bg-muted/20 p-4 space-y-2">
              <p className="text-sm font-medium">أعمدة مقبولة في الملف:</p>
              <div className="grid grid-cols-2 gap-1 text-xs text-muted-foreground">
                <span>• <b>اسم المنتج</b> / designation / nom</span>
                <span>• <b>الكمية</b> / qte / quantité</span>
                <span>• <b>سعر البيع</b> / pu / prix</span>
                <span>• <b>سعر الشراء</b> / prix achat</span>
                <span>• <b>سعر الجملة</b> / wholesale (اختياري)</span>
                <span>• <b>الوحدة</b> / unit (اختياري)</span>
                <span>• <b>الباركود</b> / barcode (اختياري)</span>
                <span>• <b>الفئة</b> / category (اختياري)</span>
              </div>
            </div>

            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={handleClose}>إلغاء</Button>
              <Button variant="outline" onClick={downloadTemplate} className="text-green-700 border-green-300 hover:bg-green-50">
                <Download className="h-4 w-4 ml-2" />
                تحميل نموذج Excel
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
