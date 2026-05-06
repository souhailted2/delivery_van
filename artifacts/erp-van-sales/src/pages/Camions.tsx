import { useState } from "react";
import { useListTrucks, useCreateTruck, useUpdateTruck, useListCashTransfers } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatCurrency } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Plus, Pencil, Search, X, Eye, EyeOff, Wallet } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

type Truck = {
  id: number; name: string; plateNumber?: string | null;
  driverName?: string | null; location?: string | null;
  cashBalance: number;
};
type TruckForm = {
  name: string; plateNumber: string;
  driverName: string; password: string; location: string;
};
const emptyForm: TruckForm = { name: "", plateNumber: "", driverName: "", password: "", location: "" };

function TruckFormFields({
  form, onChange, isEdit = false,
}: {
  form: TruckForm;
  onChange: (field: keyof TruckForm, value: string) => void;
  isEdit?: boolean;
}) {
  const [showPassword, setShowPassword] = useState(false);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>اسم الشاحنة *</Label>
          <Input value={form.name} onChange={(e) => onChange("name", e.target.value)}
            placeholder="مثال: شاحنة 1" required autoFocus />
        </div>
        <div className="space-y-2">
          <Label>رقم اللوحة</Label>
          <Input value={form.plateNumber} onChange={(e) => onChange("plateNumber", e.target.value)}
            placeholder="16 AR 1234" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>اسم السائق</Label>
          <Input value={form.driverName} onChange={(e) => onChange("driverName", e.target.value)}
            placeholder="اسم السائق / صاحب الشاحنة" />
        </div>
        <div className="space-y-2">
          <Label>{isEdit ? "كلمة مرور جديدة (اتركها فارغة للإبقاء)" : "كلمة المرور"}</Label>
          <div className="relative">
            <Input
              type={showPassword ? "text" : "password"}
              value={form.password}
              onChange={(e) => onChange("password", e.target.value)}
              placeholder={isEdit ? "اتركها فارغة" : "كلمة مرور الشاحنة"}
              className="pl-9"
            />
            <button type="button" onClick={() => setShowPassword(p => !p)}
              className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>
      </div>
      <div className="space-y-2">
        <Label>الموقع (نص أو إحداثيات GPS)</Label>
        <Input value={form.location} onChange={(e) => onChange("location", e.target.value)}
          placeholder="مثال: حي النصر، قسنطينة  أو  36.3636, 6.6150" />
      </div>
    </div>
  );
}

