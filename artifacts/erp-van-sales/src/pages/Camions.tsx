import { useState } from "react";
import { useListTrucks, useCreateTruck, useUpdateTruck, useDeleteTruck } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatCurrency } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Plus, Pencil, Search, X, Eye, EyeOff, ChevronLeft, Trash2, Smartphone, Copy, Check } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { TruckProfileSheet } from "@/components/TruckProfileSheet";
import { Badge } from "@/components/ui/badge";

type Truck = {
  id: number;
  name: string;
  plateNumber?: string | null;
  phone?: string | null;
  driverName?: string | null;
  location?: string | null;
  cashBalance: number;
  canSellOnCredit?: boolean | null;
};

type TruckForm = {
  name: string;
  plateNumber: string;
  phone: string;
  driverName: string;
  password: string;
  location: string;
  canSellOnCredit: boolean;
};

const emptyForm: TruckForm = {
  name: "",
  plateNumber: "",
  phone: "",
  driverName: "",
  password: "",
  location: "",
  canSellOnCredit: true,
};

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };
  return (
    <button
      type="button"
      onClick={copy}
      className="text-muted-foreground hover:text-foreground transition-colors"
      title="نسخ"
    >
      {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  );
}

function MobileCredentials({ truckName }: { truckName: string }) {
  if (!truckName.trim()) return null;
  return (
    <div className="rounded-lg border border-blue-200 bg-blue-50 dark:bg-blue-950/30 dark:border-blue-800 p-3 space-y-2">
      <div className="flex items-center gap-2 text-blue-700 dark:text-blue-400">
        <Smartphone className="h-4 w-4" />
        <span className="text-sm font-semibold">بيانات الدخول للموبايل</span>
      </div>
      <div className="grid grid-cols-2 gap-2 text-sm">
        <div className="space-y-1">
          <span className="text-xs text-muted-foreground">اسم الشاحنة (للدخول)</span>
          <div className="flex items-center gap-2 rounded bg-white dark:bg-background border px-2 py-1 font-mono">
            <span className="flex-1 truncate text-sm">{truckName}</span>
            <CopyButton text={truckName} />
          </div>
        </div>
        <div className="space-y-1">
          <span className="text-xs text-muted-foreground">كلمة المرور</span>
          <div className="flex items-center gap-2 rounded bg-white dark:bg-background border px-2 py-1 text-muted-foreground italic text-xs">
            <span className="flex-1">كلمة المرور المحددة أعلاه</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function TruckFormFields({
  form,
  onChange,
  onToggle,
  isEdit = false,
}: {
  form: TruckForm;
  onChange: (field: keyof TruckForm, value: string) => void;
  onToggle: (field: keyof TruckForm, value: boolean) => void;
  isEdit?: boolean;
}) {
  const [showPassword, setShowPassword] = useState(false);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>اسم الشاحنة *</Label>
          <Input
            value={form.name}
            onChange={(e) => onChange("name", e.target.value)}
            placeholder="مثال: شاحنة 1"
            required
            autoFocus
          />
        </div>
        <div className="space-y-2">
          <Label>رقم اللوحة</Label>
          <Input
            value={form.plateNumber}
            onChange={(e) => onChange("plateNumber", e.target.value)}
            placeholder="16 AR 1234"
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>اسم السائق</Label>
          <Input
            value={form.driverName}
            onChange={(e) => onChange("driverName", e.target.value)}
            placeholder="اسم السائق / صاحب الشاحنة"
          />
        </div>
        <div className="space-y-2">
          <Label>رقم الهاتف</Label>
          <Input
            value={form.phone}
            onChange={(e) => onChange("phone", e.target.value)}
            placeholder="0555 123 456"
            type="tel"
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>{isEdit ? "كلمة مرور جديدة (اتركها فارغة للإبقاء)" : "كلمة المرور *"}</Label>
          <div className="relative">
            <Input
              type={showPassword ? "text" : "password"}
              value={form.password}
              onChange={(e) => onChange("password", e.target.value)}
              placeholder={isEdit ? "اتركها فارغة" : "كلمة مرور السائق"}
              className="pl-9"
            />
            <button
              type="button"
              onClick={() => setShowPassword((p) => !p)}
              className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>
        <div className="space-y-2">
          <Label>الموقع (نص أو إحداثيات GPS)</Label>
          <Input
            value={form.location}
            onChange={(e) => onChange("location", e.target.value)}
            placeholder="مثال: حي النصر، قسنطينة"
          />
        </div>
      </div>
      <div className="flex items-center justify-between rounded-lg border p-3">
        <div>
          <Label className="text-sm font-medium">البيع بالآجل</Label>
          <p className="text-xs text-muted-foreground mt-0.5">
            السماح لهذه الشاحنة بإنشاء فواتير آجلة (دَين)
          </p>
        </div>
        <Switch
          checked={form.canSellOnCredit}
          onCheckedChange={(v) => onToggle("canSellOnCredit", v)}
        />
      </div>

      <MobileCredentials truckName={form.name} />
    </div>
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
          (t.location ?? "").toLowerCase().includes(q) ||
          ((t as any).phone ?? "").toLowerCase().includes(q)
        );
      })
    : trucks;

  const [addOpen, setAddOpen] = useState(false);
  const [addForm, setAddForm] = useState<TruckForm>(emptyForm);

  const [editOpen, setEditOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<TruckForm>(emptyForm);

  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [deleteName, setDeleteName] = useState("");

  const [profileTruck, setProfileTruck] = useState<Truck | null>(null);

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

  const deleteTruck = useDeleteTruck({
    mutation: {
      onSuccess: () => {
        invalidate();
        toast.success("تم حذف الشاحنة بنجاح");
        setDeleteId(null);
      },
      onError: () => toast.error("حدث خطأ أثناء الحذف"),
    },
  });

  const setAddField = (f: keyof TruckForm, v: string) => setAddForm((p) => ({ ...p, [f]: v }));
  const setEditField = (f: keyof TruckForm, v: string) => setEditForm((p) => ({ ...p, [f]: v }));
  const setAddToggle = (f: keyof TruckForm, v: boolean) => setAddForm((p) => ({ ...p, [f]: v }));
  const setEditToggle = (f: keyof TruckForm, v: boolean) => setEditForm((p) => ({ ...p, [f]: v }));

  const openEdit = (t: Truck) => {
    setEditId(t.id);
    setEditForm({
      name: t.name,
      plateNumber: t.plateNumber ?? "",
      phone: t.phone ?? "",
      driverName: t.driverName ?? "",
      password: "",
      location: t.location ?? "",
      canSellOnCredit: (t as any).canSellOnCredit ?? true,
    });
    setEditOpen(true);
  };

  const openDelete = (t: Truck) => {
    setDeleteId(t.id);
    setDeleteName(t.name);
  };

  const buildBody = (f: TruckForm) => ({
    name: f.name.trim(),
    plateNumber: f.plateNumber.trim() || null,
    phone: f.phone.trim() || null,
    driverName: f.driverName.trim() || null,
    password: f.password.trim() || null,
    location: f.location.trim() || null,
    canSellOnCredit: f.canSellOnCredit,
  });

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">الشاحنات</h1>
          <p className="text-muted-foreground">
            انقر على أي شاحنة لعرض تفاصيلها — العملاء، البضاعة، والعمولات.
          </p>
        </div>
        <Button onClick={() => setAddOpen(true)}>
          <Plus className="ml-2 h-4 w-4" /> إضافة شاحنة
        </Button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="ابحث بالاسم أو اللوحة أو السائق أو الهاتف..."
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
          {filtered.length} نتيجة من أصل {trucks.length}
        </p>
      )}

      {/* Add Dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-lg" dir="rtl">
          <DialogHeader>
            <DialogTitle>إضافة شاحنة جديدة</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!addForm.name.trim()) return;
              createTruck.mutate({ data: buildBody(addForm) });
            }}
            className="space-y-4"
          >
            <TruckFormFields form={addForm} onChange={setAddField} onToggle={setAddToggle} />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setAddOpen(false)}>
                إلغاء
              </Button>
              <Button type="submit" disabled={createTruck.isPending}>
                {createTruck.isPending ? "جارٍ الحفظ..." : "حفظ"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-lg" dir="rtl">
          <DialogHeader>
            <DialogTitle>تعديل الشاحنة</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!editId || !editForm.name.trim()) return;
              updateTruck.mutate({ id: editId, data: buildBody(editForm) });
            }}
            className="space-y-4"
          >
            <TruckFormFields form={editForm} onChange={setEditField} onToggle={setEditToggle} isEdit />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditOpen(false)}>
                إلغاء
              </Button>
              <Button type="submit" disabled={updateTruck.isPending}>
                {updateTruck.isPending ? "جارٍ الحفظ..." : "حفظ التعديل"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={(o) => { if (!o) setDeleteId(null); }}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>تأكيد حذف الشاحنة</AlertDialogTitle>
            <AlertDialogDescription>
              هل أنت متأكد من حذف شاحنة <strong className="text-foreground">«{deleteName}»</strong>؟
              <br />
              سيتم حذف جميع بيانات الشاحنة نهائياً ولا يمكن التراجع عن هذا الإجراء.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-row-reverse gap-2">
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteId && deleteTruck.mutate({ id: deleteId })}
              disabled={deleteTruck.isPending}
            >
              {deleteTruck.isPending ? "جارٍ الحذف..." : "حذف نهائياً"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Truck Profile Sheet */}
      <TruckProfileSheet
        truck={profileTruck}
        open={!!profileTruck}
        onClose={() => setProfileTruck(null)}
      />

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>الاسم</TableHead>
                  <TableHead>رقم اللوحة</TableHead>
                  <TableHead>السائق</TableHead>
                  <TableHead>الهاتف</TableHead>
                  <TableHead>الموقع</TableHead>
                  <TableHead>الصندوق</TableHead>
                  <TableHead>دخول الموبايل</TableHead>
                  <TableHead className="text-center">إجراءات</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8">
                      جارٍ التحميل...
                    </TableCell>
                  </TableRow>
                ) : filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8">
                      {search.trim() ? "لا توجد نتائج مطابقة" : "لا توجد شاحنات"}
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map((t) => (
                    <TableRow
                      key={t.id}
                      className="cursor-pointer hover:bg-muted/50 transition-colors"
                      onClick={() => setProfileTruck(t as Truck)}
                    >
                      <TableCell className="font-medium">
                        <span className="flex items-center gap-1.5">
                          {t.name}
                          <ChevronLeft className="h-3.5 w-3.5 text-muted-foreground/50" />
                        </span>
                      </TableCell>
                      <TableCell>{t.plateNumber || "-"}</TableCell>
                      <TableCell>{t.driverName || "غير معيّن"}</TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {(t as any).phone || "-"}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {t.location || "-"}
                      </TableCell>
                      <TableCell>
                        <span className="font-bold text-emerald-700 dark:text-emerald-400">
                          {formatCurrency(t.cashBalance)}
                        </span>
                      </TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center gap-1.5">
                          <Badge variant="secondary" className="font-mono text-xs gap-1 py-0.5">
                            <Smartphone className="h-3 w-3" />
                            {t.name}
                          </Badge>
                          <CopyButton text={t.name} />
                        </div>
                      </TableCell>
                      <TableCell className="text-center" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-center gap-1">
                          <Button size="sm" variant="outline" onClick={() => openEdit(t as Truck)}>
                            <Pencil className="h-3.5 w-3.5 ml-1" /> تعديل
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-destructive hover:text-destructive hover:bg-destructive/10 border-destructive/30"
                            onClick={() => openDelete(t as Truck)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
