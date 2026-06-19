import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import { useRefreshOnFocus } from "@/hooks/useRefreshOnFocus";
import { useCallback, useState } from "react";
import { FlatList, Image, RefreshControl, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { SyncBar } from "@/components/SyncBar";
import { MoneyText, PressableScale, StatusPill } from "@/components/ui";
import { useAuth } from "@/contexts/AuthContext";
import { useSync } from "@/contexts/SyncContext";
import { apiFetch } from "@/lib/api";
import { Client, getDb, Invoice } from "@/lib/db";
import { getTruckForUser, TruckInfo } from "@/lib/truck";
import { fonts } from "@/constants/tokens";
import { useTheme, type Theme } from "@/hooks/useTheme";

const logo = require("../../assets/images/logo.png");
const DAY = 86_400_000;
const LAPSE_DAYS = 14; // no purchase in this many days = needs a revisit

type TabKey = "invoices" | "clients";
const TABS: { key: TabKey; label: string; icon: any }[] = [
  { key: "invoices", label: "الفواتير", icon: "file-text" },
  { key: "clients", label: "العملاء", icon: "users" },
];

interface InvoiceRow extends Invoice { client_name?: string; }
interface StockRow { sync_id: string; product_id: number; product_name: string; quantity: number; unit: string; selling_price_retail: number; }
interface Debtor { sync_id: string; name: string; credit_balance: number; }
interface AttentionClient { sync_id: string; name: string; days: number; }

function InvoiceCard({ item, t }: { item: InvoiceRow; t: Theme }) {
  const c = t.color;
  const date = item.created_at ? new Date(item.created_at) : null;
  const isPending = (item._pending ?? 0) > 0;
  const isCredit = item.payment_type === "credit";
  return (
    <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.hairline }]}>
      <View style={styles.cardRow}>
        <View style={[styles.avatar, { backgroundColor: isPending ? c.warningTint : c.successTint }]}>
          <Feather name={isPending ? "clock" : "check-circle"} size={18} color={isPending ? c.warning : c.success} />
        </View>
        <View style={{ flex: 1, alignItems: "flex-end" }}>
          <Text style={[styles.cardTitle, { color: c.text }]}>{item.client_name ?? "عميل غير معروف"}</Text>
          <Text style={[styles.cardSub, { color: c.textMuted }]}>{date ? date.toLocaleDateString("ar-DZ") : "—"}</Text>
        </View>
        <View style={{ alignItems: "flex-end", gap: 4 }}>
          <MoneyText amount={item.total_amount ?? 0} size="callout" />
          <StatusPill status={isCredit ? "credit" : "paid"} />
        </View>
      </View>
    </View>
  );
}

const CLIENT_TYPE_LABELS: Record<string, string> = { retail: "تجزئة", half_wholesale: "نصف جملة", wholesale: "جملة" };

function ClientCard({ item, t }: { item: Client; t: Theme }) {
  const c = t.color;
  const balance = Number(item.credit_balance ?? 0);
  const tone = balance < 0 ? "negative" : balance > 0 ? "positive" : "muted";
  return (
    <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.hairline }]}>
      <View style={styles.cardRow}>
        <View style={[styles.avatar, { backgroundColor: c.brandTint }]}><Feather name="user" size={18} color={c.brandText} /></View>
        <View style={{ flex: 1, alignItems: "flex-end" }}>
          <Text style={[styles.cardTitle, { color: c.text }]}>{item.name}</Text>
          {item.phone ? <Text style={[styles.cardSub, { color: c.textMuted }]}>{item.phone}</Text> : null}
        </View>
        <View style={{ alignItems: "flex-end", gap: 4 }}>
          <MoneyText amount={balance} tone={tone} absolute size="callout" />
          <StatusPill status="neutral" label={CLIENT_TYPE_LABELS[item.client_type ?? "retail"] ?? item.client_type} />
        </View>
      </View>
    </View>
  );
}

// One "today" figure tile.
function TodayTile({ label, amount, tone, t }: { label: string; amount: number; tone: "neutral" | "positive" | "brand"; t: Theme }) {
  return (
    <View style={[styles.todayTile, { backgroundColor: t.color.surface, borderColor: t.color.hairline }]}>
      <MoneyText amount={amount} tone={tone} size="callout" />
      <Text style={[styles.todayLabel, { color: t.color.textMuted }]}>{label}</Text>
    </View>
  );
}

