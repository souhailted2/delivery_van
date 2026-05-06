import { useState } from "react";
import {
  useListReturns, useCreateReturn,
  useListTrucks, useListClients, useListProducts,
} from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatCurrency } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, Search, X } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

type ReturnType = "client_return" | "truck_return";

type ReturnItem = { productId: string; quantity: string; unitPrice: string };
const emptyItem = (): ReturnItem => ({ productId: "", quantity: "1", unitPrice: "0" });

export default function Retours() {
  const { data, isLoading } = useListReturns();
  const returns = Array.isArray(data) ? data : [];

  const { data: trucksData } = useListTrucks();
  const trucks = Array.isArray(trucksData) ? trucksData : [];
  const { data: clientsData } = useListClients();
  const clients = Array.isArray(clientsData) ? clientsData : [];
  const { data: productsData } = useListProducts();
  const products = Array.isArray(productsData) ? productsData : [];

  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const filtered = search.trim()
    ? returns.filter((r) => {
        const q = search.trim().toLowerCase();
        return (
          (r.truckName ?? "").toLowerCase().includes(q) ||
          (r.clientName ?? "").toLowerCase().includes(q)
        );
      })
    : returns;

  const [open, setOpen] = useState(false);
  const [type, setType] = useState<ReturnType>("client_return");
  const [truckId, setTruckId] = useState("");
  const [clientId, setClientId] = useState("");
  const [invoiceId, setInvoiceId] = useState("");
  const [items, setItems] = useState<ReturnItem[]>([emptyItem()]);

  const resetForm = () => {
    setType("client_return"); setTruckId(""); setClientId("");
    setInvoiceId(""); setItems([emptyItem()]);
  };

  const createReturn = useCreateReturn({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["/api/returns"] });
        queryClient.invalidateQueries({ queryKey: ["/api/stock/warehouse"] });
        queryClient.invalidateQueries({ queryKey: ["/api/stock/trucks"] });
        toast.success("تم تسجيل المرتجع بنجاح");
        resetForm(); setOpen(false);
      },
      onError: () => toast.error("حدث خطأ أثناء تسجيل المرتجع"),
    },
  });

  const updateItem = (idx: number, field: keyof ReturnItem, value: string) => {
    setItems((prev) =>
      prev.map((it, i) => {
        if (i !== idx) return it;
        const updated = { ...it, [field]: value };
        if (field === "productId") {
          const prod = products.find((p) => String(p.id) === value);
          if (prod) updated.unitPrice = String(prod.sellingPriceRetail ?? 0);
        }
        return updated;
      })
    );
  };

  const lineTotal = (it: ReturnItem) => Number(it.quantity) * Number(it.unitPrice);
  const grandTotal = items.reduce((s, it) => s + lineTotal(it), 0);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!truckId) { toast.error("اختر الشاحنة"); return; }
    if (type === "client_return" && !clientId) { toast.error("اختر العميل"); return; }
    const valid = items.filter((it) => it.productId && Number(it.quantity) > 0);
    if (valid.length === 0) { toast.error("أضف منتجاً واحداً على الأقل"); return; }

    createReturn.mutate({
      data: {
        type,
        truckId: Number(truckId),
        clientId: clientId ? Number(clientId) : null,
        invoiceId: invoiceId ? Number(invoiceId) : null,
        items: valid.map((it) => ({
          productId: Number(it.productId),
          quantity: Number(it.quantity),
          unitPrice: Number(it.unitPrice),
        })),
      },
    });
  };


  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">المرتجعات</h1>
          <p className="text-muted-foreground">إدارة مرتجعات البضاعة.</p>
        </div>
        <Button onClick={() => { resetForm(); setOpen(true); }}>
          <Plus className="ml-2 h-4 w-4" /> مرتجع جديد
        </Button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input value={search} onChange={(e) => setSearch(e.target.value)}
          placeholder="ابحث بالشاحنة أو العميل..." className="pr-9 pl-9" />
        {search && (
          <button onClick={() => setSearch("")} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
      {search.trim() && (
        <p className="text-sm text-muted-foreground -mt-2">{filtered.length} نتيجة من أصل {returns.length}</p>
      )}

      {/* Create Return Dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>تسجيل مرتجع جديد</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-5">

            <div className="grid grid-cols-2 gap-4">
              {/* Type */}
              <div className="space-y-2 col-span-2">
                <Label>نوع المرتجع *</Label>
                <Select value={type} onValueChange={(v) => { setType(v as ReturnType); setClientId(""); }}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="client_return">مرتجع من عميل ← يعود إلى مخزون الشاحنة</SelectItem>
                    <SelectItem value="truck_return">مرتجع من شاحنة ← يعود إلى المستودع المركزي</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Truck */}
              <div className="space-y-2">
                <Label>الشاحنة *</Label>
                <Select value={truckId} onValueChange={setTruckId}>
                  <SelectTrigger><SelectValue placeholder="اختر الشاحنة" /></SelectTrigger>
                  <SelectContent>
                    {trucks.map((t) => (
                      <SelectItem key={t.id} value={String(t.id)}>{t.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Client — only for client_return */}
              {type === "client_return" && (
                <div className="space-y-2">
                  <Label>العميل *</Label>
                  <Select value={clientId} onValueChange={setClientId}>
                    <SelectTrigger><SelectValue placeholder="اختر العميل" /></SelectTrigger>
                    <SelectContent>
                      {clients.map((c) => (
                        <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Invoice ID — optional, only for client_return */}
              {type === "client_return" && (
                <div className="space-y-2">
                  <Label>رقم الفاتورة المرتبطة (اختياري)</Label>
                  <Input
                    type="number" min="1" placeholder="رقم الفاتورة"
                    value={invoiceId}
                    onChange={(e) => setInvoiceId(e.target.value)}
                  />
                </div>
              )}
            </div>

            {/* Items */}
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <Label>المنتجات المرتجعة *</Label>
                <Button type="button" size="sm" variant="outline"
                  onClick={() => setItems((p) => [...p, emptyItem()])}>
                  <Plus className="h-3.5 w-3.5 ml-1" /> إضافة منتج
                </Button>
              </div>

              <div className="space-y-2">
                <div className="grid grid-cols-[2fr_80px_100px_36px] gap-2 text-xs text-muted-foreground px-1">
                  <span>المنتج</span><span>الكمية</span><span>سعر الوحدة</span><span></span>
                </div>
                {items.map((it, idx) => (
                  <div key={idx} className="grid grid-cols-[2fr_80px_100px_36px] gap-2 items-center">
                    <Select value={it.productId} onValueChange={(v) => updateItem(idx, "productId", v)}>
                      <SelectTrigger className="h-9"><SelectValue placeholder="اختر..." /></SelectTrigger>
                      <SelectContent>
                        {products.map((p) => (
                          <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Input type="number" min="1" className="h-9" value={it.quantity}
                      onChange={(e) => updateItem(idx, "quantity", e.target.value)} />
                    <Input type="number" min="0" className="h-9" value={it.unitPrice}
                      onChange={(e) => updateItem(idx, "unitPrice", e.target.value)} />
                    <Button type="button" size="icon" variant="ghost" className="h-9 w-9 text-destructive"
                      onClick={() => setItems((p) => p.filter((_, i) => i !== idx))}
                      disabled={items.length === 1}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>

              <div className="flex justify-end pt-1">
                <span className="text-sm font-bold">المجموع: {formatCurrency(grandTotal)}</span>
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>إلغاء</Button>
              <Button type="submit" disabled={createReturn.isPending}>
                {createReturn.isPending ? "جارٍ الحفظ..." : "تسجيل المرتجع"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Returns Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>الرقم</TableHead>
                <TableHead>التاريخ</TableHead>
                <TableHead>النوع</TableHead>
                <TableHead>الشاحنة</TableHead>
                <TableHead>العميل</TableHead>
                <TableHead>المبلغ</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={6} className="text-center py-8">جارٍ التحميل...</TableCell></TableRow>
              ) : filtered.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="text-center py-8">{search.trim() ? "لا توجد نتائج مطابقة" : "لا توجد مرتجعات"}</TableCell></TableRow>
              ) : (
                filtered.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>{r.id}</TableCell>
                    <TableCell>{new Date(r.createdAt).toLocaleDateString("ar-DZ")}</TableCell>
                    <TableCell>
                      <Badge variant={r.type === "client_return" ? "default" : "secondary"}>
                        {r.type === "client_return" ? "من عميل" : "من شاحنة"}
                      </Badge>
                    </TableCell>
                    <TableCell>{r.truckName || "-"}</TableCell>
                    <TableCell>{r.clientName || "-"}</TableCell>
                    <TableCell className="font-bold text-destructive">
                      {formatCurrency(r.totalAmount)}
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
