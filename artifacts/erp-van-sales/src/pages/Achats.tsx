import { useState } from "react";
import {
  useListPurchases,
  useCreatePurchase,
  useAddPurchasePayment,
  useListSuppliers,
  useListProducts,
} from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatCurrency } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, Banknote, Search, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

type PurchaseItemRow = { productId: string; quantity: string; purchasePrice: string };
const emptyItem = (): PurchaseItemRow => ({ productId: "", quantity: "1", purchasePrice: "0" });

export default function Achats() {
  const { data, isLoading } = useListPurchases();
  const purchases = Array.isArray(data) ? data : [];
  const { data: suppliersData } = useListSuppliers();
  const suppliers = Array.isArray(suppliersData) ? suppliersData : [];
  const { data: productsData } = useListProducts();
  const products = Array.isArray(productsData) ? productsData : [];
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const filtered = search.trim()
    ? purchases.filter((p) => {
        const q = search.trim().toLowerCase();
        return (
          (p.supplierName ?? "").toLowerCase().includes(q) ||
          String(p.id).includes(q)
        );
      })
    : purchases;

  // Add purchase
  const [addOpen, setAddOpen] = useState(false);
  const [supplierId, setSupplierId] = useState("");
  const [initialPayment, setInitialPayment] = useState("0");
  const [items, setItems] = useState<PurchaseItemRow[]>([emptyItem()]);

  // Payment modal
  const [payOpen, setPayOpen] = useState(false);
  const [payId, setPayId] = useState<number | null>(null);
  const [paySupplier, setPaySupplier] = useState("");
  const [payAmount, setPayAmount] = useState("");

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["/api/purchases"] });

  const createPurchase = useCreatePurchase({
    mutation: {
      onSuccess: () => {
        invalidate();
        queryClient.invalidateQueries({ queryKey: ["/api/suppliers"] });
        toast.success("تم إنشاء أمر الشراء بنجاح");
        setSupplierId(""); setInitialPayment("0"); setItems([emptyItem()]); setAddOpen(false);
      },
      onError: () => toast.error("حدث خطأ أثناء إنشاء أمر الشراء"),
    },
  });

  const addPayment = useAddPurchasePayment({
    mutation: {
      onSuccess: () => {
        invalidate();
        queryClient.invalidateQueries({ queryKey: ["/api/suppliers"] });
        toast.success("تم تسجيل الدفعة بنجاح");
        setPayOpen(false); setPayId(null); setPayAmount("");
      },
      onError: () => toast.error("حدث خطأ أثناء تسجيل الدفعة"),
    },
  });

  const setItem = (idx: number, field: keyof PurchaseItemRow, value: string) =>
    setItems((prev) => prev.map((it, i) => i === idx ? { ...it, [field]: value } : it));

  const autofillPrice = (idx: number, productId: string) => {
    const prod = products.find((p) => String(p.id) === productId);
    if (prod) setItems((prev) => prev.map((it, i) => i === idx ? { ...it, productId, purchasePrice: String(prod.purchasePrice) } : it));
  };

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!supplierId) { toast.error("اختر المورد"); return; }
    const validItems = items.filter((it) => it.productId && Number(it.quantity) > 0);
    if (validItems.length === 0) { toast.error("أضف منتجاً واحداً على الأقل"); return; }
    createPurchase.mutate({
      data: {
        supplierId: Number(supplierId),
        initialPayment: Number(initialPayment) || 0,
        items: validItems.map((it) => ({
          productId: Number(it.productId),
          quantity: Number(it.quantity),
          purchasePrice: Number(it.purchasePrice),
        })),
      },
    });
  };

  const openPayment = (id: number, supplierName: string) => {
    setPayId(id); setPaySupplier(supplierName); setPayAmount(""); setPayOpen(true);
  };

  const statusLabel = (s: string) =>
    s === "paid" ? "مدفوع" : s === "partial" ? "جزئي" : "غير مدفوع";
  const statusVariant = (s: string): "default" | "secondary" | "destructive" =>
    s === "paid" ? "default" : s === "partial" ? "secondary" : "destructive";

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">أوامر الشراء</h1>
          <p className="text-muted-foreground">إدارة المشتريات وإعادة التموين.</p>
        </div>
        <Button onClick={() => setAddOpen(true)}>
          <Plus className="ml-2 h-4 w-4" /> أمر شراء جديد
        </Button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="ابحث بالمورد أو رقم الأمر..."
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
          {filtered.length} نتيجة من أصل {purchases.length}
        </p>
      )}

      {/* Create Purchase Dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>إنشاء أمر شراء جديد</DialogTitle></DialogHeader>
          <form onSubmit={handleCreateSubmit} className="space-y-5">
            <div className="space-y-2">
              <Label>المورد *</Label>
              <Select value={supplierId} onValueChange={setSupplierId}>
                <SelectTrigger><SelectValue placeholder="اختر المورد" /></SelectTrigger>
                <SelectContent>
                  {suppliers.map((s) => (
                    <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <Label>المنتجات *</Label>
                <Button type="button" size="sm" variant="outline" onClick={() => setItems((p) => [...p, emptyItem()])}>
                  <Plus className="h-3.5 w-3.5 ml-1" /> إضافة منتج
                </Button>
              </div>
              {items.map((it, idx) => (
                <div key={idx} className="grid grid-cols-[1fr_80px_100px_36px] gap-2 items-end">
                  <div>
                    {idx === 0 && <Label className="text-xs text-muted-foreground mb-1 block">المنتج</Label>}
                    <Select value={it.productId} onValueChange={(v) => autofillPrice(idx, v)}>
                      <SelectTrigger><SelectValue placeholder="اختر..." /></SelectTrigger>
                      <SelectContent>
                        {products.map((p) => (
                          <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    {idx === 0 && <Label className="text-xs text-muted-foreground mb-1 block">الكمية</Label>}
                    <Input type="number" min="1" value={it.quantity} onChange={(e) => setItem(idx, "quantity", e.target.value)} />
                  </div>
                  <div>
                    {idx === 0 && <Label className="text-xs text-muted-foreground mb-1 block">سعر الشراء</Label>}
                    <Input type="number" min="0" value={it.purchasePrice} onChange={(e) => setItem(idx, "purchasePrice", e.target.value)} />
                  </div>
                  <Button
                    type="button" size="icon" variant="ghost"
                    className="text-destructive hover:text-destructive"
                    onClick={() => setItems((p) => p.filter((_, i) => i !== idx))}
                    disabled={items.length === 1}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>

            <div className="space-y-2">
              <Label>الدفع المبدئي (DZD)</Label>
              <Input type="number" min="0" value={initialPayment} onChange={(e) => setInitialPayment(e.target.value)} placeholder="0" />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setAddOpen(false)}>إلغاء</Button>
              <Button type="submit" disabled={createPurchase.isPending}>
                {createPurchase.isPending ? "جارٍ الحفظ..." : "إنشاء الأمر"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Payment Dialog */}
      <Dialog open={payOpen} onOpenChange={setPayOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>تسجيل دفعة — {paySupplier}</DialogTitle></DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!payId || !Number(payAmount)) return;
              addPayment.mutate({ id: payId, data: { amount: Number(payAmount) } });
            }}
            className="space-y-4"
          >
            <div className="space-y-2">
              <Label>مبلغ الدفعة (DZD) *</Label>
              <Input type="number" min="1" value={payAmount} onChange={(e) => setPayAmount(e.target.value)} placeholder="أدخل المبلغ" required autoFocus />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setPayOpen(false)}>إلغاء</Button>
              <Button type="submit" disabled={addPayment.isPending}>
                {addPayment.isPending ? "جارٍ الحفظ..." : "تسجيل الدفعة"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>الرقم</TableHead>
                <TableHead>التاريخ</TableHead>
                <TableHead>المورد</TableHead>
                <TableHead>الإجمالي</TableHead>
                <TableHead>المتبقي</TableHead>
                <TableHead>الحالة</TableHead>
                <TableHead className="w-28 text-center">إجراءات</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={7} className="text-center py-8">جارٍ التحميل...</TableCell></TableRow>
              ) : filtered.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="text-center py-8">{search.trim() ? "لا توجد نتائج مطابقة" : "لا توجد أوامر شراء"}</TableCell></TableRow>
              ) : (
                filtered.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell>#{p.id}</TableCell>
                    <TableCell>{new Date(p.createdAt).toLocaleDateString("ar-DZ")}</TableCell>
                    <TableCell className="font-medium">{p.supplierName}</TableCell>
                    <TableCell>{formatCurrency(p.totalAmount)}</TableCell>
                    <TableCell className={p.remainingAmount > 0 ? "text-destructive font-medium" : ""}>
                      {formatCurrency(p.remainingAmount)}
                    </TableCell>
                    <TableCell>
                      <Badge variant={statusVariant(p.paymentStatus)}>{statusLabel(p.paymentStatus)}</Badge>
                    </TableCell>
                    <TableCell className="text-center">
                      {p.paymentStatus !== "paid" && (
                        <Button size="sm" variant="outline" onClick={() => openPayment(p.id, p.supplierName)}>
                          <Banknote className="h-3.5 w-3.5 ml-1" /> دفع
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
