import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import { useRefreshOnFocus } from "@/hooks/useRefreshOnFocus";
import { useCallback, useRef, useState } from "react";
import { FlatList, KeyboardAvoidingView, Modal, Platform, RefreshControl, StyleSheet, Text, TextInput, TouchableWithoutFeedback, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppButton, Avatar, Card, EmptyState, MoneyText, PressableScale, SkeletonList } from "@/components/ui";
import { useAuth } from "@/contexts/AuthContext";
import { useSync } from "@/contexts/SyncContext";
import { Client, getDb } from "@/lib/db";
import { captureLocation } from "@/lib/location";
import { newSyncId } from "@/lib/uuid";
import { fonts } from "@/constants/tokens";
import { useTheme } from "@/hooks/useTheme";

const TYPE_LABELS: Record<string, string> = { retail: "تجزئة", half_wholesale: "نصف جملة", wholesale: "جملة" };
const DAY = 86_400_000;
const LAPSE_DAYS = 14;
type ClientLite = Client & { last_purchase?: string | null };

function ClientRow({ item, theme }: { item: ClientLite; theme: ReturnType<typeof useTheme> }) {
  const c = theme.color;
  const balance = Number(item.credit_balance ?? 0);
  const tone = balance < 0 ? "negative" : balance > 0 ? "positive" : "muted";
  const lastTs = item.last_purchase ? Date.parse(item.last_purchase) : null;
  const days = lastTs ? Math.floor((Date.now() - lastTs) / DAY) : null;
  const lapsed = days != null && days >= LAPSE_DAYS;
  return (
    <Card radius={18} pad={13} style={styles.row}>
      <Avatar name={item.name} size={44} />
      <View style={{ flex: 1, alignItems: "flex-end" }}>
        <Text style={[styles.name, { color: c.text }]} numberOfLines={1}>{item.name}</Text>
        <Text style={[styles.sub, { color: c.textFaint }]} numberOfLines={1}>
          {TYPE_LABELS[item.client_type ?? "retail"]}{item.phone ? ` · ${item.phone}` : ""}
        </Text>
        {(balance < 0 || lapsed) && (
          <View style={styles.badges}>
            {balance < 0 && (
              <View style={[styles.badge, { backgroundColor: c.dangerTint }]}>
                <Text style={[styles.badgeText, { color: c.dangerText }]}>مدين {fmtMoney(Math.abs(balance))}</Text>
              </View>
            )}
            {lapsed && (
              <View style={[styles.badge, { backgroundColor: c.warningTint }]}>
                <Text style={[styles.badgeText, { color: c.warningText }]}>تحتاج زيارة · {days} يوم</Text>
              </View>
            )}
          </View>
        )}
      </View>
      <MoneyText amount={balance} tone={tone} absolute size="callout" />
    </Card>
  );
}

function fmtMoney(n: number) {
  const [i, d] = Math.abs(n).toFixed(2).split(".");
  return i.replace(/\B(?=(\d{3})+(?!\d))/g, " ") + "." + d;
}

