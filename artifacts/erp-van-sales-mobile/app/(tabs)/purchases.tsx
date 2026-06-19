import { Feather } from "@expo/vector-icons";
import { useRefreshOnFocus } from "@/hooks/useRefreshOnFocus";
import { useCallback, useState } from "react";
import {
  FlatList, Modal, RefreshControl, ScrollView, StyleSheet, Text,
  TextInput, View,
} from "react-native";
import { SyncBar } from "@/components/SyncBar";
import { AppButton, EmptyState, MoneyText, PressableScale, ResultDialog, StatusPill } from "@/components/ui";
import type { DialogAction, ResultVariant, Status as PillStatus } from "@/components/ui";
import { useSync } from "@/contexts/SyncContext";
import { Purchase, Supplier, Product, getDb } from "@/lib/db";
import { formatMoney } from "@/lib/money";
import { newSyncId } from "@/lib/uuid";
import { fonts } from "@/constants/tokens";
import { useTheme } from "@/hooks/useTheme";

interface PurchaseRow extends Purchase { supplier_name?: string; }

interface PurchaseLineItem {
  product: Product;
  quantity: string;
  unit_price: string;
}

const STATUS_LABELS: Record<string, string> = {
  pending: "معلق", partial: "جزئي", paid: "مدفوع", confirmed: "مؤكد", received: "مستلم",
};
// Map each business status to a StatusPill semantic tone (label text preserved
// via the `label` override). paid/received → green, pending → amber, others → neutral.
const STATUS_PILL: Record<string, PillStatus> = {
  pending: "pending", partial: "neutral", paid: "approved", confirmed: "neutral", received: "approved",
};

