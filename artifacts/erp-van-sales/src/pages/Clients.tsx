import { useState } from "react";
import { useListClients, useCreateClient, useUpdateClient } from "@workspace/api-client-react";
import { usePwaSync } from "@/contexts/PwaSyncContext";
import { useLocalClients, createLocalClient, updateLocalClient } from "@/lib/use-local-data";
import { WifiOff } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatCurrency } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Pencil, Search, X } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ClientProfileSheet } from "@/components/ClientProfileSheet";

type ClientType = "retail" | "half_wholesale" | "wholesale";
type Client = { id: number; name: string; phone?: string | null; clientType: ClientType; balance: number };

const CLIENT_TYPE_LABELS: Record<ClientType, string> = {
  retail: "تجزئة",
  half_wholesale: "نصف جملة",
  wholesale: "جملة",
};

const emptyForm = { name: "", phone: "", clientType: "retail" as ClientType };

export default function Clients() {
  const { online } = usePwaSync();
  const { data, isLoading } = useListClients();
  const apiClients = Array.isArray(data) ? data : [];
  const localClientRows = useLocalClients() ?? [];
  const clients = apiClients.length > 0 ? apiClients : localClientRows.map(lc => ({
    id: lc.id ?? 0,
    name: lc.name,
    phone: lc.phone ?? null,
    clientType: (lc.client_type ?? "retail") as ClientType,
    balance: lc.credit_balance ?? 0,
    _syncId: lc.sync_id,
  }));
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");

  const [addOpen, setAddOpen] = useState(false);
  const [addForm, setAddForm] = useState(emptyForm);

  const [editOpen, setEditOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [editSyncId, setEditSyncId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState(emptyForm);

  const [profileClient, setProfileClient] = useState<Client | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);

  const openProfile = (c: Client) => {
    setProfileClient(c);
    setProfileOpen(true);
  };

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["/api/clients"] });

  const filtered = search.trim()
    ? (clients as Client[]).filter((c) => {
        const q = search.trim().toLowerCase();
        return (
          c.name.toLowerCase().includes(q) ||
          (c.phone ?? "").toLowerCase().includes(q)
        );
      })
    : clients;

  const createClient = useCreateClient({
    mutation: {
      onSuccess: () => { invalidate(); toast.success("تمت إضافة العميل بنجاح"); setAddForm(emptyForm); setAddOpen(false); },
      onError: () => toast.error("حدث خطأ أثناء الإضافة"),
    },
  });

  const updateClient = useUpdateClient({
    mutation: {
      onSuccess: () => { invalidate(); toast.success("تم تحديث العميل بنجاح"); setEditOpen(false); setEditId(null); },
      onError: () => toast.error("حدث خطأ أثناء التعديل"),
    },
  });

  const openEdit = (c: Client & { _syncId?: string }) => {
    setEditId(c.id);
    setEditSyncId(c._syncId ?? null);
    setEditForm({ name: c.name, phone: c.phone ?? "", clientType: (c.clientType as ClientType) || "retail" });
    setEditOpen(true);
  };

  const buildBody = (f: typeof emptyForm) => ({
    name: f.name.trim(),
    phone: f.phone.trim() || null,
    clientType: f.clientType,
  });

  const ClientTypeSelect = ({ value, onChange }: { value: ClientType; onChange: (v: ClientType) => void }) => (
    <Select value={value} onValueChange={(v) => onChange(v as ClientType)}>
      <SelectTrigger>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="retail">تجزئة</SelectItem>
        <SelectItem value="half_wholesale">نصف جملة</SelectItem>
        <SelectItem value="wholesale">جملة</SelectItem>
      </SelectContent>
    </Select>
  );

  const typeBadgeVariant = (t: ClientType): "default" | "secondary" | "outline" =>
    t === "wholesale" ? "default" : t === "half_wholesale" ? "secondary" : "outline";

  return (
    <div className="space-y-6">
      {!online && (
        <div className="flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-300">
          <WifiOff className="h-4 w-4 shrink-0" />
          <span>أنت غير متصل — البيانات المعروضة من الذاكرة المحلية.</span>
        </div>
      )}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">العملاء</h1>
          <p className="text-muted-foreground">إدارة قاعدة بيانات العملاء.</p>
        </div>
        <Button onClick={() => setAddOpen(true)}>
          <Plus className="ml-2 h-4 w-4" /> إضافة عميل
        </Button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="ابحث بالاسم أو الهاتف..."
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
          {filtered.length} نتيجة من أصل {clients.length}
        </p>
      )}

      {/* Add Dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>إضافة عميل جديد</DialogTitle></DialogHeader>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (!addForm.name.trim()) return;
              if (!online) {
                try {
                  await createLocalClient({
                    name: addForm.name.trim(),
                    phone: addForm.phone.trim() || null,
                    client_type: addForm.clientType,
                    is_deleted: 0,
                  });
                  toast.success("تم حفظ العميل محلياً — ستتم المزامنة عند الاتصال");
                  setAddForm(emptyForm);
                  setAddOpen(false);
                } catch { toast.error("خطأ في الحفظ المحلي"); }
                return;
              }
              createClient.mutate({ data: buildBody(addForm) });
            }}
            className="space-y-4"
          >
            <div className="space-y-2">
              <Label>اسم العميل *</Label>
              <Input
                value={addForm.name}
                onChange={(e) => setAddForm((p) => ({ ...p, name: e.target.value }))}
                placeholder="الاسم الكامل" required autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label>رقم الهاتف</Label>
              <Input
                value={addForm.phone}
                onChange={(e) => setAddForm((p) => ({ ...p, phone: e.target.value }))}
                placeholder="0555 000 000"
              />
            </div>
            <div className="space-y-2">
              <Label>نوع العميل</Label>
              <ClientTypeSelect value={addForm.clientType} onChange={(v) => setAddForm((p) => ({ ...p, clientType: v }))} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setAddOpen(false)}>إلغاء</Button>
              <Button type="submit" disabled={createClient.isPending}>{createClient.isPending ? "جارٍ الحفظ..." : "حفظ"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>تعديل العميل</DialogTitle></DialogHeader>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (!editId || !editForm.name.trim()) return;
              if (!online && editSyncId) {
                try {
                  await updateLocalClient(editSyncId, {
                    name: editForm.name.trim(),
                    phone: editForm.phone.trim() || null,
                    client_type: editForm.clientType,
                  });
                  toast.success("تم تحديث العميل محلياً — ستتم المزامنة عند الاتصال");
                  setEditOpen(false);
                  setEditId(null);
                  setEditSyncId(null);
                } catch { toast.error("خطأ في التحديث المحلي"); }
                return;
              }
              updateClient.mutate({ id: editId, data: buildBody(editForm) });
            }}
            className="space-y-4"
          >
            <div className="space-y-2">
              <Label>اسم العميل *</Label>
              <Input
                value={editForm.name}
                onChange={(e) => setEditForm((p) => ({ ...p, name: e.target.value }))}
                required autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label>رقم الهاتف</Label>
              <Input
                value={editForm.phone}
                onChange={(e) => setEditForm((p) => ({ ...p, phone: e.target.value }))}
                placeholder="0555 000 000"
              />
            </div>
            <div className="space-y-2">
              <Label>نوع العميل</Label>
              <ClientTypeSelect value={editForm.clientType} onChange={(v) => setEditForm((p) => ({ ...p, clientType: v }))} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditOpen(false)}>إلغاء</Button>
              <Button type="submit" disabled={updateClient.isPending}>{updateClient.isPending ? "جارٍ الحفظ..." : "حفظ التعديل"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Client Profile Sheet */}
      <ClientProfileSheet
        client={profileClient}
        open={profileOpen}
        onClose={() => setProfileOpen(false)}
      />

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>الاسم</TableHead>
                <TableHead>الهاتف</TableHead>
                <TableHead>نوع العميل</TableHead>
                <TableHead>الدين</TableHead>
                <TableHead className="w-24 text-center">إجراءات</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={5} className="text-center py-8">جارٍ التحميل...</TableCell></TableRow>
              ) : filtered.length === 0 ? (
                <TableRow><TableCell colSpan={5} className="text-center py-8">{search.trim() ? "لا توجد نتائج مطابقة" : "لا يوجد عملاء"}</TableCell></TableRow>
              ) : (
                filtered.map((c) => (
                  <TableRow
                    key={c.id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => openProfile(c as Client)}
                  >
                    <TableCell className="font-medium">{c.name}</TableCell>
                    <TableCell>{c.phone || "-"}</TableCell>
                    <TableCell>
                      <Badge variant={typeBadgeVariant((c.clientType as ClientType) || "retail")}>
                        {CLIENT_TYPE_LABELS[(c.clientType as ClientType)] ?? c.clientType}
                      </Badge>
                    </TableCell>
                    <TableCell className={`font-bold ${c.balance < 0 ? "text-destructive" : ""}`}>
                      {formatCurrency(Math.abs(c.balance))}
                    </TableCell>
                    <TableCell className="text-center" onClick={(e) => e.stopPropagation()}>
                      <Button size="sm" variant="outline" onClick={() => openEdit(c as Client)}>
                        <Pencil className="h-3.5 w-3.5 ml-1" /> تعديل
                      </Button>
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
