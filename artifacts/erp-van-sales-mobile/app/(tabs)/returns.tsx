import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import { useRefreshOnFocus } from "@/hooks/useRefreshOnFocus";
import { useCallback, useEffect, useState } from "react";
import {
  Alert, FlatList, Modal, RefreshControl, ScrollView, StyleSheet,
  Text, TextInput, TouchableOpacity, View,
} from "react-native";
import { SyncBar } from "@/components/SyncBar";
import { useSync } from "@/contexts/SyncContext";
import { Invoice, Product, Return, getDb } from "@/lib/db";
import { newSyncId } from "@/lib/uuid";
import { canonicalizeTruckStock } from "@/lib/truckStock";
import { useColors } from "@/hooks/useColors";

interface ReturnWithClient extends Return {
  client_name?: string | null;
}

function ReturnCard({ item, colors }: { item: ReturnWithClient; colors: any }) {
  const amount = Number(item.total_amount ?? 0);
  const typeLabel = item.type === "client" ? "مرتجع عميل" : "مرتجع مخزن";
  const typeColor = item.type === "client" ? colors.warning : colors.primary;
  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={styles.cardRow}>
        <Text style={[styles.amount, { color: colors.destructive }]}>
          {amount.toLocaleString("fr-DZ")} د.ج
        </Text>
        <View style={{ flex: 1, alignItems: "flex-end" }}>
          <Text style={[styles.cardClient, { color: colors.foreground }]}>
            {item.client_name ?? "—"}
          </Text>
          <Text style={[styles.cardDate, { color: colors.mutedForeground }]}>
            {item.created_at ? new Date(item.created_at).toLocaleDateString("ar-DZ") : ""}
          </Text>
        </View>
        <View style={[styles.typeBadge, { backgroundColor: typeColor + "22" }]}>
          <Text style={[styles.typeText, { color: typeColor }]}>{typeLabel}</Text>
        </View>
      </View>
      {item._pending === 1 && (
        <View style={[styles.pendingBadge, { backgroundColor: colors.warning + "33" }]}>
          <Feather name="clock" size={11} color={colors.warning} />
          <Text style={[styles.pendingText, { color: colors.warning }]}>في انتظار المزامنة</Text>
        </View>
      )}
    </View>
  );
}

interface ReturnItem {
  product: Product;
  quantity: number;
  unitPrice: number;
}

