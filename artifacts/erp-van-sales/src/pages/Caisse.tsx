import { useState } from "react";
import { useListCashTransfers, useApproveCashTransfer, useRejectCashTransfer } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatCurrency } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, X, CheckCircle, XCircle, Clock } from "lucide-react";

export default function Caisse() {
  const { data, isLoading } = useListCashTransfers();
  const queryClient = useQueryClient();
  const transfers = Array.isArray(data) ? data : [];
  const [search, setSearch] = useState("");
  const [processingId, setProcessingId] = useState<number | null>(null);

  const filtered = search.trim()
    ? transfers.filter((t) => {
        const q = search.trim().toLowerCase();
        return (
          (t.truckName ?? "").toLowerCase().includes(q) ||
          (t.note ?? "").toLowerCase().includes(q)
        );
      })
    : transfers;

  const pending  = transfers.filter(t => t.status === "pending");
  const approved = transfers.filter(t => t.status === "approved");

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["/api/cash/transfers"] });

  const approve = useApproveCashTransfer({
    mutation: {
      onSuccess: () => { invalidate(); toast.success("تم قبول التحويل وخصم المبلغ من رصيد الشاحنة"); setProcessingId(null); },
      onError:   () => { toast.error("حدث خطأ أثناء القبول"); setProcessingId(null); },
    },
  });

  const reject = useRejectCashTransfer({
    mutation: {
      onSuccess: () => { invalidate(); toast.success("تم رفض طلب التحويل"); setProcessingId(null); },
      onError:   () => { toast.error("حدث خطأ أثناء الرفض"); setProcessingId(null); },
    },
  });

  const handleApprove = (id: number) => { setProcessingId(id); approve.mutate({ id }); };
  const handleReject  = (id: number) => { setProcessingId(id); reject.mutate({ id }); };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">الصندوق والتحويلات</h1>
        <p className="text-muted-foreground">إدارة تسليمات نقدية الشاحنات.</p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-4">
        <Card>
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400 mb-1">
              <Clock className="h-4 w-4" />
              <span className="text-sm font-medium">طلبات قيد الانتظار</span>
            </div>
            <p className="text-2xl font-bold">{pending.length}</p>
            <p className="text-sm text-muted-foreground">{formatCurrency(pending.reduce((s, t) => s + t.amount, 0))}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center gap-2 text-green-600 dark:text-green-400 mb-1">
              <CheckCircle className="h-4 w-4" />
              <span className="text-sm font-medium">تحويلات مقبولة</span>
            </div>
            <p className="text-2xl font-bold">{approved.length}</p>
            <p className="text-sm text-muted-foreground">{formatCurrency(approved.reduce((s, t) => s + t.amount, 0))}</p>
          </CardContent>
        </Card>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input value={search} onChange={(e) => setSearch(e.target.value)}
          placeholder="ابحث بالشاحنة أو الملاحظة..." className="pr-9 pl-9" />
        {search && (
          <button onClick={() => setSearch("")} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
      {search.trim() && (
        <p className="text-sm text-muted-foreground -mt-2">{filtered.length} نتيجة من أصل {transfers.length}</p>
      )}

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>التاريخ</TableHead>
                <TableHead>الشاحنة</TableHead>
                <TableHead>المبلغ</TableHead>
                <TableHead>ملاحظة</TableHead>
                <TableHead>الحالة</TableHead>
                <TableHead className="text-center">إجراءات</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={6} className="text-center py-8">جارٍ التحميل...</TableCell></TableRow>
              ) : filtered.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="text-center py-8">{search.trim() ? "لا توجد نتائج مطابقة" : "لا توجد تحويلات"}</TableCell></TableRow>
              ) : (
                [...filtered].reverse().map((t) => (
                  <TableRow key={t.id}>
                    <TableCell className="text-muted-foreground text-sm whitespace-nowrap">
                      {new Date(t.createdAt).toLocaleDateString("ar-DZ")}
                    </TableCell>
                    <TableCell className="font-medium">{t.truckName}</TableCell>
                    <TableCell className="font-bold text-primary">{formatCurrency(t.amount)}</TableCell>
                    <TableCell className="text-muted-foreground">{t.note || "—"}</TableCell>
                    <TableCell>
                      <Badge variant={t.status === "approved" ? "default" : t.status === "rejected" ? "destructive" : "secondary"}>
                        {t.status === "approved" ? "مقبول" : t.status === "rejected" ? "مرفوض" : "قيد الانتظار"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-center">
                      {t.status === "pending" ? (
                        <div className="flex justify-center gap-1.5">
                          <Button
                            size="sm"
                            variant="default"
                            className="bg-green-600 hover:bg-green-700 h-8 px-2.5 text-xs"
                            disabled={processingId === t.id}
                            onClick={() => handleApprove(t.id)}
                          >
                            <CheckCircle className="h-3.5 w-3.5 ml-1" />
                            قبول
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            className="h-8 px-2.5 text-xs"
                            disabled={processingId === t.id}
                            onClick={() => handleReject(t.id)}
                          >
                            <XCircle className="h-3.5 w-3.5 ml-1" />
                            رفض
                          </Button>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
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
