import { Feather } from "@expo/vector-icons";
import { useRefreshOnFocus } from "@/hooks/useRefreshOnFocus";
import { useCallback, useState } from "react";
import {
  RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View,
} from "react-native";
import { SyncBar } from "@/components/SyncBar";
import { useSync } from "@/contexts/SyncContext";
import { getDb } from "@/lib/db";
import { useColors } from "@/hooks/useColors";

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

function StatCard({ label, value, icon, color, colors }: {
  label: string; value: string; icon: any; color: string; colors: any;
}) {
  return (
    <View style={[styles.statCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={[styles.statIcon, { backgroundColor: color + "22" }]}>
        <Feather name={icon} size={18} color={color} />
      </View>
      <Text style={[styles.statVal, { color: colors.foreground }]}>{value}</Text>
      <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>{label}</Text>
    </View>
  );
}

export default function RapportsScreen() {
  const colors = useColors();
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
        `SELECT COALESCE(SUM(amount),0) as total FROM cash_transfers WHERE is_deleted=0 AND direction='in' ${dateFilter}`, params),
      db.getFirstAsync<{ total: number }>(
        `SELECT COALESCE(SUM(amount),0) as total FROM cash_transfers WHERE is_deleted=0 AND direction='out' ${dateFilter}`, params),
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

  const fmt = (n: number) => n.toLocaleString("fr-DZ") + " د.ج";

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <SyncBar />

      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
        showsVerticalScrollIndicator={false}
      >
        {/* Period selector */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.periods}>
          {PERIODS.map(p => (
            <TouchableOpacity
              key={p}
              style={[styles.periodBtn, { backgroundColor: period === p ? colors.primary : colors.card, borderColor: period === p ? colors.primary : colors.border }]}
              onPress={() => setPeriod(p)}
            >
              <Text style={[styles.periodText, { color: period === p ? "#fff" : colors.foreground }]}>{p}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {stats && (
          <>
            {/* Main stats grid */}
            <View style={styles.statsGrid}>
              <StatCard label="المبيعات" value={fmt(stats.totalRevenue)} icon="trending-up" color={colors.primary} colors={colors} />
              <StatCard label="الفواتير" value={String(stats.totalInvoices)} icon="file-text" color="#3b82f6" colors={colors} />
              <StatCard label="نقداً" value={fmt(stats.totalCash)} icon="check-circle" color="#22c55e" colors={colors} />
              <StatCard label="آجل" value={fmt(stats.totalCredit)} icon="clock" color="#f59e0b" colors={colors} />
            </View>

            <View style={styles.statsGrid}>
              <StatCard label="المرتجعات" value={fmt(stats.totalReturnsAmount)} icon="rotate-ccw" color={colors.destructive} colors={colors} />
              <StatCard label="عدد المرتجعات" value={String(stats.totalReturns)} icon="refresh-cw" color="#ef4444" colors={colors} />
              <StatCard label="تحصيل الصندوق" value={fmt(stats.totalCashIn)} icon="arrow-down-circle" color="#22c55e" colors={colors} />
              <StatCard label="صرف الصندوق" value={fmt(stats.totalCashOut)} icon="arrow-up-circle" color={colors.destructive} colors={colors} />
            </View>

            {/* Top products */}
            {stats.topProducts.length > 0 && (
              <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Text style={[styles.sectionTitle, { color: colors.foreground }]}>أكثر المنتجات مبيعاً</Text>
                {stats.topProducts.map((p, i) => (
                  <View key={p.name} style={[styles.rankRow, { borderTopColor: colors.border }]}>
                    <Text style={[styles.rankQty, { color: colors.primary }]}>{Number(p.qty).toFixed(0)}</Text>
                    <Text style={[styles.rankName, { color: colors.foreground, flex: 1, textAlign: "right" }]}>{p.name}</Text>
                    <View style={[styles.rankBadge, { backgroundColor: colors.primary + "22" }]}>
                      <Text style={[styles.rankNum, { color: colors.primary }]}>#{i + 1}</Text>
                    </View>
                  </View>
                ))}
              </View>
            )}

            {/* Top clients */}
            {stats.topClients.length > 0 && (
              <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Text style={[styles.sectionTitle, { color: colors.foreground }]}>أفضل العملاء</Text>
                {stats.topClients.map((c, i) => (
                  <View key={c.name + i} style={[styles.rankRow, { borderTopColor: colors.border }]}>
                    <Text style={[styles.rankQty, { color: colors.primary }]}>{fmt(c.total)}</Text>
                    <Text style={[styles.rankName, { color: colors.foreground, flex: 1, textAlign: "right" }]}>{c.name}</Text>
                    <View style={[styles.rankBadge, { backgroundColor: "#22c55e22" }]}>
                      <Text style={[styles.rankNum, { color: "#22c55e" }]}>#{i + 1}</Text>
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
  periodText: { fontSize: 13, fontFamily: "Cairo_600SemiBold" },
  statsGrid: { flexDirection: "row-reverse", flexWrap: "wrap", gap: 8, paddingHorizontal: 12, marginBottom: 4 },
  statCard: {
    flex: 1, minWidth: "45%", borderRadius: 14, borderWidth: 1,
    padding: 14, alignItems: "flex-end", gap: 6,
  },
  statIcon: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  statVal: { fontSize: 16, fontFamily: "Cairo_700Bold" },
  statLabel: { fontSize: 11, fontFamily: "Cairo_400Regular" },
  section: { marginHorizontal: 12, marginTop: 12, borderRadius: 14, borderWidth: 1, overflow: "hidden" },
  sectionTitle: { fontSize: 15, fontFamily: "Cairo_700Bold", padding: 14, textAlign: "right" },
  rankRow: { flexDirection: "row-reverse", alignItems: "center", gap: 10, padding: 12, borderTopWidth: 1 },
  rankBadge: { width: 28, height: 28, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  rankNum: { fontSize: 11, fontFamily: "Cairo_700Bold" },
  rankName: { fontSize: 14, fontFamily: "Cairo_600SemiBold" },
  rankQty: { fontSize: 13, fontFamily: "Cairo_700Bold" },
});
