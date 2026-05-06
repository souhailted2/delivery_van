import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useGetDailyReport } from "@workspace/api-client-react";
import { formatCurrency } from "@/lib/utils";

export default function Rapports() {
  const { data: report, isLoading } = useGetDailyReport();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">التقارير</h1>
        <p className="text-muted-foreground">تحليلات وإحصاءات الأداء.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">إجمالي المبيعات (اليوم)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {isLoading ? "..." : formatCurrency(report?.totalSales ?? 0)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">مبيعات نقدية</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-primary">
              {isLoading ? "..." : formatCurrency(report?.cashSales ?? 0)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">مبيعات آجلة</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive">
              {isLoading ? "..." : formatCurrency(report?.creditSales ?? 0)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">العمولات</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {isLoading ? "..." : formatCurrency(report?.totalCommission ?? 0)}
            </div>
          </CardContent>
        </Card>
      </div>

      {report && Array.isArray(report.byTruck) && report.byTruck.length > 0 && (
        <div className="grid gap-4 md:grid-cols-2">
          {report.byTruck.map((truck) => (
            <Card key={truck.truckId}>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">{truck.truckName}</CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <p className="text-muted-foreground">مبيعات اليوم</p>
                  <p className="font-bold">{formatCurrency(truck.totalSales)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">نقداً</p>
                  <p className="font-bold text-primary">{formatCurrency(truck.cashSales)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">آجل</p>
                  <p className="font-bold text-destructive">{formatCurrency(truck.creditSales)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">عدد الفواتير</p>
                  <p className="font-bold">{truck.invoiceCount}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
