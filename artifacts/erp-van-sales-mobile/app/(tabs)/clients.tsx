import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert, FlatList, Modal, RefreshControl, StyleSheet, Text,
  TextInput, TouchableOpacity, View,
} from "react-native";
import { SyncBar } from "@/components/SyncBar";
import { useAuth } from "@/contexts/AuthContext";
import { useSync } from "@/contexts/SyncContext";
import { Client, getDb } from "@/lib/db";
import { newSyncId } from "@/lib/uuid";
import { useColors } from "@/hooks/useColors";

const CLIENT_TYPE_LABELS: Record<string, string> = {
  retail: "تجزئة", half_wholesale: "نصف جملة", wholesale: "جملة",
};
type TierKey = "retail" | "half_wholesale" | "wholesale";
const TIER_KEYS: TierKey[] = ["retail", "half_wholesale", "wholesale"];

function ClientCard({ item, colors }: { item: Client; colors: any }) {
  const balance = Number(item.credit_balance ?? 0);
  const balanceColor = balance < 0 ? colors.destructive : balance > 0 ? colors.warning : colors.success;
  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={styles.row}>
        <View style={[styles.avatar, { backgroundColor: colors.secondary }]}>
          <Feather name="user" size={18} color={colors.primary} />
        </View>
        <View style={{ flex: 1, alignItems: "flex-end" }}>
          <Text style={[styles.name, { color: colors.foreground }]}>{item.name}</Text>
          {item.phone && <Text style={[styles.phone, { color: colors.mutedForeground }]}>{item.phone}</Text>}
        </View>
        <View style={{ alignItems: "center" }}>
          <Text style={[styles.balance, { color: balanceColor }]}>
            {balance.toLocaleString("fr-DZ")} د.ج
          </Text>
          <View style={[styles.typeBadge, { backgroundColor: colors.secondary }]}>
            <Text style={[styles.typeText, { color: colors.mutedForeground }]}>
              {CLIENT_TYPE_LABELS[item.client_type ?? "retail"] ?? item.client_type}
            </Text>
          </View>
        </View>
      </View>
    </View>
  );
}

