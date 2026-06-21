import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import { useRefreshOnFocus } from "@/hooks/useRefreshOnFocus";
import { useCallback, useEffect, useRef, useState } from "react";
import { Animated, FlatList, Image, RefreshControl, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Card, GradientHero, MoneyText, PressableScale, StatusPill } from "@/components/ui";
import { useAuth } from "@/contexts/AuthContext";
import { useSync } from "@/contexts/SyncContext";
import { apiFetch } from "@/lib/api";
import { getDb, Invoice } from "@/lib/db";
import { getTruckForUser, TruckInfo } from "@/lib/truck";
import { fonts, motion } from "@/constants/tokens";
import { useTheme, type Theme } from "@/hooks/useTheme";

const logo = require("../../assets/images/logo.png");
const DAY = 86_400_000;
const LAPSE_DAYS = 14;

interface InvoiceRow extends Invoice { client_name?: string; }
interface StockRow { sync_id: string; product_id: number; product_name: string; quantity: number; }
interface Debtor { sync_id: string; name: string; credit_balance: number; }

type Tone = "danger" | "warning" | "brand";
function toneColors(c: Theme["color"], tone: Tone) {
  if (tone === "danger") return { tint: c.dangerTint, fg: c.dangerText };
  if (tone === "warning") return { tint: c.warningTint, fg: c.warningText };
  return { tint: c.brandTint, fg: c.brandText };
}

// One always-present signal in the balanced 3-up grid.
function SignalCard({ tone, icon, valueNode, value, label, onPress, t }: {
  tone: Tone; icon: any; valueNode?: React.ReactNode; value?: string; label: string; onPress?: () => void; t: Theme;
}) {
  const c = t.color;
  const tc = toneColors(c, tone);
  return (
    <PressableScale onPress={onPress} style={{ flex: 1 }} haptic>
      <Card radius={18} pad={13} style={styles.signal}>
        <View style={[styles.signalIc, { backgroundColor: tc.tint }]}><Feather name={icon} size={16} color={tc.fg} /></View>
        {valueNode ?? <Text style={[styles.signalV, { color: c.text }]} numberOfLines={1}>{value}</Text>}
        <Text style={[styles.signalL, { color: c.textMuted }]} numberOfLines={1}>{label}</Text>
      </Card>
    </PressableScale>
  );
}

function InvoiceCard({ item, t }: { item: InvoiceRow; t: Theme }) {
  const c = t.color;
  const date = item.created_at ? new Date(item.created_at) : null;
  const isPending = (item._pending ?? 0) > 0;
  const isCredit = item.payment_type === "credit";
  return (
    <Card radius={18} pad={13} style={styles.row}>
      <View style={[styles.av, { backgroundColor: isPending ? c.warningTint : c.successTint }]}>
        <Feather name={isPending ? "clock" : "check-circle"} size={18} color={isPending ? c.warning : c.success} />
      </View>
      <View style={{ flex: 1, alignItems: "flex-end" }}>
        <Text style={[styles.rowTitle, { color: c.text }]} numberOfLines={1}>{item.client_name ?? "عميل غير معروف"}</Text>
        <Text style={[styles.rowSub, { color: c.textMuted }]}>{date ? date.toLocaleDateString("ar-DZ") : "—"}</Text>
      </View>
      <View style={{ alignItems: "flex-end", gap: 4 }}>
        <MoneyText amount={item.total_amount ?? 0} size="callout" />
        <StatusPill status={isCredit ? "credit" : "paid"} />
      </View>
    </Card>
  );
}

