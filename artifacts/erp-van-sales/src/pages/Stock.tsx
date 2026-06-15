import { useState } from "react";
import {
  useGetWarehouseStock,
  useListTrucks,
  useTransferStock,
} from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn, formatCurrency } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowRightLeft, Search, X, Boxes, Wallet, PackageX, AlertTriangle } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { StatCard } from "@/components/StatCard";

type TransferRow = { productId: number; quantity: string };

function getStockHealth(quantity: number) {
  if (quantity <= 0) {
    return {
      label: "نفد المخزون",
      className: "text-destructive border-destructive/30 bg-destructive/10",
      dot: "bg-destructive",
    };
  }
  if (quantity < 10) {
    return {
      label: "مخزون منخفض",
      className: "text-warning border-warning/30 bg-warning/10",
      dot: "bg-warning",
    };
  }
  return {
    label: "متوفر",
    className: "text-success border-success/30 bg-success/10",
    dot: "bg-success",
  };
}

export default function Stock() {
  const { data, isLoading } = useGetWarehouseStock();
  const stock = Array.isArray(data) ? data : [];

  const { data: trucksData } = useListTrucks();
  const trucks = Array.isArray(trucksData) ? trucksData : [];

  const queryClient = useQueryClient();

  const totalValue = stock.reduce((sum, s) => sum + s.quantity * s.purchasePrice, 0);
  const outOfStockCount = stock.filter((s) => s.quantity <= 0).length;
  const lowStockCount = stock.filter((s) => s.quantity > 0 && s.quantity < 10).length;

  const [search, setSearch] = useState("");
  const filtered = search.trim()
    ? stock.filter((s) => {
        const q = search.trim().toLowerCase();
        return (
          s.productName.toLowerCase().includes(q) ||
          (s.categoryName ?? "").toLowerCase().includes(q)
        );
      })
    : stock;

  const [open, setOpen] = useState(false);
  const [truckId, setTruckId] = useState("");
  const [rows, setRows] = useState<TransferRow[]>([]);
  const [dialogSearch, setDialogSearch] = useState("");

  const dialogFiltered = dialogSearch.trim()
    ? stock.filter((s) => {
        if (s.quantity <= 0) return false;
        const q = dialogSearch.trim().toLowerCase();
        return (
          s.productName.toLowerCase().includes(q) ||
          (s.categoryName ?? "").toLowerCase().includes(q)
        );
      })
    : stock.filter((s) => s.quantity > 0);

  // Open dialog — pre-populate one row per warehouse item with qty=0
  const openDialog = () => {
    setTruckId("");
    setDialogSearch("");
    setRows(
      stock
        .filter((s) => s.quantity > 0)
        .map((s) => ({ productId: s.productId, quantity: "0" }))
    );
    setOpen(true);
  };

  const setQty = (productId: number, value: string) =>
    setRows((prev) =>
      prev.map((r) => (r.productId === productId ? { ...r, quantity: value } : r))
    );

  const transferStock = useTransferStock({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["/api/stock/warehouse"] });
        queryClient.invalidateQueries({ queryKey: ["/api/stock/trucks"] });
        queryClient.invalidateQueries({ queryKey: ["/api/stock/transfers"] });
        toast.success("تم تحويل المخزون إلى الشاحنة بنجاح");
        setOpen(false);
      },
      onError: (err: unknown) => {
        const msg =
          err && typeof err === "object" && "message" in err
            ? String((err as { message: string }).message)
            : "حدث خطأ أثناء التحويل";
        toast.error(msg);
      },
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!truckId) { toast.error("اختر الشاحنة"); return; }

    const items = rows
      .filter((r) => Number(r.quantity) > 0)
      .map((r) => ({ productId: r.productId, quantity: Number(r.quantity) }));

    if (items.length === 0) { toast.error("أدخل كمية واحدة على الأقل"); return; }

    // Validate not exceeding warehouse qty
    for (const item of items) {
      const stockItem = stock.find((s) => s.productId === item.productId);
      if (stockItem && item.quantity > stockItem.quantity) {
        toast.error(`الكمية تتجاوز المخزون لـ ${stockItem.productName}`);
        return;
      }
    }

    transferStock.mutate({ data: { truckId: Number(truckId), items } });
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">المخزن المركزي</h1>
          <p className="text-muted-foreground">جرد المستودع الرئيسي.</p>
        </div>
        <Button onClick={openDialog} disabled={stock.length === 0}>
          <ArrowRightLeft className="ml-2 h-4 w-4" /> تحويل إلى شاحنة
        </Button>
      </div>

      {/* Inventory intelligence */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard index={0} label="عدد المنتجات" value={stock.length} icon={Boxes} accent="primary" />
        <StatCard index={1} label="قيمة المخزون" value={formatCurrency(totalValue)} icon={Wallet} accent="success" hint="بسعر الشراء" />
        <StatCard
          index={2}
          label="مخزون منخفض"
          value={lowStockCount}
          icon={AlertTriangle}
          accent={lowStockCount ? "warning" : "muted"}
          hint="أقل من 10 وحدات"
        />
        <StatCard
          index={3}
          label="نفد المخزون"
          value={outOfStockCount}
          icon={PackageX}
          accent={outOfStockCount ? "destructive" : "muted"}
        />
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="ابحث بالمنتج أو الفئة..."
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
          {filtered.length} نتيجة من أصل {stock.length}
        </p>
      )}

      {/* Transfer Dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>تحويل مخزون من المستودع إلى الشاحنة</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-5">

            {/* Truck selector */}
            <div className="space-y-2">
              <Label>الشاحنة المستلِمة *</Label>
              <Select value={truckId} onValueChange={setTruckId}>
                <SelectTrigger>
                  <SelectValue placeholder="اختر الشاحنة" />
                </SelectTrigger>
                <SelectContent>
                  {trucks.map((t) => (
                    <SelectItem key={t.id} value={String(t.id)}>{t.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Items table */}
            <div className="space-y-2">
              <Label>الكميات المحوَّلة</Label>

              {/* Dialog search */}
              <div className="relative">
                <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  value={dialogSearch}
                  onChange={(e) => setDialogSearch(e.target.value)}
                  placeholder="ابحث بالمنتج أو الفئة..."
                  className="pr-9 pl-9"
                />
                {dialogSearch && (
                  <button
                    type="button"
                    onClick={() => setDialogSearch("")}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
              {dialogSearch.trim() && (
                <p className="text-xs text-muted-foreground">
                  {dialogFiltered.length} نتيجة من أصل {stock.filter(s => s.quantity > 0).length}
                </p>
              )}

              <div className="rounded-md border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>المنتج</TableHead>
                      <TableHead>الفئة</TableHead>
                      <TableHead className="text-center">المتاح</TableHead>
                      <TableHead className="w-32 text-center">الكمية المحوَّلة</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {dialogFiltered.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center py-6 text-muted-foreground">
                          لا توجد نتائج مطابقة
                        </TableCell>
                      </TableRow>
                    ) : dialogFiltered.map((s) => {
                        const row = rows.find((r) => r.productId === s.productId);
                        const qty = Number(row?.quantity ?? 0);
                        return (
                          <TableRow key={s.productId}>
                            <TableCell className="font-medium">{s.productName}</TableCell>
                            <TableCell>{s.categoryName || "-"}</TableCell>
                            <TableCell className="text-center">
                              <Badge variant="outline">{s.quantity} {s.unit}</Badge>
                            </TableCell>
                            <TableCell className="text-center">
                              <Input
                                type="number"
                                min="0"
                                max={s.quantity}
                                className={`h-8 w-24 text-center mx-auto ${qty > s.quantity ? "border-destructive" : ""}`}
                                value={row?.quantity ?? "0"}
                                onChange={(e) => setQty(s.productId, e.target.value)}
                              />
                            </TableCell>
                          </TableRow>
                        );
                      })}
                  </TableBody>
                </Table>
              </div>
            </div>

            {/* Summary */}
            <p className="text-sm text-muted-foreground">
              المنتجات المحددة:{" "}
              <span className="font-bold text-foreground">
                {rows.filter((r) => Number(r.quantity) > 0).length}
              </span>
            </p>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                إلغاء
              </Button>
              <Button type="submit" disabled={transferStock.isPending}>
                {transferStock.isPending ? "جارٍ التحويل..." : "تأكيد التحويل"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Warehouse stock table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>المنتج</TableHead>
                <TableHead>الفئة</TableHead>
                <TableHead>الكمية</TableHead>
                <TableHead>الحالة</TableHead>
                <TableHead>سعر الشراء</TableHead>
                <TableHead>القيمة الإجمالية</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8">جارٍ التحميل...</TableCell>
                </TableRow>
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8">{search.trim() ? "لا توجد نتائج مطابقة" : "لا توجد منتجات في المخزن"}</TableCell>
                </TableRow>
              ) : (
                filtered.map((s) => {
                  const health = getStockHealth(s.quantity);
                  return (
                    <TableRow key={s.productId}>
                      <TableCell className="font-medium">{s.productName}</TableCell>
                      <TableCell>{s.categoryName || "-"}</TableCell>
                      <TableCell className={cn("tabular-nums", s.quantity < 10 && "font-bold")}>
                        {s.quantity} {s.unit}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={cn("gap-1.5 text-xs", health.className)}>
                          <span className={cn("h-1.5 w-1.5 rounded-full", health.dot)} />
                          {health.label}
                        </Badge>
                      </TableCell>
                      <TableCell className="tabular-nums">{formatCurrency(s.purchasePrice)}</TableCell>
                      <TableCell className="tabular-nums font-medium">{formatCurrency(s.quantity * s.purchasePrice)}</TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
