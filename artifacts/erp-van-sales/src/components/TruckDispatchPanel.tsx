import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Trash2, Plus, Send, Package, CheckCircle, Clock, XCircle } from "lucide-react";
import { toast } from "sonner";

interface Product {
  id: number;
  name: string;
  unit: string;
  sellingPriceRetail: number;
  stockQuantity: number;
}

interface DispatchItem {
  productId: number;
  productName: string;
  quantity: number;
  unit: string;
  sellingPriceRetail: number;
}

interface Dispatch {
  id: number;
  truckId: number;
  status: string;
  stockItems: DispatchItem[];
  note: string | null;
  createdAt: string;
  receivedAt: string | null;
}

interface Truck {
  id: number;
  name: string;
  driverName?: string | null;
}

function statusBadge(status: string) {
  if (status === "pending") return <Badge variant="outline" className="gap-1 text-amber-600 border-amber-300 bg-amber-50"><Clock className="h-3 w-3" />معلّق</Badge>;
  if (status === "received") return <Badge variant="outline" className="gap-1 text-emerald-600 border-emerald-300 bg-emerald-50"><CheckCircle className="h-3 w-3" />تم الاستلام</Badge>;
  return <Badge variant="outline" className="gap-1 text-muted-foreground"><XCircle className="h-3 w-3" />مغلق</Badge>;
}

export function TruckDispatchPanel({ truck }: { truck: Truck }) {
  const [dispatches, setDispatches] = useState<Dispatch[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<DispatchItem[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<string>("");
  const [qty, setQty] = useState("1");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const r = await fetch(`/api/dispatches?truckId=${truck.id}`, { credentials: "include" });
    if (r.ok) setDispatches(await r.json());
  }, [truck.id]);

  const loadProducts = useCallback(async () => {
    const r = await fetch("/api/products", { credentials: "include" });
    if (r.ok) {
      const data = await r.json();
      setProducts(Array.isArray(data) ? data : []);
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (open) loadProducts(); }, [open, loadProducts]);

  const addItem = () => {
    const p = products.find(p => String(p.id) === selectedProduct);
    if (!p || !qty || Number(qty) <= 0) return;
    const existing = items.find(i => i.productId === p.id);
    if (existing) {
      setItems(items.map(i => i.productId === p.id ? { ...i, quantity: i.quantity + Number(qty) } : i));
    } else {
      setItems([...items, {
        productId: p.id,
        productName: p.name,
        quantity: Number(qty),
        unit: p.unit,
        sellingPriceRetail: p.sellingPriceRetail,
      }]);
    }
    setSelectedProduct("");
    setQty("1");
  };

  const removeItem = (productId: number) => setItems(items.filter(i => i.productId !== productId));

  const submit = async () => {
    if (items.length === 0) return;
    setSaving(true);
    try {
      const r = await fetch("/api/dispatches", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ truckId: truck.id, stockItems: items, note: note.trim() || null }),
      });
      const data = await r.json();
      if (!r.ok) {
        toast.error(data.error || "حدث خطأ");
      } else {
        toast.success("تم إرسال أمر التحميل للشاحنة");
        setOpen(false);
        setItems([]);
        setNote("");
        load();
      }
    } finally {
      setSaving(false);
    }
  };

  const deleteDispatch = async (id: number) => {
    const r = await fetch(`/api/dispatches/${id}`, { method: "DELETE", credentials: "include" });
    if (r.ok) { toast.success("تم حذف أمر التحميل"); load(); }
    else toast.error("لا يمكن حذف هذا الأمر");
  };

  const hasPending = dispatches.some(d => d.status === "pending");
  const availableProducts = products.filter(p => !items.find(i => i.productId === p.id));

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-muted-foreground flex items-center gap-1.5">
          <Package className="h-4 w-4" /> أوامر التحميل
        </h3>
        <Button size="sm" onClick={() => setOpen(true)} disabled={hasPending}>
          <Send className="h-3.5 w-3.5 ml-1.5" />
          تحميل شاحنة
        </Button>
      </div>

      {hasPending && (
        <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded px-2 py-1">
          يوجد أمر تحميل معلّق — يجب أن تستلمه الشاحنة أولاً قبل إرسال أمر جديد.
        </p>
      )}

      {dispatches.length === 0 ? (
        <p className="text-xs text-muted-foreground py-2 text-center">لا توجد أوامر تحميل بعد</p>
      ) : (
        <div className="space-y-2 max-h-64 overflow-y-auto">
          {dispatches.map(d => (
            <div key={d.id} className="border rounded-lg p-3 space-y-1.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {statusBadge(d.status)}
                  <span className="text-xs text-muted-foreground">
                    {new Date(d.createdAt).toLocaleDateString("ar-DZ")}
                  </span>
                </div>
                {d.status === "pending" && (
                  <button
                    onClick={() => deleteDispatch(d.id)}
                    className="text-muted-foreground hover:text-destructive transition-colors"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
              <div className="text-xs text-foreground">
                {d.stockItems.map(i => `${i.productName} × ${i.quantity} ${i.unit}`).join("، ")}
              </div>
              {d.note && <p className="text-xs text-muted-foreground italic">{d.note}</p>}
              {d.receivedAt && (
                <p className="text-xs text-emerald-600">
                  استُلم: {new Date(d.receivedAt).toLocaleString("ar-DZ")}
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Create Dispatch Dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg" dir="rtl">
          <DialogHeader>
            <DialogTitle>تحميل شاحنة — {truck.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {/* Product selector */}
            <div className="flex gap-2 items-end">
              <div className="flex-1 space-y-1">
                <Label>المنتج</Label>
                <Select value={selectedProduct} onValueChange={setSelectedProduct}>
                  <SelectTrigger>
                    <SelectValue placeholder="اختر منتجاً..." />
                  </SelectTrigger>
                  <SelectContent>
                    {availableProducts.map(p => (
                      <SelectItem key={p.id} value={String(p.id)}>
                        {p.name} ({p.unit})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="w-24 space-y-1">
                <Label>الكمية</Label>
                <Input
                  type="number"
                  min="1"
                  value={qty}
                  onChange={e => setQty(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && addItem()}
                />
              </div>
              <Button onClick={addItem} disabled={!selectedProduct}>
                <Plus className="h-4 w-4" />
              </Button>
            </div>

            {/* Items list */}
            {items.length > 0 && (
              <Card>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>المنتج</TableHead>
                        <TableHead className="text-center">الكمية</TableHead>
                        <TableHead className="text-center">الوحدة</TableHead>
                        <TableHead></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {items.map(item => (
                        <TableRow key={item.productId}>
                          <TableCell className="font-medium">{item.productName}</TableCell>
                          <TableCell className="text-center">{item.quantity}</TableCell>
                          <TableCell className="text-center text-muted-foreground">{item.unit}</TableCell>
                          <TableCell className="text-center">
                            <button onClick={() => removeItem(item.productId)} className="text-muted-foreground hover:text-destructive">
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            )}

            <div className="space-y-1">
              <Label>ملاحظة (اختياري)</Label>
              <Input value={note} onChange={e => setNote(e.target.value)} placeholder="ملاحظة للسائق..." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>إلغاء</Button>
            <Button onClick={submit} disabled={saving || items.length === 0}>
              <Send className="h-3.5 w-3.5 ml-1.5" />
              {saving ? "جارٍ الإرسال..." : "إرسال للشاحنة"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