export default function ClientsScreen() {
  const colors = useColors();
  const { user } = useAuth();
  const { triggerSync } = useSync();
  const [clients, setClients] = useState<Client[]>([]);
  const [search, setSearch] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newTier, setNewTier] = useState<TierKey>("retail");
  const nameInputRef = useRef<TextInput>(null);

  const load = useCallback(async () => {
    const db = await getDb();
    if (!db) return;
    const q = search.trim();
    const truckId = user?.truckId ?? null;
    let rows: Client[];
    if (truckId !== null) {
      rows = await db.getAllAsync<Client>(
        `SELECT * FROM clients WHERE is_deleted = 0 AND truck_id = ? ${q ? "AND (name LIKE ? OR phone LIKE ?)" : ""} ORDER BY name`,
        q ? [truckId, `%${q}%`, `%${q}%`] : [truckId]
      );
    } else {
      rows = await db.getAllAsync<Client>(
        `SELECT * FROM clients WHERE is_deleted = 0 ${q ? "AND (name LIKE ? OR phone LIKE ?)" : ""} ORDER BY name`,
        q ? [`%${q}%`, `%${q}%`] : []
      );
    }
    setClients(rows);
  }, [search, user?.truckId]);

  useEffect(() => { load(); }, [load]);

  const handleAdd = () => {
    setNewName("");
    setNewPhone("");
    setNewTier("retail");
    setShowAddModal(true);
    setTimeout(() => nameInputRef.current?.focus(), 200);
  };

  const confirmAdd = async () => {
    if (!newName.trim()) return;
    const db = await getDb();
    if (!db) return;
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const truckId = user?.truckId ?? null;
    await db.runAsync(
      `INSERT INTO clients (sync_id, name, phone, client_type, truck_id, is_deleted, _pending, updated_at, created_at)
       VALUES (?, ?, ?, ?, ?, 0, 1, ?, ?)`,
      [newSyncId(), newName.trim(), newPhone.trim() || null, newTier, truckId, new Date().toISOString(), new Date().toISOString()]
    );
    setShowAddModal(false);
    triggerSync();
    load();
  };

  const onRefresh = async () => {
    setRefreshing(true);
    triggerSync();
    await load();
    setRefreshing(false);
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <SyncBar />

      <Modal visible={showAddModal} transparent animationType="fade">
        <View style={styles.overlay}>
          <View style={[styles.modalBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>عميل جديد</Text>
            <TextInput
              ref={nameInputRef}
              style={[styles.modalInput, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }]}
              placeholder="اسم العميل *"
              placeholderTextColor={colors.mutedForeground}
              value={newName}
              onChangeText={setNewName}
              textAlign="right"
              returnKeyType="next"
            />
            <TextInput
              style={[styles.modalInput, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }]}
              placeholder="رقم الهاتف (اختياري)"
              placeholderTextColor={colors.mutedForeground}
              value={newPhone}
              onChangeText={setNewPhone}
              keyboardType="phone-pad"
              textAlign="right"
              returnKeyType="done"
              onSubmitEditing={confirmAdd}
            />
            <Text style={[styles.tierLabel, { color: colors.mutedForeground }]}>نوع السعر</Text>
            <View style={styles.tierPicker}>
              {TIER_KEYS.map(t => {
                const active = newTier === t;
                return (
                  <TouchableOpacity
                    key={t}
                    style={[styles.tierOption, {
                      backgroundColor: active ? colors.primary : colors.background,
                      borderColor: active ? colors.primary : colors.border,
                    }]}
                    onPress={() => setNewTier(t)}
                  >
                    <Text style={[styles.tierOptionText, { color: active ? "#fff" : colors.foreground }]}>
                      {CLIENT_TYPE_LABELS[t]}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: colors.secondary }]}
                onPress={() => setShowAddModal(false)}
              >
                <Text style={[styles.modalBtnText, { color: colors.foreground }]}>إلغاء</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: newName.trim() ? colors.primary : colors.muted }]}
                onPress={confirmAdd}
                disabled={!newName.trim()}
              >
                <Text style={[styles.modalBtnText, { color: "#fff" }]}>إضافة</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <View style={styles.header}>
        <View style={[styles.searchBar, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Feather name="search" size={16} color={colors.mutedForeground} />
          <TextInput
            style={[styles.searchInput, { color: colors.foreground }]}
            placeholder="ابحث عن عميل..."
            placeholderTextColor={colors.mutedForeground}
            value={search}
            onChangeText={setSearch}
            textAlign="right"
          />
        </View>
        <TouchableOpacity
          style={[styles.addBtn, { backgroundColor: colors.primary }]}
          onPress={handleAdd}
          activeOpacity={0.8}
        >
          <Feather name="user-plus" size={18} color="#fff" />
        </TouchableOpacity>
      </View>
      <FlatList
        data={clients}
        keyExtractor={i => i.sync_id}
        renderItem={({ item }) => <ClientCard item={item} colors={colors} />}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Feather name="users" size={40} color={colors.muted} />
            <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
              {search ? "لا توجد نتائج" : "لا يوجد عملاء — قم بالمزامنة أولاً"}
            </Text>
          </View>
        }
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row-reverse", gap: 8, margin: 12, alignItems: "center" },
  searchBar: {
    flex: 1, flexDirection: "row-reverse", alignItems: "center", gap: 8,
    paddingHorizontal: 14, height: 44, borderRadius: 12, borderWidth: 1,
  },
  searchInput: { flex: 1, fontSize: 14, fontFamily: "Cairo_400Regular" },
  addBtn: { width: 44, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  list: { paddingHorizontal: 12, paddingBottom: 16, gap: 8 },
  card: { borderRadius: 14, borderWidth: 1, padding: 14 },
  row: { flexDirection: "row-reverse", alignItems: "center", gap: 10 },
  avatar: { width: 40, height: 40, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  name: { fontSize: 15, fontFamily: "Cairo_600SemiBold" },
  phone: { fontSize: 12, fontFamily: "Cairo_400Regular" },
  balance: { fontSize: 14, fontFamily: "Cairo_700Bold" },
  typeBadge: { marginTop: 4, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  typeText: { fontSize: 11, fontFamily: "Cairo_400Regular" },
  empty: { alignItems: "center", paddingVertical: 60, gap: 12 },
  emptyText: { fontSize: 14, fontFamily: "Cairo_400Regular", textAlign: "center" },
  overlay: {
    flex: 1, backgroundColor: "rgba(0,0,0,0.5)",
    alignItems: "center", justifyContent: "center", padding: 24,
  },
  modalBox: {
    width: "100%", borderRadius: 16, borderWidth: 1,
    padding: 20, gap: 12,
  },
  modalTitle: { fontSize: 17, fontFamily: "Cairo_700Bold", textAlign: "right" },
  modalInput: {
    borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, height: 46,
    fontSize: 14, fontFamily: "Cairo_400Regular",
  },
  tierLabel: { fontSize: 12, fontFamily: "Cairo_600SemiBold", textAlign: "right", marginTop: 2 },
  tierPicker: { flexDirection: "row-reverse", gap: 8 },
  tierOption: { flex: 1, height: 40, borderRadius: 10, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  tierOptionText: { fontSize: 12, fontFamily: "Cairo_600SemiBold" },
  modalActions: { flexDirection: "row-reverse", gap: 10, marginTop: 4 },
  modalBtn: {
    flex: 1, height: 44, borderRadius: 10,
    alignItems: "center", justifyContent: "center",
  },
  modalBtnText: { fontSize: 15, fontFamily: "Cairo_700Bold" },
});
