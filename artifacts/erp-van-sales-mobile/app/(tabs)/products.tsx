import { Feather } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { Image } from "expo-image";
import { useRefreshOnFocus } from "@/hooks/useRefreshOnFocus";
import { useCallback, useState } from "react";
import {
  FlatList, KeyboardAvoidingView, Modal, Platform,
  RefreshControl, ScrollView, StyleSheet, Text,
  TextInput, View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { SyncBar } from "@/components/SyncBar";
import { MoneyText, PressableScale, ResultDialog } from "@/components/ui";
import type { DialogAction, ResultVariant } from "@/components/ui";
import { useAuth } from "@/contexts/AuthContext";
import { useSync } from "@/contexts/SyncContext";
import { Category, getDb, Product } from "@/lib/db";
import { API_URL } from "@/lib/api";
import { getLocalImagePath } from "@/lib/sync";
import { newSyncId } from "@/lib/uuid";
import { fonts } from "@/constants/tokens";
import { useTheme, type Theme } from "@/hooks/useTheme";

function ProductImage({ item }: { item: Product }) {
  const localUri = item.local_image_uri ?? getLocalImagePath(item.image_url);
  const remoteUri = item.image_url
    ? (item.image_url.startsWith("http") ? item.image_url : `${API_URL}${item.image_url}`)
    : null;
  const sources = [
    ...(localUri ? [{ uri: localUri }] : []),
    ...(remoteUri && !item.local_image_uri ? [{ uri: remoteUri }] : []),
  ];
  if (sources.length === 0) return null;
  return (
    <Image
      source={sources}
      style={styles.productImage}
      contentFit="cover"
      transition={200}
    />
  );
}

function ProductCard({ item, t }: { item: Product & { category_name?: string; truck_quantity?: number }; t: Theme }) {
  const c = t.color;
  const hasImage = !!(item.local_image_uri ?? item.image_url);
  const displayQty = item.truck_quantity !== undefined ? item.truck_quantity : (item.stock_quantity ?? 0);
  const prices = [
    { label: "تجزئة", value: item.selling_price_retail },
    { label: "نصف جملة", value: item.selling_price_half_wholesale },
    { label: "جملة", value: item.selling_price_wholesale },
  ];
  return (
    <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.hairline }]}>
      <View style={styles.cardRow}>
        {hasImage ? (
          <View style={styles.imageWrapper}>
            <ProductImage item={item} />
          </View>
        ) : (
          <View style={[styles.avatar, { backgroundColor: c.brandTint }]}>
            <Feather name="package" size={20} color={c.brandBright} />
          </View>
        )}
        <View style={{ flex: 1, alignItems: "flex-end" }}>
          <Text style={[styles.productName, { color: c.text }]}>{item.name}</Text>
          {item.category_name && (
            <Text style={[styles.categoryTag, { color: c.textMuted }]}>{item.category_name}</Text>
          )}
        </View>
        {(item._pending ?? 0) > 0 && (
          <View style={[styles.pendingDot, { backgroundColor: c.warning }]} />
        )}
      </View>
      <View style={[styles.divider, { backgroundColor: c.hairline }]} />
      <View style={styles.pricesRow}>
        {prices.map(p => (
          <View key={p.label} style={styles.priceItem}>
            <MoneyText amount={Number(p.value ?? 0)} tone="neutral" size="footnote" />
            <Text style={[styles.priceLabel, { color: c.textMuted }]}>{p.label}</Text>
          </View>
        ))}
        <View style={styles.priceItem}>
          <Text style={[styles.priceVal, { color: c.text }]}>{Number(displayQty).toFixed(0)}</Text>
          <Text style={[styles.priceLabel, { color: c.textMuted }]}>في الشاحنة</Text>
        </View>
      </View>
    </View>
  );
}

const UNITS = ["حبة", "كيلو", "لتر", "علبة", "كرتون", "دزينة"];

