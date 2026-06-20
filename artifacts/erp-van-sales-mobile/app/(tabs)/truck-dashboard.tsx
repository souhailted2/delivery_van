import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import { useRefreshOnFocus } from "@/hooks/useRefreshOnFocus";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Animated, Dimensions, FlatList, Image, NativeScrollEvent, NativeSyntheticEvent,
  RefreshControl, ScrollView, StyleSheet, Text, View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AmbientBackground, AppButton, DraggableSheet, GlassCard, MoneyText, PressableScale, StatusPill } from "@/components/ui";
import { useAuth } from "@/contexts/AuthContext";
import { useSync } from "@/contexts/SyncContext";
import { apiFetch } from "@/lib/api";
import { Client, getDb, Invoice } from "@/lib/db";
import { getTruckForUser, TruckInfo } from "@/lib/truck";
import { fonts, motion } from "@/constants/tokens";
import { useTheme, type Theme } from "@/hooks/useTheme";

const logo = require("../../assets/images/logo.png");
const DAY = 86_400_000;
const LAPSE_DAYS = 14;

const SCREEN_W = Dimensions.get("window").width;
const DECK_GAP = 12;
const DECK_W = SCREEN_W - 56;            // neighbour card peeks ~ on the side
const DECK_SNAP = DECK_W + DECK_GAP;

type TabKey = "invoices" | "clients";
const TABS: { key: TabKey; label: string; icon: any }[] = [
  { key: "invoices", label: "الفواتير", icon: "file-text" },
  { key: "clients", label: "العملاء", icon: "users" },
];

interface InvoiceRow extends Invoice { client_name?: string; }
interface StockRow { sync_id: string; product_id: number; product_name: string; quantity: number; unit: string; selling_price_retail: number; }
interface Debtor { sync_id: string; name: string; credit_balance: number; }
interface AttentionClient { sync_id: string; name: string; days: number; }

type DeckTone = "brand" | "danger" | "warning";

// ── One card in the swipeable cockpit deck ──────────────────────────────────
function DeckCard({
  tone, icon, label, value, valueNode, sub, onPress, t, animatedStyle,
}: {
  tone: DeckTone; icon: any; label: string; value?: string; valueNode?: React.ReactNode;
  sub?: string; onPress: () => void; t: Theme; animatedStyle?: any;
}) {
  const c = t.color;
  const edge = tone === "danger" ? c.danger : tone === "warning" ? c.warning : c.brandBright;
  const tint = tone === "danger" ? c.dangerTint : tone === "warning" ? c.warningTint : c.brandTint;
  const fg = tone === "danger" ? c.dangerText : tone === "warning" ? c.warningText : c.brandText;
  return (
    <Animated.View style={[{ width: DECK_W, marginLeft: DECK_GAP }, animatedStyle]}>
      <PressableScale onPress={onPress} haptic>
        <GlassCard strong radius={22} style={[styles.deckCard, { borderColor: edge + "55", shadowColor: edge }]}>
          <View style={styles.deckTop}>
            <View style={[styles.deckBadge, { backgroundColor: tint, borderColor: edge + "44" }]}>
              <Feather name={icon} size={18} color={fg} />
            </View>
            <Text style={[styles.deckLabel, { color: c.textMuted }]}>{label}</Text>
          </View>
          {valueNode ?? <Text style={[styles.deckValue, { color: c.text }]} numberOfLines={1}>{value}</Text>}
          {sub ? <Text style={[styles.deckSub, { color: fg }]} numberOfLines={1}>{sub}</Text> : null}
          <View style={styles.deckGo}>
            <Feather name="chevron-left" size={16} color={c.textFaint} />
          </View>
        </GlassCard>
      </PressableScale>
    </Animated.View>
  );
}

function InvoiceCard({ item, t }: { item: InvoiceRow; t: Theme }) {
  const c = t.color;
  const date = item.created_at ? new Date(item.created_at) : null;
  const isPending = (item._pending ?? 0) > 0;
  const isCredit = item.payment_type === "credit";
  return (
    <GlassCard radius={16} style={styles.row}>
      <View style={styles.rowInner}>
        <View style={[styles.avatar, { backgroundColor: isPending ? c.warningTint : c.successTint }]}>
          <Feather name={isPending ? "clock" : "check-circle"} size={18} color={isPending ? c.warning : c.success} />
        </View>
        <View style={{ flex: 1, alignItems: "flex-end" }}>
          <Text style={[styles.rowTitle, { color: c.text }]}>{item.client_name ?? "عميل غير معروف"}</Text>
          <Text style={[styles.rowSub, { color: c.textMuted }]}>{date ? date.toLocaleDateString("ar-DZ") : "—"}</Text>
        </View>
        <View style={{ alignItems: "flex-end", gap: 4 }}>
          <MoneyText amount={item.total_amount ?? 0} size="callout" />
          <StatusPill status={isCredit ? "credit" : "paid"} />
        </View>
      </View>
    </GlassCard>
  );
}

