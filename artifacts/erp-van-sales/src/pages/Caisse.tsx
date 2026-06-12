import { useState } from "react";
import { useListCashTransfers, useApproveCashTransfer, useRejectCashTransfer, useListInvoices } from "@workspace/api-client-react";
import { usePwaSync } from "@/contexts/PwaSyncContext";
import { useLocalCashTransfers, useLocalTrucks } from "@/lib/use-local-data";
import type { LocalTruck } from "@/lib/local-db";
import { WifiOff } from "lucide-react";
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
  const { online } = usePwaSync();
  const { data, isLoading } = useListCashTransfers();
  const { data: invData } = useListInvoices();
  const localTransferRows = useLocalCashTransfers() ?? [];
  const localTruckRows: LocalTruck[] = useLocalTrucks() ?? [];
  const queryClient = useQueryClient();

  const invoices = Array.isArray(invData) ? invData : [];
  const cashInvoices = invoices.filter((i) => i.paymentType === "cash");

  const apiTransfers = Array.isArray(data) ? data : [];
  const transfers = apiTransfers.length > 0
    ? apiTransfers
    : localTransferRows.map(lt => {
        const truck = localTruckRows.find(t => t.id === lt.truck_id);
        return {
          id: lt._lid ?? 0,
          truckName: truck?.name ?? `—`,
          amount: lt.amount ?? 0,
          note: lt.note ?? null,
          status: "pending" as const,
          createdAt: lt.created_at ?? new Date().toISOString(),
        };
      });

  const [search, setSearch] = useState("");
  const [processingId, setProcessingId] = useState<number | null>(null);

  const pending  = transfers.filter(t => t.status === "pending");
  const approved = transfers.filter(t => t.status === "approved");

  // Admin cash box balance = total cash physically received from trucks (approved deliveries)
  const cashBoxBalance = approved.reduce((s, t) => s + t.amount, 0);
  const cashSalesTotal = cashInvoices.reduce((s, i) => s + Number(i.totalAmount ?? 0), 0);

  // Unified cash operations: truck cash deliveries (transfers) + cash sales (invoices)
  type Op = {
    key: string;
    transferId?: number;
    kind: "transfer" | "sale";
    date: string;
    truckName: string;
    amount: number;
    note: string | null;
    status: "pending" | "approved" | "rejected" | "sale";
  };
  const operations: Op[] = [
    ...transfers.map((t) => ({
      key: `t-${t.id}`,
      transferId: t.id,
      kind: "transfer" as const,
      date: t.createdAt,
      truckName: t.truckName ?? "—",
      amount: t.amount,
      note: t.note ?? null,
      status: (t.status as Op["status"]) ?? "pending",
    })),
    ...cashInvoices.map((i) => ({
      key: `i-${i.id}`,
      kind: "sale" as const,
      date: i.createdAt ?? new Date().toISOString(),
      truckName: i.truckName ?? "—",
      amount: Number(i.totalAmount ?? 0),
      note: i.clientName ? `العميل: ${i.clientName}` : null,
      status: "sale" as const,
    })),
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const filtered = search.trim()
    ? operations.filter((o) => {
        const q = search.trim().toLowerCase();
        return (
          o.truckName.toLowerCase().includes(q) ||
          (o.note ?? "").toLowerCase().includes(q)
        );
      })
    : operations;

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
      {!online && (
        <div className="flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-300">
          <WifiOff className="h-4 w-4 shrink-0" />
          <span>أنت غير متصل — البيانات المعروضة من الذاكرة المحلية. قبول/رفض التحويلات يتطلب الاتصال.</span>
        </div>
      )}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">الصندوق والتحويلات</h1>
        <p className="text-muted-foreground">إدارة تسليمات نقدية الشاحنات.</p>
      </div>

      {/* Admin cash box balance */}
      <Card className="border-primary/30 bg-primary/5">
        <CardContent className="pt-5 pb-4">
          <div className="flex items-center gap-2 text-primary mb-1">
            <CheckCircle className="h-4 w-4" />
            <span className="text-sm font-medium">رصيد صندوق الإدارة</span>
          </div>
          <p className="text-3xl font-bold text-primary">{formatCurrency(cashBoxBalance)}</p>
          <p className="text-sm text-muted-foreground">إجمالي النقد المستلم من الشاحنات (تحويلات مقبولة)</p>
        </CardContent>
      </Card>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4">
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
        <Card>
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center gap-2 text-blue-600 dark:text-blue-400 mb-1">
              <CheckCircle className="h-4 w-4" />
              <span className="text-sm font-medium">مبيعات نقدية</span>
            </div>
            <p className="text-2xl font-bold">{cashInvoices.length}</p>
            <p className="text-sm text-muted-foreground">{formatCurrency(cashSalesTotal)}</p>
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
        <p className="text-sm text-muted-foreground -mt-2">{filtered.length} نتيجة من أصل {operations.length}</p>
      )}

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>التاريخ</TableHead>
                <TableHead>النوع</TableHead>
                <TableHead>الشاحنة</TableHead>
                <TableHead>المبلغ</TableHead>
                <TableHead>ملاحظة</TableHead>
                <TableHead>الحالة</TableHead>
                <TableHead className="text-center">إجراءات</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={7} className="text-center py-8">جارٍ التحميل...</TableCell></TableRow>
              ) : filtered.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="text-center py-8">{search.trim() ? "لا توجد نتائج مطابقة" : "لا توجد عمليات"}</TableCell></TableRow>
              ) : (
                filtered.map((o) => (
                  <TableRow key={o.key}>
                    <TableCell className="text-muted-foreground text-sm whitespace-nowrap">
                      {new Date(o.date).toLocaleDateString("ar-DZ")}
                    </TableCell>
                    <TableCell>
                      <Badge variant={o.kind === "sale" ? "outline" : "secondary"}>
                        {o.kind === "sale" ? "بيع نقدي" : "تسليم نقدي"}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-medium">{o.truckName}</TableCell>
                    <TableCell className="font-bold text-primary">{formatCurrency(o.amount)}</TableCell>
                    <TableCell className="text-muted-foreground">{o.note || "—"}</TableCell>
                    <TableCell>
                      {o.status === "sale" ? (
                        <Badge variant="outline">مكتمل</Badge>
                      ) : (
                        <Badge variant={o.status === "approved" ? "default" : o.status === "rejected" ? "destructive" : "secondary"}>
                          {o.status === "approved" ? "مقبول" : o.status === "rejected" ? "مرفوض" : "قيد الانتظار"}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      {o.kind === "transfer" && o.status === "pending" && o.transferId != null ? (
                        <div className="flex justify-center gap-1.5">
                          <Button
                            size="sm"
                            variant="default"
                            className="bg-green-600 hover:bg-green-700 h-8 px-2.5 text-xs"
                            disabled={processingId === o.transferId || !online}
                            onClick={() => handleApprove(o.transferId!)}
                          >
                            <CheckCircle className="h-3.5 w-3.5 ml-1" />
                            قبول
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            className="h-8 px-2.5 text-xs"
                            disabled={processingId === o.transferId || !online}
                            onClick={() => handleReject(o.transferId!)}
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
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
