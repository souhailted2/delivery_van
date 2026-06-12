import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import {
  Alert, Dimensions, FlatList, ScrollView, StyleSheet, Text,
  TextInput, TouchableOpacity, View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ProductImage } from "@/components/ProductImage";
import { useAuth } from "@/contexts/AuthContext";
import { useSync } from "@/contexts/SyncContext";
import { Client, getDb, Product } from "@/lib/db";
import { printInvoiceReceipt, ReceiptInvoice } from "@/lib/receipt";
import { newSyncId } from "@/lib/uuid";
import { useColors } from "@/hooks/useColors";

type Tier = "retail" | "half_wholesale" | "wholesale";

interface InvoiceItem {
  product: Product;
  quantity: number;
  priceType: Tier;
  unitPrice: number;
  overridden?: boolean;
}

const TIER_LABEL: Record<Tier, string> = {
  retail: "تجزئة",
  half_wholesale: "نصف جملة",
  wholesale: "جملة",
};
const TIER_SHORT: Record<Tier, string> = {
  retail: "تجزئة",
  half_wholesale: "نصف",
  wholesale: "جملة",
};

function priceByType(p: Product, t: Tier): number {
  if (t === "half_wholesale") return Number(p.selling_price_half_wholesale ?? 0);
  if (t === "wholesale") return Number(p.selling_price_wholesale ?? 0);
  return Number(p.selling_price_retail ?? 0);
}

function resolveTier(client: Client | null): Tier {
  const t = client?.client_type;
  if (t === "half_wholesale" || t === "wholesale") return t;
  return "retail";
}