export default function PurchasesScreen() {
  const t = useTheme();
  const c = t.color;
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

  const [dialog, setDialog] = useState<{ visible: boolean; variant: ResultVariant; title: string; message?: string; actions?: DialogAction[] }>(
    { visible: false, variant: "info", title: "" }
  );
  const showDialog = (variant: ResultVariant, title: string, message?: string, actions?: DialogAction[]) =>
    setDialog({ visible: true, variant, title, message, actions });
  const hideDialog = () => setDialog((d) => ({ ...d, visible: false }));

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

  useRefreshOnFocus(load);

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
    if (lineItems.length === 0) { showDialog("warning", "تنبيه", "أضف منتجاً واحداً على الأقل"); return; }
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
      showDialog("error", "خطأ", e?.message ?? "فشل الحفظ");
    } finally {
      setSaving(false);
    }
  };

  const filteredProducts = products.filter(p =>
    !productSearch || p.name.toLowerCase().includes(productSearch.toLowerCase())
  );

  return (
    <View style={[styles.container, { backgroundColor: c.bg }]}>
      <SyncBar />

      <View style={[styles.topBar, { borderBottomColor: c.hairline }]}>
        <AppButton label="أمر شراء جديد" icon="plus" size="sm" onPress={openNew} />
        <Text style={[styles.pageTitle, { color: c.text }]}>أوامر الشراء</Text>
      </View>

      <FlatList
        data={purchases}
        keyExtractor={i => i.sync_id}
        renderItem={({ item }) => {
          const status = item.status ?? "pending";
          const pill = STATUS_PILL[status] ?? "neutral";
          const label = STATUS_LABELS[status] ?? status;
          return (
            <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.hairline }]}>
              <View style={styles.cardRow}>
                <View style={[styles.avatar, { backgroundColor: c.brandTint }]}>
                  <Feather name="shopping-cart" size={16} color={c.brandText} />
                </View>
                <View style={{ flex: 1, alignItems: "flex-end" }}>
                  <Text style={[styles.name, { color: c.text }]}>{item.supplier_name ?? "بدون مورد"}</Text>
                  <Text style={[styles.sub, { color: c.textMuted }]}>
                    {item.created_at ? new Date(item.created_at).toLocaleDateString("ar-DZ") : ""}
                  </Text>
                </View>
                <View style={{ alignItems: "flex-end", gap: 4 }}>
                  <MoneyText amount={Number(item.total_amount ?? 0)} size="callout" />
                  <StatusPill status={pill} label={label} />
                </View>
              </View>
            </View>
          );
        }}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.brand} />}
        ListEmptyComponent={
          <EmptyState
            icon="shopping-cart"
            title="لا توجد أوامر شراء"
            subtitle="أنشئ أول أمر شراء أو قم بالمزامنة لجلب القائمة"
            actionLabel="أمر شراء جديد"
            actionIcon="plus"
            onAction={openNew}
          />
        }
        showsVerticalScrollIndicator={false}
      />

      <Modal visible={showModal} animationType="slide" onRequestClose={() => setShowModal(false)}>
        <View style={[styles.modal, { backgroundColor: c.bg }]}>
          <View style={[styles.modalHeader, { borderBottomColor: c.hairline }]}>
            <PressableScale onPress={() => setShowModal(false)} hitSlop={10} accessibilityLabel="إغلاق">
              <Feather name="x" size={22} color={c.text} />
            </PressableScale>
            <Text style={[styles.modalTitle, { color: c.text }]}>أمر شراء جديد</Text>
            <AppButton label={saving ? "جاري..." : "حفظ"} size="sm" loading={saving} onPress={handleSave} />
          </View>

          <ScrollView keyboardShouldPersistTaps="handled">
            {/* Supplier */}
            <View style={[styles.section, { borderBottomColor: c.hairline }]}>
              <Text style={[styles.sectionLabel, { color: c.textMuted }]}>المورد (اختياري)</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
                <PressableScale
                  style={[styles.chip, { backgroundColor: formSupplierId === null ? c.surfaceElevated : c.surface, borderColor: c.hairline }]}
                  onPress={() => setFormSupplierId(null)}
                >
                  <Text style={[styles.chipText, { color: formSupplierId === null ? c.text : c.textMuted }]}>بدون</Text>
                </PressableScale>
                {suppliers.map(s => (
                  <PressableScale
                    key={s.sync_id}
                    style={[styles.chip, {
                      backgroundColor: formSupplierId === s.id ? c.brand : c.surface,
                      borderColor: formSupplierId === s.id ? c.brand : c.hairline,
                    }]}
                    onPress={() => setFormSupplierId(s.id ?? null)}
                  >
                    <Text style={[styles.chipText, { color: formSupplierId === s.id ? c.onBrand : c.text }]}>
                      {s.name}
                    </Text>
                  </PressableScale>
                ))}
              </ScrollView>
            </View>

            {/* Add product btn */}
            <PressableScale
              style={[styles.addProductBtn, { borderColor: c.brandBorder, margin: 12 }]}
              onPress={() => setShowProductPicker(true)}
            >
              <Feather name="plus-circle" size={18} color={c.brandText} />
              <Text style={[styles.addProductText, { color: c.brandText }]}>إضافة منتج</Text>
            </PressableScale>

            {/* Line items */}
            {lineItems.map((item, idx) => (
              <View key={item.product.sync_id} style={[styles.lineItem, { backgroundColor: c.surface, borderColor: c.hairline, marginHorizontal: 12, marginBottom: 8 }]}>
                <PressableScale onPress={() => setLineItems(lineItems.filter((_, i) => i !== idx))} hitSlop={6} accessibilityLabel="حذف المنتج">
                  <Feather name="trash-2" size={15} color={c.danger} />
                </PressableScale>
                <View style={styles.lineInputs}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.lineLabel, { color: c.textMuted }]}>السعر</Text>
                    <TextInput
                      style={[styles.lineInput, { backgroundColor: c.bg, borderColor: c.hairline, color: c.text }]}
                      value={item.unit_price}
                      onChangeText={val => setLineItems(lineItems.map((i, k) => k === idx ? { ...i, unit_price: val } : i))}
                      keyboardType="decimal-pad" textAlign="right"
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.lineLabel, { color: c.textMuted }]}>الكمية</Text>
                    <TextInput
                      style={[styles.lineInput, { backgroundColor: c.bg, borderColor: c.hairline, color: c.text }]}
                      value={item.quantity}
                      onChangeText={val => setLineItems(lineItems.map((i, k) => k === idx ? { ...i, quantity: val } : i))}
                      keyboardType="numeric" textAlign="right"
                    />
                  </View>
                </View>
                <Text style={[styles.lineName, { color: c.text, textAlign: "right" }]}>{item.product.name}</Text>
              </View>
            ))}

            {lineItems.length > 0 && (
              <View style={[styles.totalBar, { backgroundColor: c.surface, borderTopColor: c.hairline }]}>
                <Text style={[styles.totalText, { color: c.text }]}>
                  الإجمالي: {formatMoney(total)}
                </Text>
              </View>
            )}
            <View style={{ height: 40 }} />
          </ScrollView>
        </View>

        {/* Product picker */}
        <Modal visible={showProductPicker} animationType="slide" presentationStyle="pageSheet">
          <View style={[styles.modal, { backgroundColor: c.bg }]}>
            <View style={[styles.modalHeader, { borderBottomColor: c.hairline }]}>
              <PressableScale onPress={() => { setShowProductPicker(false); setProductSearch(""); }} hitSlop={10} accessibilityLabel="إغلاق">
                <Feather name="x" size={22} color={c.text} />
              </PressableScale>
              <Text style={[styles.modalTitle, { color: c.text }]}>اختر منتجاً</Text>
              <View style={{ width: 22 }} />
            </View>
            <View style={[styles.searchBar, { backgroundColor: c.surface, borderColor: c.hairline, margin: 12 }]}>
              <Feather name="search" size={16} color={c.textMuted} />
              <TextInput
                style={[styles.searchInput, { color: c.text }]}
                placeholder="ابحث..." placeholderTextColor={c.textFaint}
                value={productSearch} onChangeText={setProductSearch}
                textAlign="right" autoFocus
              />
            </View>
            <FlatList
              data={filteredProducts}
              keyExtractor={i => i.sync_id}
              renderItem={({ item }) => (
                <PressableScale
                  style={[styles.productRow, { backgroundColor: c.surface, borderColor: c.hairline }]}
                  onPress={() => addProduct(item)}
                >
                  <MoneyText amount={Number(item.purchase_price ?? 0)} tone="brand" size="footnote" />
                  <Text style={[styles.productName2, { color: c.text }]}>{item.name}</Text>
                </PressableScale>
              )}
              contentContainerStyle={{ padding: 12, gap: 6 }}
            />
          </View>
        </Modal>
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
  topBar: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1 },
  pageTitle: { fontSize: 17, fontFamily: fonts.bold },
  list: { paddingHorizontal: 12, paddingTop: 12, paddingBottom: 16, gap: 8 },
  card: { borderRadius: 14, borderWidth: 1, padding: 14 },
  cardRow: { flexDirection: "row-reverse", alignItems: "center", gap: 10 },
  avatar: { width: 36, height: 36, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  name: { fontSize: 14, fontFamily: fonts.semibold },
  sub: { fontSize: 12, fontFamily: fonts.regular },
  empty: { alignItems: "center", paddingVertical: 60, gap: 12 },
  emptyText: { fontSize: 14, fontFamily: fonts.regular },
  modal: { flex: 1 },
  modalHeader: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", padding: 16, borderBottomWidth: 1 },
  modalTitle: { fontSize: 16, fontFamily: fonts.bold },
  section: { paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, gap: 8 },
  sectionLabel: { fontSize: 12, fontFamily: fonts.regular, textAlign: "right" },
  chips: { flexDirection: "row-reverse", gap: 8, paddingVertical: 4 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1 },
  chipText: { fontSize: 13, fontFamily: fonts.semibold },
  addProductBtn: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 8, padding: 12, borderRadius: 12, borderWidth: 1.5, borderStyle: "dashed" },
  addProductText: { fontSize: 15, fontFamily: fonts.semibold },
  lineItem: { borderRadius: 12, borderWidth: 1, padding: 12, gap: 8 },
  lineName: { fontSize: 14, fontFamily: fonts.semibold },
  lineInputs: { flexDirection: "row-reverse", gap: 8 },
  lineLabel: { fontSize: 11, fontFamily: fonts.regular, textAlign: "right", marginBottom: 4 },
  lineInput: { height: 38, borderRadius: 8, borderWidth: 1, paddingHorizontal: 10, fontSize: 14, fontFamily: fonts.regular },
  totalBar: { padding: 16, borderTopWidth: 1 },
  totalText: { fontSize: 16, fontFamily: fonts.bold, textAlign: "right" },
  searchBar: { flexDirection: "row-reverse", alignItems: "center", gap: 8, paddingHorizontal: 14, height: 44, borderRadius: 12, borderWidth: 1 },
  searchInput: { flex: 1, fontSize: 14, fontFamily: fonts.regular },
  productRow: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", padding: 12, borderRadius: 12, borderWidth: 1 },
  productName2: { fontSize: 14, fontFamily: fonts.semibold, flex: 1, textAlign: "right" },
  productPrice: { fontSize: 13, fontFamily: fonts.bold },
});