export default function ProductsScreen() {
  const t = useTheme();
  const c = t.color;
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { triggerSync } = useSync();
  const [products, setProducts] = useState<(Product & { category_name?: string })[]>([]);
  const [search, setSearch] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  // New product modal state
  const [showModal, setShowModal] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);
  const [formName, setFormName] = useState("");
  const [formBarcode, setFormBarcode] = useState("");
  const [formCategoryId, setFormCategoryId] = useState<number | null>(null);
  const [formStock, setFormStock] = useState("");
  const [formPriceRetail, setFormPriceRetail] = useState("");
  const [formPriceHalf, setFormPriceHalf] = useState("");
  const [formPriceWholesale, setFormPriceWholesale] = useState("");
  const [formUnit, setFormUnit] = useState("حبة");
  const [formImageUri, setFormImageUri] = useState<string | null>(null);
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
    const q = search.trim();
    const truckId = user?.truckId ?? null;
    let rows: (Product & { category_name?: string })[];
    if (truckId !== null) {
      rows = await db.getAllAsync<Product & { category_name?: string; truck_quantity?: number }>(
        `SELECT p.*, c.name as category_name, agg.quantity as truck_quantity FROM products p
         LEFT JOIN categories c ON p.category_id = c.id
         INNER JOIN (
           SELECT product_id, SUM(quantity) AS quantity
           FROM truck_stock WHERE truck_id = ? GROUP BY product_id HAVING SUM(quantity) > 0
         ) agg ON agg.product_id = p.id
         WHERE p.is_deleted = 0 ${q ? "AND p.name LIKE ?" : ""}
         ORDER BY p.name`,
        q ? [truckId, `%${q}%`] : [truckId]
      );
    } else {
      rows = await db.getAllAsync<Product & { category_name?: string }>(
        `SELECT p.*, c.name as category_name FROM products p
         LEFT JOIN categories c ON p.category_id = c.id
         WHERE p.is_deleted = 0 ${q ? "AND p.name LIKE ?" : ""}
         ORDER BY p.name`,
        q ? [`%${q}%`] : []
      );
    }
    setProducts(rows);
  }, [search, user?.truckId]);

  const loadCategories = useCallback(async () => {
    const db = await getDb();
    if (!db) return;
    const rows = await db.getAllAsync<Category>(
      "SELECT * FROM categories WHERE is_deleted = 0 ORDER BY name"
    );
    setCategories(rows);
  }, []);

  useRefreshOnFocus(load);

  const onRefresh = async () => {
    setRefreshing(true);
    triggerSync();
    await load();
    setRefreshing(false);
  };

  const openModal = async () => {
    await loadCategories();
    setFormName(""); setFormBarcode(""); setFormCategoryId(null);
    setFormStock(""); setFormPriceRetail(""); setFormPriceHalf("");
    setFormPriceWholesale(""); setFormUnit("حبة"); setFormImageUri(null);
    setShowModal(true);
  };

  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.8,
      allowsEditing: true,
      aspect: [1, 1],
    });
    if (!result.canceled && result.assets[0]) {
      setFormImageUri(result.assets[0].uri);
    }
  };

  const saveProduct = async () => {
    if (!formName.trim()) {
      showDialog("warning", "خطأ", "اسم المنتج مطلوب");
      return;
    }
    setSaving(true);
    try {
      const db = await getDb();
      if (!db) return;
      const now = new Date().toISOString();
      const syncId = newSyncId();
      await db.runAsync(
        `INSERT INTO products (
          sync_id, name, barcode, category_id,
          stock_quantity, selling_price_retail, selling_price_half_wholesale,
          selling_price_wholesale, unit, local_image_uri,
          created_at, updated_at, is_deleted, _pending
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 1)`,
        [
          syncId,
          formName.trim(),
          formBarcode.trim() || null,
          formCategoryId,
          parseFloat(formStock) || 0,
          parseFloat(formPriceRetail) || 0,
          parseFloat(formPriceHalf) || 0,
          parseFloat(formPriceWholesale) || 0,
          formUnit,
          formImageUri,
          now, now,
        ]
      );
      setShowModal(false);
      await load();
      triggerSync();
    } catch (e: any) {
      showDialog("error", "خطأ", e?.message ?? "فشل الحفظ");
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: c.bg }]}>
      <SyncBar />
      <View style={[styles.searchBar, { backgroundColor: c.surface, borderColor: c.hairline }]}>
        <Feather name="search" size={16} color={c.textMuted} />
        <TextInput
          style={[styles.searchInput, { color: c.text }]}
          placeholder="ابحث عن منتج..."
          placeholderTextColor={c.textFaint}
          value={search}
          onChangeText={setSearch}
          textAlign="right"
        />
      </View>
      <FlatList
        data={products}
        keyExtractor={i => i.sync_id}
        renderItem={({ item }) => <ProductCard item={item} t={t} />}
        contentContainerStyle={[styles.list, { paddingBottom: 90 + insets.bottom }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.brand} />}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Feather name="package" size={40} color={c.textFaint} />
            <Text style={[styles.emptyText, { color: c.textMuted }]}>
              {search ? "لا توجد نتائج" : "لا توجد منتجات — قم بالمزامنة أولاً"}
            </Text>
          </View>
        }
        showsVerticalScrollIndicator={false}
      />

      {/* FAB */}
      <PressableScale
        style={[styles.fab, { backgroundColor: c.brand, bottom: 24 + insets.bottom, ...t.elevation.glow }]}
        onPress={openModal}
        haptic
        accessibilityLabel="منتج جديد"
      >
        <Feather name="plus" size={26} color={c.onBrand} />
      </PressableScale>

      {/* New Product Modal */}
      <Modal visible={showModal} animationType="slide" transparent onRequestClose={() => setShowModal(false)}>
        <View style={[styles.overlay, { backgroundColor: c.scrim }]}>
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : undefined}
            style={styles.sheetWrapper}
          >
            <View style={[styles.sheet, { backgroundColor: c.surface, borderColor: c.hairline }]}>
              {/* Header */}
              <View style={[styles.sheetHeader, { borderBottomColor: c.hairline }]}>
                <PressableScale onPress={() => setShowModal(false)} style={styles.closeBtn} accessibilityLabel="إغلاق">
                  <Feather name="x" size={22} color={c.text} />
                </PressableScale>
                <Text style={[styles.sheetTitle, { color: c.text }]}>منتج جديد</Text>
                <PressableScale
                  onPress={saveProduct}
                  disabled={saving}
                  style={[styles.saveBtn, { backgroundColor: c.brand, opacity: saving ? 0.6 : 1 }]}
                >
                  <Text style={[styles.saveBtnText, { color: c.onBrand }]}>{saving ? "جاري الحفظ..." : "حفظ"}</Text>
                </PressableScale>
              </View>

              <ScrollView style={styles.sheetScroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
                {/* Image Picker */}
                <PressableScale
                  style={[styles.imagePicker, { borderColor: c.hairline, backgroundColor: c.bg }]}
                  onPress={pickImage}
                >
                  {formImageUri ? (
                    <Image source={{ uri: formImageUri }} style={styles.imagePreview} contentFit="cover" />
                  ) : (
                    <View style={styles.imagePlaceholder}>
                      <Feather name="camera" size={28} color={c.textMuted} />
                      <Text style={[styles.imagePlaceholderText, { color: c.textMuted }]}>اختر صورة</Text>
                    </View>
                  )}
                </PressableScale>

                {/* Name */}
                <View style={styles.fieldGroup}>
                  <Text style={[styles.fieldLabel, { color: c.textMuted }]}>اسم المنتج *</Text>
                  <TextInput
                    style={[styles.input, { backgroundColor: c.bg, borderColor: c.hairline, color: c.text }]}
                    value={formName}
                    onChangeText={setFormName}
                    placeholder="أدخل اسم المنتج"
                    placeholderTextColor={c.textFaint}
                    textAlign="right"
                  />
                </View>

                {/* Barcode */}
                <View style={styles.fieldGroup}>
                  <Text style={[styles.fieldLabel, { color: c.textMuted }]}>الباركود</Text>
                  <TextInput
                    style={[styles.input, { backgroundColor: c.bg, borderColor: c.hairline, color: c.text }]}
                    value={formBarcode}
                    onChangeText={setFormBarcode}
                    placeholder="اختياري"
                    placeholderTextColor={c.textFaint}
                    keyboardType="number-pad"
                    textAlign="right"
                  />
                </View>

                {/* Category */}
                {categories.length > 0 && (
                  <View style={styles.fieldGroup}>
                    <Text style={[styles.fieldLabel, { color: c.textMuted }]}>الفئة</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow}>
                      <PressableScale
                        style={[styles.chip, { backgroundColor: formCategoryId === null ? c.brand : c.surfaceElevated, borderColor: formCategoryId === null ? c.brand : c.hairline }]}
                        onPress={() => setFormCategoryId(null)}
                      >
                        <Text style={[styles.chipText, { color: formCategoryId === null ? c.onBrand : c.text }]}>بدون</Text>
                      </PressableScale>
                      {categories.map(cat => (
                        <PressableScale
                          key={cat.sync_id}
                          style={[styles.chip, { backgroundColor: formCategoryId === cat.id ? c.brand : c.surfaceElevated, borderColor: formCategoryId === cat.id ? c.brand : c.hairline }]}
                          onPress={() => setFormCategoryId(cat.id ?? null)}
                        >
                          <Text style={[styles.chipText, { color: formCategoryId === cat.id ? c.onBrand : c.text }]}>{cat.name}</Text>
                        </PressableScale>
                      ))}
                    </ScrollView>
                  </View>
                )}

                {/* Prices Row */}
                <View style={styles.rowFields}>
                  <View style={[styles.fieldGroup, { flex: 1 }]}>
                    <Text style={[styles.fieldLabel, { color: c.textMuted }]}>تجزئة (DZD)</Text>
                    <TextInput
                      style={[styles.input, { backgroundColor: c.bg, borderColor: c.hairline, color: c.text }]}
                      value={formPriceRetail}
                      onChangeText={setFormPriceRetail}
                      placeholder="0"
                      placeholderTextColor={c.textFaint}
                      keyboardType="decimal-pad"
                      textAlign="right"
                    />
                  </View>
                  <View style={[styles.fieldGroup, { flex: 1 }]}>
                    <Text style={[styles.fieldLabel, { color: c.textMuted }]}>نصف جملة</Text>
                    <TextInput
                      style={[styles.input, { backgroundColor: c.bg, borderColor: c.hairline, color: c.text }]}
                      value={formPriceHalf}
                      onChangeText={setFormPriceHalf}
                      placeholder="0"
                      placeholderTextColor={c.textFaint}
                      keyboardType="decimal-pad"
                      textAlign="right"
                    />
                  </View>
                  <View style={[styles.fieldGroup, { flex: 1 }]}>
                    <Text style={[styles.fieldLabel, { color: c.textMuted }]}>جملة</Text>
                    <TextInput
                      style={[styles.input, { backgroundColor: c.bg, borderColor: c.hairline, color: c.text }]}
                      value={formPriceWholesale}
                      onChangeText={setFormPriceWholesale}
                      placeholder="0"
                      placeholderTextColor={c.textFaint}
                      keyboardType="decimal-pad"
                      textAlign="right"
                    />
                  </View>
                </View>

                {/* Stock + Unit */}
                <View style={styles.rowFields}>
                  <View style={[styles.fieldGroup, { flex: 1 }]}>
                    <Text style={[styles.fieldLabel, { color: c.textMuted }]}>الكمية</Text>
                    <TextInput
                      style={[styles.input, { backgroundColor: c.bg, borderColor: c.hairline, color: c.text }]}
                      value={formStock}
                      onChangeText={setFormStock}
                      placeholder="0"
                      placeholderTextColor={c.textFaint}
                      keyboardType="decimal-pad"
                      textAlign="right"
                    />
                  </View>
                  <View style={[styles.fieldGroup, { flex: 1.4 }]}>
                    <Text style={[styles.fieldLabel, { color: c.textMuted }]}>الوحدة</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow}>
                      {UNITS.map(u => (
                        <PressableScale
                          key={u}
                          style={[styles.chip, { backgroundColor: formUnit === u ? c.brand : c.surfaceElevated, borderColor: formUnit === u ? c.brand : c.hairline }]}
                          onPress={() => setFormUnit(u)}
                        >
                          <Text style={[styles.chipText, { color: formUnit === u ? c.onBrand : c.text }]}>{u}</Text>
                        </PressableScale>
                      ))}
                    </ScrollView>
                  </View>
                </View>

                <View style={{ height: 32 }} />
              </ScrollView>
            </View>
          </KeyboardAvoidingView>
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
  searchBar: {
    flexDirection: "row-reverse", alignItems: "center", gap: 8,
    margin: 12, paddingHorizontal: 14, height: 44,
    borderRadius: 12, borderWidth: 1,
  },
  searchInput: { flex: 1, fontSize: 14, fontFamily: fonts.regular },
  list: { paddingHorizontal: 12, paddingBottom: 16, gap: 10 },
  card: { borderRadius: 14, borderWidth: 1, padding: 14, gap: 10 },
  cardRow: { flexDirection: "row-reverse", alignItems: "center", gap: 10 },
  avatar: { width: 48, height: 48, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  imageWrapper: { width: 48, height: 48, borderRadius: 10, overflow: "hidden" },
  productImage: { width: 48, height: 48 },
  productName: { fontSize: 15, fontFamily: fonts.semibold },
  categoryTag: { fontSize: 12, fontFamily: fonts.regular },
  pendingDot: { width: 8, height: 8, borderRadius: 4 },
  divider: { height: 1 },
  pricesRow: { flexDirection: "row-reverse", justifyContent: "space-around" },
  priceItem: { alignItems: "center", gap: 2 },
  priceVal: { fontSize: 13, fontFamily: fonts.bold },
  priceLabel: { fontSize: 11, fontFamily: fonts.regular },
  empty: { alignItems: "center", paddingVertical: 60, gap: 12 },
  emptyText: { fontSize: 14, fontFamily: fonts.regular, textAlign: "center" },
  // FAB
  fab: {
    position: "absolute", right: 20,
    width: 58, height: 58, borderRadius: 29,
    alignItems: "center", justifyContent: "center",
  },
  // Modal
  overlay: { flex: 1, justifyContent: "flex-end" },
  sheetWrapper: { maxHeight: "94%" },
  sheet: {
    borderTopLeftRadius: 22, borderTopRightRadius: 22,
    borderWidth: 1, borderBottomWidth: 0,
    overflow: "hidden", maxHeight: "100%",
  },
  sheetHeader: {
    flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1,
  },
  sheetTitle: { fontSize: 17, fontFamily: fonts.semibold },
  closeBtn: { padding: 4 },
  saveBtn: { paddingHorizontal: 18, paddingVertical: 7, borderRadius: 10 },
  saveBtnText: { fontSize: 14, fontFamily: fonts.semibold },
  sheetScroll: { paddingHorizontal: 16, paddingTop: 16 },
  // Image picker
  imagePicker: {
    height: 120, borderRadius: 14, borderWidth: 1.5, borderStyle: "dashed",
    overflow: "hidden", marginBottom: 16, alignItems: "center", justifyContent: "center",
  },
  imagePreview: { width: "100%", height: "100%" },
  imagePlaceholder: { alignItems: "center", gap: 6 },
  imagePlaceholderText: { fontSize: 13, fontFamily: fonts.regular },
  // Fields
  fieldGroup: { marginBottom: 14 },
  fieldLabel: { fontSize: 12, fontFamily: fonts.regular, marginBottom: 6, textAlign: "right" },
  input: {
    height: 44, borderRadius: 10, borderWidth: 1,
    paddingHorizontal: 12, fontSize: 14, fontFamily: fonts.regular,
  },
  rowFields: { flexDirection: "row-reverse", gap: 8 },
  chipsRow: { flexDirection: "row-reverse", gap: 6, paddingVertical: 2 },
  chip: {
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, borderWidth: 1,
  },
  chipText: { fontSize: 12, fontFamily: fonts.regular },
});
