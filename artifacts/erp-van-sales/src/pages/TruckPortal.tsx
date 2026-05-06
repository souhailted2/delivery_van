import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import {
  useLogout, useGetMyTruckStock, useGetMyTruckClients,
  useGetMyTruckInvoices, useCreateMyTruckClient, useGetMyTruckCash,
  useUpdateMyTruckClient, useGetMyTruckInvoice,
} from "@workspace/api-client-react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import TruckSale from "./TruckSale";
import TruckCash from "./TruckCash";
import {
  Package, Users, FileText, LogOut, Truck, Plus, ShoppingCart,
  Wallet, TrendingUp, AlertTriangle, Phone, CreditCard, Banknote,
  Search, X, ChevronLeft, Pencil, Printer, ArrowRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatCurrency } from "@/lib/utils";

type Tab = "stock" | "clients" | "invoices";
type View = "portal" | "sale" | "cash";

const clientTypeLabels: Record<string, string> = {
  retail: "تجزئة",
  half_wholesale: "نصف جملة",
  wholesale: "جملة",
};
const paymentTypeLabels: Record<string, string> = {
  cash: "نقدي",
  credit: "آجل",
};

/* ─── Invoice Detail + Print ─── */
function InvoiceDetail({ invoiceId, onClose }: { invoiceId: number; onClose: () => void }) {
  const { data, isLoading } = useGetMyTruckInvoice(invoiceId);
  const inv = data as any;

  const handlePrint = () => {
    window.print();
  };

  if (isLoading) {
    return (
      <div className="fixed inset-0 z-50 bg-background flex items-center justify-center" dir="rtl">
        <p className="text-muted-foreground">جارٍ التحميل...</p>
      </div>
    );
  }
  if (!inv) return null;

  const isCash = inv.paymentType === "cash";

  return (
    <div className="fixed inset-0 z-50 bg-background overflow-y-auto" dir="rtl">
      {/* Print-hidden header */}
      <div className="no-print sticky top-0 bg-card border-b px-4 py-3 flex items-center justify-between z-10">
        <button onClick={onClose} className="flex items-center gap-2 text-muted-foreground hover:text-foreground">
          <ArrowRight className="h-5 w-5" />
          <span className="text-sm font-medium">رجوع</span>
        </button>
        <h1 className="text-base font-bold">تفاصيل الفاتورة</h1>
        <Button size="sm" onClick={handlePrint} className="gap-1.5">
          <Printer className="h-4 w-4" />
          طباعة
        </Button>
      </div>

      {/* Printable invoice */}
      <div className="max-w-lg mx-auto p-6 print-area">
        {/* Header */}
        <div className="text-center border-b pb-4 mb-4">
          <div className="flex items-center justify-center gap-2 mb-2">
            <Truck className="h-6 w-6 text-primary" />
            <span className="font-bold text-lg">{inv.truckName}</span>
          </div>
          <h2 className="text-xl font-bold">فاتورة بيع</h2>
          <p className="text-sm text-muted-foreground font-mono mt-1">{inv.invoiceNumber}</p>
        </div>

        {/* Meta */}
        <div className="grid grid-cols-2 gap-2 text-sm mb-4 bg-muted/30 rounded-lg p-3">
          <div>
            <p className="text-muted-foreground text-xs">العميل</p>
            <p className="font-semibold">{inv.clientName || "عميل نقدي"}</p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs">نوع الدفع</p>
            <p className={`font-semibold ${isCash ? "text-emerald-600" : "text-orange-600"}`}>
              {isCash ? "💵 نقدي" : "📋 آجل"}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs">التاريخ</p>
            <p className="font-semibold">{new Date(inv.createdAt).toLocaleDateString("ar-DZ")}</p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs">الوقت</p>
            <p className="font-semibold">{new Date(inv.createdAt).toLocaleTimeString("ar-DZ", { hour: "2-digit", minute: "2-digit" })}</p>
          </div>
        </div>

        {/* Items table */}
        <table className="w-full text-sm mb-4">
          <thead>
            <tr className="border-b border-t">
              <th className="py-2 text-right font-semibold">المنتج</th>
              <th className="py-2 text-center font-semibold">الكمية</th>
              <th className="py-2 text-center font-semibold">السعر</th>
              <th className="py-2 text-left font-semibold">الإجمالي</th>
            </tr>
          </thead>
          <tbody>
            {(inv.items || []).map((item: any) => (
              <tr key={item.id} className="border-b last:border-0">
                <td className="py-2.5">
                  <p className="font-medium">{item.productName}</p>
                  <p className="text-xs text-muted-foreground">{clientTypeLabels[item.priceType] || item.priceType}</p>
                </td>
                <td className="py-2.5 text-center">{item.quantity}</td>
                <td className="py-2.5 text-center">{formatCurrency(item.unitPrice)}</td>
                <td className="py-2.5 text-left font-semibold">{formatCurrency(item.subtotal)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Total */}
        <div className="border-t pt-3 space-y-1">
          <div className="flex justify-between text-base font-bold">
            <span>المجموع الكلي</span>
            <span className="text-primary text-lg">{formatCurrency(inv.totalAmount)}</span>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-8 text-center text-xs text-muted-foreground border-t pt-4">
          <p>شكراً لتعاملكم معنا</p>
        </div>
      </div>

      {/* Print styles */}
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white; }
          .print-area { max-width: 100%; margin: 0; padding: 1rem; }
        }
      `}</style>
    </div>
  );
}

/* ─── Main Component ─── */
export default function TruckPortal() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const logout = useLogout();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<Tab>("stock");
  const [view, setView] = useState<View>("portal");
  const [stockSearch, setStockSearch] = useState("");
  const [clientSearch, setClientSearch] = useState("");

  // Invoice detail state
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<number | null>(null);

  const { data: stockData, isLoading: stockLoading } = useGetMyTruckStock();
  const { data: clientsData, isLoading: clientsLoading } = useGetMyTruckClients();
  const { data: cashData } = useGetMyTruckCash();
  const { data: invoicesData, isLoading: invoicesLoading } = useGetMyTruckInvoices();

  const stock = Array.isArray(stockData) ? stockData : [];
  const clients = Array.isArray(clientsData) ? clientsData : [];
  const invoices = Array.isArray(invoicesData) ? invoicesData : [];

  // Add client
  const [addClientOpen, setAddClientOpen] = useState(false);
  const [clientForm, setClientForm] = useState({ name: "", phone: "", clientType: "retail" });

  // Edit client
  const [editClientOpen, setEditClientOpen] = useState(false);
  const [editClientId, setEditClientId] = useState<number | null>(null);
  const [editClientForm, setEditClientForm] = useState({ name: "", phone: "", clientType: "retail" });

  const createClient = useCreateMyTruckClient({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["/api/trucks/me/clients"] });
        toast.success("تمت إضافة العميل بنجاح");
        setClientForm({ name: "", phone: "", clientType: "retail" });
        setAddClientOpen(false);
      },
      onError: () => toast.error("حدث خطأ أثناء الإضافة"),
    },
  });

  const updateClient = useUpdateMyTruckClient({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["/api/trucks/me/clients"] });
        toast.success("تم تحديث بيانات العميل");
        setEditClientOpen(false);
        setEditClientId(null);
      },
      onError: () => toast.error("حدث خطأ أثناء التعديل"),
    },
  });

  const openEditClient = (c: any) => {
    setEditClientId(c.id);
    setEditClientForm({ name: c.name, phone: c.phone || "", clientType: c.clientType });
    setEditClientOpen(true);
  };

  const handleLogout = () =>
    logout.mutate(undefined, { onSuccess: () => setLocation("/connexion") });

  const cashInfo = cashData as any;
  const cashBalance = cashInfo?.cashBalance ?? null;
  const totalSales = invoices.reduce((s, i) => s + Number(i.totalAmount), 0);
  const todaySales = invoices
    .filter((i) => new Date(i.createdAt).toDateString() === new Date().toDateString())
    .reduce((s, i) => s + Number(i.totalAmount), 0);
  const lowStockCount = stock.filter((s) => s.quantity > 0 && s.quantity <= 5).length;
  const outOfStockCount = stock.filter((s) => s.quantity === 0).length;

  const filteredStock = stockSearch.trim()
    ? stock.filter((s) => s.productName.toLowerCase().includes(stockSearch.toLowerCase()))
    : stock;

  const filteredClients = clientSearch.trim()
    ? clients.filter((c) =>
        c.name.toLowerCase().includes(clientSearch.toLowerCase()) ||
        (c.phone ?? "").includes(clientSearch)
      )
    : clients;

  if (view === "sale") return <TruckSale onBack={() => setView("portal")} />;
  if (view === "cash") return <TruckCash onBack={() => setView("portal")} />;
  if (selectedInvoiceId !== null) return <InvoiceDetail invoiceId={selectedInvoiceId} onClose={() => setSelectedInvoiceId(null)} />;

  const tabs = [
    { key: "stock" as Tab,   label: "المخزون",  icon: Package },
    { key: "clients" as Tab, label: "العملاء",  icon: Users },
    { key: "invoices" as Tab,label: "الفواتير", icon: FileText },
  ];

  return (
    <div className="min-h-screen bg-muted/30 flex flex-col" dir="rtl">

      {/* ─── HEADER ─── */}
      <header className="bg-primary text-primary-foreground px-4 pt-5 pb-14">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 bg-white/20 rounded-full flex items-center justify-center">
              <Truck className="h-5 w-5" />
            </div>
            <div>
              <p className="font-bold text-base leading-tight">{user?.fullName || user?.username}</p>
              <p className="text-xs opacity-70">{user?.username} · حساب شاحنة</p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="flex items-center gap-1.5 bg-white/10 hover:bg-white/20 transition-colors rounded-lg px-3 py-1.5 text-xs font-medium"
          >
            <LogOut className="h-3.5 w-3.5" />
            خروج
          </button>
        </div>
      </header>

      {/* ─── STATS CARDS ─── */}
      <div className="px-4 -mt-10 z-10 relative">
        <div className="grid grid-cols-3 gap-2">
          <button
            onClick={() => setView("cash")}
            className="col-span-3 bg-white dark:bg-card rounded-xl shadow-sm border p-4 flex items-center justify-between hover:shadow-md transition-shadow"
          >
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 bg-emerald-100 dark:bg-emerald-900/30 rounded-lg flex items-center justify-center">
                <Wallet className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div className="text-right">
                <p className="text-xs text-muted-foreground">رصيد الشاحنة</p>
                <p className="font-bold text-lg text-emerald-700 dark:text-emerald-400 leading-tight">
                  {cashBalance !== null ? formatCurrency(cashBalance) : "—"}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1 text-muted-foreground">
              <span className="text-xs">تفاصيل</span>
              <ChevronLeft className="h-4 w-4" />
            </div>
          </button>

          <div className="bg-white dark:bg-card rounded-xl shadow-sm border p-3">
            <div className="h-8 w-8 bg-blue-100 dark:bg-blue-900/30 rounded-lg flex items-center justify-center mb-2">
              <TrendingUp className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            </div>
            <p className="text-xs text-muted-foreground leading-tight">مبيعات اليوم</p>
            <p className="font-bold text-sm mt-0.5">{formatCurrency(todaySales)}</p>
          </div>

          <div className="bg-white dark:bg-card rounded-xl shadow-sm border p-3">
            <div className="h-8 w-8 bg-purple-100 dark:bg-purple-900/30 rounded-lg flex items-center justify-center mb-2">
              <FileText className="h-4 w-4 text-purple-600 dark:text-purple-400" />
            </div>
            <p className="text-xs text-muted-foreground leading-tight">إجمالي الفواتير</p>
            <p className="font-bold text-sm mt-0.5">{invoices.length}</p>
          </div>

          <div className="bg-white dark:bg-card rounded-xl shadow-sm border p-3">
            <div className={`h-8 w-8 rounded-lg flex items-center justify-center mb-2 ${outOfStockCount > 0 ? "bg-red-100 dark:bg-red-900/30" : lowStockCount > 0 ? "bg-amber-100 dark:bg-amber-900/30" : "bg-green-100 dark:bg-green-900/30"}`}>
              <AlertTriangle className={`h-4 w-4 ${outOfStockCount > 0 ? "text-red-600" : lowStockCount > 0 ? "text-amber-600" : "text-green-600"}`} />
            </div>
            <p className="text-xs text-muted-foreground leading-tight">تنبيهات المخزون</p>
            <p className={`font-bold text-sm mt-0.5 ${outOfStockCount > 0 ? "text-red-600" : lowStockCount > 0 ? "text-amber-600" : "text-green-600"}`}>
              {outOfStockCount + lowStockCount === 0 ? "جيد" : `${outOfStockCount + lowStockCount} منتج`}
            </p>
          </div>
        </div>
      </div>

      {/* ─── TAB BAR ─── */}
      <div className="flex bg-white dark:bg-card border-b mt-4 px-2 sticky top-0 z-20 shadow-sm">
        {tabs.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={`flex-1 flex flex-col items-center gap-0.5 py-2.5 text-xs font-medium transition-colors border-b-2 ${
              activeTab === key
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </div>

      {/* ─── CONTENT ─── */}
      <main className="flex-1 overflow-y-auto pb-28">

        {/* ── STOCK TAB ── */}
        {activeTab === "stock" && (
          <div className="p-4 space-y-3">
            <div className="relative">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input value={stockSearch} onChange={(e) => setStockSearch(e.target.value)}
                placeholder="ابحث عن منتج..." className="pr-9 pl-9 bg-white dark:bg-card" />
              {stockSearch && (
                <button onClick={() => setStockSearch("")} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
            <div className="flex gap-2 text-xs">
              <span className="bg-white dark:bg-card border rounded-full px-3 py-1 text-muted-foreground">{stock.length} منتج</span>
              {outOfStockCount > 0 && <span className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 rounded-full px-3 py-1">{outOfStockCount} نفد</span>}
              {lowStockCount > 0 && <span className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-400 rounded-full px-3 py-1">{lowStockCount} يوشك</span>}
            </div>
            {stockLoading ? (
              <div className="text-center py-10 text-muted-foreground text-sm">جارٍ التحميل...</div>
            ) : filteredStock.length === 0 ? (
              <div className="text-center py-10 text-muted-foreground text-sm">{stockSearch ? "لا توجد نتائج" : "لا يوجد مخزون في الشاحنة"}</div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                {filteredStock.map((s) => {
                  const status = s.quantity === 0 ? "out" : s.quantity <= 5 ? "low" : "ok";
                  return (
                    <div key={s.productId} className="bg-white dark:bg-card rounded-xl border shadow-sm overflow-hidden">
                      <div className="h-24 bg-muted/40 relative">
                        {(s as any).imageUrl ? (
                          <img src={(s as any).imageUrl} alt={s.productName} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <Package className="h-8 w-8 text-muted-foreground/20" />
                          </div>
                        )}
                        <div className={`absolute top-2 left-2 text-xs font-bold px-2 py-0.5 rounded-full ${status === "out" ? "bg-red-600 text-white" : status === "low" ? "bg-amber-500 text-white" : "bg-emerald-600 text-white"}`}>
                          {s.quantity}
                        </div>
                      </div>
                      <div className="p-2.5">
                        <p className="font-semibold text-sm leading-tight truncate">{s.productName}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{s.unit}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ── CLIENTS TAB ── */}
        {activeTab === "clients" && (
          <div className="p-4 space-y-3">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input value={clientSearch} onChange={(e) => setClientSearch(e.target.value)}
                  placeholder="ابحث بالاسم أو الهاتف..." className="pr-9 bg-white dark:bg-card" />
                {clientSearch && (
                  <button onClick={() => setClientSearch("")} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
              <Button size="sm" onClick={() => setAddClientOpen(true)} className="shrink-0">
                <Plus className="h-4 w-4" />
              </Button>
            </div>

            {/* Add Client Dialog */}
            <Dialog open={addClientOpen} onOpenChange={setAddClientOpen}>
              <DialogContent className="sm:max-w-md">
                <DialogHeader><DialogTitle>إضافة عميل جديد</DialogTitle></DialogHeader>
                <form onSubmit={(e) => { e.preventDefault(); if (!clientForm.name.trim()) return; createClient.mutate({ data: { name: clientForm.name.trim(), phone: clientForm.phone || undefined, clientType: clientForm.clientType as any } }); }} className="space-y-4">
                  <div className="space-y-2">
                    <Label>الاسم *</Label>
                    <Input value={clientForm.name} onChange={(e) => setClientForm(p => ({ ...p, name: e.target.value }))} placeholder="اسم العميل" required autoFocus />
                  </div>
                  <div className="space-y-2">
                    <Label>الهاتف</Label>
                    <Input value={clientForm.phone} onChange={(e) => setClientForm(p => ({ ...p, phone: e.target.value }))} placeholder="0555123456" />
                  </div>
                  <div className="space-y-2">
                    <Label>نوع العميل</Label>
                    <Select value={clientForm.clientType} onValueChange={(v) => setClientForm(p => ({ ...p, clientType: v }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="retail">تجزئة</SelectItem>
                        <SelectItem value="half_wholesale">نصف جملة</SelectItem>
                        <SelectItem value="wholesale">جملة</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <DialogFooter>
                    <Button type="button" variant="outline" onClick={() => setAddClientOpen(false)}>إلغاء</Button>
                    <Button type="submit" disabled={createClient.isPending}>{createClient.isPending ? "جارٍ الحفظ..." : "حفظ"}</Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>

            {/* Edit Client Dialog */}
            <Dialog open={editClientOpen} onOpenChange={setEditClientOpen}>
              <DialogContent className="sm:max-w-md">
                <DialogHeader><DialogTitle>تعديل بيانات العميل</DialogTitle></DialogHeader>
                <form onSubmit={(e) => {
                  e.preventDefault();
                  if (!editClientId || !editClientForm.name.trim()) return;
                  updateClient.mutate({ id: editClientId, data: { name: editClientForm.name.trim(), phone: editClientForm.phone || undefined, clientType: editClientForm.clientType as any } });
                }} className="space-y-4">
                  <div className="space-y-2">
                    <Label>الاسم *</Label>
                    <Input value={editClientForm.name} onChange={(e) => setEditClientForm(p => ({ ...p, name: e.target.value }))} placeholder="اسم العميل" required autoFocus />
                  </div>
                  <div className="space-y-2">
                    <Label>الهاتف</Label>
                    <Input value={editClientForm.phone} onChange={(e) => setEditClientForm(p => ({ ...p, phone: e.target.value }))} placeholder="0555123456" />
                  </div>
                  <div className="space-y-2">
                    <Label>نوع العميل</Label>
                    <Select value={editClientForm.clientType} onValueChange={(v) => setEditClientForm(p => ({ ...p, clientType: v }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="retail">تجزئة</SelectItem>
                        <SelectItem value="half_wholesale">نصف جملة</SelectItem>
                        <SelectItem value="wholesale">جملة</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <DialogFooter>
                    <Button type="button" variant="outline" onClick={() => setEditClientOpen(false)}>إلغاء</Button>
                    <Button type="submit" disabled={updateClient.isPending}>{updateClient.isPending ? "جارٍ الحفظ..." : "حفظ التعديل"}</Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>

            {clientsLoading ? (
              <div className="text-center py-10 text-muted-foreground text-sm">جارٍ التحميل...</div>
            ) : filteredClients.length === 0 ? (
              <div className="text-center py-10 text-muted-foreground text-sm">{clientSearch ? "لا توجد نتائج" : "لا يوجد عملاء بعد"}</div>
            ) : (
              <div className="space-y-2">
                {filteredClients.map((c) => {
                  const balance = Number(c.balance);
                  return (
                    <div key={c.id} className="bg-white dark:bg-card rounded-xl border shadow-sm p-4 flex items-center gap-3">
                      <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                        <span className="text-primary font-bold text-sm">{c.name.charAt(0)}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm truncate">{c.name}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          {c.phone && (
                            <span className="flex items-center gap-0.5 text-xs text-muted-foreground">
                              <Phone className="h-3 w-3" />{c.phone}
                            </span>
                          )}
                          <Badge variant="outline" className="text-xs py-0 h-4">
                            {clientTypeLabels[c.clientType] || c.clientType}
                          </Badge>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className={`text-sm font-bold ${balance < 0 ? "text-red-600" : balance > 0 ? "text-amber-600" : "text-muted-foreground"}`}>
                          {formatCurrency(balance)}
                        </span>
                        <button
                          onClick={() => openEditClient(c)}
                          className="h-7 w-7 rounded-lg border flex items-center justify-center text-muted-foreground hover:text-primary hover:border-primary transition-colors"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ── INVOICES TAB ── */}
        {activeTab === "invoices" && (
          <div className="p-4 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-white dark:bg-card rounded-xl border shadow-sm p-3">
                <p className="text-xs text-muted-foreground">مبيعات اليوم</p>
                <p className="font-bold text-base text-primary mt-0.5">{formatCurrency(todaySales)}</p>
              </div>
              <div className="bg-white dark:bg-card rounded-xl border shadow-sm p-3">
                <p className="text-xs text-muted-foreground">إجمالي المبيعات</p>
                <p className="font-bold text-base mt-0.5">{formatCurrency(totalSales)}</p>
              </div>
            </div>

            {invoicesLoading ? (
              <div className="text-center py-10 text-muted-foreground text-sm">جارٍ التحميل...</div>
            ) : invoices.length === 0 ? (
              <div className="text-center py-10 text-muted-foreground text-sm">لا توجد فواتير بعد</div>
            ) : (
              <div className="space-y-2">
                {[...invoices].reverse().map((inv) => {
                  const isCash = inv.paymentType === "cash";
                  const isToday = new Date(inv.createdAt).toDateString() === new Date().toDateString();
                  return (
                    <button
                      key={inv.id}
                      onClick={() => setSelectedInvoiceId(inv.id)}
                      className="w-full bg-white dark:bg-card rounded-xl border shadow-sm p-4 text-right hover:shadow-md transition-shadow"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-3">
                          <div className={`h-9 w-9 rounded-lg flex items-center justify-center shrink-0 ${isCash ? "bg-emerald-100 dark:bg-emerald-900/30" : "bg-orange-100 dark:bg-orange-900/30"}`}>
                            {isCash
                              ? <Banknote className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                              : <CreditCard className="h-4 w-4 text-orange-600 dark:text-orange-400" />}
                          </div>
                          <div className="text-right">
                            <p className="font-semibold text-sm">{inv.clientName || "عميل نقدي"}</p>
                            <p className="text-xs text-muted-foreground font-mono">{inv.invoiceNumber}</p>
                          </div>
                        </div>
                        <div className="text-left shrink-0">
                          <p className="font-bold text-base">{formatCurrency(Number(inv.totalAmount))}</p>
                          <div className="flex items-center gap-1.5 justify-end mt-0.5">
                            {isToday && <span className="text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded-full font-medium">اليوم</span>}
                            <span className="text-xs text-muted-foreground">{new Date(inv.createdAt).toLocaleDateString("ar-DZ")}</span>
                          </div>
                        </div>
                      </div>
                      <div className="mt-2 flex items-center gap-1 text-xs text-muted-foreground justify-end">
                        <Printer className="h-3 w-3" />
                        <span>عرض وطباعة</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </main>

      {/* ─── FLOATING SELL BUTTON ─── */}
      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-30">
        <button
          onClick={() => setView("sale")}
          className="flex items-center gap-2.5 bg-primary text-primary-foreground px-8 py-3.5 rounded-full shadow-xl font-bold text-base hover:bg-primary/90 active:scale-95 transition-all"
        >
          <ShoppingCart className="h-5 w-5" />
          بيع جديد
        </button>
      </div>
    </div>
  );
}
