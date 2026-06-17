import { useGetDashboardStats } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrency, formatDate, cn } from "@/lib/utils";
import { motion } from "framer-motion";
import {
  DollarSign,
  CreditCard,
  Truck,
  AlertCircle,
  AlertTriangle,
  ShoppingBag,
  ArrowRightLeft,
  TrendingUp,
  TrendingDown,
  Banknote,
  Building2,
  Sparkles,
  PackageSearch,
  Bot,
  Users,
} from "lucide-react";
import { fadeUp, accentStyles, type Accent } from "@/lib/motion-tokens";
import { StatCard as KpiCard } from "@/components/StatCard";
import { useArrival } from "@/experience/ArrivalProvider";

const aiInsights: {
  icon: typeof PackageSearch;
  accent: Accent;
  title: string;
  description: string;
  badge: string;
}[] = [
  {
    icon: PackageSearch,
    accent: "primary",
    title: "توصيات إعادة التموين",
    description: "زيت محرك 5W-30 — يكفي المخزون 3 أيام فقط، يُقترح طلب 40 وحدة إضافية.",
    badge: "أولوية عالية",
  },
  {
    icon: AlertTriangle,
    accent: "warning",
    title: "تنبيهات المخزون المنخفض",
    description: "فلتر هواء — 4 وحدات متبقية في المخزن المركزي.",
    badge: "أقل من 10",
  },
  {
    icon: TrendingUp,
    accent: "success",
    title: "الأكثر مبيعاً هذا الأسبوع",
    description: "بطارية 60 أمبير — 18 وحدة مباعة عبر الشاحنات.",
    badge: "+32%",
  },
  {
    icon: TrendingDown,
    accent: "muted",
    title: "منتجات راكدة",
    description: "إطار احتياطي مقاس 14 — لم يُباع منذ 21 يوماً.",
    badge: "راكد",
  },
  {
    icon: Truck,
    accent: "destructive",
    title: "تنبيهات الأسطول",
    description: "شاحنة 3 — لم تُسوَّ صندوقها منذ 4 أيام.",
    badge: "يتطلب تسوية",
  },
];

