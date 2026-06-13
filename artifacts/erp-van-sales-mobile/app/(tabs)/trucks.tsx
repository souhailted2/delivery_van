import { Feather } from "@expo/vector-icons";
import { useRefreshOnFocus } from "@/hooks/useRefreshOnFocus";
import { useCallback, useState } from "react";
import {
  Alert, FlatList, Modal, RefreshControl, StyleSheet, Text,
  TextInput, TouchableOpacity, View,
} from "react-native";
import { SyncBar } from "@/components/SyncBar";
import { useSync } from "@/contexts/SyncContext";
import { Truck, getDb } from "@/lib/db";
import { newSyncId } from "@/lib/uuid";
import { useColors } from "@/hooks/useColors";

export default function TrucksScreen() {
  const colors = useColors();
  const { triggerSync } = useSync();
  const [trucks, setTrucks] = useState<Truck[]>([]);
  const [search, setSearch] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editItem, setEditItem] = useState<Truck | null>(null);
  const [formName, setFormName] = useState("");
  const [formPlate, setFormPlate] = useState("");
  const [saving, setSaving] = useState(false);

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
    Alert.alert("حذف الشاحنة", `هل تريد حذف "${item.name}"؟`, [
      { text: "إلغاء", style: "cancel" },
      {
        text: "حذف", style: "destructive",
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
    if (!formName.trim()) { Alert.alert("خطأ", "اسم الشاحنة مطلوب"); return; }
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
      Alert.alert("خطأ", e?.message ?? "فشل الحفظ");
    } finally {
      setSaving(false);
    }
  };

  const fmt = (n: number) => n.toLocaleString("fr-DZ") + " د.ج";

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <SyncBar />
      <View style={styles.header}>
        <View style={[styles.searchBar, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Feather name="search" size={16} color={colors.mutedForeground} />
          <TextInput
            style={[styles.searchInput, { color: colors.foreground }]}
            placeholder="ابحث عن شاحنة..." placeholderTextColor={colors.mutedForeground}
            value={search} onChangeText={setSearch} textAlign="right"
          />
        </View>
        <TouchableOpacity style={[styles.addBtn, { backgroundColor: colors.primary }]} onPress={openAdd}>
          <Feather name="plus" size={20} color="#fff" />
        </TouchableOpacity>
      </View>

      <FlatList
        data={trucks}
        keyExtractor={i => i.sync_id}
        renderItem={({ item }) => (
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.cardRow}>
              <View style={[styles.avatar, { backgroundColor: colors.primary + "22" }]}>
                <Feather name="truck" size={18} color={colors.primary} />
              </View>
              <View style={{ flex: 1, alignItems: "flex-end" }}>
                <Text style={[styles.name, { color: colors.foreground }]}>{item.name}</Text>
                {item.plate_number && (
                  <Text style={[styles.sub, { color: colors.mutedForeground }]}>{item.plate_number}</Text>
                )}
              </View>
              <View style={{ alignItems: "flex-end" }}>
                <Text style={[styles.cash, { color: colors.primary }]}>{fmt(item.cash_balance ?? 0)}</Text>
                <Text style={[styles.cashLabel, { color: colors.mutedForeground }]}>الصندوق</Text>
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
            <Feather name="truck" size={40} color={colors.muted} />
            <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
              {search ? "لا توجد نتائج" : "لا توجد شاحنات"}
            </Text>
          </View>
        }
        showsVerticalScrollIndicator={false}
      />

      <Modal visible={showModal} animationType="fade" transparent onRequestClose={() => setShowModal(false)}>
        <View style={styles.overlay}>
          <View style={[styles.modalBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>
              {editItem ? "تعديل الشاحنة" : "شاحنة جديدة"}
            </Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }]}
              placeholder="اسم الشاحنة *" placeholderTextColor={colors.mutedForeground}
              value={formName} onChangeText={setFormName} textAlign="right" autoFocus
            />
            <TextInput
              style={[styles.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }]}
              placeholder="رقم اللوحة (اختياري)" placeholderTextColor={colors.mutedForeground}
              value={formPlate} onChangeText={setFormPlate} textAlign="right"
            />
            <View style={styles.modalActions}>
              <TouchableOpacity style={[styles.modalBtn, { backgroundColor: colors.secondary }]} onPress={() => setShowModal(false)}>
                <Text style={[styles.modalBtnText, { color: colors.foreground }]}>إلغاء</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: formName.trim() && !saving ? colors.primary : colors.muted }]}
                onPress={handleSave} disabled={!formName.trim() || saving}
              >
                <Text style={[styles.modalBtnText, { color: "#fff" }]}>{saving ? "جاري..." : "حفظ"}</Text>
              </TouchableOpacity>
            </View>
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
  name: { fontSize: 15, fontFamily: "Cairo_600SemiBold" },
  sub: { fontSize: 12, fontFamily: "Cairo_400Regular" },
  cash: { fontSize: 14, fontFamily: "Cairo_700Bold" },
  cashLabel: { fontSize: 11, fontFamily: "Cairo_400Regular" },
  iconBtn: { padding: 6 },
  empty: { alignItems: "center", paddingVertical: 60, gap: 12 },
  emptyText: { fontSize: 14, fontFamily: "Cairo_400Regular" },
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", alignItems: "center", justifyContent: "center", padding: 24 },
  modalBox: { width: "100%", borderRadius: 16, borderWidth: 1, padding: 20, gap: 12 },
  modalTitle: { fontSize: 17, fontFamily: "Cairo_700Bold", textAlign: "right" },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, height: 46, fontSize: 14, fontFamily: "Cairo_400Regular" },
  modalActions: { flexDirection: "row-reverse", gap: 10, marginTop: 4 },
  modalBtn: { flex: 1, height: 44, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  modalBtnText: { fontSize: 15, fontFamily: "Cairo_700Bold" },
});
