import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import { useRefreshOnFocus } from "@/hooks/useRefreshOnFocus";
import { useCallback, useEffect, useRef, useState } from "react";
import { Animated, Image, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppButton, Card, GradientHero, MoneyText, PressableScale, StatusPill } from "@/components/ui";
import { useAuth } from "@/contexts/AuthContext";
import { useSync } from "@/contexts/SyncContext";
import { apiFetch } from "@/lib/api";
import { Client, getDb, Invoice } from "@/lib/db";
import { getTruckForUser, TruckInfo } from "@/lib/truck";
import { fonts, motion } from "@/constants/tokens";
import { useTheme, type Theme } from "@/hooks/useTheme";
import { FlatList } from "react-native";

const logo = require("../../assets/images/logo.png");
const DAY = 86_400_000;
const LAPSE_DAYS = 14;

type TabKey = "invoices" | "clients";
const TABS: { key: TabKey; label: string; icon: any }[] = [
  { key: "invoices", label: "الفواتير", icon: "file-text" },
  { key: "clients", label: "العملاء", icon: "users" },
];

interface InvoiceRow extends Invoice { client_name?: string; }
interface StockRow { sync_id: string; product_id: number; product_name: string; quantity: number; unit: string; selling_price_retail: number; }
interface Debtor { sync_id: string; name: string; credit_balance: number; }
interface AttentionClient { sync_id: string; name: string; days: number; }

type Tone = "brand" | "danger" | "warning" | "success";
function toneColors(c: Theme["color"], tone: Tone) {
  if (tone === "danger") return { tint: c.dangerTint, fg: c.dangerText };
  if (tone === "warning") return { tint: c.warningTint, fg: c.warningText };
  if (tone === "success") return { tint: c.successTint, fg: c.successText };
  return { tint: c.brandTint, fg: c.brandText };
}

function DeckCard({ tone, icon, valueNode, value, label, onPress, t }: {
  tone: Tone; icon: any; valueNode?: React.ReactNode; value?: string; label: string; onPress?: () => void; t: Theme;
}) {
  const c = t.color;
  const tc = toneColors(c, tone);
  return (
    <PressableScale onPress={onPress} style={{ marginLeft: 12 }} haptic>
      <Card radius={22} pad={16} style={styles.deckCard}>
        <View style={[styles.deckIc, { backgroundColor: tc.tint }]}><Feather name={icon} size={18} color={tc.fg} /></View>
        {valueNode ?? <Text style={[styles.deckV, { color: c.text }]} numberOfLines={1}>{value}</Text>}
        <Text style={[styles.deckL, { color: c.textMuted }]} numberOfLines={1}>{label}</Text>
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
        <Text style={[styles.rowSub, { color: c.textFaint }]}>{date ? date.toLocaleDateString("ar-DZ") : "—"}</Text>
      </View>
      <View style={{ alignItems: "flex-end", gap: 4 }}>
        <MoneyText amount={item.total_amount ?? 0} size="callout" />
        <StatusPill status={isCredit ? "credit" : "paid"} />
      </View>
    </Card>
  );
}

const CLIENT_TYPE_LABELS: Record<string, string> = { retail: "تجزئة", half_wholesale: "نصف جملة", wholesale: "جملة" };

