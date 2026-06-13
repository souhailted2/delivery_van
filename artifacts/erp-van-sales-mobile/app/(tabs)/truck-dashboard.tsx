import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import { useRefreshOnFocus } from "@/hooks/useRefreshOnFocus";
import { useCallback, useState } from "react";
import { FlatList, Image, RefreshControl, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { SyncBar } from "@/components/SyncBar";
import { useAuth } from "@/contexts/AuthContext";
import { useSync } from "@/contexts/SyncContext";
import { apiFetch } from "@/lib/api";
import { Client, getDb, Invoice } from "@/lib/db";
import { useColors } from "@/hooks/useColors";

const logo = require("../../assets/images/logo.png");

type TabKey = "invoices" | "clients" | "stock";

const TABS: { key: TabKey; label: string; icon: any }[] = [
  { key: "invoices", label: "الفواتير", icon: "file-text" },
  { key: "clients", label: "العملاء", icon: "users" },
  { key: "stock", label: "المخزون", icon: "box" },
];

interface InvoiceRow extends Invoice {
  client_name?: string;
}

interface StockRow {
  sync_id: string;
  product_name: string;
  quantity: number;
  unit: string;
  selling_price_retail: number;
}

interface TruckInfo {
  id: number;
  name: string;
  cash_balance: number;
  plate_number?: string | null;
}

const fmt = (n: number) => Number(n ?? 0).toLocaleString("fr-DZ") + " د.ج";

function InvoiceCard({ item, colors }: { item: InvoiceRow; colors: any }) {
  const date = item.created_at ? new Date(item.created_at) : null;
  const isPending = (item._pending ?? 0) > 0;
  const isCredit = item.payment_type === "credit";
  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={styles.cardRow}>
        <View style={[styles.avatar, { backgroundColor: isPending ? colors.warning + "22" : colors.success + "22" }]}>
          <Feather name={isPending ? "clock" : "check-circle"} size={18} color={isPending ? colors.warning : colors.success} />
        </View>
        <View style={{ flex: 1, alignItems: "flex-end" }}>
          <Text style={[styles.cardTitle, { color: colors.foreground }]}>{item.client_name ?? "عميل غير معروف"}</Text>
          <Text style={[styles.cardSub, { color: colors.mutedForeground }]}>
            {date ? date.toLocaleDateString("ar-DZ") : "—"}
          </Text>
        </View>
        <View style={{ alignItems: "flex-end" }}>
          <Text style={[styles.amount, { color: colors.foreground }]}>{fmt(item.total_amount ?? 0)}</Text>
          <View style={[styles.badge, { backgroundColor: isCredit ? colors.warning + "22" : colors.success + "22" }]}>
            <Text style={[styles.badgeText, { color: isCredit ? colors.warning : colors.success }]}>
              {isCredit ? "آجل" : "نقد"}
            </Text>
          </View>
        </View>
      </View>
    </View>
  );
}

const CLIENT_TYPE_LABELS: Record<string, string> = {
  retail: "تجزئة", half_wholesale: "نصف جملة", wholesale: "جملة",
};

function ClientCard({ item, colors }: { item: Client; colors: any }) {
  const balance = Number(item.credit_balance ?? 0);
  const balanceColor = balance < 0 ? colors.destructive : balance > 0 ? colors.warning : colors.success;
  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={styles.cardRow}>
        <View style={[styles.avatar, { backgroundColor: colors.secondary }]}>
          <Feather name="user" size={18} color={colors.primary} />
        </View>
        <View style={{ flex: 1, alignItems: "flex-end" }}>
          <Text style={[styles.cardTitle, { color: colors.foreground }]}>{item.name}</Text>
          {item.phone ? <Text style={[styles.cardSub, { color: colors.mutedForeground }]}>{item.phone}</Text> : null}
        </View>
        <View style={{ alignItems: "center" }}>
          <Text style={[styles.amount, { color: balanceColor }]}>{fmt(balance)}</Text>
          <View style={[styles.badge, { backgroundColor: colors.secondary }]}>
            <Text style={[styles.badgeText, { color: colors.mutedForeground }]}>
              {CLIENT_TYPE_LABELS[item.client_type ?? "retail"] ?? item.client_type}
            </Text>
          </View>
        </View>
      </View>
    </View>
  );
}

