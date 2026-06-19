import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import { useRefreshOnFocus } from "@/hooks/useRefreshOnFocus";
import { useCallback, useState } from "react";
import { FlatList, RefreshControl, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { SyncBar } from "@/components/SyncBar";
import { MoneyText, PressableScale, StatusPill } from "@/components/ui";
import { useSync } from "@/contexts/SyncContext";
import { getDb, Invoice } from "@/lib/db";
import { fonts } from "@/constants/tokens";
import { useTheme, type Theme } from "@/hooks/useTheme";

interface InvoiceRow extends Invoice {
  client_name?: string;
}

function InvoiceCard({ item, t }: { item: InvoiceRow; t: Theme }) {
  const c = t.color;
  const date = item.created_at ? new Date(item.created_at) : null;
  const isPending = (item._pending ?? 0) > 0;
  const isCredit = item.payment_type === "credit";
  return (
    <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.hairline }]}>
      <View style={styles.row}>
        <View style={[styles.avatar, { backgroundColor: isPending ? c.warningTint : c.successTint }]}>
          <Feather name={isPending ? "clock" : "check-circle"} size={18} color={isPending ? c.warning : c.success} />
        </View>
        <View style={{ flex: 1, alignItems: "flex-end" }}>
          <Text style={[styles.client, { color: c.text }]}>{item.client_name ?? "عميل غير معروف"}</Text>
          <Text style={[styles.date, { color: c.textMuted }]}>
            {date ? date.toLocaleDateString("ar-DZ") : "—"}
          </Text>
        </View>
        <View style={{ alignItems: "flex-end", gap: 4 }}>
          <MoneyText amount={item.total_amount ?? 0} size="callout" />
          <StatusPill status={isCredit ? "credit" : "paid"} />
        </View>
      </View>
    </View>
  );
}

export default function InvoicesScreen() {
  const t = useTheme();
  const c = t.color;
  const insets = useSafeAreaInsets();
  const { triggerSync } = useSync();
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const db = await getDb();
    if (!db) return;
    const rows = await db.getAllAsync<InvoiceRow>(
      `SELECT i.*, c.name as client_name FROM invoices i
       LEFT JOIN clients c ON (i.client_id IS NOT NULL AND i.client_id = c.id)
                           OR (i.client_sync_id IS NOT NULL AND i.client_sync_id = c.sync_id)
       WHERE i.is_deleted = 0 ORDER BY i.created_at DESC LIMIT 100`
    );
    setInvoices(rows);
  }, []);

  useRefreshOnFocus(load);

  const onRefresh = async () => {
    setRefreshing(true);
    triggerSync();
    await load();
    setRefreshing(false);
  };

  const handleNew = async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    router.push("/invoice/new");
  };

  return (
    <View style={[styles.container, { backgroundColor: c.bg }]}>
      <SyncBar />
      <FlatList
        data={invoices}
        keyExtractor={i => i.sync_id}
        renderItem={({ item }) => (
          <PressableScale onPress={() => router.push(`/invoice/${item.sync_id}`)}>
            <InvoiceCard item={item} t={t} />
          </PressableScale>
        )}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.brand} />}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Feather name="file-text" size={40} color={c.textFaint} />
            <Text style={[styles.emptyText, { color: c.textMuted }]}>لا توجد فواتير</Text>
          </View>
        }
        showsVerticalScrollIndicator={false}
      />
      <PressableScale
        style={[styles.fab, { backgroundColor: c.brand, bottom: insets.bottom + 74, ...t.elevation.glow }]}
        onPress={handleNew}
        haptic
      >
        <Feather name="plus" size={20} color={c.onBrand} />
        <Text style={[styles.fabText, { color: c.onBrand }]}>بيع جديد</Text>
      </PressableScale>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  list: { paddingHorizontal: 12, paddingBottom: 100, gap: 8, paddingTop: 8 },
  card: { borderRadius: 14, borderWidth: 1, padding: 14 },
  row: { flexDirection: "row-reverse", alignItems: "center", gap: 10 },
  avatar: { width: 40, height: 40, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  client: { fontSize: 15, fontFamily: fonts.semibold },
  date: { fontSize: 12, fontFamily: fonts.regular },
  empty: { alignItems: "center", paddingVertical: 80, gap: 12 },
  emptyText: { fontSize: 14, fontFamily: fonts.regular },
  fab: {
    position: "absolute", alignSelf: "center",
    flexDirection: "row-reverse", alignItems: "center", gap: 8,
    paddingHorizontal: 22, height: 52, borderRadius: 26,
  },
  fabText: { fontSize: 15, fontFamily: fonts.bold },
});
