import { Feather } from "@expo/vector-icons";
import { useRefreshOnFocus } from "@/hooks/useRefreshOnFocus";
import { useCallback, useState } from "react";
import {
  FlatList, Modal, RefreshControl, StyleSheet, Text,
  TextInput, View,
} from "react-native";
import { SyncBar } from "@/components/SyncBar";
import { AppButton, Avatar, EmptyState, PressableScale, ResultDialog } from "@/components/ui";
import type { DialogAction, ResultVariant } from "@/components/ui";
import { useSync } from "@/contexts/SyncContext";
import { Category, getDb } from "@/lib/db";
import { newSyncId } from "@/lib/uuid";
import { fonts } from "@/constants/tokens";
import { useTheme } from "@/hooks/useTheme";

export default function CategoriesScreen() {
  const t = useTheme();
  const c = t.color;
  const { triggerSync } = useSync();
  const [categories, setCategories] = useState<Category[]>([]);
  const [search, setSearch] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editItem, setEditItem] = useState<Category | null>(null);
  const [formName, setFormName] = useState("");
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
    const rows = await db.getAllAsync<Category>(
      `SELECT * FROM categories WHERE is_deleted = 0 ${q ? "AND name LIKE ?" : ""} ORDER BY name`,
      q ? [`%${q}%`] : []
    );
    setCategories(rows);
  }, [search]);

  useRefreshOnFocus(load);

  const onRefresh = async () => {
    setRefreshing(true);
    triggerSync();
    await load();
    setRefreshing(false);
  };

  const openAdd = () => { setEditItem(null); setFormName(""); setShowModal(true); };

  const openEdit = (item: Category) => {
    setEditItem(item);
    setFormName(item.name);
    setShowModal(true);
  };

  const handleDelete = (item: Category) => {
    showDialog("warning", "حذف الفئة", `هل تريد حذف "${item.name}"؟`, [
      { label: "إلغاء", variant: "tonal" },
      {
        label: "حذف", variant: "danger",
        onPress: async () => {
          const db = await getDb();
          if (!db) return;
          await db.runAsync(
            "UPDATE categories SET is_deleted = 1, updated_at = ?, _pending = 1 WHERE _lid = ?",
            [new Date().toISOString(), item._lid!]
          );
          triggerSync();
          load();
        },
      },
    ]);
  };

  const handleSave = async () => {
    if (!formName.trim()) { showDialog("error", "خطأ", "اسم الفئة مطلوب"); return; }
    setSaving(true);
    try {
      const db = await getDb();
      if (!db) return;
      const now = new Date().toISOString();
      if (editItem) {
        await db.runAsync(
          "UPDATE categories SET name = ?, updated_at = ?, _pending = 1 WHERE _lid = ?",
          [formName.trim(), now, editItem._lid!]
        );
      } else {
        await db.runAsync(
          "INSERT INTO categories (sync_id, name, updated_at, is_deleted, _pending) VALUES (?, ?, ?, 0, 1)",
          [newSyncId(), formName.trim(), now]
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
            placeholder="ابحث عن فئة..." placeholderTextColor={c.textFaint}
            value={search} onChangeText={setSearch} textAlign="right"
          />
        </View>
        <PressableScale
          style={[styles.addBtn, { backgroundColor: c.brand }]}
          onPress={openAdd}
          accessibilityRole="button"
          accessibilityLabel="إضافة فئة"
          haptic
        >
          <Feather name="plus" size={20} color={c.onBrand} />
        </PressableScale>
      </View>

      <FlatList
        data={categories}
        keyExtractor={i => i.sync_id}
        renderItem={({ item }) => (
          <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.hairline }]}>
            <View style={styles.cardRow}>
              <Avatar icon="tag" size={40} />
              <Text style={[styles.name, { color: c.text, flex: 1, textAlign: "right" }]}>{item.name}</Text>
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
            <EmptyState icon="search" title="لا توجد نتائج" subtitle={`لم نعثر على فئة باسم "${search}"`} />
          ) : (
            <EmptyState
              icon="tag"
              title="لا توجد فئات"
              subtitle="أضف أول فئة أو قم بالمزامنة لجلب القائمة"
              actionLabel="إضافة فئة"
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
              {editItem ? "تعديل الفئة" : "فئة جديدة"}
            </Text>
            <TextInput
              style={[styles.input, { backgroundColor: c.bg, borderColor: c.hairline, color: c.text }]}
              placeholder="اسم الفئة *" placeholderTextColor={c.textFaint}
              value={formName} onChangeText={setFormName} textAlign="right" autoFocus
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
  name: { fontSize: 15, fontFamily: fonts.semibold },
  iconBtn: { padding: 6 },
  empty: { alignItems: "center", paddingVertical: 60, gap: 12 },
  emptyText: { fontSize: 14, fontFamily: fonts.regular },
  overlay: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  modalBox: { width: "100%", borderRadius: 16, borderWidth: 1, padding: 20, gap: 12 },
  modalTitle: { fontSize: 17, fontFamily: fonts.bold, textAlign: "right" },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, height: 46, fontSize: 14, fontFamily: fonts.regular },
  modalActions: { flexDirection: "row-reverse", gap: 10, marginTop: 4 },
});
