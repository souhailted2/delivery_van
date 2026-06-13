import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import {
  Alert, Dimensions, FlatList, KeyboardAvoidingView, Modal, Platform,
  Pressable, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity,
  TouchableWithoutFeedback, View,
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

const TIER_OPTIONS: { value: Tier; label: string }[] = [
  { value: "retail", label: "تجزئة" },
  { value: "half_wholesale", label: "نصف جملة" },
  { value: "wholesale", label: "جملة" },
];

export default function NewInvoiceScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { triggerSync, bumpLocalVersion } = useSync();

  const [step, setStep] = useState<"client" | "products" | "payment">("client");
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [items, setItems] = useState<InvoiceItem[]>([]);
  const [paymentType, setPaymentType] = useState<"cash" | "credit">("cash");

  // Enforce cash-only when truck is not permitted to sell on credit
  useEffect(() => {
    if (user?.truckCanSellOnCredit === false) setPaymentType("cash");
  }, [user?.truckCanSellOnCredit]);
  const [saving, setSaving] = useState(false);

  const [clients, setClients] = useState<Client[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [clientSearch, setClientSearch] = useState("");
  const [productSearch, setProductSearch] = useState("");

  // ── Add-client modal state ─────────────────────────────────────────────────
  const [addClientOpen, setAddClientOpen] = useState(false);
  const [newClientName, setNewClientName] = useState("");
  const [newClientPhone, setNewClientPhone] = useState("");
  const [newClientType, setNewClientType] = useState<Tier>("retail");
  const [savingNewClient, setSavingNewClient] = useState(false);

  // Inline quantity card state
  const [activeProductId, setActiveProductId] = useState<string | null>(null);
  const [inputQty, setInputQty] = useState("");

  const clientTier = resolveTier(selectedClient);

  useEffect(() => {
    (async () => {
      const db = await getDb();
      if (!db) return;
      const truckId = user?.truckId ?? null;
      const [cl, pr] = await Promise.all([
        truckId !== null
          ? db.getAllAsync<Client>("SELECT * FROM clients WHERE is_deleted = 0 AND truck_id = ? ORDER BY name", [truckId])
          : db.getAllAsync<Client>("SELECT * FROM clients WHERE is_deleted = 0 ORDER BY name"),
        truckId !== null
          ? db.getAllAsync<Product>(
              `SELECT p.*, ts.quantity as truck_quantity FROM products p
               INNER JOIN truck_stock ts ON ts.product_id = p.id AND ts.truck_id = ? AND ts.quantity > 0
               WHERE p.is_deleted = 0 ORDER BY p.name`,
              [truckId]
            )
          : db.getAllAsync<Product>("SELECT * FROM products WHERE is_deleted = 0 ORDER BY name"),
      ]);
      setClients(cl);
      setProducts(pr);
    })();
  }, [user?.truckId]);

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

  // ── Save new client to SQLite ──────────────────────────────────────────────
  const saveNewClient = async () => {
    const name = newClientName.trim();
    if (!name) return;
    setSavingNewClient(true);
    try {
      const db = await getDb();
      if (!db) return;
      const syncId = newSyncId();
      const now = new Date().toISOString();
      const truckId = user?.truckId ?? null;
      await db.runAsync(
        `INSERT INTO clients (sync_id, name, phone, client_type, truck_id, credit_balance,
           created_at, updated_at, is_deleted, _pending)
         VALUES (?, ?, ?, ?, ?, 0, ?, ?, 0, 1)`,
        [syncId, name, newClientPhone.trim() || null, newClientType,
          truckId, now, now] as any[]
      );
      const newClient: Client = {
        sync_id: syncId,
        name,
        phone: newClientPhone.trim() || null,
        client_type: newClientType,
        truck_id: truckId,
        credit_balance: 0,
        updated_at: now,
        is_deleted: 0,
        _pending: 1,
      };
      setClients(prev => [newClient, ...prev]);
      setSelectedClient(newClient);
      setAddClientOpen(false);
      setNewClientName("");
      setNewClientPhone("");
      setNewClientType("retail");
      bumpLocalVersion();
      triggerSync();
      setStep("products");
    } catch (e: any) {
      Alert.alert("خطأ", e?.message ?? "فشل حفظ الزبون");
    } finally {
      setSavingNewClient(false);
    }
  };

  const resetAddClientModal = () => {
    setAddClientOpen(false);
    setNewClientName("");
    setNewClientPhone("");
    setNewClientType("retail");
  };

  // Open the inline quantity card for a product
  const openQtyCard = (product: Product, currentQty?: number) => {
    setActiveProductId(product.sync_id);
    setInputQty(currentQty !== undefined ? String(currentQty) : "");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  // Confirm the quantity entered in the card
  const confirmQty = (product: Product, existingItem: InvoiceItem | undefined) => {
    const raw = inputQty.replace(",", ".").trim();
    let qty = parseFloat(raw);
    if (!isNaN(qty) && qty > 0) {
      // Guard against overselling: truck_quantity is set by the JOIN in the
      // products query and represents what the truck currently carries.
      // Only enforced when a specific truck is known (truck_quantity is defined).
      const maxAvailable = Number((product as any).truck_quantity);
      if (!isNaN(maxAvailable)) {
        if (maxAvailable <= 0) {
          Alert.alert("نفدت الكمية", `لا يوجد مخزون من "${product.name}" في الشاحنة.`);
          setActiveProductId(null);
          setInputQty("");
          return;
        }
        if (qty > maxAvailable) {
          qty = maxAvailable;
          Alert.alert(
            "تنبيه: تجاوز المخزون",
            `الكمية المتوفرة من "${product.name}" في الشاحنة هي ${maxAvailable} وحدة فقط.\nتم ضبط الكمية تلقائياً.`,
          );
        }
      }
      if (existingItem) {
        setItems(prev => prev.map(i =>
          i.product.sync_id === product.sync_id ? { ...i, quantity: qty } : i
        ));
      } else {
        setItems(prev => [...prev, {
          product,
          quantity: qty,
          priceType: clientTier,
          unitPrice: priceByType(product, clientTier),
        }]);
      }
    } else if ((!isNaN(qty) && qty === 0) || raw === "0") {
      setItems(prev => prev.filter(i => i.product.sync_id !== product.sync_id));
    }
    setActiveProductId(null);
    setInputQty("");
  };

  const dismissCard = () => {
    setActiveProductId(null);
    setInputQty("");
  };

  const removeItem = (syncId: string) => {
    setItems(prev => prev.filter(i => i.product.sync_id !== syncId));
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
          // Optimistic local decrement. Bump updated_at so the pull half of the
          // next sync (pull-then-push) does not overwrite this with the stale
          // server quantity before the server-side reconciliation runs.
          await db.runAsync(
            `UPDATE truck_stock SET quantity = MAX(0, quantity - ?), updated_at = ?
             WHERE truck_id = ? AND product_id = ?`,
            [item.quantity, now, truckRow.id, item.product.id ?? null] as any[]
          );
        }
      }

      // Credit sale → debit the client's balance locally so the dashboard /
      // clients list reflect it immediately. Sign convention: negative balance
      // means the client owes money — matching the server (balance − total).
      // The server recomputes the same value on push reconciliation, so there
      // is no sign flip after the next sync.
      if (paymentType === "credit") {
        await db.runAsync(
          `UPDATE clients SET credit_balance = COALESCE(credit_balance, 0) - ?, updated_at = ?, _pending = 1
           WHERE sync_id = ? OR (id IS NOT NULL AND id = ?)`,
          [total, now, selectedClient.sync_id, selectedClient.id ?? -1] as any[]
        );
      }

      // Cash sale → increase the truck's cash balance locally so the caisse /
      // dashboard reflect it immediately. trucks is NOT pushed from mobile, so
      // the server reconciles the authoritative balance on push; the updated_at
      // bump keeps the optimistic value from being reverted by the pre-push pull.
      if (paymentType === "cash" && truckRow?.id) {
        await db.runAsync(
          `UPDATE trucks SET cash_balance = COALESCE(cash_balance, 0) + ?, updated_at = ?
           WHERE id = ?`,
          [total, now, truckRow.id] as any[]
        );
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
      bumpLocalVersion();
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
    const isActive = activeProductId === product.sync_id;
    const price = cartItem?.unitPrice ?? priceByType(product, clientTier);

    return (
      <Pressable
        style={[
          styles.catCard,
          { width: CARD_W, backgroundColor: colors.card, borderColor: inCart ? colors.primary : colors.border },
          isActive && { borderColor: colors.primary, borderWidth: 2 },
        ]}
        onPress={() => {
          if (isActive) return;
          openQtyCard(product, cartItem?.quantity);
        }}
      >
        <ProductImage
          imageUrl={product.image_url}
          localUri={product.local_image_uri}
          size={IMG_SIZE}
          radius={12}
          colors={colors}
        />
        <Text style={[styles.catName, { color: colors.foreground }]} numberOfLines={2}>{product.name}</Text>
        <View style={styles.catPriceRow}>
          <Text style={[styles.catPrice, { color: colors.primary }]}>{price.toLocaleString("fr-DZ")} د.ج</Text>
        </View>
        {(product as any).truck_quantity !== undefined && (() => {
          const tq = Number((product as any).truck_quantity);
          const stockColor = tq <= 3 ? colors.destructive : colors.mutedForeground;
          return (
            <Text style={[styles.stockHint, { color: stockColor }]}>
              {tq <= 0 ? "نفد المخزون" : `في الشاحنة: ${tq.toFixed(0)}`}
            </Text>
          );
        })()}

        {isActive ? (
          <View style={[styles.qtyCard, { backgroundColor: colors.background, borderColor: colors.primary + "44" }]}>
            <TextInput
              style={[styles.qtyInput, { color: colors.foreground, backgroundColor: colors.card, borderColor: colors.border }]}
              value={inputQty}
              onChangeText={setInputQty}
              keyboardType="numeric"
              autoFocus
              textAlign="center"
              placeholder="الكمية"
              placeholderTextColor={colors.mutedForeground}
              returnKeyType="done"
              onSubmitEditing={() => confirmQty(product, cartItem)}
            />
            <View style={styles.qtyCardActions}>
              <Pressable
                style={[styles.qtyConfirmBtn, { backgroundColor: colors.primary }]}
                onPress={() => confirmQty(product, cartItem)}
              >
                <Text style={styles.qtyConfirmText}>{inCart ? "تحديث" : "أضف"}</Text>
              </Pressable>
              <Pressable
                style={[styles.qtyCancelBtn, { backgroundColor: colors.muted }]}
                onPress={dismissCard}
              >
                <Feather name="x" size={15} color={colors.foreground} />
              </Pressable>
            </View>
            {inCart && (
              <Pressable onPress={() => { removeItem(product.sync_id); dismissCard(); }}>
                <Text style={[styles.removeHint, { color: colors.destructive }]}>إزالة من السلة</Text>
              </Pressable>
            )}
          </View>
        ) : inCart ? (
          <View style={[styles.inCartBadge, { borderColor: colors.primary + "55", backgroundColor: colors.primary + "10" }]}>
            <Feather name="edit-2" size={12} color={colors.primary} />
            <Text style={[styles.inCartQty, { color: colors.primary }]}>
              {cartItem!.quantity % 1 === 0 ? cartItem!.quantity : cartItem!.quantity.toFixed(2)} وحدة
            </Text>
          </View>
        ) : (
          <View style={[styles.addBtn, { backgroundColor: colors.primary }]}>
            <Feather name="plus" size={16} color="#fff" />
            <Text style={styles.addBtnText}>إضافة</Text>
          </View>
        )}
      </Pressable>
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
            dismissCard();
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
          {/* Search bar + add-client button */}
          <View style={styles.clientSearchRow}>
            <View style={[styles.searchBar, { flex: 1, backgroundColor: colors.card, borderColor: colors.border }]}>
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
            <TouchableOpacity
              style={[styles.addClientBtn, { backgroundColor: colors.primary }]}
              onPress={() => setAddClientOpen(true)}
            >
              <Feather name="plus" size={20} color="#fff" />
            </TouchableOpacity>
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
                  {item.phone ? (
                    <Text style={[styles.clientPhone, { color: colors.mutedForeground }]}>{item.phone}</Text>
                  ) : null}
                </View>
              </TouchableOpacity>
            )}
            contentContainerStyle={{ padding: 12, gap: 6 }}
            ListEmptyComponent={
              <View style={styles.empty}>
                <Feather name="users" size={40} color={colors.muted} />
                <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>لا يوجد عملاء</Text>
                <TouchableOpacity
                  style={[styles.addClientEmptyBtn, { backgroundColor: colors.primary }]}
                  onPress={() => setAddClientOpen(true)}
                >
                  <Feather name="plus" size={16} color="#fff" />
                  <Text style={styles.addClientEmptyBtnText}>إضافة زبون جديد</Text>
                </TouchableOpacity>
              </View>
            }
          />
        </View>
      )}

      {step === "products" && (
        <View style={{ flex: 1 }}>
          <View style={[styles.clientPill, { backgroundColor: colors.primary + "12", borderColor: colors.primary + "33" }]}>
            <Feather name="user" size={14} color={colors.primary} />
            <Text style={[styles.clientPillText, { color: colors.foreground }]} numberOfLines={1}>
              {selectedClient?.name}
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
          <TouchableWithoutFeedback onPress={() => activeProductId !== null && dismissCard()}>
            <View style={{ flex: 1 }}>
              <FlatList
                data={filteredProducts}
                keyExtractor={i => i.sync_id}
                renderItem={renderProduct}
                numColumns={COLS}
                columnWrapperStyle={{ gap: GAP, paddingHorizontal: H_PAD }}
                contentContainerStyle={{ paddingVertical: 12, gap: GAP, paddingBottom: 110 }}
                keyboardShouldPersistTaps="handled"
                onScrollBeginDrag={dismissCard}
                ListEmptyComponent={
                  <View style={styles.empty}>
                    <Feather name="package" size={40} color={colors.muted} />
                    <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>لا توجد منتجات</Text>
                  </View>
                }
                showsVerticalScrollIndicator={false}
              />
            </View>
          </TouchableWithoutFeedback>
          {items.length > 0 && (
            <View style={[styles.cartBar, { backgroundColor: colors.card, borderTopColor: colors.border, paddingBottom: insets.bottom + 12 }]}>
              <TouchableOpacity
                style={[styles.nextBtn, { backgroundColor: colors.primary }]}
                onPress={() => { dismissCard(); setStep("payment"); }}
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
            <Text style={[styles.summaryVal, { color: colors.foreground }]}>{selectedClient?.name}</Text>
            <View style={[styles.divider, { backgroundColor: colors.border }]} />
            {items.map(i => (
              <View key={i.product.sync_id} style={styles.lineRow}>
                <Text style={[styles.lineAmount, { color: colors.foreground }]}>
                  {(i.quantity * i.unitPrice).toLocaleString("fr-DZ")}
                </Text>
                <Text style={[styles.lineName, { color: colors.mutedForeground }]} numberOfLines={1}>
                  {i.product.name} ({i.quantity % 1 === 0 ? i.quantity : i.quantity.toFixed(2)} × {i.unitPrice.toLocaleString("fr-DZ")})
                </Text>
              </View>
            ))}
            <View style={[styles.divider, { backgroundColor: colors.border }]} />
            <Text style={[styles.summaryLabel, { color: colors.mutedForeground }]}>الإجمالي</Text>
            <Text style={[styles.summaryTotal, { color: colors.primary }]}>{total.toLocaleString("fr-DZ")} د.ج</Text>
          </View>

          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>طريقة الدفع</Text>
          <View style={styles.paymentRow}>
            {(["cash", "credit"] as const)
              .filter(pt => pt === "cash" || (user?.truckCanSellOnCredit !== false))
              .map(pt => (
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

      {/* ── Add-client modal ──────────────────────────────────────────────── */}
      <Modal
        visible={addClientOpen}
        transparent
        animationType="slide"
        onRequestClose={resetAddClientModal}
      >
        <TouchableWithoutFeedback onPress={resetAddClientModal}>
          <View style={styles.modalOverlay} />
        </TouchableWithoutFeedback>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={styles.modalKav}
        >
          <View style={[styles.modalSheet, { backgroundColor: colors.card, borderColor: colors.border, paddingBottom: insets.bottom + 16 }]}>
            {/* Handle */}
            <View style={[styles.modalHandle, { backgroundColor: colors.border }]} />

            <Text style={[styles.modalTitle, { color: colors.foreground }]}>زبون جديد</Text>

            {/* Name */}
            <View style={styles.modalField}>
              <Text style={[styles.modalLabel, { color: colors.mutedForeground }]}>الاسم *</Text>
              <TextInput
                style={[styles.modalInput, { color: colors.foreground, backgroundColor: colors.background, borderColor: colors.border }]}
                value={newClientName}
                onChangeText={setNewClientName}
                placeholder="اسم الزبون"
                placeholderTextColor={colors.mutedForeground}
                textAlign="right"
                autoFocus
                returnKeyType="next"
              />
            </View>

            {/* Phone */}
            <View style={styles.modalField}>
              <Text style={[styles.modalLabel, { color: colors.mutedForeground }]}>الهاتف (اختياري)</Text>
              <TextInput
                style={[styles.modalInput, { color: colors.foreground, backgroundColor: colors.background, borderColor: colors.border }]}
                value={newClientPhone}
                onChangeText={setNewClientPhone}
                placeholder="0555 000 000"
                placeholderTextColor={colors.mutedForeground}
                keyboardType="phone-pad"
                textAlign="right"
                returnKeyType="done"
              />
            </View>

            {/* Client type selector */}
            <View style={styles.modalField}>
              <Text style={[styles.modalLabel, { color: colors.mutedForeground }]}>نوع العميل</Text>
              <View style={styles.tierRow}>
                {TIER_OPTIONS.map(opt => (
                  <TouchableOpacity
                    key={opt.value}
                    style={[
                      styles.tierBtn,
                      {
                        backgroundColor: newClientType === opt.value ? colors.primary : colors.background,
                        borderColor: newClientType === opt.value ? colors.primary : colors.border,
                      },
                    ]}
                    onPress={() => setNewClientType(opt.value)}
                  >
                    <Text style={[
                      styles.tierBtnText,
                      { color: newClientType === opt.value ? "#fff" : colors.foreground },
                    ]}>
                      {opt.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Actions */}
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalCancelBtn, { backgroundColor: colors.background, borderColor: colors.border }]}
                onPress={resetAddClientModal}
              >
                <Text style={[styles.modalCancelText, { color: colors.foreground }]}>إلغاء</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.modalSaveBtn,
                  { backgroundColor: savingNewClient || !newClientName.trim() ? colors.muted : colors.primary },
                ]}
                onPress={saveNewClient}
                disabled={savingNewClient || !newClientName.trim()}
              >
                <Text style={styles.modalSaveText}>
                  {savingNewClient ? "جاري الحفظ..." : "حفظ وتحديد"}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
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

  // Client search row with + button
  clientSearchRow: {
    flexDirection: "row-reverse", alignItems: "center",
    gap: 8, marginHorizontal: 12, marginTop: 10,
  },
  addClientBtn: {
    width: 44, height: 44, borderRadius: 12,
    alignItems: "center", justifyContent: "center",
  },

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
  stockHint: { fontSize: 10, fontFamily: "Cairo_400Regular", textAlign: "center" },

  addBtn: {
    flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 6,
    width: "100%", paddingVertical: 9, borderRadius: 10,
  },
  addBtnText: { color: "#fff", fontSize: 14, fontFamily: "Cairo_700Bold" },

  inCartBadge: {
    flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 6,
    width: "100%", paddingVertical: 8, borderRadius: 10, borderWidth: 1,
  },
  inCartQty: { fontSize: 13, fontFamily: "Cairo_700Bold" },

  qtyCard: {
    width: "100%", borderRadius: 10, borderWidth: 1,
    padding: 8, gap: 6, alignItems: "center",
  },
  qtyInput: {
    width: "100%", height: 42, borderRadius: 8, borderWidth: 1,
    fontSize: 18, fontFamily: "Cairo_700Bold", textAlign: "center",
  },
  qtyCardActions: { flexDirection: "row-reverse", gap: 6, width: "100%" },
  qtyConfirmBtn: {
    flex: 1, paddingVertical: 8, borderRadius: 8,
    alignItems: "center", justifyContent: "center",
  },
  qtyConfirmText: { color: "#fff", fontSize: 14, fontFamily: "Cairo_700Bold" },
  qtyCancelBtn: {
    width: 38, paddingVertical: 8, borderRadius: 8,
    alignItems: "center", justifyContent: "center",
  },
  removeHint: { fontSize: 11, fontFamily: "Cairo_400Regular", textDecorationLine: "underline" },

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
  addClientEmptyBtn: {
    flexDirection: "row-reverse", alignItems: "center", gap: 6,
    paddingHorizontal: 20, paddingVertical: 10, borderRadius: 12,
  },
  addClientEmptyBtnText: { color: "#fff", fontSize: 14, fontFamily: "Cairo_700Bold" },

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

  // ── Add-client modal ──────────────────────────────────────────────────────
  modalOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  modalKav: {
    position: "absolute", left: 0, right: 0, bottom: 0,
  },
  modalSheet: {
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    borderWidth: 1, paddingHorizontal: 20, paddingTop: 12,
    gap: 14,
  },
  modalHandle: {
    width: 40, height: 4, borderRadius: 2,
    alignSelf: "center", marginBottom: 4,
  },
  modalTitle: { fontSize: 17, fontFamily: "Cairo_700Bold", textAlign: "right" },
  modalField: { gap: 6 },
  modalLabel: { fontSize: 12, fontFamily: "Cairo_400Regular", textAlign: "right" },
  modalInput: {
    height: 46, borderRadius: 10, borderWidth: 1,
    paddingHorizontal: 14, fontSize: 15, fontFamily: "Cairo_400Regular",
  },
  tierRow: { flexDirection: "row-reverse", gap: 8 },
  tierBtn: {
    flex: 1, paddingVertical: 10, borderRadius: 10, borderWidth: 1,
    alignItems: "center", justifyContent: "center",
  },
  tierBtnText: { fontSize: 13, fontFamily: "Cairo_600SemiBold" },
  modalActions: { flexDirection: "row-reverse", gap: 10, marginTop: 4 },
  modalCancelBtn: {
    flex: 1, paddingVertical: 13, borderRadius: 12, borderWidth: 1,
    alignItems: "center", justifyContent: "center",
  },
  modalCancelText: { fontSize: 15, fontFamily: "Cairo_600SemiBold" },
  modalSaveBtn: {
    flex: 2, paddingVertical: 13, borderRadius: 12,
    alignItems: "center", justifyContent: "center",
  },
  modalSaveText: { color: "#fff", fontSize: 15, fontFamily: "Cairo_700Bold" },
});