function ClientCard({ item, t }: { item: Client; t: Theme }) {
  const c = t.color;
  const balance = Number(item.credit_balance ?? 0);
  const tone = balance < 0 ? "negative" : balance > 0 ? "positive" : "muted";
  return (
    <Card radius={18} pad={13} style={styles.row}>
      <View style={[styles.av, { backgroundColor: c.brandTint }]}><Feather name="user" size={18} color={c.brandText} /></View>
      <View style={{ flex: 1, alignItems: "flex-end" }}>
        <Text style={[styles.rowTitle, { color: c.text }]} numberOfLines={1}>{item.name}</Text>
        {item.phone ? <Text style={[styles.rowSub, { color: c.textFaint }]}>{item.phone}</Text> : null}
      </View>
      <View style={{ alignItems: "flex-end", gap: 4 }}>
        <MoneyText amount={balance} tone={tone} absolute size="callout" />
        <StatusPill status="neutral" label={CLIENT_TYPE_LABELS[item.client_type ?? "retail"] ?? item.client_type} />
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
  const [todayCredit, setTodayCredit] = useState(0);
  const [todayCount, setTodayCount] = useState(0);
  const [outstanding, setOutstanding] = useState(0);
  const [debtors, setDebtors] = useState<Debtor[]>([]);
  const [attention, setAttention] = useState<AttentionClient[]>([]);
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [stock, setStock] = useState<StockRow[]>([]);
  const [tab, setTab] = useState<TabKey>("invoices");
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
    setTodayCash(cash); setTodayCredit(credit); setTodaySales(cash + credit); setTodayCount(cnt);

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
      .map(r => ({ sync_id: r.sync_id, name: r.name, last: r.last ? Date.parse(r.last) : null }))
      .filter(r => r.last != null && Math.floor((now - (r.last as number)) / DAY) >= LAPSE_DAYS)
      .map(r => ({ sync_id: r.sync_id, name: r.name, days: Math.floor((now - (r.last as number)) / DAY) }))
      .sort((a, b) => b.days - a.days);
    setAttention(lapsed);

    const [invRows, clientRows] = await Promise.all([
      db.getAllAsync<InvoiceRow>(
        `SELECT i.*, c.name as client_name FROM invoices i
         LEFT JOIN clients c ON i.client_id = c.id OR i.client_sync_id = c.sync_id
         WHERE i.is_deleted = 0 ${invFilter} ORDER BY i.created_at DESC LIMIT 100`, idArg),
      db.getAllAsync<Client>(`SELECT * FROM clients WHERE is_deleted = 0 ${clientScope} ORDER BY name`, idArg),
    ]);
    setInvoices(invRows);
    setClients(clientRows);

    if (truckId) {
      const stockRows = await db.getAllAsync<StockRow>(
        `SELECT MIN(ts.sync_id) as sync_id, p.id as product_id, p.name as product_name,
                SUM(ts.quantity) as quantity, p.unit, p.selling_price_retail
         FROM truck_stock ts JOIN products p ON ts.product_id = p.id
         WHERE ts.truck_id = ? GROUP BY p.id, p.name, p.unit, p.selling_price_retail
         HAVING SUM(ts.quantity) > 0 ORDER BY p.name`, [truckId]);
      setStock(stockRows);
    } else setStock([]);
  }, [user?.truckId]);

  useRefreshOnFocus(() => { load(); checkDispatch(); });

  const onRefresh = async () => {
    setRefreshing(true); triggerSync();
    await Promise.all([load(), checkDispatch()]);
    setRefreshing(false);
  };

  const lowStock = stock.filter(s => Number(s.quantity) <= 3);
  const data: any[] = tab === "invoices" ? invoices : clients;

  const header = (
    <Animated.View style={{ opacity: fade, transform: [{ translateY: rise }] }}>
      {/* greeting + logo */}
      <View style={styles.head}>
        <View>
          <Text style={[styles.hi, { color: c.textMuted }]}>مرحباً 👋</Text>
          <Text style={[styles.hiName, { color: c.text }]}>{truck?.name ?? "السائق"}</Text>
        </View>
        <View style={styles.logoChip}><Image source={logo} style={styles.logoImg} resizeMode="contain" /></View>
      </View>

      {/* gradient cash hero */}
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
            <Text style={styles.liveText}>{pending > 0 ? `${pending} بانتظار` : "مُزامَن الآن"}</Text>
          </PressableScale>
        </View>
        <Text style={styles.balLbl}>رصيد الصندوق</Text>
        <MoneyText amount={truck?.cash_balance ?? 0} size="display" style={styles.balValue} />
        <View style={styles.heroFoot}>
          <PressableScale onPress={() => router.push("/(tabs)/caisse")}>
            <Text style={styles.heroLink}>إدارة الصندوق والتسليم ‹</Text>
          </PressableScale>
          {todaySales > 0 ? (
            <View style={styles.delta}><Text style={styles.deltaText}>اليوم ▲ {fmt(todaySales)}</Text></View>
          ) : null}
        </View>
      </GradientHero>

      {/* dispatch alert */}
      {pendingDispatch && (
        <PressableScale style={[styles.dispatch, { backgroundColor: c.warningTint }]} onPress={() => router.push("/(tabs)/dispatch")} haptic>
          <Feather name="download" size={16} color={c.warningText} />
          <Text style={[styles.dispatchText, { color: c.warningText }]}>بضاعة بانتظار الاستلام — اضغط للاستلام</Text>
          <Feather name="chevron-left" size={16} color={c.warningText} />
        </PressableScale>
      )}

      {/* quick-look deck */}
      <View style={styles.secRow}>
        <Text style={[styles.secLbl, { color: c.text }]}>نظرة سريعة</Text>
        <Text style={[styles.secHint, { color: c.textFaint }]}>اسحب ›</Text>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.deck}>
        {outstanding > 0 && (
          <DeckCard tone="danger" icon="alert-circle"
            valueNode={<MoneyText amount={outstanding} tone="negative" size="title" />}
            label={`للتحصيل · ${debtors.length} عملاء`}
            onPress={() => router.push(debtors[0] ? `/client/${debtors[0].sync_id}` : "/(tabs)/clients")} t={t} />
        )}
        {attention.length > 0 && (
          <DeckCard tone="warning" icon="map-pin" value={`${attention.length} عميل`} label="تحتاج زيارة"
            onPress={() => router.push(attention[0] ? `/client/${attention[0].sync_id}` : "/(tabs)/clients")} t={t} />
        )}
        <DeckCard tone="success" icon="trending-up"
          valueNode={<MoneyText amount={todaySales} tone="positive" size="title" />} label="مبيعات اليوم" t={t} />
        {lowStock.length > 0 && (
          <DeckCard tone="warning" icon="package" value={`${lowStock.length} أصناف`} label="مخزون منخفض"
            onPress={() => router.push("/(tabs)/truck")} t={t} />
        )}
      </ScrollView>

      <AppButton label="بيع جديد" icon="plus" size="lg" fullWidth onPress={() => router.push("/invoice/new")} style={{ marginTop: 16 }} />

      {/* activity */}
      <Text style={[styles.secLbl, { color: c.text, marginTop: 24, marginBottom: 12 }]}>النشاط</Text>
      <Card radius={14} pad={5} style={styles.seg}>
        {TABS.map((tb) => {
          const active = tab === tb.key;
          return (
            <PressableScale key={tb.key} style={[styles.segBtn, active && { backgroundColor: c.brand }]} onPress={() => setTab(tb.key)}>
              <Feather name={tb.icon} size={15} color={active ? c.onBrand : c.textMuted} />
              <Text style={[styles.segText, { color: active ? c.onBrand : c.textMuted }]}>{tb.label}</Text>
            </PressableScale>
          );
        })}
      </Card>
    </Animated.View>
  );

  return (
    <View style={[styles.container, { backgroundColor: c.bg, paddingTop: insets.top }]}>
      <FlatList
        data={data}
        keyExtractor={(i) => i.sync_id}
        renderItem={({ item }) => (
          <PressableScale onPress={() => router.push(tab === "invoices" ? `/invoice/${item.sync_id}` : `/client/${item.sync_id}`)}>
            {tab === "invoices" ? <InvoiceCard item={item} t={t} /> : <ClientCard item={item} t={t} />}
          </PressableScale>
        )}
        ListHeaderComponent={header}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.brand} />}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Feather name={tab === "invoices" ? "file-text" : "users"} size={36} color={c.textFaint} />
            <Text style={[styles.emptyText, { color: c.textMuted }]}>{tab === "invoices" ? "لا توجد فواتير" : "لا يوجد عملاء"}</Text>
          </View>
        }
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}

