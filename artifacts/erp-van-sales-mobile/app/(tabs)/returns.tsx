import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useRefreshOnFocus } from "@/hooks/useRefreshOnFocus";
import { useCallback, useEffect, useState } from "react";
import {
  FlatList, Modal, RefreshControl, ScrollView, StyleSheet,
  Text, TextInput, View,
} from "react-native";
import { SyncBar } from "@/components/SyncBar";
import { AppButton, MoneyText, PressableScale, ResultDialog, StatusPill } from "@/components/ui";
import type { DialogAction, ResultVariant } from "@/components/ui";
import { useSync } from "@/contexts/SyncContext";
import { Invoice, Product, Return, getDb } from "@/lib/db";
import { formatMoney } from "@/lib/money";
import { newSyncId } from "@/lib/uuid";
import { canonicalizeTruckStock } from "@/lib/truckStock";
import { fonts } from "@/constants/tokens";
import { useTheme } from "@/hooks/useTheme";

type Theme = ReturnType<typeof useTheme>;

interface ReturnWithClient extends Return {
  client_name?: string | null;
}

function ReturnCard({ item, theme }: { item: ReturnWithClient; theme: Theme }) {
  const c = theme.color;
  const amount = Number(item.total_amount ?? 0);
  const isClient = item.type === "client";
  const typeLabel = isClient ? "مرتجع عميل" : "مرتجع مخزن";
  return (
    <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.hairline }]}>
      <View style={styles.cardRow}>
        <MoneyText amount={amount} tone="negative" size="callout" />
        <View style={{ flex: 1, alignItems: "flex-end" }}>
          <Text style={[styles.cardClient, { color: c.text }]}>
            {item.client_name ?? "—"}
          </Text>
          <Text style={[styles.cardDate, { color: c.textMuted }]}>
            {item.created_at ? new Date(item.created_at).toLocaleDateString("ar-DZ") : ""}
          </Text>
        </View>
        <StatusPill status="neutral" label={typeLabel} />
      </View>
      {item._pending === 1 && (
        <View style={[styles.pendingBadge, { backgroundColor: c.warningTint }]}>
          <Feather name="clock" size={11} color={c.warningText} />
          <Text style={[styles.pendingText, { color: c.warningText }]}>في انتظار المزامنة</Text>
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
  visible, onClose, onSaved, theme,
}: {
  visible: boolean; onClose: () => void; onSaved: () => void; theme: Theme;
}) {
  const c = theme.color;
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

  const [dialog, setDialog] = useState<{ visible: boolean; variant: ResultVariant; title: string; message?: string; actions?: DialogAction[] }>(
    { visible: false, variant: "info", title: "" }
  );
  const showDialog = (variant: ResultVariant, title: string, message?: string, actions?: DialogAction[]) =>
    setDialog({ visible: true, variant, title, message, actions });
  const hideDialog = () => setDialog((d) => ({ ...d, visible: false }));

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
      showDialog("warning", "تنبيه", "أضف منتجاً واحداً على الأقل");
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
      showDialog("error", "خطأ", e?.message ?? "فشل حفظ المرتجع");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <View style={[styles.modal, { backgroundColor: c.bg }]}>
        <View style={[styles.modalHeader, { backgroundColor: c.rail, borderBottomColor: c.hairline }]}>
          <PressableScale onPress={onClose} hitSlop={10} accessibilityLabel="إغلاق">
            <Feather name="x" size={22} color={c.text} />
          </PressableScale>
          <Text style={[styles.modalTitle, { color: c.text }]}>مرتجع جديد</Text>
          <View style={{ width: 22 }} />
        </View>

        <View style={[styles.steps, { backgroundColor: c.rail, borderBottomColor: c.hairline }]}>
          {[
            { key: "invoice", label: "الفاتورة" },
            { key: "products", label: "المنتجات" },
            { key: "confirm", label: "تأكيد" },
          ].map(s => (
            <PressableScale key={s.key} onPress={() => {
              if (s.key === "products" && !selectedInvoice) return;
              if (s.key === "confirm" && items.length === 0) return;
              setStep(s.key as any);
            }}>
              <Text style={[
                styles.stepLabel,
                { color: step === s.key ? c.brandText : c.textMuted },
                step === s.key ? { borderBottomWidth: 2, borderBottomColor: c.brand } : {},
              ]}>
                {s.label}
              </Text>
            </PressableScale>
          ))}
        </View>

        {step === "invoice" && (
          <View style={{ flex: 1 }}>
            <View style={[styles.searchBar, { backgroundColor: c.surface, borderColor: c.hairline }]}>
              <Feather name="search" size={16} color={c.textMuted} />
              <TextInput
                style={[styles.searchInput, { color: c.text }]}
                placeholder="ابحث عن عميل..."
                placeholderTextColor={c.textFaint}
                value={invoiceSearch}
                onChangeText={setInvoiceSearch}
                textAlign="right"
              />
            </View>
            <FlatList
              data={filteredInvoices}
              keyExtractor={i => i.sync_id}
              renderItem={({ item }) => (
                <PressableScale
                  style={[
                    styles.invoiceRow,
                    {
                      backgroundColor: selectedInvoice?.sync_id === item.sync_id
                        ? c.brandTint : c.surface,
                      borderColor: selectedInvoice?.sync_id === item.sync_id ? c.brandBorder : c.hairline,
                    }
                  ]}
                  onPress={() => { setSelectedInvoice(item); setStep("products"); }}
                >
                  <Feather name="check" size={16}
                    color={selectedInvoice?.sync_id === item.sync_id ? c.brandText : "transparent"}
                  />
                  <View style={{ flex: 1, alignItems: "flex-end" }}>
                    <Text style={[styles.clientName, { color: c.text }]}>
                      {item.client_name ?? "بدون عميل"}
                    </Text>
                    <MoneyText amount={Number(item.total_amount ?? 0)} tone="muted" size="footnote" />
                  </View>
                </PressableScale>
              )}
              contentContainerStyle={{ padding: 12, gap: 6 }}
              ListHeaderComponent={
                <PressableScale
                  style={[
                    styles.invoiceRow,
                    {
                      backgroundColor: selectedInvoice === null && step !== "invoice"
                        ? c.brandTint : c.surfaceElevated,
                      borderColor: c.hairline, borderStyle: "dashed",
                    }
                  ]}
                  onPress={() => { setSelectedInvoice(null); setStep("products"); }}
                >
                  <Feather name="skip-forward" size={16} color={c.textMuted} />
                  <Text style={[styles.clientName, { color: c.textMuted, flex: 1, textAlign: "right" }]}>
                    بدون فاتورة (مرتجع مخزن)
                  </Text>
                </PressableScale>
              }
            />
          </View>
        )}

        {step === "products" && (
          <View style={{ flex: 1 }}>
            <PressableScale
              style={[styles.addProductBtn, { borderColor: c.brandBorder, backgroundColor: c.brandTint }]}
              onPress={() => setShowProductPicker(true)}
            >
              <Feather name="plus-circle" size={18} color={c.brandText} />
              <Text style={[styles.addProductText, { color: c.brandText }]}>إضافة منتج مُرتجع</Text>
            </PressableScale>
            <FlatList
              data={items}
              keyExtractor={i => i.product.sync_id}
              renderItem={({ item, index }) => (
                <View style={[styles.itemRow, { backgroundColor: c.surface, borderColor: c.hairline }]}>
                  <PressableScale onPress={() => setItems(items.filter((_, idx) => idx !== index))} hitSlop={8}>
                    <Feather name="trash-2" size={16} color={c.danger} />
                  </PressableScale>
                  <View style={styles.itemQtyRow}>
                    <PressableScale onPress={() => {
                      if (item.quantity > 1)
                        setItems(items.map((i, idx) => idx === index ? { ...i, quantity: i.quantity - 1 } : i));
                      else setItems(items.filter((_, idx) => idx !== index));
                    }} hitSlop={8}>
                      <Feather name="minus-circle" size={20} color={c.textMuted} />
                    </PressableScale>
                    <Text style={[styles.qty, { color: c.text }]}>{item.quantity}</Text>
                    <PressableScale onPress={() =>
                      setItems(items.map((i, idx) => idx === index ? { ...i, quantity: i.quantity + 1 } : i))
                    } hitSlop={8}>
                      <Feather name="plus-circle" size={20} color={c.brand} />
                    </PressableScale>
                  </View>
                  <View style={{ flex: 1, alignItems: "flex-end" }}>
                    <Text style={[styles.itemName, { color: c.text }]}>{item.product.name}</Text>
                    <Text style={[styles.itemPrice, { color: c.textMuted }]}>
                      {formatMoney(item.unitPrice)} × {item.quantity}
                    </Text>
                  </View>
                </View>
              )}
              contentContainerStyle={{ padding: 12, gap: 6 }}
            />
            {items.length > 0 && (
              <View style={[styles.totalBar, { backgroundColor: c.rail, borderTopColor: c.hairline }]}>
                <PressableScale
                  style={[styles.nextBtn, { backgroundColor: c.brand }]}
                  onPress={() => setStep("confirm")}
                  haptic
                >
                  <Text style={[styles.nextBtnText, { color: c.onBrand }]}>التالي</Text>
                  <Feather name="arrow-left" size={18} color={c.onBrand} />
                </PressableScale>
                <View style={styles.totalRow}>
                  <Text style={[styles.totalLabel, { color: c.textMuted }]}>المرتجع: </Text>
                  <MoneyText amount={total} tone="negative" size="callout" />
                </View>
              </View>
            )}

            <Modal visible={showProductPicker} animationType="slide" presentationStyle="pageSheet">
              <View style={[styles.modal, { backgroundColor: c.bg }]}>
                <View style={[styles.modalHeader, { backgroundColor: c.rail, borderBottomColor: c.hairline }]}>
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
                    placeholder="ابحث..."
                    placeholderTextColor={c.textFaint}
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
                    <PressableScale
                      style={[styles.productRow, { backgroundColor: c.surface, borderColor: c.hairline }]}
                      onPress={() => addProduct(item)}
                    >
                      <MoneyText amount={Number(item.selling_price_retail ?? 0)} tone="brand" size="bodyStrong" />
                      <Text style={[styles.itemName, { color: c.text }]}>{item.name}</Text>
                    </PressableScale>
                  )}
                  contentContainerStyle={{ padding: 12, gap: 6 }}
                />
              </View>
            </Modal>
          </View>
        )}

        {step === "confirm" && (
          <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }}>
            <View style={[styles.summaryCard, { backgroundColor: c.surface, borderColor: c.hairline }]}>
              <Text style={[styles.summaryLabel, { color: c.textMuted }]}>الفاتورة المرجعية</Text>
              <Text style={[styles.summaryVal, { color: c.text }]}>
                {selectedInvoice
                  ? `${(selectedInvoice as any).client_name ?? "عميل"} — ${formatMoney(Number(selectedInvoice.total_amount ?? 0))}`
                  : "بدون فاتورة"}
              </Text>
              <View style={[styles.divider, { backgroundColor: c.hairline }]} />
              <Text style={[styles.summaryLabel, { color: c.textMuted }]}>المنتجات المُرتجعة</Text>
              <Text style={[styles.summaryVal, { color: c.text }]}>{items.length} صنف</Text>
              <View style={[styles.divider, { backgroundColor: c.hairline }]} />
              <Text style={[styles.summaryLabel, { color: c.textMuted }]}>إجمالي المرتجع</Text>
              <MoneyText amount={total} tone="negative" size="display" />
            </View>

            <AppButton
              label={saving ? "جاري الحفظ..." : "تأكيد المرتجع"}
              icon="rotate-ccw"
              variant="danger"
              size="lg"
              fullWidth
              loading={saving}
              onPress={saveReturn}
            />
          </ScrollView>
        )}

        <ResultDialog
          visible={dialog.visible}
          variant={dialog.variant}
          title={dialog.title}
          message={dialog.message}
          actions={dialog.actions}
          onRequestClose={hideDialog}
        />
      </View>
    </Modal>
  );
}

