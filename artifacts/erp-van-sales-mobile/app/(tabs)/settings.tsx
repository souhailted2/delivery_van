import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import { useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppButton, GradientHero, PressableScale, ResultDialog } from "@/components/ui";
import type { DialogAction, ResultVariant } from "@/components/ui";
import { useAuth } from "@/contexts/AuthContext";
import { useSync } from "@/contexts/SyncContext";
import { fonts } from "@/constants/tokens";
import { useTheme } from "@/hooks/useTheme";

function SettingRow({ label, sub, icon, color, onPress, danger, c }: {
  label: string; sub?: string; icon: any; color?: string;
  onPress?: () => void; danger?: boolean; c: any;
}) {
  return (
    <PressableScale
      style={[styles.row, { borderBottomColor: c.hairline }]}
      onPress={onPress}
      disabled={!onPress}
    >
      <Feather name="chevron-left" size={16} color={c.textMuted} />
      <View style={{ flex: 1, alignItems: "flex-end" }}>
        <Text style={[styles.rowLabel, { color: danger ? c.danger : c.text }]}>{label}</Text>
        {sub && <Text style={[styles.rowSub, { color: c.textMuted }]}>{sub}</Text>}
      </View>
      <View style={[styles.rowIcon, { backgroundColor: (color ?? c.brand) + "22" }]}>
        <Feather name={icon} size={18} color={danger ? c.danger : (color ?? c.brand)} />
      </View>
    </PressableScale>
  );
}

