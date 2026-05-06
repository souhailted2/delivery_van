import { useState, useEffect } from "react";
import {
  useListInvoices, useCreateInvoice,
  useListClients, useListTrucks, useListProducts,
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
import { Plus, Trash2, CalendarDays, Search, X } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

type PriceType = "retail" | "half_wholesale" | "wholesale";

const PRICE_TYPE_LABELS: Record<PriceType, string> = {
  retail: "تجزئة",
  half_wholesale: "نصف جملة",
  wholesale: "جملة",
};

// Maps clientType → priceType
const CLIENT_TYPE_TO_PRICE_TYPE: Record<string, PriceType> = {
  retail: "retail",
  half_wholesale: "half_wholesale",
  wholesale: "wholesale",
};

type InvoiceItem = { productId: string; quantity: string; priceType: PriceType; unitPrice: string };
const emptyItem = (): InvoiceItem => ({ productId: "", quantity: "1", priceType: "retail", unitPrice: "0" });

function getPriceForType(product: { sellingPriceRetail: number; sellingPriceHalfWholesale: number; sellingPriceWholesale: number }, priceType: PriceType): number {
  if (priceType === "wholesale") return product.sellingPriceWholesale;
  if (priceType === "half_wholesale") return product.sellingPriceHalfWholesale;
  return product.sellingPriceRetail;
}

export default function Factures() {
  const { data, isLoading } = useListInvoices();
  const invoices = Array.isArray(data) ? data : [];
  const { data: clientsData } = useListClients();
  const clients = Array.isArray(clientsData) ? clientsData : [];
  const { data: trucksData } = useListTrucks();
  const trucks = Array.isArray(trucksData) ? trucksData : [];
  const { data: productsData } = useListProducts();
  const products = Array.isArray(productsData) ? productsData : [];
  const queryClient = useQueryClient();

  const [open, setOpen] = useState(false);
  const [clientId, setClientId] = useState("");
  const [truckId, setTruckId] = useState("");
  const [paymentType, setPaymentType] = useState<"cash" | "credit">("cash");
  const [defaultPriceType, setDefaultPriceType] = useState<PriceType>("retail");
  const [items, setItems] = useState<InvoiceItem[]>([emptyItem()]);

  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const toDateStr = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  };

  const setToday = () => {
    const today = toDateStr(new Date());
    setDateFrom(today);
    setDateTo(today);
  };

  const setThisWeek = () => {
    const now = new Date();
    // Week starts on Saturday (day 6) for Arabic/Algerian locale
    const day = now.getDay();
    const diffToSat = (day + 1) % 7;
    const start = new Date(now);
    start.setDate(now.getDate() - diffToSat);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    setDateFrom(toDateStr(start));
    setDateTo(toDateStr(end));
  };

  const setThisMonth = () => {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    setDateFrom(toDateStr(start));
    setDateTo(toDateStr(end));
  };

  const clearFilter = () => {
    setDateFrom("");
    setDateTo("");
  };

  const filteredInvoices = invoices.filter((inv) => {
    const invDate = inv.createdAt ? toDateStr(new Date(inv.createdAt)) : "";
    if (dateFrom && invDate < dateFrom) return false;
    if (dateTo && invDate > dateTo) return false;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      const matchInvoice = (inv.invoiceNumber ?? "").toLowerCase().includes(q);
      const matchClient = (inv.clientName ?? "").toLowerCase().includes(q);
      const matchTruck = (inv.truckName ?? "").toLowerCase().includes(q);
      if (!matchInvoice && !matchClient && !matchTruck) return false;
    }
    return true;
  });

  // When client changes → auto-set defaultPriceType from clientType
  useEffect(() => {
    if (!clientId) return;
    const client = clients.find((c) => String(c.id) === clientId);
    if (client?.clientType) {
      const pt = CLIENT_TYPE_TO_PRICE_TYPE[client.clientType] ?? "retail";
      setDefaultPriceType(pt);
      // Update all existing item rows priceType + unitPrice
      setItems((prev) =>
        prev.map((it) => {
          const prod = products.find((p) => String(p.id) === it.productId);
          return {
            ...it,
            priceType: pt,
            unitPrice: prod ? String(getPriceForType(prod, pt)) : it.unitPrice,
          };
        })
      );
    }
  }, [clientId, clients, products]);

  const createInvoice = useCreateInvoice({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["/api/invoices"] });
        queryClient.invalidateQueries({ queryKey: ["/api/clients"] });
        toast.success("تم إنشاء الفاتورة بنجاح");
        setClientId(""); setTruckId(""); setPaymentType("cash");
        setDefaultPriceType("retail"); setItems([emptyItem()]); setOpen(false);
      },
      onError: () => toast.error("حدث خطأ أثناء إنشاء الفاتورة"),
    },
  });

  const updateItem = (idx: number, field: keyof InvoiceItem, value: string) => {
    setItems((prev) =>
      prev.map((it, i) => {
        if (i !== idx) return it;
        const updated = { ...it, [field]: value };
        // Auto-fill price when product changes
        if (field === "productId") {
          const prod = products.find((p) => String(p.id) === value);
          if (prod) updated.unitPrice = String(getPriceForType(prod, updated.priceType));
        }
        // Recalculate price when priceType changes
        if (field === "priceType") {
          const prod = products.find((p) => String(p.id) === it.productId);
          if (prod) updated.unitPrice = String(getPriceForType(prod, value as PriceType));
        }
        return updated;
      })
    );
  };

  const lineTotal = (it: InvoiceItem) => Number(it.quantity) * Number(it.unitPrice);
  const grandTotal = items.reduce((s, it) => s + lineTotal(it), 0);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!clientId) { toast.error("اختر العميل"); return; }
    if (!truckId) { toast.error("اختر الشاحنة"); return; }
    const valid = items.filter((it) => it.productId && Number(it.quantity) > 0);
    if (valid.length === 0) { toast.error("أضف منتجاً واحداً على الأقل"); return; }
    createInvoice.mutate({
      data: {
        clientId: Number(clientId),
        truckId: Number(truckId),
        paymentType,
        items: valid.map((it) => ({
          productId: Number(it.productId),
          quantity: Number(it.quantity),
          priceType: it.priceType,
          unitPrice: Number(it.unitPrice),
        })),
      },
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">الفواتير</h1>
          <p className="text-muted-foreground">سجل المبيعات والفواتير.</p>
        </div>
        <Button onClick={() => setOpen(true)}>
          <Plus className="ml-2 h-4 w-4" /> إنشاء فاتورة
        </Button>
      </div>

      {/* Create Invoice Dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>إنشاء فاتورة بيع</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-5">

            <div className="grid grid-cols-2 gap-4">
              {/* Client */}
              <div className="space-y-2">
                <Label>العميل *</Label>
                <Select value={clientId} onValueChange={setClientId}>
                  <SelectTrigger><SelectValue placeholder="اختر العميل" /></SelectTrigger>
                  <SelectContent>
                    {clients.map((c) => (
                      <SelectItem key={c.id} value={String(c.id)}>
                        {c.name}
                        {c.clientType && (
                          <span className="text-muted-foreground text-xs mr-2">
                            ({c.clientType === "retail" ? "تجزئة" : c.clientType === "half_wholesale" ? "نصف جملة" : "جملة"})
                          </span>
                        )}
                      </SelectItem>
                    ))}
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

              {/* Payment type */}
              <div className="space-y-2">
                <Label>طريقة الدفع</Label>
                <Select value={paymentType} onValueChange={(v) => setPaymentType(v as "cash" | "credit")}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cash">نقداً</SelectItem>
                    <SelectItem value="credit">آجل</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Default price type — shows what was auto-set from client */}
              <div className="space-y-2">
                <Label>نوع السعر الافتراضي (حسب العميل)</Label>
                <Select value={defaultPriceType} onValueChange={(v) => {
                  const pt = v as PriceType;
                  setDefaultPriceType(pt);
                  setItems((prev) => prev.map((it) => {
                    const prod = products.find((p) => String(p.id) === it.productId);
                    return { ...it, priceType: pt, unitPrice: prod ? String(getPriceForType(prod, pt)) : it.unitPrice };
                  }));
                }}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="retail">تجزئة</SelectItem>
                    <SelectItem value="half_wholesale">نصف جملة</SelectItem>
                    <SelectItem value="wholesale">جملة</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Items */}
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <Label>المنتجات *</Label>
                <Button type="button" size="sm" variant="outline"
                  onClick={() => setItems((p) => [...p, { ...emptyItem(), priceType: defaultPriceType }])}>
                  <Plus className="h-3.5 w-3.5 ml-1" /> إضافة منتج
                </Button>
              </div>

              <div className="space-y-2">
                <div className="grid grid-cols-[2fr_70px_120px_90px_36px] gap-2 text-xs text-muted-foreground px-1">
                  <span>المنتج</span><span>الكمية</span><span>نوع السعر</span><span>السعر</span><span></span>
                </div>
                {items.map((it, idx) => (
                  <div key={idx} className="grid grid-cols-[2fr_70px_120px_90px_36px] gap-2 items-center">
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
                    <Select value={it.priceType} onValueChange={(v) => updateItem(idx, "priceType", v)}>
                      <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="retail">تجزئة</SelectItem>
                        <SelectItem value="half_wholesale">نصف جملة</SelectItem>
                        <SelectItem value="wholesale">جملة</SelectItem>
                      </SelectContent>
                    </Select>
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
                <span className="text-sm font-bold">
                  المجموع: {formatCurrency(grandTotal)}
                </span>
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>إلغاء</Button>
              <Button type="submit" disabled={createInvoice.isPending}>
                {createInvoice.isPending ? "جارٍ الحفظ..." : "إنشاء الفاتورة"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Search */}
      <div className="relative">
        <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="ابحث برقم الفاتورة أو العميل أو الشاحنة..."
          className="pr-9 pl-9"
        />
        {search && (
          <button
            onClick={() => setSearch("")}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
      {search.trim() && (
        <p className="text-sm text-muted-foreground -mt-2">
          {filteredInvoices.length} نتيجة من أصل {invoices.length}
        </p>
      )}

      {/* Date Filter */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap items-end gap-3">
            <CalendarDays className="h-5 w-5 text-muted-foreground self-center" />
            <div className="space-y-1">
              <Label className="text-xs">من</Label>
              <Input
                type="date"
                className="h-9 w-40"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">إلى</Label>
              <Input
                type="date"
                className="h-9 w-40"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
              />
            </div>
            <div className="flex gap-2 flex-wrap">
              <Button type="button" size="sm" variant="outline" onClick={setToday}>اليوم</Button>
              <Button type="button" size="sm" variant="outline" onClick={setThisWeek}>هذا الأسبوع</Button>
              <Button type="button" size="sm" variant="outline" onClick={setThisMonth}>هذا الشهر</Button>
              {(dateFrom || dateTo) && (
                <Button type="button" size="sm" variant="ghost" onClick={clearFilter}>مسح الفلتر</Button>
              )}
            </div>
            {(dateFrom || dateTo) && (
              <span className="text-sm text-muted-foreground self-center mr-auto">
                {filteredInvoices.length} فاتورة
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Invoices Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>رقم الفاتورة</TableHead>
                <TableHead>التاريخ</TableHead>
                <TableHead>العميل</TableHead>
                <TableHead>الشاحنة</TableHead>
                <TableHead>طريقة الدفع</TableHead>
                <TableHead>المبلغ</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={6} className="text-center py-8">جارٍ التحميل...</TableCell></TableRow>
              ) : filteredInvoices.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="text-center py-8">
                  {search.trim() ? "لا توجد نتائج مطابقة" : (dateFrom || dateTo) ? "لا توجد فواتير في هذه الفترة" : "لا توجد فواتير"}
                </TableCell></TableRow>
              ) : (
                filteredInvoices.map((i) => (
                  <TableRow key={i.id}>
                    <TableCell className="font-medium">{i.invoiceNumber}</TableCell>
                    <TableCell>{new Date(i.createdAt).toLocaleDateString("ar-DZ")}</TableCell>
                    <TableCell>{i.clientName}</TableCell>
                    <TableCell>{i.truckName}</TableCell>
                    <TableCell>
                      <Badge variant={i.paymentType === "cash" ? "default" : "outline"}>
                        {i.paymentType === "cash" ? "نقداً" : "آجل"}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-bold">{formatCurrency(i.totalAmount)}</TableCell>
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
