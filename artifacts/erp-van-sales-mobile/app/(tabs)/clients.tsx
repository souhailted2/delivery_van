import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import { useRefreshOnFocus } from "@/hooks/useRefreshOnFocus";
import { useCallback, useRef, useState } from "react";
import {
  FlatList, Modal, RefreshControl, StyleSheet, Text,
  TextInput, View,
} from "react-native";
import { SyncBar } from "@/components/SyncBar";
import { AppButton, Avatar, EmptyState, MoneyText, PressableScale, SkeletonList, Surface } from "@/components/ui";
import { useAuth } from "@/contexts/AuthContext";
import { useSync } from "@/contexts/SyncContext";
import { Client, getDb } from "@/lib/db";
import { newSyncId } from "@/lib/uuid";
import { useTheme } from "@/hooks/useTheme";

function ClientCard({ item, theme }: { item: Client; theme: ReturnType<typeof useTheme> }) {
  const balance = Number(item.credit_balance ?? 0);
  // Negative balance = client owes money (debt). Color carries the meaning;
  // MoneyText shows the absolute value.
  const tone = balance < 0 ? "negative" : balance > 0 ? "positive" : "muted";
  return (
    <Surface level="e1" radius="md" style={styles.card}>
      <View style={styles.row}>
        <Avatar name={item.name} size={44} />
        <View style={{ flex: 1, alignItems: "flex-end" }}>
          <Text style={[theme.type.bodyStrong, { color: theme.color.text }]}>{item.name}</Text>
          {item.phone ? (
            <Text style={[theme.type.footnote, { color: theme.color.textMuted }]}>{item.phone}</Text>
          ) : null}
        </View>
        <MoneyText amount={balance} tone={tone} absolute size="callout" />
      </View>
    </Surface>
  );
}

export default function ClientsScreen() {
  const theme = useTheme();
  const { color, spacing } = theme;
  const { user } = useAuth();
  const { triggerSync } = useSync();
  const [clients, setClients] = useState<Client[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [search, setSearch] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [saving, setSaving] = useState(false);
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
    setLoaded(true);
  }, [search, user?.truckId]);

  useRefreshOnFocus(load);

  const handleAdd = () => {
    setNewName("");
    setNewPhone("");
    setShowAddModal(true);
    setTimeout(() => nameInputRef.current?.focus(), 200);
  };

  const confirmAdd = async () => {
    if (!newName.trim()) return;
    const db = await getDb();
    if (!db) return;
    setSaving(true);
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      const truckId = user?.truckId ?? null;
      await db.runAsync(
        `INSERT INTO clients (sync_id, name, phone, client_type, truck_id, is_deleted, _pending, updated_at, created_at)
         VALUES (?, ?, ?, ?, ?, 0, 1, ?, ?)`,
        [newSyncId(), newName.trim(), newPhone.trim() || null, "retail", truckId, new Date().toISOString(), new Date().toISOString()]
      );
      setShowAddModal(false);
      triggerSync();
      load();
    } finally {
      setSaving(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    triggerSync();
    await load();
    setRefreshing(false);
  };

  return (
    <View style={[styles.container, { backgroundColor: color.bg }]}>
      <SyncBar />

      <Modal visible={showAddModal} transparent animationType="fade">
        <View style={[styles.overlay, { backgroundColor: color.scrim }]}>
          <Surface level="e2" radius="lg" style={styles.modalBox}>
            <Text style={[theme.type.title, { color: color.text, textAlign: "right" }]}>عميل جديد</Text>
            <TextInput
              ref={nameInputRef}
              style={[styles.modalInput, theme.type.body, { backgroundColor: color.bg, borderColor: color.hairline, color: color.text }]}
              placeholder="اسم العميل *"
              placeholderTextColor={color.textFaint}
              value={newName}
              onChangeText={setNewName}
              textAlign="right"
              returnKeyType="next"
            />
            <TextInput
              style={[styles.modalInput, theme.type.body, { backgroundColor: color.bg, borderColor: color.hairline, color: color.text }]}
              placeholder="رقم الهاتف (اختياري)"
              placeholderTextColor={color.textFaint}
              value={newPhone}
              onChangeText={setNewPhone}
              keyboardType="phone-pad"
              textAlign="right"
              returnKeyType="done"
              onSubmitEditing={confirmAdd}
            />
            <View style={styles.modalActions}>
              <AppButton label="إلغاء" variant="tonal" size="lg" onPress={() => setShowAddModal(false)} style={{ flex: 1 }} />
              <AppButton label="إضافة" variant="primary" size="lg" icon="user-plus" loading={saving} disabled={!newName.trim()} onPress={confirmAdd} style={{ flex: 2 }} />
            </View>
          </Surface>
        </View>
      </Modal>

      <View style={[styles.header, { gap: spacing.sm, margin: spacing.md }]}>
        <Surface level="e0" radius="sm" bordered style={[styles.searchBar, { borderColor: color.hairline }]}>
          <Feather name="search" size={16} color={color.textMuted} />
          <TextInput
            style={[styles.searchInput, theme.type.body, { color: color.text }]}
            placeholder="ابحث عن عميل..."
            placeholderTextColor={color.textFaint}
            value={search}
            onChangeText={setSearch}
            textAlign="right"
          />
        </Surface>
        <PressableScale
          onPress={handleAdd}
          haptic
          accessibilityRole="button"
          accessibilityLabel="إضافة عميل"
          style={[styles.addBtn, { backgroundColor: color.brand, borderRadius: theme.radius.sm }]}
        >
          <Feather name="user-plus" size={18} color={color.onBrand} />
        </PressableScale>
      </View>

      {!loaded ? (
        <SkeletonList />
      ) : (
        <FlatList
          data={clients}
          keyExtractor={(i) => i.sync_id}
          renderItem={({ item }) => (
            <PressableScale onPress={() => router.push(`/client/${item.sync_id}`)}>
              <ClientCard item={item} theme={theme} />
            </PressableScale>
          )}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={color.brand} />}
          ListEmptyComponent={
            search ? (
              <EmptyState icon="search" title="لا توجد نتائج" subtitle={`لم نعثر على عميل باسم "${search}"`} />
            ) : (
              <EmptyState
                icon="users"
                title="لا يوجد عملاء بعد"
                subtitle="أضف أول عميل أو قم بالمزامنة لجلب القائمة"
                actionLabel="إضافة عميل جديد"
                actionIcon="user-plus"
                onAction={handleAdd}
              />
            )
          }
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row-reverse", alignItems: "center" },
  searchBar: {
    flex: 1, flexDirection: "row-reverse", alignItems: "center", gap: 8,
    paddingHorizontal: 14, height: 44,
  },
  searchInput: { flex: 1 },
  addBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  list: { paddingHorizontal: 12, paddingBottom: 16, gap: 8 },
  card: { padding: 14 },
  row: { flexDirection: "row-reverse", alignItems: "center", gap: 12 },
  empty: { alignItems: "center", paddingVertical: 60, gap: 12 },
  overlay: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  modalBox: { width: "100%", padding: 20, gap: 12 },
  modalInput: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, height: 48 },
  modalActions: { flexDirection: "row-reverse", gap: 10, marginTop: 4 },
});
