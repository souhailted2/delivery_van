import { useState } from "react";
import { useListSuppliers, useCreateSupplier, useUpdateSupplier } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatCurrency } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Plus, Pencil, Search, X } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

type Supplier = { id: number; name: string; phone?: string | null; email?: string | null; balance: number };
const emptyForm = { name: "", phone: "", email: "", balance: "" };

export default function Fournisseurs() {
  const { data, isLoading } = useListSuppliers();
  const suppliers = Array.isArray(data) ? data : [];
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");

  const [addOpen, setAddOpen] = useState(false);
  const [addForm, setAddForm] = useState(emptyForm);

  const [editOpen, setEditOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState(emptyForm);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["/api/suppliers"] });

  const filtered = search.trim()
    ? suppliers.filter((s) => {
        const q = search.trim().toLowerCase();
        return (
          s.name.toLowerCase().includes(q) ||
          (s.phone ?? "").toLowerCase().includes(q) ||
          (s.email ?? "").toLowerCase().includes(q)
        );
      })
    : suppliers;

  const createSupplier = useCreateSupplier({
    mutation: {
      onSuccess: () => { invalidate(); toast.success("تمت إضافة المورد بنجاح"); setAddForm(emptyForm); setAddOpen(false); },
      onError: () => toast.error("حدث خطأ أثناء الإضافة"),
    },
  });

  const updateSupplier = useUpdateSupplier({
    mutation: {
      onSuccess: () => { invalidate(); toast.success("تم تحديث المورد بنجاح"); setEditOpen(false); setEditId(null); },
      onError: () => toast.error("حدث خطأ أثناء التعديل"),
    },
  });

  const setAdd = (f: keyof typeof emptyForm) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setAddForm((p) => ({ ...p, [f]: e.target.value }));

  const setEdit = (f: keyof typeof emptyForm) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setEditForm((p) => ({ ...p, [f]: e.target.value }));

  const openEdit = (s: Supplier) => {
    setEditId(s.id);
    setEditForm({ name: s.name, phone: s.phone ?? "", email: s.email ?? "", balance: String(s.balance) });
    setEditOpen(true);
  };

  const buildBody = (f: typeof emptyForm) => ({
    name: f.name.trim(),
    phone: f.phone.trim() || null,
    email: f.email.trim() || null,
    balance: f.balance ? Number(f.balance) : 0,
  });

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">الموردون</h1>
          <p className="text-muted-foreground">إدارة الموردين والمديونيات.</p>
        </div>
        <Button onClick={() => setAddOpen(true)}>
          <Plus className="ml-2 h-4 w-4" /> إضافة مورد
        </Button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="ابحث بالاسم أو الهاتف أو البريد..."
          className="pr-9 pl-9"
        />
        {search && (
          <button onClick={() => setSearch("")} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
      {search.trim() && (
        <p className="text-sm text-muted-foreground -mt-2">
          {filtered.length} نتيجة من أصل {suppliers.length}
        </p>
      )}

      {/* Add Dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>إضافة مورد جديد</DialogTitle></DialogHeader>
          <form
            onSubmit={(e) => { e.preventDefault(); if (!addForm.name.trim()) return; createSupplier.mutate({ data: buildBody(addForm) }); }}
            className="space-y-4"
          >
            <div className="space-y-2">
              <Label>اسم المورد *</Label>
              <Input value={addForm.name} onChange={setAdd("name")} placeholder="الاسم الكامل" required autoFocus />
            </div>
            <div className="space-y-2">
              <Label>رقم الهاتف</Label>
              <Input value={addForm.phone} onChange={setAdd("phone")} placeholder="0555 000 000" />
            </div>
            <div className="space-y-2">
              <Label>البريد الإلكتروني</Label>
              <Input type="email" value={addForm.email} onChange={setAdd("email")} placeholder="exemple@mail.com" />
            </div>
            <div className="space-y-2">
              <Label>الرصيد الافتراضي (DZD)</Label>
              <Input type="number" value={addForm.balance} onChange={setAdd("balance")} placeholder="0" min="0" />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setAddOpen(false)}>إلغاء</Button>
              <Button type="submit" disabled={createSupplier.isPending}>{createSupplier.isPending ? "جارٍ الحفظ..." : "حفظ"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>تعديل المورد</DialogTitle></DialogHeader>
          <form
            onSubmit={(e) => { e.preventDefault(); if (!editId || !editForm.name.trim()) return; updateSupplier.mutate({ id: editId, data: buildBody(editForm) }); }}
            className="space-y-4"
          >
            <div className="space-y-2">
              <Label>اسم المورد *</Label>
              <Input value={editForm.name} onChange={setEdit("name")} required autoFocus />
            </div>
            <div className="space-y-2">
              <Label>رقم الهاتف</Label>
              <Input value={editForm.phone} onChange={setEdit("phone")} placeholder="0555 000 000" />
            </div>
            <div className="space-y-2">
              <Label>البريد الإلكتروني</Label>
              <Input type="email" value={editForm.email} onChange={setEdit("email")} />
            </div>
            <div className="space-y-2">
              <Label>الرصيد (DZD)</Label>
              <Input type="number" value={editForm.balance} onChange={setEdit("balance")} min="0" />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditOpen(false)}>إلغاء</Button>
              <Button type="submit" disabled={updateSupplier.isPending}>{updateSupplier.isPending ? "جارٍ الحفظ..." : "حفظ التعديل"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>الاسم</TableHead>
                <TableHead>الهاتف</TableHead>
                <TableHead>البريد الإلكتروني</TableHead>
                <TableHead>الرصيد</TableHead>
                <TableHead className="w-24 text-center">إجراءات</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={5} className="text-center py-8">جارٍ التحميل...</TableCell></TableRow>
              ) : filtered.length === 0 ? (
                <TableRow><TableCell colSpan={5} className="text-center py-8">{search.trim() ? "لا توجد نتائج مطابقة" : "لا يوجد موردون"}</TableCell></TableRow>
              ) : (
                filtered.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="font-medium">{s.name}</TableCell>
                    <TableCell>{s.phone || "-"}</TableCell>
                    <TableCell>{s.email || "-"}</TableCell>
                    <TableCell className={`font-bold ${s.balance > 0 ? "text-destructive" : ""}`}>
                      {formatCurrency(s.balance)}
                    </TableCell>
                    <TableCell className="text-center">
                      <Button size="sm" variant="outline" onClick={() => openEdit(s)}>
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