function fmt(n: number) {
  const [i, d] = Math.abs(n).toFixed(2).split(".");
  return i.replace(/\B(?=(\d{3})+(?!\d))/g, " ") + "." + d;
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  list: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 120, gap: 9 },

  head: { flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "center", marginBottom: 14 },
  hi: { fontSize: 13, fontFamily: fonts.regular },
  hiName: { fontSize: 19, fontFamily: fonts.bold, marginTop: 1 },
  logoChip: { backgroundColor: "#fff", borderRadius: 12, paddingHorizontal: 10, paddingVertical: 6, shadowColor: "#101C37", shadowOpacity: 0.08, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 3 },
  logoImg: { width: 96, height: 28 },

  heroRow: { flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "center" },
  truck: { flexDirection: "row-reverse", alignItems: "center", gap: 10 },
  truckIcon: { width: 42, height: 42, borderRadius: 13, backgroundColor: "rgba(255,255,255,0.18)", alignItems: "center", justifyContent: "center" },
  truckName: { color: "#fff", fontSize: 16, fontFamily: fonts.bold, textAlign: "right" },
  truckPlate: { color: "rgba(255,255,255,0.85)", fontSize: 12, fontFamily: fonts.regular, textAlign: "right" },
  live: { flexDirection: "row-reverse", alignItems: "center", gap: 6, backgroundColor: "rgba(255,255,255,0.18)", paddingHorizontal: 11, paddingVertical: 6, borderRadius: 999 },
  liveDot: { width: 7, height: 7, borderRadius: 4 },
  liveText: { color: "#fff", fontSize: 11, fontFamily: fonts.bold },
  balLbl: { color: "rgba(255,255,255,0.9)", fontSize: 13, fontFamily: fonts.regular, marginTop: 20, textAlign: "right" },
  balValue: { color: "#fff", textAlign: "right", marginTop: 2 },
  heroFoot: { flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "center", marginTop: 16, borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.2)", paddingTop: 13 },
  heroLink: { color: "#fff", fontSize: 13, fontFamily: fonts.bold },
  delta: { backgroundColor: "rgba(255,255,255,0.18)", paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999 },
  deltaText: { color: "#fff", fontSize: 12, fontFamily: fonts.bold },

  dispatch: { flexDirection: "row-reverse", alignItems: "center", gap: 8, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, marginTop: 12 },
  dispatchText: { flex: 1, fontSize: 12, fontFamily: fonts.bold, textAlign: "right" },

  secRow: { flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "center", marginTop: 22, marginBottom: 12 },
  secLbl: { fontSize: 14, fontFamily: fonts.bold, textAlign: "right" },
  secHint: { fontSize: 12, fontFamily: fonts.regular },
  deck: { paddingLeft: 12, paddingVertical: 2, flexDirection: "row-reverse" },
  deckCard: { width: 150, alignItems: "flex-end" },
  deckIc: { width: 38, height: 38, borderRadius: 12, alignItems: "center", justifyContent: "center", marginBottom: 12 },
  deckV: { fontSize: 21, fontFamily: fonts.bold, textAlign: "right" },
  deckL: { fontSize: 12, fontFamily: fonts.semibold, marginTop: 3, textAlign: "right" },

  seg: { flexDirection: "row-reverse", gap: 5 },
  segBtn: { flex: 1, flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 10, borderRadius: 10 },
  segText: { fontSize: 14, fontFamily: fonts.bold },

  row: { flexDirection: "row-reverse", alignItems: "center", gap: 11 },
  av: { width: 44, height: 44, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  rowTitle: { fontSize: 15, fontFamily: fonts.semibold },
  rowSub: { fontSize: 12, fontFamily: fonts.regular, marginTop: 1 },
  empty: { alignItems: "center", paddingVertical: 40, gap: 12 },
  emptyText: { fontSize: 14, fontFamily: fonts.regular },
});
