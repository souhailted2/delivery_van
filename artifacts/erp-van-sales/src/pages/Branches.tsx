import { useState } from "react";
import {
  useListBranches, useCreateBranch, useUpdateBranch, useDeleteBranch,
} from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Plus, Pencil, Trash2, Building2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

interface BranchRow {
  id: number;
  name: string;
  address?: string | null;
  phone?: string | null;
  createdAt: string;
}

const emptyForm = { name: "", address: "", phone: "" };

export default function Branches() {
  const { data, isLoading } = useListBranches();
  const branches: BranchRow[] = Array.isArray(data) ? (data as BranchRow[]) : [];
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["/api/branches"] });

  const [addOpen, setAddOpen] = useState(false);
  const [addForm, setAddForm] = useState(emptyForm);

  const [editOpen, setEditOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState(emptyForm);

  const [deleteId, setDeleteId] = useState<number | null>(null);

  const createBranch = useCreateBranch();
  const updateBranch = useUpdateBranch();
  const deleteBranch = useDeleteBranch();

  const handleAdd = () => {
    if (!addForm.name.trim()) { toast.error("اسم الفرع مطلوب"); return; }
    createBranch.mutate(
      { data: { name: addForm.name, address: addForm.address || null, phone: addForm.phone || null } },
      {
        onSuccess: () => { invalidate(); setAddOpen(false); setAddForm(emptyForm); toast.success("تم إنشاء الفرع"); },
        onError: () => toast.error("فشل إنشاء الفرع"),
      }
    );
  };

  const handleEdit = () => {
    if (!editId || !editForm.name.trim()) return;
    updateBranch.mutate(
      { id: editId, data: { name: editForm.name, address: editForm.address || null, phone: editForm.phone || null } },
      {
        onSuccess: () => { invalidate(); setEditOpen(false); toast.success("تم التحديث"); },
        onError: () => toast.error("فشل التحديث"),
      }
    );
  };

  const handleDelete = () => {
    if (!deleteId) return;
    deleteBranch.mutate(
      { id: deleteId },
      {
        onSuccess: () => { invalidate(); setDeleteId(null); toast.success("تم الحذف"); },
        onError: () => toast.error("فشل الحذف"),
      }
    );
  };

  const openEdit = (b: BranchRow) => {
    setEditId(b.id);
    setEditForm({ name: b.name, address: b.address || "", phone: b.phone || "" });
    setEditOpen(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">نقاط البيع (الفروع)</h1>
          <p className="text-muted-foreground">إدارة فروع ونقاط البيع</p>
        </div>
        <Button onClick={() => setAddOpen(true)}>
          <Plus className="ml-2 h-4 w-4" />
          إضافة فرع
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 text-center text-muted-foreground">جارٍ التحميل...</div>
          ) : branches.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              <Building2 className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p>لا توجد فروع بعد</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>اسم الفرع</TableHead>
                  <TableHead>العنوان</TableHead>
                  <TableHead>رقم الهاتف</TableHead>
                  <TableHead>تاريخ الإنشاء</TableHead>
                  <TableHead className="text-left">الإجراءات</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {branches.map((b) => (
                  <TableRow key={b.id}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary">
                          <Building2 className="h-4 w-4" />
                        </div>
                        {b.name}
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{b.address || "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{b.phone || "—"}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {new Date(b.createdAt).toLocaleDateString("ar-DZ")}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Button variant="ghost" size="icon" onClick={() => openEdit(b)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive" onClick={() => setDeleteId(b.id)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add Dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>إضافة فرع جديد</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>اسم الفرع *</Label>
              <Input value={addForm.name} onChange={e => setAddForm(f => ({ ...f, name: e.target.value }))} placeholder="مثال: نقطة البيع 1" />
            </div>
            <div className="space-y-2">
              <Label>العنوان</Label>
              <Input value={addForm.address} onChange={e => setAddForm(f => ({ ...f, address: e.target.value }))} placeholder="شارع، حي..." />
            </div>
            <div className="space-y-2">
              <Label>رقم الهاتف</Label>
              <Input value={addForm.phone} onChange={e => setAddForm(f => ({ ...f, phone: e.target.value }))} placeholder="05..." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>إلغاء</Button>
            <Button onClick={handleAdd} disabled={createBranch.isPending}>
              {createBranch.isPending ? "جارٍ الإنشاء..." : "إنشاء"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>تعديل الفرع</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>اسم الفرع *</Label>
              <Input value={editForm.name} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>العنوان</Label>
              <Input value={editForm.address} onChange={e => setEditForm(f => ({ ...f, address: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>رقم الهاتف</Label>
              <Input value={editForm.phone} onChange={e => setEditForm(f => ({ ...f, phone: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>إلغاء</Button>
            <Button onClick={handleEdit} disabled={updateBranch.isPending}>
              {updateBranch.isPending ? "جارٍ الحفظ..." : "حفظ"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>تأكيد الحذف</AlertDialogTitle>
            <AlertDialogDescription>هل أنت متأكد من حذف هذا الفرع؟ لا يمكن التراجع.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              حذف
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
