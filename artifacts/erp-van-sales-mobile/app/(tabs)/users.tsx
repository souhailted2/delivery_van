import { Feather } from "@expo/vector-icons";
import { useCallback, useEffect, useState } from "react";
import {
  Alert, FlatList, Modal, RefreshControl, ScrollView, StyleSheet, Text,
  TextInput, TouchableOpacity, View,
} from "react-native";
import { SyncBar } from "@/components/SyncBar";
import { useSync } from "@/contexts/SyncContext";
import { MobileUser, getDb } from "@/lib/db";
import { newSyncId } from "@/lib/uuid";
import { useColors } from "@/hooks/useColors";

const ROLES = [
  { value: "admin", label: "مدير" },
  { value: "vendeur", label: "بائع" },
];
const ROLE_COLORS: Record<string, string> = { admin: "#8b5cf6", vendeur: "#3b82f6" };

export default function UsersScreen() {
  const colors = useColors();
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

  useEffect(() => { load(); }, [load]);

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
    Alert.alert("حذف المستخدم", `هل تريد حذف "${item.username}"؟`, [
      { text: "إلغاء", style: "cancel" },
      {
        text: "حذف", style: "destructive",
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
    if (!formUsername.trim()) { Alert.alert("خطأ", "اسم المستخدم مطلوب"); return; }
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
      Alert.alert("خطأ", e?.message ?? "فشل الحفظ");
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <SyncBar />
      <View style={styles.header}>
        <View style={[styles.searchBar, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Feather name="search" size={16} color={colors.mutedForeground} />
          <TextInput
            style={[styles.searchInput, { color: colors.foreground }]}
            placeholder="ابحث عن مستخدم..." placeholderTextColor={colors.mutedForeground}
            value={search} onChangeText={setSearch} textAlign="right"
          />
        </View>
        <TouchableOpacity style={[styles.addBtn, { backgroundColor: colors.primary }]} onPress={openAdd}>
          <Feather name="user-plus" size={18} color="#fff" />
        </TouchableOpacity>
      </View>

      <FlatList
        data={users}
        keyExtractor={i => i.sync_id}
        renderItem={({ item }) => {
          const roleColor = ROLE_COLORS[item.role ?? "vendeur"] ?? colors.primary;
          const roleLabel = ROLES.find(r => r.value === item.role)?.label ?? item.role;
          return (
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={styles.cardRow}>
                <View style={[styles.avatar, { backgroundColor: roleColor + "22" }]}>
                  <Feather name="user" size={18} color={roleColor} />
                </View>
                <View style={{ flex: 1, alignItems: "flex-end" }}>
                  <Text style={[styles.username, { color: colors.foreground }]}>{item.username}</Text>
                  {item.full_name && <Text style={[styles.sub, { color: colors.mutedForeground }]}>{item.full_name}</Text>}
                </View>
                <View style={[styles.roleBadge, { backgroundColor: roleColor + "22" }]}>
                  <Text style={[styles.roleText, { color: roleColor }]}>{roleLabel}</Text>
                </View>
                <TouchableOpacity onPress={() => openEdit(item)} style={styles.iconBtn}>
                  <Feather name="edit-2" size={16} color={colors.mutedForeground} />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => handleDelete(item)} style={styles.iconBtn}>
                  <Feather name="trash-2" size={16} color={colors.destructive} />
                </TouchableOpacity>
              </View>
            </View>
          );
        }}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Feather name="users" size={40} color={colors.muted} />
            <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
              {search ? "لا توجد نتائج" : "لا يوجد مستخدمون"}
            </Text>
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
              <Text style={[styles.sheetTitle, { color: colors.foreground }]}>
                {editItem ? "تعديل المستخدم" : "مستخدم جديد"}
              </Text>
              <TouchableOpacity
                style={[styles.saveBtn, { backgroundColor: saving ? colors.muted : colors.primary }]}
                onPress={handleSave} disabled={saving}
              >
                <Text style={styles.saveBtnText}>{saving ? "جاري..." : "حفظ"}</Text>
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.sheetScroll} keyboardShouldPersistTaps="handled">
              <View style={styles.fieldGroup}>
                <Text style={[styles.label, { color: colors.mutedForeground }]}>اسم المستخدم *</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]}
                  value={formUsername} onChangeText={setFormUsername}
                  placeholder="username" placeholderTextColor={colors.mutedForeground}
                  autoCapitalize="none" autoFocus
                />
              </View>
              <View style={styles.fieldGroup}>
                <Text style={[styles.label, { color: colors.mutedForeground }]}>الاسم الكامل</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]}
                  value={formFullName} onChangeText={setFormFullName}
                  placeholder="الاسم الكامل" placeholderTextColor={colors.mutedForeground}
                  textAlign="right"
                />
              </View>
              <View style={styles.fieldGroup}>
                <Text style={[styles.label, { color: colors.mutedForeground }]}>الدور</Text>
                <View style={styles.roleRow}>
                  {ROLES.map(r => (
                    <TouchableOpacity
                      key={r.value}
                      style={[styles.roleBtn, {
                        backgroundColor: formRole === r.value ? (ROLE_COLORS[r.value] ?? colors.primary) : colors.card,
                        borderColor: formRole === r.value ? (ROLE_COLORS[r.value] ?? colors.primary) : colors.border,
                      }]}
                      onPress={() => setFormRole(r.value)}
                    >
                      <Text style={[styles.roleBtnText, { color: formRole === r.value ? "#fff" : colors.foreground }]}>
                        {r.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
              <View style={{ height: 32 }} />
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row-reverse", gap: 8, margin: 12, alignItems: "center" },
  searchBar: { flex: 1, flexDirection: "row-reverse", alignItems: "center", gap: 8, paddingHorizontal: 14, height: 44, borderRadius: 12, borderWidth: 1 },
  searchInput: { flex: 1, fontSize: 14, fontFamily: "Cairo_400Regular" },
  addBtn: { width: 44, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  list: { paddingHorizontal: 12, paddingBottom: 16, gap: 8 },
  card: { borderRadius: 14, borderWidth: 1, padding: 14 },
  cardRow: { flexDirection: "row-reverse", alignItems: "center", gap: 10 },
  avatar: { width: 40, height: 40, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  username: { fontSize: 15, fontFamily: "Cairo_600SemiBold" },
  sub: { fontSize: 12, fontFamily: "Cairo_400Regular" },
  roleBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  roleText: { fontSize: 11, fontFamily: "Cairo_600SemiBold" },
  iconBtn: { padding: 6 },
  empty: { alignItems: "center", paddingVertical: 60, gap: 12 },
  emptyText: { fontSize: 14, fontFamily: "Cairo_400Regular" },
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "flex-end" },
  sheet: { borderTopLeftRadius: 22, borderTopRightRadius: 22, borderWidth: 1, borderBottomWidth: 0, maxHeight: "85%" },
  sheetHeader: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1 },
  sheetTitle: { fontSize: 17, fontFamily: "Cairo_600SemiBold" },
  saveBtn: { paddingHorizontal: 18, paddingVertical: 7, borderRadius: 10 },
  saveBtnText: { color: "#fff", fontSize: 14, fontFamily: "Cairo_600SemiBold" },
  sheetScroll: { paddingHorizontal: 16, paddingTop: 16 },
  fieldGroup: { marginBottom: 14 },
  label: { fontSize: 12, fontFamily: "Cairo_400Regular", marginBottom: 6, textAlign: "right" },
  input: { height: 44, borderRadius: 10, borderWidth: 1, paddingHorizontal: 12, fontSize: 14, fontFamily: "Cairo_400Regular" },
  roleRow: { flexDirection: "row-reverse", gap: 10 },
  roleBtn: { flex: 1, height: 44, borderRadius: 10, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  roleBtnText: { fontSize: 14, fontFamily: "Cairo_600SemiBold" },
});