export default function ClientsScreen() {
  const theme = useTheme();
  const c = theme.color;
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { triggerSync } = useSync();
  const [clients, setClients] = useState<ClientLite[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [search, setSearch] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newType, setNewType] = useState<string>("retail");
  const [newCoords, setNewCoords] = useState<{ latitude: number; longitude: number } | null>(null);
  const [capturing, setCapturing] = useState(false);
  const [saving, setSaving] = useState(false);
  const nameInputRef = useRef<TextInput>(null);

  const load = useCallback(async () => {
    const db = await getDb();
    if (!db) return;
    const q = search.trim();
    const truckId = user?.truckId ?? null;
    const base = `SELECT cl.*, MAX(i.created_at) as last_purchase
      FROM clients cl LEFT JOIN invoices i ON (i.client_sync_id = cl.sync_id OR i.client_id = cl.id) AND i.is_deleted = 0
      WHERE cl.is_deleted = 0`;
    const grp = "GROUP BY cl.sync_id ORDER BY cl.name";
    let rows: ClientLite[];
    if (truckId !== null) {
      rows = await db.getAllAsync<ClientLite>(
        `${base} AND cl.truck_id = ? ${q ? "AND (cl.name LIKE ? OR cl.phone LIKE ?)" : ""} ${grp}`,
        q ? [truckId, `%${q}%`, `%${q}%`] : [truckId]
      );
    } else {
      rows = await db.getAllAsync<ClientLite>(
        `${base} ${q ? "AND (cl.name LIKE ? OR cl.phone LIKE ?)" : ""} ${grp}`,
        q ? [`%${q}%`, `%${q}%`] : []
      );
    }
    setClients(rows);
    setLoaded(true);
  }, [search, user?.truckId]);

  useRefreshOnFocus(load);

  const handleAdd = () => {
    setNewName(""); setNewPhone(""); setNewType("retail"); setNewCoords(null); setShowAddModal(true);
    setTimeout(() => nameInputRef.current?.focus(), 300);
  };

  const captureForNew = async () => {
    setCapturing(true);
    const coords = await captureLocation();
    setCapturing(false);
    if (coords) { setNewCoords(coords); Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); }
    else Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
  };

  const confirmAdd = async () => {
    if (!newName.trim()) return;
    const db = await getDb();
    if (!db) return;
    setSaving(true);
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      const truckId = user?.truckId ?? null;
      const now = new Date().toISOString();
      await db.runAsync(
        `INSERT INTO clients (sync_id, name, phone, client_type, truck_id, latitude, longitude, is_deleted, _pending, updated_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 0, 1, ?, ?)`,
        [newSyncId(), newName.trim(), newPhone.trim() || null, newType, truckId, newCoords?.latitude ?? null, newCoords?.longitude ?? null, now, now]
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
      <Modal visible={showAddModal} transparent animationType="slide" onRequestClose={() => setShowAddModal(false)}>
        <TouchableWithoutFeedback onPress={() => setShowAddModal(false)}>
          <View style={[styles.overlay, { backgroundColor: c.scrim }]} />
        </TouchableWithoutFeedback>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.sheetWrap}>
          <Card raised radius={24} pad={20} style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
            <View style={[styles.handle, { backgroundColor: c.hairline }]} />
            <Text style={[styles.modalTitle, { color: c.text }]}>زبون جديد</Text>
            <TextInput ref={nameInputRef}
              style={[styles.input, { backgroundColor: c.bg, borderColor: c.hairline, color: c.text }]}
              placeholder="اسم الزبون *" placeholderTextColor={c.textFaint}
              value={newName} onChangeText={setNewName} textAlign="right" returnKeyType="next" />
            <TextInput
              style={[styles.input, { backgroundColor: c.bg, borderColor: c.hairline, color: c.text }]}
              placeholder="رقم الهاتف (اختياري)" placeholderTextColor={c.textFaint}
              value={newPhone} onChangeText={setNewPhone} keyboardType="phone-pad" textAlign="right" returnKeyType="done" />
            <Text style={[styles.fieldLabel, { color: c.textMuted }]}>نوع الزبون</Text>
            <View style={styles.typeRow}>
              {Object.keys(TYPE_LABELS).map(tp => {
                const on = newType === tp;
                return (
                  <PressableScale key={tp} style={[styles.typeChip, { backgroundColor: on ? c.brand : c.bg, borderColor: on ? c.brand : c.hairline }]} onPress={() => setNewType(tp)}>
                    <Text style={[styles.typeChipText, { color: on ? c.onBrand : c.text }]}>{TYPE_LABELS[tp]}</Text>
                  </PressableScale>
                );
              })}
            </View>
            <PressableScale
              style={[styles.locBtn, { backgroundColor: newCoords ? c.successTint : c.bg, borderColor: newCoords ? c.successText : c.hairline }]}
              onPress={captureForNew} disabled={capturing}>
              <Feather name={newCoords ? "check-circle" : "map-pin"} size={16} color={newCoords ? c.successText : c.brand} />
              <Text style={[styles.locBtnText, { color: newCoords ? c.successText : c.brand }]}>
                {capturing ? "جارٍ تحديد الموقع…" : newCoords ? "تم تسجيل الموقع ✓" : "تحديد موقع الزبون الحالي"}
              </Text>
            </PressableScale>
            <View style={styles.modalActions}>
              <AppButton label="إلغاء" variant="tonal" size="lg" onPress={() => setShowAddModal(false)} style={{ flex: 1 }} />
              <AppButton label="حفظ" variant="primary" size="lg" icon="check" loading={saving} disabled={!newName.trim()} onPress={confirmAdd} style={{ flex: 2 }} />
            </View>
          </Card>
        </KeyboardAvoidingView>
      </Modal>

      <View style={styles.titleRow}>
        <Text style={[styles.title, { color: c.text }]}>العملاء</Text>
        <PressableScale onPress={handleAdd} haptic style={[styles.addBtn, { backgroundColor: c.brandTint }]}>
          <Feather name="user-plus" size={16} color={c.brand} />
          <Text style={[styles.addBtnText, { color: c.brand }]}>زبون جديد</Text>
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
  addBtn: { flexDirection: "row-reverse", alignItems: "center", gap: 6, height: 40, borderRadius: 12, paddingHorizontal: 14 },
  addBtnText: { fontSize: 13, fontFamily: fonts.bold },
  searchBar: { flexDirection: "row-reverse", alignItems: "center", gap: 8, paddingHorizontal: 14, height: 46, marginHorizontal: 16, marginBottom: 12 },
  searchInput: { flex: 1, fontSize: 14, fontFamily: fonts.regular },
  list: { paddingHorizontal: 16, paddingBottom: 120, gap: 9 },
  row: { flexDirection: "row-reverse", alignItems: "center", gap: 11 },
  name: { fontSize: 15, fontFamily: fonts.semibold },
  sub: { fontSize: 12, fontFamily: fonts.regular, marginTop: 1 },
  badges: { flexDirection: "row-reverse", flexWrap: "wrap", gap: 5, marginTop: 6 },
  badge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  badgeText: { fontSize: 11, fontFamily: fonts.bold },
  overlay: { ...StyleSheet.absoluteFillObject },
  sheetWrap: { position: "absolute", left: 0, right: 0, bottom: 0 },
  sheet: { borderBottomLeftRadius: 0, borderBottomRightRadius: 0, gap: 12 },
  handle: { width: 40, height: 4, borderRadius: 2, alignSelf: "center", marginBottom: 2 },
  modalTitle: { fontSize: 20, fontFamily: fonts.bold, textAlign: "right" },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, height: 48, fontSize: 15, fontFamily: fonts.regular },
  fieldLabel: { fontSize: 12, fontFamily: fonts.semibold, textAlign: "right", marginTop: 2 },
  typeRow: { flexDirection: "row-reverse", gap: 8 },
  typeChip: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 11, borderRadius: 12, borderWidth: 1 },
  typeChipText: { fontSize: 13, fontFamily: fonts.semibold },
  locBtn: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 13, borderRadius: 12, borderWidth: 1 },
  locBtnText: { fontSize: 14, fontFamily: fonts.bold },
  modalActions: { flexDirection: "row-reverse", gap: 10, marginTop: 4 },
});
