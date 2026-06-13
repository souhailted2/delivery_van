import { Feather } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import {
  Alert, FlatList, Modal, RefreshControl, ScrollView, StyleSheet, Text,
  TextInput, TouchableOpacity, View,
} from "react-native";
import { SyncBar } from "@/components/SyncBar";
import { useAuth } from "@/contexts/AuthContext";
import { useSync } from "@/contexts/SyncContext";
import { getDb } from "@/lib/db";
import { newSyncId } from "@/lib/uuid";
import { useColors } from "@/hooks/useColors";

interface WarehouseRow {
  sync_id: string;
  product_id: number;
  product_name: string;
  category_name?: string;
  quantity: number;
  unit?: string;
  purchase_price?: number;
}

interface TruckRow { id: number; name: string; }

interface TransferItem {
  productId: number;
  productName: string;
  available: number;
  unit: string;
  quantity: string;
}

export default function WarehouseScreen() {
  const colors = useColors();
  const { user } = useAuth();
  const { triggerSync } = useSync();
  const [stock, setStock] = useState<WarehouseRow[]>([]);
  const [trucks, setTrucks] = useState<TruckRow[]>([]);
  const [search, setSearch] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [showTransfer, setShowTransfer] = useState(false);
  const [selectedTruck, setSelectedTruck] = useState<string>("");
  const [transferItems, setTransferItems] = useState<TransferItem[]>([]);
  const [transferring, setTransferring] = useState(false);

  const load = useCallback(async () => {
    const db = await getDb();
    if (!db) return;
    const q = search.trim();
    const rows = await db.getAllAsync<WarehouseRow>(
      `SELECT p.sync_id, p.id as product_id, p.name as product_name,
              c.name as category_name, p.stock_quantity as quantity,
              p.unit, p.purchase_price
       FROM products p
       LEFT JOIN categories c ON p.category_id = c.id
       WHERE p.is_deleted = 0 ${q ? "AND p.name LIKE ?" : ""}
       ORDER BY p.name`,
      q ? [`%${q}%`] : []
    );
    setStock(rows);
    const truckRows = await db.getAllAsync<TruckRow>(
      "SELECT id, name FROM trucks WHERE is_deleted = 0 ORDER BY name"
    );
    setTrucks(truckRows);
  }, [search]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRefresh = async () => {
    setRefreshing(true);
    triggerSync();
    await load();
    setRefreshing(false);
  };

  const openTransfer = () => {
    setSelectedTruck("");
    setTransferItems(
      stock.filter(s => s.quantity > 0).map(s => ({
        productId: s.product_id,
        productName: s.product_name,
        available: s.quantity,
        unit: s.unit ?? "حبة",
        quantity: "0",
      }))
    );
    setShowTransfer(true);
  };

  const setQty = (productId: number, val: string) => {
    setTransferItems(prev => prev.map(i => i.productId === productId ? { ...i, quantity: val } : i));
  };

  const handleTransfer = async () => {
    if (!selectedTruck) { Alert.alert("تنبيه", "اختر الشاحنة أولاً"); return; }
    const items = transferItems.filter(i => Number(i.quantity) > 0);
    if (items.length === 0) { Alert.alert("تنبيه", "أدخل كمية واحدة على الأقل"); return; }
    for (const item of items) {
      if (Number(item.quantity) > item.available) {
        Alert.alert("خطأ", `الكمية تتجاوز المخزون لـ ${item.productName}`);
        return;
      }
    }
    setTransferring(true);
    try {
      const db = await getDb();
      if (!db) return;
      const now = new Date().toISOString();
      const transferSyncId = newSyncId();
      const truckId = Number(selectedTruck);
      await db.runAsync(
        `INSERT INTO stock_transfers (sync_id, from_truck_id, to_truck_id, from_warehouse, note, created_at, updated_at, is_deleted, _pending)
         VALUES (?, NULL, ?, 1, NULL, ?, ?, 0, 1)`,
        [transferSyncId, truckId, now, now]
      );
      for (const item of items) {
        await db.runAsync(
          `INSERT INTO stock_transfer_items (sync_id, stock_transfer_sync_id, product_id, product_name, quantity, updated_at, _pending)
           VALUES (?, ?, ?, ?, ?, ?, 1)`,
          [newSyncId(), transferSyncId, item.productId, item.productName, Number(item.quantity), now]
        );
        await db.runAsync(
          "UPDATE products SET stock_quantity = MAX(0, stock_quantity - ?), updated_at = ?, _pending = 1 WHERE id = ?",
          [Number(item.quantity), now, item.productId]
        );
        const existing = await db.getFirstAsync<{ _lid: number }>(
          "SELECT _lid FROM truck_stock WHERE truck_id = ? AND product_id = ?",
          [truckId, item.productId]
        );
        if (existing) {
          await db.runAsync(
            "UPDATE truck_stock SET quantity = quantity + ?, updated_at = ?, _pending = 1 WHERE _lid = ?",
            [Number(item.quantity), now, existing._lid]
          );
        } else {
          await db.runAsync(
            "INSERT INTO truck_stock (sync_id, truck_id, product_id, quantity, updated_at, _pending) VALUES (?, ?, ?, ?, ?, 1)",
            [newSyncId(), truckId, item.productId, Number(item.quantity), now]
          );
        }
      }
      setShowTransfer(false);
      triggerSync();
      load();
      Alert.alert("تم", "تم تحويل المخزون للشاحنة بنجاح ✓");
    } catch (e: any) {
      Alert.alert("خطأ", e?.message ?? "فشل التحويل");
    } finally {
      setTransferring(false);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <SyncBar />
      <View style={styles.topBar}>
        <View style={[styles.searchBar, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Feather name="search" size={16} color={colors.mutedForeground} />
          <TextInput
            style={[styles.searchInput, { color: colors.foreground }]}
            placeholder="ابحث..." placeholderTextColor={colors.mutedForeground}
            value={search} onChangeText={setSearch} textAlign="right"
          />
        </View>
        <TouchableOpacity
          style={[styles.transferBtn, { backgroundColor: colors.primary }]}
          onPress={openTransfer}
        >
          <Feather name="arrow-left" size={16} color="#fff" />
          <Text style={styles.transferBtnText}>تحويل</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={stock}
        keyExtractor={i => i.sync_id}
        renderItem={({ item }) => (
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.cardRow}>
              <View style={[styles.avatar, { backgroundColor: item.quantity < 5 ? colors.destructive + "22" : colors.primary + "22" }]}>
                <Feather name="archive" size={16} color={item.quantity < 5 ? colors.destructive : colors.primary} />
              </View>
              <View style={{ flex: 1, alignItems: "flex-end" }}>
                <Text style={[styles.productName, { color: colors.foreground }]}>{item.product_name}</Text>
                {item.category_name && <Text style={[styles.sub, { color: colors.mutedForeground }]}>{item.category_name}</Text>}
              </View>
              <View style={{ alignItems: "center", gap: 2 }}>
                <Text style={[styles.qty, { color: item.quantity < 5 ? colors.destructive : colors.foreground }]}>
                  {Number(item.quantity ?? 0).toFixed(0)}
                </Text>
                <Text style={[styles.unit, { color: colors.mutedForeground }]}>{item.unit ?? "حبة"}</Text>
              </View>
            </View>
          </View>
        )}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Feather name="archive" size={40} color={colors.muted} />
            <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
              {search ? "لا توجد نتائج" : "المخزن فارغ — قم بالمزامنة"}
            </Text>
          </View>
        }
        showsVerticalScrollIndicator={false}
      />

      <Modal visible={showTransfer} animationType="slide" onRequestClose={() => setShowTransfer(false)}>
        <View style={[styles.modal, { backgroundColor: colors.background }]}>
          <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
            <TouchableOpacity onPress={() => setShowTransfer(false)}>
              <Feather name="x" size={22} color={colors.foreground} />
            </TouchableOpacity>
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>تحويل إلى شاحنة</Text>
            <TouchableOpacity
              style={[styles.saveBtn, { backgroundColor: transferring ? colors.muted : colors.primary }]}
              onPress={handleTransfer} disabled={transferring}
            >
              <Text style={styles.saveBtnText}>{transferring ? "جاري..." : "تأكيد"}</Text>
            </TouchableOpacity>
          </View>

          <View style={[styles.truckSection, { borderBottomColor: colors.border }]}>
            <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>الشاحنة المستلِمة</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.truckChips}>
              {trucks.map(t => (
                <TouchableOpacity
                  key={t.id}
                  style={[styles.chip, {
                    backgroundColor: selectedTruck === String(t.id) ? colors.primary : colors.card,
                    borderColor: selectedTruck === String(t.id) ? colors.primary : colors.border,
                  }]}
                  onPress={() => setSelectedTruck(String(t.id))}
                >
                  <Text style={[styles.chipText, { color: selectedTruck === String(t.id) ? "#fff" : colors.foreground }]}>
                    {t.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>

          <FlatList
            data={transferItems.filter(i => i.available > 0)}
            keyExtractor={i => String(i.productId)}
            renderItem={({ item }) => (
              <View style={[styles.transferRow, { borderBottomColor: colors.border }]}>
                <View style={styles.transferQty}>
                  <TextInput
                    style={[styles.qtyInput, {
                      backgroundColor: colors.card,
                      borderColor: Number(item.quantity) > item.available ? colors.destructive : colors.border,
                      color: colors.foreground,
                    }]}
                    value={item.quantity}
                    onChangeText={val => setQty(item.productId, val)}
                    keyboardType="numeric" textAlign="center"
                  />
                  <Text style={[styles.availText, { color: colors.mutedForeground }]}>/{item.available}</Text>
                </View>
                <View style={{ flex: 1, alignItems: "flex-end" }}>
                  <Text style={[styles.transferName, { color: colors.foreground }]}>{item.productName}</Text>
                  <Text style={[styles.transferUnit, { color: colors.mutedForeground }]}>{item.unit}</Text>
                </View>
              </View>
            )}
            contentContainerStyle={{ paddingBottom: 40 }}
          />
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  topBar: { flexDirection: "row-reverse", gap: 8, margin: 12, alignItems: "center" },
  searchBar: { flex: 1, flexDirection: "row-reverse", alignItems: "center", gap: 8, paddingHorizontal: 14, height: 44, borderRadius: 12, borderWidth: 1 },
  searchInput: { flex: 1, fontSize: 14, fontFamily: "Cairo_400Regular" },
  transferBtn: { flexDirection: "row-reverse", alignItems: "center", gap: 6, paddingHorizontal: 14, height: 44, borderRadius: 12 },
  transferBtnText: { color: "#fff", fontSize: 13, fontFamily: "Cairo_600SemiBold" },
  list: { paddingHorizontal: 12, paddingBottom: 16, gap: 8 },
  card: { borderRadius: 14, borderWidth: 1, padding: 14 },
  cardRow: { flexDirection: "row-reverse", alignItems: "center", gap: 10 },
  avatar: { width: 36, height: 36, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  productName: { fontSize: 14, fontFamily: "Cairo_600SemiBold" },
  sub: { fontSize: 12, fontFamily: "Cairo_400Regular" },
  qty: { fontSize: 18, fontFamily: "Cairo_700Bold" },
  unit: { fontSize: 11, fontFamily: "Cairo_400Regular" },
  empty: { alignItems: "center", paddingVertical: 60, gap: 12 },
  emptyText: { fontSize: 14, fontFamily: "Cairo_400Regular", textAlign: "center" },
  modal: { flex: 1 },
  modalHeader: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", padding: 16, borderBottomWidth: 1 },
  modalTitle: { fontSize: 16, fontFamily: "Cairo_700Bold" },
  saveBtn: { paddingHorizontal: 18, paddingVertical: 8, borderRadius: 10 },
  saveBtnText: { color: "#fff", fontSize: 14, fontFamily: "Cairo_600SemiBold" },
  truckSection: { paddingVertical: 12, paddingHorizontal: 16, borderBottomWidth: 1, gap: 8 },
  sectionLabel: { fontSize: 12, fontFamily: "Cairo_400Regular", textAlign: "right" },
  truckChips: { flexDirection: "row-reverse", gap: 8, paddingVertical: 4 },
  chip: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, borderWidth: 1 },
  chipText: { fontSize: 13, fontFamily: "Cairo_600SemiBold" },
  transferRow: { flexDirection: "row-reverse", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1 },
  transferQty: { flexDirection: "row-reverse", alignItems: "center", gap: 4 },
  qtyInput: { width: 60, height: 40, borderRadius: 8, borderWidth: 1, fontSize: 15, fontFamily: "Cairo_700Bold" },
  availText: { fontSize: 12, fontFamily: "Cairo_400Regular" },
  transferName: { fontSize: 14, fontFamily: "Cairo_600SemiBold" },
  transferUnit: { fontSize: 12, fontFamily: "Cairo_400Regular" },
});
