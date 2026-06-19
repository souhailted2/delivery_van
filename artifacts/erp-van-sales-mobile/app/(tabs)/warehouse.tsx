import { Feather } from "@expo/vector-icons";
import { useRefreshOnFocus } from "@/hooks/useRefreshOnFocus";
import { useCallback, useState } from "react";
import {
  FlatList, Modal, RefreshControl, ScrollView, StyleSheet, Text,
  TextInput, View,
} from "react-native";
import { SyncBar } from "@/components/SyncBar";
import { AppButton, EmptyState, PressableScale, ResultDialog } from "@/components/ui";
import type { DialogAction, ResultVariant } from "@/components/ui";
import { useAuth } from "@/contexts/AuthContext";
import { useSync } from "@/contexts/SyncContext";
import { getDb } from "@/lib/db";
import { newSyncId } from "@/lib/uuid";
import { canonicalizeTruckStock } from "@/lib/truckStock";
import { fonts } from "@/constants/tokens";
import { useTheme } from "@/hooks/useTheme";

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
  const t = useTheme();
  const c = t.color;
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

  const [dialog, setDialog] = useState<{ visible: boolean; variant: ResultVariant; title: string; message?: string; actions?: DialogAction[] }>(
    { visible: false, variant: "info", title: "" }
  );
  const showDialog = (variant: ResultVariant, title: string, message?: string, actions?: DialogAction[]) =>
    setDialog({ visible: true, variant, title, message, actions });
  const hideDialog = () => setDialog((d) => ({ ...d, visible: false }));

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

  useRefreshOnFocus(load);

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
    if (!selectedTruck) { showDialog("warning", "تنبيه", "اختر الشاحنة أولاً"); return; }
    const items = transferItems.filter(i => Number(i.quantity) > 0);
    if (items.length === 0) { showDialog("warning", "تنبيه", "أدخل كمية واحدة على الأقل"); return; }
    for (const item of items) {
      if (Number(item.quantity) > item.available) {
        showDialog("error", "خطأ", `الكمية تتجاوز المخزون لـ ${item.productName}`);
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
        await canonicalizeTruckStock(
          db, truckId, item.productId, Number(item.quantity), now
        );
      }
      setShowTransfer(false);
      triggerSync();
      load();
      showDialog("success", "تم", "تم تحويل المخزون للشاحنة بنجاح");
    } catch (e: any) {
      showDialog("error", "خطأ", e?.message ?? "فشل التحويل");
    } finally {
      setTransferring(false);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: c.bg }]}>
      <SyncBar />
      <View style={styles.topBar}>
        <View style={[styles.searchBar, { backgroundColor: c.surface, borderColor: c.hairline }]}>
          <Feather name="search" size={16} color={c.textMuted} />
          <TextInput
            style={[styles.searchInput, { color: c.text }]}
            placeholder="ابحث..." placeholderTextColor={c.textMuted}
            value={search} onChangeText={setSearch} textAlign="right"
          />
        </View>
        <AppButton
          label="تحويل"
          icon="arrow-left"
          size="md"
          onPress={openTransfer}
        />
      </View>

      <FlatList
        data={stock}
        keyExtractor={i => i.sync_id}
        renderItem={({ item }) => (
          <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.hairline }]}>
            <View style={styles.cardRow}>
              <View style={[styles.avatar, { backgroundColor: item.quantity < 5 ? c.dangerTint : c.brandTint }]}>
                <Feather name="archive" size={16} color={item.quantity < 5 ? c.danger : c.brandText} />
              </View>
              <View style={{ flex: 1, alignItems: "flex-end" }}>
                <Text style={[styles.productName, { color: c.text }]}>{item.product_name}</Text>
                {item.category_name && <Text style={[styles.sub, { color: c.textMuted }]}>{item.category_name}</Text>}
              </View>
              <View style={{ alignItems: "center", gap: 2 }}>
                <Text style={[styles.qty, { color: item.quantity < 5 ? c.danger : c.text }]}>
                  {Number(item.quantity ?? 0).toFixed(0)}
                </Text>
                <Text style={[styles.unit, { color: c.textMuted }]}>{item.unit ?? "حبة"}</Text>
              </View>
            </View>
          </View>
        )}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.brand} />}
        ListEmptyComponent={
          search ? (
            <EmptyState icon="search" title="لا توجد نتائج" />
          ) : (
            <EmptyState icon="archive" title="المخزن فارغ — قم بالمزامنة" />
          )
        }
        showsVerticalScrollIndicator={false}
      />

      <Modal visible={showTransfer} animationType="slide" onRequestClose={() => setShowTransfer(false)}>
        <View style={[styles.modal, { backgroundColor: c.bg }]}>
          <View style={[styles.modalHeader, { borderBottomColor: c.hairline }]}>
            <PressableScale onPress={() => setShowTransfer(false)} hitSlop={10} accessibilityLabel="إغلاق">
              <Feather name="x" size={22} color={c.text} />
            </PressableScale>
            <Text style={[styles.modalTitle, { color: c.text }]}>تحويل إلى شاحنة</Text>
            <AppButton
              label={transferring ? "جاري..." : "تأكيد"}
              size="sm"
              loading={transferring}
              onPress={handleTransfer}
            />
          </View>

          <View style={[styles.truckSection, { borderBottomColor: c.hairline }]}>
            <Text style={[styles.sectionLabel, { color: c.textMuted }]}>الشاحنة المستلِمة</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.truckChips}>
              {trucks.map(tr => (
                <PressableScale
                  key={tr.id}
                  style={[styles.chip, {
                    backgroundColor: selectedTruck === String(tr.id) ? c.brand : c.surface,
                    borderColor: selectedTruck === String(tr.id) ? c.brand : c.hairline,
                  }]}
                  onPress={() => setSelectedTruck(String(tr.id))}
                >
                  <Text style={[styles.chipText, { color: selectedTruck === String(tr.id) ? c.onBrand : c.text }]}>
                    {tr.name}
                  </Text>
                </PressableScale>
              ))}
            </ScrollView>
          </View>

          <FlatList
            data={transferItems.filter(i => i.available > 0)}
            keyExtractor={i => String(i.productId)}
            renderItem={({ item }) => (
              <View style={[styles.transferRow, { borderBottomColor: c.hairline }]}>
                <View style={styles.transferQty}>
                  <TextInput
                    style={[styles.qtyInput, {
                      backgroundColor: c.surface,
                      borderColor: Number(item.quantity) > item.available ? c.danger : c.hairline,
                      color: c.text,
                    }]}
                    value={item.quantity}
                    onChangeText={val => setQty(item.productId, val)}
                    keyboardType="numeric" textAlign="center"
                  />
                  <Text style={[styles.availText, { color: c.textMuted }]}>/{item.available}</Text>
                </View>
                <View style={{ flex: 1, alignItems: "flex-end" }}>
                  <Text style={[styles.transferName, { color: c.text }]}>{item.productName}</Text>
                  <Text style={[styles.transferUnit, { color: c.textMuted }]}>{item.unit}</Text>
                </View>
              </View>
            )}
            contentContainerStyle={{ paddingBottom: 40 }}
          />
        </View>
      </Modal>

      <ResultDialog
        visible={dialog.visible}
        variant={dialog.variant}
        title={dialog.title}
        message={dialog.message}
        actions={dialog.actions}
        onRequestClose={hideDialog}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  topBar: { flexDirection: "row-reverse", gap: 8, margin: 12, alignItems: "center" },
  searchBar: { flex: 1, flexDirection: "row-reverse", alignItems: "center", gap: 8, paddingHorizontal: 14, height: 44, borderRadius: 12, borderWidth: 1 },
  searchInput: { flex: 1, fontSize: 14, fontFamily: fonts.regular },
  list: { paddingHorizontal: 12, paddingBottom: 16, gap: 8 },
  card: { borderRadius: 14, borderWidth: 1, padding: 14 },
  cardRow: { flexDirection: "row-reverse", alignItems: "center", gap: 10 },
  avatar: { width: 36, height: 36, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  productName: { fontSize: 14, fontFamily: fonts.semibold },
  sub: { fontSize: 12, fontFamily: fonts.regular },
  qty: { fontSize: 18, fontFamily: fonts.bold },
  unit: { fontSize: 11, fontFamily: fonts.regular },
  modal: { flex: 1 },
  modalHeader: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", padding: 16, borderBottomWidth: 1 },
  modalTitle: { fontSize: 16, fontFamily: fonts.bold },
  truckSection: { paddingVertical: 12, paddingHorizontal: 16, borderBottomWidth: 1, gap: 8 },
  sectionLabel: { fontSize: 12, fontFamily: fonts.regular, textAlign: "right" },
  truckChips: { flexDirection: "row-reverse", gap: 8, paddingVertical: 4 },
  chip: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, borderWidth: 1 },
  chipText: { fontSize: 13, fontFamily: fonts.semibold },
  transferRow: { flexDirection: "row-reverse", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1 },
  transferQty: { flexDirection: "row-reverse", alignItems: "center", gap: 4 },
  qtyInput: { width: 60, height: 40, borderRadius: 8, borderWidth: 1, fontSize: 15, fontFamily: fonts.bold },
  availText: { fontSize: 12, fontFamily: fonts.regular },
  transferName: { fontSize: 14, fontFamily: fonts.semibold },
  transferUnit: { fontSize: 12, fontFamily: fonts.regular },
});
