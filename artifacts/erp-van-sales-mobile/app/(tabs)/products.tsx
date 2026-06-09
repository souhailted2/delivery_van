import { Feather } from "@expo/vector-icons";
import { useCallback, useEffect, useState } from "react";
import {
  FlatList, RefreshControl, StyleSheet, Text,
  TextInput, TouchableOpacity, View,
} from "react-native";
import { SyncBar } from "@/components/SyncBar";
import { useSync } from "@/contexts/SyncContext";
import { getDb, Product } from "@/lib/db";
import { useColors } from "@/hooks/useColors";

function ProductCard({ item, colors }: { item: Product & { category_name?: string }; colors: any }) {
  const prices = [
    { label: "تجزئة", value: item.selling_price_retail },
    { label: "نصف جملة", value: item.selling_price_half_wholesale },
    { label: "جملة", value: item.selling_price_wholesale },
  ];
  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={styles.cardRow}>
        <View style={[styles.avatar, { backgroundColor: colors.primary + "22" }]}>
          <Feather name="package" size={20} color={colors.primary} />
        </View>
        <View style={{ flex: 1, alignItems: "flex-end" }}>
          <Text style={[styles.productName, { color: colors.foreground }]}>{item.name}</Text>
          {item.category_name && (
            <Text style={[styles.categoryTag, { color: colors.mutedForeground }]}>{item.category_name}</Text>
          )}
        </View>
        {(item._pending ?? 0) > 0 && (
          <View style={[styles.pendingDot, { backgroundColor: colors.warning }]} />
        )}
      </View>
      <View style={[styles.divider, { backgroundColor: colors.border }]} />
      <View style={styles.pricesRow}>
        {prices.map(p => (
          <View key={p.label} style={styles.priceItem}>
            <Text style={[styles.priceVal, { color: colors.foreground }]}>{Number(p.value ?? 0).toLocaleString("fr-DZ")}</Text>
            <Text style={[styles.priceLabel, { color: colors.mutedForeground }]}>{p.label}</Text>
          </View>
        ))}
        <View style={styles.priceItem}>
          <Text style={[styles.priceVal, { color: colors.foreground }]}>{Number(item.stock_quantity ?? 0).toFixed(0)}</Text>
          <Text style={[styles.priceLabel, { color: colors.mutedForeground }]}>المخزون</Text>
        </View>
      </View>
    </View>
  );
}

export default function ProductsScreen() {
  const colors = useColors();
  const { triggerSync } = useSync();
  const [products, setProducts] = useState<(Product & { category_name?: string })[]>([]);
  const [search, setSearch] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const db = await getDb();
    if (!db) return;
    const q = search.trim();
    const rows = await db.getAllAsync<Product & { category_name?: string }>(
      `SELECT p.*, c.name as category_name FROM products p
       LEFT JOIN categories c ON p.category_id = c.id
       WHERE p.is_deleted = 0 ${q ? "AND p.name LIKE ?" : ""}
       ORDER BY p.name`,
      q ? [`%${q}%`] : []
    );
    setProducts(rows);
  }, [search]);

  useEffect(() => { load(); }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    triggerSync();
    await load();
    setRefreshing(false);
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <SyncBar />
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
        data={products}
        keyExtractor={i => i.sync_id}
        renderItem={({ item }) => <ProductCard item={item} colors={colors} />}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Feather name="package" size={40} color={colors.muted} />
            <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
              {search ? "لا توجد نتائج" : "لا توجد منتجات — قم بالمزامنة أولاً"}
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
  searchBar: {
    flexDirection: "row-reverse", alignItems: "center", gap: 8,
    margin: 12, paddingHorizontal: 14, height: 44,
    borderRadius: 12, borderWidth: 1,
  },
  searchInput: { flex: 1, fontSize: 14, fontFamily: "Cairo_400Regular" },
  list: { paddingHorizontal: 12, paddingBottom: 16, gap: 10 },
  card: { borderRadius: 14, borderWidth: 1, padding: 14, gap: 10 },
  cardRow: { flexDirection: "row-reverse", alignItems: "center", gap: 10 },
  avatar: { width: 42, height: 42, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  productName: { fontSize: 15, fontFamily: "Cairo_600SemiBold" },
  categoryTag: { fontSize: 12, fontFamily: "Cairo_400Regular" },
  pendingDot: { width: 8, height: 8, borderRadius: 4 },
  divider: { height: 1 },
  pricesRow: { flexDirection: "row-reverse", justifyContent: "space-around" },
  priceItem: { alignItems: "center", gap: 2 },
  priceVal: { fontSize: 13, fontFamily: "Cairo_700Bold" },
  priceLabel: { fontSize: 11, fontFamily: "Cairo_400Regular" },
  empty: { alignItems: "center", paddingVertical: 60, gap: 12 },
  emptyText: { fontSize: 14, fontFamily: "Cairo_400Regular", textAlign: "center" },
});
