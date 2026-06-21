import { Feather } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { useRefreshOnFocus } from "@/hooks/useRefreshOnFocus";
import { useCallback, useState } from "react";
import {
  ActivityIndicator, KeyboardAvoidingView, Modal, Platform, ScrollView,
  StyleSheet, Text, TextInput, TouchableWithoutFeedback, View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppButton, MoneyText, PressableScale, ResultDialog, StatusPill } from "@/components/ui";
import type { DialogAction, ResultVariant } from "@/components/ui";
import { useSync } from "@/contexts/SyncContext";
import { getDb, Invoice } from "@/lib/db";
import { formatMoney } from "@/lib/money";
import { printInvoiceReceipt, ReceiptInvoice } from "@/lib/receipt";
import { createReturn } from "@/lib/txn";
import { fonts } from "@/constants/tokens";
import { useTheme, type Theme } from "@/hooks/useTheme";

interface InvoiceDetail extends Invoice {
  client_name?: string;
  truck_name?: string;
}
interface ItemRow {
  sync_id: string;
  product_id: number | null;
  product_sync_id: string | null;
  product_name: string;
  quantity: number;
  unit_price: number;
  subtotal: number;
  price_type?: string;
}

const TIER_LABEL: Record<string, string> = {
  retail: "تجزئة", half_wholesale: "نصف جملة", wholesale: "جملة",
};

