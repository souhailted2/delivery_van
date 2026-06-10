import { Feather } from "@expo/vector-icons";
import { useCallback, useEffect, useState } from "react";
import {
  Alert, FlatList, Modal, RefreshControl, ScrollView, StyleSheet, Text,
  TextInput, TouchableOpacity, View,
} from "react-native";
import { SyncBar } from "@/components/SyncBar";
import { useSync } from "@/contexts/SyncContext";
import { Purchase, Supplier, Product, getDb } from "@/lib/db";
import { newSyncId } from "@/lib/uuid";
import { useColors } from "@/hooks/useColors";

interface PurchaseRow extends Purchase { supplier_name?: string; }

interface PurchaseLineItem {
  product: Product;
  quantity: string;
  unit_price: string;
}

const STATUS_LABELS: Record<string, string> = {
  pending: "معلق", confirmed: "مؤكد", received: "مستلم",
};
const STATUS_COLORS: Record<string, string> = {
  pending: "#f59e0b", confirmed: "#3b82f6", received: "#22c55e",
};

export default function PurchasesScreen() {
  const colors = useColors();
  const { triggerSync } = useSync();
  const [purchases, setPurchases] = useState<PurchaseRow[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [formSupplierId, setFormSupplierId] = useState<number | null>(null);
  const [lineItems, setLineItems] = useState<PurchaseLineItem[]>([]);
  const [showProductPicker, setShowProductPicker] = useState(false);
  const [productSearch, setProductSearch] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const db = await getDb();
    if (!db) return;
    const rows = await db.getAllAsync<PurchaseRow>(
      `SELECT p.*, s.name as supplier_name FROM purchases p
       LEFT JOIN suppliers s ON p.supplier_id = s.id
       WHERE p.is_deleted = 0 ORDER BY p.created_at DESC LIMIT 100`
    );
    setPurchases(rows);
    const sups = await db.getAllAsync<Supplier>("SELECT * FROM suppliers WHERE is_deleted = 0 ORDER BY name");
    setSuppliers(sups);
    const prods = await db.getAllAsync<Product>("SELECT * FROM products WHERE is_deleted = 0 ORDER BY name");
    setProducts(prods);
  }, []);

  useEffect(() => { load(); }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    triggerSync();
    await load();
    setRefreshing(false);
  };

  const openNew = () => {
    setFormSupplierId(null);
    setLineItems([]);
    setShowModal(true);
  };

  const addProduct = (product: Product) => {
    const existing = lineItems.find(i => i.product.sync_id === product.sync_id);
    if (existing) {
      setLineItems(lineItems.map(i =>
        i.product.sync_id === product.sync_id
          ? { ...i, quantity: String(Number(i.quantity) + 1) }
          : i
      ));
    } else {
      setLineItems([...lineItems, {
        product,
        quantity: "1",
        unit_price: String(product.purchase_price ?? 0),
      }]);
    }
    setShowProductPicker(false);
    setProductSearch("");
  };

  const total = lineItems.reduce((s, i) => s + Number(i.quantity || 0) * Number(i.unit_price || 0), 0);

  const handleSave = async () => {
    if (lineItems.length === 0) { Alert.alert("تنبيه", "أضف منتجاً واحداً على الأقل"); return; }
    setSaving(true);
    try {
      const db = await getDb();
      if (!db) return;
      const now = new Date().toISOString();
      const purchaseSyncId = newSyncId();
      await db.runAsync(
        `INSERT INTO purchases (sync_id, supplier_id, total_amount, status, created_at, updated_at, is_deleted, _pending)
         VALUES (?, ?, ?, 'pending', ?, ?, 0, 1)`,
        [purchaseSyncId, formSupplierId, total, now, now]
      );
      for (const item of lineItems) {
        const qty = Number(item.quantity || 0);
        const price = Number(item.unit_price || 0);
        await db.runAsync(
          `INSERT INTO purchase_items (sync_id, purchase_sync_id, product_id, product_name, quantity, unit_price, subtotal, updated_at, _pending)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)`,
          [newSyncId(), purchaseSyncId, item.product.id ?? null, item.product.name, qty, price, qty * price, now]
        );
      }
      setShowModal(false);
      triggerSync();
      load();
    } catch (e: any) {
      Alert.alert("خطأ", e?.message ?? "فشل الحفظ");
    } finally {
      setSaving(false);
    }
  };

  const filteredProducts = products.filter(p =>
    !productSearch || p.name.toLowerCase().includes(productSearch.toLowerCase())
  );

  const fmt = (n: number) => n.toLocaleString("fr-DZ") + " د.ج";

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <SyncBar />

      <View style={[styles.topBar, { borderBottomColor: colors.border }]}>
        <TouchableOpacity style={[styles.addBtn, { backgroundColor: colors.primary }]} onPress={openNew}>
          <Feather name="plus" size={16} color="#fff" />
          <Text style={styles.addBtnText}>أمر شراء جديد</Text>
        </TouchableOpacity>
        <Text style={[styles.pageTitle, { color: colors.foreground }]}>أوامر الشراء</Text>
      </View>

      <FlatList
        data={purchases}
        keyExtractor={i => i.sync_id}
        renderItem={({ item }) => {
          const statusColor = STATUS_COLORS[item.status ?? "pending"] ?? colors.mutedForeground;
          return (
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={styles.cardRow}>
                <View style={[styles.avatar, { backgroundColor: statusColor + "22" }]}>
                  <Feather name="shopping-cart" size={16} color={statusColor} />
                </View>
                <View style={{ flex: 1, alignItems: "flex-end" }}>
                  <Text style={[styles.name, { color: colors.foreground }]}>{item.supplier_name ?? "بدون مورد"}</Text>
                  <Text style={[styles.sub, { color: colors.mutedForeground }]}>
                    {item.created_at ? new Date(item.created_at).toLocaleDateString("ar-DZ") : ""}
                  </Text>
                </View>
                <View style={{ alignItems: "flex-end", gap: 4 }}>
                  <Text style={[styles.total, { color: colors.foreground }]}>{fmt(Number(item.total_amount ?? 0))}</Text>
                  <View style={[styles.badge, { backgroundColor: statusColor + "22" }]}>
                    <Text style={[styles.badgeText, { color: statusColor }]}>
                      {STATUS_LABELS[item.status ?? "pending"]}
                    </Text>
                  </View>
                </View>
              </View>
            </View>
          );
        }}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Feather name="shopping-cart" size={40} color={colors.muted} />
            <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>لا توجد أوامر شراء</Text>
          </View>
        }
        showsVerticalScrollIndicator={false}
      />

      <Modal visible={showModal} animationType="slide" onRequestClose={() => setShowModal(false)}>
        <View style={[styles.modal, { backgroundColor: colors.background }]}>
          <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
            <TouchableOpacity onPress={() => setShowModal(false)}>
              <Feather name="x" size={22} color={colors.foreground} />
            </TouchableOpacity>
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>أمر شراء جديد</Text>
            <TouchableOpacity
              style={[styles.saveBtn, { backgroundColor: saving ? colors.muted : colors.primary }]}
              onPress={handleSave} disabled={saving}
            >
              <Text style={styles.saveBtnText}>{saving ? "جاري..." : "حفظ"}</Text>
            </TouchableOpacity>
          </View>

          <ScrollView keyboardShouldPersistTaps="handled">
            {/* Supplier */}
            <View style={[styles.section, { borderBottomColor: colors.border }]}>
              <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>المورد (اختياري)</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
                <TouchableOpacity
                  style={[styles.chip, { backgroundColor: formSupplierId === null ? colors.secondary : colors.card, borderColor: colors.border }]}
                  onPress={() => setFormSupplierId(null)}
                >
                  <Text style={[styles.chipText, { color: formSupplierId === null ? colors.foreground : colors.mutedForeground }]}>بدون</Text>
                </TouchableOpacity>
                {suppliers.map(s => (
                  <TouchableOpacity
                    key={s.sync_id}
                    style={[styles.chip, {
                      backgroundColor: formSupplierId === s.id ? colors.primary : colors.card,
                      borderColor: formSupplierId === s.id ? colors.primary : colors.border,
                    }]}
                    onPress={() => setFormSupplierId(s.id ?? null)}
                  >
                    <Text style={[styles.chipText, { color: formSupplierId === s.id ? "#fff" : colors.foreground }]}>
                      {s.name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>

            {/* Add product btn */}
            <TouchableOpacity
              style={[styles.addProductBtn, { borderColor: colors.primary, margin: 12 }]}
              onPress={() => setShowProductPicker(true)}
            >
              <Feather name="plus-circle" size={18} color={colors.primary} />
              <Text style={[styles.addProductText, { color: colors.primary }]}>إضافة منتج</Text>
            </TouchableOpacity>

            {/* Line items */}
            {lineItems.map((item, idx) => (
              <View key={item.product.sync_id} style={[styles.lineItem, { backgroundColor: colors.card, borderColor: colors.border, marginHorizontal: 12, marginBottom: 8 }]}>
                <TouchableOpacity onPress={() => setLineItems(lineItems.filter((_, i) => i !== idx))}>
                  <Feather name="trash-2" size={15} color={colors.destructive} />
                </TouchableOpacity>
                <View style={styles.lineInputs}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.lineLabel, { color: colors.mutedForeground }]}>السعر</Text>
                    <TextInput
                      style={[styles.lineInput, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }]}
                      value={item.unit_price}
                      onChangeText={val => setLineItems(lineItems.map((i, k) => k === idx ? { ...i, unit_price: val } : i))}
                      keyboardType="decimal-pad" textAlign="right"
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.lineLabel, { color: colors.mutedForeground }]}>الكمية</Text>
                    <TextInput
                      style={[styles.lineInput, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }]}
                      value={item.quantity}
                      onChangeText={val => setLineItems(lineItems.map((i, k) => k === idx ? { ...i, quantity: val } : i))}
                      keyboardType="numeric" textAlign="right"
                    />
                  </View>
                </View>
                <Text style={[styles.lineName, { color: colors.foreground, textAlign: "right" }]}>{item.product.name}</Text>
              </View>
            ))}

            {lineItems.length > 0 && (
              <View style={[styles.totalBar, { backgroundColor: colors.card, borderTopColor: colors.border }]}>
                <Text style={[styles.totalText, { color: colors.foreground }]}>
                  الإجمالي: {fmt(total)}
                </Text>
              </View>
            )}
            <View style={{ height: 40 }} />
          </ScrollView>
        </View>

        {/* Product picker */}
        <Modal visible={showProductPicker} animationType="slide" presentationStyle="pageSheet">
          <View style={[styles.modal, { backgroundColor: colors.background }]}>
            <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
              <TouchableOpacity onPress={() => { setShowProductPicker(false); setProductSearch(""); }}>
                <Feather name="x" size={22} color={colors.foreground} />
              </TouchableOpacity>
              <Text style={[styles.modalTitle, { color: colors.foreground }]}>اختر منتجاً</Text>
              <View style={{ width: 22 }} />
            </View>
            <View style={[styles.searchBar, { backgroundColor: colors.card, borderColor: colors.border, margin: 12 }]}>
              <Feather name="search" size={16} color={colors.mutedForeground} />
              <TextInput
                style={[styles.searchInput, { color: colors.foreground }]}
                placeholder="ابحث..." placeholderTextColor={colors.mutedForeground}
                value={productSearch} onChangeText={setProductSearch}
                textAlign="right" autoFocus
              />
            </View>
            <FlatList
              data={filteredProducts}
              keyExtractor={i => i.sync_id}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[styles.productRow, { backgroundColor: colors.card, borderColor: colors.border }]}
                  onPress={() => addProduct(item)}
                >
                  <Text style={[styles.productPrice, { color: colors.primary }]}>
                    {Number(item.purchase_price ?? 0).toLocaleString("fr-DZ")} د.ج
                  </Text>
                  <Text style={[styles.productName2, { color: colors.foreground }]}>{item.name}</Text>
                </TouchableOpacity>
              )}
              contentContainerStyle={{ padding: 12, gap: 6 }}
            />
          </View>
        </Modal>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  topBar: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1 },
  pageTitle: { fontSize: 17, fontFamily: "Cairo_700Bold" },
  addBtn: { flexDirection: "row-reverse", alignItems: "center", gap: 6, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 12 },
  addBtnText: { color: "#fff", fontSize: 13, fontFamily: "Cairo_600SemiBold" },
  list: { paddingHorizontal: 12, paddingTop: 12, paddingBottom: 16, gap: 8 },
  card: { borderRadius: 14, borderWidth: 1, padding: 14 },
  cardRow: { flexDirection: "row-reverse", alignItems: "center", gap: 10 },
  avatar: { width: 36, height: 36, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  name: { fontSize: 14, fontFamily: "Cairo_600SemiBold" },
  sub: { fontSize: 12, fontFamily: "Cairo_400Regular" },
  total: { fontSize: 14, fontFamily: "Cairo_700Bold" },
  badge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 },
  badgeText: { fontSize: 11, fontFamily: "Cairo_600SemiBold" },
  empty: { alignItems: "center", paddingVertical: 60, gap: 12 },
  emptyText: { fontSize: 14, fontFamily: "Cairo_400Regular" },
  modal: { flex: 1 },
  modalHeader: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", padding: 16, borderBottomWidth: 1 },
  modalTitle: { fontSize: 16, fontFamily: "Cairo_700Bold" },
  saveBtn: { paddingHorizontal: 18, paddingVertical: 8, borderRadius: 10 },
  saveBtnText: { color: "#fff", fontSize: 14, fontFamily: "Cairo_600SemiBold" },
  section: { paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, gap: 8 },
  sectionLabel: { fontSize: 12, fontFamily: "Cairo_400Regular", textAlign: "right" },
  chips: { flexDirection: "row-reverse", gap: 8, paddingVertical: 4 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1 },
  chipText: { fontSize: 13, fontFamily: "Cairo_600SemiBold" },
  addProductBtn: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 8, padding: 12, borderRadius: 12, borderWidth: 1.5, borderStyle: "dashed" },
  addProductText: { fontSize: 15, fontFamily: "Cairo_600SemiBold" },
  lineItem: { borderRadius: 12, borderWidth: 1, padding: 12, gap: 8 },
  lineName: { fontSize: 14, fontFamily: "Cairo_600SemiBold" },
  lineInputs: { flexDirection: "row-reverse", gap: 8 },
  lineLabel: { fontSize: 11, fontFamily: "Cairo_400Regular", textAlign: "right", marginBottom: 4 },
  lineInput: { height: 38, borderRadius: 8, borderWidth: 1, paddingHorizontal: 10, fontSize: 14, fontFamily: "Cairo_400Regular" },
  totalBar: { padding: 16, borderTopWidth: 1 },
  totalText: { fontSize: 16, fontFamily: "Cairo_700Bold", textAlign: "right" },
  searchBar: { flexDirection: "row-reverse", alignItems: "center", gap: 8, paddingHorizontal: 14, height: 44, borderRadius: 12, borderWidth: 1 },
  searchInput: { flex: 1, fontSize: 14, fontFamily: "Cairo_400Regular" },
  productRow: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", padding: 12, borderRadius: 12, borderWidth: 1 },
  productName2: { fontSize: 14, fontFamily: "Cairo_600SemiBold", flex: 1, textAlign: "right" },
  productPrice: { fontSize: 13, fontFamily: "Cairo_700Bold" },
});
