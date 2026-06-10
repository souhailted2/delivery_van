import { Feather } from "@expo/vector-icons";
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SyncBar } from "@/components/SyncBar";
import { useAuth } from "@/contexts/AuthContext";
import { useSync } from "@/contexts/SyncContext";
import { useColors } from "@/hooks/useColors";

function SettingRow({ label, sub, icon, color, onPress, danger, colors }: {
  label: string; sub?: string; icon: any; color?: string;
  onPress?: () => void; danger?: boolean; colors: any;
}) {
  return (
    <TouchableOpacity
      style={[styles.row, { borderBottomColor: colors.border }]}
      onPress={onPress}
      disabled={!onPress}
      activeOpacity={0.7}
    >
      <Feather name="chevron-left" size={16} color={colors.mutedForeground} />
      <View style={{ flex: 1, alignItems: "flex-end" }}>
        <Text style={[styles.rowLabel, { color: danger ? colors.destructive : colors.foreground }]}>{label}</Text>
        {sub && <Text style={[styles.rowSub, { color: colors.mutedForeground }]}>{sub}</Text>}
      </View>
      <View style={[styles.rowIcon, { backgroundColor: (color ?? colors.primary) + "22" }]}>
        <Feather name={icon} size={18} color={danger ? colors.destructive : (color ?? colors.primary)} />
      </View>
    </TouchableOpacity>
  );
}

export default function SettingsScreen() {
  const colors = useColors();
  const { user, logout } = useAuth();
  const { triggerSync, doResetSync, syncing, resetting, lastSync, pending, error } = useSync();

  const handleForceSync = () => {
    Alert.alert("مزامنة", "هل تريد مزامنة البيانات الآن؟", [
      { text: "إلغاء", style: "cancel" },
      { text: "مزامنة", onPress: () => triggerSync() },
    ]);
  };

  const handleResetSync = () => {
    Alert.alert(
      "إعادة ضبط المزامنة",
      "سيتم حذف جميع البيانات المحلية وإعادة تحميلها من الخادم. هل أنت متأكد؟",
      [
        { text: "إلغاء", style: "cancel" },
        {
          text: "إعادة الضبط", style: "destructive",
          onPress: () => doResetSync(),
        },
      ]
    );
  };

  const handleLogout = () => {
    Alert.alert("تسجيل الخروج", "هل تريد تسجيل الخروج؟", [
      { text: "إلغاء", style: "cancel" },
      { text: "خروج", style: "destructive", onPress: () => logout() },
    ]);
  };

  const lastSyncText = lastSync
    ? new Date(lastSync).toLocaleTimeString("ar-DZ")
    : "لم تتم بعد";

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <SyncBar />
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* User info */}
        <View style={[styles.userCard, { backgroundColor: colors.primary }]}>
          <View style={styles.userAvatar}>
            <Feather name={user?.role === "truck" ? "truck" : "user"} size={28} color={colors.primary} />
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <Text style={styles.userName}>{user?.fullName ?? user?.username}</Text>
            <Text style={styles.userRole}>
              {user?.role === "admin" ? "مدير النظام" :
               user?.role === "truck" ? "سائق شاحنة" : "بائع"}
            </Text>
          </View>
        </View>

        {/* Sync section */}
        <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>المزامنة</Text>
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <SettingRow
            label="مزامنة الآن"
            sub={syncing ? "جاري المزامنة..." : `آخر مزامنة: ${lastSyncText}`}
            icon="refresh-cw"
            color={colors.primary}
            onPress={handleForceSync}
            colors={colors}
          />
          {pending > 0 && (
            <SettingRow
              label={`${pending} سجل في انتظار الرفع`}
              icon="clock"
              color="#f59e0b"
              colors={colors}
            />
          )}
          {error && (
            <SettingRow
              label="خطأ في المزامنة"
              sub={error}
              icon="alert-circle"
              color={colors.destructive}
              colors={colors}
            />
          )}
          <SettingRow
            label="إعادة ضبط المزامنة"
            sub="حذف البيانات المحلية وإعادة التحميل"
            icon="trash-2"
            danger
            onPress={handleResetSync}
            colors={colors}
          />
        </View>

        {/* About section */}
        <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>عن التطبيق</Text>
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <SettingRow label="ERP Van Sales" sub="نظام مبيعات الشاحنات — الجزائر" icon="info" colors={colors} />
          <SettingRow label="العملة" sub="دينار جزائري (د.ج)" icon="dollar-sign" colors={colors} />
          <SettingRow label="اللغة" sub="العربية" icon="globe" colors={colors} />
        </View>

        {/* Logout */}
        <TouchableOpacity
          style={[styles.logoutBtn, { backgroundColor: colors.destructive }]}
          onPress={handleLogout}
          activeOpacity={0.85}
        >
          <Feather name="log-out" size={18} color="#fff" />
          <Text style={styles.logoutText}>تسجيل الخروج</Text>
        </TouchableOpacity>

        <View style={{ height: 100 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { padding: 16 },
  userCard: {
    borderRadius: 16, padding: 20,
    flexDirection: "row-reverse", alignItems: "center", gap: 14, marginBottom: 24,
  },
  userAvatar: {
    width: 52, height: 52, borderRadius: 14,
    backgroundColor: "#fff", alignItems: "center", justifyContent: "center",
  },
  userName: { color: "#fff", fontSize: 18, fontFamily: "Cairo_700Bold" },
  userRole: { color: "#ffffff99", fontSize: 13, fontFamily: "Cairo_400Regular" },
  sectionTitle: { fontSize: 12, fontFamily: "Cairo_600SemiBold", textAlign: "right", marginBottom: 8, marginLeft: 4 },
  card: { borderRadius: 16, borderWidth: 1, overflow: "hidden", marginBottom: 20 },
  row: {
    flexDirection: "row-reverse", alignItems: "center", gap: 12,
    padding: 14, borderBottomWidth: 1,
  },
  rowIcon: { width: 38, height: 38, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  rowLabel: { fontSize: 14, fontFamily: "Cairo_600SemiBold" },
  rowSub: { fontSize: 11, fontFamily: "Cairo_400Regular", marginTop: 2 },
  logoutBtn: {
    flexDirection: "row-reverse", alignItems: "center", justifyContent: "center",
    gap: 10, padding: 16, borderRadius: 16,
  },
  logoutText: { color: "#fff", fontSize: 16, fontFamily: "Cairo_700Bold" },
});