export default function InvoiceDetailScreen() {
  const t = useTheme();
  const c = t.color;
  const insets = useSafeAreaInsets();
  const { syncId } = useLocalSearchParams<{ syncId: string }>();
  const { triggerSync, bumpLocalVersion } = useSync();

  const [invoice, setInvoice] = useState<InvoiceDetail | null>(null);
  const [items, setItems] = useState<ItemRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [printing, setPrinting] = useState(false);

  // مرتجع / إلغاء
  const [returnOpen, setReturnOpen] = useState(false);
  const [returnQty, setReturnQty] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  // Branded dialog (replaces native Alert.alert).
  const [dialog, setDialog] = useState<{ visible: boolean; variant: ResultVariant; title: string; message?: string; actions?: DialogAction[] }>(
    { visible: false, variant: "info", title: "" }
  );
  const showDialog = (variant: ResultVariant, title: string, message?: string, actions?: DialogAction[]) =>
    setDialog({ visible: true, variant, title, message, actions });
  const hideDialog = () => setDialog((d) => ({ ...d, visible: false }));

  const load = useCallback(async () => {
    const db = await getDb();
    if (!db) { setLoading(false); return; }
    const inv = await db.getFirstAsync<InvoiceDetail>(
      `SELECT i.*, c.name as client_name, t.name as truck_name
       FROM invoices i
       LEFT JOIN clients c ON i.client_id = c.id OR i.client_sync_id = c.sync_id
       LEFT JOIN trucks t ON i.truck_id = t.id
       WHERE i.sync_id = ? AND i.is_deleted = 0`,
      [syncId]
    );
    setInvoice(inv ?? null);
    if (inv) {
      const rows = await db.getAllAsync<ItemRow>(
        `SELECT sync_id, product_id, product_sync_id, product_name, quantity, unit_price, subtotal, price_type
         FROM invoice_items
         WHERE invoice_sync_id = ? OR invoice_id = ?
         ORDER BY _lid`,
        [syncId, inv.id ?? -1]
      );
      setItems(rows);
    }
    setLoading(false);
  }, [syncId]);

  useRefreshOnFocus(load);

  const handlePrint = async () => {
    if (!invoice) return;
    setPrinting(true);
    try {
      const receipt: ReceiptInvoice = {
        invoiceNumber: invoice.invoice_number ?? (invoice.id ? `#${invoice.id}` : `MOB-${invoice.sync_id.slice(-6).toUpperCase()}`),
        createdAt: invoice.created_at ?? new Date().toISOString(),
        clientName: invoice.client_name ?? "عميل غير معروف",
        truckName: invoice.truck_name ?? "—",
        paymentType: invoice.payment_type ?? "cash",
        totalAmount: Number(invoice.total_amount ?? 0),
        items: items.map(i => ({
          productName: i.product_name,
          priceType: i.price_type ?? "retail",
          quantity: Number(i.quantity ?? 0),
          unitPrice: Number(i.unit_price ?? 0),
          subtotal: Number(i.subtotal ?? 0),
        })),
      };
      await printInvoiceReceipt(receipt);
    } catch (e: any) {
      showDialog("error", "خطأ", e?.message ?? "تعذّرت الطباعة");
    } finally {
      setPrinting(false);
    }
  };

  const submitReturn = async (type: "void" | "client_return") => {
    if (!invoice) return;
    const lines = (type === "void"
      ? items.map(it => ({
          product_id: it.product_id, product_name: it.product_name,
          quantity: Number(it.quantity), unit_price: Number(it.unit_price),
        }))
      : items.map(it => ({
          product_id: it.product_id, product_name: it.product_name,
          quantity: Math.min(parseFloat((returnQty[it.sync_id] ?? "").replace(",", ".")) || 0, Number(it.quantity)),
          unit_price: Number(it.unit_price),
        }))
    ).filter(l => l.quantity > 0);

    if (!lines.length) {
      showDialog("warning", "تنبيه", "أدخل كمية مرتجعة لمنتج واحد على الأقل");
      return;
    }
    setSubmitting(true);
    try {
      const ok = await createReturn({
        type,
        invoice: {
          sync_id: invoice.sync_id, id: invoice.id ?? null,
          client_id: invoice.client_id ?? null, client_sync_id: invoice.client_sync_id ?? null,
          payment_type: invoice.payment_type ?? "cash",
        },
        truckId: invoice.truck_id ?? null,
        truckSyncId: invoice.truck_sync_id ?? null,
        lines,
      });
      if (!ok) { showDialog("error", "خطأ", "تعذّر تنفيذ العملية"); return; }
      setReturnOpen(false);
      setReturnQty({});
      bumpLocalVersion();
      triggerSync();
      if (type === "void") {
        showDialog("success", "تم الإلغاء", "أُلغيت الفاتورة وأُعيدت الكمية إلى مخزون الشاحنة.",
          [{ label: "حسناً", onPress: () => router.back() }]);
      } else {
        showDialog("success", "تم المرتجع", "سُجّل المرتجع وأُعيدت الكمية إلى مخزون الشاحنة.",
          [{ label: "حسناً", onPress: () => load() }]);
      }
    } catch (e: any) {
      showDialog("error", "خطأ", e?.message ?? "فشلت العملية");
    } finally {
      setSubmitting(false);
    }
  };

  const isCredit = invoice?.payment_type === "credit";

  return (
    <View style={[styles.container, { backgroundColor: c.bg, paddingTop: insets.top }]}>
      <View style={[styles.topBar, { backgroundColor: c.rail, borderBottomColor: c.hairline }]}>
        <PressableScale onPress={() => router.back()} hitSlop={10} accessibilityLabel="رجوع">
          <Feather name="arrow-right" size={22} color={c.text} />
        </PressableScale>
        <Text style={[styles.title, { color: c.text }]}>تفاصيل الفاتورة</Text>
        <View style={{ width: 22 }} />
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={c.brand} /></View>
      ) : !invoice ? (
        <View style={styles.center}>
          <Feather name="file-text" size={40} color={c.textFaint} />
          <Text style={[styles.emptyText, { color: c.textMuted }]}>الفاتورة غير موجودة</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: insets.bottom + 100 }}>
          <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.hairline }]}>
            <View style={styles.rowBetween}>
              <StatusPill status={isCredit ? "credit" : "paid"} />
              <Text style={[styles.invNo, { color: c.text }]}>
                {invoice.invoice_number ?? (invoice.id ? `#${invoice.id}` : `MOB-${invoice.sync_id.slice(-6).toUpperCase()}`)}
              </Text>
            </View>
            <View style={[styles.divider, { backgroundColor: c.hairline }]} />
            <DetailRow label="العميل" value={invoice.client_name ?? "—"} t={t} />
            <DetailRow label="الشاحنة" value={invoice.truck_name ?? "—"} t={t} />
            <DetailRow
              label="التاريخ"
              value={invoice.created_at ? new Date(invoice.created_at).toLocaleString("ar-DZ") : "—"}
              t={t}
            />
          </View>

          <Text style={[styles.sectionTitle, { color: c.text }]}>المنتجات ({items.length})</Text>
          <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.hairline, gap: 0, padding: 0 }]}>
            {items.map((it, idx) => (
              <View
                key={it.sync_id}
                style={[styles.itemRow, idx < items.length - 1 && { borderBottomWidth: 1, borderBottomColor: c.hairline }]}
              >
                <MoneyText amount={it.subtotal} size="bodyStrong" />
                <View style={{ flex: 1, alignItems: "flex-end" }}>
                  <Text style={[styles.itemName, { color: c.text }]}>{it.product_name}</Text>
                  <Text style={[styles.itemSub, { color: c.textMuted }]}>
                    {it.quantity} × {formatMoney(it.unit_price)}
                    {it.price_type ? ` • ${TIER_LABEL[it.price_type] ?? it.price_type}` : ""}
                  </Text>
                </View>
              </View>
            ))}
          </View>

          <View style={[styles.totalCard, { backgroundColor: c.brand, ...t.elevation.glow }]}>
            <Text style={[styles.totalVal, { color: c.onBrand }]}>{formatMoney(invoice.total_amount ?? 0)}</Text>
            <Text style={[styles.totalLabel, { color: c.onBrand }]}>الإجمالي</Text>
          </View>
        </ScrollView>
      )}

      {invoice && (
        <View style={[styles.bottomBar, { backgroundColor: c.rail, borderTopColor: c.hairline, paddingBottom: insets.bottom + 12 }]}>
          <View style={{ gap: 10 }}>
            <AppButton
              label={printing ? "جاري التحضير..." : "طباعة / إعادة طباعة الإيصال"}
              icon="printer"
              size="lg"
              fullWidth
              loading={printing}
              disabled={printing}
              onPress={handlePrint}
            />
            <AppButton
              label="مرتجع / إلغاء الفاتورة"
              icon="rotate-ccw"
              variant="tonal"
              size="lg"
              fullWidth
              onPress={() => { setReturnQty({}); setReturnOpen(true); }}
            />
          </View>
        </View>
      )}

      {/* مرتجع / إلغاء sheet */}
      <Modal visible={returnOpen} transparent animationType="slide" statusBarTranslucent onRequestClose={() => setReturnOpen(false)}>
        <TouchableWithoutFeedback onPress={() => setReturnOpen(false)}>
          <View style={[styles.overlay, { backgroundColor: c.scrim }]} />
        </TouchableWithoutFeedback>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.sheetWrap}>
          <View style={[styles.sheet, { backgroundColor: c.surface, borderColor: c.hairline, paddingBottom: insets.bottom + 16 }]}>
            <View style={[styles.handle, { backgroundColor: c.hairline }]} />
            <Text style={[styles.modalTitle, { color: c.text }]}>مرتجع / إلغاء الفاتورة</Text>
            <Text style={[styles.modalHint, { color: c.textMuted }]}>
              أدخل الكمية المرتجعة لكل منتج، أو ألغِ الفاتورة كاملة. تُعاد الكمية لمخزون الشاحنة.
            </Text>
            <ScrollView style={{ maxHeight: 300 }} keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 8, paddingVertical: 4 }}>
              {items.map(it => (
                <View key={it.sync_id} style={[styles.retRow, { borderColor: c.hairline }]}>
                  <TextInput
                    style={[styles.retQty, { color: c.text, backgroundColor: c.bg, borderColor: c.hairline }]}
                    value={returnQty[it.sync_id] ?? ""}
                    onChangeText={(v) => setReturnQty(p => ({ ...p, [it.sync_id]: v }))}
                    keyboardType="numeric" textAlign="center" placeholder="0" placeholderTextColor={c.textFaint}
                  />
                  <View style={{ flex: 1, alignItems: "flex-end" }}>
                    <Text style={[styles.itemName, { color: c.text }]} numberOfLines={1}>{it.product_name}</Text>
                    <Text style={[styles.itemSub, { color: c.textMuted }]}>المباع: {it.quantity} × {formatMoney(it.unit_price)}</Text>
                  </View>
                </View>
              ))}
            </ScrollView>
            <View style={styles.retActions}>
              <AppButton label="إلغاء الكل" variant="danger" size="lg" loading={submitting} onPress={() => submitReturn("void")} style={{ flex: 1 }} />
              <AppButton label="إرجاع المحدد" variant="primary" size="lg" loading={submitting} onPress={() => submitReturn("client_return")} style={{ flex: 1 }} />
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

