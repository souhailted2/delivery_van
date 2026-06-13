import { Feather } from "@expo/vector-icons";
import { useRefreshOnFocus } from "@/hooks/useRefreshOnFocus";
import { useCallback, useState } from "react";
import {
  Alert, FlatList, Modal, RefreshControl, ScrollView, StyleSheet, Text,
  TextInput, TouchableOpacity, View,
} from "react-native";
import { SyncBar } from "@/components/SyncBar";
import { useAuth } from "@/contexts/AuthContext";
import { useSync } from "@/contexts/SyncContext";
import { CashTransfer, getDb } from "@/lib/db";
import { newSyncId } from "@/lib/uuid";
import { useColors } from "@/hooks/useColors";

interface CashRow extends CashTransfer { truck_name?: string; }
interface TruckRow { id: number; name: string; cash_balance: number; }

export default function CaisseScreen() {
  const colors = useColors();
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
    if (!truckId) { Alert.alert("تنبيه", "اختر الشاحنة"); return; }
    const amount = parseFloat(formAmount);
    if (!amount || amount <= 0) { Alert.alert("تنبيه", "أدخل مبلغاً صحيحاً"); return; }
    // Truck users: block if amount exceeds the cash actually on hand.
    // cashOnHand subtracts already-pending deliveries from the balance, so the
    // driver can't queue more than they physically hold.
    if (isTruck && amount > cashOnHand) {
      Alert.alert("تنبيه", `المبلغ يتجاوز رصيد الصندوق (${Math.max(0, cashOnHand).toLocaleString("fr-DZ")} د.ج)`);
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
        Alert.alert("✅ تم الإرسال", "تم إرسال طلب تسليم الدفعة للإدارة. سيُخصم المبلغ بعد الموافقة.");
      }
    } catch (e: any) {
      Alert.alert("خطأ", e?.message ?? "فشل الحفظ");
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
  const fmt = (n: number) => n.toLocaleString("fr-DZ") + " د.ج";

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <SyncBar />

      <View style={[styles.summary, { backgroundColor: colors.primary }]}>
        {isTruck ? (
          <>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryVal}>{fmt(Math.max(0, cashOnHand))}</Text>
              <Text style={styles.summaryLabel}>نقداً في الصندوق</Text>
            </View>
            <View style={styles.summaryDivider} />
            <View style={styles.summaryItem}>
              <Text style={[styles.summaryVal, pendingOut > 0 && { color: "#fde68a" }]}>{fmt(pendingOut)}</Text>
              <Text style={styles.summaryLabel}>بانتظار التأكيد</Text>
            </View>
          </>
        ) : (
          <>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryVal}>{fmt(totalIn)}</Text>
              <Text style={styles.summaryLabel}>إجمالي التحصيل</Text>
            </View>
            <View style={styles.summaryDivider} />
            <View style={styles.summaryItem}>
              <Text style={styles.summaryVal}>{fmt(totalOut)}</Text>
              <Text style={styles.summaryLabel}>إجمالي الصرف</Text>
            </View>
          </>
        )}
      </View>

      <View style={[styles.topBar, { borderBottomColor: colors.border }]}>
        <TouchableOpacity style={[styles.addBtn, { backgroundColor: colors.primary }]} onPress={openModal}>
          <Feather name={isTruck ? "send" : "plus"} size={16} color="#fff" />
          <Text style={styles.addBtnText}>{isTruck ? "تسليم دفعة" : "حركة جديدة"}</Text>
        </TouchableOpacity>
        <Text style={[styles.pageTitle, { color: colors.foreground }]}>{isTruck ? "صندوقي" : "الصندوق"}</Text>
      </View>

      <FlatList
        data={transfers}
        keyExtractor={i => i.sync_id}
        renderItem={({ item }) => {
          const isIn = item.direction === "in";
          return (
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={styles.cardRow}>
                <View style={[styles.avatar, { backgroundColor: (isIn ? "#22c55e" : colors.destructive) + "22" }]}>
                  <Feather name={isIn ? "arrow-down-circle" : "arrow-up-circle"} size={18} color={isIn ? "#22c55e" : colors.destructive} />
                </View>
                <View style={{ flex: 1, alignItems: "flex-end" }}>
                  <Text style={[styles.truckName, { color: colors.foreground }]}>{item.truck_name ?? "—"}</Text>
                  {item.note ? <Text style={[styles.note, { color: colors.mutedForeground }]}>{item.note}</Text> : null}
                  <View style={styles.statusDateRow}>
                    {(() => {
                      const st = item.status ?? "pending";
                      const cfg = st === "approved"
                        ? { label: "مقبول", color: "#059669", bg: "#d1fae5" }
                        : st === "rejected"
                        ? { label: "مرفوض", color: colors.destructive, bg: colors.destructive + "22" }
                        : { label: "قيد الانتظار", color: "#d97706", bg: "#fef3c7" };
                      return (
                        <View style={[styles.statusPill, { backgroundColor: cfg.bg }]}>
                          <Text style={[styles.statusPillText, { color: cfg.color }]}>{cfg.label}</Text>
                        </View>
                      );
                    })()}
                    <Text style={[styles.date, { color: colors.mutedForeground }]}>
                      {item.created_at ? new Date(item.created_at).toLocaleDateString("ar-DZ") : ""}
                    </Text>
                  </View>
                </View>
                <Text style={[styles.amount, { color: isIn ? "#22c55e" : colors.destructive }]}>
                  {isIn ? "+" : "-"}{fmt(Number(item.amount ?? 0))}
                </Text>
              </View>
            </View>
          );
        }}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Feather name="dollar-sign" size={40} color={colors.muted} />
            <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>لا توجد حركات مالية</Text>
          </View>
        }
        showsVerticalScrollIndicator={false}
      />

      <Modal visible={showModal} animationType="slide" transparent onRequestClose={() => setShowModal(false)}>
        <View style={styles.overlay}>
          <View style={[styles.sheet, { backgroundColor: colors.background, borderColor: colors.border }]}>
            <View style={[styles.sheetHeader, { borderBottomColor: colors.border }]}>
              <TouchableOpacity onPress={() => setShowModal(false)}>
                <Feather name="x" size={22} color={colors.foreground} />
              </TouchableOpacity>
              <Text style={[styles.sheetTitle, { color: colors.foreground }]}>{isTruck ? "تسليم دفعة للإدارة" : "حركة جديدة"}</Text>
              <TouchableOpacity
                style={[styles.saveBtn, { backgroundColor: saving ? colors.muted : colors.primary }]}
                onPress={handleSave} disabled={saving}
              >
                <Text style={styles.saveBtnText}>{saving ? "جاري..." : "حفظ"}</Text>
              </TouchableOpacity>
            </View>
            <ScrollView style={{ padding: 16 }} keyboardShouldPersistTaps="handled">
              {isTruck ? (
                <View style={[styles.truckNote, { backgroundColor: colors.primary + "12", borderColor: colors.primary + "33" }]}>
                  <Feather name="truck" size={16} color={colors.primary} />
                  <Text style={[styles.truckNoteText, { color: colors.foreground }]}>
                    {myTruck?.name ?? "شاحنتي"} — تسليم مبلغ نقدي للإدارة (يُخصم من رصيد صندوقك)
                  </Text>
                </View>
              ) : (
                <>
                  <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>الشاحنة</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
                    {trucks.map(t => (
                      <TouchableOpacity
                        key={t.id}
                        style={[styles.chip, {
                          backgroundColor: formTruckId === String(t.id) ? colors.primary : colors.card,
                          borderColor: formTruckId === String(t.id) ? colors.primary : colors.border,
                        }]}
                        onPress={() => setFormTruckId(String(t.id))}
                      >
                        <Text style={[styles.chipText, { color: formTruckId === String(t.id) ? "#fff" : colors.foreground }]}>
                          {t.name}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                  <Text style={[styles.fieldLabel, { color: colors.mutedForeground, marginTop: 14 }]}>نوع الحركة</Text>
                  <View style={styles.directionRow}>
                    <TouchableOpacity
                      style={[styles.dirBtn, { backgroundColor: formDirection === "in" ? "#22c55e" : colors.card, borderColor: colors.border }]}
                      onPress={() => setFormDirection("in")}
                    >
                      <Feather name="arrow-down-circle" size={16} color={formDirection === "in" ? "#fff" : colors.foreground} />
                      <Text style={[styles.dirBtnText, { color: formDirection === "in" ? "#fff" : colors.foreground }]}>تحصيل من شاحنة</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.dirBtn, { backgroundColor: formDirection === "out" ? colors.destructive : colors.card, borderColor: colors.border }]}
                      onPress={() => setFormDirection("out")}
                    >
                      <Feather name="arrow-up-circle" size={16} color={formDirection === "out" ? "#fff" : colors.foreground} />
                      <Text style={[styles.dirBtnText, { color: formDirection === "out" ? "#fff" : colors.foreground }]}>صرف للشاحنة</Text>
                    </TouchableOpacity>
                  </View>
                </>
              )}
              <Text style={[styles.fieldLabel, { color: colors.mutedForeground, marginTop: 14 }]}>المبلغ (د.ج) *</Text>
              <TextInput
                style={[styles.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]}
                value={formAmount} onChangeText={setFormAmount}
                placeholder="0.00" placeholderTextColor={colors.mutedForeground}
                keyboardType="decimal-pad" textAlign="right"
              />
              <Text style={[styles.fieldLabel, { color: colors.mutedForeground, marginTop: 14 }]}>ملاحظة</Text>
              <TextInput
                style={[styles.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]}
                value={formNote} onChangeText={setFormNote}
                placeholder="اختياري" placeholderTextColor={colors.mutedForeground}
                textAlign="right"
              />
              <View style={{ height: 40 }} />
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  summary: { flexDirection: "row-reverse", margin: 12, borderRadius: 16, padding: 16, justifyContent: "space-around" },
  summaryItem: { alignItems: "center", gap: 4 },
  summaryVal: { color: "#fff", fontSize: 16, fontFamily: "Cairo_700Bold" },
  summaryLabel: { color: "#ffffff99", fontSize: 11, fontFamily: "Cairo_400Regular" },
  summaryDivider: { width: 1, backgroundColor: "#ffffff44" },
  topBar: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1 },
  pageTitle: { fontSize: 17, fontFamily: "Cairo_700Bold" },
  addBtn: { flexDirection: "row-reverse", alignItems: "center", gap: 6, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 12 },
  addBtnText: { color: "#fff", fontSize: 13, fontFamily: "Cairo_600SemiBold" },
  list: { paddingHorizontal: 12, paddingTop: 12, paddingBottom: 16, gap: 8 },
  card: { borderRadius: 14, borderWidth: 1, padding: 14 },
  cardRow: { flexDirection: "row-reverse", alignItems: "center", gap: 10 },
  avatar: { width: 40, height: 40, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  truckName: { fontSize: 14, fontFamily: "Cairo_600SemiBold" },
  note: { fontSize: 12, fontFamily: "Cairo_400Regular" },
  date: { fontSize: 11, fontFamily: "Cairo_400Regular" },
  statusDateRow: { flexDirection: "row-reverse", alignItems: "center", gap: 8, marginTop: 2 },
  statusPill: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 },
  statusPillText: { fontSize: 10, fontFamily: "Cairo_600SemiBold" },
  amount: { fontSize: 15, fontFamily: "Cairo_700Bold" },
  empty: { alignItems: "center", paddingVertical: 60, gap: 12 },
  emptyText: { fontSize: 14, fontFamily: "Cairo_400Regular" },
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "flex-end" },
  sheet: { borderTopLeftRadius: 22, borderTopRightRadius: 22, borderWidth: 1, borderBottomWidth: 0, maxHeight: "90%" },
  sheetHeader: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1 },
  sheetTitle: { fontSize: 17, fontFamily: "Cairo_600SemiBold" },
  saveBtn: { paddingHorizontal: 18, paddingVertical: 7, borderRadius: 10 },
  saveBtnText: { color: "#fff", fontSize: 14, fontFamily: "Cairo_600SemiBold" },
  truckNote: { flexDirection: "row-reverse", alignItems: "center", gap: 8, padding: 12, borderRadius: 12, borderWidth: 1, marginBottom: 4 },
  truckNoteText: { flex: 1, fontSize: 13, fontFamily: "Cairo_600SemiBold", textAlign: "right" },
  fieldLabel: { fontSize: 12, fontFamily: "Cairo_400Regular", marginBottom: 8, textAlign: "right" },
  chips: { flexDirection: "row-reverse", gap: 8, paddingVertical: 4, marginBottom: 4 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1 },
  chipText: { fontSize: 13, fontFamily: "Cairo_600SemiBold" },
  directionRow: { flexDirection: "row-reverse", gap: 10 },
  dirBtn: { flex: 1, flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 10, borderRadius: 12, borderWidth: 1 },
  dirBtnText: { fontSize: 12, fontFamily: "Cairo_600SemiBold" },
  input: { height: 46, borderRadius: 10, borderWidth: 1, paddingHorizontal: 14, fontSize: 14, fontFamily: "Cairo_400Regular" },
});
