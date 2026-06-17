import { useState } from "react";
import { useGetWarehouseStock } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn, formatCurrency } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Search, X, Boxes, Wallet, PackageX, AlertTriangle } from "lucide-react";
import { StatCard } from "@/components/StatCard";

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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">المخزن المركزي</h1>
        <p className="text-muted-foreground">جرد المستودع الرئيسي.</p>
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
