import { Feather } from "@expo/vector-icons";
import { useRefreshOnFocus } from "@/hooks/useRefreshOnFocus";
import { useCallback, useState } from "react";
import {
  ActivityIndicator, FlatList, RefreshControl,
  StyleSheet, Text, View,
} from "react-native";
import { SyncBar } from "@/components/SyncBar";
import { AppButton, PressableScale, ResultDialog, StatusPill } from "@/components/ui";
import type { DialogAction, ResultVariant, Status } from "@/components/ui";
import { useAuth } from "@/contexts/AuthContext";
import { apiFetch } from "@/lib/api";
import { getDb } from "@/lib/db";
import { canonicalizeTruckStock } from "@/lib/truckStock";
import { fonts } from "@/constants/tokens";
import { useTheme } from "@/hooks/useTheme";

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

function DispatchStatusBadge({ status }: { status: string }) {
  const config: { pill: Status; label: string } = status === "pending"
    ? { pill: "pending", label: "معلّق" }
    : status === "received"
    ? { pill: "approved", label: "تم الاستلام" }
    : { pill: "neutral", label: "مغلق" };

  return <StatusPill status={config.pill} label={config.label} />;
}

export default function DispatchScreen() {
  const t = useTheme();
  const c = t.color;
  const { user } = useAuth();
  const [inbox, setInbox] = useState<Dispatch | null | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [receiving, setReceiving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const [dialog, setDialog] = useState<{ visible: boolean; variant: ResultVariant; title: string; message?: string; actions?: DialogAction[] }>(
    { visible: false, variant: "info", title: "" }
  );
  const showDialog = (variant: ResultVariant, title: string, message?: string, actions?: DialogAction[]) =>
    setDialog({ visible: true, variant, title, message, actions });
  const hideDialog = () => setDialog((d) => ({ ...d, visible: false }));

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

  useRefreshOnFocus(load);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const doReceive = async () => {
    if (!inbox) return;
    setReceiving(true);
    try {
      const r = await apiFetch(`/dispatches/${inbox.id}/receive`, { method: "POST" });
      if (r.ok) {
        const { stock } = await r.json();
        const db = await getDb();
        if (db && stock) {
          const now = new Date().toISOString();
          for (const s of stock) {
            // Server returns the authoritative post-receive quantity;
            // set it absolutely and collapse any duplicate rows.
            await canonicalizeTruckStock(
              db, inbox.truckId, s.productId, 0, now,
              { absolute: s.quantity }
            );
          }
        }
        await load();
        showDialog("success", "تم الاستلام", "تم تحديث مخزون شاحنتك بنجاح.");
      } else {
        const err = await r.json();
        showDialog("error", "خطأ", err.error || "فشل الاستلام");
      }
    } catch {
      showDialog("error", "خطأ", "تأكد من الاتصال بالإنترنت");
    } finally {
      setReceiving(false);
    }
  };

  const receiveDispatch = () => {
    if (!inbox) return;
    showDialog(
      "warning",
      "استلام البضاعة",
      `هل تأكد استلام ${inbox.stockItems.length} صنف؟ سيتم إضافتها لمخزون شاحنتك.`,
      [
        { label: "إلغاء", variant: "ghost" },
        { label: "استلم", variant: "primary", onPress: doReceive },
      ]
    );
  };

  if (loading) {
    return (
      <View style={[styles.container, styles.center, { backgroundColor: c.bg }]}>
        <ActivityIndicator color={c.brand} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: c.bg }]}>
      <SyncBar />
      <FlatList
        data={[]}
        keyExtractor={() => ""}
        renderItem={null}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.brand} />}
        ListHeaderComponent={
          <View style={styles.content}>
            {/* Header */}
            <View style={[styles.headerCard, { backgroundColor: c.surface, borderColor: c.hairline }]}>
              <View style={[styles.iconWrap, { backgroundColor: c.brandTint }]}>
                <Feather name="download" size={28} color={c.brandText} />
              </View>
              <Text style={[styles.headerTitle, { color: c.text }]}>استلام البضاعة</Text>
              <Text style={[styles.headerSub, { color: c.textMuted }]}>
                عند وجود إنترنت، اسحب للتحديث لرؤية البضاعة المرسلة من الإدارة
              </Text>
            </View>

            {error ? (
              <View style={[styles.emptyCard, { backgroundColor: c.surface, borderColor: c.danger }]}>
                <Feather name="wifi-off" size={36} color={c.danger} />
                <Text style={[styles.emptyTitle, { color: c.dangerText }]}>فشل الاتصال بالخادم</Text>
                <Text style={[styles.emptySub, { color: c.textMuted }]}>
                  تأكد من الاتصال بالإنترنت أو تواصل مع الإدارة لإعادة تسجيل الدخول
                </Text>
                <AppButton
                  label="إعادة المحاولة"
                  icon="refresh-cw"
                  size="md"
                  onPress={() => { setLoading(true); load(); }}
                  style={{ marginTop: 4 }}
                />
              </View>
            ) : inbox === null || inbox === undefined ? (
              <View style={[styles.emptyCard, { backgroundColor: c.surface, borderColor: c.hairline }]}>
                <Feather name="inbox" size={36} color={c.textFaint} />
                <Text style={[styles.emptyTitle, { color: c.text }]}>لا يوجد تحميل جديد</Text>
                <Text style={[styles.emptySub, { color: c.textMuted }]}>
                  اسحب للأسفل للتحقق من وجود بضاعة جديدة من الإدارة
                </Text>
              </View>
            ) : (
              <View style={[styles.dispatchCard, { backgroundColor: c.surface, borderColor: c.hairline }]}>
                <View style={styles.dispatchHeader}>
                  <DispatchStatusBadge status={inbox.status} />
                  <Text style={[styles.dispatchDate, { color: c.textMuted }]}>
                    {new Date(inbox.createdAt).toLocaleDateString("ar-DZ")}
                  </Text>
                </View>

                {inbox.note && (
                  <View style={[styles.noteBox, { backgroundColor: c.brandTint, borderColor: c.brandBorder }]}>
                    <Feather name="message-circle" size={13} color={c.brandText} />
                    <Text style={[styles.noteText, { color: c.text }]}>{inbox.note}</Text>
                  </View>
                )}

                <Text style={[styles.itemsTitle, { color: c.text }]}>
                  البضاعة المرسلة ({inbox.stockItems.length} صنف)
                </Text>

                {inbox.stockItems.map((item, idx) => (
                  <View key={idx} style={[styles.itemRow, { borderBottomColor: c.hairline }]}>
                    <View style={[styles.itemIcon, { backgroundColor: c.brandTint }]}>
                      <Feather name="box" size={14} color={c.brandText} />
                    </View>
                    <Text style={[styles.itemName, { color: c.text }]} numberOfLines={1}>
                      {item.productName}
                    </Text>
                    <View style={styles.itemQty}>
                      <Text style={[styles.itemQtyNum, { color: c.brandText }]}>{item.quantity}</Text>
                      <Text style={[styles.itemUnit, { color: c.textMuted }]}>{item.unit}</Text>
                    </View>
                  </View>
                ))}

                {inbox.status === "pending" && (
                  <AppButton
                    label="استلم البضاعة"
                    icon="download-cloud"
                    size="lg"
                    loading={receiving}
                    onPress={receiveDispatch}
                    style={{ marginTop: 4 }}
                  />
                )}

                {inbox.status === "received" && (
                  <View style={[styles.receivedBanner, { backgroundColor: c.successTint, borderColor: c.success }]}>
                    <Feather name="check-circle" size={16} color={c.success} />
                    <Text style={[styles.receivedText, { color: c.successText }]}>
                      تم الاستلام — {inbox.receivedAt ? new Date(inbox.receivedAt).toLocaleString("ar-DZ") : ""}
                    </Text>
                  </View>
                )}
              </View>
            )}
          </View>
        }
      />

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
  headerTitle: { fontSize: 18, fontFamily: fonts.bold, textAlign: "center" },
  headerSub: { fontSize: 13, fontFamily: fonts.regular, textAlign: "center" },
  emptyCard: {
    borderRadius: 16, borderWidth: 1, padding: 32,
    alignItems: "center", gap: 10,
  },
  emptyTitle: { fontSize: 15, fontFamily: fonts.semibold },
  emptySub: { fontSize: 12, fontFamily: fonts.regular, textAlign: "center" },
  dispatchCard: { borderRadius: 16, borderWidth: 1, padding: 16, gap: 12 },
  dispatchHeader: { flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "center" },
  dispatchDate: { fontSize: 12, fontFamily: fonts.regular },
  noteBox: {
    flexDirection: "row-reverse", alignItems: "center", gap: 6,
    borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6,
  },
  noteText: { flex: 1, fontSize: 13, fontFamily: fonts.regular, textAlign: "right" },
  itemsTitle: { fontSize: 13, fontFamily: fonts.semibold, textAlign: "right" },
  itemRow: {
    flexDirection: "row-reverse", alignItems: "center", gap: 10,
    paddingVertical: 8, borderBottomWidth: 1,
  },
  itemIcon: { width: 32, height: 32, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  itemName: { flex: 1, fontSize: 14, fontFamily: fonts.regular, textAlign: "right" },
  itemQty: { alignItems: "center", minWidth: 40 },
  itemQtyNum: { fontSize: 16, fontFamily: fonts.bold },
  itemUnit: { fontSize: 10, fontFamily: fonts.regular },
  receivedBanner: {
    flexDirection: "row-reverse", alignItems: "center", gap: 8,
    borderRadius: 10, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 8,
  },
  receivedText: { fontSize: 13, fontFamily: fonts.semibold },
});