const COLS = 2;
const H_PAD = 12;
const GAP = 10;
const CARD_W = (Dimensions.get("window").width - H_PAD * 2 - GAP * (COLS - 1)) / COLS;
const IMG_SIZE = CARD_W - 16;

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

  const clientTier = resolveTier(selectedClient);

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

  // Re-price cart items to the selected customer's tier (unless manually overridden).
  useEffect(() => {
    if (!selectedClient) return;
    const tier = resolveTier(selectedClient);
    setItems(prev => prev.map(i =>
      i.overridden ? i : { ...i, priceType: tier, unitPrice: priceByType(i.product, tier) }
    ));
  }, [selectedClient]);

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
        priceType: clientTier,
        unitPrice: priceByType(product, clientTier),
      }]);
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const setQty = (syncId: string, qty: number) => {
    if (qty <= 0) { removeItem(syncId); return; }
    setItems(items.map(i => i.product.sync_id === syncId ? { ...i, quantity: qty } : i));
  };

  const setTier = (syncId: string, pt: Tier) => {
    setItems(items.map(i =>
      i.product.sync_id === syncId
        ? { ...i, priceType: pt, unitPrice: priceByType(i.product, pt), overridden: true }
        : i
    ));
  };

  const removeItem = (syncId: string) => {
    setItems(items.filter(i => i.product.sync_id !== syncId));
  };

  const total = items.reduce((s, i) => s + i.quantity * i.unitPrice, 0);
  const totalUnits = items.reduce((s, i) => s + i.quantity, 0);

  const saveInvoice = async () => {
    if (!selectedClient) return;
    if (items.length === 0) { Alert.alert("تنبيه", "أضف منتجاً واحداً على الأقل"); return; }
    try {
      setSaving(true);
      const db = await getDb();
      if (!db) return;

      const invSyncId = newSyncId();
      const now = new Date().toISOString();

      const truckRow = await db.getFirstAsync<{ id: number; name: string }>(
        user?.truckId
          ? "SELECT id, name FROM trucks WHERE id = ?"
          : "SELECT id, name FROM trucks WHERE is_deleted = 0 LIMIT 1",
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

      const receipt: ReceiptInvoice = {
        invoiceNumber: `MOB-${invSyncId.slice(-6).toUpperCase()}`,
        createdAt: now,
        clientName: selectedClient.name,
        truckName: truckRow?.name ?? "—",
        paymentType,
        totalAmount: total,
        items: items.map(i => ({
          productName: i.product.name,
          priceType: i.priceType,
          quantity: i.quantity,
          unitPrice: i.unitPrice,
          subtotal: i.quantity * i.unitPrice,
        })),
      };

      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      triggerSync();
      Alert.alert("تم", "تم حفظ الفاتورة بنجاح", [
        {
          text: "طباعة الإيصال",
          onPress: async () => {
            try { await printInvoiceReceipt(receipt); }
            catch (e: any) { Alert.alert("خطأ", e?.message ?? "تعذّرت الطباعة"); }
            finally { router.back(); }
          },
        },
        { text: "إغلاق", style: "cancel", onPress: () => router.back() },
      ]);
    } catch (e: any) {
      Alert.alert("خطأ", e?.message ?? "فشل حفظ الفاتورة");
    } finally {
      setSaving(false);
    }
  };

  const cartMap = useMemo(() => {
    const m = new Map<string, InvoiceItem>();
    for (const i of items) m.set(i.product.sync_id, i);
    return m;
  }, [items]);

  const renderProduct = ({ item: product }: { item: Product }) => {
    const cartItem = cartMap.get(product.sync_id);
    const inCart = !!cartItem;
    const tier = cartItem?.priceType ?? clientTier;
    const price = cartItem?.unitPrice ?? priceByType(product, clientTier);
    return (
      <View style={[styles.catCard, { width: CARD_W, backgroundColor: colors.card, borderColor: inCart ? colors.primary : colors.border }]}>
        <ProductImage
          imageUrl={product.image_url}
          localUri={product.local_image_uri}
          size={IMG_SIZE}
          radius={12}
          colors={colors}
        />
        <Text style={[styles.catName, { color: colors.foreground }]} numberOfLines={2}>{product.name}</Text>
        <View style={styles.catPriceRow}>
          <View style={[styles.tierBadge, { backgroundColor: colors.secondary }]}>
            <Text style={[styles.tierBadgeText, { color: colors.mutedForeground }]}>{TIER_LABEL[tier]}</Text>
          </View>
          <Text style={[styles.catPrice, { color: colors.primary }]}>{price.toLocaleString("fr-DZ")} د.ج</Text>
        </View>

        {!inCart ? (
          <TouchableOpacity
            style={[styles.addBtn, { backgroundColor: colors.primary }]}
            onPress={() => addProduct(product)}
            activeOpacity={0.85}
          >
            <Feather name="plus" size={16} color="#fff" />
            <Text style={styles.addBtnText}>إضافة</Text>
          </TouchableOpacity>
        ) : (
          <View style={{ gap: 6, width: "100%" }}>
            <View style={[styles.qtyRow, { borderColor: colors.border }]}>
              <TouchableOpacity onPress={() => setQty(product.sync_id, cartItem!.quantity - 1)} hitSlop={8}>
                <Feather name="minus-circle" size={24} color={colors.destructive} />
              </TouchableOpacity>
              <Text style={[styles.qtyVal, { color: colors.foreground }]}>{cartItem!.quantity}</Text>
              <TouchableOpacity onPress={() => setQty(product.sync_id, cartItem!.quantity + 1)} hitSlop={8}>
                <Feather name="plus-circle" size={24} color={colors.primary} />
              </TouchableOpacity>
            </View>
            <View style={styles.tierChips}>
              {(["retail", "half_wholesale", "wholesale"] as Tier[]).map(pt => {
                const active = cartItem!.priceType === pt;
                return (
                  <TouchableOpacity
                    key={pt}
                    style={[styles.tierChip, {
                      backgroundColor: active ? colors.primary : colors.secondary,
                      borderColor: active ? colors.primary : colors.border,
                    }]}
                    onPress={() => setTier(product.sync_id, pt)}
                  >
                    <Text style={[styles.tierChipText, { color: active ? "#fff" : colors.mutedForeground }]}>
                      {TIER_SHORT[pt]}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        )}
      </View>
    );
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
                  <Text style={[styles.clientPhone, { color: colors.mutedForeground }]}>
                    {TIER_LABEL[resolveTier(item)]}{item.phone ? ` • ${item.phone}` : ""}
                  </Text>
                </View>
              </TouchableOpacity>
            )}
            contentContainerStyle={{ padding: 12, gap: 6 }}
          />
        </View>
      )}

      {step === "products" && (
        <View style={{ flex: 1 }}>
          <View style={[styles.clientPill, { backgroundColor: colors.primary + "12", borderColor: colors.primary + "33" }]}>
            <View style={[styles.tierBadge, { backgroundColor: colors.primary }]}>
              <Text style={[styles.tierBadgeText, { color: "#fff" }]}>{TIER_LABEL[clientTier]}</Text>
            </View>
            <Text style={[styles.clientPillText, { color: colors.foreground }]} numberOfLines={1}>
              {selectedClient?.name} — الأسعار حسب فئة العميل
            </Text>
          </View>
          <View style={[styles.searchBar, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Feather name="search" size={16} color={colors.mutedForeground} />
            <TextInput
              style={[styles.searchInput, { color: colors.foreground }]}
              placeholder="ابحث عن منتج..."
              placeholderTextColor={colors.mutedForeground}
              value={productSearch}
              onChangeText={setProductSearch}
              textAlign="right"
            />
          </View>
          <FlatList
            data={filteredProducts}
            keyExtractor={i => i.sync_id}
            renderItem={renderProduct}
            numColumns={COLS}
            columnWrapperStyle={{ gap: GAP, paddingHorizontal: H_PAD }}
            contentContainerStyle={{ paddingVertical: 12, gap: GAP, paddingBottom: 110 }}
            ListEmptyComponent={
              <View style={styles.empty}>
                <Feather name="package" size={40} color={colors.muted} />
                <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>لا توجد منتجات</Text>
              </View>
            }
            showsVerticalScrollIndicator={false}
          />
          {items.length > 0 && (
            <View style={[styles.cartBar, { backgroundColor: colors.card, borderTopColor: colors.border, paddingBottom: insets.bottom + 12 }]}>
              <TouchableOpacity
                style={[styles.nextBtn, { backgroundColor: colors.primary }]}
                onPress={() => setStep("payment")}
              >
                <Text style={styles.nextBtnText}>التالي</Text>
                <Feather name="arrow-left" size={18} color="#fff" />
              </TouchableOpacity>
              <View style={{ alignItems: "flex-end" }}>
                <Text style={[styles.totalText, { color: colors.foreground }]}>{total.toLocaleString("fr-DZ")} د.ج</Text>
                <Text style={[styles.cartSub, { color: colors.mutedForeground }]}>{items.length} صنف • {totalUnits} وحدة</Text>
              </View>
            </View>
          )}
        </View>
      )}

      {step === "payment" && (
        <ScrollView contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: insets.bottom + 24 }}>
          <View style={[styles.summaryCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.summaryLabel, { color: colors.mutedForeground }]}>العميل</Text>
            <Text style={[styles.summaryVal, { color: colors.foreground }]}>{selectedClient?.name} ({TIER_LABEL[clientTier]})</Text>
            <View style={[styles.divider, { backgroundColor: colors.border }]} />
            {items.map(i => (
              <View key={i.product.sync_id} style={styles.lineRow}>
                <Text style={[styles.lineAmount, { color: colors.foreground }]}>
                  {(i.quantity * i.unitPrice).toLocaleString("fr-DZ")}
                </Text>
                <Text style={[styles.lineName, { color: colors.mutedForeground }]} numberOfLines={1}>
                  {i.product.name} ({i.quantity} × {i.unitPrice.toLocaleString("fr-DZ")})
                </Text>
              </View>
            ))}
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

  clientPill: {
    flexDirection: "row-reverse", alignItems: "center", gap: 8,
    marginHorizontal: 12, marginTop: 10, paddingHorizontal: 12, paddingVertical: 8,
    borderRadius: 12, borderWidth: 1,
  },
  clientPillText: { flex: 1, fontSize: 13, fontFamily: "Cairo_600SemiBold", textAlign: "right" },

  catCard: {
    borderRadius: 14, borderWidth: 1.5, padding: 8, gap: 6, alignItems: "center",
  },
  catName: { fontSize: 13, fontFamily: "Cairo_600SemiBold", textAlign: "center", minHeight: 36 },
  catPriceRow: { flexDirection: "row-reverse", alignItems: "center", gap: 6, flexWrap: "wrap", justifyContent: "center" },
  catPrice: { fontSize: 14, fontFamily: "Cairo_700Bold" },
  tierBadge: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6 },
  tierBadgeText: { fontSize: 10, fontFamily: "Cairo_600SemiBold" },
  addBtn: {
    flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 6,
    width: "100%", paddingVertical: 9, borderRadius: 10,
  },
  addBtnText: { color: "#fff", fontSize: 14, fontFamily: "Cairo_700Bold" },
  qtyRow: {
    flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between",
    borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 5,
  },
  qtyVal: { fontSize: 17, fontFamily: "Cairo_700Bold", minWidth: 28, textAlign: "center" },
  tierChips: { flexDirection: "row-reverse", gap: 4, justifyContent: "space-between" },
  tierChip: { flex: 1, alignItems: "center", paddingVertical: 4, borderRadius: 7, borderWidth: 1 },
  tierChipText: { fontSize: 10, fontFamily: "Cairo_600SemiBold" },

  cartBar: {
    position: "absolute", left: 0, right: 0, bottom: 0,
    flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 16, paddingTop: 12, borderTopWidth: 1,
  },
  totalText: { fontSize: 17, fontFamily: "Cairo_700Bold" },
  cartSub: { fontSize: 11, fontFamily: "Cairo_400Regular" },
  nextBtn: { flexDirection: "row-reverse", alignItems: "center", gap: 6, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 12 },
  nextBtnText: { color: "#fff", fontSize: 15, fontFamily: "Cairo_700Bold" },

  empty: { alignItems: "center", paddingVertical: 60, gap: 12 },
  emptyText: { fontSize: 14, fontFamily: "Cairo_400Regular" },

  summaryCard: { borderRadius: 14, borderWidth: 1, padding: 16, gap: 8 },
  summaryLabel: { fontSize: 12, fontFamily: "Cairo_400Regular" },
  summaryVal: { fontSize: 15, fontFamily: "Cairo_600SemiBold", textAlign: "right" },
  summaryTotal: { fontSize: 20, fontFamily: "Cairo_700Bold", textAlign: "right" },
  lineRow: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", gap: 8 },
  lineName: { flex: 1, fontSize: 12, fontFamily: "Cairo_400Regular", textAlign: "right" },
  lineAmount: { fontSize: 13, fontFamily: "Cairo_600SemiBold" },
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
