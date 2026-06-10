import { Feather } from "@expo/vector-icons";
import { useCallback, useEffect, useState } from "react";
import {
  Alert, FlatList, Modal, RefreshControl, ScrollView, StyleSheet, Text,
  TextInput, TouchableOpacity, View,
} from "react-native";
import { SyncBar } from "@/components/SyncBar";
import { useSync } from "@/contexts/SyncContext";
import { CashTransfer, getDb } from "@/lib/db";
import { newSyncId } from "@/lib/uuid";
import { useColors } from "@/hooks/useColors";

interface CashRow extends CashTransfer { truck_name?: string; }
interface TruckRow { id: number; name: string; cash_balance: number; }

export default function CaisseScreen() {
  const colors = useColors();
  const { triggerSync } = useSync();
  const [transfers, setTransfers] = useState<CashRow[]>([]);
  const [trucks, setTrucks] = useState<TruckRow[]>([]);
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
       WHERE ct.is_deleted = 0 ORDER BY ct.created_at DESC LIMIT 200`
    );
    setTransfers(rows);
    const truckRows = await db.getAllAsync<TruckRow>(
      "SELECT id, name, cash_balance FROM trucks WHERE is_deleted = 0 ORDER BY name"
    );
    setTrucks(truckRows);
  }, []);

  useEffect(() => { load(); }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    triggerSync();
    await load();
    setRefreshing(false);
  };

  const openModal = () => {
    setFormTruckId(""); setFormAmount(""); setFormDirection("in"); setFormNote("");
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!formTruckId) { Alert.alert("تنبيه", "اختر الشاحنة"); return; }
    const amount = parseFloat(formAmount);
    if (!amount || amount <= 0) { Alert.alert("تنبيه", "أدخل مبلغاً صحيحاً"); return; }
    setSaving(true);
    try {
      const db = await getDb();
      if (!db) return;
      const now = new Date().toISOString();
      await db.runAsync(
        `INSERT INTO cash_transfers (sync_id, truck_id, amount, direction, note, created_at, updated_at, is_deleted, _pending)
         VALUES (?, ?, ?, ?, ?, ?, ?, 0, 1)`,
        [newSyncId(), Number(formTruckId), amount, formDirection, formNote.trim() || null, now, now]
      );
      // تحديث رصيد الشاحنة محلياً: تحصيل = يُنقص من الشاحنة, صرف = يزيد للشاحنة
      const delta = formDirection === "in" ? -amount : amount;
      await db.runAsync(
        "UPDATE trucks SET cash_balance = cash_balance + ?, updated_at = ?, _pending = 1 WHERE id = ?",
        [delta, now, Number(formTruckId)]
      );
      setShowModal(false);
      triggerSync();
      load();
    } catch (e: any) {
      Alert.alert("خطأ", e?.message ?? "فشل الحفظ");
    } finally {
      setSaving(false);
    }
  };

  const totalIn = transfers.filter(t => t.direction === "in").reduce((s, t) => s + Number(t.amount ?? 0), 0);
  const totalOut = transfers.filter(t => t.direction === "out").reduce((s, t) => s + Number(t.amount ?? 0), 0);
  const fmt = (n: number) => n.toLocaleString("fr-DZ") + " د.ج";

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <SyncBar />

      <View style={[styles.summary, { backgroundColor: colors.primary }]}>
        <View style={styles.summaryItem}>
          <Text style={styles.summaryVal}>{fmt(totalIn)}</Text>
          <Text style={styles.summaryLabel}>إجمالي التحصيل</Text>
        </View>
        <View style={styles.summaryDivider} />
        <View style={styles.summaryItem}>
          <Text style={styles.summaryVal}>{fmt(totalOut)}</Text>
          <Text style={styles.summaryLabel}>إجمالي الصرف</Text>
        </View>
      </View>

      <View style={[styles.topBar, { borderBottomColor: colors.border }]}>
        <TouchableOpacity style={[styles.addBtn, { backgroundColor: colors.primary }]} onPress={openModal}>
          <Feather name="plus" size={16} color="#fff" />
          <Text style={styles.addBtnText}>حركة جديدة</Text>
        </TouchableOpacity>
        <Text style={[styles.pageTitle, { color: colors.foreground }]}>الصندوق</Text>
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
                  <Text style={[styles.date, { color: colors.mutedForeground }]}>
                    {item.created_at ? new Date(item.created_at).toLocaleDateString("ar-DZ") : ""}
                  </Text>
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
              <Text style={[styles.sheetTitle, { color: colors.foreground }]}>حركة جديدة</Text>
              <TouchableOpacity
                style={[styles.saveBtn, { backgroundColor: saving ? colors.muted : colors.primary }]}
                onPress={handleSave} disabled={saving}
              >
                <Text style={styles.saveBtnText}>{saving ? "جاري..." : "حفظ"}</Text>
              </TouchableOpacity>
            </View>
            <ScrollView style={{ padding: 16 }} keyboardShouldPersistTaps="handled">
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
  amount: { fontSize: 15, fontFamily: "Cairo_700Bold" },
  empty: { alignItems: "center", paddingVertical: 60, gap: 12 },
  emptyText: { fontSize: 14, fontFamily: "Cairo_400Regular" },
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "flex-end" },
  sheet: { borderTopLeftRadius: 22, borderTopRightRadius: 22, borderWidth: 1, borderBottomWidth: 0, maxHeight: "90%" },
  sheetHeader: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1 },
  sheetTitle: { fontSize: 17, fontFamily: "Cairo_600SemiBold" },
  saveBtn: { paddingHorizontal: 18, paddingVertical: 7, borderRadius: 10 },
  saveBtnText: { color: "#fff", fontSize: 14, fontFamily: "Cairo_600SemiBold" },
  fieldLabel: { fontSize: 12, fontFamily: "Cairo_400Regular", marginBottom: 8, textAlign: "right" },
  chips: { flexDirection: "row-reverse", gap: 8, paddingVertical: 4, marginBottom: 4 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1 },
  chipText: { fontSize: 13, fontFamily: "Cairo_600SemiBold" },
  directionRow: { flexDirection: "row-reverse", gap: 10 },
  dirBtn: { flex: 1, flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 10, borderRadius: 12, borderWidth: 1 },
  dirBtnText: { fontSize: 12, fontFamily: "Cairo_600SemiBold" },
  input: { height: 46, borderRadius: 10, borderWidth: 1, paddingHorizontal: 14, fontSize: 14, fontFamily: "Cairo_400Regular" },
});
