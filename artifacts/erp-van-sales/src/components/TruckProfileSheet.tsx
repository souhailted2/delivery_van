import { useState } from "react";
import {
  useGetTruckProfile,
  useListTruckCommissionPayments,
  useCreateTruckCommissionPayment,
  useUpdateTruckCommissionPayment,
  useDeleteTruckCommissionPayment,
  useUpdateTruck,
} from "@workspace/api-client-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { formatCurrency } from "@/lib/utils";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Users, Package, TrendingUp, Phone, Truck, Check, X, Send } from "lucide-react";
import { TruckDispatchPanel } from "@/components/TruckDispatchPanel";

type TruckInfo = {
  id: number;
  name: string;
  plateNumber?: string | null;
  phone?: string | null;
  driverName?: string | null;
  cashBalance: number;
};

type PaymentForm = { amount: string; note: string; paidAt: string };
const emptyPaymentForm: PaymentForm = {
  amount: "",
  note: "",
  paidAt: new Date().toISOString().slice(0, 10),
};

function StatCard({ label, value, color }: { label: string; value: number; color: "emerald" | "blue" | "amber" }) {
  const colorMap = {
    emerald: "bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400",
    blue: "bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-400",
    amber: "bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-400",
  };
  return (
    <div className={`rounded-lg border p-3 text-center ${colorMap[color]}`}>
      <p className="text-xs text-muted-foreground mb-1">{label}</p>
      <p className={`font-bold text-sm ${colorMap[color].split(" ").slice(-2).join(" ")}`}>{formatCurrency(value)}</p>
    </div>
  );
}

