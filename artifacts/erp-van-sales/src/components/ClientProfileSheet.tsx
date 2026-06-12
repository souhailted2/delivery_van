import { useState } from "react";
import { useGetClientProfile, useUpdateClient } from "@workspace/api-client-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatCurrency } from "@/lib/utils";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { User, ShoppingBag, TrendingUp, CreditCard, Phone, Check, X } from "lucide-react";

type ClientType = "retail" | "half_wholesale" | "wholesale";

const CLIENT_TYPE_LABELS: Record<ClientType, string> = {
  retail: "تجزئة",
  half_wholesale: "نصف جملة",
  wholesale: "جملة",
};

type ClientInfo = {
  id: number;
  name: string;
  phone?: string | null;
  clientType: ClientType;
  balance: number;
};

function StatCard({
  label,
  value,
  color,
  isCount,
}: {
  label: string;
  value: number;
  color: "emerald" | "blue" | "amber" | "red";
  isCount?: boolean;
}) {
  const colorMap = {
    emerald:
      "bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400",
    blue: "bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-400",
    amber:
      "bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-400",
    red: "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800 text-red-700 dark:text-red-400",
  };
  const textClass = colorMap[color].split(" ").slice(-2).join(" ");
  return (
    <div className={`rounded-lg border p-3 text-center ${colorMap[color]}`}>
      <p className="text-xs text-muted-foreground mb-1">{label}</p>
      <p className={`font-bold text-sm ${textClass}`}>
        {isCount ? value : formatCurrency(value)}
      </p>
    </div>
  );
}

