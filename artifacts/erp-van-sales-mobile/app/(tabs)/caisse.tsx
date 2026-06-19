import { Feather } from "@expo/vector-icons";
import { useRefreshOnFocus } from "@/hooks/useRefreshOnFocus";
import { useCallback, useState } from "react";
import {
  FlatList, Modal, RefreshControl, ScrollView, StyleSheet, Text,
  TextInput, View,
} from "react-native";
import { SyncBar } from "@/components/SyncBar";
import { AppButton, MoneyText, PressableScale, ResultDialog, StatusPill } from "@/components/ui";
import type { DialogAction, ResultVariant } from "@/components/ui";
import { useAuth } from "@/contexts/AuthContext";
import { useSync } from "@/contexts/SyncContext";
import { CashTransfer, getDb } from "@/lib/db";
import { formatMoney } from "@/lib/money";
import { newSyncId } from "@/lib/uuid";
import { fonts } from "@/constants/tokens";
import { useTheme } from "@/hooks/useTheme";

interface CashRow extends CashTransfer { truck_name?: string; }
interface TruckRow { id: number; name: string; cash_balance: number; }

export default function CaisseScreen() {
  const t = useTheme();
  const c = t.color;
  const { user } = useAuth();
  const isTruck = user?.role === "truck";
  const { triggerSync, bumpLocalVersion } = useSync();
  const [transfers, setTransfers] = useState<CashRow[]>([]);
  const [trucks, setTrucks] = useState<TruckRow[]>([]);
  const [pendingCash, setPendingCash] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [formTruckId, setFormTruckId] = useState("");
  const [formAmount, setFormAmount] = useState("");
  const [formDirection, setFormDirection] = useState<"in" | "out">("in");
  const [formNote, setFormNote] = useState("");
  const [saving, setSaving] = useState(false);

  const [dialog, setDialog] = useState<{ visible: boolean; variant: ResultVariant; title: string; message?: string; actions?: DialogAction[] }>(
    { visible: false, variant: "info", title: "" }
  );
  const showDialog = (variant: ResultVariant, title: string, message?: string, actions?: DialogAction[]) =>
    setDialog({ visible: true, variant, title, message, actions });
  const hideDialog = () => setDialog((d) => ({ ...d, visible: false }));

  const load = useCallback(async () => {
    const db = await getDb();
    if (!db) return;
    const rows = await db.getAllAsync<CashRow>(
      `SELECT ct.*, t.name as truck_name FROM cash_transfers ct
       LEFT JOIN trucks t ON ct.truck_id = t.id
       WHERE ct.is_deleted = 0 ${isTruck && user?.truckId ? "AND ct.truck_id = ?" : ""}
       ORDER BY ct.created_at DESC LIMIT 200`,
      isTruck && user?.truckId ? [user.truckId] : []
    );
    setTransfers(rows);
    const truckRows = await db.getAllAsync<TruckRow>(
      `SELECT id, name, cash_balance FROM trucks WHERE is_deleted = 0 ${isTruck && user?.truckId ? "AND id = ?" : ""} ORDER BY name`,
      isTruck && user?.truckId ? [user.truckId] : []
    );
    setTrucks(truckRows);

    // Fallback cash: sum of pending cash invoices for when trucks.cash_balance
    // hasn't been updated yet (trucks table row missing or not yet synced).
    if (isTruck && user?.truckId) {
      const pcRow = await db.getFirstAsync<{ total: number }>(
        `SELECT COALESCE(SUM(total_amount), 0) as total FROM invoices
         WHERE (truck_id = ? OR (truck_id IS NULL AND _pending = 1))
         AND payment_type = 'cash' AND is_deleted = 0 AND _pending = 1`,
        [user.truckId]
      );
      setPendingCash(Number(pcRow?.total ?? 0));
    } else {
      setPendingCash(0);
    }
  }, [isTruck, user?.truckId]);

  useRefreshOnFocus(load);

  const myTruck = isTruck ? trucks.find(t => t.id === user?.truckId) ?? trucks[0] : undefined;

  const onRefresh = async () => {
    setRefreshing(true);
    triggerSync();
    await load();
    setRefreshing(false);
  };

  const openModal = () => {
    setFormTruckId(isTruck && user?.truckId ? String(user.truckId) : "");
    setFormAmount(""); setFormDirection("in"); setFormNote("");
    setShowModal(true);
  };

  const handleSave = async () => {
    const truckId = isTruck && user?.truckId ? String(user.truckId) : formTruckId;
    if (!truckId) { showDialog("warning", "تنبيه", "اختر الشاحنة"); return; }
    const amount = parseFloat(formAmount);
    if (!amount || amount <= 0) { showDialog("warning", "تنبيه", "أدخل مبلغاً صحيحاً"); return; }
    // Truck users: block if amount exceeds the cash actually on hand.
    // cashOnHand subtracts already-pending deliveries from the balance, so the
    // driver can't queue more than they physically hold.
    if (isTruck && amount > cashOnHand) {
      showDialog("warning", "تنبيه", `المبلغ يتجاوز رصيد الصندوق (${formatMoney(Math.max(0, cashOnHand))})`);
      return;
    }
    setSaving(true);
    try {
      const db = await getDb();
      if (!db) return;
      const now = new Date().toISOString();
      // For truck users the only movement is delivering cash to management ("in").
      const direction = isTruck ? "in" : formDirection;
      await db.runAsync(
        `INSERT INTO cash_transfers (sync_id, truck_id, amount, direction, note, status, created_at, updated_at, is_deleted, _pending)
         VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, 0, 1)`,
        [newSyncId(), Number(truckId), amount, direction, formNote.trim() || null, now, now]
      );
      // ملاحظة: لا يتم خصم رصيد صندوق الشاحنة هنا. يبقى الطلب "قيد الانتظار"
      // ولا يُخصم المبلغ إلا بعد موافقة الإدارة (تتم المعالجة على الخادم).
      setShowModal(false);
      bumpLocalVersion();
      triggerSync();
      load();
      if (isTruck) {
        showDialog("success", "تم الإرسال", "تم إرسال طلب تسليم الدفعة للإدارة. سيُخصم المبلغ بعد الموافقة.");
      }
    } catch (e: any) {
      showDialog("error", "خطأ", e?.message ?? "فشل الحفظ");
    } finally {
      setSaving(false);
    }
  };

  const totalIn = transfers.filter(t => t.direction === "in").reduce((s, t) => s + Number(t.amount ?? 0), 0);
  const totalOut = transfers.filter(t => t.direction === "out").reduce((s, t) => s + Number(t.amount ?? 0), 0);
  // Pending outgoing: transfers the driver submitted but the office hasn't confirmed yet.
  // direction="in" means cash going from truck to office; status="pending" = not yet deducted.
  const pendingOut = transfers
    .filter(t => t.direction === "in" && (t.status === "pending" || t.status == null))
    .reduce((s, t) => s + Number(t.amount ?? 0), 0);
  // When trucks table has the row (after sync), use its cash_balance (already optimistically updated).
  // When trucks table row is missing, fall back to summing pending cash invoices directly.
  const baseBalance = myTruck ? Number(myTruck.cash_balance ?? 0) : pendingCash;
  const cashOnHand = baseBalance - pendingOut;

  return (
    <View style={[styles.container, { backgroundColor: c.bg }]}>
      <SyncBar />

      <View style={[styles.summary, { backgroundColor: c.surface, borderColor: c.brandBorder, ...t.elevation.glow }]}>
        {isTruck ? (
          <>
            <View style={styles.summaryItem}>
              <MoneyText amount={Math.max(0, cashOnHand)} size="title" />
              <Text style={[styles.summaryLabel, { color: c.textMuted }]}>نقداً في الصندوق</Text>
            </View>
            <View style={[styles.summaryDivider, { backgroundColor: c.hairline }]} />
            <View style={styles.summaryItem}>
              <MoneyText amount={pendingOut} size="title" tone={pendingOut > 0 ? "muted" : "neutral"} />
              <Text style={[styles.summaryLabel, { color: c.textMuted }]}>بانتظار التأكيد</Text>
            </View>
          </>
        ) : (
          <>
            <View style={styles.summaryItem}>
              <MoneyText amount={totalIn} size="title" tone="positive" />
              <Text style={[styles.summaryLabel, { color: c.textMuted }]}>إجمالي التحصيل</Text>
            </View>
            <View style={[styles.summaryDivider, { backgroundColor: c.hairline }]} />
            <View style={styles.summaryItem}>
              <MoneyText amount={totalOut} size="title" tone="negative" />
              <Text style={[styles.summaryLabel, { color: c.textMuted }]}>إجمالي الصرف</Text>
            </View>
          </>
        )}
      </View>

      <View style={[styles.topBar, { borderBottomColor: c.hairline }]}>
        <AppButton
          label={isTruck ? "تسليم دفعة" : "حركة جديدة"}
          icon={isTruck ? "send" : "plus"}
          size="sm"
          onPress={openModal}
        />
        <Text style={[styles.pageTitle, { color: c.text }]}>{isTruck ? "صندوقي" : "الصندوق"}</Text>
      </View>

      <FlatList
        data={transfers}
        keyExtractor={i => i.sync_id}
        renderItem={({ item }) => {
          const isIn = item.direction === "in";
          const st = item.status ?? "pending";
          const pillStatus = st === "approved" ? "approved" : st === "rejected" ? "rejected" : "pending";
          return (
            <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.hairline }]}>
              <View style={styles.cardRow}>
                <View style={[styles.avatar, { backgroundColor: isIn ? c.successTint : c.dangerTint }]}>
                  <Feather name={isIn ? "arrow-down-circle" : "arrow-up-circle"} size={18} color={isIn ? c.success : c.danger} />
                </View>
                <View style={{ flex: 1, alignItems: "flex-end" }}>
                  <Text style={[styles.truckName, { color: c.text }]}>{item.truck_name ?? "—"}</Text>
                  {item.note ? <Text style={[styles.note, { color: c.textMuted }]}>{item.note}</Text> : null}
                  <View style={styles.statusDateRow}>
                    <StatusPill status={pillStatus} />
                    <Text style={[styles.date, { color: c.textMuted }]}>
                      {item.created_at ? new Date(item.created_at).toLocaleDateString("ar-DZ") : ""}
                    </Text>
                  </View>
                </View>
                <MoneyText amount={isIn ? Number(item.amount ?? 0) : -Number(item.amount ?? 0)} signed tone={isIn ? "positive" : "negative"} size="callout" />
              </View>
            </View>
          );
        }}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.brand} />}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Feather name="dollar-sign" size={40} color={c.textFaint} />
            <Text style={[styles.emptyText, { color: c.textMuted }]}>لا توجد حركات مالية</Text>
          </View>
        }
        showsVerticalScrollIndicator={false}
      />

      <Modal visible={showModal} animationType="slide" transparent onRequestClose={() => setShowModal(false)}>
        <View style={[styles.overlay, { backgroundColor: c.scrim }]}>
          <View style={[styles.sheet, { backgroundColor: c.surface, borderColor: c.hairline }]}>
            <View style={[styles.sheetHeader, { borderBottomColor: c.hairline }]}>
              <PressableScale onPress={() => setShowModal(false)} hitSlop={10} accessibilityLabel="إغلاق">
                <Feather name="x" size={22} color={c.text} />
              </PressableScale>
              <Text style={[styles.sheetTitle, { color: c.text }]}>{isTruck ? "تسليم دفعة للإدارة" : "حركة جديدة"}</Text>
              <AppButton label={saving ? "جاري..." : "حفظ"} size="sm" loading={saving} onPress={handleSave} />
            </View>
            <ScrollView style={{ padding: 16 }} keyboardShouldPersistTaps="handled">
              {isTruck ? (
                <View style={[styles.truckNote, { backgroundColor: c.brandTint, borderColor: c.brandBorder }]}>
                  <Feather name="truck" size={16} color={c.brandText} />
                  <Text style={[styles.truckNoteText, { color: c.text }]}>
                    {myTruck?.name ?? "شاحنتي"} — تسليم مبلغ نقدي للإدارة (يُخصم من رصيد صندوقك)
                  </Text>
                </View>
              ) : (
                <>
                  <Text style={[styles.fieldLabel, { color: c.textMuted }]}>الشاحنة</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
                    {trucks.map(tr => (
                      <PressableScale
                        key={tr.id}
                        style={[styles.chip, {
                          backgroundColor: formTruckId === String(tr.id) ? c.brand : c.surfaceElevated,
                          borderColor: formTruckId === String(tr.id) ? c.brand : c.hairline,
                        }]}
                        onPress={() => setFormTruckId(String(tr.id))}
                      >
                        <Text style={[styles.chipText, { color: formTruckId === String(tr.id) ? c.onBrand : c.text }]}>
                          {tr.name}
                        </Text>
                      </PressableScale>
                    ))}
                  </ScrollView>
                  <Text style={[styles.fieldLabel, { color: c.textMuted, marginTop: 14 }]}>نوع الحركة</Text>
                  <View style={styles.directionRow}>
                    <PressableScale
                      style={[styles.dirBtn, { backgroundColor: formDirection === "in" ? c.success : c.surfaceElevated, borderColor: formDirection === "in" ? c.success : c.hairline }]}
                      onPress={() => setFormDirection("in")}
                    >
                      <Feather name="arrow-down-circle" size={16} color={formDirection === "in" ? c.onColor : c.text} />
                      <Text style={[styles.dirBtnText, { color: formDirection === "in" ? c.onColor : c.text }]}>تحصيل من شاحنة</Text>
                    </PressableScale>
                    <PressableScale
                      style={[styles.dirBtn, { backgroundColor: formDirection === "out" ? c.danger : c.surfaceElevated, borderColor: formDirection === "out" ? c.danger : c.hairline }]}
                      onPress={() => setFormDirection("out")}
                    >
                      <Feather name="arrow-up-circle" size={16} color={formDirection === "out" ? c.onColor : c.text} />
                      <Text style={[styles.dirBtnText, { color: formDirection === "out" ? c.onColor : c.text }]}>صرف للشاحنة</Text>
                    </PressableScale>
                  </View>
                </>
              )}
              <Text style={[styles.fieldLabel, { color: c.textMuted, marginTop: 14 }]}>المبلغ (DZD) *</Text>
              <TextInput
                style={[styles.input, { backgroundColor: c.bg, borderColor: c.hairline, color: c.text }]}
                value={formAmount} onChangeText={setFormAmount}
                placeholder="0.00" placeholderTextColor={c.textFaint}
                keyboardType="decimal-pad" textAlign="right"
              />
              <Text style={[styles.fieldLabel, { color: c.textMuted, marginTop: 14 }]}>ملاحظة</Text>
              <TextInput
                style={[styles.input, { backgroundColor: c.bg, borderColor: c.hairline, color: c.text }]}
                value={formNote} onChangeText={setFormNote}
                placeholder="اختياري" placeholderTextColor={c.textFaint}
                textAlign="right"
              />
              <View style={{ height: 40 }} />
            </ScrollView>
          </View>
        </View>
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
  summary: { flexDirection: "row-reverse", margin: 12, borderRadius: 18, borderWidth: 1, padding: 16, justifyContent: "space-around" },
  summaryItem: { alignItems: "center", gap: 4 },
  summaryLabel: { fontSize: 11, fontFamily: fonts.regular },
  summaryDivider: { width: 1 },
  topBar: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1 },
  pageTitle: { fontSize: 17, fontFamily: fonts.bold },
  list: { paddingHorizontal: 12, paddingTop: 12, paddingBottom: 16, gap: 8 },
  card: { borderRadius: 14, borderWidth: 1, padding: 14 },
  cardRow: { flexDirection: "row-reverse", alignItems: "center", gap: 10 },
  avatar: { width: 40, height: 40, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  truckName: { fontSize: 14, fontFamily: fonts.semibold },
  note: { fontSize: 12, fontFamily: fonts.regular },
  date: { fontSize: 11, fontFamily: fonts.regular },
  statusDateRow: { flexDirection: "row-reverse", alignItems: "center", gap: 8, marginTop: 2 },
  empty: { alignItems: "center", paddingVertical: 60, gap: 12 },
  emptyText: { fontSize: 14, fontFamily: fonts.regular },
  overlay: { flex: 1, justifyContent: "flex-end" },
  sheet: { borderTopLeftRadius: 22, borderTopRightRadius: 22, borderWidth: 1, borderBottomWidth: 0, maxHeight: "90%" },
  sheetHeader: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1 },
  sheetTitle: { fontSize: 17, fontFamily: fonts.semibold },
  truckNote: { flexDirection: "row-reverse", alignItems: "center", gap: 8, padding: 12, borderRadius: 12, borderWidth: 1, marginBottom: 4 },
  truckNoteText: { flex: 1, fontSize: 13, fontFamily: fonts.semibold, textAlign: "right" },
  fieldLabel: { fontSize: 12, fontFamily: fonts.regular, marginBottom: 8, textAlign: "right" },
  chips: { flexDirection: "row-reverse", gap: 8, paddingVertical: 4, marginBottom: 4 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1 },
  chipText: { fontSize: 13, fontFamily: fonts.semibold },
  directionRow: { flexDirection: "row-reverse", gap: 10 },
  dirBtn: { flex: 1, flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 10, borderRadius: 12, borderWidth: 1 },
  dirBtnText: { fontSize: 12, fontFamily: fonts.semibold },
  input: { height: 46, borderRadius: 10, borderWidth: 1, paddingHorizontal: 14, fontSize: 14, fontFamily: fonts.regular },
});
