import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Animated, Dimensions, FlatList, KeyboardAvoidingView, Modal, Platform,
  ScrollView, StyleSheet, Text, TextInput,
  TouchableWithoutFeedback, View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ProductImage } from "@/components/ProductImage";
import { AppButton, MoneyText, PressableScale, ResultDialog } from "@/components/ui";
import type { DialogAction, ResultVariant } from "@/components/ui";
import { useAuth } from "@/contexts/AuthContext";
import { useSync } from "@/contexts/SyncContext";
import { Client, getDb, Product } from "@/lib/db";
import { formatMoney } from "@/lib/money";
import { printInvoiceReceipt, ReceiptInvoice } from "@/lib/receipt";
import { getTruckForUser } from "@/lib/truck";
import { newSyncId } from "@/lib/uuid";
import { canonicalizeTruckStock } from "@/lib/truckStock";
import { fonts, motion } from "@/constants/tokens";
import { useTheme } from "@/hooks/useTheme";

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

const STEPS = [
  { key: "client", label: "العميل" },
  { key: "products", label: "المنتجات" },
  { key: "cart", label: "السلة" },
  { key: "payment", label: "الدفع" },
] as const;

export default function NewInvoiceScreen() {
  const t = useTheme();
  const c = t.color;
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { triggerSync, bumpLocalVersion, localVersion } = useSync();
  const { clientSyncId } = useLocalSearchParams<{ clientSyncId?: string }>();

  const [step, setStep] = useState<"client" | "products" | "cart" | "payment">("client");
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [items, setItems] = useState<InvoiceItem[]>([]);
  const [paymentType, setPaymentType] = useState<"cash" | "credit">("cash");

  // Branded dialog (replaces native Alert.alert).
  const [dialog, setDialog] = useState<{ visible: boolean; variant: ResultVariant; title: string; message?: string; actions?: DialogAction[] }>(
    { visible: false, variant: "info", title: "" }
  );
  const showDialog = (variant: ResultVariant, title: string, message?: string, actions?: DialogAction[]) =>
    setDialog({ visible: true, variant, title, message, actions });
  const hideDialog = () => setDialog((d) => ({ ...d, visible: false }));

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

  // Per-item quantity draft text, edited on the cart screen (keyed by sync_id).
  const [qtyText, setQtyText] = useState<Record<string, string>>({});

  const clientTier = resolveTier(selectedClient);

  // Subtle cross-fade between steps — communicates the move through the flow.
  const stepFade = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    stepFade.setValue(0);
    Animated.timing(stepFade, { toValue: 1, duration: motion.duration.normal, easing: motion.easing.out, useNativeDriver: true }).start();
  }, [step, stepFade]);

  // Refresh truck stock from the server as soon as this screen opens, so the
  // quantities shown below aren't stale (e.g. right after a dispatch/return).
  useEffect(() => {
    triggerSync();
  }, []);

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
              `SELECT p.*, COALESCE(agg.quantity, 0) as truck_quantity FROM products p
               LEFT JOIN (
                 SELECT product_id, SUM(quantity) AS quantity
                 FROM truck_stock WHERE truck_id = ? GROUP BY product_id
               ) agg ON agg.product_id = p.id
               WHERE p.is_deleted = 0 ORDER BY truck_quantity DESC, p.name`,
              [truckId]
            )
          : db.getAllAsync<Product>("SELECT * FROM products WHERE is_deleted = 0 ORDER BY name"),
      ]);
      setClients(cl);
      setProducts(pr);
    })();
  }, [user?.truckId, localVersion]);

  // Re-price cart items to the selected customer's tier (unless manually overridden).
  useEffect(() => {
    if (!selectedClient) return;
    const tier = resolveTier(selectedClient);
    setItems(prev => prev.map(i =>
      i.overridden ? i : { ...i, priceType: tier, unitPrice: priceByType(i.product, tier) }
    ));
  }, [selectedClient]);

  // Preselect a client when arriving from the Client Profile "بيع جديد" action.
  const presetRef = useRef(false);
  useEffect(() => {
    if (presetRef.current || !clientSyncId || selectedClient) return;
    const match = clients.find(cl => cl.sync_id === clientSyncId);
    if (match) { presetRef.current = true; setSelectedClient(match); setStep("products"); }
  }, [clients, clientSyncId, selectedClient]);

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
      showDialog("error", "خطأ", e?.message ?? "فشل حفظ الزبون");
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

  const removeItem = (syncId: string) => {
    setItems(prev => prev.filter(i => i.product.sync_id !== syncId));
    setQtyText(prev => { const n = { ...prev }; delete n[syncId]; return n; });
  };

  // One tap on a product card adds it to the cart at qty 1; tapping again
  // removes it. Quantities are then fine-tuned on the cart screen. Overselling
  // is blocked up-front (truck_quantity comes from the JOIN in the products query).
  const toggleProduct = (product: Product) => {
    if (items.some(i => i.product.sync_id === product.sync_id)) {
      removeItem(product.sync_id);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      return;
    }
    const tqRaw = (product as any).truck_quantity;
    if (tqRaw !== undefined) {
      const maxAvailable = Number(tqRaw);
      if (!isNaN(maxAvailable) && maxAvailable <= 0) {
        showDialog("error", "نفدت الكمية", `لا يوجد مخزون من "${product.name}" في الشاحنة.`);
        return;
      }
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setItems(prev => [...prev, {
      product,
      quantity: 1,
      priceType: clientTier,
      unitPrice: priceByType(product, clientTier),
    }]);
  };

  // Commit a quantity typed into a cart row (clamped to truck stock). An empty
  // field leaves the value unchanged; zero/invalid removes the line.
  const commitQty = (item: InvoiceItem) => {
    const id = item.product.sync_id;
    const raw = (qtyText[id] ?? "").replace(",", ".").trim();
    if (raw === "") { setQtyText(prev => { const n = { ...prev }; delete n[id]; return n; }); return; }
    let qty = parseFloat(raw);
    if (isNaN(qty) || qty <= 0) { removeItem(id); return; }
    const tqRaw = (item.product as any).truck_quantity;
    if (tqRaw !== undefined) {
      const maxAvailable = Number(tqRaw);
      if (!isNaN(maxAvailable) && qty > maxAvailable) {
        qty = maxAvailable;
        showDialog(
          "warning",
          "تنبيه: تجاوز المخزون",
          `الكمية المتوفرة من "${item.product.name}" في الشاحنة هي ${maxAvailable} وحدة فقط.\nتم ضبط الكمية تلقائياً.`,
        );
      }
    }
    setItems(prev => prev.map(it => it.product.sync_id === id ? { ...it, quantity: qty } : it));
    setQtyText(prev => { const n = { ...prev }; delete n[id]; return n; });
  };

  const total = items.reduce((s, i) => s + i.quantity * i.unitPrice, 0);
  const totalUnits = items.reduce((s, i) => s + i.quantity, 0);

  const saveInvoice = async () => {
    if (!selectedClient) return;
    if (items.length === 0) { showDialog("warning", "تنبيه", "أضف منتجاً واحداً على الأقل"); return; }

    // Credit-limit check (offline-safe — uses locally synced credit_limit)
    if (paymentType === "credit") {
      const limit = Number(selectedClient.credit_limit ?? 0);
      if (limit > 0) {
        const currentDebt = -Number(selectedClient.credit_balance ?? 0); // positive = client owes
        if (currentDebt + total > limit) {
          const remaining = Math.max(0, limit - currentDebt);
          showDialog(
            "warning",
            "تجاوز سقف الآجل",
            `ديْن هذا العميل الحالي ${formatMoney(currentDebt)} — السقف ${formatMoney(limit)} — المتاح ${formatMoney(remaining)}`,
          );
          return;
        }
      }
    }

    try {
      setSaving(true);
      const db = await getDb();
      if (!db) return;

      const invSyncId = newSyncId();
      const invNumber = `MOB-${invSyncId.slice(-6).toUpperCase()}`;
      const now = new Date().toISOString();

      const truckRow = await getTruckForUser(db, user?.truckId);
      // Fallback: when trucks table hasn't synced the row yet, user.truckId still
      // lets us set invoice.truck_id, decrement stock, and update cash balance.
      const effectiveTruckId = truckRow?.id ?? user?.truckId ?? null;

      // A truck driver must have an assigned truck before saving an invoice,
      // otherwise stock can't be decremented and the invoice has no truck
      // context. Block with a clear message ( finally{} resets `saving` ).
      if (user?.role === "truck" && effectiveTruckId == null) {
        showDialog(
          "error",
          "لا توجد شاحنة",
          "لا يمكن حفظ الفاتورة: لم يتم تعيين شاحنة لحسابك. تواصل مع الإدارة لربط حسابك بشاحنة."
        );
        return;
      }

      await db.runAsync(
        `INSERT INTO invoices (sync_id, invoice_number, truck_id, client_id, client_sync_id, payment_type,
          total_amount, created_at, updated_at, is_deleted, _pending)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 1)`,
        [invSyncId, invNumber, effectiveTruckId, selectedClient.id ?? null, selectedClient.sync_id,
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
        if (effectiveTruckId && item.product.id != null) {
          // Optimistic local decrement. Bump updated_at so the pull half of the
          // next sync (pull-then-push) does not overwrite this with the stale
          // server quantity before the server-side reconciliation runs.
          // canonicalizeTruckStock collapses any duplicate rows so the decrement
          // applies to the true total, not a single (possibly stale) row.
          await canonicalizeTruckStock(
            db, effectiveTruckId, item.product.id, -item.quantity, now
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
      if (paymentType === "cash" && effectiveTruckId) {
        await db.runAsync(
          `UPDATE trucks SET cash_balance = COALESCE(cash_balance, 0) + ?, updated_at = ?
           WHERE id = ?`,
          [total, now, effectiveTruckId] as any[]
        );
      }

      const receipt: ReceiptInvoice = {
        invoiceNumber: invNumber,
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
      showDialog("success", "تم", "تم حفظ الفاتورة بنجاح. اضغط «طباعة الإيصال» لإرسالها إلى RawBT.", [
        {
          label: "طباعة الإيصال",
          onPress: async () => {
            try {
              await printInvoiceReceipt(receipt);
              router.back();
            } catch (e: any) {
              // Surface the failure instead of swallowing it — otherwise the
              // driver assumes the receipt printed when it didn't.
              showDialog("error", "تعذّرت الطباعة", e?.message ?? "تعذّر فتح الطباعة. تأكد من تثبيت تطبيق RawBT.");
            }
          },
        },
        { label: "إغلاق", variant: "tonal", onPress: () => router.back() },
      ]);
    } catch (e: any) {
      showDialog("error", "خطأ", e?.message ?? "فشل حفظ الفاتورة");
    } finally {
      setSaving(false);
    }
  };

  const cartMap = useMemo(() => {
    const m = new Map<string, InvoiceItem>();
    for (const i of items) m.set(i.product.sync_id, i);
    return m;
  }, [items]);

  const imgColors = { secondary: c.surfaceElevated, mutedForeground: c.textMuted };

  const renderProduct = ({ item: product }: { item: Product }) => {
    const cartItem = cartMap.get(product.sync_id);
    const inCart = !!cartItem;
    const price = cartItem?.unitPrice ?? priceByType(product, clientTier);
    const tqRaw = (product as any).truck_quantity;
    const hasStockInfo = tqRaw !== undefined;
    const tq = hasStockInfo ? Number(tqRaw) : 0;
    const isOutOfStock = hasStockInfo && tq <= 0;
    const lowStock = hasStockInfo && tq > 0 && tq <= 3;

    return (
      <PressableScale
        style={[
          styles.catCard,
          { width: CARD_W, backgroundColor: inCart ? c.brandTint : c.surface, borderColor: inCart ? c.brand : c.hairline },
          inCart && { borderWidth: 2 },
          isOutOfStock && { opacity: 0.45 },
        ]}
        onPress={() => toggleProduct(product)}
        accessibilityLabel={`${product.name}${inCart ? " — في السلة، اضغط للإزالة" : " — اضغط للإضافة"}`}
      >
        <View style={styles.catImageWrap}>
          <ProductImage
            imageUrl={product.image_url}
            localUri={product.local_image_uri}
            size={IMG_SIZE}
            radius={12}
            colors={imgColors}
          />
          {hasStockInfo && (
            <View
              style={[
                styles.stockBadge,
                {
                  backgroundColor: isOutOfStock || lowStock ? c.danger : c.surfaceElevated,
                  borderColor: isOutOfStock || lowStock ? c.danger : c.hairline,
                },
              ]}
            >
              <Feather name="box" size={9} color={isOutOfStock || lowStock ? "#fff" : c.textMuted} />
              <Text style={[styles.stockBadgeText, { color: isOutOfStock || lowStock ? "#fff" : c.textMuted }]}>
                {isOutOfStock ? "نفد" : tq.toFixed(0)}
              </Text>
            </View>
          )}
          {inCart && (
            <View style={[styles.selectTick, { backgroundColor: c.brand }]}>
              <Feather name="check" size={14} color={c.onBrand} />
            </View>
          )}
        </View>
        <Text style={[styles.catName, { color: c.text }]} numberOfLines={2}>{product.name}</Text>
        <MoneyText amount={price} tone="brand" size="callout" />

        {inCart ? (
          <View style={[styles.inCartBadge, { borderColor: c.brand, backgroundColor: c.surface }]}>
            <Feather name="shopping-cart" size={12} color={c.brandText} />
            <Text style={[styles.inCartQty, { color: c.brandText }]}>
              {cartItem!.quantity % 1 === 0 ? `في السلة · ${cartItem!.quantity}` : `في السلة · ${cartItem!.quantity.toFixed(2)}`}
            </Text>
          </View>
        ) : (
          <Text style={[styles.tapHint, { color: isOutOfStock ? c.dangerText : c.textFaint }]}>
            {isOutOfStock ? "نفد المخزون" : "اضغط للإضافة"}
          </Text>
        )}
      </PressableScale>
    );
  };

  const curIdx = STEPS.findIndex(s => s.key === step);
  const goStep = (key: typeof STEPS[number]["key"]) => {
    if (key === "products" && !selectedClient) return;
    if ((key === "cart" || key === "payment") && items.length === 0) return;
    setStep(key);
  };

  return (
    <View style={[styles.container, { backgroundColor: c.bg, paddingTop: insets.top }]}>
      <View style={[styles.topBar, { backgroundColor: c.rail, borderBottomColor: c.hairline }]}>
        <PressableScale onPress={() => router.back()} hitSlop={10} accessibilityLabel="إغلاق">
          <Feather name="x" size={22} color={c.text} />
        </PressableScale>
        <Text style={[styles.title, { color: c.text }]}>فاتورة جديدة</Text>
        <View style={{ width: 22 }} />
      </View>

      {/* Stepper */}
      <View style={[styles.steps, { backgroundColor: c.rail, borderBottomColor: c.hairline }]}>
        <View style={styles.stepRow}>
          {STEPS.map((s, i) => {
            const done = i < curIdx;
            const active = i === curIdx;
            return (
              <View key={s.key} style={styles.stepNodeWrap}>
                <PressableScale onPress={() => goStep(s.key)} hitSlop={8}>
                  <View
                    style={[
                      styles.stepDot,
                      done && { backgroundColor: c.brand },
                      active && { backgroundColor: c.brand, ...t.elevation.glow },
                      !done && !active && { backgroundColor: c.surfaceElevated },
                    ]}
                  >
                    {done ? (
                      <Feather name="check" size={12} color={c.onBrand} />
                    ) : (
                      <Text style={[styles.stepDotText, { color: active ? c.onBrand : c.textMuted }]}>{i + 1}</Text>
                    )}
                  </View>
                </PressableScale>
                {i < STEPS.length - 1 && (
                  <View style={[styles.stepTrack, { backgroundColor: i < curIdx ? c.brand : c.hairline }]} />
                )}
              </View>
            );
          })}
        </View>
        <View style={styles.stepLabels}>
          {STEPS.map((s, i) => (
            <Text key={s.key} style={[styles.stepLabel, { color: i === curIdx ? c.brandText : i < curIdx ? c.text : c.textFaint }]}>
              {s.label}
            </Text>
          ))}
        </View>
      </View>

      {step === "client" && (
        <Animated.View style={{ flex: 1, opacity: stepFade }}>
          {/* Search bar + add-client button */}
          <View style={styles.clientSearchRow}>
            <View style={[styles.searchBar, { flex: 1, backgroundColor: c.surface, borderColor: c.hairline }]}>
              <Feather name="search" size={16} color={c.textMuted} />
              <TextInput
                style={[styles.searchInput, { color: c.text }]}
                placeholder="ابحث عن عميل..."
                placeholderTextColor={c.textFaint}
                value={clientSearch}
                onChangeText={setClientSearch}
                textAlign="right"
              />
            </View>
            <PressableScale
              style={[styles.addClientBtn, { backgroundColor: c.brand }]}
              onPress={() => setAddClientOpen(true)}
              haptic
              accessibilityLabel="إضافة عميل"
            >
              <Feather name="plus" size={20} color={c.onBrand} />
            </PressableScale>
          </View>

          <FlatList
            data={filteredClients}
            keyExtractor={i => i.sync_id}
            renderItem={({ item }) => (
              <PressableScale
                style={[
                  styles.clientRow,
                  { backgroundColor: selectedClient?.sync_id === item.sync_id ? c.brandTint : c.surface, borderColor: selectedClient?.sync_id === item.sync_id ? c.brandBorder : c.hairline }
                ]}
                onPress={() => { setSelectedClient(item); setStep("products"); }}
              >
                <Feather name="check" size={16} color={selectedClient?.sync_id === item.sync_id ? c.brandText : "transparent"} />
                <View style={{ flex: 1, alignItems: "flex-end" }}>
                  <Text style={[styles.clientName, { color: c.text }]}>{item.name}</Text>
                  {item.phone ? (
                    <Text style={[styles.clientPhone, { color: c.textMuted }]}>{item.phone}</Text>
                  ) : null}
                </View>
              </PressableScale>
            )}
            contentContainerStyle={{ padding: 12, gap: 6 }}
            ListEmptyComponent={
              <View style={styles.empty}>
                <Feather name="users" size={40} color={c.textFaint} />
                <Text style={[styles.emptyText, { color: c.textMuted }]}>لا يوجد عملاء</Text>
                <AppButton label="إضافة زبون جديد" icon="plus" size="md" onPress={() => setAddClientOpen(true)} />
              </View>
            }
          />
        </Animated.View>
      )}

      {step === "products" && (
        <Animated.View style={{ flex: 1, opacity: stepFade }}>
          <View style={[styles.clientPill, { backgroundColor: c.brandTint, borderColor: c.brandBorder }]}>
            <Feather name="user" size={14} color={c.brandText} />
            <Text style={[styles.clientPillText, { color: c.text }]} numberOfLines={1}>
              {selectedClient?.name}
            </Text>
          </View>
          <View style={[styles.searchBar, { backgroundColor: c.surface, borderColor: c.hairline }]}>
            <Feather name="search" size={16} color={c.textMuted} />
            <TextInput
              style={[styles.searchInput, { color: c.text }]}
              placeholder="ابحث عن منتج..."
              placeholderTextColor={c.textFaint}
              value={productSearch}
              onChangeText={setProductSearch}
              textAlign="right"
            />
          </View>
          <View style={{ flex: 1 }}>
            <FlatList
              data={filteredProducts}
              keyExtractor={i => i.sync_id}
              renderItem={renderProduct}
              numColumns={COLS}
              columnWrapperStyle={{ gap: GAP, paddingHorizontal: H_PAD, flexDirection: "row-reverse" }}
              contentContainerStyle={{ paddingVertical: 12, gap: GAP, paddingBottom: 110 }}
              keyboardShouldPersistTaps="handled"
              ListEmptyComponent={
                <View style={styles.empty}>
                  <Feather name="package" size={40} color={c.textFaint} />
                  <Text style={[styles.emptyText, { color: c.textMuted }]}>
                    {productSearch.trim() ? "لا توجد نتائج" : "لا توجد منتجات"}
                  </Text>
                </View>
              }
              showsVerticalScrollIndicator={false}
            />
          </View>
          {items.length > 0 && (
            <View style={[styles.cartBar, { backgroundColor: c.rail, borderTopColor: c.hairline, paddingBottom: insets.bottom + 12 }]}>
              <PressableScale
                style={[styles.nextBtn, { backgroundColor: c.brand, ...t.elevation.glow }]}
                onPress={() => setStep("cart")}
                haptic
              >
                <Text style={[styles.nextBtnText, { color: c.onBrand }]}>السلة</Text>
                <Feather name="arrow-left" size={18} color={c.onBrand} />
              </PressableScale>
              <View style={{ alignItems: "flex-end" }}>
                <MoneyText amount={total} size="title" />
                <Text style={[styles.cartSub, { color: c.textMuted }]}>{items.length} صنف • {totalUnits} وحدة</Text>
              </View>
            </View>
          )}
        </Animated.View>
      )}

      {step === "cart" && (
        <Animated.View style={{ flex: 1, opacity: stepFade }}>
          <View style={[styles.clientPill, { backgroundColor: c.brandTint, borderColor: c.brandBorder }]}>
            <Feather name="shopping-cart" size={14} color={c.brandText} />
            <Text style={[styles.clientPillText, { color: c.text }]} numberOfLines={1}>
              {selectedClient?.name} — {items.length} صنف
            </Text>
          </View>
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : undefined}
            style={{ flex: 1 }}
          >
            <FlatList
              data={items}
              keyExtractor={i => i.product.sync_id}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item: i }) => {
                const lineTotal = i.quantity * i.unitPrice;
                return (
                  <View style={[styles.cartItemRow, { backgroundColor: c.surface, borderColor: c.hairline }]}>
                    <PressableScale
                      style={[styles.cartRemoveBtn, { backgroundColor: c.dangerTint }]}
                      onPress={() => removeItem(i.product.sync_id)}
                      hitSlop={6}
                      accessibilityLabel="إزالة من السلة"
                    >
                      <Feather name="trash-2" size={17} color={c.dangerText} />
                    </PressableScale>
                    <View style={styles.cartQtyWrap}>
                      <TextInput
                        style={[styles.cartQtyInput, { color: c.text, backgroundColor: c.bg, borderColor: c.hairline }]}
                        value={qtyText[i.product.sync_id] ?? (i.quantity % 1 === 0 ? String(i.quantity) : i.quantity.toFixed(2))}
                        onChangeText={(txt) => setQtyText(prev => ({ ...prev, [i.product.sync_id]: txt }))}
                        onEndEditing={() => commitQty(i)}
                        keyboardType="numeric"
                        textAlign="center"
                        returnKeyType="done"
                        selectTextOnFocus
                        accessibilityLabel={`كمية ${i.product.name}`}
                      />
                      <Text style={[styles.cartQtyLabel, { color: c.textFaint }]}>الكمية</Text>
                    </View>
                    <View style={{ flex: 1, alignItems: "flex-end" }}>
                      <Text style={[styles.cartItemName, { color: c.text }]} numberOfLines={2}>{i.product.name}</Text>
                      <Text style={[styles.cartItemPrice, { color: c.textMuted }]}>
                        {formatMoney(i.unitPrice)} للوحدة
                      </Text>
                      <MoneyText amount={lineTotal} tone="brand" size="callout" />
                    </View>
                  </View>
                );
              }}
              contentContainerStyle={{ padding: 12, gap: 8, paddingBottom: 120 }}
              ListEmptyComponent={
                <View style={styles.empty}>
                  <Feather name="shopping-cart" size={40} color={c.textFaint} />
                  <Text style={[styles.emptyText, { color: c.textMuted }]}>السلة فارغة</Text>
                  <AppButton label="اختر المنتجات" icon="package" size="md" onPress={() => setStep("products")} />
                </View>
              }
              showsVerticalScrollIndicator={false}
            />
          </KeyboardAvoidingView>
          {items.length > 0 && (
            <View style={[styles.cartBar, { backgroundColor: c.rail, borderTopColor: c.hairline, paddingBottom: insets.bottom + 12 }]}>
              <PressableScale
                style={[styles.nextBtn, { backgroundColor: c.brand, ...t.elevation.glow }]}
                onPress={() => setStep("payment")}
                haptic
              >
                <Text style={[styles.nextBtnText, { color: c.onBrand }]}>التالي</Text>
                <Feather name="arrow-left" size={18} color={c.onBrand} />
              </PressableScale>
              <View style={{ alignItems: "flex-end" }}>
                <MoneyText amount={total} size="title" />
                <Text style={[styles.cartSub, { color: c.textMuted }]}>{items.length} صنف • {totalUnits} وحدة</Text>
              </View>
            </View>
          )}
        </Animated.View>
      )}

      {step === "payment" && (
        <Animated.View style={{ flex: 1, opacity: stepFade }}>
          <ScrollView contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: insets.bottom + 24, flexGrow: 1, justifyContent: "center" }}>
            <View style={[styles.summaryCard, { backgroundColor: c.surface, borderColor: c.hairline }]}>
              <Text style={[styles.summaryLabel, { color: c.textMuted }]}>العميل</Text>
              <Text style={[styles.summaryVal, { color: c.text }]}>{selectedClient?.name}</Text>
              <View style={[styles.divider, { backgroundColor: c.hairline }]} />
              {items.map(i => (
                <View key={i.product.sync_id} style={styles.lineRow}>
                  <Text style={[styles.lineAmount, { color: c.text }]}>
                    {formatMoney(i.quantity * i.unitPrice)}
                  </Text>
                  <Text style={[styles.lineName, { color: c.textMuted }]} numberOfLines={1}>
                    {i.product.name} ({i.quantity % 1 === 0 ? i.quantity : i.quantity.toFixed(2)} × {formatMoney(i.unitPrice)})
                  </Text>
                </View>
              ))}
              <View style={[styles.divider, { backgroundColor: c.hairline }]} />
              <Text style={[styles.summaryLabel, { color: c.textMuted }]}>الإجمالي</Text>
              <MoneyText amount={total} tone="brand" size="display" />
            </View>

            <Text style={[styles.sectionTitle, { color: c.text }]}>طريقة الدفع</Text>
            <View style={styles.paymentRow}>
              {(["cash", "credit"] as const)
                .filter(pt => pt === "cash" || (user?.truckCanSellOnCredit !== false))
                .map(pt => {
                  const on = paymentType === pt;
                  return (
                    <PressableScale
                      key={pt}
                      style={[styles.paymentBtn, { backgroundColor: c.surface, borderColor: on ? c.brand : c.hairline, borderWidth: on ? 2 : 1.5, flex: 1 }]}
                      onPress={() => setPaymentType(pt)}
                    >
                      <View style={[styles.payIcon, { backgroundColor: on ? c.brand : c.brandTint }]}>
                        <Feather name={pt === "cash" ? "dollar-sign" : "credit-card"} size={22} color={on ? c.onBrand : c.brand} />
                      </View>
                      <Text style={[styles.paymentBtnText, { color: on ? c.brand : c.text }]}>{pt === "cash" ? "نقد" : "آجل"}</Text>
                      <Text style={[styles.payHint, { color: c.textFaint }]}>{pt === "cash" ? "يُحصّل الآن" : "على الحساب"}</Text>
                    </PressableScale>
                  );
                })}
            </View>

            <AppButton
              label={saving ? "جاري الحفظ..." : "حفظ الفاتورة"}
              icon="save"
              size="lg"
              fullWidth
              loading={saving}
              onPress={saveInvoice}
            />
          </ScrollView>
        </Animated.View>
      )}

      {/* ── Add-client modal ──────────────────────────────────────────────── */}
      <Modal
        visible={addClientOpen}
        transparent
        animationType="slide"
        onRequestClose={resetAddClientModal}
      >
        <TouchableWithoutFeedback onPress={resetAddClientModal}>
          <View style={[styles.modalOverlay, { backgroundColor: c.scrim }]} />
        </TouchableWithoutFeedback>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={styles.modalKav}
        >
          <View style={[styles.modalSheet, { backgroundColor: c.surface, borderColor: c.hairline, paddingBottom: insets.bottom + 16 }]}>
            {/* Handle */}
            <View style={[styles.modalHandle, { backgroundColor: c.hairline }]} />

            <Text style={[styles.modalTitle, { color: c.text }]}>زبون جديد</Text>

            {/* Name */}
            <View style={styles.modalField}>
              <Text style={[styles.modalLabel, { color: c.textMuted }]}>الاسم *</Text>
              <TextInput
                style={[styles.modalInput, { color: c.text, backgroundColor: c.bg, borderColor: c.hairline }]}
                value={newClientName}
                onChangeText={setNewClientName}
                placeholder="اسم الزبون"
                placeholderTextColor={c.textFaint}
                textAlign="right"
                autoFocus
                returnKeyType="next"
              />
            </View>

            {/* Phone */}
            <View style={styles.modalField}>
              <Text style={[styles.modalLabel, { color: c.textMuted }]}>الهاتف (اختياري)</Text>
              <TextInput
                style={[styles.modalInput, { color: c.text, backgroundColor: c.bg, borderColor: c.hairline }]}
                value={newClientPhone}
                onChangeText={setNewClientPhone}
                placeholder="0555 000 000"
                placeholderTextColor={c.textFaint}
                keyboardType="phone-pad"
                textAlign="right"
                returnKeyType="done"
              />
            </View>

            {/* Client type selector */}
            <View style={styles.modalField}>
              <Text style={[styles.modalLabel, { color: c.textMuted }]}>نوع العميل</Text>
              <View style={styles.tierRow}>
                {TIER_OPTIONS.map(opt => (
                  <PressableScale
                    key={opt.value}
                    style={[
                      styles.tierBtn,
                      {
                        backgroundColor: newClientType === opt.value ? c.brand : c.bg,
                        borderColor: newClientType === opt.value ? c.brand : c.hairline,
                      },
                    ]}
                    onPress={() => setNewClientType(opt.value)}
                  >
                    <Text style={[
                      styles.tierBtnText,
                      { color: newClientType === opt.value ? c.onBrand : c.text },
                    ]}>
                      {opt.label}
                    </Text>
                  </PressableScale>
                ))}
              </View>
            </View>

            {/* Actions */}
            <View style={styles.modalActions}>
              <AppButton label="إلغاء" variant="tonal" size="lg" onPress={resetAddClientModal} style={{ flex: 1 }} />
              <AppButton
                label={savingNewClient ? "جاري الحفظ..." : "حفظ وتحديد"}
                size="lg"
                loading={savingNewClient}
                disabled={!newClientName.trim()}
                onPress={saveNewClient}
                style={{ flex: 2 }}
              />
            </View>
          </View>
        </KeyboardAvoidingView>
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
  topBar: {
    flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1,
  },
  title: { fontSize: 17, fontFamily: fonts.bold },

  // Stepper
  steps: { paddingHorizontal: 30, paddingTop: 14, paddingBottom: 12, borderBottomWidth: 1 },
  stepRow: { flexDirection: "row-reverse", alignItems: "center" },
  stepNodeWrap: { flexDirection: "row-reverse", alignItems: "center", flex: 1 },
  stepDot: { width: 26, height: 26, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  stepDotText: { fontSize: 12, fontFamily: fonts.bold },
  stepTrack: { flex: 1, height: 3, borderRadius: 2, marginHorizontal: 6 },
  stepLabels: { flexDirection: "row-reverse", marginTop: 7 },
  stepLabel: { flex: 1, textAlign: "center", fontSize: 12, fontFamily: fonts.semibold },

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
  searchInput: { flex: 1, fontSize: 14, fontFamily: fonts.regular },
  clientRow: {
    flexDirection: "row-reverse", alignItems: "center", gap: 10,
    padding: 12, borderRadius: 12, borderWidth: 1,
  },
  clientName: { fontSize: 15, fontFamily: fonts.semibold },
  clientPhone: { fontSize: 12, fontFamily: fonts.regular },

  clientPill: {
    flexDirection: "row-reverse", alignItems: "center", gap: 8,
    marginHorizontal: 12, marginTop: 10, paddingHorizontal: 12, paddingVertical: 8,
    borderRadius: 12, borderWidth: 1,
  },
  clientPillText: { flex: 1, fontSize: 13, fontFamily: fonts.semibold, textAlign: "right" },

  catCard: {
    borderRadius: 16, borderWidth: 1.5, padding: 10, gap: 6, alignItems: "center",
  },
  catImageWrap: { width: "100%", alignItems: "center" },
  stockBadge: {
    position: "absolute", top: 4, left: 4, minWidth: 28, paddingHorizontal: 6, paddingVertical: 3,
    borderRadius: 8, borderWidth: 1, flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 3,
  },
  stockBadgeText: { fontSize: 10, fontFamily: fonts.bold },
  catName: { fontSize: 13, fontFamily: fonts.semibold, textAlign: "center", minHeight: 36, marginTop: 2 },
  selectTick: {
    position: "absolute", top: 4, right: 4, width: 24, height: 24, borderRadius: 12,
    alignItems: "center", justifyContent: "center",
  },
  tapHint: { fontSize: 12, fontFamily: fonts.regular, textAlign: "center", paddingVertical: 9 },

  inCartBadge: {
    flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 6,
    width: "100%", paddingVertical: 8, borderRadius: 10, borderWidth: 1.5,
  },
  inCartQty: { fontSize: 13, fontFamily: fonts.bold },

  // Cart screen
  cartItemRow: {
    flexDirection: "row-reverse", alignItems: "center", gap: 12,
    borderRadius: 14, borderWidth: 1, padding: 12,
  },
  cartItemName: { fontSize: 14, fontFamily: fonts.semibold, textAlign: "right" },
  cartItemPrice: { fontSize: 11, fontFamily: fonts.regular, marginVertical: 2 },
  cartQtyWrap: { alignItems: "center", gap: 2 },
  cartQtyInput: {
    width: 64, height: 48, borderRadius: 10, borderWidth: 1,
    fontSize: 18, fontFamily: fonts.bold,
  },
  cartQtyLabel: { fontSize: 10, fontFamily: fonts.regular },
  cartRemoveBtn: {
    width: 40, height: 40, borderRadius: 12,
    alignItems: "center", justifyContent: "center",
  },

  cartBar: {
    position: "absolute", left: 0, right: 0, bottom: 0,
    flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 16, paddingTop: 12, borderTopWidth: 1,
  },
  cartSub: { fontSize: 11, fontFamily: fonts.regular },
  nextBtn: { flexDirection: "row-reverse", alignItems: "center", gap: 6, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 12 },
  nextBtnText: { fontSize: 15, fontFamily: fonts.bold },

  empty: { alignItems: "center", paddingVertical: 60, gap: 12 },
  emptyText: { fontSize: 14, fontFamily: fonts.regular },

  summaryCard: { borderRadius: 16, borderWidth: 1, padding: 16, gap: 8 },
  summaryLabel: { fontSize: 12, fontFamily: fonts.regular },
  summaryVal: { fontSize: 15, fontFamily: fonts.semibold, textAlign: "right" },
  lineRow: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", gap: 8 },
  lineName: { flex: 1, fontSize: 12, fontFamily: fonts.regular, textAlign: "right" },
  lineAmount: { fontSize: 13, fontFamily: fonts.semibold, fontVariant: ["tabular-nums"] },
  divider: { height: 1 },
  sectionTitle: { fontSize: 15, fontFamily: fonts.bold, textAlign: "right" },
  paymentRow: { flexDirection: "row-reverse", gap: 12 },
  paymentBtn: {
    flexDirection: "column", alignItems: "center", justifyContent: "center",
    gap: 8, paddingVertical: 18, borderRadius: 18,
  },
  payIcon: { width: 46, height: 46, borderRadius: 14, alignItems: "center", justifyContent: "center", marginBottom: 2 },
  paymentBtnText: { fontSize: 16, fontFamily: fonts.bold },
  payHint: { fontSize: 11, fontFamily: fonts.regular },

  // ── Add-client modal ──────────────────────────────────────────────────────
  modalOverlay: { ...StyleSheet.absoluteFillObject },
  modalKav: { position: "absolute", left: 0, right: 0, bottom: 0 },
  modalSheet: {
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    borderWidth: 1, paddingHorizontal: 20, paddingTop: 12, gap: 14,
  },
  modalHandle: { width: 40, height: 4, borderRadius: 2, alignSelf: "center", marginBottom: 4 },
  modalTitle: { fontSize: 17, fontFamily: fonts.bold, textAlign: "right" },
  modalField: { gap: 6 },
  modalLabel: { fontSize: 12, fontFamily: fonts.regular, textAlign: "right" },
  modalInput: {
    height: 46, borderRadius: 10, borderWidth: 1,
    paddingHorizontal: 14, fontSize: 15, fontFamily: fonts.regular,
  },
  tierRow: { flexDirection: "row-reverse", gap: 8 },
  tierBtn: {
    flex: 1, paddingVertical: 10, borderRadius: 10, borderWidth: 1,
    alignItems: "center", justifyContent: "center",
  },
  tierBtnText: { fontSize: 13, fontFamily: fonts.semibold },
  modalActions: { flexDirection: "row-reverse", gap: 10, marginTop: 4 },
});
