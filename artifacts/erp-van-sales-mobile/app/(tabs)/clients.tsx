import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import { useRefreshOnFocus } from "@/hooks/useRefreshOnFocus";
import { useCallback, useRef, useState } from "react";
import { FlatList, Modal, RefreshControl, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppButton, Avatar, Card, EmptyState, MoneyText, PressableScale, SkeletonList, StatusPill } from "@/components/ui";
import { useAuth } from "@/contexts/AuthContext";
import { useSync } from "@/contexts/SyncContext";
import { Client, getDb } from "@/lib/db";
import { newSyncId } from "@/lib/uuid";
import { fonts } from "@/constants/tokens";
import { useTheme } from "@/hooks/useTheme";

const TYPE_LABELS: Record<string, string> = { retail: "تجزئة", half_wholesale: "نصف جملة", wholesale: "جملة" };

function ClientRow({ item, theme }: { item: Client; theme: ReturnType<typeof useTheme> }) {
  const c = theme.color;
  const balance = Number(item.credit_balance ?? 0);
  const tone = balance < 0 ? "negative" : balance > 0 ? "positive" : "muted";
  return (
    <Card radius={18} pad={13} style={styles.row}>
      <Avatar name={item.name} size={44} />
      <View style={{ flex: 1, alignItems: "flex-end" }}>
        <Text style={[styles.name, { color: c.text }]} numberOfLines={1}>{item.name}</Text>
        <Text style={[styles.sub, { color: c.textFaint }]} numberOfLines={1}>
          {TYPE_LABELS[item.client_type ?? "retail"]}{item.phone ? ` · ${item.phone}` : ""}
        </Text>
      </View>
      <View style={{ alignItems: "flex-end", gap: 4 }}>
        <MoneyText amount={balance} tone={tone} absolute size="callout" />
        {balance < 0 ? <StatusPill status="credit" label="مدين" /> : null}
      </View>
    </Card>
  );
}

export default function ClientsScreen() {
  const theme = useTheme();
  const c = theme.color;
  const insets = useSafeAreaInsets();
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
    setNewName(""); setNewPhone(""); setShowAddModal(true);
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
    } finally { setSaving(false); }
  };

  const onRefresh = async () => {
    setRefreshing(true); triggerSync(); await load(); setRefreshing(false);
  };

  return (
    <View style={[styles.container, { backgroundColor: c.bg, paddingTop: insets.top + 8 }]}>
      <Modal visible={showAddModal} transparent animationType="fade">
        <View style={[styles.overlay, { backgroundColor: c.scrim }]}>
          <Card raised radius={22} pad={20} style={{ width: "100%", gap: 12 }}>
            <Text style={[styles.modalTitle, { color: c.text }]}>عميل جديد</Text>
            <TextInput ref={nameInputRef}
              style={[styles.input, { backgroundColor: c.bg, borderColor: c.hairline, color: c.text }]}
              placeholder="اسم العميل *" placeholderTextColor={c.textFaint}
              value={newName} onChangeText={setNewName} textAlign="right" returnKeyType="next" />
            <TextInput
              style={[styles.input, { backgroundColor: c.bg, borderColor: c.hairline, color: c.text }]}
              placeholder="رقم الهاتف (اختياري)" placeholderTextColor={c.textFaint}
              value={newPhone} onChangeText={setNewPhone} keyboardType="phone-pad" textAlign="right"
              returnKeyType="done" onSubmitEditing={confirmAdd} />
            <View style={styles.modalActions}>
              <AppButton label="إلغاء" variant="tonal" size="lg" onPress={() => setShowAddModal(false)} style={{ flex: 1 }} />
              <AppButton label="إضافة" variant="primary" size="lg" icon="user-plus" loading={saving} disabled={!newName.trim()} onPress={confirmAdd} style={{ flex: 2 }} />
            </View>
          </Card>
        </View>
      </Modal>

      <View style={styles.titleRow}>
        <Text style={[styles.title, { color: c.text }]}>العملاء</Text>
        <PressableScale onPress={handleAdd} haptic style={[styles.addBtn, { backgroundColor: c.brandTint }]}>
          <Feather name="user-plus" size={18} color={c.brand} />
        </PressableScale>
      </View>

      <Card radius={14} pad={0} style={styles.searchBar}>
        <Feather name="search" size={16} color={c.textMuted} />
        <TextInput
          style={[styles.searchInput, { color: c.text }]}
          placeholder="ابحث عن عميل…" placeholderTextColor={c.textFaint}
          value={search} onChangeText={setSearch} textAlign="right" />
      </Card>

      {!loaded ? (
        <SkeletonList />
      ) : (
        <FlatList
          data={clients}
          keyExtractor={(i) => i.sync_id}
          renderItem={({ item }) => (
            <PressableScale onPress={() => router.push(`/client/${item.sync_id}`)}>
              <ClientRow item={item} theme={theme} />
            </PressableScale>
          )}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.brand} />}
          ListEmptyComponent={
            search
              ? <EmptyState icon="search" title="لا توجد نتائج" subtitle={`لم نعثر على عميل باسم "${search}"`} />
              : <EmptyState icon="users" title="لا يوجد عملاء بعد" subtitle="أضف أول عميل أو قم بالمزامنة" actionLabel="إضافة عميل جديد" actionIcon="user-plus" onAction={handleAdd} />
          }
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  titleRow: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, marginBottom: 12 },
  title: { fontSize: 21, fontFamily: fonts.bold },
  addBtn: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  searchBar: { flexDirection: "row-reverse", alignItems: "center", gap: 8, paddingHorizontal: 14, height: 46, marginHorizontal: 16, marginBottom: 12 },
  searchInput: { flex: 1, fontSize: 14, fontFamily: fonts.regular },
  list: { paddingHorizontal: 16, paddingBottom: 120, gap: 9 },
  row: { flexDirection: "row-reverse", alignItems: "center", gap: 11 },
  name: { fontSize: 15, fontFamily: fonts.semibold },
  sub: { fontSize: 12, fontFamily: fonts.regular, marginTop: 1 },
  overlay: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  modalTitle: { fontSize: 20, fontFamily: fonts.bold, textAlign: "right" },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, height: 48, fontSize: 15, fontFamily: fonts.regular },
  modalActions: { flexDirection: "row-reverse", gap: 10, marginTop: 4 },
});
