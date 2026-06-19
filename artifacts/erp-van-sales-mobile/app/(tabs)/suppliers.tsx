import { Feather } from "@expo/vector-icons";
import { useRefreshOnFocus } from "@/hooks/useRefreshOnFocus";
import { useCallback, useState } from "react";
import {
  FlatList, Modal, RefreshControl, ScrollView, StyleSheet, Text,
  TextInput, View,
} from "react-native";
import { SyncBar } from "@/components/SyncBar";
import { AppButton, Avatar, EmptyState, PressableScale, ResultDialog } from "@/components/ui";
import type { DialogAction, ResultVariant } from "@/components/ui";
import { useSync } from "@/contexts/SyncContext";
import { Supplier, getDb } from "@/lib/db";
import { newSyncId } from "@/lib/uuid";
import { fonts } from "@/constants/tokens";
import { useTheme } from "@/hooks/useTheme";

export default function SuppliersScreen() {
  const t = useTheme();
  const c = t.color;
  const { triggerSync } = useSync();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [search, setSearch] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editItem, setEditItem] = useState<Supplier | null>(null);
  const [formName, setFormName] = useState("");
  const [formPhone, setFormPhone] = useState("");
  const [formAddress, setFormAddress] = useState("");
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
    const rows = await db.getAllAsync<Supplier>(
      `SELECT * FROM suppliers WHERE is_deleted = 0 ${q ? "AND (name LIKE ? OR phone LIKE ?)" : ""} ORDER BY name`,
      q ? [`%${q}%`, `%${q}%`] : []
    );
    setSuppliers(rows);
  }, [search]);

  useRefreshOnFocus(load);

  const onRefresh = async () => {
    setRefreshing(true);
    triggerSync();
    await load();
    setRefreshing(false);
  };

  const openAdd = () => { setEditItem(null); setFormName(""); setFormPhone(""); setFormAddress(""); setShowModal(true); };

  const openEdit = (item: Supplier) => {
    setEditItem(item);
    setFormName(item.name);
    setFormPhone(item.phone ?? "");
    setFormAddress(item.address ?? "");
    setShowModal(true);
  };

  const handleDelete = (item: Supplier) => {
    showDialog("warning", "حذف المورد", `هل تريد حذف "${item.name}"؟`, [
      { label: "إلغاء", variant: "tonal" },
      {
        label: "حذف", variant: "danger",
        onPress: async () => {
          const db = await getDb();
          if (!db) return;
          await db.runAsync(
            "UPDATE suppliers SET is_deleted = 1, updated_at = ?, _pending = 1 WHERE _lid = ?",
            [new Date().toISOString(), item._lid!]
          );
          triggerSync();
          load();
        },
      },
    ]);
  };

  const handleSave = async () => {
    if (!formName.trim()) { showDialog("error", "خطأ", "اسم المورد مطلوب"); return; }
    setSaving(true);
    try {
      const db = await getDb();
      if (!db) return;
      const now = new Date().toISOString();
      if (editItem) {
        await db.runAsync(
          "UPDATE suppliers SET name = ?, phone = ?, address = ?, updated_at = ?, _pending = 1 WHERE _lid = ?",
          [formName.trim(), formPhone.trim() || null, formAddress.trim() || null, now, editItem._lid!]
        );
      } else {
        await db.runAsync(
          "INSERT INTO suppliers (sync_id, name, phone, address, updated_at, is_deleted, _pending) VALUES (?, ?, ?, ?, ?, 0, 1)",
          [newSyncId(), formName.trim(), formPhone.trim() || null, formAddress.trim() || null, now]
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
            placeholder="ابحث عن مورد..." placeholderTextColor={c.textFaint}
            value={search} onChangeText={setSearch} textAlign="right"
          />
        </View>
        <PressableScale
          style={[styles.addBtn, { backgroundColor: c.brand }]}
          onPress={openAdd}
          accessibilityRole="button"
          accessibilityLabel="إضافة مورد"
          haptic
        >
          <Feather name="plus" size={20} color={c.onBrand} />
        </PressableScale>
      </View>

      <FlatList
        data={suppliers}
        keyExtractor={i => i.sync_id}
        renderItem={({ item }) => (
          <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.hairline }]}>
            <View style={styles.cardRow}>
              <Avatar name={item.name} size={40} />
              <View style={{ flex: 1, alignItems: "flex-end" }}>
                <Text style={[styles.name, { color: c.text }]}>{item.name}</Text>
                {item.phone && <Text style={[styles.sub, { color: c.textMuted }]}>{item.phone}</Text>}
                {item.address && <Text style={[styles.sub, { color: c.textMuted }]}>{item.address}</Text>}
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
            <EmptyState icon="search" title="لا توجد نتائج" subtitle={`لم نعثر على مورد باسم "${search}"`} />
          ) : (
            <EmptyState
              icon="briefcase"
              title="لا يوجد موردون"
              subtitle="أضف أول مورد أو قم بالمزامنة لجلب القائمة"
              actionLabel="إضافة مورد"
              actionIcon="plus"
              onAction={openAdd}
            />
          )
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
              <Text style={[styles.sheetTitle, { color: c.text }]}>
                {editItem ? "تعديل المورد" : "مورد جديد"}
              </Text>
              <AppButton label={saving ? "جاري..." : "حفظ"} size="sm" loading={saving} onPress={handleSave} />
            </View>
            <ScrollView style={styles.sheetScroll} keyboardShouldPersistTaps="handled">
              <View style={styles.fieldGroup}>
                <Text style={[styles.label, { color: c.textMuted }]}>اسم المورد *</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: c.bg, borderColor: c.hairline, color: c.text }]}
                  value={formName} onChangeText={setFormName}
                  placeholder="اسم المورد" placeholderTextColor={c.textFaint}
                  textAlign="right" autoFocus
                />
              </View>
              <View style={styles.fieldGroup}>
                <Text style={[styles.label, { color: c.textMuted }]}>الهاتف</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: c.bg, borderColor: c.hairline, color: c.text }]}
                  value={formPhone} onChangeText={setFormPhone}
                  placeholder="رقم الهاتف" placeholderTextColor={c.textFaint}
                  keyboardType="phone-pad" textAlign="right"
                />
              </View>
              <View style={styles.fieldGroup}>
                <Text style={[styles.label, { color: c.textMuted }]}>العنوان</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: c.bg, borderColor: c.hairline, color: c.text }]}
                  value={formAddress} onChangeText={setFormAddress}
                  placeholder="العنوان" placeholderTextColor={c.textFaint}
                  textAlign="right"
                />
              </View>
              <View style={{ height: 32 }} />
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
  header: { flexDirection: "row-reverse", gap: 8, margin: 12, alignItems: "center" },
  searchBar: { flex: 1, flexDirection: "row-reverse", alignItems: "center", gap: 8, paddingHorizontal: 14, height: 44, borderRadius: 12, borderWidth: 1 },
  searchInput: { flex: 1, fontSize: 14, fontFamily: fonts.regular },
  addBtn: { width: 44, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  list: { paddingHorizontal: 12, paddingBottom: 16, gap: 8 },
  card: { borderRadius: 14, borderWidth: 1, padding: 14 },
  cardRow: { flexDirection: "row-reverse", alignItems: "center", gap: 10 },
  name: { fontSize: 15, fontFamily: fonts.semibold },
  sub: { fontSize: 12, fontFamily: fonts.regular, marginTop: 2 },
  iconBtn: { padding: 6 },
  empty: { alignItems: "center", paddingVertical: 60, gap: 12 },
  emptyText: { fontSize: 14, fontFamily: fonts.regular },
  overlay: { flex: 1, justifyContent: "flex-end" },
  sheet: { borderTopLeftRadius: 22, borderTopRightRadius: 22, borderWidth: 1, borderBottomWidth: 0, maxHeight: "85%" },
  sheetHeader: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1 },
  sheetTitle: { fontSize: 17, fontFamily: fonts.semibold },
  sheetScroll: { paddingHorizontal: 16, paddingTop: 16 },
  fieldGroup: { marginBottom: 14 },
  label: { fontSize: 12, fontFamily: fonts.regular, marginBottom: 6, textAlign: "right" },
  input: { height: 44, borderRadius: 10, borderWidth: 1, paddingHorizontal: 12, fontSize: 14, fontFamily: fonts.regular },
});
