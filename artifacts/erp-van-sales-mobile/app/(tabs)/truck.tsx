import { Feather } from "@expo/vector-icons";
import { useRefreshOnFocus } from "@/hooks/useRefreshOnFocus";
import { useCallback, useState } from "react";
import { FlatList, RefreshControl, StyleSheet, Text, TextInput, View } from "react-native";
import { SyncBar } from "@/components/SyncBar";
import { useAuth } from "@/contexts/AuthContext";
import { useSync } from "@/contexts/SyncContext";
import { getDb } from "@/lib/db";
import { getTruckForUser, TruckInfo } from "@/lib/truck";
import { useColors } from "@/hooks/useColors";

interface StockRow {
  sync_id: string;
  product_id: number;
  product_name: string;
  quantity: number;
  unit: string;
  selling_price_retail: number;
}

function StockCard({ item, colors }: { item: StockRow; colors: any }) {
  const qty = Number(item.quantity ?? 0);
  const qtyColor = qty === 0 ? colors.destructive : qty < 5 ? colors.warning : colors.foreground;
  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={styles.row}>
        <View style={[styles.avatar, { backgroundColor: colors.primary + "15" }]}>
          <Feather name="box" size={16} color={colors.primary} />
        </View>
        <View style={{ flex: 1, alignItems: "flex-end" }}>
          <Text style={[styles.productName, { color: colors.foreground }]}>{item.product_name}</Text>
          <Text style={[styles.price, { color: colors.mutedForeground }]}>
            {Number(item.selling_price_retail ?? 0).toLocaleString("fr-DZ")} د.ج
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

export default function TruckScreen() {
  const colors = useColors();
  const { user } = useAuth();
  const { triggerSync } = useSync();
  const [truck, setTruck] = useState<TruckInfo | null>(null);
  const [stock, setStock] = useState<StockRow[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    const db = await getDb();
    if (!db) return;
    const truckRow = await getTruckForUser(db, user?.truckId);
    setTruck(truckRow);

    // Fallback: use user.truckId when trucks table hasn't synced the row yet,
    // so stock still loads correctly (mirrors how invoice/new.tsx loads products).
    const truckId = truckRow?.id ?? user?.truckId ?? null;
    if (truckId) {
      const rows = await db.getAllAsync<StockRow>(
        `SELECT MIN(ts.sync_id) as sync_id, p.id as product_id, p.name as product_name,
                SUM(ts.quantity) as quantity, p.unit, p.selling_price_retail
         FROM truck_stock ts
         JOIN products p ON ts.product_id = p.id
         WHERE ts.truck_id = ?
         GROUP BY p.id, p.name, p.unit, p.selling_price_retail
         HAVING SUM(ts.quantity) > 0
         ORDER BY p.name`,
        [truckId]
      );
      setStock(rows);
    }
  }, [user?.truckId]);

  useRefreshOnFocus(load);

  const onRefresh = async () => {
    setRefreshing(true);
    triggerSync();
    await load();
    setRefreshing(false);
  };

  const filteredStock = search.trim()
    ? stock.filter(r => r.product_name.toLowerCase().includes(search.trim().toLowerCase()))
    : stock;

  const totalValue = stock.reduce((s, r) => s + r.quantity * r.selling_price_retail, 0);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <SyncBar />
      {truck ? (
        <View style={[styles.header, { backgroundColor: colors.primary }]}>
          <View style={styles.headerRow}>
            <View>
              <Text style={styles.truckName}>{truck.name}</Text>
              {truck.plate_number && (
                <Text style={styles.plate}>{truck.plate_number}</Text>
              )}
            </View>
            <Feather name="truck" size={28} color="#fff" />
          </View>
          <View style={[styles.divider, { backgroundColor: "#ffffff33" }]} />
          <View style={styles.statsRow}>
            <View style={styles.stat}>
              <Text style={styles.statVal}>{Number(truck.cash_balance ?? 0).toLocaleString("fr-DZ")} د.ج</Text>
              <Text style={styles.statLabel}>رصيد الصندوق</Text>
            </View>
            <View style={styles.stat}>
              <Text style={styles.statVal}>{totalValue.toLocaleString("fr-DZ")} د.ج</Text>
              <Text style={styles.statLabel}>قيمة المخزون</Text>
            </View>
            <View style={styles.stat}>
              <Text style={styles.statVal}>{stock.length}</Text>
              <Text style={styles.statLabel}>أصناف</Text>
            </View>
          </View>
        </View>
      ) : user?.truckId ? (
        <View style={[styles.noTruck, { backgroundColor: colors.card }]}>
          <Feather name="loader" size={20} color={colors.primary} />
          <Text style={[styles.noTruckText, { color: colors.mutedForeground }]}>جارٍ تحميل بيانات الشاحنة…</Text>
        </View>
      ) : (
        <View style={[styles.noTruck, { backgroundColor: colors.card }]}>
          <Feather name="alert-circle" size={20} color={colors.warning} />
          <Text style={[styles.noTruckText, { color: colors.mutedForeground }]}>لم يتم تعيين شاحنة لهذا الحساب</Text>
        </View>
      )}
      <View style={[styles.searchBar, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Feather name="search" size={16} color={colors.mutedForeground} />
        <TextInput
          style={[styles.searchInput, { color: colors.foreground }]}
          placeholder="ابحث عن منتج..."
          placeholderTextColor={colors.mutedForeground}
          value={search}
          onChangeText={setSearch}
          textAlign="right"
        />
      </View>
      <FlatList
        data={filteredStock}
        keyExtractor={i => i.sync_id}
        renderItem={({ item }) => <StockCard item={item} colors={colors} />}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Feather name="inbox" size={40} color={colors.muted} />
            <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
              {search.trim() ? "لا توجد نتائج" : "المخزون فارغ"}
            </Text>
          </View>
        }
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { margin: 12, borderRadius: 16, padding: 16, gap: 12 },
  headerRow: { flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "center" },
  truckName: { color: "#fff", fontSize: 18, fontFamily: "Cairo_700Bold", textAlign: "right" },
  plate: { color: "#ffffff99", fontSize: 13, fontFamily: "Cairo_400Regular", textAlign: "right" },
  divider: { height: 1 },
  statsRow: { flexDirection: "row-reverse", justifyContent: "space-around" },
  stat: { alignItems: "center", gap: 2 },
  statVal: { color: "#fff", fontSize: 15, fontFamily: "Cairo_700Bold" },
  statLabel: { color: "#ffffff99", fontSize: 11, fontFamily: "Cairo_400Regular" },
  noTruck: { margin: 12, borderRadius: 12, padding: 14, flexDirection: "row-reverse", alignItems: "center", gap: 8 },
  noTruckText: { fontSize: 13, fontFamily: "Cairo_400Regular" },
  list: { paddingHorizontal: 12, paddingBottom: 16, gap: 8 },
  card: { borderRadius: 12, borderWidth: 1, padding: 12 },
  row: { flexDirection: "row-reverse", alignItems: "center", gap: 10 },
  avatar: { width: 36, height: 36, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  productName: { fontSize: 14, fontFamily: "Cairo_600SemiBold" },
  price: { fontSize: 12, fontFamily: "Cairo_400Regular" },
  qty: { fontSize: 18, fontFamily: "Cairo_700Bold" },
  unit: { fontSize: 11, fontFamily: "Cairo_400Regular" },
  searchBar: { flexDirection: "row-reverse", alignItems: "center", gap: 8, paddingHorizontal: 14, height: 44, borderRadius: 12, borderWidth: 1, marginHorizontal: 12, marginBottom: 8 },
  searchInput: { flex: 1, fontSize: 14, fontFamily: "Cairo_400Regular" },
  empty: { alignItems: "center", paddingVertical: 60, gap: 12 },
  emptyText: { fontSize: 14, fontFamily: "Cairo_400Regular" },
});