function CommissionsTab({ truckId }: { truckId: number }) {
  const queryClient = useQueryClient();
  const { data: profileData } = useGetTruckProfile(truckId);
  const { data: paymentsData, isLoading } = useListTruckCommissionPayments(truckId);
  const payments = Array.isArray(paymentsData) ? paymentsData : [];

  const profile = profileData as { commissionTotal: number; commissionPaid: number; commissionBalance: number } | undefined;

  const [addOpen, setAddOpen] = useState(false);
  const [addForm, setAddForm] = useState<PaymentForm>(emptyPaymentForm);

  const [editOpen, setEditOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<PaymentForm>(emptyPaymentForm);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: [`/api/trucks/${truckId}/commission-payments`] });
    queryClient.invalidateQueries({ queryKey: [`/api/trucks/${truckId}/profile`] });
  };

  const createPayment = useCreateTruckCommissionPayment({
    mutation: {
      onSuccess: () => { invalidate(); toast.success("تمت إضافة الدفعة"); setAddOpen(false); setAddForm(emptyPaymentForm); },
      onError: () => toast.error("حدث خطأ"),
    },
  });

  const updatePayment = useUpdateTruckCommissionPayment({
    mutation: {
      onSuccess: () => { invalidate(); toast.success("تم تعديل الدفعة"); setEditOpen(false); setEditId(null); },
      onError: () => toast.error("حدث خطأ"),
    },
  });

  const deletePayment = useDeleteTruckCommissionPayment({
    mutation: {
      onSuccess: () => { invalidate(); toast.success("تم حذف الدفعة"); },
      onError: () => toast.error("حدث خطأ"),
    },
  });

  const openEdit = (p: { id: number; amount: number; note?: string | null; paidAt: string }) => {
    setEditId(p.id);
    setEditForm({
      amount: String(p.amount),
      note: p.note ?? "",
      paidAt: new Date(p.paidAt).toISOString().slice(0, 10),
    });
    setEditOpen(true);
  };

  const buildBody = (f: PaymentForm) => ({
    amount: parseFloat(f.amount),
    note: f.note.trim() || null,
    paidAt: new Date(f.paidAt).toISOString(),
  });

  return (
    <div className="space-y-4">
      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-3">
        <StatCard label="إجمالي العمولات" value={profile?.commissionTotal ?? 0} color="emerald" />
        <StatCard label="المدفوع" value={profile?.commissionPaid ?? 0} color="blue" />
        <StatCard label="المتبقي" value={profile?.commissionBalance ?? 0} color="amber" />
      </div>

      {/* Add payment */}
      <div className="flex justify-between items-center">
        <p className="text-sm font-semibold">سجل المدفوعات</p>
        <Button size="sm" onClick={() => setAddOpen(true)}>
          <Plus className="h-3.5 w-3.5 ml-1" /> إضافة دفعة
        </Button>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground text-center py-6">جارٍ التحميل...</p>
      ) : payments.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-6">لا توجد مدفوعات مسجّلة</p>
      ) : (
        <div className="rounded-lg border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>التاريخ</TableHead>
                <TableHead>المبلغ</TableHead>
                <TableHead>ملاحظة</TableHead>
                <TableHead className="text-center">إجراءات</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {payments.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                    {new Date(p.paidAt).toLocaleDateString("ar-DZ")}
                  </TableCell>
                  <TableCell className="font-bold text-emerald-700 dark:text-emerald-400">
                    {formatCurrency(p.amount)}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{p.note || "—"}</TableCell>
                  <TableCell className="text-center">
                    <div className="flex justify-center gap-1">
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => openEdit(p as any)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="sm" variant="ghost"
                        className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                        onClick={() => {
                          if (confirm("هل أنت متأكد من حذف هذه الدفعة؟")) {
                            deletePayment.mutate({ id: truckId, paymentId: p.id });
                          }
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Add Dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent dir="rtl" className="sm:max-w-sm">
          <DialogHeader><DialogTitle>إضافة دفعة عمولة</DialogTitle></DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!addForm.amount || parseFloat(addForm.amount) <= 0) return;
              createPayment.mutate({ id: truckId, data: buildBody(addForm) });
            }}
            className="space-y-4"
          >
            <div className="space-y-2">
              <Label>المبلغ (دج) *</Label>
              <Input
                type="number" min="0" step="0.01"
                value={addForm.amount}
                onChange={(e) => setAddForm(p => ({ ...p, amount: e.target.value }))}
                placeholder="0.00" autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label>التاريخ</Label>
              <Input
                type="date"
                value={addForm.paidAt}
                onChange={(e) => setAddForm(p => ({ ...p, paidAt: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>ملاحظة</Label>
              <Input
                value={addForm.note}
                onChange={(e) => setAddForm(p => ({ ...p, note: e.target.value }))}
                placeholder="اختياري"
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setAddOpen(false)}>إلغاء</Button>
              <Button type="submit" disabled={createPayment.isPending}>
                {createPayment.isPending ? "جارٍ الحفظ..." : "حفظ"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent dir="rtl" className="sm:max-w-sm">
          <DialogHeader><DialogTitle>تعديل الدفعة</DialogTitle></DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!editId || !editForm.amount || parseFloat(editForm.amount) <= 0) return;
              updatePayment.mutate({ id: truckId, paymentId: editId, data: buildBody(editForm) });
            }}
            className="space-y-4"
          >
            <div className="space-y-2">
              <Label>المبلغ (دج) *</Label>
              <Input
                type="number" min="0" step="0.01"
                value={editForm.amount}
                onChange={(e) => setEditForm(p => ({ ...p, amount: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>التاريخ</Label>
              <Input
                type="date"
                value={editForm.paidAt}
                onChange={(e) => setEditForm(p => ({ ...p, paidAt: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>ملاحظة</Label>
              <Input
                value={editForm.note}
                onChange={(e) => setEditForm(p => ({ ...p, note: e.target.value }))}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditOpen(false)}>إلغاء</Button>
              <Button type="submit" disabled={updatePayment.isPending}>
                {updatePayment.isPending ? "جارٍ الحفظ..." : "حفظ التعديل"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function TruckProfileContent({ truck }: { truck: TruckInfo }) {
  const queryClient = useQueryClient();
  const { data: profileData, isLoading } = useGetTruckProfile(truck.id);
  const updateTruck = useUpdateTruck();

  const [phoneValue, setPhoneValue] = useState(truck.phone ?? "");
  const [isEditingPhone, setIsEditingPhone] = useState(false);

  const handleSavePhone = () => {
    updateTruck.mutate(
      { id: truck.id, data: { name: truck.name, phone: phoneValue || null } },
      {
        onSuccess: () => {
          setIsEditingPhone(false);
          queryClient.invalidateQueries({ queryKey: ["/api/trucks"] });
          toast.success("تم حفظ رقم الهاتف");
        },
        onError: () => toast.error("حدث خطأ أثناء الحفظ"),
      }
    );
  };

  const handleCancelPhone = () => {
    setPhoneValue(truck.phone ?? "");
    setIsEditingPhone(false);
  };

  const profile = profileData as {
    clients: { id: number; name: string; phone?: string | null }[];
    stock: { productId: number; productName: string; quantity: number }[];
    commissionTotal: number;
    commissionPaid: number;
    commissionBalance: number;
  } | undefined;

  return (
    <>
      <SheetHeader className="pb-4 border-b">
        <SheetTitle className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
            <Truck className="h-5 w-5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-lg font-bold">{truck.name}</p>
            <div className="flex items-center gap-3 text-sm text-muted-foreground font-normal flex-wrap">
              {truck.plateNumber && <span>{truck.plateNumber}</span>}
              {/* Inline phone edit */}
              <span className="flex items-center gap-1">
                <Phone className="h-3.5 w-3.5 shrink-0" />
                {isEditingPhone ? (
                  <span className="flex items-center gap-1">
                    <Input
                      value={phoneValue}
                      onChange={(e) => setPhoneValue(e.target.value)}
                      className="h-6 w-36 text-xs px-1 py-0"
                      placeholder="رقم الهاتف"
                      onKeyDown={(e) => { if (e.key === "Enter") handleSavePhone(); if (e.key === "Escape") handleCancelPhone(); }}
                      autoFocus
                    />
                    <Button size="icon" variant="ghost" className="h-5 w-5" onClick={handleSavePhone} disabled={updateTruck.isPending}>
                      <Check className="h-3 w-3 text-green-600" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-5 w-5" onClick={handleCancelPhone}>
                      <X className="h-3 w-3 text-red-500" />
                    </Button>
                  </span>
                ) : (
                  <button
                    className="flex items-center gap-1 hover:text-foreground transition-colors group"
                    onClick={() => setIsEditingPhone(true)}
                    title="تعديل رقم الهاتف"
                  >
                    <span>{phoneValue || "إضافة هاتف"}</span>
                    <Pencil className="h-3 w-3 opacity-0 group-hover:opacity-60 transition-opacity" />
                  </button>
                )}
              </span>
              {truck.driverName && <span>السائق: {truck.driverName}</span>}
            </div>
          </div>
        </SheetTitle>
      </SheetHeader>

      {isLoading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground text-sm">
          جارٍ التحميل...
        </div>
      ) : (
        <Tabs defaultValue="dispatch" className="mt-4">
          <TabsList className="w-full grid grid-cols-4">
            <TabsTrigger value="dispatch" className="gap-1.5">
              <Send className="h-4 w-4" /> تحميل
            </TabsTrigger>
            <TabsTrigger value="commissions" className="gap-1.5">
              <TrendingUp className="h-4 w-4" /> العمولات
            </TabsTrigger>
            <TabsTrigger value="stock" className="gap-1.5">
              <Package className="h-4 w-4" /> البضاعة
            </TabsTrigger>
            <TabsTrigger value="clients" className="gap-1.5">
              <Users className="h-4 w-4" /> العملاء
            </TabsTrigger>
          </TabsList>

          {/* Dispatch Tab */}
          <TabsContent value="dispatch" className="mt-4">
            <TruckDispatchPanel truck={truck} />
          </TabsContent>

          {/* Commissions Tab */}
          <TabsContent value="commissions" className="mt-4">
            <CommissionsTab truckId={truck.id} />
          </TabsContent>

          {/* Stock Tab */}
          <TabsContent value="stock" className="mt-4">
            {!profile?.stock?.length ? (
              <p className="text-sm text-muted-foreground text-center py-8">لا توجد بضاعة في الشاحنة حالياً</p>
            ) : (
              <div className="rounded-lg border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>المنتج</TableHead>
                      <TableHead className="text-left">الكمية</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {profile.stock.map((s) => (
                      <TableRow key={s.productId}>
                        <TableCell className="font-medium">{s.productName}</TableCell>
                        <TableCell className="text-left font-bold text-blue-700 dark:text-blue-400">
                          {s.quantity % 1 === 0 ? s.quantity : s.quantity.toFixed(3)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </TabsContent>

          {/* Clients Tab */}
          <TabsContent value="clients" className="mt-4">
            {!profile?.clients?.length ? (
              <p className="text-sm text-muted-foreground text-center py-8">لا توجد عملاء لهذه الشاحنة بعد</p>
            ) : (
              <div className="rounded-lg border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>اسم العميل</TableHead>
                      <TableHead>رقم الهاتف</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {profile.clients.map((c) => (
                      <TableRow key={c.id}>
                        <TableCell className="font-medium">{c.name}</TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          {c.phone ? (
                            <span className="flex items-center gap-1">
                              <Phone className="h-3.5 w-3.5" />
                              {c.phone}
                            </span>
                          ) : "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </TabsContent>
        </Tabs>
      )}
    </>
  );
}

export function TruckProfileSheet({
  truck,
  open,
  onClose,
}: {
  truck: TruckInfo | null;
  open: boolean;
  onClose: () => void;
}) {
  return (
    <Sheet open={open} onOpenChange={onClose}>
      <SheetContent side="left" className="w-full sm:max-w-2xl overflow-y-auto" dir="rtl">
        {truck && <TruckProfileContent truck={truck} />}
      </SheetContent>
    </Sheet>
  );
}