function DetailRow({ label, value, t }: { label: string; value: string; t: Theme }) {
  const c = t.color;
  return (
    <View style={styles.detailRow}>
      <Text style={[styles.detailVal, { color: c.text }]}>{value}</Text>
      <Text style={[styles.detailLabel, { color: c.textMuted }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  bottomBar: { paddingHorizontal: 16, paddingTop: 12, borderTopWidth: 1 },
  topBar: {
    flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1,
  },
  title: { fontSize: 17, fontFamily: fonts.bold },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  emptyText: { fontSize: 14, fontFamily: fonts.regular },
  card: { borderRadius: 14, borderWidth: 1, padding: 14, gap: 8 },
  rowBetween: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between" },
  invNo: { fontSize: 16, fontFamily: fonts.bold },
  divider: { height: 1, marginVertical: 2 },
  detailRow: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between" },
  detailLabel: { fontSize: 13, fontFamily: fonts.regular },
  detailVal: { fontSize: 14, fontFamily: fonts.semibold, flex: 1, textAlign: "left" },
  sectionTitle: { fontSize: 15, fontFamily: fonts.bold, textAlign: "right" },
  itemRow: { flexDirection: "row-reverse", alignItems: "center", gap: 10, padding: 14 },
  itemName: { fontSize: 14, fontFamily: fonts.semibold },
  itemSub: { fontSize: 12, fontFamily: fonts.regular, marginTop: 2 },
  totalCard: {
    flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between",
    borderRadius: 14, padding: 18,
  },
  totalVal: { fontSize: 22, fontFamily: fonts.bold },
  totalLabel: { fontSize: 14, fontFamily: fonts.semibold },
  overlay: { ...StyleSheet.absoluteFillObject },
  sheetWrap: { position: "absolute", left: 0, right: 0, bottom: 0 },
  sheet: { borderTopLeftRadius: 22, borderTopRightRadius: 22, borderWidth: 1, borderBottomWidth: 0, padding: 16, gap: 10 },
  handle: { width: 40, height: 4, borderRadius: 2, alignSelf: "center", marginBottom: 2 },
  modalTitle: { fontSize: 18, fontFamily: fonts.bold, textAlign: "right" },
  modalHint: { fontSize: 12, fontFamily: fonts.regular, textAlign: "right" },
  retRow: { flexDirection: "row-reverse", alignItems: "center", gap: 10, borderWidth: 1, borderRadius: 12, padding: 10 },
  retQty: { width: 64, height: 46, borderRadius: 10, borderWidth: 1, fontSize: 17, fontFamily: fonts.bold },
  retActions: { flexDirection: "row-reverse", gap: 10, marginTop: 4 },
});
