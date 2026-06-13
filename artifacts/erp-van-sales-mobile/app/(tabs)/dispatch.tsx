import { Feather } from "@expo/vector-icons";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator, FlatList, Pressable, RefreshControl,
  StyleSheet, Text, View, Alert,
} from "react-native";
import { SyncBar } from "@/components/SyncBar";
import { useAuth } from "@/contexts/AuthContext";
import { useColors } from "@/hooks/useColors";
import { apiFetch } from "@/lib/api";
import { getDb } from "@/lib/db";

interface DispatchItem {
  productId: number;
  productName: string;
  quantity: number;
  unit: string;
  sellingPriceRetail: number;
}

interface Dispatch {
  id: number;
  truckId: number;
  status: string;
  stockItems: DispatchItem[];
  note: string | null;
  createdAt: string;
  receivedAt: string | null;
}

function StatusBadge({ status, colors }: { status: string; colors: any }) {
  const config = status === "pending"
    ? { label: "معلّق", icon: "clock" as const, color: "#d97706", bg: "#fef3c7" }
    : status === "received"
    ? { label: "تم الاستلام", icon: "check-circle" as const, color: "#059669", bg: "#d1fae5" }
    : { label: "مغلق", icon: "x-circle" as const, color: colors.mutedForeground, bg: colors.muted };

  return (
    <View style={[styles.badge, { backgroundColor: config.bg }]}>
      <Feather name={config.icon} size={12} color={config.color} />
      <Text style={[styles.badgeText, { color: config.color }]}>{config.label}</Text>
    </View>
  );
}

