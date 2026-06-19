import { Feather } from "@expo/vector-icons";
import { useRefreshOnFocus } from "@/hooks/useRefreshOnFocus";
import { useCallback, useState } from "react";
import {
  RefreshControl, ScrollView, StyleSheet, Text, View,
} from "react-native";
import { SyncBar } from "@/components/SyncBar";
import { MoneyText, PressableScale } from "@/components/ui";
import { useSync } from "@/contexts/SyncContext";
import { getDb } from "@/lib/db";
import { fonts } from "@/constants/tokens";
import { useTheme, type Theme } from "@/hooks/useTheme";

interface Stats {
  totalInvoices: number;
  totalRevenue: number;
  totalCash: number;
  totalCredit: number;
  totalReturns: number;
  totalReturnsAmount: number;
  totalPurchases: number;
  totalPurchasesAmount: number;
  totalCashIn: number;
  totalCashOut: number;
  topProducts: { name: string; qty: number }[];
  topClients: { name: string; total: number }[];
}

const PERIODS = ["اليوم", "هذا الأسبوع", "هذا الشهر", "الكل"] as const;
type Period = (typeof PERIODS)[number];

function getStartDate(period: Period): string | null {
  const now = new Date();
  if (period === "الكل") return null;
  if (period === "اليوم") {
    const d = new Date(now);
    d.setHours(0, 0, 0, 0);
    return d.toISOString();
  }
  if (period === "هذا الأسبوع") {
    const d = new Date(now);
    const day = d.getDay();
    d.setDate(d.getDate() - day);
    d.setHours(0, 0, 0, 0);
    return d.toISOString();
  }
  if (period === "هذا الشهر") {
    return new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  }
  return null;
}

function StatCard({ label, value, money, icon, color, t }: {
  label: string; value?: string; money?: number; icon: any; color: string; t: Theme;
}) {
  const c = t.color;
  return (
    <View style={[styles.statCard, { backgroundColor: c.surface, borderColor: c.hairline }]}>
      <View style={[styles.statIcon, { backgroundColor: c.brandTint }]}>
        <Feather name={icon} size={18} color={color} />
      </View>
      {money !== undefined
        ? <MoneyText amount={money} size="callout" />
        : <Text style={[styles.statVal, { color: c.text }]}>{value}</Text>}
      <Text style={[styles.statLabel, { color: c.textMuted }]}>{label}</Text>
    </View>
  );
}

