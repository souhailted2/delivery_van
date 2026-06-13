import { Feather } from "@expo/vector-icons";
import { useRefreshOnFocus } from "@/hooks/useRefreshOnFocus";
import { useCallback, useState } from "react";
import {
  Alert, FlatList, Modal, RefreshControl, ScrollView, StyleSheet, Text,
  TextInput, TouchableOpacity, View,
} from "react-native";
import { SyncBar } from "@/components/SyncBar";
import { useSync } from "@/contexts/SyncContext";
import { getDb } from "@/lib/db";
import { newSyncId } from "@/lib/uuid";
import { useColors } from "@/hooks/useColors";

interface Branch {
  _lid?: number; sync_id: string; id?: number | null;
  name: string; address?: string | null; phone?: string | null;
  updated_at?: string; is_deleted?: number; _pending?: number;
}

export default function BranchesScreen() {
  const colors = useColors();
  const { triggerSync } = useSync();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [search, setSearch] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editItem, setEditItem] = useState<Branch | null>(null);
  const [formName, setFormName] = useState("");
  const [formAddress, setFormAddress] = useState("");
  const [formPhone, setFormPhone] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const db = await getDb();
    if (!db) return;
    const q = search.trim();
    const rows = await db.getAllAsync<Branch>(
      `SELECT * FROM branches WHERE (is_deleted = 0 OR is_deleted IS NULL) ${q ? "AND name LIKE ?" : ""} ORDER BY name`,
      q ? [`%${q}%`] : []
    ).catch(() => [] as Branch[]);
    setBranches(rows);
  }, [search]);

  useRefreshOnFocus(load);

  const onRefresh = async () => {
    setRefreshing(true);
    triggerSync();
    await load();
    setRefreshing(false);
  };

  const openAdd = () => {
    setEditItem(null); setFormName(""); setFormAddress(""); setFormPhone("");
    setShowModal(true);
  };

  const openEdit = (item: Branch) => {
    setEditItem(item);
    setFormName(item.name);
    setFormAddress(item.address ?? "");
    setFormPhone(item.phone ?? "");
    setShowModal(true);
  };

  const handleDelete = (item: Branch) => {
    Alert.alert("حذف الفرع", `هل تريد حذف "${item.name}"؟`, [
      { text: "إلغاء", style: "cancel" },
      {
        text: "حذف", style: "destructive",
        onPress: async () => {
          const db = await getDb();
          if (!db) return;
          await db.runAsync(
            "UPDATE branches SET is_deleted = 1, updated_at = ?, _pending = 1 WHERE _lid = ?",
            [new Date().toISOString(), item._lid!]
          );
          triggerSync();
          load();
        },
      },
    ]);
  };

  const handleSave = async () => {
    if (!formName.trim()) { Alert.alert("خطأ", "اسم الفرع مطلوب"); return; }
    setSaving(true);
    try {
      const db = await getDb();
      if (!db) return;
      const now = new Date().toISOString();
      if (editItem) {
        await db.runAsync(
          "UPDATE branches SET name = ?, address = ?, phone = ?, updated_at = ?, _pending = 1 WHERE _lid = ?",
          [formName.trim(), formAddress.trim() || null, formPhone.trim() || null, now, editItem._lid!]
        );
      } else {
        await db.runAsync(
          "INSERT INTO branches (sync_id, name, address, phone, updated_at, is_deleted, _pending) VALUES (?, ?, ?, ?, ?, 0, 1)",
          [newSyncId(), formName.trim(), formAddress.trim() || null, formPhone.trim() || null, now]
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
            placeholder="ابحث عن فرع..." placeholderTextColor={colors.mutedForeground}
            value={search} onChangeText={setSearch} textAlign="right"
          />
        </View>
        <TouchableOpacity style={[styles.addBtn, { backgroundColor: colors.primary }]} onPress={openAdd}>
          <Feather name="plus" size={20} color="#fff" />
        </TouchableOpacity>
      </View>

      <FlatList
        data={branches}
        keyExtractor={i => i.sync_id}
        renderItem={({ item }) => (
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.cardRow}>
              <View style={[styles.avatar, { backgroundColor: colors.primary + "22" }]}>
                <Feather name="map-pin" size={16} color={colors.primary} />
              </View>
              <View style={{ flex: 1, alignItems: "flex-end" }}>
                <Text style={[styles.name, { color: colors.foreground }]}>{item.name}</Text>
                {item.address && <Text style={[styles.sub, { color: colors.mutedForeground }]}>{item.address}</Text>}
                {item.phone && <Text style={[styles.sub, { color: colors.mutedForeground }]}>{item.phone}</Text>}
              </View>
              <TouchableOpacity onPress={() => openEdit(item)} style={styles.iconBtn}>
                <Feather name="edit-2" size={16} color={colors.mutedForeground} />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => handleDelete(item)} style={styles.iconBtn}>
                <Feather name="trash-2" size={16} color={colors.destructive} />
              </TouchableOpacity>
            </View>
          </View>
        )}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Feather name="map-pin" size={40} color={colors.muted} />
            <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
              {search ? "لا توجد نتائج" : "لا توجد فروع — قم بالمزامنة"}
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
                {editItem ? "تعديل الفرع" : "فرع جديد"}
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
                <Text style={[styles.label, { color: colors.mutedForeground }]}>اسم الفرع *</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]}
                  value={formName} onChangeText={setFormName}
                  placeholder="اسم الفرع" placeholderTextColor={colors.mutedForeground}
                  textAlign="right" autoFocus
                />
              </View>
              <View style={styles.fieldGroup}>
                <Text style={[styles.label, { color: colors.mutedForeground }]}>العنوان</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]}
                  value={formAddress} onChangeText={setFormAddress}
                  placeholder="العنوان" placeholderTextColor={colors.mutedForeground}
                  textAlign="right"
                />
              </View>
              <View style={styles.fieldGroup}>
                <Text style={[styles.label, { color: colors.mutedForeground }]}>الهاتف</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]}
                  value={formPhone} onChangeText={setFormPhone}
                  placeholder="رقم الهاتف" placeholderTextColor={colors.mutedForeground}
                  keyboardType="phone-pad" textAlign="right"
                />
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
  avatar: { width: 36, height: 36, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  name: { fontSize: 15, fontFamily: "Cairo_600SemiBold" },
  sub: { fontSize: 12, fontFamily: "Cairo_400Regular", marginTop: 2 },
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
});