export default function Dashboard() {
  const { data: stats, isLoading } = useGetDashboardStats();
  // dashboardReady: cards stagger IN as the arrival curtain lifts.
  // isLeaving:      cards retreat OUT during Phase 8 (ack stage of logout).
  const { dashboardReady, isLeaving } = useArrival();
  // The cards' actual animate state — shown when the dashboard is ready AND
  // the user isn't leaving. Otherwise they retreat (reverse-stagger).
  const cardsShown = dashboardReady && !isLeaving;

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">لوحة التحكم</h1>
          <p className="text-muted-foreground text-sm">جارٍ تحميل مؤشرات الأداء...</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4, 5, 6, 7, 8].map(i => (
            <Card key={i} className="border-card-border">
              <CardContent className="p-5">
                <Skeleton className="h-4 w-24 mb-3" />
                <Skeleton className="h-8 w-32" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  const today = new Intl.DateTimeFormat("ar-DZ", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date());

  return (
    <div className="space-y-6">
      <motion.div
        variants={fadeUp}
        initial="hidden"
        animate={cardsShown ? "show" : "hidden"}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between"
      >
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">
            مركز قيادة <span className="text-primary">ALLAL DELIVERY</span>
          </h1>
          <p className="text-muted-foreground">نظرة شاملة على المخزون، الأسطول، والمبيعات لحظياً.</p>
        </div>
        <Badge variant="outline" className="self-start sm:self-auto text-xs font-medium text-muted-foreground border-border">
          {today}
        </Badge>
      </motion.div>

      {/* العمليات اليومية */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          index={0}
          reveal={cardsShown}
          label="مبيعات اليوم"
          value={formatCurrency(stats?.todaySales ?? 0)}
          icon={DollarSign}
          accent="primary"
        />
        <KpiCard
          index={1}
          reveal={cardsShown}
          label="مبيعات الشهر"
          value={formatCurrency(stats?.monthSales ?? 0)}
          icon={TrendingUp}
          accent="success"
        />
        <KpiCard
          index={2}
          reveal={cardsShown}
          label="فواتير اليوم"
          value={stats?.todayInvoices ?? 0}
          icon={ShoppingBag}
          accent="muted"
        />
        <KpiCard
          index={3}
          reveal={cardsShown}
          label="الشاحنات النشطة"
          value={stats?.activeTrucks ?? 0}
          icon={Truck}
          accent="muted"
        />
      </div>

      {/* السيولة والمستحقات */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          index={4}
          reveal={cardsShown}
          label="مبيعات نقدية اليوم"
          value={formatCurrency(stats?.todayCashSales ?? 0)}
          icon={Banknote}
          accent="success"
        />
        <KpiCard
          index={5}
          reveal={cardsShown}
          label="مبيعات بالدين اليوم"
          value={formatCurrency(stats?.todayCreditSales ?? 0)}
          icon={CreditCard}
          accent="warning"
        />
        <KpiCard
          index={6}
          reveal={cardsShown}
          label="ديون العملاء"
          value={formatCurrency(stats?.totalClientsDebt ?? 0)}
          icon={Users}
          accent="destructive"
        />
        <KpiCard
          index={7}
          reveal={cardsShown}
          label="ديون الموردين"
          value={formatCurrency(stats?.totalSuppliersDebt ?? 0)}
          icon={Building2}
          accent="destructive"
        />
      </div>

      {/* التنبيهات */}
      <div className="grid gap-4 sm:grid-cols-2">
        <KpiCard
          index={8}
          reveal={cardsShown}
          label="تحويلات معلقة"
          value={stats?.pendingCashTransfers ?? 0}
          icon={ArrowRightLeft}
          accent={stats?.pendingCashTransfers ? "warning" : "muted"}
          hint="بانتظار موافقة الصندوق"
        />
        <KpiCard
          index={9}
          reveal={cardsShown}
          label="منتجات بمخزون منخفض"
          value={stats?.lowStockProducts ?? 0}
          icon={AlertCircle}
          accent={stats?.lowStockProducts ? "destructive" : "muted"}
          hint="تحتاج إلى إعادة تموين"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* آخر الفواتير */}
        <motion.div
          variants={fadeUp}
          initial="hidden"
          animate={cardsShown ? "show" : "hidden"}
          transition={{ duration: 0.45, delay: 0.62, ease: [0.22, 1, 0.36, 1] }}
          className="lg:col-span-2"
        >
          <Card className="border-card-border h-full">
            <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
              <CardTitle className="text-base">آخر الفواتير</CardTitle>
              <Badge variant="secondary" className="text-xs">{stats?.recentInvoices?.length ?? 0} فاتورة</Badge>
            </CardHeader>
            <CardContent className="space-y-2">
              {stats?.recentInvoices?.length ? (
                stats.recentInvoices.map((invoice) => (
                  <div
                    key={invoice.id}
                    className="flex items-center justify-between gap-3 rounded-lg border border-border/60 bg-muted/30 px-3 py-2.5 transition-colors hover:bg-muted/60"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                        <Truck className="h-4 w-4" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{invoice.clientName}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {invoice.invoiceNumber} · {invoice.truckName} · {formatDate(invoice.createdAt)}
                        </p>
                      </div>
                    </div>
                    <div className="text-left shrink-0">
                      <p className="text-sm font-bold">{formatCurrency(invoice.totalAmount)}</p>
                      <Badge
                        variant={invoice.paymentType === "credit" ? "outline" : "secondary"}
                        className={cn(
                          "text-[10px] mt-0.5",
                          invoice.paymentType === "credit" && "text-destructive border-destructive/30"
                        )}
                      >
                        {invoice.paymentType === "credit" ? "بالدين" : "نقدي"}
                      </Badge>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground py-6 text-center">لا توجد فواتير حديثة.</p>
              )}
            </CardContent>
          </Card>
        </motion.div>

        {/* رؤى ذكية */}
        <motion.div
          variants={fadeUp}
          initial="hidden"
          animate={cardsShown ? "show" : "hidden"}
          transition={{ duration: 0.45, delay: 0.7, ease: [0.22, 1, 0.36, 1] }}
        >
          <Card className="border-card-border h-full bg-gradient-to-br from-primary/10 via-card to-card">
            <CardHeader className="flex flex-row items-center gap-2 pb-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/15 text-primary ring-1 ring-primary/25">
                <Bot className="h-4 w-4" />
              </div>
              <CardTitle className="text-base">المساعد الذكي</CardTitle>
              <Badge variant="outline" className="ms-auto text-[10px] text-primary border-primary/30 gap-1">
                <Sparkles className="h-3 w-3" /> قريباً
              </Badge>
            </CardHeader>
            <CardContent className="space-y-2.5">
              {aiInsights.map((insight) => {
                const Icon = insight.icon;
                const styles = accentStyles[insight.accent];
                return (
                  <div
                    key={insight.title}
                    className="flex items-start gap-3 rounded-lg border border-border/60 bg-muted/30 p-3"
                  >
                    <div className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-md", styles.icon)}>
                      <Icon className="h-3.5 w-3.5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-medium truncate">{insight.title}</p>
                        <Badge variant="outline" className={cn("text-[10px] shrink-0", styles.value)}>
                          {insight.badge}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">{insight.description}</p>
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </div>
  );
}