export default function RapportsScreen() {
  const t = useTheme();
  const c = t.color;
  const { triggerSync } = useSync();
  const [period, setPeriod] = useState<Period>("هذا الشهر");
  const [stats, setStats] = useState<Stats | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const db = await getDb();
    if (!db) return;
    const startDate = getStartDate(period);
    const dateFilter = startDate ? "AND created_at >= ?" : "";
    const params = startDate ? [startDate] : [];

    const [
      invRow, cashRow, creditRow,
      returnRow, returnAmtRow,
      purchRow,
      cashInRow, cashOutRow,
      topProds, topClients,
    ] = await Promise.all([
      db.getFirstAsync<{ cnt: number; total: number }>(
        `SELECT COUNT(*) as cnt, COALESCE(SUM(total_amount),0) as total FROM invoices WHERE is_deleted=0 ${dateFilter}`, params),
      db.getFirstAsync<{ total: number }>(
        `SELECT COALESCE(SUM(total_amount),0) as total FROM invoices WHERE is_deleted=0 AND payment_type='cash' ${dateFilter}`, params),
      db.getFirstAsync<{ total: number }>(
        `SELECT COALESCE(SUM(total_amount),0) as total FROM invoices WHERE is_deleted=0 AND payment_type='credit' ${dateFilter}`, params),
      db.getFirstAsync<{ cnt: number }>(
        `SELECT COUNT(*) as cnt FROM returns WHERE is_deleted=0 ${dateFilter}`, params),
      db.getFirstAsync<{ total: number }>(
        `SELECT COALESCE(SUM(total_amount),0) as total FROM returns WHERE is_deleted=0 ${dateFilter}`, params),
      db.getFirstAsync<{ cnt: number }>(
        `SELECT COUNT(*) as cnt FROM purchases WHERE is_deleted=0 ${dateFilter}`, params),
      db.getFirstAsync<{ total: number }>(
        `SELECT COALESCE(SUM(amount),0) as total FROM cash_transfers WHERE is_deleted=0 AND status='approved' AND direction='in' ${dateFilter}`, params),
      db.getFirstAsync<{ total: number }>(
        `SELECT COALESCE(SUM(amount),0) as total FROM cash_transfers WHERE is_deleted=0 AND status='approved' AND direction='out' ${dateFilter}`, params),
      db.getAllAsync<{ name: string; qty: number }>(
        `SELECT ii.product_name as name, COALESCE(SUM(ii.quantity),0) as qty
         FROM invoice_items ii
         JOIN invoices i ON ii.invoice_sync_id = i.sync_id OR ii.invoice_id = i.id
         WHERE i.is_deleted=0 ${startDate ? "AND i.created_at >= ?" : ""}
         GROUP BY ii.product_name ORDER BY qty DESC LIMIT 5`,
        startDate ? [startDate] : []
      ),
      db.getAllAsync<{ name: string; total: number }>(
        `SELECT COALESCE(c.name, 'بدون عميل') as name, COALESCE(SUM(i.total_amount),0) as total
         FROM invoices i
         LEFT JOIN clients c ON c.id = i.client_id OR c.sync_id = i.client_sync_id
         WHERE i.is_deleted=0 ${startDate ? "AND i.created_at >= ?" : ""}
         GROUP BY i.client_sync_id, i.client_id ORDER BY total DESC LIMIT 5`,
        startDate ? [startDate] : []
      ),
    ]);

    setStats({
      totalInvoices: invRow?.cnt ?? 0,
      totalRevenue: invRow?.total ?? 0,
      totalCash: cashRow?.total ?? 0,
      totalCredit: creditRow?.total ?? 0,
      totalReturns: returnRow?.cnt ?? 0,
      totalReturnsAmount: returnAmtRow?.total ?? 0,
      totalPurchases: purchRow?.cnt ?? 0,
      totalPurchasesAmount: 0,
      totalCashIn: cashInRow?.total ?? 0,
      totalCashOut: cashOutRow?.total ?? 0,
      topProducts: topProds,
      topClients: topClients,
    });
  }, [period]);

  useRefreshOnFocus(load);

  const onRefresh = async () => {
    setRefreshing(true);
    triggerSync();
    await load();
    setRefreshing(false);
  };

  return (
    <View style={[styles.container, { backgroundColor: c.bg }]}>
      <SyncBar />

      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.brand} />}
        showsVerticalScrollIndicator={false}
      >
        {/* Period selector */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.periods}>
          {PERIODS.map(p => (
            <PressableScale
              key={p}
              style={[styles.periodBtn, { backgroundColor: period === p ? c.brand : c.surface, borderColor: period === p ? c.brand : c.hairline }]}
              onPress={() => setPeriod(p)}
            >
              <Text style={[styles.periodText, { color: period === p ? c.onBrand : c.text }]}>{p}</Text>
            </PressableScale>
          ))}
        </ScrollView>

        {stats && (
          <>
            {/* Main stats grid */}
            <View style={styles.statsGrid}>
              <StatCard label="المبيعات" money={stats.totalRevenue} icon="trending-up" color={c.brandBright} t={t} />
              <StatCard label="الفواتير" value={String(stats.totalInvoices)} icon="file-text" color={c.brandBright} t={t} />
              <StatCard label="نقداً" money={stats.totalCash} icon="check-circle" color={c.success} t={t} />
              <StatCard label="آجل" money={stats.totalCredit} icon="clock" color={c.warning} t={t} />
            </View>

            <View style={styles.statsGrid}>
              <StatCard label="المرتجعات" money={stats.totalReturnsAmount} icon="rotate-ccw" color={c.danger} t={t} />
              <StatCard label="عدد المرتجعات" value={String(stats.totalReturns)} icon="refresh-cw" color={c.danger} t={t} />
              <StatCard label="تحصيل الصندوق" money={stats.totalCashIn} icon="arrow-down-circle" color={c.success} t={t} />
              <StatCard label="صرف الصندوق" money={stats.totalCashOut} icon="arrow-up-circle" color={c.danger} t={t} />
            </View>

            {/* Top products */}
            {stats.topProducts.length > 0 && (
              <View style={[styles.section, { backgroundColor: c.surface, borderColor: c.hairline }]}>
                <Text style={[styles.sectionTitle, { color: c.text }]}>أكثر المنتجات مبيعاً</Text>
                {stats.topProducts.map((p, i) => (
                  <View key={p.name} style={[styles.rankRow, { borderTopColor: c.hairline }]}>
                    <Text style={[styles.rankQty, { color: c.brandBright }]}>{Number(p.qty).toFixed(0)}</Text>
                    <Text style={[styles.rankName, { color: c.text, flex: 1, textAlign: "right" }]}>{p.name}</Text>
                    <View style={[styles.rankBadge, { backgroundColor: c.brandTint }]}>
                      <Text style={[styles.rankNum, { color: c.brandBright }]}>#{i + 1}</Text>
                    </View>
                  </View>
                ))}
              </View>
            )}

            {/* Top clients */}
            {stats.topClients.length > 0 && (
              <View style={[styles.section, { backgroundColor: c.surface, borderColor: c.hairline }]}>
                <Text style={[styles.sectionTitle, { color: c.text }]}>أفضل العملاء</Text>
                {stats.topClients.map((client, i) => (
                  <View key={client.name + i} style={[styles.rankRow, { borderTopColor: c.hairline }]}>
                    <MoneyText amount={client.total} tone="positive" size="footnote" style={styles.rankQty} />
                    <Text style={[styles.rankName, { color: c.text, flex: 1, textAlign: "right" }]}>{client.name}</Text>
                    <View style={[styles.rankBadge, { backgroundColor: c.successTint }]}>
                      <Text style={[styles.rankNum, { color: c.successText }]}>#{i + 1}</Text>
                    </View>
                  </View>
                ))}
              </View>
            )}
          </>
        )}

        <View style={{ height: 100 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { paddingBottom: 16 },
  periods: { flexDirection: "row-reverse", gap: 8, padding: 12 },
  periodBtn: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, borderWidth: 1 },
  periodText: { fontSize: 13, fontFamily: fonts.semibold },
  statsGrid: { flexDirection: "row-reverse", flexWrap: "wrap", gap: 8, paddingHorizontal: 12, marginBottom: 4 },
  statCard: {
    flex: 1, minWidth: "45%", borderRadius: 14, borderWidth: 1,
    padding: 14, alignItems: "flex-end", gap: 6,
  },
  statIcon: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  statVal: { fontSize: 16, fontFamily: fonts.bold },
  statLabel: { fontSize: 11, fontFamily: fonts.regular },
  section: { marginHorizontal: 12, marginTop: 12, borderRadius: 14, borderWidth: 1, overflow: "hidden" },
  sectionTitle: { fontSize: 15, fontFamily: fonts.bold, padding: 14, textAlign: "right" },
  rankRow: { flexDirection: "row-reverse", alignItems: "center", gap: 10, padding: 12, borderTopWidth: 1 },
  rankBadge: { width: 28, height: 28, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  rankNum: { fontSize: 11, fontFamily: fonts.bold },
  rankName: { fontSize: 14, fontFamily: fonts.semibold },
  rankQty: { fontSize: 13, fontFamily: fonts.bold },
});
