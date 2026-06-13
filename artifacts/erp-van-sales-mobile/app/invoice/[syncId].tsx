import { Feather } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { useRefreshOnFocus } from "@/hooks/useRefreshOnFocus";
import { useCallback, useState } from "react";
import {
  ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { getDb, Invoice } from "@/lib/db";
import { printInvoiceReceipt, ReceiptInvoice } from "@/lib/receipt";
import { useColors } from "@/hooks/useColors";

interface InvoiceDetail extends Invoice {
  client_name?: string;
  truck_name?: string;
}
interface ItemRow {
  sync_id: string;
  product_name: string;
  quantity: number;
  unit_price: number;
  subtotal: number;
  price_type?: string;
}

const TIER_LABEL: Record<string, string> = {
  retail: "تجزئة", half_wholesale: "نصف جملة", wholesale: "جملة",
};
const fmt = (n: number) => Number(n ?? 0).toLocaleString("fr-DZ") + " د.ج";

export default function InvoiceDetailScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { syncId } = useLocalSearchParams<{ syncId: string }>();

  const [invoice, setInvoice] = useState<InvoiceDetail | null>(null);
  const [items, setItems] = useState<ItemRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [printing, setPrinting] = useState(false);

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
        `SELECT sync_id, product_name, quantity, unit_price, subtotal, price_type
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
        invoiceNumber: invoice.id ? String(invoice.id) : `MOB-${invoice.sync_id.slice(-6).toUpperCase()}`,
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
      Alert.alert("خطأ", e?.message ?? "تعذّرت الطباعة");
    } finally {
      setPrinting(false);
    }
  };

  const isCredit = invoice?.payment_type === "credit";

  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      <View style={[styles.topBar, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()}>
          <Feather name="arrow-right" size={22} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.foreground }]}>تفاصيل الفاتورة</Text>
        <View style={{ width: 22 }} />
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={colors.primary} /></View>
      ) : !invoice ? (
        <View style={styles.center}>
          <Feather name="file-text" size={40} color={colors.muted} />
          <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>الفاتورة غير موجودة</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: insets.bottom + 100 }}>
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.rowBetween}>
              <View style={[styles.badge, { backgroundColor: isCredit ? colors.warning + "22" : colors.success + "22" }]}>
                <Text style={[styles.badgeText, { color: isCredit ? colors.warning : colors.success }]}>
                  {isCredit ? "آجل" : "نقد"}
                </Text>
              </View>
              <Text style={[styles.invNo, { color: colors.foreground }]}>
                {invoice.id ? `#${invoice.id}` : `MOB-${invoice.sync_id.slice(-6).toUpperCase()}`}
              </Text>
            </View>
            <View style={[styles.divider, { backgroundColor: colors.border }]} />
            <DetailRow label="العميل" value={invoice.client_name ?? "—"} colors={colors} />
            <DetailRow label="الشاحنة" value={invoice.truck_name ?? "—"} colors={colors} />
            <DetailRow
              label="التاريخ"
              value={invoice.created_at ? new Date(invoice.created_at).toLocaleString("ar-DZ") : "—"}
              colors={colors}
            />
          </View>

          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>المنتجات ({items.length})</Text>
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, gap: 0, padding: 0 }]}>
            {items.map((it, idx) => (
              <View
                key={it.sync_id}
                style={[styles.itemRow, idx < items.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.border }]}
              >
                <Text style={[styles.itemAmount, { color: colors.foreground }]}>{fmt(it.subtotal)}</Text>
                <View style={{ flex: 1, alignItems: "flex-end" }}>
                  <Text style={[styles.itemName, { color: colors.foreground }]}>{it.product_name}</Text>
                  <Text style={[styles.itemSub, { color: colors.mutedForeground }]}>
                    {it.quantity} × {fmt(it.unit_price)}
                    {it.price_type ? ` • ${TIER_LABEL[it.price_type] ?? it.price_type}` : ""}
                  </Text>
                </View>
              </View>
            ))}
          </View>

          <View style={[styles.totalCard, { backgroundColor: colors.primary }]}>
            <Text style={styles.totalVal}>{fmt(invoice.total_amount ?? 0)}</Text>
            <Text style={styles.totalLabel}>الإجمالي</Text>
          </View>
        </ScrollView>
      )}

      {invoice && (
        <View style={[styles.bottomBar, { backgroundColor: colors.background, borderTopColor: colors.border, paddingBottom: insets.bottom + 12 }]}>
          <TouchableOpacity
            style={[styles.printBtn, { backgroundColor: printing ? colors.muted : colors.primary }]}
            onPress={handlePrint}
            disabled={printing}
            activeOpacity={0.85}
          >
            <Feather name="printer" size={20} color="#fff" />
            <Text style={styles.printBtnText}>{printing ? "جاري التحضير..." : "طباعة / إعادة طباعة الإيصال"}</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

function DetailRow({ label, value, colors }: { label: string; value: string; colors: any }) {
  return (
    <View style={styles.detailRow}>
      <Text style={[styles.detailVal, { color: colors.foreground }]}>{value}</Text>
      <Text style={[styles.detailLabel, { color: colors.mutedForeground }]}>{label}</Text>
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
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  emptyText: { fontSize: 14, fontFamily: "Cairo_400Regular" },
  card: { borderRadius: 14, borderWidth: 1, padding: 14, gap: 8 },
  rowBetween: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between" },
  invNo: { fontSize: 16, fontFamily: "Cairo_700Bold" },
  badge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 8 },
  badgeText: { fontSize: 12, fontFamily: "Cairo_600SemiBold" },
  divider: { height: 1, marginVertical: 2 },
  detailRow: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between" },
  detailLabel: { fontSize: 13, fontFamily: "Cairo_400Regular" },
  detailVal: { fontSize: 14, fontFamily: "Cairo_600SemiBold", flex: 1, textAlign: "left" },
  sectionTitle: { fontSize: 15, fontFamily: "Cairo_700Bold", textAlign: "right" },
  itemRow: { flexDirection: "row-reverse", alignItems: "center", gap: 10, padding: 14 },
  itemName: { fontSize: 14, fontFamily: "Cairo_600SemiBold" },
  itemSub: { fontSize: 12, fontFamily: "Cairo_400Regular", marginTop: 2 },
  itemAmount: { fontSize: 14, fontFamily: "Cairo_700Bold" },
  totalCard: {
    flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between",
    borderRadius: 14, padding: 18,
  },
  totalVal: { color: "#fff", fontSize: 22, fontFamily: "Cairo_700Bold" },
  totalLabel: { color: "#ffffffcc", fontSize: 14, fontFamily: "Cairo_600SemiBold" },
  bottomBar: { position: "absolute", left: 0, right: 0, bottom: 0, paddingHorizontal: 16, paddingTop: 12, borderTopWidth: 1 },
  printBtn: {
    flexDirection: "row-reverse", alignItems: "center", justifyContent: "center",
    gap: 10, paddingVertical: 15, borderRadius: 14,
  },
  printBtnText: { color: "#fff", fontSize: 16, fontFamily: "Cairo_700Bold" },
});