function ClientProfileContent({ client }: { client: ClientInfo }) {
  const queryClient = useQueryClient();
  const { data: profile, isLoading } = useGetClientProfile(client.id);
  const updateClient = useUpdateClient();

  const [editingType, setEditingType] = useState(false);
  const [typeValue, setTypeValue] = useState<ClientType>(client.clientType);
  const [displayType, setDisplayType] = useState<ClientType>(client.clientType);

  const handleSaveType = () => {
    updateClient.mutate(
      { id: client.id, data: { name: client.name, clientType: typeValue } },
      {
        onSuccess: () => {
          setDisplayType(typeValue);
          setEditingType(false);
          queryClient.invalidateQueries({ queryKey: ["/api/clients"] });
          toast.success("تم تحديث نوع العميل");
        },
        onError: () => toast.error("حدث خطأ أثناء التحديث"),
      }
    );
  };

  const typeBadgeVariant = (t: ClientType): "default" | "secondary" | "outline" =>
    t === "wholesale" ? "default" : t === "half_wholesale" ? "secondary" : "outline";

  return (
    <>
      <SheetHeader className="pb-4 border-b">
        <SheetTitle className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
            <User className="h-5 w-5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-lg font-bold">{client.name}</p>
            <div className="flex items-center gap-3 text-sm text-muted-foreground font-normal flex-wrap">
              {client.phone && (
                <span className="flex items-center gap-1">
                  <Phone className="h-3.5 w-3.5 shrink-0" />
                  {client.phone}
                </span>
              )}
              {/* Inline client type edit */}
              <span className="flex items-center gap-1">
                {editingType ? (
                  <span className="flex items-center gap-1">
                    <Select value={typeValue} onValueChange={(v) => setTypeValue(v as ClientType)}>
                      <SelectTrigger className="h-6 w-32 text-xs px-1.5">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="retail">تجزئة</SelectItem>
                        <SelectItem value="half_wholesale">نصف جملة</SelectItem>
                        <SelectItem value="wholesale">جملة</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-5 w-5"
                      onClick={handleSaveType}
                      disabled={updateClient.isPending}
                    >
                      <Check className="h-3 w-3 text-green-600" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-5 w-5"
                      onClick={() => { setTypeValue(displayType); setEditingType(false); }}
                    >
                      <X className="h-3 w-3 text-red-500" />
                    </Button>
                  </span>
                ) : (
                  <button
                    className="flex items-center gap-1 hover:opacity-80 transition-opacity group"
                    onClick={() => setEditingType(true)}
                    title="تغيير نوع العميل"
                  >
                    <Badge variant={typeBadgeVariant(displayType)}>
                      {CLIENT_TYPE_LABELS[displayType] ?? displayType}
                    </Badge>
                  </button>
                )}
              </span>
            </div>
          </div>
        </SheetTitle>
      </SheetHeader>

      {isLoading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground text-sm">
          جارٍ التحميل...
        </div>
      ) : !profile ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground text-sm">
          تعذّر تحميل البيانات
        </div>
      ) : (
        <Tabs defaultValue="stats" className="mt-4">
          <TabsList className="w-full grid grid-cols-2">
            <TabsTrigger value="stats" className="gap-1.5">
              <TrendingUp className="h-4 w-4" /> الإحصائيات
            </TabsTrigger>
            <TabsTrigger value="products" className="gap-1.5">
              <ShoppingBag className="h-4 w-4" /> الأكثر شراءً
            </TabsTrigger>
          </TabsList>

          {/* Stats Tab */}
          <TabsContent value="stats" className="mt-4 space-y-4">
            {/* Summary cards */}
            <div className="grid grid-cols-2 gap-3">
              <StatCard
                label={`مشتريات ${new Date().getFullYear()}`}
                value={profile.totalYearPurchases}
                color="emerald"
              />
              <StatCard
                label="رصيد الدين"
                value={Math.abs(profile.debtBalance)}
                color={profile.debtBalance < 0 ? "red" : "blue"}
              />
              <StatCard
                label="عدد الفواتير"
                value={profile.invoiceCount}
                color="blue"
                isCount
              />
              <StatCard
                label="فواتير الآجل"
                value={profile.creditInvoiceCount}
                color="amber"
                isCount
              />
            </div>

            {/* Last Invoice */}
            <div className="rounded-lg border p-4 space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                آخر فاتورة
              </p>
              {profile.lastInvoice ? (
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CreditCard className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-medium">
                      {new Date(profile.lastInvoice.createdAt).toLocaleDateString("ar-DZ", {
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                      })}
                    </span>
                    <Badge variant={profile.lastInvoice.paymentType === "credit" ? "secondary" : "outline"}>
                      {profile.lastInvoice.paymentType === "credit" ? "آجل" : "نقداً"}
                    </Badge>
                  </div>
                  <span className="font-bold text-emerald-700 dark:text-emerald-400">
                    {formatCurrency(profile.lastInvoice.totalAmount)}
                  </span>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">لا توجد فواتير بعد</p>
              )}
            </div>
          </TabsContent>

          {/* Top Products Tab */}
          <TabsContent value="products" className="mt-4">
            {!profile.topProducts?.length ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                لا توجد مشتريات مسجّلة بعد
              </p>
            ) : (
              <div className="rounded-lg border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>المنتج</TableHead>
                      <TableHead className="text-left">الكمية</TableHead>
                      <TableHead className="text-left">الإجمالي</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {profile.topProducts.map((p) => (
                      <TableRow key={p.productId}>
                        <TableCell className="font-medium">{p.productName}</TableCell>
                        <TableCell className="text-left text-muted-foreground text-sm">
                          {p.totalQty % 1 === 0 ? p.totalQty : p.totalQty.toFixed(3)}
                        </TableCell>
                        <TableCell className="text-left font-bold text-emerald-700 dark:text-emerald-400">
                          {formatCurrency(p.totalValue)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </TabsContent>
        </Tabs>
      )}
    </>
  );
}

export function ClientProfileSheet({
  client,
  open,
  onClose,
}: {
  client: ClientInfo | null;
  open: boolean;
  onClose: () => void;
}) {
  return (
    <Sheet open={open} onOpenChange={onClose}>
      <SheetContent side="left" className="w-full sm:max-w-xl overflow-y-auto" dir="rtl">
        {client && <ClientProfileContent client={client} />}
      </SheetContent>
    </Sheet>
  );
}
