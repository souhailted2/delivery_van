import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { FlatList, RefreshControl, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SyncBar } from "@/components/SyncBar";
import { useSync } from "@/contexts/SyncContext";
import { getDb, Invoice } from "@/lib/db";
import { useColors } from "@/hooks/useColors";

interface InvoiceRow extends Invoice {
  client_name?: string;
}

function InvoiceCard({ item, colors }: { item: InvoiceRow; colors: any }) {
  const date = item.created_at ? new Date(item.created_at) : null;
  const isPending = (item._pending ?? 0) > 0;
  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={styles.row}>
        <View style={[styles.avatar, { backgroundColor: isPending ? colors.warning + "22" : colors.success + "22" }]}>
          <Feather name={isPending ? "clock" : "check-circle"} size={18} color={isPending ? colors.warning : colors.success} />
        </View>
        <View style={{ flex: 1, alignItems: "flex-end" }}>
          <Text style={[styles.client, { color: colors.foreground }]}>{item.client_name ?? "عميل غير معروف"}</Text>
          <Text style={[styles.date, { color: colors.mutedForeground }]}>
            {date ? date.toLocaleDateString("ar-DZ") : "—"}
          </Text>
        </View>
        <View style={{ alignItems: "flex-end" }}>
          <Text style={[styles.amount, { color: colors.foreground }]}>
            {Number(item.total_amount ?? 0).toLocaleString("fr-DZ")} د.ج
          </Text>
          <View style={[
            styles.badge,
            { backgroundColor: item.payment_type === "credit" ? colors.warning + "22" : colors.success + "22" }
          ]}>
            <Text style={[styles.badgeText, { color: item.payment_type === "credit" ? colors.warning : colors.success }]}>
              {item.payment_type === "credit" ? "آجل" : "نقد"}
            </Text>
          </View>
        </View>
      </View>
    </View>
  );
}

export default function InvoicesScreen() {
  const colors = useColors();
  const { triggerSync } = useSync();
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const db = await getDb();
    if (!db) return;
    const rows = await db.getAllAsync<InvoiceRow>(
      `SELECT i.*, c.name as client_name FROM invoices i
       LEFT JOIN clients c ON i.client_id = c.id OR i.client_sync_id = c.sync_id
       WHERE i.is_deleted = 0 ORDER BY i.created_at DESC LIMIT 100`
    );
    setInvoices(rows);
  }, []);

  useEffect(() => { load(); }, []);

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
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <SyncBar />
      <FlatList
        data={invoices}
        keyExtractor={i => i.sync_id}
        renderItem={({ item }) => <InvoiceCard item={item} colors={colors} />}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Feather name="file-text" size={40} color={colors.muted} />
            <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>لا توجد فواتير</Text>
          </View>
        }
        showsVerticalScrollIndicator={false}
      />
      <TouchableOpacity
        style={[styles.fab, { backgroundColor: colors.primary }]}
        onPress={handleNew}
        activeOpacity={0.8}
      >
        <Feather name="plus" size={26} color="#fff" />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  list: { paddingHorizontal: 12, paddingBottom: 90, gap: 8, paddingTop: 8 },
  card: { borderRadius: 14, borderWidth: 1, padding: 14 },
  row: { flexDirection: "row-reverse", alignItems: "center", gap: 10 },
  avatar: { width: 40, height: 40, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  client: { fontSize: 15, fontFamily: "Cairo_600SemiBold" },
  date: { fontSize: 12, fontFamily: "Cairo_400Regular" },
  amount: { fontSize: 15, fontFamily: "Cairo_700Bold" },
  badge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8, marginTop: 4 },
  badgeText: { fontSize: 11, fontFamily: "Cairo_600SemiBold" },
  empty: { alignItems: "center", paddingVertical: 80, gap: 12 },
  emptyText: { fontSize: 14, fontFamily: "Cairo_400Regular" },
  fab: {
    position: "absolute", bottom: 24, left: "50%",
    width: 58, height: 58, borderRadius: 29,
    alignItems: "center", justifyContent: "center",
    elevation: 6, shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.25, shadowRadius: 6,
    transform: [{ translateX: -29 }],
  },
});
