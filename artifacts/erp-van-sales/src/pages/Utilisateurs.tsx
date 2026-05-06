import { useState } from "react";
import {
  useListUsers, useCreateUser, useUpdateUser, useDeleteUser,
  useListTrucks,
} from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

type Role = "admin" | "vendeur";

interface UserRow {
  id: number;
  username: string;
  fullName: string;
  role: Role;
  truckId?: number | null;
  canDeleteInvoice: boolean;
  canEditPrice: boolean;
  canSellOnCredit: boolean;
  canViewReports: boolean;
}

const emptyAdd = {
  username: "", password: "", fullName: "",
  role: "vendeur" as Role, truckId: "",
  canSellOnCredit: true, canEditPrice: false,
  canDeleteInvoice: false, canViewReports: false,
};

const emptyEdit = {
  fullName: "", role: "vendeur" as Role, truckId: "",
  canSellOnCredit: true, canEditPrice: false,
  canDeleteInvoice: false, canViewReports: false,
};

export default function Utilisateurs() {
  const { data, isLoading } = useListUsers();
  const users = Array.isArray(data) ? data : [];
  const { data: trucksData } = useListTrucks();
  const trucks = Array.isArray(trucksData) ? trucksData : [];
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["/api/users"] });

  const [addOpen, setAddOpen] = useState(false);
  const [addForm, setAddForm] = useState(emptyAdd);

  const [editOpen, setEditOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState(emptyEdit);

  const [deleteId, setDeleteId] = useState<number | null>(null);

  const createUser = useCreateUser({
    mutation: {
      onSuccess: () => { invalidate(); toast.success("تمت إضافة المستخدم بنجاح"); setAddForm(emptyAdd); setAddOpen(false); },
      onError: () => toast.error("حدث خطأ أثناء الإضافة"),
    },
  });

  const updateUser = useUpdateUser({
    mutation: {
      onSuccess: () => { invalidate(); toast.success("تم تحديث المستخدم بنجاح"); setEditOpen(false); setEditId(null); },
      onError: () => toast.error("حدث خطأ أثناء التعديل"),
    },
  });

  const deleteUser = useDeleteUser({
    mutation: {
      onSuccess: () => { invalidate(); toast.success("تم حذف المستخدم"); setDeleteId(null); },
      onError: () => toast.error("حدث خطأ أثناء الحذف"),
    },
  });

  const openEdit = (u: UserRow) => {
    setEditId(u.id);
    setEditForm({
      fullName: u.fullName,
      role: u.role,
      truckId: u.truckId ? String(u.truckId) : "",
      canSellOnCredit: u.canSellOnCredit,
      canEditPrice: u.canEditPrice,
      canDeleteInvoice: u.canDeleteInvoice,
      canViewReports: u.canViewReports,
    });
    setEditOpen(true);
  };

  const submitAdd = (e: React.FormEvent) => {
    e.preventDefault();
    const { username, password, fullName, role, truckId, ...perms } = addForm;
    if (!username.trim() || !password.trim() || !fullName.trim()) return;
    createUser.mutate({
      data: {
        username: username.trim(), password: password.trim(),
        fullName: fullName.trim(), role,
        truckId: truckId ? Number(truckId) : null,
        ...perms,
      },
    });
  };

  const submitEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editId || !editForm.fullName.trim()) return;
    updateUser.mutate({
      id: editId,
      data: {
        fullName: editForm.fullName.trim(),
        role: editForm.role,
        truckId: editForm.truckId ? Number(editForm.truckId) : null,
        canSellOnCredit: editForm.canSellOnCredit,
        canEditPrice: editForm.canEditPrice,
        canDeleteInvoice: editForm.canDeleteInvoice,
        canViewReports: editForm.canViewReports,
      },
    });
  };

  const PermRow = ({
    label, checked, onChange,
  }: { label: string; checked: boolean; onChange: (v: boolean) => void }) => (
    <div className="flex items-center gap-2">
      <Checkbox id={label} checked={checked} onCheckedChange={(v) => onChange(Boolean(v))} />
      <Label htmlFor={label} className="cursor-pointer">{label}</Label>
    </div>
  );

  const TruckSelect = ({
    value, onChange,
  }: { value: string; onChange: (v: string) => void }) => (
    <Select value={value || "__none__"} onValueChange={(v) => onChange(v === "__none__" ? "" : v)}>
      <SelectTrigger><SelectValue placeholder="بدون شاحنة" /></SelectTrigger>
      <SelectContent>
        <SelectItem value="__none__">بدون شاحنة</SelectItem>
        {trucks.map((t) => (
          <SelectItem key={t.id} value={String(t.id)}>{t.name}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">المستخدمون</h1>
          <p className="text-muted-foreground">إدارة الصلاحيات والوصول إلى النظام.</p>
        </div>
        <Button onClick={() => setAddOpen(true)}>
          <Plus className="ml-2 h-4 w-4" /> إضافة مستخدم
        </Button>
      </div>

      {/* Add Dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>إضافة مستخدم جديد</DialogTitle></DialogHeader>
          <form onSubmit={submitAdd} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>الاسم الكامل *</Label>
                <Input value={addForm.fullName} onChange={(e) => setAddForm((p) => ({ ...p, fullName: e.target.value }))} required autoFocus />
              </div>
              <div className="space-y-2">
                <Label>اسم المستخدم *</Label>
                <Input value={addForm.username} onChange={(e) => setAddForm((p) => ({ ...p, username: e.target.value }))} required />
              </div>
              <div className="space-y-2">
                <Label>كلمة المرور *</Label>
                <Input type="password" value={addForm.password} onChange={(e) => setAddForm((p) => ({ ...p, password: e.target.value }))} required />
              </div>
              <div className="space-y-2">
                <Label>الدور</Label>
                <Select value={addForm.role} onValueChange={(v) => setAddForm((p) => ({ ...p, role: v as Role }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="vendeur">بائع</SelectItem>
                    <SelectItem value="admin">مدير</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {addForm.role === "vendeur" && (
                <div className="space-y-2 col-span-2">
                  <Label>الشاحنة المعيَّنة</Label>
                  <TruckSelect value={addForm.truckId} onChange={(v) => setAddForm((p) => ({ ...p, truckId: v }))} />
                </div>
              )}
            </div>
            <div className="space-y-2 pt-1">
              <Label className="text-base font-semibold">الصلاحيات</Label>
              <div className="grid grid-cols-2 gap-2 pt-1">
                <PermRow label="بيع آجل" checked={addForm.canSellOnCredit} onChange={(v) => setAddForm((p) => ({ ...p, canSellOnCredit: v }))} />
                <PermRow label="تعديل السعر" checked={addForm.canEditPrice} onChange={(v) => setAddForm((p) => ({ ...p, canEditPrice: v }))} />
                <PermRow label="حذف فاتورة" checked={addForm.canDeleteInvoice} onChange={(v) => setAddForm((p) => ({ ...p, canDeleteInvoice: v }))} />
                <PermRow label="عرض التقارير" checked={addForm.canViewReports} onChange={(v) => setAddForm((p) => ({ ...p, canViewReports: v }))} />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setAddOpen(false)}>إلغاء</Button>
              <Button type="submit" disabled={createUser.isPending}>{createUser.isPending ? "جارٍ الحفظ..." : "حفظ"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>تعديل المستخدم</DialogTitle></DialogHeader>
          <form onSubmit={submitEdit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2 col-span-2">
                <Label>الاسم الكامل *</Label>
                <Input value={editForm.fullName} onChange={(e) => setEditForm((p) => ({ ...p, fullName: e.target.value }))} required autoFocus />
              </div>
              <div className="space-y-2">
                <Label>الدور</Label>
                <Select value={editForm.role} onValueChange={(v) => setEditForm((p) => ({ ...p, role: v as Role }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="vendeur">بائع</SelectItem>
                    <SelectItem value="admin">مدير</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {editForm.role === "vendeur" && (
                <div className="space-y-2">
                  <Label>الشاحنة المعيَّنة</Label>
                  <TruckSelect value={editForm.truckId} onChange={(v) => setEditForm((p) => ({ ...p, truckId: v }))} />
                </div>
              )}
            </div>
            <div className="space-y-2 pt-1">
              <Label className="text-base font-semibold">الصلاحيات</Label>
              <div className="grid grid-cols-2 gap-2 pt-1">
                <PermRow label="بيع آجل" checked={editForm.canSellOnCredit} onChange={(v) => setEditForm((p) => ({ ...p, canSellOnCredit: v }))} />
                <PermRow label="تعديل السعر" checked={editForm.canEditPrice} onChange={(v) => setEditForm((p) => ({ ...p, canEditPrice: v }))} />
                <PermRow label="حذف فاتورة" checked={editForm.canDeleteInvoice} onChange={(v) => setEditForm((p) => ({ ...p, canDeleteInvoice: v }))} />
                <PermRow label="عرض التقارير" checked={editForm.canViewReports} onChange={(v) => setEditForm((p) => ({ ...p, canViewReports: v }))} />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditOpen(false)}>إلغاء</Button>
              <Button type="submit" disabled={updateUser.isPending}>{updateUser.isPending ? "جارٍ الحفظ..." : "حفظ التعديل"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm */}
      <AlertDialog open={deleteId !== null} onOpenChange={(o) => { if (!o) setDeleteId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>حذف المستخدم</AlertDialogTitle>
            <AlertDialogDescription>هل أنت متأكد من حذف هذا المستخدم؟ لا يمكن التراجع عن هذا الإجراء.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteId && deleteUser.mutate({ id: deleteId })}
            >
              حذف
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>الاسم الكامل</TableHead>
                <TableHead>اسم المستخدم</TableHead>
                <TableHead>الدور</TableHead>
                <TableHead>الصلاحيات</TableHead>
                <TableHead className="w-28 text-center">إجراءات</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={5} className="text-center py-8">جارٍ التحميل...</TableCell></TableRow>
              ) : users.length === 0 ? (
                <TableRow><TableCell colSpan={5} className="text-center py-8">لا يوجد مستخدمون</TableCell></TableRow>
              ) : (
                users.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell className="font-medium">{u.fullName}</TableCell>
                    <TableCell>{u.username}</TableCell>
                    <TableCell>
                      <Badge variant={u.role === "admin" ? "default" : "secondary"}>
                        {u.role === "admin" ? "مدير" : "بائع"}
                      </Badge>
                    </TableCell>
                    <TableCell className="flex gap-1 flex-wrap">
                      {u.canSellOnCredit && <Badge variant="outline" className="text-xs">بيع آجل</Badge>}
                      {u.canEditPrice && <Badge variant="outline" className="text-xs">تعديل السعر</Badge>}
                      {u.canDeleteInvoice && <Badge variant="outline" className="text-xs">حذف فاتورة</Badge>}
                      {u.canViewReports && <Badge variant="outline" className="text-xs">التقارير</Badge>}
                    </TableCell>
                    <TableCell className="text-center">
                      <div className="flex gap-1 justify-center">
                        <Button size="sm" variant="outline" onClick={() => openEdit(u as UserRow)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button size="sm" variant="outline" className="text-destructive hover:text-destructive" onClick={() => setDeleteId(u.id)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
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