// An actionable row (debtor / attention / stock) → navigates somewhere.
function ActionRow({ icon, iconTone, title, sub, right, onPress, t, last }: {
  icon: any; iconTone: "danger" | "warning" | "brand"; title: string; sub?: string;
  right?: React.ReactNode; onPress: () => void; t: Theme; last?: boolean;
}) {
  const c = t.color;
  const tint = iconTone === "danger" ? c.dangerTint : iconTone === "warning" ? c.warningTint : c.brandTint;
  const fg = iconTone === "danger" ? c.danger : iconTone === "warning" ? c.warning : c.brandText;
  return (
    <PressableScale style={[styles.actionRow, !last && { borderBottomWidth: 1, borderBottomColor: c.hairline }]} onPress={onPress}>
      <Feather name="chevron-left" size={16} color={c.textFaint} />
      <View style={{ flex: 1, alignItems: "flex-end" }}>
        <Text style={[styles.actionTitle, { color: c.text }]} numberOfLines={1}>{title}</Text>
        {sub ? <Text style={[styles.actionSub, { color: c.textMuted }]}>{sub}</Text> : null}
      </View>
      {right}
      <View style={[styles.actionIcon, { backgroundColor: tint }]}><Feather name={icon} size={15} color={fg} /></View>
    </PressableScale>
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

    // Today's money, split by payment type (sell-more pace + cash discipline).
    const todayRows = await db.getAllAsync<{ payment_type: string; s: number; cnt: number }>(
      `SELECT payment_type, COALESCE(SUM(total_amount),0) as s, COUNT(*) as cnt
       FROM invoices WHERE created_at >= ? AND is_deleted = 0 ${cntFilter} GROUP BY payment_type`,
      [todayStr, ...idArg]
    );
    let cash = 0, credit = 0, cnt = 0;
    for (const r of todayRows) { const s = Number(r.s ?? 0); if (r.payment_type === "credit") credit += s; else cash += s; cnt += Number(r.cnt ?? 0); }
    setTodayCash(cash); setTodayCredit(credit); setTodaySales(cash + credit); setTodayCount(cnt);

    // Outstanding receivables + top debtors (collect-more).
    const debtRows = await db.getAllAsync<Debtor>(
      `SELECT sync_id, name, credit_balance FROM clients
       WHERE is_deleted = 0 AND credit_balance < 0 ${clientScope} ORDER BY credit_balance ASC`,
      idArg
    );
    setOutstanding(debtRows.reduce((s, d) => s + -Number(d.credit_balance ?? 0), 0));
    setDebtors(debtRows.slice(0, 4));

    // Clients needing a revisit — lapsing (last purchase ≥ LAPSE_DAYS), fact-based.
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

    // Activity feed + clients list + truck stock (existing behavior).
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

  const renderItem = ({ item }: { item: any }) => (
    <PressableScale onPress={() => router.push(tab === "invoices" ? `/invoice/${item.sync_id}` : `/client/${item.sync_id}`)}>
      {tab === "invoices" ? <InvoiceCard item={item} t={t} /> : <ClientCard item={item} t={t} />}
    </PressableScale>
  );

  const header = (
    <View>
      {/* Hero */}
      <View style={[styles.hero, { backgroundColor: c.surface, borderColor: c.brandBorder, ...t.elevation.glow }]}>
        <View style={styles.headerTop}>
          <View style={styles.logoChip}><Image source={logo} style={styles.logoImg} resizeMode="contain" /></View>
          <View style={[styles.truckBadge, { backgroundColor: c.brandTint }]}><Feather name="truck" size={22} color={c.brandBright} /></View>
        </View>
        <Text style={[styles.truckName, { color: c.text }]}>{truck?.name ?? "—"}</Text>
        {truck?.plate_number ? <Text style={[styles.plate, { color: c.textMuted }]}>{truck.plate_number}</Text> : null}
        <PressableScale style={[styles.cashBox, { borderTopColor: c.hairline }]} onPress={() => router.push("/(tabs)/caisse")}>
          <View style={{ alignItems: "flex-end" }}>
            <Text style={[styles.cashLabel, { color: c.textMuted }]}>رصيد الصندوق</Text>
            <View style={styles.cashHint}>
              <Feather name="chevron-left" size={13} color={c.brandText} />
              <Text style={[styles.cashHintText, { color: c.brandText }]}>إدارة الصندوق والتسليم</Text>
            </View>
          </View>
          <MoneyText amount={truck?.cash_balance ?? 0} size="display" />
        </PressableScale>
      </View>

      {/* Pending task: dispatch awaiting receipt */}
      {pendingDispatch && (
        <PressableScale style={[styles.dispatchAlert, { backgroundColor: c.warningTint, borderColor: c.warning }]} onPress={() => router.push("/(tabs)/dispatch")} haptic>
          <View style={[styles.dispatchAlertIcon, { backgroundColor: c.warning }]}><Feather name="download" size={18} color={c.bg} /></View>
          <View style={{ flex: 1, alignItems: "flex-end" }}>
            <Text style={[styles.dispatchAlertTitle, { color: c.warningText }]}>بضاعة بانتظار الاستلام</Text>
            <Text style={[styles.dispatchAlertSub, { color: c.warningText }]}>اضغط لاستلام البضاعة المرسلة من الإدارة</Text>
          </View>
          <Feather name="chevron-left" size={18} color={c.warningText} />
        </PressableScale>
      )}

      {/* Pending task: unsynced operations */}
      {pending > 0 && (
        <View style={[styles.taskChip, { backgroundColor: c.surface, borderColor: c.hairline }]}>
          <Feather name="refresh-cw" size={14} color={c.warning} />
          <Text style={[styles.taskChipText, { color: c.textMuted }]}>{pending} عملية بانتظار الرفع — ستُزامَن تلقائياً</Text>
        </View>
      )}

      {/* TODAY */}
      <Text style={[styles.secLabel, { color: c.textFaint }]}>اليوم{todayCount ? ` · ${todayCount} فاتورة` : ""}</Text>
      <View style={styles.todayRow}>
        <TodayTile label="المبيعات" amount={todaySales} tone="neutral" t={t} />
        <TodayTile label="نقداً محصّل" amount={todayCash} tone="positive" t={t} />
        <TodayTile label="آجل صادر" amount={todayCredit} tone="brand" t={t} />
      </View>

      {/* COLLECT — outstanding + top debtors */}
      {outstanding > 0 && (
        <View style={styles.section}>
          <View style={styles.secHead}>
            <MoneyText amount={outstanding} tone="negative" size="callout" />
            <Text style={[styles.secLabel, { color: c.textFaint, marginBottom: 0 }]}>للتحصيل</Text>
          </View>
          <View style={[styles.listCard, { backgroundColor: c.surface, borderColor: c.hairline }]}>
            {debtors.map((d, i) => (
              <ActionRow key={d.sync_id} icon="user" iconTone="danger" title={d.name}
                right={<MoneyText amount={d.credit_balance} tone="negative" absolute size="footnote" />}
                onPress={() => router.push(`/client/${d.sync_id}`)} t={t} last={i === debtors.length - 1} />
            ))}
          </View>
        </View>
      )}

      {/* ATTENTION — lapsing clients to revisit */}
      {attention.length > 0 && (
        <View style={styles.section}>
          <Text style={[styles.secLabel, { color: c.textFaint }]}>تحتاج متابعة · {attention.length}</Text>
          <View style={[styles.listCard, { backgroundColor: c.surface, borderColor: c.hairline }]}>
            {attention.slice(0, 4).map((a, i, arr) => (
              <ActionRow key={a.sync_id} icon="user-x" iconTone="warning" title={a.name}
                sub={`لم يشترِ منذ ${a.days} يوماً`}
                onPress={() => router.push(`/client/${a.sync_id}`)} t={t} last={i === arr.length - 1} />
            ))}
          </View>
        </View>
      )}

      {/* STOCK — items to reload */}
      {lowStock.length > 0 && (
        <View style={styles.section}>
          <Text style={[styles.secLabel, { color: c.textFaint }]}>مخزون منخفض · {lowStock.length}</Text>
          <View style={[styles.listCard, { backgroundColor: c.surface, borderColor: c.hairline }]}>
            {lowStock.slice(0, 4).map((s, i, arr) => (
              <ActionRow key={s.sync_id} icon="package" iconTone="warning" title={s.product_name}
                right={<Text style={[styles.stockQty, { color: c.warningText }]}>{Math.round(Number(s.quantity))} {s.unit ?? ""}</Text>}
                onPress={() => router.push("/(tabs)/truck")} t={t} last={i === Math.min(arr.length, 4) - 1} />
            ))}
          </View>
        </View>
      )}

      {/* ACTIVITY */}
      <View style={[styles.segment, { backgroundColor: c.surface, borderColor: c.hairline }]}>
        {TABS.map((tb) => {
          const active = tab === tb.key;
          return (
            <PressableScale key={tb.key} style={[styles.segmentBtn, active && { backgroundColor: c.brand }]} onPress={() => setTab(tb.key)}>
              <Feather name={tb.icon} size={15} color={active ? c.onBrand : c.textMuted} />
              <Text style={[styles.segmentText, { color: active ? c.onBrand : c.textMuted }]}>{tb.label}</Text>
            </PressableScale>
          );
        })}
      </View>
    </View>
  );

  return (
    <View style={[styles.container, { backgroundColor: c.bg }]}>
      <SyncBar />
      <FlatList
        data={data}
        keyExtractor={(i) => i.sync_id}
        renderItem={renderItem}
        ListHeaderComponent={header}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.brand} />}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Feather name={tab === "invoices" ? "file-text" : "users"} size={40} color={c.textFaint} />
            <Text style={[styles.emptyText, { color: c.textMuted }]}>{tab === "invoices" ? "لا توجد فواتير" : "لا يوجد عملاء"}</Text>
          </View>
        }
        showsVerticalScrollIndicator={false}
      />
      <PressableScale style={[styles.fab, { backgroundColor: c.brand, bottom: insets.bottom + 74, ...t.elevation.glow }]} onPress={handleNew} haptic>
        <Feather name="plus" size={20} color={c.onBrand} />
        <Text style={[styles.fabText, { color: c.onBrand }]}>بيع جديد</Text>
      </PressableScale>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  list: { paddingHorizontal: 12, paddingBottom: 100, gap: 8 },

  hero: { borderRadius: 20, borderWidth: 1, padding: 16, marginTop: 8, marginBottom: 12, gap: 6 },
  headerTop: { flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "center" },
  logoChip: { backgroundColor: "#fff", borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6, justifyContent: "center", alignItems: "center" },
  logoImg: { width: 104, height: 34 },
  truckBadge: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  truckName: { fontSize: 19, fontFamily: fonts.bold, textAlign: "right", marginTop: 8 },
  plate: { fontSize: 13, fontFamily: fonts.regular, textAlign: "right" },
  cashBox: { flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "center", marginTop: 10, paddingTop: 12, borderTopWidth: 1 },
  cashLabel: { fontSize: 13, fontFamily: fonts.semibold },
  cashHint: { flexDirection: "row-reverse", alignItems: "center", gap: 2, marginTop: 2 },
  cashHintText: { fontSize: 10, fontFamily: fonts.regular },

  dispatchAlert: { flexDirection: "row-reverse", alignItems: "center", gap: 10, borderRadius: 14, borderWidth: 1, padding: 14, marginBottom: 10 },
  dispatchAlertIcon: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center" },
  dispatchAlertTitle: { fontSize: 14, fontFamily: fonts.bold },
  dispatchAlertSub: { fontSize: 11, fontFamily: fonts.regular },

  taskChip: { flexDirection: "row-reverse", alignItems: "center", gap: 8, borderRadius: 12, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 9, marginBottom: 10 },
  taskChipText: { fontSize: 12, fontFamily: fonts.regular },

  secLabel: { fontSize: 11, letterSpacing: 0.5, fontFamily: fonts.semibold, textAlign: "right", marginBottom: 8 },
  todayRow: { flexDirection: "row-reverse", gap: 8, marginBottom: 12 },
  todayTile: { flex: 1, borderRadius: 14, borderWidth: 1, padding: 12, alignItems: "flex-end", gap: 4 },
  todayLabel: { fontSize: 10, fontFamily: fonts.regular },

  section: { marginBottom: 12 },
  secHead: { flexDirection: "row-reverse", alignItems: "baseline", justifyContent: "space-between", marginBottom: 8 },
  listCard: { borderRadius: 14, borderWidth: 1, overflow: "hidden" },
  actionRow: { flexDirection: "row-reverse", alignItems: "center", gap: 10, paddingHorizontal: 12, paddingVertical: 11 },
  actionIcon: { width: 32, height: 32, borderRadius: 9, alignItems: "center", justifyContent: "center" },
  actionTitle: { fontSize: 13, fontFamily: fonts.semibold, textAlign: "right" },
  actionSub: { fontSize: 11, fontFamily: fonts.regular, marginTop: 1 },
  stockQty: { fontSize: 12, fontFamily: fonts.bold },

  segment: { flexDirection: "row-reverse", borderRadius: 12, borderWidth: 1, padding: 4, gap: 4, marginBottom: 4 },
  segmentBtn: { flex: 1, flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 9, borderRadius: 9 },
  segmentText: { fontSize: 13, fontFamily: fonts.semibold },

  card: { borderRadius: 14, borderWidth: 1, padding: 14 },
  cardRow: { flexDirection: "row-reverse", alignItems: "center", gap: 10 },
  avatar: { width: 40, height: 40, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  cardTitle: { fontSize: 15, fontFamily: fonts.semibold },
  cardSub: { fontSize: 12, fontFamily: fonts.regular },
  empty: { alignItems: "center", paddingVertical: 50, gap: 12 },
  emptyText: { fontSize: 14, fontFamily: fonts.regular },

  fab: { position: "absolute", alignSelf: "center", flexDirection: "row-reverse", alignItems: "center", gap: 8, paddingHorizontal: 22, height: 52, borderRadius: 26 },
  fabText: { fontSize: 15, fontFamily: fonts.bold },
});
