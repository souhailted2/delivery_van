import { useState } from "react";
import { useListCategories, useCreateCategory, useUpdateCategory } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Plus, Pencil, Search, X } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

type Category = { id: number; name: string };

export default function Categories() {
  const { data, isLoading } = useListCategories();
  const categories = Array.isArray(data) ? data : [];
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const filtered = search.trim()
    ? categories.filter((c) => c.name.toLowerCase().includes(search.trim().toLowerCase()))
    : categories;

  const [addOpen, setAddOpen] = useState(false);
  const [addName, setAddName] = useState("");

  const [editOpen, setEditOpen] = useState(false);
  const [editItem, setEditItem] = useState<Category | null>(null);
  const [editName, setEditName] = useState("");

  const createCategory = useCreateCategory({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["/api/categories"] });
        toast.success("تمت إضافة الفئة بنجاح");
        setAddName("");
        setAddOpen(false);
      },
      onError: () => toast.error("حدث خطأ أثناء الإضافة"),
    },
  });

  const updateCategory = useUpdateCategory({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["/api/categories"] });
        toast.success("تم تحديث الفئة بنجاح");
        setEditOpen(false);
        setEditItem(null);
      },
      onError: () => toast.error("حدث خطأ أثناء التعديل"),
    },
  });

  const openEdit = (cat: Category) => {
    setEditItem(cat);
    setEditName(cat.name);
    setEditOpen(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">الفئات</h1>
          <p className="text-muted-foreground">إدارة فئات المنتجات.</p>
        </div>
        <Button onClick={() => setAddOpen(true)}>
          <Plus className="ml-2 h-4 w-4" /> إضافة فئة
        </Button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input value={search} onChange={(e) => setSearch(e.target.value)}
          placeholder="ابحث باسم الفئة..." className="pr-9 pl-9" />
        {search && (
          <button onClick={() => setSearch("")} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
      {search.trim() && (
        <p className="text-sm text-muted-foreground -mt-2">{filtered.length} نتيجة من أصل {categories.length}</p>
      )}

      {/* Add Dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>إضافة فئة جديدة</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!addName.trim()) return;
              createCategory.mutate({ data: { name: addName.trim() } });
            }}
            className="space-y-4"
          >
            <div className="space-y-2">
              <Label htmlFor="add-cat-name">اسم الفئة *</Label>
              <Input
                id="add-cat-name"
                value={addName}
                onChange={(e) => setAddName(e.target.value)}
                placeholder="مثال: مشروبات"
                required
                autoFocus
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setAddOpen(false)}>إلغاء</Button>
              <Button type="submit" disabled={createCategory.isPending}>
                {createCategory.isPending ? "جارٍ الحفظ..." : "حفظ"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>تعديل الفئة</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!editItem || !editName.trim()) return;
              updateCategory.mutate({ id: editItem.id, data: { name: editName.trim() } });
            }}
            className="space-y-4"
          >
            <div className="space-y-2">
              <Label htmlFor="edit-cat-name">اسم الفئة *</Label>
              <Input
                id="edit-cat-name"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                required
                autoFocus
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditOpen(false)}>إلغاء</Button>
              <Button type="submit" disabled={updateCategory.isPending}>
                {updateCategory.isPending ? "جارٍ الحفظ..." : "حفظ التعديل"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>الرقم</TableHead>
                <TableHead>الاسم</TableHead>
                <TableHead className="w-24 text-center">إجراءات</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={3} className="text-center py-8">جارٍ التحميل...</TableCell></TableRow>
              ) : filtered.length === 0 ? (
                <TableRow><TableCell colSpan={3} className="text-center py-8">{search.trim() ? "لا توجد نتائج مطابقة" : "لا توجد فئات"}</TableCell></TableRow>
              ) : (
                filtered.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell>{c.id}</TableCell>
                    <TableCell className="font-medium">{c.name}</TableCell>
                    <TableCell className="text-center">
                      <Button size="sm" variant="outline" onClick={() => openEdit(c)}>
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