export default function SettingsScreen() {
  const t = useTheme();
  const c = t.color;
  const insets = useSafeAreaInsets();
  const { user, logout, resetDevice } = useAuth();
  const { triggerSync, doResetSync, syncing, resetting, lastSync, pending, error } = useSync();

  const [dialog, setDialog] = useState<{ visible: boolean; variant: ResultVariant; title: string; message?: string; actions?: DialogAction[] }>(
    { visible: false, variant: "info", title: "" }
  );
  const showDialog = (variant: ResultVariant, title: string, message?: string, actions?: DialogAction[]) =>
    setDialog({ visible: true, variant, title, message, actions });
  const hideDialog = () => setDialog((d) => ({ ...d, visible: false }));

  const handleForceSync = () => {
    showDialog("info", "مزامنة", "هل تريد مزامنة البيانات الآن؟", [
      { label: "مزامنة", onPress: () => triggerSync() },
      { label: "إلغاء", variant: "tonal" },
    ]);
  };

  const handleResetSync = () => {
    showDialog(
      "warning",
      "إعادة ضبط المزامنة",
      "سيتم حذف جميع البيانات المحلية وإعادة تحميلها من الخادم. هل أنت متأكد؟",
      [
        { label: "إعادة الضبط", variant: "danger", onPress: () => doResetSync() },
        { label: "إلغاء", variant: "tonal" },
      ]
    );
  };

  const handleLogout = () => {
    showDialog("warning", "تسجيل الخروج", "هل تريد تسجيل الخروج؟", [
      { label: "خروج", variant: "danger", onPress: () => logout() },
      { label: "إلغاء", variant: "tonal" },
    ]);
  };

  const handleResetDevice = () => {
    showDialog(
      "warning",
      "إعادة تعيين الجهاز",
      "سيتم مسح بيانات الشاحنة المرتبطة وإعادة الجهاز لشاشة الإعداد. يجب إعادة ربط الجهاز بشاحنة بعد ذلك.",
      [
        {
          label: "إعادة التعيين",
          variant: "danger",
          onPress: async () => {
            await resetDevice();
            router.replace("/setup");
          },
        },
        { label: "إلغاء", variant: "tonal" },
      ]
    );
  };

  const lastSyncText = lastSync
    ? new Date(lastSync).toLocaleTimeString("ar-DZ")
    : "لم تتم بعد";

  return (
    <View style={[styles.container, { backgroundColor: c.bg, paddingTop: insets.top + 8 }]}>
      <Text style={[styles.pageTitle, { color: c.text }]}>الإعدادات</Text>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* User info */}
        <GradientHero radius={20} style={styles.userCard}>
          <View style={[styles.userAvatar, { backgroundColor: c.onBrand }]}>
            <Feather name={user?.role === "truck" ? "truck" : "user"} size={28} color={c.brand} />
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <Text style={[styles.userName, { color: c.onBrand }]}>{user?.fullName ?? user?.username}</Text>
            <Text style={[styles.userRole, { color: c.onBrand }]}>
              {user?.role === "admin" ? "مدير النظام" :
               user?.role === "truck" ? "سائق شاحنة" : "بائع"}
            </Text>
          </View>
        </GradientHero>

        {/* Sync section */}
        <Text style={[styles.sectionTitle, { color: c.textMuted }]}>المزامنة</Text>
        <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.hairline }]}>
          <SettingRow
            label="مزامنة الآن"
            sub={syncing ? "جاري المزامنة..." : `آخر مزامنة: ${lastSyncText}`}
            icon="refresh-cw"
            color={c.brand}
            onPress={handleForceSync}
            c={c}
          />
          {pending > 0 && (
            <SettingRow
              label={`${pending} سجل في انتظار الرفع`}
              icon="clock"
              color={c.warning}
              c={c}
            />
          )}
          {error && (
            <SettingRow
              label="خطأ في المزامنة"
              sub={error}
              icon="alert-circle"
              color={c.danger}
              c={c}
            />
          )}
          <SettingRow
            label="إعادة ضبط المزامنة"
            sub="حذف البيانات المحلية وإعادة التحميل"
            icon="trash-2"
            danger
            onPress={handleResetSync}
            c={c}
          />
        </View>

        {/* About section */}
        <Text style={[styles.sectionTitle, { color: c.textMuted }]}>عن التطبيق</Text>
        <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.hairline }]}>
          <SettingRow label="ERP Van Sales" sub="نظام مبيعات الشاحنات — الجزائر" icon="info" c={c} />
          <SettingRow label="العملة" sub="دينار جزائري (DZD)" icon="dollar-sign" c={c} />
          <SettingRow label="اللغة" sub="العربية" icon="globe" c={c} />
        </View>

        {/* Device section — truck devices only */}
        {user?.role === "truck" && (
          <>
            <Text style={[styles.sectionTitle, { color: c.textMuted }]}>الجهاز</Text>
            <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.hairline }]}>
              <SettingRow
                label="إعادة تعيين الجهاز"
                sub="تغيير الشاحنة المرتبطة بهذا الجهاز"
                icon="refresh-ccw"
                danger
                onPress={handleResetDevice}
                c={c}
              />
            </View>
          </>
        )}

        {/* Logout */}
        <AppButton
          label="تسجيل الخروج"
          icon="log-out"
          variant="danger"
          size="lg"
          fullWidth
          onPress={handleLogout}
        />

        <View style={{ height: 100 }} />
      </ScrollView>

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
  pageTitle: { fontSize: 21, fontFamily: fonts.bold, textAlign: "right", paddingHorizontal: 16, marginBottom: 8 },
  scroll: { padding: 16, paddingTop: 4 },
  userCard: {
    borderRadius: 16, padding: 20,
    flexDirection: "row-reverse", alignItems: "center", gap: 14, marginBottom: 24,
  },
  userAvatar: {
    width: 52, height: 52, borderRadius: 14,
    alignItems: "center", justifyContent: "center",
  },
  userName: { fontSize: 18, fontFamily: fonts.bold },
  userRole: { fontSize: 13, fontFamily: fonts.regular, opacity: 0.7 },
  sectionTitle: { fontSize: 12, fontFamily: fonts.semibold, textAlign: "right", marginBottom: 8, marginLeft: 4 },
  card: { borderRadius: 16, borderWidth: 1, overflow: "hidden", marginBottom: 20 },
  row: {
    flexDirection: "row-reverse", alignItems: "center", gap: 12,
    padding: 14, borderBottomWidth: 1,
  },
  rowIcon: { width: 38, height: 38, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  rowLabel: { fontSize: 14, fontFamily: fonts.semibold },
  rowSub: { fontSize: 11, fontFamily: fonts.regular, marginTop: 2 },
});
