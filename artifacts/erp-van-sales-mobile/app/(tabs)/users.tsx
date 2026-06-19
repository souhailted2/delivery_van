import { Feather } from "@expo/vector-icons";
import { useRefreshOnFocus } from "@/hooks/useRefreshOnFocus";
import { useCallback, useState } from "react";
import {
  FlatList, Modal, RefreshControl, ScrollView, StyleSheet, Text,
  TextInput, View,
} from "react-native";
import { SyncBar } from "@/components/SyncBar";
import { AppButton, Avatar, EmptyState, PressableScale, ResultDialog, StatusPill } from "@/components/ui";
import type { DialogAction, ResultVariant } from "@/components/ui";
import { useSync } from "@/contexts/SyncContext";
import { MobileUser, getDb } from "@/lib/db";
import { newSyncId } from "@/lib/uuid";
import { fonts } from "@/constants/tokens";
import { useTheme } from "@/hooks/useTheme";

const ROLES = [
  { value: "admin", label: "مدير" },
  { value: "vendeur", label: "بائع" },
];

export default function UsersScreen() {
  const t = useTheme();
  const c = t.color;
  const { triggerSync } = useSync();
  const [users, setUsers] = useState<MobileUser[]>([]);
  const [search, setSearch] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editItem, setEditItem] = useState<MobileUser | null>(null);
  const [formUsername, setFormUsername] = useState("");
  const [formFullName, setFormFullName] = useState("");
  const [formRole, setFormRole] = useState("vendeur");
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
    const rows = await db.getAllAsync<MobileUser>(
      `SELECT * FROM users WHERE is_deleted = 0 ${q ? "AND (username LIKE ? OR full_name LIKE ?)" : ""} ORDER BY username`,
      q ? [`%${q}%`, `%${q}%`] : []
    );
    setUsers(rows);
  }, [search]);

  useRefreshOnFocus(load);

  const onRefresh = async () => {
    setRefreshing(true);
    triggerSync();
    await load();
    setRefreshing(false);
  };

  const openAdd = () => {
    setEditItem(null); setFormUsername(""); setFormFullName(""); setFormRole("vendeur");
    setShowModal(true);
  };

  const openEdit = (item: MobileUser) => {
    setEditItem(item);
    setFormUsername(item.username);
    setFormFullName(item.full_name ?? "");
    setFormRole(item.role ?? "vendeur");
    setShowModal(true);
  };

  const handleDelete = (item: MobileUser) => {
    showDialog("warning", "حذف المستخدم", `هل تريد حذف "${item.username}"؟`, [
      { label: "إلغاء", variant: "tonal" },
      {
        label: "حذف", variant: "danger",
        onPress: async () => {
          const db = await getDb();
          if (!db) return;
          await db.runAsync(
            "UPDATE users SET is_deleted = 1, updated_at = ?, _pending = 1 WHERE _lid = ?",
            [new Date().toISOString(), item._lid!]
          );
          triggerSync();
          load();
        },
      },
    ]);
  };

  const handleSave = async () => {
    if (!formUsername.trim()) { showDialog("error", "خطأ", "اسم المستخدم مطلوب"); return; }
    setSaving(true);
    try {
      const db = await getDb();
      if (!db) return;
      const now = new Date().toISOString();
      if (editItem) {
        await db.runAsync(
          "UPDATE users SET username = ?, full_name = ?, role = ?, updated_at = ?, _pending = 1 WHERE _lid = ?",
          [formUsername.trim(), formFullName.trim() || null, formRole, now, editItem._lid!]
        );
      } else {
        await db.runAsync(
          "INSERT INTO users (sync_id, username, full_name, role, updated_at, is_deleted, _pending) VALUES (?, ?, ?, ?, ?, 0, 1)",
          [newSyncId(), formUsername.trim(), formFullName.trim() || null, formRole, now]
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
            placeholder="ابحث عن مستخدم..." placeholderTextColor={c.textFaint}
            value={search} onChangeText={setSearch} textAlign="right"
          />
        </View>
        <PressableScale
          style={[styles.addBtn, { backgroundColor: c.brand }]}
          onPress={openAdd}
          accessibilityRole="button"
          accessibilityLabel="إضافة مستخدم"
          haptic
        >
          <Feather name="user-plus" size={18} color={c.onBrand} />
        </PressableScale>
      </View>

      <FlatList
        data={users}
        keyExtractor={i => i.sync_id}
        renderItem={({ item }) => {
          const roleLabel = ROLES.find(r => r.value === item.role)?.label ?? item.role;
          return (
            <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.hairline }]}>
              <View style={styles.cardRow}>
                <Avatar name={item.username} icon="user" size={40} />
                <View style={{ flex: 1, alignItems: "flex-end" }}>
                  <Text style={[styles.username, { color: c.text }]}>{item.username}</Text>
                  {item.full_name && <Text style={[styles.sub, { color: c.textMuted }]}>{item.full_name}</Text>}
                </View>
                <StatusPill status="neutral" label={roleLabel} />
                <PressableScale onPress={() => openEdit(item)} style={styles.iconBtn} hitSlop={6} accessibilityLabel="تعديل">
                  <Feather name="edit-2" size={16} color={c.textMuted} />
                </PressableScale>
                <PressableScale onPress={() => handleDelete(item)} style={styles.iconBtn} hitSlop={6} accessibilityLabel="حذف">
                  <Feather name="trash-2" size={16} color={c.danger} />
                </PressableScale>
              </View>
            </View>
          );
        }}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.brand} />}
        ListEmptyComponent={
          search ? (
            <EmptyState icon="search" title="لا توجد نتائج" subtitle={`لم نعثر على مستخدم باسم "${search}"`} />
          ) : (
            <EmptyState
              icon="users"
              title="لا يوجد مستخدمون"
              subtitle="أضف أول مستخدم أو قم بالمزامنة لجلب القائمة"
              actionLabel="إضافة مستخدم"
              actionIcon="user-plus"
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
                {editItem ? "تعديل المستخدم" : "مستخدم جديد"}
              </Text>
              <AppButton label={saving ? "جاري..." : "حفظ"} size="sm" loading={saving} onPress={handleSave} />
            </View>
            <ScrollView style={styles.sheetScroll} keyboardShouldPersistTaps="handled">
              <View style={styles.fieldGroup}>
                <Text style={[styles.label, { color: c.textMuted }]}>اسم المستخدم *</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: c.bg, borderColor: c.hairline, color: c.text }]}
                  value={formUsername} onChangeText={setFormUsername}
                  placeholder="username" placeholderTextColor={c.textFaint}
                  autoCapitalize="none" autoFocus
                />
              </View>
              <View style={styles.fieldGroup}>
                <Text style={[styles.label, { color: c.textMuted }]}>الاسم الكامل</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: c.bg, borderColor: c.hairline, color: c.text }]}
                  value={formFullName} onChangeText={setFormFullName}
                  placeholder="الاسم الكامل" placeholderTextColor={c.textFaint}
                  textAlign="right"
                />
              </View>
              <View style={styles.fieldGroup}>
                <Text style={[styles.label, { color: c.textMuted }]}>الدور</Text>
                <View style={styles.roleRow}>
                  {ROLES.map(r => (
                    <PressableScale
                      key={r.value}
                      style={[styles.roleBtn, {
                        backgroundColor: formRole === r.value ? c.brand : c.surfaceElevated,
                        borderColor: formRole === r.value ? c.brand : c.hairline,
                      }]}
                      onPress={() => setFormRole(r.value)}
                    >
                      <Text style={[styles.roleBtnText, { color: formRole === r.value ? c.onBrand : c.text }]}>
                        {r.label}
                      </Text>
                    </PressableScale>
                  ))}
                </View>
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
  username: { fontSize: 15, fontFamily: fonts.semibold },
  sub: { fontSize: 12, fontFamily: fonts.regular },
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
  roleRow: { flexDirection: "row-reverse", gap: 10 },
  roleBtn: { flex: 1, height: 44, borderRadius: 10, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  roleBtnText: { fontSize: 14, fontFamily: fonts.semibold },
});
