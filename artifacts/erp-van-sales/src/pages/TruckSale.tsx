import { useState, useRef } from "react";
import {
  useGetMyTruckClients,
  useGetMyTruckStock,
  useCreateMyTruckInvoice,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { formatCurrency } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  ArrowRight, MapPin, Search, Plus, ShoppingCart, X,
  CheckCircle, Package, ChevronDown, ChevronUp, Trash2,
} from "lucide-react";

type ClientType = "retail" | "half_wholesale" | "wholesale";
type PaymentType = "cash" | "credit";

type StockItem = {
  productId: number;
  productName: string;
  quantity: number;
  unit: string;
  imageUrl?: string | null;
  sellingPriceRetail: number;
  sellingPriceHalfWholesale: number;
  sellingPriceWholesale: number;
};

type TruckClient = {
  id: number;
  name: string;
  phone?: string | null;
  clientType: string;
  balance: number;
};

type CartItem = {
  productId: number;
  productName: string;
  quantity: number;
  unitPrice: number;
  priceType: ClientType;
  imageUrl?: string | null;
  unit: string;
  subtotal: number;
};

const clientTypeLabels: Record<string, string> = {
  retail: "تجزئة",
  half_wholesale: "نصف جملة",
  wholesale: "جملة",
};

function getPriceForType(item: StockItem, type: ClientType): number {
  if (type === "wholesale") return item.sellingPriceWholesale;
  if (type === "half_wholesale") return item.sellingPriceHalfWholesale;
  return item.sellingPriceRetail;
}