function TruckBalanceDialog({ truck, open, onClose }: { truck: Truck | null; open: boolean; onClose: () => void }) {
  const { data: transfersData } = useListCashTransfers();
  const allTransfers = Array.isArray(transfersData) ? transfersData : [];
  const transfers = truck ? allTransfers.filter((t) => (t as any).truckId === truck.id) : [];

  if (!truck) return null;

  const pending  = transfers.filter(t => t.status === "pending").reduce((s, t) => s + t.amount, 0);
  const approved = transfers.filter(t => t.status === "approved").reduce((s, t) => s + t.amount, 0);

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-lg" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wallet className="h-5 w-5 text-emerald-600" />
            رصيد — {truck.name}
          </DialogTitle>
        </DialogHeader>

        {/* Balance cards */}
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-lg bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 p-3 text-center">
            <p className="text-xs text-muted-foreground mb-1">الرصيد الحالي</p>
            <p className="font-bold text-emerald-700 dark:text-emerald-400 text-sm">{formatCurrency(truck.cashBalance)}</p>
          </div>
          <div className="rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 p-3 text-center">
            <p className="text-xs text-muted-foreground mb-1">قيد الانتظار</p>
            <p className="font-bold text-amber-700 dark:text-amber-400 text-sm">{formatCurrency(pending)}</p>
          </div>
          <div className="rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 p-3 text-center">
            <p className="text-xs text-muted-foreground mb-1">محوّل للإدارة</p>
            <p className="font-bold text-blue-700 dark:text-blue-400 text-sm">{formatCurrency(approved)}</p>
          </div>
        </div>

        {/* Transfers history */}
        <div className="mt-2">
          <p className="text-sm font-semibold mb-2">سجل التحويلات</p>
          {transfers.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">لا توجد تحويلات لهذه الشاحنة</p>
          ) : (
            <div className="rounded-lg border overflow-hidden max-h-64 overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>التاريخ</TableHead>
                    <TableHead>المبلغ</TableHead>
                    <TableHead>الحالة</TableHead>
                    <TableHead>ملاحظة</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {[...transfers].reverse().map((t) => (
                    <TableRow key={t.id}>
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                        {new Date(t.createdAt).toLocaleDateString("ar-DZ")}
                      </TableCell>
                      <TableCell className="font-bold text-sm">{formatCurrency(t.amount)}</TableCell>
                      <TableCell>
                        <Badge variant={t.status === "approved" ? "default" : t.status === "rejected" ? "destructive" : "secondary"} className="text-xs">
                          {t.status === "approved" ? "مقبول" : t.status === "rejected" ? "مرفوض" : "انتظار"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{t.note || "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>إغلاق</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function Camions() {
  const { data, isLoading } = useListTrucks();
  const trucks = Array.isArray(data) ? data : [];
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const filtered = search.trim()
    ? trucks.filter((t) => {
        const q = search.trim().toLowerCase();
        return (
          t.name.toLowerCase().includes(q) ||
          (t.plateNumber ?? "").toLowerCase().includes(q) ||
          (t.driverName ?? "").toLowerCase().includes(q) ||
          (t.location ?? "").toLowerCase().includes(q)
        );
      })
    : trucks;

  const [addOpen, setAddOpen] = useState(false);
  const [addForm, setAddForm] = useState<TruckForm>(emptyForm);

  const [editOpen, setEditOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<TruckForm>(emptyForm);

  const [balanceTruck, setBalanceTruck] = useState<Truck | null>(null);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["/api/trucks"] });

  const createTruck = useCreateTruck({
    mutation: {
      onSuccess: () => {
        invalidate();
        toast.success("تمت إضافة الشاحنة بنجاح");
        setAddForm(emptyForm);
        setAddOpen(false);
      },
      onError: () => toast.error("حدث خطأ أثناء الإضافة"),
    },
  });

  const updateTruck = useUpdateTruck({
    mutation: {
      onSuccess: () => {
        invalidate();
        toast.success("تم تحديث الشاحنة بنجاح");
        setEditOpen(false);
        setEditId(null);
      },
      onError: () => toast.error("حدث خطأ أثناء التعديل"),
    },
  });

  const setAddField = (f: keyof TruckForm, v: string) => setAddForm((p) => ({ ...p, [f]: v }));
  const setEditField = (f: keyof TruckForm, v: string) => setEditForm((p) => ({ ...p, [f]: v }));

  const openEdit = (t: Truck) => {
    setEditId(t.id);
    setEditForm({
      name: t.name,
      plateNumber: t.plateNumber ?? "",
      driverName: t.driverName ?? "",
      password: "",
      location: t.location ?? "",
    });
    setEditOpen(true);
  };

  const buildBody = (f: TruckForm) => ({
    name: f.name.trim(),
    plateNumber: f.plateNumber.trim() || null,
    driverName: f.driverName.trim() || null,
    password: f.password.trim() || null,
    location: f.location.trim() || null,
  });

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">الشاحنات</h1>
          <p className="text-muted-foreground">إدارة أسطول الشاحنات — كل شاحنة لها حساب مستقل.</p>
        </div>
        <Button onClick={() => setAddOpen(true)}>
          <Plus className="ml-2 h-4 w-4" /> إضافة شاحنة
        </Button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input value={search} onChange={(e) => setSearch(e.target.value)}
          placeholder="ابحث بالاسم أو اللوحة أو السائق أو الموقع..." className="pr-9 pl-9" />
        {search && (
          <button onClick={() => setSearch("")} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
      {search.trim() && (
        <p className="text-sm text-muted-foreground -mt-2">{filtered.length} نتيجة من أصل {trucks.length}</p>
      )}

      {/* Add Dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>إضافة شاحنة جديدة</DialogTitle></DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); if (!addForm.name.trim()) return; createTruck.mutate({ data: buildBody(addForm) }); }} className="space-y-4">
            <TruckFormFields form={addForm} onChange={setAddField} />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setAddOpen(false)}>إلغاء</Button>
              <Button type="submit" disabled={createTruck.isPending}>{createTruck.isPending ? "جارٍ الحفظ..." : "حفظ"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>تعديل الشاحنة</DialogTitle></DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); if (!editId || !editForm.name.trim()) return; updateTruck.mutate({ id: editId, data: buildBody(editForm) }); }} className="space-y-4">
            <TruckFormFields form={editForm} onChange={setEditField} isEdit />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditOpen(false)}>إلغاء</Button>
              <Button type="submit" disabled={updateTruck.isPending}>{updateTruck.isPending ? "جارٍ الحفظ..." : "حفظ التعديل"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Balance Dialog */}
      <TruckBalanceDialog
        truck={balanceTruck}
        open={!!balanceTruck}
        onClose={() => setBalanceTruck(null)}
      />

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>الاسم</TableHead>
                <TableHead>رقم اللوحة</TableHead>
                <TableHead>السائق</TableHead>
                <TableHead>الموقع</TableHead>
                <TableHead>الصندوق</TableHead>
                <TableHead>حساب مستقل</TableHead>
                <TableHead className="text-center">إجراءات</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={7} className="text-center py-8">جارٍ التحميل...</TableCell></TableRow>
              ) : filtered.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="text-center py-8">{search.trim() ? "لا توجد نتائج مطابقة" : "لا توجد شاحنات"}</TableCell></TableRow>
              ) : (
                filtered.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell className="font-medium">{t.name}</TableCell>
                    <TableCell>{t.plateNumber || "-"}</TableCell>
                    <TableCell>{t.driverName || "غير معيّن"}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">{t.location || "-"}</TableCell>
                    <TableCell>
                      <button
                        onClick={() => setBalanceTruck(t as Truck)}
                        className="flex items-center gap-1.5 font-bold text-emerald-700 dark:text-emerald-400 hover:underline"
                      >
                        <Wallet className="h-3.5 w-3.5" />
                        {formatCurrency(t.cashBalance)}
                      </button>
                    </TableCell>
                    <TableCell>
                      {t.driverName ? (
                        <span className="inline-flex items-center gap-1 text-xs bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 px-2 py-0.5 rounded-full">
                          ✓ مفعّل
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      <Button size="sm" variant="outline" onClick={() => openEdit(t as Truck)}>
                        <Pencil className="h-3.5 w-3.5 ml-1" /> تعديل
                      </Button>
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