export default function DispatchScreen() {
  const colors = useColors();
  const { user } = useAuth();
  const [inbox, setInbox] = useState<Dispatch | null | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [receiving, setReceiving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await apiFetch("/dispatches/inbox");
      if (r.ok) {
        const data = await r.json();
        setInbox(data);
        setError(false);
      } else if (r.status === 404) {
        setInbox(null);
        setError(false);
      } else {
        setError(true);
      }
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const receiveDispatch = async () => {
    if (!inbox) return;
    Alert.alert(
      "استلام البضاعة",
      `هل تأكد استلام ${inbox.stockItems.length} صنف؟ سيتم إضافتها لمخزون شاحنتك.`,
      [
        { text: "إلغاء", style: "cancel" },
        {
          text: "استلم",
          onPress: async () => {
            setReceiving(true);
            try {
              const r = await apiFetch(`/dispatches/${inbox.id}/receive`, { method: "POST" });
              if (r.ok) {
                const { stock } = await r.json();
                const db = await getDb();
                if (db && stock) {
                  for (const s of stock) {
                    const existing = await db.getFirstAsync<{ _lid: number }>(
                      "SELECT _lid FROM truck_stock WHERE product_id = ? AND truck_id = ?",
                      [s.productId, inbox.truckId]
                    );
                    if (existing) {
                      await db.runAsync(
                        "UPDATE truck_stock SET quantity = ?, updated_at = ? WHERE _lid = ?",
                        [s.quantity, new Date().toISOString(), existing._lid]
                      );
                    } else {
                      await db.runAsync(
                        "INSERT INTO truck_stock (sync_id, product_id, truck_id, quantity, updated_at) VALUES (?, ?, ?, ?, ?)",
                        [
                          `ts-${s.productId}-${Date.now()}`,
                          s.productId,
                          inbox.truckId,
                          s.quantity,
                          new Date().toISOString(),
                        ]
                      );
                    }
                  }
                }
                await load();
                Alert.alert("✅ تم الاستلام", "تم تحديث مخزون شاحنتك بنجاح.");
              } else {
                const err = await r.json();
                Alert.alert("خطأ", err.error || "فشل الاستلام");
              }
            } catch {
              Alert.alert("خطأ", "تأكد من الاتصال بالإنترنت");
            } finally {
              setReceiving(false);
            }
          },
        },
      ]
    );
  };

  if (loading) {
    return (
      <View style={[styles.container, styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <SyncBar />
      <FlatList
        data={[]}
        keyExtractor={() => ""}
        renderItem={null}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
        ListHeaderComponent={
          <View style={styles.content}>
            {/* Header */}
            <View style={[styles.headerCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={[styles.iconWrap, { backgroundColor: colors.primary + "20" }]}>
                <Feather name="download" size={28} color={colors.primary} />
              </View>
              <Text style={[styles.headerTitle, { color: colors.foreground }]}>استلام البضاعة</Text>
              <Text style={[styles.headerSub, { color: colors.mutedForeground }]}>
                عند وجود إنترنت، اسحب للتحديث لرؤية البضاعة المرسلة من الإدارة
              </Text>
            </View>

            {error ? (
              <View style={[styles.emptyCard, { backgroundColor: colors.card, borderColor: "#fca5a5" }]}>
                <Feather name="wifi-off" size={36} color="#ef4444" />
                <Text style={[styles.emptyTitle, { color: "#ef4444" }]}>فشل الاتصال بالخادم</Text>
                <Text style={[styles.emptySub, { color: colors.mutedForeground }]}>
                  تأكد من الاتصال بالإنترنت أو تواصل مع الإدارة لإعادة تسجيل الدخول
                </Text>
                <Pressable
                  style={[styles.retryBtn, { backgroundColor: colors.primary }]}
                  onPress={() => { setLoading(true); load(); }}
                >
                  <Feather name="refresh-cw" size={15} color="#fff" />
                  <Text style={styles.retryBtnText}>إعادة المحاولة</Text>
                </Pressable>
              </View>
            ) : inbox === null || inbox === undefined ? (
              <View style={[styles.emptyCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Feather name="inbox" size={36} color={colors.muted} />
                <Text style={[styles.emptyTitle, { color: colors.foreground }]}>لا يوجد تحميل جديد</Text>
                <Text style={[styles.emptySub, { color: colors.mutedForeground }]}>
                  اسحب للأسفل للتحقق من وجود بضاعة جديدة من الإدارة
                </Text>
              </View>
            ) : (
              <View style={[styles.dispatchCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <View style={styles.dispatchHeader}>
                  <StatusBadge status={inbox.status} colors={colors} />
                  <Text style={[styles.dispatchDate, { color: colors.mutedForeground }]}>
                    {new Date(inbox.createdAt).toLocaleDateString("ar-DZ")}
                  </Text>
                </View>

                {inbox.note && (
                  <View style={[styles.noteBox, { backgroundColor: colors.primary + "10", borderColor: colors.primary + "30" }]}>
                    <Feather name="message-circle" size={13} color={colors.primary} />
                    <Text style={[styles.noteText, { color: colors.foreground }]}>{inbox.note}</Text>
                  </View>
                )}

                <Text style={[styles.itemsTitle, { color: colors.foreground }]}>
                  البضاعة المرسلة ({inbox.stockItems.length} صنف)
                </Text>

                {inbox.stockItems.map((item, idx) => (
                  <View key={idx} style={[styles.itemRow, { borderBottomColor: colors.border }]}>
                    <View style={[styles.itemIcon, { backgroundColor: colors.primary + "15" }]}>
                      <Feather name="box" size={14} color={colors.primary} />
                    </View>
                    <Text style={[styles.itemName, { color: colors.foreground }]} numberOfLines={1}>
                      {item.productName}
                    </Text>
                    <View style={styles.itemQty}>
                      <Text style={[styles.itemQtyNum, { color: colors.primary }]}>{item.quantity}</Text>
                      <Text style={[styles.itemUnit, { color: colors.mutedForeground }]}>{item.unit}</Text>
                    </View>
                  </View>
                ))}

                {inbox.status === "pending" && (
                  <Pressable
                    style={({ pressed }) => [
                      styles.receiveBtn,
                      { backgroundColor: colors.primary, opacity: pressed || receiving ? 0.8 : 1 },
                    ]}
                    onPress={receiveDispatch}
                    disabled={receiving}
                  >
                    {receiving ? (
                      <ActivityIndicator color="#fff" size="small" />
                    ) : (
                      <>
                        <Feather name="download-cloud" size={18} color="#fff" />
                        <Text style={styles.receiveBtnText}>استلم البضاعة</Text>
                      </>
                    )}
                  </Pressable>
                )}

                {inbox.status === "received" && (
                  <View style={[styles.receivedBanner, { backgroundColor: "#d1fae5", borderColor: "#a7f3d0" }]}>
                    <Feather name="check-circle" size={16} color="#059669" />
                    <Text style={[styles.receivedText, { color: "#059669" }]}>
                      تم الاستلام — {inbox.receivedAt ? new Date(inbox.receivedAt).toLocaleString("ar-DZ") : ""}
                    </Text>
                  </View>
                )}
              </View>
            )}
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { alignItems: "center", justifyContent: "center" },
  content: { padding: 12, gap: 12 },
  headerCard: {
    borderRadius: 16, borderWidth: 1, padding: 20,
    alignItems: "center", gap: 8,
  },
  iconWrap: {
    width: 60, height: 60, borderRadius: 30,
    alignItems: "center", justifyContent: "center",
  },
  headerTitle: { fontSize: 18, fontFamily: "Cairo_700Bold", textAlign: "center" },
  headerSub: { fontSize: 13, fontFamily: "Cairo_400Regular", textAlign: "center" },
  emptyCard: {
    borderRadius: 16, borderWidth: 1, padding: 32,
    alignItems: "center", gap: 10,
  },
  emptyTitle: { fontSize: 15, fontFamily: "Cairo_600SemiBold" },
  emptySub: { fontSize: 12, fontFamily: "Cairo_400Regular", textAlign: "center" },
  dispatchCard: { borderRadius: 16, borderWidth: 1, padding: 16, gap: 12 },
  dispatchHeader: { flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "center" },
  dispatchDate: { fontSize: 12, fontFamily: "Cairo_400Regular" },
  badge: { flexDirection: "row-reverse", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
  badgeText: { fontSize: 12, fontFamily: "Cairo_600SemiBold" },
  noteBox: {
    flexDirection: "row-reverse", alignItems: "center", gap: 6,
    borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6,
  },
  noteText: { flex: 1, fontSize: 13, fontFamily: "Cairo_400Regular", textAlign: "right" },
  itemsTitle: { fontSize: 13, fontFamily: "Cairo_600SemiBold", textAlign: "right" },
  itemRow: {
    flexDirection: "row-reverse", alignItems: "center", gap: 10,
    paddingVertical: 8, borderBottomWidth: 1,
  },
  itemIcon: { width: 32, height: 32, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  itemName: { flex: 1, fontSize: 14, fontFamily: "Cairo_400Regular", textAlign: "right" },
  itemQty: { alignItems: "center", minWidth: 40 },
  itemQtyNum: { fontSize: 16, fontFamily: "Cairo_700Bold" },
  itemUnit: { fontSize: 10, fontFamily: "Cairo_400Regular" },
  receiveBtn: {
    borderRadius: 12, paddingVertical: 14,
    flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 8,
  },
  receiveBtnText: { color: "#fff", fontSize: 16, fontFamily: "Cairo_700Bold" },
  receivedBanner: {
    flexDirection: "row-reverse", alignItems: "center", gap: 8,
    borderRadius: 10, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 8,
  },
  receivedText: { fontSize: 13, fontFamily: "Cairo_600SemiBold" },
  retryBtn: {
    flexDirection: "row-reverse", alignItems: "center", gap: 6,
    paddingHorizontal: 20, paddingVertical: 10, borderRadius: 10, marginTop: 4,
  },
  retryBtnText: { color: "#fff", fontSize: 14, fontFamily: "Cairo_700Bold" },
});