const CLIENT_TYPE_LABELS: Record<string, string> = { retail: "تجزئة", half_wholesale: "نصف جملة", wholesale: "جملة" };

function ClientCard({ item, t }: { item: Client; t: Theme }) {
  const c = t.color;
  const balance = Number(item.credit_balance ?? 0);
  const tone = balance < 0 ? "negative" : balance > 0 ? "positive" : "muted";
  return (
    <GlassCard radius={16} style={styles.row}>
      <View style={styles.rowInner}>
        <View style={[styles.avatar, { backgroundColor: c.brandTint }]}><Feather name="user" size={18} color={c.brandText} /></View>
        <View style={{ flex: 1, alignItems: "flex-end" }}>
          <Text style={[styles.rowTitle, { color: c.text }]}>{item.name}</Text>
          {item.phone ? <Text style={[styles.rowSub, { color: c.textMuted }]}>{item.phone}</Text> : null}
        </View>
        <View style={{ alignItems: "flex-end", gap: 4 }}>
          <MoneyText amount={balance} tone={tone} absolute size="callout" />
          <StatusPill status="neutral" label={CLIENT_TYPE_LABELS[item.client_type ?? "retail"] ?? item.client_type} />
        </View>
      </View>
    </GlassCard>
  );
}

function TodayPill({ label, amount, tone, t }: { label: string; amount: number; tone: "neutral" | "positive" | "brand"; t: Theme }) {
  const c = t.color;
  const dot = tone === "positive" ? c.successText : tone === "brand" ? c.brandBright : c.textMuted;
  return (
    <GlassCard radius={999} style={styles.pill}>
      <View style={[styles.pillDot, { backgroundColor: dot }]} />
      <View style={{ alignItems: "flex-end", flex: 1 }}>
        <MoneyText amount={amount} tone={tone} size="footnote" />
        <Text style={[styles.pillLabel, { color: c.textFaint }]} numberOfLines={1}>{label}</Text>
      </View>
    </GlassCard>
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
  const [deckIndex, setDeckIndex] = useState(0);

  // Cockpit entrance — deck deals in.
  const fade = useRef(new Animated.Value(0)).current;
  const rise = useRef(new Animated.Value(20)).current;
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
       WHERE is_deleted = 0 AND credit_balance < 0 ${clientScope} ORDER BY credit_balance ASC`,
      idArg
    );
    setOutstanding(debtRows.reduce((s, d) => s + -Number(d.credit_balance ?? 0), 0));
    setDebtors(debtRows.slice(0, 4));

    const attRows = await db.getAllAsync<{ sync_id: string; name: string; last: string | null }>(
      `SELECT cl.sync_id, cl.name, MAX(i.created_at) as last
       FROM clients cl LEFT JOIN invoices i ON (i.client_sync_id = cl.sync_id OR i.client_id = cl.id) AND i.is_deleted = 0
       WHERE cl.is_deleted = 0 ${clientScope ? "AND (cl.truck_id = ? OR cl.truck_id IS NULL)" : ""}
       GROUP BY cl.sync_id, cl.name`,
      idArg
    );
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
      db.getAllAsync<Client>(
        `SELECT * FROM clients WHERE is_deleted = 0 ${clientScope} ORDER BY name`, idArg),
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

  const handleNew = async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    router.push("/invoice/new");
  };

  const lowStock = stock.filter(s => Number(s.quantity) <= 3);
  const data: any[] = tab === "invoices" ? invoices : clients;

  // Build the deck: cash always first, then live signal cards.
  const deck: React.ReactNode[] = [];
  deck.push(
    <DeckCard key="cash" tone="brand" icon="dollar-sign" label={truck?.name ?? "الصندوق"}
      valueNode={<MoneyText amount={truck?.cash_balance ?? 0} size="display" />}
      sub={truck?.plate_number ? `${truck.plate_number} · إدارة الصندوق` : "إدارة الصندوق والتسليم"}
      onPress={() => router.push("/(tabs)/caisse")} t={t} />
  );
  if (outstanding > 0)
    deck.push(
      <DeckCard key="collect" tone="danger" icon="alert-circle" label="للتحصيل"
        valueNode={<MoneyText amount={outstanding} tone="negative" size="display" />}
        sub={debtors[0] ? `أكبر مدين: ${debtors[0].name}` : undefined}
        onPress={() => router.push(debtors[0] ? `/client/${debtors[0].sync_id}` : "/(tabs)/clients")} t={t} />
    );
  if (attention.length > 0)
    deck.push(
      <DeckCard key="visits" tone="warning" icon="map-pin" label="تحتاج زيارة"
        value={`${attention.length} عميل`}
        sub={attention[0] ? `${attention[0].name} · منذ ${attention[0].days} يوماً` : undefined}
        onPress={() => router.push(attention[0] ? `/client/${attention[0].sync_id}` : "/(tabs)/clients")} t={t} />
    );
  if (lowStock.length > 0)
    deck.push(
      <DeckCard key="stock" tone="warning" icon="package" label="مخزون منخفض"
        value={`${lowStock.length} صنف`}
        sub={lowStock[0] ? `${lowStock[0].product_name}` : undefined}
        onPress={() => router.push("/(tabs)/truck")} t={t} />
    );

  const onDeckScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const i = Math.round(Math.abs(e.nativeEvent.contentOffset.x) / DECK_SNAP);
    if (i !== deckIndex) setDeckIndex(i);
  };

  const renderItem = ({ item }: { item: any }) => (
    <PressableScale onPress={() => router.push(tab === "invoices" ? `/invoice/${item.sync_id}` : `/client/${item.sync_id}`)}>
      {tab === "invoices" ? <InvoiceCard item={item} t={t} /> : <ClientCard item={item} t={t} />}
    </PressableScale>
  );

  const sheetHeader = (
    <View>
      <View style={styles.sheetTitleRow}>
        <Text style={[styles.sheetCount, { color: c.textFaint }]}>{data.length}</Text>
        <Text style={[styles.sheetTitle, { color: c.text }]}>النشاط</Text>
      </View>
      <GlassCard radius={12} style={styles.segment}>
        {TABS.map((tb) => {
          const active = tab === tb.key;
          return (
            <PressableScale key={tb.key} style={[styles.segmentBtn, active && { backgroundColor: c.brand }]} onPress={() => setTab(tb.key)}>
              <Feather name={tb.icon} size={15} color={active ? c.onBrand : c.textMuted} />
              <Text style={[styles.segmentText, { color: active ? c.onBrand : c.textMuted }]}>{tb.label}</Text>
            </PressableScale>
          );
        })}
      </GlassCard>
    </View>
  );

  return (
    <View style={[styles.container, { backgroundColor: c.glassBase }]}>
      <AmbientBackground />

      {/* ── Fixed cockpit ── */}
      <Animated.View style={[styles.cockpit, { paddingTop: insets.top + 8, opacity: fade, transform: [{ translateY: rise }] }]}>
        <View style={styles.headerRow}>
          <PressableScale style={styles.syncChip} onPress={onRefresh} haptic>
            <View style={[styles.syncDot, { backgroundColor: pending > 0 ? c.warning : c.successText }]} />
            <Text style={[styles.syncText, { color: c.textMuted }]}>{pending > 0 ? `${pending} بانتظار الرفع` : "مُزامَن"}</Text>
            <Feather name="refresh-cw" size={13} color={c.textFaint} />
          </PressableScale>
          <View style={styles.logoChip}><Image source={logo} style={styles.logoImg} resizeMode="contain" /></View>
        </View>

        {pendingDispatch && (
          <PressableScale style={[styles.dispatchAlert, { backgroundColor: c.warningTint, borderColor: c.warning }]} onPress={() => router.push("/(tabs)/dispatch")} haptic>
            <Feather name="download" size={16} color={c.warningText} />
            <Text style={[styles.dispatchText, { color: c.warningText }]}>بضاعة بانتظار الاستلام — اضغط للاستلام</Text>
            <Feather name="chevron-left" size={16} color={c.warningText} />
          </PressableScale>
        )}

        {/* Swipeable card deck */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          snapToInterval={DECK_SNAP}
          decelerationRate="fast"
          onScroll={onDeckScroll}
          scrollEventThrottle={32}
          contentContainerStyle={styles.deckContent}
        >
          {deck}
        </ScrollView>
        {deck.length > 1 && (
          <View style={styles.dots}>
            {deck.map((_, i) => (
              <View key={i} style={[styles.dot, { backgroundColor: i === deckIndex ? c.brandBright : c.glassBorder, width: i === deckIndex ? 18 : 6 }]} />
            ))}
          </View>
        )}

        {/* Today pills */}
        <View style={styles.pillRow}>
          <TodayPill label="المبيعات" amount={todaySales} tone="neutral" t={t} />
          <TodayPill label="نقداً" amount={todayCash} tone="positive" t={t} />
          <TodayPill label="آجل" amount={todayCredit} tone="brand" t={t} />
        </View>

        <AppButton label="بيع جديد" size="lg" fullWidth onPress={handleNew} style={styles.cta} />
      </Animated.View>

      {/* ── Draggable activity sheet (rests peeking, pulls up over cockpit) ── */}
      <DraggableSheet header={sheetHeader}>
        <FlatList
          data={data}
          keyExtractor={(i) => i.sync_id}
          renderItem={renderItem}
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
      </DraggableSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  cockpit: { paddingHorizontal: 16, gap: 12 },

  headerRow: { flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "center" },
  logoChip: { backgroundColor: "#fff", borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6 },
  logoImg: { width: 96, height: 30 },
  syncChip: { flexDirection: "row-reverse", alignItems: "center", gap: 6 },
  syncDot: { width: 8, height: 8, borderRadius: 4 },
  syncText: { fontSize: 12, fontFamily: fonts.semibold },

  dispatchAlert: { flexDirection: "row-reverse", alignItems: "center", gap: 8, borderRadius: 12, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 10 },
  dispatchText: { flex: 1, fontSize: 12, fontFamily: fonts.bold, textAlign: "right" },

  deckContent: { paddingRight: 16, paddingLeft: 4, paddingVertical: 2 },
  deckCard: { height: 158, padding: 18, justifyContent: "flex-start" },
  deckTop: { flexDirection: "row-reverse", alignItems: "center", gap: 10, marginBottom: 14 },
  deckBadge: { width: 38, height: 38, borderRadius: 12, alignItems: "center", justifyContent: "center", borderWidth: 1 },
  deckLabel: { fontSize: 14, fontFamily: fonts.bold, flex: 1, textAlign: "right" },
  deckValue: { fontSize: 26, fontFamily: fonts.bold, textAlign: "right" },
  deckSub: { fontSize: 12, fontFamily: fonts.semibold, textAlign: "right", marginTop: 6 },
  deckGo: { position: "absolute", bottom: 14, left: 16 },

  dots: { flexDirection: "row", justifyContent: "center", gap: 5, marginTop: -2 },
  dot: { height: 6, borderRadius: 3 },

  pillRow: { flexDirection: "row-reverse", gap: 8 },
  pill: { flex: 1, flexDirection: "row-reverse", alignItems: "center", gap: 8, paddingVertical: 9, paddingHorizontal: 12 },
  pillDot: { width: 8, height: 8, borderRadius: 4 },
  pillLabel: { fontSize: 10, fontFamily: fonts.regular },

  cta: { marginTop: 2 },

  sheetTitleRow: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", marginBottom: 10, paddingHorizontal: 2 },
  sheetTitle: { fontSize: 16, fontFamily: fonts.bold },
  sheetCount: { fontSize: 13, fontFamily: fonts.semibold },
  segment: { flexDirection: "row-reverse", padding: 4, gap: 4 },
  segmentBtn: { flex: 1, flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 9, borderRadius: 9 },
  segmentText: { fontSize: 13, fontFamily: fonts.semibold },

  list: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 28, gap: 8 },
  row: { padding: 14 },
  rowInner: { flexDirection: "row-reverse", alignItems: "center", gap: 10 },
  avatar: { width: 40, height: 40, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  rowTitle: { fontSize: 15, fontFamily: fonts.semibold },
  rowSub: { fontSize: 12, fontFamily: fonts.regular },
  empty: { alignItems: "center", paddingVertical: 40, gap: 12 },
  emptyText: { fontSize: 14, fontFamily: fonts.regular },
});