function StockCard({ item, colors }: { item: StockRow; colors: any }) {
  const qty = Number(item.quantity ?? 0);
  const qtyColor = qty === 0 ? colors.destructive : qty < 5 ? colors.warning : colors.foreground;
  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={styles.cardRow}>
        <View style={[styles.avatar, { backgroundColor: colors.primary + "15" }]}>
          <Feather name="box" size={16} color={colors.primary} />
        </View>
        <View style={{ flex: 1, alignItems: "flex-end" }}>
          <Text style={[styles.cardTitle, { color: colors.foreground }]}>{item.product_name}</Text>
          <Text style={[styles.cardSub, { color: colors.mutedForeground }]}>
            {fmt(item.selling_price_retail ?? 0)}
          </Text>
        </View>
        <View style={{ alignItems: "center" }}>
          <Text style={[styles.qty, { color: qtyColor }]}>{qty.toFixed(0)}</Text>
          <Text style={[styles.unit, { color: colors.mutedForeground }]}>{item.unit || "قطعة"}</Text>
        </View>
      </View>
    </View>
  );
}

function StatCard({ label, value, icon, colors }: { label: string; value: string; icon: any; colors: any }) {
  return (
    <View style={[styles.statCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={[styles.statIcon, { backgroundColor: colors.primary + "15" }]}>
        <Feather name={icon} size={18} color={colors.primary} />
      </View>
      <Text style={[styles.statValue, { color: colors.foreground }]} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>{label}</Text>
    </View>
  );
}

export default function TruckDashboardScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { triggerSync } = useSync();

  const [truck, setTruck] = useState<TruckInfo | null>(null);
  const [todaySales, setTodaySales] = useState(0);
  const [totalInvoices, setTotalInvoices] = useState(0);
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [stock, setStock] = useState<StockRow[]>([]);
  const [tab, setTab] = useState<TabKey>("invoices");
  const [refreshing, setRefreshing] = useState(false);
  const [pendingDispatch, setPendingDispatch] = useState(false);

  const checkDispatch = useCallback(async () => {
    try {
      const r = await apiFetch("/dispatches/inbox");
      if (r.ok) {
        const data = await r.json();
        setPendingDispatch(!!data && data.status === "pending");
      } else {
        setPendingDispatch(false);
      }
    } catch {
      setPendingDispatch(false);
    }
  }, []);

  const load = useCallback(async () => {
    const db = await getDb();
    if (!db) return;

    const truckRow = await db.getFirstAsync<TruckInfo>(
      user?.truckId
        ? "SELECT id, name, cash_balance, plate_number FROM trucks WHERE id = ? AND is_deleted = 0"
        : "SELECT id, name, cash_balance, plate_number FROM trucks WHERE is_deleted = 0 LIMIT 1",
      user?.truckId ? [user.truckId] : []
    );
    setTruck(truckRow ?? null);

    const truckId = truckRow?.id ?? user?.truckId ?? null;
    const invFilter = truckId ? "AND i.truck_id = ?" : "";
    const cntFilter = truckId ? "AND truck_id = ?" : "";
    const idArg = truckId ? [truckId] : [];

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = today.toISOString();

    const [salesRow, countRow, invRows, clientRows] = await Promise.all([
      db.getFirstAsync<{ total: number }>(
        `SELECT SUM(total_amount) as total FROM invoices WHERE created_at >= ? AND is_deleted = 0 ${cntFilter}`,
        [todayStr, ...idArg]
      ),
      db.getFirstAsync<{ cnt: number }>(
        `SELECT COUNT(*) as cnt FROM invoices WHERE is_deleted = 0 ${cntFilter}`,
        idArg
      ),
      db.getAllAsync<InvoiceRow>(
        `SELECT i.*, c.name as client_name FROM invoices i
         LEFT JOIN clients c ON i.client_id = c.id OR i.client_sync_id = c.sync_id
         WHERE i.is_deleted = 0 ${invFilter}
         ORDER BY i.created_at DESC LIMIT 100`,
        idArg
      ),
      db.getAllAsync<Client>(
        `SELECT * FROM clients WHERE is_deleted = 0 ${truckId ? "AND (truck_id = ? OR truck_id IS NULL)" : ""} ORDER BY name`,
        idArg
      ),
    ]);

    setTodaySales(salesRow?.total ?? 0);
    setTotalInvoices(countRow?.cnt ?? 0);
    setInvoices(invRows);
    setClients(clientRows);

    if (truckId) {
      const stockRows = await db.getAllAsync<StockRow>(
        `SELECT ts.sync_id, p.name as product_name, ts.quantity, p.unit, p.selling_price_retail
         FROM truck_stock ts
         JOIN products p ON ts.product_id = p.id
         WHERE ts.truck_id = ? AND ts.quantity > 0
         ORDER BY p.name`,
        [truckId]
      );
      setStock(stockRows);
    } else {
      setStock([]);
    }
  }, [user?.truckId]);

  useRefreshOnFocus(() => { load(); checkDispatch(); });

  const onRefresh = async () => {
    setRefreshing(true);
    triggerSync();
    await Promise.all([load(), checkDispatch()]);
    setRefreshing(false);
  };

  const handleNew = async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    router.push("/invoice/new");
  };

  const data: any[] = tab === "invoices" ? invoices : tab === "clients" ? clients : stock;

  const renderItem = ({ item }: { item: any }) => {
    if (tab === "invoices") {
      return (
        <TouchableOpacity activeOpacity={0.7} onPress={() => router.push(`/invoice/${item.sync_id}`)}>
          <InvoiceCard item={item} colors={colors} />
        </TouchableOpacity>
      );
    }
    if (tab === "clients") {
      return (
        <TouchableOpacity activeOpacity={0.7} onPress={() => router.push(`/client/${item.sync_id}`)}>
          <ClientCard item={item} colors={colors} />
        </TouchableOpacity>
      );
    }
    return <StockCard item={item} colors={colors} />;
  };

  const emptyText =
    tab === "invoices" ? "لا توجد فواتير" : tab === "clients" ? "لا يوجد عملاء" : "المخزون فارغ";
  const emptyIcon = tab === "invoices" ? "file-text" : tab === "clients" ? "users" : "inbox";

  const header = (
    <View>
      <View style={[styles.header, { backgroundColor: colors.primary }]}>
        <View style={styles.headerTop}>
          <View style={styles.logoChip}>
            <Image source={logo} style={styles.logoImg} resizeMode="contain" />
          </View>
          <View style={styles.truckBadge}>
            <Feather name="truck" size={22} color="#fff" />
          </View>
        </View>
        <Text style={styles.truckName}>{truck?.name ?? "—"}</Text>
        {truck?.plate_number ? <Text style={styles.plate}>{truck.plate_number}</Text> : null}
        <TouchableOpacity
          style={styles.cashBox}
          activeOpacity={0.7}
          onPress={() => router.push("/(tabs)/caisse")}
        >
          <View style={{ alignItems: "flex-end" }}>
            <Text style={styles.cashLabel}>رصيد الصندوق</Text>
            <View style={styles.cashHint}>
              <Feather name="chevron-left" size={13} color="#ffffffcc" />
              <Text style={styles.cashHintText}>إدارة الصندوق والتسليم</Text>
            </View>
          </View>
          <Text style={styles.cashVal}>{fmt(truck?.cash_balance ?? 0)}</Text>
        </TouchableOpacity>
      </View>

      {pendingDispatch && (
        <TouchableOpacity
          style={styles.dispatchAlert}
          activeOpacity={0.85}
          onPress={() => router.push("/(tabs)/dispatch")}
        >
          <View style={styles.dispatchAlertIcon}>
            <Feather name="download" size={18} color="#fff" />
          </View>
          <View style={{ flex: 1, alignItems: "flex-end" }}>
            <Text style={styles.dispatchAlertTitle}>بضاعة بانتظار الاستلام</Text>
            <Text style={styles.dispatchAlertSub}>اضغط لاستلام البضاعة المرسلة من الإدارة</Text>
          </View>
          <Feather name="chevron-left" size={18} color="#fff" />
        </TouchableOpacity>
      )}

      <View style={styles.statsRow}>
        <StatCard label="مبيعات اليوم" value={fmt(todaySales)} icon="dollar-sign" colors={colors} />
        <StatCard label="إجمالي الفواتير" value={String(totalInvoices)} icon="file-text" colors={colors} />
        <StatCard label="الأصناف" value={String(stock.length)} icon="box" colors={colors} />
      </View>

      <View style={[styles.segment, { backgroundColor: colors.card, borderColor: colors.border }]}>
        {TABS.map((t) => {
          const active = tab === t.key;
          return (
            <TouchableOpacity
              key={t.key}
              style={[styles.segmentBtn, active && { backgroundColor: colors.primary }]}
              onPress={() => setTab(t.key)}
              activeOpacity={0.8}
            >
              <Feather name={t.icon} size={15} color={active ? "#fff" : colors.mutedForeground} />
              <Text style={[styles.segmentText, { color: active ? "#fff" : colors.mutedForeground }]}>
                {t.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <SyncBar />
      <FlatList
        data={data}
        keyExtractor={(i) => i.sync_id}
        renderItem={renderItem}
        ListHeaderComponent={header}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Feather name={emptyIcon as any} size={40} color={colors.muted} />
            <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>{emptyText}</Text>
          </View>
        }
        showsVerticalScrollIndicator={false}
      />
      <TouchableOpacity
        style={[styles.fab, { backgroundColor: colors.primary, bottom: insets.bottom + 74 }]}
        onPress={handleNew}
        activeOpacity={0.85}
      >
        <Feather name="plus" size={20} color="#fff" />
        <Text style={styles.fabText}>بيع جديد</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  list: { paddingHorizontal: 12, paddingBottom: 100, gap: 8 },

  header: { borderRadius: 18, padding: 16, marginTop: 8, marginBottom: 12, gap: 6 },
  headerTop: { flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "center" },
  logoChip: {
    backgroundColor: "#fff", borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6,
    justifyContent: "center", alignItems: "center",
  },
  logoImg: { width: 104, height: 34 },
  truckBadge: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: "#ffffff22",
    alignItems: "center", justifyContent: "center",
  },
  truckName: { color: "#fff", fontSize: 19, fontFamily: "Cairo_700Bold", textAlign: "right", marginTop: 8 },
  plate: { color: "#ffffffcc", fontSize: 13, fontFamily: "Cairo_400Regular", textAlign: "right" },
  cashBox: {
    flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "center",
    marginTop: 10, paddingTop: 12, borderTopWidth: 1, borderTopColor: "#ffffff33",
  },
  cashLabel: { color: "#ffffffcc", fontSize: 13, fontFamily: "Cairo_600SemiBold" },
  cashHint: { flexDirection: "row-reverse", alignItems: "center", gap: 2, marginTop: 2 },
  cashHintText: { color: "#ffffffcc", fontSize: 10, fontFamily: "Cairo_400Regular" },
  cashVal: { color: "#fff", fontSize: 22, fontFamily: "Cairo_700Bold" },

  dispatchAlert: {
    flexDirection: "row-reverse", alignItems: "center", gap: 10,
    backgroundColor: "#d97706", borderRadius: 14, padding: 14, marginBottom: 12,
  },
  dispatchAlertIcon: {
    width: 38, height: 38, borderRadius: 19, backgroundColor: "#ffffff33",
    alignItems: "center", justifyContent: "center",
  },
  dispatchAlertTitle: { color: "#fff", fontSize: 14, fontFamily: "Cairo_700Bold" },
  dispatchAlertSub: { color: "#ffffffdd", fontSize: 11, fontFamily: "Cairo_400Regular" },
  statsRow: { flexDirection: "row-reverse", gap: 8, marginBottom: 12 },
  statCard: {
    flex: 1, borderRadius: 14, borderWidth: 1, padding: 12, alignItems: "center", gap: 6,
  },
  statIcon: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  statValue: { fontSize: 14, fontFamily: "Cairo_700Bold" },
  statLabel: { fontSize: 11, fontFamily: "Cairo_400Regular", textAlign: "center" },

  segment: {
    flexDirection: "row-reverse", borderRadius: 12, borderWidth: 1, padding: 4, gap: 4, marginBottom: 4,
  },
  segmentBtn: {
    flex: 1, flexDirection: "row-reverse", alignItems: "center", justifyContent: "center",
    gap: 6, paddingVertical: 9, borderRadius: 9,
  },
  segmentText: { fontSize: 13, fontFamily: "Cairo_600SemiBold" },

  card: { borderRadius: 14, borderWidth: 1, padding: 14 },
  cardRow: { flexDirection: "row-reverse", alignItems: "center", gap: 10 },
  avatar: { width: 40, height: 40, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  cardTitle: { fontSize: 15, fontFamily: "Cairo_600SemiBold" },
  cardSub: { fontSize: 12, fontFamily: "Cairo_400Regular" },
  amount: { fontSize: 15, fontFamily: "Cairo_700Bold" },
  badge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8, marginTop: 4 },
  badgeText: { fontSize: 11, fontFamily: "Cairo_600SemiBold" },
  qty: { fontSize: 18, fontFamily: "Cairo_700Bold" },
  unit: { fontSize: 11, fontFamily: "Cairo_400Regular" },

  empty: { alignItems: "center", paddingVertical: 70, gap: 12 },
  emptyText: { fontSize: 14, fontFamily: "Cairo_400Regular" },

  fab: {
    position: "absolute", bottom: 24, alignSelf: "center",
    flexDirection: "row-reverse", alignItems: "center", gap: 8,
    paddingHorizontal: 22, height: 52, borderRadius: 26,
    elevation: 6, shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.25, shadowRadius: 6,
  },
  fabText: { color: "#fff", fontSize: 15, fontFamily: "Cairo_700Bold" },
});
