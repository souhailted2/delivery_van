import { Feather } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { useRefreshOnFocus } from "@/hooks/useRefreshOnFocus";
import { useCallback, useState } from "react";
import {
  ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Client, getDb } from "@/lib/db";
import { useSync } from "@/contexts/SyncContext";
import { useColors } from "@/hooks/useColors";

const TIER_LABEL: Record<string, string> = {
  retail: "تجزئة", half_wholesale: "نصف جملة", wholesale: "جملة",
};
const TIERS = ["retail", "half_wholesale", "wholesale"] as const;
const fmt = (n: number) => Number(n ?? 0).toLocaleString("fr-DZ") + " د.ج";

interface RecentInvoice {
  sync_id: string; id?: number | null; total_amount?: number;
  payment_type?: string; created_at?: string;
}
interface TopProduct { product_name: string; total_qty: number; }

export default function ClientProfileScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { triggerSync } = useSync();
  const { syncId } = useLocalSearchParams<{ syncId: string }>();

  const [client, setClient] = useState<Client | null>(null);
  const [loading, setLoading] = useState(true);
  const [yearTotal, setYearTotal] = useState(0);
  const [yearCount, setYearCount] = useState(0);
  const [allTimeTotal, setAllTimeTotal] = useState(0);
  const [topProducts, setTopProducts] = useState<TopProduct[]>([]);
  const [recent, setRecent] = useState<RecentInvoice[]>([]);

  const load = useCallback(async () => {
    const db = await getDb();
    if (!db) { setLoading(false); return; }

    const c = await db.getFirstAsync<Client>(
      "SELECT * FROM clients WHERE sync_id = ? AND is_deleted = 0",
      [syncId]
    );
    setClient(c ?? null);
    if (!c) { setLoading(false); return; }

    const idMatch = "(i.client_sync_id = ? OR i.client_id = ?)";
    const params = [syncId, c.id ?? -1];
    const yearStart = `${new Date().getFullYear()}-01-01T00:00:00.000Z`;

    const year = await db.getFirstAsync<{ total: number; cnt: number }>(
      `SELECT COALESCE(SUM(i.total_amount),0) as total, COUNT(*) as cnt
       FROM invoices i
       WHERE ${idMatch} AND i.is_deleted = 0 AND i.created_at >= ?`,
      [...params, yearStart]
    );
    setYearTotal(Number(year?.total ?? 0));
    setYearCount(Number(year?.cnt ?? 0));

    const all = await db.getFirstAsync<{ total: number }>(
      `SELECT COALESCE(SUM(i.total_amount),0) as total
       FROM invoices i WHERE ${idMatch} AND i.is_deleted = 0`,
      params
    );
    setAllTimeTotal(Number(all?.total ?? 0));

    const top = await db.getAllAsync<TopProduct>(
      `SELECT ii.product_name as product_name, COALESCE(SUM(ii.quantity),0) as total_qty
       FROM invoice_items ii
       JOIN invoices i ON ii.invoice_sync_id = i.sync_id OR ii.invoice_id = i.id
       WHERE ${idMatch} AND i.is_deleted = 0 AND ii.product_name IS NOT NULL
       GROUP BY ii.product_name
       ORDER BY total_qty DESC
       LIMIT 5`,
      params
    );
    setTopProducts(top);

    const rec = await db.getAllAsync<RecentInvoice>(
      `SELECT i.sync_id, i.id, i.total_amount, i.payment_type, i.created_at
       FROM invoices i
       WHERE ${idMatch} AND i.is_deleted = 0
       ORDER BY i.created_at DESC
       LIMIT 10`,
      params
    );
    setRecent(rec);
    setLoading(false);
  }, [syncId]);

  useRefreshOnFocus(load);

  const updateTier = async (tier: string) => {
    if (!client || client.client_type === tier) return;
    const db = await getDb();
    if (!db) return;
    await db.runAsync(
      "UPDATE clients SET client_type = ?, _pending = 1, updated_at = ? WHERE sync_id = ?",
      [tier, new Date().toISOString(), client.sync_id]
    );
    setClient({ ...client, client_type: tier });
    triggerSync();
  };

  const credit = Number(client?.credit_balance ?? 0);

  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      <View style={[styles.topBar, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()}>
          <Feather name="arrow-right" size={22} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.foreground }]}>ملف العميل</Text>
        <View style={{ width: 22 }} />
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={colors.primary} /></View>
      ) : !client ? (
        <View style={styles.center}>
          <Feather name="user-x" size={40} color={colors.muted} />
          <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>العميل غير موجود</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: insets.bottom + 24 }}>
          <View style={[styles.headerCard, { backgroundColor: colors.primary }]}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{client.name.charAt(0)}</Text>
            </View>
            <Text style={styles.clientName}>{client.name}</Text>
            {client.phone ? (
              <View style={styles.headerMeta}>
                <View style={styles.headerBadge}>
                  <Feather name="phone" size={11} color="#fff" />
                  <Text style={styles.headerBadgeText}>{client.phone}</Text>
                </View>
              </View>
            ) : null}
            <View style={styles.tierEditRow}>
              {TIERS.map(t => {
                const active = (client.client_type ?? "retail") === t;
                return (
                  <TouchableOpacity
                    key={t}
                    style={[styles.tierEditChip, { backgroundColor: active ? "#fff" : "#ffffff2e" }]}
                    onPress={() => updateTier(t)}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.tierEditChipText, { color: active ? colors.primary : "#fff" }]}>
                      {TIER_LABEL[t]}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {credit !== 0 && (() => {
            // Negative balance = client owes money (server convention).
            // Positive balance = client has a credit (overpaid).
            const isDebt = credit < 0;
            const accentColor = isDebt ? colors.destructive : colors.success;
            return (
              <View style={[styles.creditCard, { backgroundColor: accentColor + "18", borderColor: accentColor + "44" }]}>
                <Text style={[styles.creditVal, { color: accentColor }]}>{fmt(Math.abs(credit))}</Text>
                <View style={{ alignItems: "flex-end" }}>
                  <Text style={[styles.creditLabel, { color: colors.foreground }]}>
                    {isDebt ? "رصيد آجل (دين)" : "رصيد دائن"}
                  </Text>
                  <Text style={[styles.creditSub, { color: colors.mutedForeground }]}>
                    {isDebt ? "مستحق على العميل" : "رصيد لصالح العميل"}
                  </Text>
                </View>
              </View>
            );
          })()}

          <View style={styles.statsRow}>
            <View style={[styles.statCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.statVal, { color: colors.primary }]}>{fmt(yearTotal)}</Text>
              <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>مشتريات {new Date().getFullYear()}</Text>
            </View>
            <View style={[styles.statCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.statVal, { color: colors.foreground }]}>{yearCount}</Text>
              <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>فواتير السنة</Text>
            </View>
          </View>
          <View style={[styles.allTimeCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.statVal, { color: colors.foreground }]}>{fmt(allTimeTotal)}</Text>
            <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>إجمالي المشتريات (كل الفترات)</Text>
          </View>

          {topProducts.length > 0 && (
            <>
              <Text style={[styles.sectionTitle, { color: colors.foreground }]}>المنتجات الأكثر شراءً</Text>
              <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, padding: 0 }]}>
                {topProducts.map((p, idx) => (
                  <View
                    key={p.product_name + idx}
                    style={[styles.topRow, idx < topProducts.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.border }]}
                  >
                    <View style={[styles.qtyPill, { backgroundColor: colors.primary + "18" }]}>
                      <Text style={[styles.qtyPillText, { color: colors.primary }]}>{Math.round(p.total_qty)}</Text>
                    </View>
                    <Text style={[styles.topName, { color: colors.foreground }]} numberOfLines={1}>{p.product_name}</Text>
                    <Text style={[styles.rankNum, { color: colors.mutedForeground }]}>{idx + 1}</Text>
                  </View>
                ))}
              </View>
            </>
          )}

          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>آخر الفواتير</Text>
          {recent.length === 0 ? (
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, alignItems: "center", paddingVertical: 24 }]}>
              <Feather name="file-text" size={32} color={colors.muted} />
              <Text style={[styles.emptyText, { color: colors.mutedForeground, marginTop: 8 }]}>لا توجد فواتير</Text>
            </View>
          ) : (
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, padding: 0 }]}>
              {recent.map((inv, idx) => {
                const isCredit = inv.payment_type === "credit";
                return (
                  <TouchableOpacity
                    key={inv.sync_id}
                    style={[styles.invRow, idx < recent.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.border }]}
                    onPress={() => router.push(`/invoice/${inv.sync_id}`)}
                    activeOpacity={0.7}
                  >
                    <Feather name="chevron-left" size={18} color={colors.mutedForeground} />
                    <View style={{ flex: 1, alignItems: "flex-end" }}>
                      <Text style={[styles.invAmount, { color: colors.foreground }]}>{fmt(inv.total_amount ?? 0)}</Text>
                      <Text style={[styles.invDate, { color: colors.mutedForeground }]}>
                        {inv.created_at ? new Date(inv.created_at).toLocaleDateString("ar-DZ") : "—"}
                        {"  •  "}{isCredit ? "آجل" : "نقد"}
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  topBar: {
    flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1,
  },
  title: { fontSize: 17, fontFamily: "Cairo_700Bold" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  emptyText: { fontSize: 14, fontFamily: "Cairo_400Regular" },

  headerCard: { borderRadius: 16, padding: 18, alignItems: "center", gap: 8 },
  avatar: {
    width: 64, height: 64, borderRadius: 32, backgroundColor: "#ffffff33",
    alignItems: "center", justifyContent: "center",
  },
  avatarText: { color: "#fff", fontSize: 28, fontFamily: "Cairo_700Bold" },
  clientName: { color: "#fff", fontSize: 20, fontFamily: "Cairo_700Bold" },
  headerMeta: { flexDirection: "row-reverse", gap: 8, flexWrap: "wrap", justifyContent: "center" },
  headerBadge: {
    flexDirection: "row-reverse", alignItems: "center", gap: 4,
    backgroundColor: "#ffffff2e", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10,
  },
  headerBadgeText: { color: "#fff", fontSize: 12, fontFamily: "Cairo_600SemiBold" },
  tierEditRow: { flexDirection: "row-reverse", gap: 6, marginTop: 4 },
  tierEditChip: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 10 },
  tierEditChipText: { fontSize: 12, fontFamily: "Cairo_600SemiBold" },

  creditCard: {
    flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between",
    borderRadius: 14, borderWidth: 1, padding: 14,
  },
  creditVal: { fontSize: 22, fontFamily: "Cairo_700Bold" },
  creditLabel: { fontSize: 14, fontFamily: "Cairo_700Bold" },
  creditSub: { fontSize: 11, fontFamily: "Cairo_400Regular" },

  statsRow: { flexDirection: "row-reverse", gap: 10 },
  statCard: { flex: 1, borderRadius: 14, borderWidth: 1, padding: 14, alignItems: "center", gap: 4 },
  allTimeCard: { borderRadius: 14, borderWidth: 1, padding: 14, alignItems: "center", gap: 4 },
  statVal: { fontSize: 18, fontFamily: "Cairo_700Bold" },
  statLabel: { fontSize: 12, fontFamily: "Cairo_400Regular" },

  sectionTitle: { fontSize: 15, fontFamily: "Cairo_700Bold", textAlign: "right" },
  card: { borderRadius: 14, borderWidth: 1, padding: 14 },
  topRow: { flexDirection: "row-reverse", alignItems: "center", gap: 10, padding: 14 },
  qtyPill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, minWidth: 40, alignItems: "center" },
  qtyPillText: { fontSize: 14, fontFamily: "Cairo_700Bold" },
  topName: { flex: 1, fontSize: 14, fontFamily: "Cairo_600SemiBold", textAlign: "right" },
  rankNum: { fontSize: 13, fontFamily: "Cairo_700Bold", width: 18, textAlign: "center" },

  invRow: { flexDirection: "row-reverse", alignItems: "center", gap: 10, padding: 14 },
  invAmount: { fontSize: 15, fontFamily: "Cairo_700Bold" },
  invDate: { fontSize: 12, fontFamily: "Cairo_400Regular", marginTop: 2 },
});