function NewReturnModal({
  visible, onClose, onSaved, colors,
}: {
  visible: boolean; onClose: () => void; onSaved: () => void; colors: any;
}) {
  const { triggerSync, bumpLocalVersion } = useSync();
  const [invoices, setInvoices] = useState<(Invoice & { client_name?: string })[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [items, setItems] = useState<ReturnItem[]>([]);
  const [step, setStep] = useState<"invoice" | "products" | "confirm">("invoice");
  const [invoiceSearch, setInvoiceSearch] = useState("");
  const [productSearch, setProductSearch] = useState("");
  const [showProductPicker, setShowProductPicker] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setStep("invoice");
    setSelectedInvoice(null);
    setItems([]);
    setInvoiceSearch("");
    (async () => {
      const db = await getDb();
      if (!db) return;
      const [inv, pr] = await Promise.all([
        db.getAllAsync<Invoice & { client_name?: string }>(
          `SELECT i.*, c.name as client_name FROM invoices i
           LEFT JOIN clients c ON c.sync_id = i.client_sync_id
           WHERE i.is_deleted = 0 ORDER BY i.created_at DESC LIMIT 100`
        ),
        db.getAllAsync<Product>(
          `SELECT * FROM products WHERE is_deleted = 0 ORDER BY name`
        ),
      ]);
      setInvoices(inv);
      setProducts(pr);
    })();
  }, [visible]);

  const filteredInvoices = invoices.filter(i =>
    (i.client_name ?? "").includes(invoiceSearch) ||
    i.sync_id.includes(invoiceSearch)
  );
  const filteredProducts = products.filter(p =>
    p.name.includes(productSearch)
  );

  const addProduct = (product: Product) => {
    const existing = items.find(i => i.product.sync_id === product.sync_id);
    if (existing) {
      setItems(items.map(i =>
        i.product.sync_id === product.sync_id ? { ...i, quantity: i.quantity + 1 } : i
      ));
    } else {
      setItems([...items, {
        product, quantity: 1,
        unitPrice: Number(product.selling_price_retail ?? 0),
      }]);
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setShowProductPicker(false);
    setProductSearch("");
  };

  const total = items.reduce((s, i) => s + i.quantity * i.unitPrice, 0);

  const saveReturn = async () => {
    if (items.length === 0) {
      Alert.alert("تنبيه", "أضف منتجاً واحداً على الأقل");
      return;
    }
    try {
      setSaving(true);
      const db = await getDb();
      if (!db) return;

      const retSyncId = newSyncId();
      const now = new Date().toISOString();
      const returnType = selectedInvoice ? "client" : "warehouse";

      const inv = selectedInvoice;
      await db.runAsync(
        `INSERT INTO returns (sync_id, type, truck_id, client_id, invoice_id, total_amount,
           created_at, updated_at, is_deleted, _pending)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 1)`,
        [
          retSyncId,
          returnType,
          inv?.truck_id ?? null,
          inv?.client_id ?? null,
          inv?.id ?? null,
          total, now, now,
        ] as any[]
      );

      for (const item of items) {
        await db.runAsync(
          `INSERT INTO return_items (sync_id, return_sync_id, product_id, product_name,
             quantity, unit_price, subtotal, updated_at, _pending)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)`,
          [
            newSyncId(), retSyncId,
            item.product.id ?? null, item.product.name,
            item.quantity, item.unitPrice, item.quantity * item.unitPrice, now,
          ] as any[]
        );
        // Optimistic restock of the truck so the stock screen reflects the
        // return immediately. trucks/truck_stock are server-authoritative; the
        // updated_at bump prevents the pre-push pull from reverting it before
        // the server-side reconciliation runs.
        if (inv?.truck_id && item.product.id != null) {
          await canonicalizeTruckStock(
            db, inv.truck_id, item.product.id, item.quantity, now
          );
        }
      }

      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      bumpLocalVersion();
      triggerSync();
      onSaved();
      onClose();
    } catch (e: any) {
      Alert.alert("خطأ", e?.message ?? "فشل حفظ المرتجع");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <View style={[styles.modal, { backgroundColor: colors.background }]}>
        <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
          <TouchableOpacity onPress={onClose}>
            <Feather name="x" size={22} color={colors.foreground} />
          </TouchableOpacity>
          <Text style={[styles.modalTitle, { color: colors.foreground }]}>مرتجع جديد</Text>
          <View style={{ width: 22 }} />
        </View>

        <View style={[styles.steps, { borderBottomColor: colors.border }]}>
          {[
            { key: "invoice", label: "الفاتورة" },
            { key: "products", label: "المنتجات" },
            { key: "confirm", label: "تأكيد" },
          ].map(s => (
            <TouchableOpacity key={s.key} onPress={() => {
              if (s.key === "products" && !selectedInvoice) return;
              if (s.key === "confirm" && items.length === 0) return;
              setStep(s.key as any);
            }}>
              <Text style={[
                styles.stepLabel,
                { color: step === s.key ? colors.primary : colors.mutedForeground },
                step === s.key ? { borderBottomWidth: 2, borderBottomColor: colors.primary } : {},
              ]}>
                {s.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {step === "invoice" && (
          <View style={{ flex: 1 }}>
            <View style={[styles.searchBar, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Feather name="search" size={16} color={colors.mutedForeground} />
              <TextInput
                style={[styles.searchInput, { color: colors.foreground }]}
                placeholder="ابحث عن عميل..."
                placeholderTextColor={colors.mutedForeground}
                value={invoiceSearch}
                onChangeText={setInvoiceSearch}
                textAlign="right"
              />
            </View>
            <FlatList
              data={filteredInvoices}
              keyExtractor={i => i.sync_id}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[
                    styles.invoiceRow,
                    {
                      backgroundColor: selectedInvoice?.sync_id === item.sync_id
                        ? colors.primary + "22" : colors.card,
                      borderColor: colors.border,
                    }
                  ]}
                  onPress={() => { setSelectedInvoice(item); setStep("products"); }}
                >
                  <Feather name="check" size={16}
                    color={selectedInvoice?.sync_id === item.sync_id ? colors.primary : "transparent"}
                  />
                  <View style={{ flex: 1, alignItems: "flex-end" }}>
                    <Text style={[styles.clientName, { color: colors.foreground }]}>
                      {item.client_name ?? "بدون عميل"}
                    </Text>
                    <Text style={[styles.invoiceAmount, { color: colors.mutedForeground }]}>
                      {Number(item.total_amount ?? 0).toLocaleString("fr-DZ")} د.ج
                    </Text>
                  </View>
                </TouchableOpacity>
              )}
              contentContainerStyle={{ padding: 12, gap: 6 }}
              ListHeaderComponent={
                <TouchableOpacity
                  style={[
                    styles.invoiceRow,
                    {
                      backgroundColor: selectedInvoice === null && step !== "invoice"
                        ? colors.primary + "22" : colors.secondary,
                      borderColor: colors.border, borderStyle: "dashed",
                    }
                  ]}
                  onPress={() => { setSelectedInvoice(null); setStep("products"); }}
                >
                  <Feather name="skip-forward" size={16} color={colors.mutedForeground} />
                  <Text style={[styles.clientName, { color: colors.mutedForeground, flex: 1, textAlign: "right" }]}>
                    بدون فاتورة (مرتجع مخزن)
                  </Text>
                </TouchableOpacity>
              }
            />
          </View>
        )}

        {step === "products" && (
          <View style={{ flex: 1 }}>
            <TouchableOpacity
              style={[styles.addProductBtn, { borderColor: colors.primary }]}
              onPress={() => setShowProductPicker(true)}
            >
              <Feather name="plus-circle" size={18} color={colors.primary} />
              <Text style={[styles.addProductText, { color: colors.primary }]}>إضافة منتج مُرتجع</Text>
            </TouchableOpacity>
            <FlatList
              data={items}
              keyExtractor={i => i.product.sync_id}
              renderItem={({ item, index }) => (
                <View style={[styles.itemRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <TouchableOpacity onPress={() => setItems(items.filter((_, idx) => idx !== index))}>
                    <Feather name="trash-2" size={16} color={colors.destructive} />
                  </TouchableOpacity>
                  <View style={styles.itemQtyRow}>
                    <TouchableOpacity onPress={() => {
                      if (item.quantity > 1)
                        setItems(items.map((i, idx) => idx === index ? { ...i, quantity: i.quantity - 1 } : i));
                      else setItems(items.filter((_, idx) => idx !== index));
                    }}>
                      <Feather name="minus-circle" size={20} color={colors.mutedForeground} />
                    </TouchableOpacity>
                    <Text style={[styles.qty, { color: colors.foreground }]}>{item.quantity}</Text>
                    <TouchableOpacity onPress={() =>
                      setItems(items.map((i, idx) => idx === index ? { ...i, quantity: i.quantity + 1 } : i))
                    }>
                      <Feather name="plus-circle" size={20} color={colors.primary} />
                    </TouchableOpacity>
                  </View>
                  <View style={{ flex: 1, alignItems: "flex-end" }}>
                    <Text style={[styles.itemName, { color: colors.foreground }]}>{item.product.name}</Text>
                    <Text style={[styles.itemPrice, { color: colors.mutedForeground }]}>
                      {item.unitPrice.toLocaleString("fr-DZ")} × {item.quantity}
                    </Text>
                  </View>
                </View>
              )}
              contentContainerStyle={{ padding: 12, gap: 6 }}
            />
            {items.length > 0 && (
              <View style={[styles.totalBar, { backgroundColor: colors.card, borderTopColor: colors.border }]}>
                <TouchableOpacity
                  style={[styles.nextBtn, { backgroundColor: colors.primary }]}
                  onPress={() => setStep("confirm")}
                >
                  <Text style={styles.nextBtnText}>التالي</Text>
                  <Feather name="arrow-left" size={18} color="#fff" />
                </TouchableOpacity>
                <Text style={[styles.totalText, { color: colors.destructive }]}>
                  المرتجع: {total.toLocaleString("fr-DZ")} د.ج
                </Text>
              </View>
            )}

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
                    placeholder="ابحث..."
                    placeholderTextColor={colors.mutedForeground}
                    value={productSearch}
                    onChangeText={setProductSearch}
                    textAlign="right"
                    autoFocus
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
                        {Number(item.selling_price_retail ?? 0).toLocaleString("fr-DZ")} د.ج
                      </Text>
                      <Text style={[styles.itemName, { color: colors.foreground }]}>{item.name}</Text>
                    </TouchableOpacity>
                  )}
                  contentContainerStyle={{ padding: 12, gap: 6 }}
                />
              </View>
            </Modal>
          </View>
        )}

        {step === "confirm" && (
          <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }}>
            <View style={[styles.summaryCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.summaryLabel, { color: colors.mutedForeground }]}>الفاتورة المرجعية</Text>
              <Text style={[styles.summaryVal, { color: colors.foreground }]}>
                {selectedInvoice
                  ? `${(selectedInvoice as any).client_name ?? "عميل"} — ${Number(selectedInvoice.total_amount ?? 0).toLocaleString("fr-DZ")} د.ج`
                  : "بدون فاتورة"}
              </Text>
              <View style={[styles.divider, { backgroundColor: colors.border }]} />
              <Text style={[styles.summaryLabel, { color: colors.mutedForeground }]}>المنتجات المُرتجعة</Text>
              <Text style={[styles.summaryVal, { color: colors.foreground }]}>{items.length} صنف</Text>
              <View style={[styles.divider, { backgroundColor: colors.border }]} />
              <Text style={[styles.summaryLabel, { color: colors.mutedForeground }]}>إجمالي المرتجع</Text>
              <Text style={[styles.summaryTotal, { color: colors.destructive }]}>
                {total.toLocaleString("fr-DZ")} د.ج
              </Text>
            </View>

            <TouchableOpacity
              style={[styles.saveBtn, { backgroundColor: saving ? colors.muted : colors.destructive }]}
              onPress={saveReturn}
              disabled={saving}
              activeOpacity={0.8}
            >
              <Feather name="rotate-ccw" size={20} color="#fff" />
              <Text style={styles.saveBtnText}>{saving ? "جاري الحفظ..." : "تأكيد المرتجع"}</Text>
            </TouchableOpacity>
          </ScrollView>
        )}
      </View>
    </Modal>
  );
}

export default function ReturnsScreen() {
  const colors = useColors();
  const { triggerSync } = useSync();
  const [returns, setReturns] = useState<ReturnWithClient[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [showNewReturn, setShowNewReturn] = useState(false);

  const load = useCallback(async () => {
    const db = await getDb();
    if (!db) return;
    const rows = await db.getAllAsync<ReturnWithClient>(
      `SELECT r.*, c.name as client_name
       FROM returns r
       LEFT JOIN clients c ON c.id = r.client_id
       WHERE r.is_deleted = 0
       ORDER BY r.created_at DESC`
    );
    setReturns(rows);
  }, []);

  useRefreshOnFocus(load);

  const onRefresh = async () => {
    setRefreshing(true);
    triggerSync();
    await load();
    setRefreshing(false);
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <SyncBar />
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity
          style={[styles.addBtn, { backgroundColor: colors.destructive }]}
          onPress={() => setShowNewReturn(true)}
          activeOpacity={0.8}
        >
          <Feather name="plus" size={18} color="#fff" />
          <Text style={styles.addBtnText}>مرتجع جديد</Text>
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>المرتجعات</Text>
      </View>

      <FlatList
        data={returns}
        keyExtractor={i => i.sync_id}
        renderItem={({ item }) => <ReturnCard item={item} colors={colors} />}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Feather name="rotate-ccw" size={40} color={colors.muted} />
            <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
              لا توجد مرتجعات — قم بالمزامنة أو أنشئ مرتجعاً جديداً
            </Text>
          </View>
        }
        showsVerticalScrollIndicator={false}
      />

      <NewReturnModal
        visible={showNewReturn}
        onClose={() => setShowNewReturn(false)}
        onSaved={load}
        colors={colors}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1,
  },
  headerTitle: { fontSize: 17, fontFamily: "Cairo_700Bold" },
  addBtn: {
    flexDirection: "row-reverse", alignItems: "center", gap: 6,
    paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12,
  },
  addBtnText: { color: "#fff", fontSize: 14, fontFamily: "Cairo_700Bold" },
  list: { paddingHorizontal: 12, paddingTop: 12, paddingBottom: 16, gap: 8 },
  card: { borderRadius: 14, borderWidth: 1, padding: 14, gap: 8 },
  cardRow: { flexDirection: "row-reverse", alignItems: "center", gap: 10 },
  amount: { fontSize: 15, fontFamily: "Cairo_700Bold" },
  cardClient: { fontSize: 14, fontFamily: "Cairo_600SemiBold" },
  cardDate: { fontSize: 12, fontFamily: "Cairo_400Regular" },
  typeBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  typeText: { fontSize: 11, fontFamily: "Cairo_600SemiBold" },
  pendingBadge: {
    flexDirection: "row-reverse", alignItems: "center", gap: 4,
    alignSelf: "flex-end", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8,
  },
  pendingText: { fontSize: 11, fontFamily: "Cairo_400Regular" },
  empty: { alignItems: "center", paddingVertical: 60, gap: 12 },
  emptyText: { fontSize: 14, fontFamily: "Cairo_400Regular", textAlign: "center", paddingHorizontal: 32 },
  modal: { flex: 1 },
  modalHeader: {
    flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between",
    padding: 16, borderBottomWidth: 1,
  },
  modalTitle: { fontSize: 16, fontFamily: "Cairo_700Bold" },
  steps: {
    flexDirection: "row-reverse", justifyContent: "space-around",
    paddingVertical: 10, borderBottomWidth: 1,
  },
  stepLabel: { fontSize: 13, fontFamily: "Cairo_600SemiBold", paddingVertical: 4, paddingHorizontal: 12 },
  searchBar: {
    flexDirection: "row-reverse", alignItems: "center", gap: 8,
    marginHorizontal: 12, marginTop: 10, paddingHorizontal: 14, height: 44,
    borderRadius: 12, borderWidth: 1,
  },
  searchInput: { flex: 1, fontSize: 14, fontFamily: "Cairo_400Regular" },
  invoiceRow: {
    flexDirection: "row-reverse", alignItems: "center", gap: 10,
    padding: 12, borderRadius: 12, borderWidth: 1,
  },
  clientName: { fontSize: 15, fontFamily: "Cairo_600SemiBold" },
  invoiceAmount: { fontSize: 12, fontFamily: "Cairo_400Regular" },
  addProductBtn: {
    flexDirection: "row-reverse", alignItems: "center", gap: 8,
    margin: 12, padding: 12, borderRadius: 12, borderWidth: 1.5, borderStyle: "dashed",
    justifyContent: "center",
  },
  addProductText: { fontSize: 15, fontFamily: "Cairo_600SemiBold" },
  itemRow: {
    flexDirection: "row-reverse", alignItems: "center", gap: 10,
    padding: 12, borderRadius: 12, borderWidth: 1,
  },
  itemQtyRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  qty: { fontSize: 16, fontFamily: "Cairo_700Bold", minWidth: 28, textAlign: "center" },
  itemName: { fontSize: 14, fontFamily: "Cairo_600SemiBold" },
  itemPrice: { fontSize: 12, fontFamily: "Cairo_400Regular" },
  totalBar: {
    flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between",
    padding: 16, borderTopWidth: 1,
  },
  totalText: { fontSize: 15, fontFamily: "Cairo_700Bold" },
  nextBtn: { flexDirection: "row-reverse", alignItems: "center", gap: 6, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12 },
  nextBtnText: { color: "#fff", fontSize: 14, fontFamily: "Cairo_700Bold" },
  productRow: {
    flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between",
    padding: 14, borderRadius: 12, borderWidth: 1,
  },
  productPrice: { fontSize: 14, fontFamily: "Cairo_700Bold" },
  summaryCard: { borderRadius: 14, borderWidth: 1, padding: 16, gap: 8 },
  summaryLabel: { fontSize: 12, fontFamily: "Cairo_400Regular" },
  summaryVal: { fontSize: 15, fontFamily: "Cairo_600SemiBold", textAlign: "right" },
  summaryTotal: { fontSize: 20, fontFamily: "Cairo_700Bold", textAlign: "right" },
  divider: { height: 1 },
  saveBtn: {
    flexDirection: "row-reverse", alignItems: "center", justifyContent: "center",
    gap: 10, paddingVertical: 16, borderRadius: 14, marginTop: 8,
  },
  saveBtnText: { color: "#fff", fontSize: 17, fontFamily: "Cairo_700Bold" },
});
