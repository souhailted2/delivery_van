import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  Alert, FlatList, Modal, ScrollView, StyleSheet, Text,
  TextInput, TouchableOpacity, View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/contexts/AuthContext";
import { useSync } from "@/contexts/SyncContext";
import { Client, getDb, Product } from "@/lib/db";
import { newSyncId } from "@/lib/uuid";
import { useColors } from "@/hooks/useColors";

interface InvoiceItem {
  product: Product;
  quantity: number;
  priceType: "retail" | "half_wholesale" | "wholesale";
  unitPrice: number;
}

function priceByType(p: Product, t: string): number {
  if (t === "half_wholesale") return Number(p.selling_price_half_wholesale ?? 0);
  if (t === "wholesale") return Number(p.selling_price_wholesale ?? 0);
  return Number(p.selling_price_retail ?? 0);
}

export default function NewInvoiceScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { triggerSync } = useSync();

  const [step, setStep] = useState<"client" | "products" | "payment">("client");
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [items, setItems] = useState<InvoiceItem[]>([]);
  const [paymentType, setPaymentType] = useState<"cash" | "credit">("cash");
  const [saving, setSaving] = useState(false);

  const [clients, setClients] = useState<Client[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [clientSearch, setClientSearch] = useState("");
  const [productSearch, setProductSearch] = useState("");
  const [showProductPicker, setShowProductPicker] = useState(false);

  useEffect(() => {
    (async () => {
      const db = await getDb();
      if (!db) return;
      const [cl, pr] = await Promise.all([
        db.getAllAsync<Client>("SELECT * FROM clients WHERE is_deleted = 0 ORDER BY name"),
        db.getAllAsync<Product>("SELECT * FROM products WHERE is_deleted = 0 ORDER BY name"),
      ]);
      setClients(cl);
      setProducts(pr);
    })();
  }, []);

  const filteredClients = clients.filter(c =>
    c.name.includes(clientSearch) || (c.phone ?? "").includes(clientSearch)
  );
  const filteredProducts = products.filter(p => p.name.includes(productSearch));

  const addProduct = (product: Product) => {
    const existing = items.find(i => i.product.sync_id === product.sync_id);
    if (existing) {
      setItems(items.map(i =>
        i.product.sync_id === product.sync_id ? { ...i, quantity: i.quantity + 1 } : i
      ));
    } else {
      setItems([...items, {
        product, quantity: 1,
        priceType: "retail",
        unitPrice: Number(product.selling_price_retail ?? 0),
      }]);
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setShowProductPicker(false);
    setProductSearch("");
  };

  const changePriceType = (index: number, pt: "retail" | "half_wholesale" | "wholesale") => {
    setItems(items.map((i, idx) => {
      if (idx !== index) return i;
      return { ...i, priceType: pt, unitPrice: priceByType(i.product, pt) };
    }));
  };

  const removeItem = (syncId: string) => {
    setItems(items.filter(i => i.product.sync_id !== syncId));
  };

  const total = items.reduce((s, i) => s + i.quantity * i.unitPrice, 0);

  const saveInvoice = async () => {
    if (!selectedClient) return;
    if (items.length === 0) { Alert.alert("تنبيه", "أضف منتجاً واحداً على الأقل"); return; }
    try {
      setSaving(true);
      const db = await getDb();
      if (!db) return;

      const invSyncId = newSyncId();
      const now = new Date().toISOString();

      const truckRow = await db.getFirstAsync<{ id: number }>(
        user?.truckId
          ? "SELECT id FROM trucks WHERE id = ?"
          : "SELECT id FROM trucks WHERE is_deleted = 0 LIMIT 1",
        user?.truckId ? [user.truckId] : []
      );

      await db.runAsync(
        `INSERT INTO invoices (sync_id, truck_id, client_id, client_sync_id, payment_type,
          total_amount, created_at, updated_at, is_deleted, _pending)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 1)`,
        [invSyncId, truckRow?.id ?? null, selectedClient.id ?? null, selectedClient.sync_id,
          paymentType, total, now, now] as any[]
      );

      for (const item of items) {
        const subtotal = item.quantity * item.unitPrice;
        await db.runAsync(
          `INSERT INTO invoice_items (sync_id, invoice_sync_id, product_id, product_sync_id,
            product_name, quantity, price_type, unit_price, commission, subtotal, updated_at, _pending)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, 1)`,
          [newSyncId(), invSyncId, item.product.id ?? null, item.product.sync_id,
            item.product.name, item.quantity, item.priceType, item.unitPrice, subtotal, now] as any[]
        );
        if (truckRow?.id) {
          await db.runAsync(
            `UPDATE truck_stock SET quantity = MAX(0, quantity - ?)
             WHERE truck_id = ? AND product_id = ?`,
            [item.quantity, truckRow.id, item.product.id ?? null] as any[]
          );
        }
      }

      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      triggerSync();
      Alert.alert("تم", "تم حفظ الفاتورة بنجاح", [{ text: "موافق", onPress: () => router.back() }]);
    } catch (e: any) {
      Alert.alert("خطأ", e?.message ?? "فشل حفظ الفاتورة");
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      <View style={[styles.topBar, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()}>
          <Feather name="x" size={22} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.foreground }]}>فاتورة جديدة</Text>
        <View style={{ width: 22 }} />
      </View>

      <View style={[styles.steps, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        {[
          { key: "client", label: "العميل" },
          { key: "products", label: "المنتجات" },
          { key: "payment", label: "الدفع" },
        ].map(s => (
          <TouchableOpacity key={s.key} onPress={() => {
            if (s.key === "products" && !selectedClient) return;
            if (s.key === "payment" && items.length === 0) return;
            setStep(s.key as any);
          }}>
            <Text style={[
              styles.stepLabel,
              { color: step === s.key ? colors.primary : colors.mutedForeground },
              step === s.key && styles.stepActive,
            ]}>
              {s.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {step === "client" && (
        <View style={{ flex: 1 }}>
          <View style={[styles.searchBar, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Feather name="search" size={16} color={colors.mutedForeground} />
            <TextInput
              style={[styles.searchInput, { color: colors.foreground }]}
              placeholder="ابحث عن عميل..."
              placeholderTextColor={colors.mutedForeground}
              value={clientSearch}
              onChangeText={setClientSearch}
              textAlign="right"
            />
          </View>
          <FlatList
            data={filteredClients}
            keyExtractor={i => i.sync_id}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={[
                  styles.clientRow,
                  { backgroundColor: selectedClient?.sync_id === item.sync_id ? colors.primary + "22" : colors.card, borderColor: colors.border }
                ]}
                onPress={() => { setSelectedClient(item); setStep("products"); }}
              >
                <Feather name="check" size={16} color={selectedClient?.sync_id === item.sync_id ? colors.primary : "transparent"} />
                <View style={{ flex: 1, alignItems: "flex-end" }}>
                  <Text style={[styles.clientName, { color: colors.foreground }]}>{item.name}</Text>
                  {item.phone && <Text style={[styles.clientPhone, { color: colors.mutedForeground }]}>{item.phone}</Text>}
                </View>
              </TouchableOpacity>
            )}
            contentContainerStyle={{ padding: 12, gap: 6 }}
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
            <Text style={[styles.addProductText, { color: colors.primary }]}>إضافة منتج</Text>
          </TouchableOpacity>
          <FlatList
            data={items}
            keyExtractor={i => i.product.sync_id}
            renderItem={({ item, index }) => (
              <View style={[styles.itemRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <TouchableOpacity onPress={() => removeItem(item.product.sync_id)}>
                  <Feather name="trash-2" size={16} color={colors.destructive} />
                </TouchableOpacity>
                <View style={styles.itemQtyRow}>
                  <TouchableOpacity onPress={() => {
                    if (item.quantity > 1) setItems(items.map((i, idx) => idx === index ? { ...i, quantity: i.quantity - 1 } : i));
                    else removeItem(item.product.sync_id);
                  }}>
                    <Feather name="minus-circle" size={20} color={colors.mutedForeground} />
                  </TouchableOpacity>
                  <Text style={[styles.qty, { color: colors.foreground }]}>{item.quantity}</Text>
                  <TouchableOpacity onPress={() => setItems(items.map((i, idx) => idx === index ? { ...i, quantity: i.quantity + 1 } : i))}>
                    <Feather name="plus-circle" size={20} color={colors.primary} />
                  </TouchableOpacity>
                </View>
                <View style={{ flex: 1, alignItems: "flex-end", gap: 6 }}>
                  <Text style={[styles.itemName, { color: colors.foreground }]}>{item.product.name}</Text>
                  <Text style={[styles.itemPrice, { color: colors.mutedForeground }]}>
                    {item.unitPrice.toLocaleString("fr-DZ")} × {item.quantity}
                  </Text>
                  <View style={styles.priceTierRow}>
                    {(["retail", "half_wholesale", "wholesale"] as const).map(pt => (
                      <TouchableOpacity
                        key={pt}
                        style={[
                          styles.tierBtn,
                          { backgroundColor: item.priceType === pt ? colors.primary : colors.secondary,
                            borderColor: item.priceType === pt ? colors.primary : colors.border }
                        ]}
                        onPress={() => changePriceType(index, pt)}
                      >
                        <Text style={[styles.tierText, { color: item.priceType === pt ? "#fff" : colors.mutedForeground }]}>
                          {pt === "retail" ? "تجزئة" : pt === "half_wholesale" ? "نصف" : "جملة"}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              </View>
            )}
            contentContainerStyle={{ padding: 12, gap: 6 }}
          />
          {items.length > 0 && (
            <View style={[styles.totalBar, { backgroundColor: colors.card, borderTopColor: colors.border }]}>
              <TouchableOpacity
                style={[styles.nextBtn, { backgroundColor: colors.primary }]}
                onPress={() => setStep("payment")}
              >
                <Text style={styles.nextBtnText}>التالي</Text>
                <Feather name="arrow-left" size={18} color="#fff" />
              </TouchableOpacity>
              <Text style={[styles.totalText, { color: colors.foreground }]}>
                المجموع: {total.toLocaleString("fr-DZ")} د.ج
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

      {step === "payment" && (
        <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }}>
          <View style={[styles.summaryCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.summaryLabel, { color: colors.mutedForeground }]}>العميل</Text>
            <Text style={[styles.summaryVal, { color: colors.foreground }]}>{selectedClient?.name}</Text>
            <View style={[styles.divider, { backgroundColor: colors.border }]} />
            <Text style={[styles.summaryLabel, { color: colors.mutedForeground }]}>المنتجات</Text>
            <Text style={[styles.summaryVal, { color: colors.foreground }]}>{items.length} صنف</Text>
            <View style={[styles.divider, { backgroundColor: colors.border }]} />
            <Text style={[styles.summaryLabel, { color: colors.mutedForeground }]}>الإجمالي</Text>
            <Text style={[styles.summaryTotal, { color: colors.primary }]}>{total.toLocaleString("fr-DZ")} د.ج</Text>
          </View>

          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>طريقة الدفع</Text>
          <View style={styles.paymentRow}>
            {(["cash", "credit"] as const).map(pt => (
              <TouchableOpacity
                key={pt}
                style={[
                  styles.paymentBtn,
                  {
                    backgroundColor: paymentType === pt ? colors.primary : colors.card,
                    borderColor: paymentType === pt ? colors.primary : colors.border,
                    flex: 1,
                  }
                ]}
                onPress={() => setPaymentType(pt)}
              >
                <Feather
                  name={pt === "cash" ? "dollar-sign" : "credit-card"}
                  size={18}
                  color={paymentType === pt ? "#fff" : colors.mutedForeground}
                />
                <Text style={[styles.paymentBtnText, { color: paymentType === pt ? "#fff" : colors.foreground }]}>
                  {pt === "cash" ? "نقد" : "آجل"}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <TouchableOpacity
            style={[styles.saveBtn, { backgroundColor: saving ? colors.muted : colors.primary }]}
            onPress={saveInvoice}
            disabled={saving}
            activeOpacity={0.8}
          >
            <Feather name="save" size={20} color="#fff" />
            <Text style={styles.saveBtnText}>{saving ? "جاري الحفظ..." : "حفظ الفاتورة"}</Text>
          </TouchableOpacity>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  topBar: {
    flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1,
  },
  title: { fontSize: 17, fontFamily: "Cairo_700Bold" },
  steps: {
    flexDirection: "row-reverse", justifyContent: "space-around",
    paddingVertical: 10, borderBottomWidth: 1,
  },
  stepLabel: { fontSize: 13, fontFamily: "Cairo_600SemiBold", paddingVertical: 4, paddingHorizontal: 12 },
  stepActive: { borderBottomWidth: 2, borderBottomColor: "#f97316" } as any,
  searchBar: {
    flexDirection: "row-reverse", alignItems: "center", gap: 8,
    marginHorizontal: 12, marginTop: 10, paddingHorizontal: 14, height: 44,
    borderRadius: 12, borderWidth: 1,
  },
  searchInput: { flex: 1, fontSize: 14, fontFamily: "Cairo_400Regular" },
  clientRow: {
    flexDirection: "row-reverse", alignItems: "center", gap: 10,
    padding: 12, borderRadius: 12, borderWidth: 1,
  },
  clientName: { fontSize: 15, fontFamily: "Cairo_600SemiBold" },
  clientPhone: { fontSize: 12, fontFamily: "Cairo_400Regular" },
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
  priceTierRow: { flexDirection: "row-reverse", gap: 4 },
  tierBtn: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, borderWidth: 1 },
  tierText: { fontSize: 10, fontFamily: "Cairo_600SemiBold" },
  totalBar: {
    flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between",
    padding: 16, borderTopWidth: 1,
  },
  totalText: { fontSize: 15, fontFamily: "Cairo_700Bold" },
  nextBtn: { flexDirection: "row-reverse", alignItems: "center", gap: 6, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12 },
  nextBtnText: { color: "#fff", fontSize: 14, fontFamily: "Cairo_700Bold" },
  modal: { flex: 1 },
  modalHeader: {
    flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between",
    padding: 16, borderBottomWidth: 1,
  },
  modalTitle: { fontSize: 16, fontFamily: "Cairo_700Bold" },
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
  sectionTitle: { fontSize: 15, fontFamily: "Cairo_700Bold", textAlign: "right" },
  paymentRow: { flexDirection: "row-reverse", gap: 10 },
  paymentBtn: {
    flexDirection: "row-reverse", alignItems: "center", justifyContent: "center",
    gap: 8, paddingVertical: 14, borderRadius: 12, borderWidth: 1,
  },
  paymentBtnText: { fontSize: 15, fontFamily: "Cairo_600SemiBold" },
  saveBtn: {
    flexDirection: "row-reverse", alignItems: "center", justifyContent: "center",
    gap: 10, paddingVertical: 16, borderRadius: 14, marginTop: 8,
  },
  saveBtnText: { color: "#fff", fontSize: 17, fontFamily: "Cairo_700Bold" },
});