export default function TruckDashboardScreen() {
  const t = useTheme();
  const c = t.color;
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { triggerSync, pending } = useSync();

  const [truck, setTruck] = useState<TruckInfo | null>(null);
  const [todaySales, setTodaySales] = useState(0);
  const [todayCash, setTodayCash] = useState(0);
  const [todayCount, setTodayCount] = useState(0);
  const [outstanding, setOutstanding] = useState(0);
  const [debtors, setDebtors] = useState<Debtor[]>([]);
  const [attention, setAttention] = useState<number>(0);
  const [firstAttention, setFirstAttention] = useState<string | null>(null);
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [lowStock, setLowStock] = useState<StockRow[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [pendingDispatch, setPendingDispatch] = useState(false);

  const fade = useRef(new Animated.Value(0)).current;
  const rise = useRef(new Animated.Value(18)).current;
  useEffect(() => {
    Animated.parallel([
      Animated.timing(fade, { toValue: 1, duration: motion.duration.slow, easing: motion.easing.out, useNativeDriver: true }),
      Animated.timing(rise, { toValue: 0, duration: motion.duration.slow, easing: motion.easing.out, useNativeDriver: true }),
    ]).start();
  }, [fade, rise]);

  const checkDispatch = useCallback(async () => {
    try {
      const r = await apiFetch("/dispatches/inbox");
      if (r.ok) { const data = await r.json(); setPendingDispatch(!!data && data.status === "pending"); }
      else setPendingDispatch(false);
    } catch { setPendingDispatch(false); }
  }, []);

  const load = useCallback(async () => {
    const db = await getDb();
    if (!db) return;
    const truckRow = await getTruckForUser(db, user?.truckId);
    setTruck(truckRow);
    const truckId = truckRow?.id ?? user?.truckId ?? null;
    const cntFilter = truckId ? "AND (truck_id = ? OR (truck_id IS NULL AND _pending = 1))" : "";
    const invFilter = truckId ? "AND (i.truck_id = ? OR (i.truck_id IS NULL AND i._pending = 1))" : "";
    const idArg = truckId ? [truckId] : [];
    const clientScope = truckId ? "AND (truck_id = ? OR truck_id IS NULL)" : "";

    const today = new Date(); today.setHours(0, 0, 0, 0);
    const todayStr = today.toISOString();

    const todayRows = await db.getAllAsync<{ payment_type: string; s: number; cnt: number }>(
      `SELECT payment_type, COALESCE(SUM(total_amount),0) as s, COUNT(*) as cnt
       FROM invoices WHERE created_at >= ? AND is_deleted = 0 ${cntFilter} GROUP BY payment_type`,
      [todayStr, ...idArg]
    );
    let cash = 0, credit = 0, cnt = 0;
    for (const r of todayRows) { const s = Number(r.s ?? 0); if (r.payment_type === "credit") credit += s; else cash += s; cnt += Number(r.cnt ?? 0); }
    setTodayCash(cash); setTodaySales(cash + credit); setTodayCount(cnt);

    const debtRows = await db.getAllAsync<Debtor>(
      `SELECT sync_id, name, credit_balance FROM clients
       WHERE is_deleted = 0 AND credit_balance < 0 ${clientScope} ORDER BY credit_balance ASC`, idArg);
    setOutstanding(debtRows.reduce((s, d) => s + -Number(d.credit_balance ?? 0), 0));
    setDebtors(debtRows.slice(0, 4));

    const attRows = await db.getAllAsync<{ sync_id: string; name: string; last: string | null }>(
      `SELECT cl.sync_id, cl.name, MAX(i.created_at) as last
       FROM clients cl LEFT JOIN invoices i ON (i.client_sync_id = cl.sync_id OR i.client_id = cl.id) AND i.is_deleted = 0
       WHERE cl.is_deleted = 0 ${clientScope ? "AND (cl.truck_id = ? OR cl.truck_id IS NULL)" : ""}
       GROUP BY cl.sync_id, cl.name`, idArg);
    const now = Date.now();
    const lapsed = attRows
      .map(r => ({ sync_id: r.sync_id, last: r.last ? Date.parse(r.last) : null }))
      .filter(r => r.last != null && Math.floor((now - (r.last as number)) / DAY) >= LAPSE_DAYS);
    setAttention(lapsed.length);
    setFirstAttention(lapsed[0]?.sync_id ?? null);

    const invRows = await db.getAllAsync<InvoiceRow>(
      `SELECT i.*, c.name as client_name FROM invoices i
       LEFT JOIN clients c ON i.client_id = c.id OR i.client_sync_id = c.sync_id
       WHERE i.is_deleted = 0 ${invFilter} ORDER BY i.created_at DESC LIMIT 100`, idArg);
    setInvoices(invRows);

    if (truckId) {
      const stockRows = await db.getAllAsync<StockRow>(
        `SELECT MIN(ts.sync_id) as sync_id, p.id as product_id, p.name as product_name, SUM(ts.quantity) as quantity
         FROM truck_stock ts JOIN products p ON ts.product_id = p.id
         WHERE ts.truck_id = ? GROUP BY p.id, p.name HAVING SUM(ts.quantity) > 0 AND SUM(ts.quantity) <= 3 ORDER BY p.name`, [truckId]);
      setLowStock(stockRows);
    } else setLowStock([]);
  }, [user?.truckId]);

  useRefreshOnFocus(() => { load(); checkDispatch(); });

  const onRefresh = async () => {
    setRefreshing(true); triggerSync();
    await Promise.all([load(), checkDispatch()]);
    setRefreshing(false);
  };

  const header = (
    <Animated.View style={{ opacity: fade, transform: [{ translateY: rise }] }}>
      {/* greeting + receiving inbox + logo */}
      <View style={styles.head}>
        <View>
          <Text style={[styles.hi, { color: c.textMuted }]}>مرحباً 👋</Text>
          <Text style={[styles.hiName, { color: c.text }]}>{truck?.name ?? "السائق"}</Text>
        </View>
        <View style={styles.headRight}>
          <PressableScale style={[styles.inbox, { backgroundColor: c.surface, borderColor: c.hairline }]} onPress={() => router.push("/(tabs)/dispatch")} haptic accessibilityLabel="استلام البضاعة">
            <Feather name="download" size={18} color={pendingDispatch ? c.warning : c.textMuted} />
            {pendingDispatch && <View style={[styles.dot, { backgroundColor: c.warning, borderColor: c.bg }]} />}
          </PressableScale>
          <PressableScale style={[styles.inbox, { backgroundColor: c.surface, borderColor: c.hairline }]} onPress={() => router.push("/(tabs)/settings")} haptic accessibilityLabel="الإعدادات">
            <Feather name="settings" size={18} color={c.textMuted} />
          </PressableScale>
          <View style={styles.logoChip}><Image source={logo} style={styles.logoImg} resizeMode="contain" /></View>
        </View>
      </View>

      {/* today's sales hero */}
      <GradientHero radius={28} style={{ padding: 22 }}>
        <View style={styles.heroRow}>
          <View style={styles.truck}>
            <View style={styles.truckIcon}><Feather name="truck" size={20} color="#fff" /></View>
            <View>
              <Text style={styles.truckName}>{truck?.name ?? "شاحنتي"}</Text>
              {truck?.plate_number ? <Text style={styles.truckPlate}>{truck.plate_number}</Text> : null}
            </View>
          </View>
          <PressableScale style={styles.live} onPress={onRefresh}>
            <View style={[styles.liveDot, { backgroundColor: pending > 0 ? "#FFD27B" : "#7BFFC4" }]} />
            <Text style={styles.liveText}>{pending > 0 ? `${pending} بانتظار الرفع` : "تمت المزامنة"}</Text>
          </PressableScale>
        </View>
        <Text style={styles.balLbl}>مبيعات اليوم</Text>
        <MoneyText amount={todaySales} size="display" style={styles.balValue} />
        <View style={styles.heroFoot}>
          <Text style={styles.heroFootText}>{todayCount} فاتورة اليوم</Text>
          <Text style={styles.heroFootText}>نقداً {fmt(todayCash)}</Text>
        </View>
      </GradientHero>

      {/* balanced 3-up signal grid */}
      <View style={styles.grid}>
        <SignalCard tone="danger" icon="alert-circle"
          valueNode={outstanding > 0 ? <MoneyText amount={outstanding} tone="negative" size="headline" /> : <Text style={[styles.signalV, { color: c.textFaint }]}>لا يوجد</Text>}
          label="للتحصيل" onPress={() => router.push(debtors[0] ? `/client/${debtors[0].sync_id}` : "/(tabs)/clients")} t={t} />
        <SignalCard tone="warning" icon="map-pin"
          valueNode={<Text style={[styles.signalV, { color: attention > 0 ? c.text : c.textFaint }]}>{attention > 0 ? `${attention} عميل` : "لا يوجد"}</Text>}
          label="تحتاج زيارة" onPress={() => router.push(firstAttention ? `/client/${firstAttention}` : "/(tabs)/clients")} t={t} />
        <SignalCard tone="warning" icon="package"
          valueNode={<Text style={[styles.signalV, { color: lowStock.length > 0 ? c.text : c.textFaint }]}>{lowStock.length > 0 ? `${lowStock.length} صنف` : "جيّد"}</Text>}
          label="مخزون منخفض" onPress={() => router.push("/(tabs)/truck")} t={t} />
      </View>

      <Text style={[styles.secLbl, { color: c.text }]}>آخر الفواتير</Text>
    </Animated.View>
  );

  return (
    <View style={[styles.container, { backgroundColor: c.bg, paddingTop: insets.top }]}>
      <FlatList
        data={invoices}
        keyExtractor={(i) => i.sync_id}
        renderItem={({ item }) => (
          <PressableScale onPress={() => router.push(`/invoice/${item.sync_id}`)}>
            <InvoiceCard item={item} t={t} />
          </PressableScale>
        )}
        ListHeaderComponent={header}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.brand} />}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Feather name="file-text" size={36} color={c.textFaint} />
            <Text style={[styles.emptyText, { color: c.textMuted }]}>لا توجد فواتير بعد</Text>
          </View>
        }
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}