export default function TruckSale({ onBack }: { onBack: () => void }) {
  const queryClient = useQueryClient();

  // Data
  const { data: clientsData } = useGetMyTruckClients();
  const { data: stockData } = useGetMyTruckStock();
  const clients: TruckClient[] = (Array.isArray(clientsData) ? clientsData : []) as TruckClient[];
  const stock: StockItem[] = (Array.isArray(stockData) ? stockData : []) as StockItem[];

  // Step
  const [step, setStep] = useState<"client" | "products">("client");

  // Client step state
  const [clientSearch, setClientSearch] = useState("");
  const [selectedClient, setSelectedClient] = useState<TruckClient | null>(null);
  const [newClientMode, setNewClientMode] = useState(false);
  const [newClientForm, setNewClientForm] = useState({ name: "", phone: "", clientType: "retail" as ClientType });
  const [paymentType, setPaymentType] = useState<PaymentType>("cash");
  const [gpsLocation, setGpsLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [gpsLoading, setGpsLoading] = useState(false);

  // Products step state
  const [cart, setCart] = useState<CartItem[]>([]);
  const [productSearch, setProductSearch] = useState("");
  const [qtyDialog, setQtyDialog] = useState<StockItem | null>(null);
  const [qtyInput, setQtyInput] = useState("");
  const [cartOpen, setCartOpen] = useState(false);
  const qtyRef = useRef<HTMLInputElement>(null);

  const createInvoice = useCreateMyTruckInvoice({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["/api/trucks/me/invoices"] });
        queryClient.invalidateQueries({ queryKey: ["/api/trucks/me/stock"] });
        queryClient.invalidateQueries({ queryKey: ["/api/trucks/me/clients"] });
        toast.success("تم إنشاء الفاتورة بنجاح!");
        onBack();
      },
      onError: () => toast.error("حدث خطأ أثناء إنشاء الفاتورة"),
    },
  });

  const getGps = () => {
    if (!navigator.geolocation) { toast.error("GPS غير متاح في هذا الجهاز"); return; }
    setGpsLoading(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGpsLocation({ latitude: pos.coords.latitude, longitude: pos.coords.longitude });
        setGpsLoading(false);
        toast.success("تم تحديد الموقع");
      },
      () => { setGpsLoading(false); toast.error("تعذّر تحديد الموقع"); },
      { timeout: 10000 }
    );
  };

  const clientType: ClientType = selectedClient
    ? (selectedClient.clientType as ClientType)
    : newClientForm.clientType;

  const filteredClients = clientSearch.trim()
    ? clients.filter((c) => c.name.toLowerCase().includes(clientSearch.toLowerCase()) || (c.phone ?? "").includes(clientSearch))
    : clients;

  const filteredStock = stock.filter((s) => {
    if (s.quantity <= 0) return false;
    if (!productSearch.trim()) return true;
    return s.productName.toLowerCase().includes(productSearch.toLowerCase());
  });

  const cartTotal = cart.reduce((s, i) => s + i.subtotal, 0);
  const cartCount = cart.reduce((s, i) => s + i.quantity, 0);

  const addToCart = (product: StockItem, qty: number) => {
    if (qty <= 0 || qty > product.quantity) return;
    const unitPrice = getPriceForType(product, clientType);
    const existing = cart.findIndex((c) => c.productId === product.productId);
    if (existing >= 0) {
      setCart((prev) => prev.map((c, i) =>
        i === existing
          ? { ...c, quantity: qty, subtotal: qty * unitPrice }
          : c
      ));
    } else {
      setCart((prev) => [...prev, {
        productId: product.productId,
        productName: product.productName,
        quantity: qty,
        unitPrice,
        priceType: clientType,
        imageUrl: product.imageUrl,
        unit: product.unit,
        subtotal: qty * unitPrice,
      }]);
    }
    setQtyDialog(null);
    setQtyInput("");
  };

  const removeFromCart = (productId: number) =>
    setCart((prev) => prev.filter((c) => c.productId !== productId));

  const openQtyDialog = (product: StockItem) => {
    const existing = cart.find((c) => c.productId === product.productId);
    setQtyInput(existing ? String(existing.quantity) : "");
    setQtyDialog(product);
    setTimeout(() => qtyRef.current?.focus(), 100);
  };

  const canGoToProducts = selectedClient !== null || (newClientMode && newClientForm.name.trim() !== "");

  const handleConfirm = () => {
    if (!cart.length) { toast.error("الفاتورة فارغة"); return; }
    createInvoice.mutate({
      data: {
        clientId: selectedClient ? selectedClient.id : undefined as any,
        newClient: !selectedClient && newClientMode
          ? { name: newClientForm.name.trim(), phone: newClientForm.phone || undefined, clientType: newClientForm.clientType }
          : undefined as any,
        paymentType,
        latitude: gpsLocation?.latitude ?? undefined as any,
        longitude: gpsLocation?.longitude ?? undefined as any,
        items: cart.map((i) => ({
          productId: i.productId,
          quantity: i.quantity,
          priceType: i.priceType,
          unitPrice: i.unitPrice,
        })),
      },
    });
  };

  return (
    <div className="min-h-screen bg-background flex flex-col" dir="rtl">
      {/* Header */}
      <header className="border-b bg-card px-4 py-3 flex items-center justify-between sticky top-0 z-20">
        <button onClick={onBack} className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors">
          <ArrowRight className="h-5 w-5" />
          <span className="text-sm font-medium">رجوع</span>
        </button>
        <h1 className="text-base font-bold">بيع جديد</h1>
        {step === "products" && (
          <button
            onClick={() => setCartOpen(true)}
            className="relative flex items-center gap-1 bg-primary text-primary-foreground px-3 py-1.5 rounded-full text-sm font-medium"
          >
            <ShoppingCart className="h-4 w-4" />
            <span>{cartCount}</span>
          </button>
        )}
        {step === "client" && <div className="w-16" />}
      </header>

      {/* Step indicator */}
      <div className="border-b bg-muted/30 px-4 py-2 flex gap-4 items-center">
        <div className={`flex items-center gap-1.5 text-sm font-medium ${step === "client" ? "text-primary" : "text-muted-foreground"}`}>
          <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs ${step === "client" ? "bg-primary text-primary-foreground" : "bg-muted-foreground/30 text-muted-foreground"}`}>١</span>
          اختيار العميل
        </div>
        <div className="h-px flex-1 bg-border" />
        <div className={`flex items-center gap-1.5 text-sm font-medium ${step === "products" ? "text-primary" : "text-muted-foreground"}`}>
          <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs ${step === "products" ? "bg-primary text-primary-foreground" : "bg-muted-foreground/30 text-muted-foreground"}`}>٢</span>
          المنتجات
        </div>
      </div>

      {/* STEP 1: CLIENT */}
      {step === "client" && (
        <div className="flex-1 overflow-y-auto p-4 space-y-4 pb-32">
          {/* Payment type */}
          <Card>
            <CardContent className="p-4 space-y-3">
              <Label className="text-sm font-semibold">نوع الدفع</Label>
              <div className="flex gap-2">
                <button
                  onClick={() => setPaymentType("cash")}
                  className={`flex-1 py-2.5 rounded-lg border-2 text-sm font-medium transition-all ${paymentType === "cash" ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground"}`}
                >
                  💵 نقدي
                </button>
                <button
                  onClick={() => setPaymentType("credit")}
                  className={`flex-1 py-2.5 rounded-lg border-2 text-sm font-medium transition-all ${paymentType === "credit" ? "border-orange-500 bg-orange-50 text-orange-600 dark:bg-orange-900/20 dark:text-orange-400" : "border-border text-muted-foreground"}`}
                >
                  📋 آجل
                </button>
              </div>
            </CardContent>
          </Card>

          {/* GPS */}
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold">الموقع الجغرافي</p>
                  {gpsLocation ? (
                    <p className="text-xs text-green-600 dark:text-green-400 mt-0.5">
                      ✓ {gpsLocation.latitude.toFixed(4)}, {gpsLocation.longitude.toFixed(4)}
                    </p>
                  ) : (
                    <p className="text-xs text-muted-foreground mt-0.5">اختياري — لربط مكان البيع</p>
                  )}
                </div>
                <Button size="sm" variant={gpsLocation ? "outline" : "default"} onClick={getGps} disabled={gpsLoading}>
                  <MapPin className="h-4 w-4 ml-1" />
                  {gpsLoading ? "جارٍ..." : gpsLocation ? "تحديث" : "تحديد"}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Client selection toggle */}
          <div className="flex gap-2">
            <button
              onClick={() => { setNewClientMode(false); setSelectedClient(null); }}
              className={`flex-1 py-2.5 rounded-lg border-2 text-sm font-medium transition-all ${!newClientMode ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground"}`}
            >
              عميل موجود
            </button>
            <button
              onClick={() => { setNewClientMode(true); setSelectedClient(null); }}
              className={`flex-1 py-2.5 rounded-lg border-2 text-sm font-medium transition-all ${newClientMode ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground"}`}
            >
              <Plus className="h-3.5 w-3.5 inline ml-1" />
              عميل جديد
            </button>
          </div>

          {/* Existing client search */}
          {!newClientMode && (
            <div className="space-y-3">
              <div className="relative">
                <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  value={clientSearch}
                  onChange={(e) => setClientSearch(e.target.value)}
                  placeholder="ابحث عن عميل بالاسم أو الهاتف..."
                  className="pr-9"
                />
              </div>
              <div className="space-y-2 max-h-72 overflow-y-auto">
                {filteredClients.length === 0 ? (
                  <p className="text-center text-sm text-muted-foreground py-6">لا يوجد عملاء مطابقون</p>
                ) : (
                  filteredClients.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => setSelectedClient(c)}
                      className={`w-full text-right p-3 rounded-lg border-2 transition-all ${selectedClient?.id === c.id ? "border-primary bg-primary/10" : "border-border hover:border-primary/50"}`}
                    >
                      <div className="flex justify-between items-center">
                        <div>
                          <p className="font-medium text-sm">{c.name}</p>
                          {c.phone && <p className="text-xs text-muted-foreground">{c.phone}</p>}
                        </div>
                        <div className="text-left">
                          <Badge variant="outline" className="text-xs">{clientTypeLabels[c.clientType]}</Badge>
                          {Number(c.balance) < 0 && (
                            <p className="text-xs text-destructive mt-0.5">{formatCurrency(Math.abs(Number(c.balance)))} ديون</p>
                          )}
                        </div>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>
          )}

          {/* New client form */}
          {newClientMode && (
            <Card>
              <CardContent className="p-4 space-y-3">
                <div className="space-y-1.5">
                  <Label>اسم العميل *</Label>
                  <Input
                    value={newClientForm.name}
                    onChange={(e) => setNewClientForm((p) => ({ ...p, name: e.target.value }))}
                    placeholder="اسم العميل"
                    autoFocus
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>الهاتف (اختياري)</Label>
                  <Input
                    value={newClientForm.phone}
                    onChange={(e) => setNewClientForm((p) => ({ ...p, phone: e.target.value }))}
                    placeholder="0555123456"
                    type="tel"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>نوع العميل</Label>
                  <Select value={newClientForm.clientType} onValueChange={(v) => setNewClientForm((p) => ({ ...p, clientType: v as ClientType }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="retail">تجزئة</SelectItem>
                      <SelectItem value="half_wholesale">نصف جملة</SelectItem>
                      <SelectItem value="wholesale">جملة</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* STEP 2: PRODUCTS */}
      {step === "products" && (
        <div className="flex-1 overflow-y-auto pb-36">
          {/* Product search */}
          <div className="sticky top-0 bg-background z-10 p-3 border-b">
            <div className="relative">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={productSearch}
                onChange={(e) => setProductSearch(e.target.value)}
                placeholder="ابحث عن منتج..."
                className="pr-9"
              />
              {productSearch && (
                <button onClick={() => setProductSearch("")} className="absolute left-3 top-1/2 -translate-y-1/2">
                  <X className="h-4 w-4 text-muted-foreground" />
                </button>
              )}
            </div>
          </div>

          {/* Product grid */}
          <div className="p-3 grid grid-cols-2 sm:grid-cols-3 gap-3">
            {filteredStock.length === 0 ? (
              <div className="col-span-full text-center py-16 text-muted-foreground">
                <Package className="h-10 w-10 mx-auto mb-2 opacity-30" />
                <p>{productSearch ? "لا توجد نتائج" : "المخزون فارغ"}</p>
              </div>
            ) : (
              filteredStock.map((product) => {
                const unitPrice = getPriceForType(product, clientType);
                const inCart = cart.find((c) => c.productId === product.productId);
                return (
                  <button
                    key={product.productId}
                    onClick={() => openQtyDialog(product)}
                    className={`relative flex flex-col rounded-xl border-2 overflow-hidden text-right transition-all active:scale-95 ${inCart ? "border-primary shadow-md" : "border-border hover:border-primary/50"}`}
                  >
                    {/* Image */}
                    <div className="w-full aspect-square bg-muted flex items-center justify-center overflow-hidden">
                      {product.imageUrl ? (
                        <img src={product.imageUrl} alt={product.productName} className="w-full h-full object-cover" />
                      ) : (
                        <Package className="h-10 w-10 text-muted-foreground/30" />
                      )}
                    </div>
                    {/* Info */}
                    <div className="p-2 bg-card">
                      <p className="text-xs font-semibold leading-tight line-clamp-2">{product.productName}</p>
                      <p className="text-xs text-primary font-bold mt-1">{formatCurrency(unitPrice)}</p>
                      <p className="text-xs text-muted-foreground">المخزون: {product.quantity} {product.unit}</p>
                    </div>
                    {/* Cart badge */}
                    {inCart && (
                      <div className="absolute top-2 left-2 bg-primary text-primary-foreground rounded-full w-6 h-6 flex items-center justify-center text-xs font-bold shadow">
                        {inCart.quantity}
                      </div>
                    )}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* BOTTOM ACTION BAR */}
      {step === "client" && (
        <div className="fixed bottom-0 left-0 right-0 bg-card border-t p-4 z-30">
          {selectedClient && (
            <div className="mb-2 px-3 py-2 bg-primary/10 rounded-lg flex justify-between items-center">
              <span className="text-sm font-medium text-primary">{selectedClient.name}</span>
              <Badge variant="outline" className="text-xs">{clientTypeLabels[selectedClient.clientType]}</Badge>
            </div>
          )}
          <Button
            className="w-full"
            disabled={!canGoToProducts}
            onClick={() => setStep("products")}
          >
            التالي — اختيار المنتجات
          </Button>
        </div>
      )}

      {step === "products" && (
        <div className="fixed bottom-0 left-0 right-0 bg-card border-t shadow-xl z-30">
          <button
            onClick={() => setCartOpen(!cartOpen)}
            className="w-full px-4 py-3 flex items-center justify-between"
          >
            <div className="flex items-center gap-2">
              <ShoppingCart className="h-5 w-5 text-primary" />
              <span className="font-bold text-primary">{formatCurrency(cartTotal)}</span>
              {cartCount > 0 && <Badge>{cartCount} صنف</Badge>}
            </div>
            <div className="flex items-center gap-2">
              {cart.length === 0 && <span className="text-xs text-muted-foreground">السلة فارغة</span>}
              {cartOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
            </div>
          </button>
          {cartOpen && cart.length > 0 && (
            <div className="px-4 pb-2 max-h-52 overflow-y-auto border-t space-y-1.5 pt-2">
              {cart.map((item) => (
                <div key={item.productId} className="flex justify-between items-center gap-2 text-sm">
                  <button onClick={() => removeFromCart(item.productId)} className="text-destructive/60 hover:text-destructive">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                  <span className="flex-1 truncate font-medium">{item.productName}</span>
                  <span className="text-muted-foreground whitespace-nowrap">{item.quantity} × {formatCurrency(item.unitPrice)}</span>
                  <span className="font-bold text-primary whitespace-nowrap">{formatCurrency(item.subtotal)}</span>
                </div>
              ))}
            </div>
          )}
          <div className="px-4 pb-4">
            <Button
              className="w-full"
              size="lg"
              disabled={cart.length === 0 || createInvoice.isPending}
              onClick={handleConfirm}
            >
              {createInvoice.isPending ? (
                "جارٍ الحفظ..."
              ) : (
                <>
                  <CheckCircle className="h-4 w-4 ml-2" />
                  تأكيد الفاتورة — {formatCurrency(cartTotal)}
                </>
              )}
            </Button>
          </div>
        </div>
      )}

      {/* Quantity Input Dialog */}
      <Dialog open={!!qtyDialog} onOpenChange={(open) => { if (!open) { setQtyDialog(null); setQtyInput(""); } }}>
        <DialogContent className="sm:max-w-sm">
          {qtyDialog && (
            <>
              <DialogHeader>
                <DialogTitle className="text-right">{qtyDialog.productName}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div className="flex items-center gap-3">
                  {qtyDialog.imageUrl && (
                    <img src={qtyDialog.imageUrl} alt="" className="w-16 h-16 rounded-lg object-cover border" />
                  )}
                  <div>
                    <p className="font-bold text-primary text-lg">{formatCurrency(getPriceForType(qtyDialog, clientType))}</p>
                    <p className="text-sm text-muted-foreground">المتاح: {qtyDialog.quantity} {qtyDialog.unit}</p>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>الكمية</Label>
                  <Input
                    ref={qtyRef}
                    type="number"
                    min="1"
                    max={qtyDialog.quantity}
                    value={qtyInput}
                    onChange={(e) => setQtyInput(e.target.value)}
                    placeholder={`1 — ${qtyDialog.quantity}`}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        const qty = parseFloat(qtyInput);
                        if (qty > 0) addToCart(qtyDialog, qty);
                      }
                    }}
                    className="text-center text-xl font-bold"
                  />
                  {qtyInput && parseFloat(qtyInput) > 0 && (
                    <p className="text-sm text-center text-muted-foreground">
                      المجموع: <span className="font-bold text-primary">{formatCurrency(getPriceForType(qtyDialog, clientType) * parseFloat(qtyInput))}</span>
                    </p>
                  )}
                </div>
              </div>
              <DialogFooter className="gap-2">
                <Button variant="outline" onClick={() => { setQtyDialog(null); setQtyInput(""); }}>إلغاء</Button>
                <Button
                  disabled={!qtyInput || parseFloat(qtyInput) <= 0 || parseFloat(qtyInput) > qtyDialog.quantity}
                  onClick={() => addToCart(qtyDialog, parseFloat(qtyInput))}
                >
                  إضافة للفاتورة
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
