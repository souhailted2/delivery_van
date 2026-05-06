import { useState } from "react";
import { useGetMyTruckCash, useCreateMyTruckCashTransfer } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { formatCurrency } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { ArrowRight, Wallet, TrendingUp, Send, Clock, CheckCircle, XCircle, ArrowUpCircle } from "lucide-react";

const statusConfig = {
  pending:  { label: "قيد الانتظار", variant: "secondary" as const, icon: Clock },
  approved: { label: "مقبول",         variant: "default"   as const, icon: CheckCircle },
  rejected: { label: "مرفوض",         variant: "destructive" as const, icon: XCircle },
};

export default function TruckCash({ onBack }: { onBack: () => void }) {
  const queryClient = useQueryClient();
  const { data, isLoading, refetch } = useGetMyTruckCash();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [amount, setAmount]   = useState("");
  const [note,   setNote]     = useState("");

  const cashInfo = data as {
    truckId: number; truckName: string; cashBalance: number;
    totalCashSales: number; totalTransferred: number; pendingAmount: number;
    transfers: { id: number; amount: number; status: string; note?: string | null; createdAt: string }[];
  } | undefined;

  const createTransfer = useCreateMyTruckCashTransfer({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["/api/trucks/me/cash"] });
        refetch();
        toast.success("تم إرسال طلب التحويل للإدارة");
        setDialogOpen(false);
        setAmount("");
        setNote("");
      },
      onError: (err: any) => {
        const msg = err?.response?.data?.error ?? "حدث خطأ";
        if (msg.includes("supérieur")) toast.error("المبلغ أكبر من الرصيد المتاح");
        else toast.error("حدث خطأ أثناء إرسال الطلب");
      },
    },
  });

  const handleSubmit = () => {
    const val = Number(amount);
    if (!val || val <= 0) { toast.error("أدخل مبلغاً صحيحاً"); return; }
    if (cashInfo && val > cashInfo.cashBalance) { toast.error("المبلغ أكبر من الرصيد"); return; }
    createTransfer.mutate({ data: { amount: val, note: note.trim() || undefined as any } });
  };

  const transfers = [...(cashInfo?.transfers ?? [])].reverse();

  return (
    <div className="min-h-screen bg-background flex flex-col" dir="rtl">
      {/* Header */}
      <header className="border-b bg-card px-4 py-3 flex items-center justify-between sticky top-0 z-10">
        <button onClick={onBack} className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors">
          <ArrowRight className="h-5 w-5" />
          <span className="text-sm font-medium">رجوع</span>
        </button>
        <h1 className="text-base font-bold">رصيد الشاحنة</h1>
        <div className="w-14" />
      </header>

      <div className="flex-1 overflow-y-auto p-4 space-y-4 pb-28">
        {isLoading ? (
          <div className="text-center py-20 text-muted-foreground">جارٍ التحميل...</div>
        ) : (
          <>
            {/* Main balance card */}
            <Card className="bg-primary text-primary-foreground">
              <CardContent className="p-5">
                <div className="flex items-center gap-2 mb-1">
                  <Wallet className="h-5 w-5 opacity-80" />
                  <span className="text-sm opacity-80">الرصيد الحالي</span>
                </div>
                <p className="text-4xl font-bold tracking-tight">
                  {formatCurrency(cashInfo?.cashBalance ?? 0)}
                </p>
                {(cashInfo?.pendingAmount ?? 0) > 0 && (
                  <p className="text-xs mt-2 opacity-75">
                    في انتظار الموافقة: {formatCurrency(cashInfo!.pendingAmount)}
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Stats */}
            <div className="grid grid-cols-2 gap-3">
              <Card>
                <CardHeader className="pb-1 pt-4 px-4">
                  <CardTitle className="text-xs text-muted-foreground flex items-center gap-1">
                    <TrendingUp className="h-3.5 w-3.5" /> إجمالي المبيعات النقدية
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-4">
                  <p className="text-lg font-bold text-green-600 dark:text-green-400">
                    {formatCurrency(cashInfo?.totalCashSales ?? 0)}
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-1 pt-4 px-4">
                  <CardTitle className="text-xs text-muted-foreground flex items-center gap-1">
                    <Send className="h-3.5 w-3.5" /> إجمالي المحوّل للإدارة
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-4">
                  <p className="text-lg font-bold text-blue-600 dark:text-blue-400">
                    {formatCurrency(cashInfo?.totalTransferred ?? 0)}
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* Transfer history */}
            <div>
              <h2 className="text-base font-bold mb-3">سجل التحويلات</h2>
              {transfers.length === 0 ? (
                <Card>
                  <CardContent className="py-10 text-center text-muted-foreground">
                    لا توجد تحويلات بعد
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-2">
                  {transfers.map((t) => {
                    const cfg = statusConfig[t.status as keyof typeof statusConfig] ?? statusConfig.pending;
                    const Icon = cfg.icon;
                    return (
                      <Card key={t.id}>
                        <CardContent className="p-4">
                          <div className="flex justify-between items-start gap-2">
                            <div className="flex items-center gap-2">
                              <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
                              <div>
                                <p className="font-bold text-primary">{formatCurrency(t.amount)}</p>
                                {t.note && <p className="text-xs text-muted-foreground mt-0.5">{t.note}</p>}
                                <p className="text-xs text-muted-foreground mt-0.5">
                                  {new Date(t.createdAt).toLocaleDateString("ar-DZ")}
                                </p>
                              </div>
                            </div>
                            <Badge variant={cfg.variant}>{cfg.label}</Badge>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* Transfer button */}
      <div className="fixed bottom-0 left-0 right-0 bg-card border-t p-4 z-20">
        <Button
          className="w-full"
          size="lg"
          onClick={() => setDialogOpen(true)}
          disabled={!cashInfo || cashInfo.cashBalance <= 0}
        >
          <ArrowUpCircle className="h-5 w-5 ml-2" />
          تحويل إلى الإدارة
        </Button>
      </div>

      {/* Transfer dialog */}
      <Dialog open={dialogOpen} onOpenChange={(open) => { if (!open) { setDialogOpen(false); setAmount(""); setNote(""); } }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>طلب تحويل إلى الإدارة</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="bg-muted rounded-lg p-3 text-center">
              <p className="text-xs text-muted-foreground mb-1">الرصيد المتاح</p>
              <p className="text-2xl font-bold text-primary">{formatCurrency(cashInfo?.cashBalance ?? 0)}</p>
            </div>
            <div className="space-y-1.5">
              <Label>المبلغ *</Label>
              <Input
                type="number"
                min="1"
                max={cashInfo?.cashBalance}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0"
                className="text-center text-xl font-bold"
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label>ملاحظة (اختياري)</Label>
              <Input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="مثال: تسليم يوم الخميس"
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>إلغاء</Button>
            <Button
              disabled={!amount || Number(amount) <= 0 || createTransfer.isPending}
              onClick={handleSubmit}
            >
              {createTransfer.isPending ? "جارٍ الإرسال..." : "إرسال الطلب"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
