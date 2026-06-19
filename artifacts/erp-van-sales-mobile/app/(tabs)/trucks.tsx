import { Feather } from "@expo/vector-icons";
import { useRefreshOnFocus } from "@/hooks/useRefreshOnFocus";
import { useCallback, useState } from "react";
import {
  FlatList, Modal, RefreshControl, StyleSheet, Text,
  TextInput, View,
} from "react-native";
import { SyncBar } from "@/components/SyncBar";
import { AppButton, EmptyState, MoneyText, PressableScale, ResultDialog } from "@/components/ui";
import type { DialogAction, ResultVariant } from "@/components/ui";
import { useSync } from "@/contexts/SyncContext";
import { Truck, getDb } from "@/lib/db";
import { newSyncId } from "@/lib/uuid";
import { fonts } from "@/constants/tokens";
import { useTheme } from "@/hooks/useTheme";

export default function TrucksScreen() {
  const t = useTheme();
  const c = t.color;
  const { triggerSync } = useSync();
  const [trucks, setTrucks] = useState<Truck[]>([]);
  const [search, setSearch] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editItem, setEditItem] = useState<Truck | null>(null);
  const [formName, setFormName] = useState("");
  const [formPlate, setFormPlate] = useState("");
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
    const q = search.trim();
    const rows = await db.getAllAsync<Truck>(
      `SELECT * FROM trucks WHERE is_deleted = 0 ${q ? "AND (name LIKE ? OR plate_number LIKE ?)" : ""} ORDER BY name`,
      q ? [`%${q}%`, `%${q}%`] : []
    );
    setTrucks(rows);
  }, [search]);

  useRefreshOnFocus(load);

  const onRefresh = async () => {
    setRefreshing(true);
    triggerSync();
    await load();
    setRefreshing(false);
  };

  const openAdd = () => { setEditItem(null); setFormName(""); setFormPlate(""); setShowModal(true); };

  const openEdit = (item: Truck) => {
    setEditItem(item);
    setFormName(item.name);
    setFormPlate(item.plate_number ?? "");
    setShowModal(true);
  };

  const handleDelete = (item: Truck) => {
    showDialog("warning", "حذف الشاحنة", `هل تريد حذف "${item.name}"؟`, [
      { label: "إلغاء", variant: "tonal" },
      {
        label: "حذف", variant: "danger",
        onPress: async () => {
          const db = await getDb();
          if (!db) return;
          await db.runAsync(
            "UPDATE trucks SET is_deleted = 1, updated_at = ?, _pending = 1 WHERE _lid = ?",
            [new Date().toISOString(), item._lid!]
          );
          triggerSync();
          load();
        },
      },
    ]);
  };

  const handleSave = async () => {
    if (!formName.trim()) { showDialog("error", "خطأ", "اسم الشاحنة مطلوب"); return; }
    setSaving(true);
    try {
      const db = await getDb();
      if (!db) return;
      const now = new Date().toISOString();
      if (editItem) {
        await db.runAsync(
          "UPDATE trucks SET name = ?, plate_number = ?, updated_at = ?, _pending = 1 WHERE _lid = ?",
          [formName.trim(), formPlate.trim() || null, now, editItem._lid!]
        );
      } else {
        await db.runAsync(
          "INSERT INTO trucks (sync_id, name, plate_number, cash_balance, updated_at, is_deleted, _pending) VALUES (?, ?, ?, 0, ?, 0, 1)",
          [newSyncId(), formName.trim(), formPlate.trim() || null, now]
        );
      }
      setShowModal(false);
      triggerSync();
      load();
    } catch (e: any) {
      showDialog("error", "خطأ", e?.message ?? "فشل الحفظ");
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: c.bg }]}>
      <SyncBar />
      <View style={styles.header}>
        <View style={[styles.searchBar, { backgroundColor: c.surface, borderColor: c.hairline }]}>
          <Feather name="search" size={16} color={c.textMuted} />
          <TextInput
            style={[styles.searchInput, { color: c.text }]}
            placeholder="ابحث عن شاحنة..." placeholderTextColor={c.textFaint}
            value={search} onChangeText={setSearch} textAlign="right"
          />
        </View>
        <PressableScale
          style={[styles.addBtn, { backgroundColor: c.brand }]}
          onPress={openAdd}
          accessibilityRole="button"
          accessibilityLabel="إضافة شاحنة"
          haptic
        >
          <Feather name="plus" size={20} color={c.onBrand} />
        </PressableScale>
      </View>

      <FlatList
        data={trucks}
        keyExtractor={i => i.sync_id}
        renderItem={({ item }) => (
          <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.hairline }]}>
            <View style={styles.cardRow}>
              <View style={[styles.avatar, { backgroundColor: c.brandTint }]}>
                <Feather name="truck" size={18} color={c.brandText} />
              </View>
              <View style={{ flex: 1, alignItems: "flex-end" }}>
                <Text style={[styles.name, { color: c.text }]}>{item.name}</Text>
                {item.plate_number && (
                  <Text style={[styles.sub, { color: c.textMuted }]}>{item.plate_number}</Text>
                )}
              </View>
              <View style={{ alignItems: "flex-end" }}>
                <MoneyText amount={item.cash_balance ?? 0} size="callout" />
                <Text style={[styles.cashLabel, { color: c.textMuted }]}>الصندوق</Text>
              </View>
              <PressableScale onPress={() => openEdit(item)} style={styles.iconBtn} hitSlop={6} accessibilityLabel="تعديل">
                <Feather name="edit-2" size={16} color={c.textMuted} />
              </PressableScale>
              <PressableScale onPress={() => handleDelete(item)} style={styles.iconBtn} hitSlop={6} accessibilityLabel="حذف">
                <Feather name="trash-2" size={16} color={c.danger} />
              </PressableScale>
            </View>
          </View>
        )}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.brand} />}
        ListEmptyComponent={
          search ? (
            <EmptyState icon="search" title="لا توجد نتائج" subtitle={`لم نعثر على شاحنة باسم "${search}"`} />
          ) : (
            <EmptyState
              icon="truck"
              title="لا توجد شاحنات"
              subtitle="أضف أول شاحنة أو قم بالمزامنة لجلب القائمة"
              actionLabel="إضافة شاحنة"
              actionIcon="plus"
              onAction={openAdd}
            />
          )
        }
        showsVerticalScrollIndicator={false}
      />

      <Modal visible={showModal} animationType="fade" transparent onRequestClose={() => setShowModal(false)}>
        <View style={[styles.overlay, { backgroundColor: c.scrim }]}>
          <View style={[styles.modalBox, { backgroundColor: c.surface, borderColor: c.hairline }]}>
            <Text style={[styles.modalTitle, { color: c.text }]}>
              {editItem ? "تعديل الشاحنة" : "شاحنة جديدة"}
            </Text>
            <TextInput
              style={[styles.input, { backgroundColor: c.bg, borderColor: c.hairline, color: c.text }]}
              placeholder="اسم الشاحنة *" placeholderTextColor={c.textFaint}
              value={formName} onChangeText={setFormName} textAlign="right" autoFocus
            />
            <TextInput
              style={[styles.input, { backgroundColor: c.bg, borderColor: c.hairline, color: c.text }]}
              placeholder="رقم اللوحة (اختياري)" placeholderTextColor={c.textFaint}
              value={formPlate} onChangeText={setFormPlate} textAlign="right"
            />
            <View style={styles.modalActions}>
              <AppButton label="إلغاء" variant="tonal" size="lg" onPress={() => setShowModal(false)} style={{ flex: 1 }} />
              <AppButton
                label={saving ? "جاري..." : "حفظ"}
                variant="primary"
                size="lg"
                loading={saving}
                disabled={!formName.trim()}
                onPress={handleSave}
                style={{ flex: 2 }}
              />
            </View>
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
  header: { flexDirection: "row-reverse", gap: 8, margin: 12, alignItems: "center" },
  searchBar: { flex: 1, flexDirection: "row-reverse", alignItems: "center", gap: 8, paddingHorizontal: 14, height: 44, borderRadius: 12, borderWidth: 1 },
  searchInput: { flex: 1, fontSize: 14, fontFamily: fonts.regular },
  addBtn: { width: 44, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  list: { paddingHorizontal: 12, paddingBottom: 16, gap: 8 },
  card: { borderRadius: 14, borderWidth: 1, padding: 14 },
  cardRow: { flexDirection: "row-reverse", alignItems: "center", gap: 10 },
  avatar: { width: 40, height: 40, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  name: { fontSize: 15, fontFamily: fonts.semibold },
  sub: { fontSize: 12, fontFamily: fonts.regular },
  cashLabel: { fontSize: 11, fontFamily: fonts.regular },
  iconBtn: { padding: 6 },
  empty: { alignItems: "center", paddingVertical: 60, gap: 12 },
  emptyText: { fontSize: 14, fontFamily: fonts.regular },
  overlay: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  modalBox: { width: "100%", borderRadius: 16, borderWidth: 1, padding: 20, gap: 12 },
  modalTitle: { fontSize: 17, fontFamily: fonts.bold, textAlign: "right" },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, height: 46, fontSize: 14, fontFamily: fonts.regular },
  modalActions: { flexDirection: "row-reverse", gap: 10, marginTop: 4 },
});