export default function ReturnsScreen() {
  const theme = useTheme();
  const c = theme.color;
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
    <View style={[styles.container, { backgroundColor: c.bg }]}>
      <SyncBar />
      <View style={[styles.header, { borderBottomColor: c.hairline }]}>
        <AppButton
          label="مرتجع جديد"
          icon="plus"
          variant="danger"
          size="sm"
          onPress={() => setShowNewReturn(true)}
        />
        <Text style={[styles.headerTitle, { color: c.text }]}>المرتجعات</Text>
      </View>

      <FlatList
        data={returns}
        keyExtractor={i => i.sync_id}
        renderItem={({ item }) => <ReturnCard item={item} theme={theme} />}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.brand} />
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Feather name="rotate-ccw" size={40} color={c.textFaint} />
            <Text style={[styles.emptyText, { color: c.textMuted }]}>
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
        theme={theme}
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
  headerTitle: { fontSize: 17, fontFamily: fonts.bold },
  list: { paddingHorizontal: 12, paddingTop: 12, paddingBottom: 16, gap: 8 },
  card: { borderRadius: 14, borderWidth: 1, padding: 14, gap: 8 },
  cardRow: { flexDirection: "row-reverse", alignItems: "center", gap: 10 },
  cardClient: { fontSize: 14, fontFamily: fonts.semibold },
  cardDate: { fontSize: 12, fontFamily: fonts.regular },
  pendingBadge: {
    flexDirection: "row-reverse", alignItems: "center", gap: 4,
    alignSelf: "flex-end", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8,
  },
  pendingText: { fontSize: 11, fontFamily: fonts.regular },
  empty: { alignItems: "center", paddingVertical: 60, gap: 12 },
  emptyText: { fontSize: 14, fontFamily: fonts.regular, textAlign: "center", paddingHorizontal: 32 },
  modal: { flex: 1 },
  modalHeader: {
    flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between",
    padding: 16, borderBottomWidth: 1,
  },
  modalTitle: { fontSize: 16, fontFamily: fonts.bold },
  steps: {
    flexDirection: "row-reverse", justifyContent: "space-around",
    paddingVertical: 10, borderBottomWidth: 1,
  },
  stepLabel: { fontSize: 13, fontFamily: fonts.semibold, paddingVertical: 4, paddingHorizontal: 12 },
  searchBar: {
    flexDirection: "row-reverse", alignItems: "center", gap: 8,
    marginHorizontal: 12, marginTop: 10, paddingHorizontal: 14, height: 44,
    borderRadius: 12, borderWidth: 1,
  },
  searchInput: { flex: 1, fontSize: 14, fontFamily: fonts.regular },
  invoiceRow: {
    flexDirection: "row-reverse", alignItems: "center", gap: 10,
    padding: 12, borderRadius: 12, borderWidth: 1,
  },
  clientName: { fontSize: 15, fontFamily: fonts.semibold },
  addProductBtn: {
    flexDirection: "row-reverse", alignItems: "center", gap: 8,
    margin: 12, padding: 12, borderRadius: 12, borderWidth: 1.5, borderStyle: "dashed",
    justifyContent: "center",
  },
  addProductText: { fontSize: 15, fontFamily: fonts.semibold },
  itemRow: {
    flexDirection: "row-reverse", alignItems: "center", gap: 10,
    padding: 12, borderRadius: 12, borderWidth: 1,
  },
  itemQtyRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  qty: { fontSize: 16, fontFamily: fonts.bold, minWidth: 28, textAlign: "center" },
  itemName: { fontSize: 14, fontFamily: fonts.semibold },
  itemPrice: { fontSize: 12, fontFamily: fonts.regular },
  totalBar: {
    flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between",
    padding: 16, borderTopWidth: 1,
  },
  totalRow: { flexDirection: "row-reverse", alignItems: "center" },
  totalLabel: { fontSize: 15, fontFamily: fonts.bold },
  nextBtn: { flexDirection: "row-reverse", alignItems: "center", gap: 6, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12 },
  nextBtnText: { fontSize: 14, fontFamily: fonts.bold },
  productRow: {
    flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between",
    padding: 14, borderRadius: 12, borderWidth: 1,
  },
  summaryCard: { borderRadius: 14, borderWidth: 1, padding: 16, gap: 8 },
  summaryLabel: { fontSize: 12, fontFamily: fonts.regular },
  summaryVal: { fontSize: 15, fontFamily: fonts.semibold, textAlign: "right" },
  divider: { height: 1 },
});