function fmt(n: number) {
  const [i, d] = Math.abs(n).toFixed(2).split(".");
  return i.replace(/\B(?=(\d{3})+(?!\d))/g, " ") + "." + d + " DZD";
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  list: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 120, gap: 9 },

  head: { flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "center", marginBottom: 14 },
  headRight: { flexDirection: "row-reverse", alignItems: "center", gap: 10 },
  hi: { fontSize: 13, fontFamily: fonts.regular },
  hiName: { fontSize: 19, fontFamily: fonts.bold, marginTop: 1 },
  inbox: { width: 42, height: 42, borderRadius: 12, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  dot: { position: "absolute", top: 8, right: 9, width: 9, height: 9, borderRadius: 5, borderWidth: 1.5 },
  logoChip: { backgroundColor: "#fff", borderRadius: 12, paddingHorizontal: 10, paddingVertical: 6, shadowColor: "#101C37", shadowOpacity: 0.08, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 3 },
  logoImg: { width: 92, height: 28 },

  heroRow: { flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "center" },
  truck: { flexDirection: "row-reverse", alignItems: "center", gap: 10 },
  truckIcon: { width: 40, height: 40, borderRadius: 13, backgroundColor: "rgba(255,255,255,0.18)", alignItems: "center", justifyContent: "center" },
  truckName: { color: "#fff", fontSize: 15, fontFamily: fonts.bold, textAlign: "right" },
  truckPlate: { color: "rgba(255,255,255,0.85)", fontSize: 12, fontFamily: fonts.regular, textAlign: "right" },
  live: { flexDirection: "row-reverse", alignItems: "center", gap: 6, backgroundColor: "rgba(255,255,255,0.18)", paddingHorizontal: 11, paddingVertical: 6, borderRadius: 999 },
  liveDot: { width: 7, height: 7, borderRadius: 4 },
  liveText: { color: "#fff", fontSize: 11, fontFamily: fonts.bold },
  balLbl: { color: "rgba(255,255,255,0.9)", fontSize: 13, fontFamily: fonts.regular, marginTop: 20, textAlign: "right" },
  balValue: { color: "#fff", textAlign: "right", marginTop: 2 },
  heroFoot: { flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "center", marginTop: 16, borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.2)", paddingTop: 13 },
  heroFootText: { color: "rgba(255,255,255,0.9)", fontSize: 12, fontFamily: fonts.semibold },

  grid: { flexDirection: "row-reverse", gap: 9, marginTop: 16 },
  signal: { alignItems: "flex-end" },
  signalIc: { width: 34, height: 34, borderRadius: 11, alignItems: "center", justifyContent: "center", marginBottom: 10 },
  signalV: { fontSize: 16, fontFamily: fonts.bold, textAlign: "right" },
  signalL: { fontSize: 11, fontFamily: fonts.semibold, marginTop: 3, textAlign: "right" },

  secLbl: { fontSize: 14, fontFamily: fonts.bold, textAlign: "right", marginTop: 24, marginBottom: 12 },

  row: { flexDirection: "row-reverse", alignItems: "center", gap: 11 },
  av: { width: 44, height: 44, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  rowTitle: { fontSize: 15, fontFamily: fonts.semibold },
  rowSub: { fontSize: 12, fontFamily: fonts.regular, marginTop: 1 },
  empty: { alignItems: "center", paddingVertical: 40, gap: 12 },
  emptyText: { fontSize: 14, fontFamily: fonts.regular },
});
