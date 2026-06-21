import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { getDb, setSyncMeta, TABLE_LABELS } from "@/lib/db";
import { saveServerUrl, getSessionSid, saveTruckCredentials } from "@/lib/api";
import { pullSync } from "@/lib/sync";
import { AppButton, PressableScale, ResultDialog } from "@/components/ui";
import type { DialogAction, ResultVariant } from "@/components/ui";
import { fonts } from "@/constants/tokens";
import { useTheme } from "@/hooks/useTheme";
import { useAuth } from "@/contexts/AuthContext";

const TABLE_LABEL_MAP: Record<string, string> = Object.fromEntries(TABLE_LABELS);

type Phase = "idle" | "login" | "pulling" | "done";

interface ProgressEntry {
  tableName: string;
  count: number;
}

export default function SetupScreen() {
  const t = useTheme();
  const c = t.color;
  const insets = useSafeAreaInsets();
  const { truckLogin } = useAuth();

  const [serverUrl, setServerUrl] = useState("https://deleveri.alllal.com");
  const [truckName, setTruckName] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);

  const [phase, setPhase] = useState<Phase>("idle");
  const [currentTable, setCurrentTable] = useState<string | null>(null);
  const [progress, setProgress] = useState<ProgressEntry[]>([]);
  const [totalRecords, setTotalRecords] = useState(0);

  const [dialog, setDialog] = useState<{ visible: boolean; variant: ResultVariant; title: string; message?: string; actions?: DialogAction[] }>(
    { visible: false, variant: "info", title: "" }
  );
  const showDialog = (variant: ResultVariant, title: string, message?: string, actions?: DialogAction[]) =>
    setDialog({ visible: true, variant, title, message, actions });
  const hideDialog = () => setDialog((d) => ({ ...d, visible: false }));

  const handleSetup = async () => {
    if (!serverUrl.trim()) {
      showDialog("warning", "تنبيه", "يرجى إدخال رابط السيرفر");
      return;
    }
    if (!truckName.trim() || !password.trim()) {
      showDialog("warning", "تنبيه", "يرجى إدخال اسم الشاحنة وكلمة المرور");
      return;
    }

    const baseUrl = serverUrl.trim().replace(/\/$/, "");

    try {
      setPhase("login");
      setProgress([]);
      setTotalRecords(0);
      setCurrentTable(null);

      // Save server URL first so truckLogin can reach it
      await saveServerUrl(baseUrl);

      // Authenticate as truck — sets user state in AuthContext + saves session cookie
      await truckLogin(truckName.trim(), password.trim());

      // Save credentials for auto-login on every future app open
      await saveTruckCredentials(truckName.trim(), password.trim());

      const sid = await getSessionSid();
      if (!sid) {
        setPhase("idle");
        showDialog("error", "خطأ", "لم يتم استلام جلسة صالحة من السيرفر");
        return;
      }

      setPhase("pulling");

      let total = 0;
      await pullSync(sid, {
        since: "1970-01-01T00:00:00.000Z",
        apiUrl: baseUrl,
        onProgress: (tableName, count) => {
          setCurrentTable(tableName);
          total += count;
          setTotalRecords(total);
          setProgress(prev => [...prev, { tableName, count }]);
        },
      });

      const db = await getDb();
      if (db) {
        await setSyncMeta(db, "bootstrap_done", "1");
      }

      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setPhase("done");

      // Navigate directly to the app — user is already authenticated
      setTimeout(() => {
        router.replace("/(tabs)");
      }, 1500);
    } catch (err: any) {
      setPhase("idle");
      const msg =
        err?.message === "بيانات الشاحنة خاطئة"
          ? "اسم الشاحنة أو كلمة المرور غير صحيحة"
          : err?.message?.includes("Network request failed") || err?.message?.includes("fetch")
          ? "تعذّر الاتصال بالسيرفر. تحقق من الرابط واتصال الإنترنت."
          : err?.message ?? "حدث خطأ غير متوقع";
      showDialog("error", "خطأ في الإعداد", msg);
    }
  };

  const isBusy = phase === "login" || phase === "pulling";

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: c.bg, paddingTop: insets.top }]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.card}>
          <View style={[styles.logoBox, { backgroundColor: c.brand }]}>
            <Feather name="truck" size={36} color={c.onBrand} />
          </View>
          <Text style={[styles.title, { color: c.text }]}>إعداد الجهاز</Text>
          <Text style={[styles.subtitle, { color: c.textMuted }]}>
            أدخل بيانات الشاحنة لربط هذا الجهاز بها
          </Text>

          {phase === "idle" || phase === "login" ? (
            <>
              <View style={styles.fieldGroup}>
                <Text style={[styles.label, { color: c.textMuted }]}>رابط السيرفر</Text>
                <View style={[styles.inputWrap, { borderColor: c.hairline, backgroundColor: c.surface }]}>
                  <Feather name="server" size={16} color={c.textMuted} style={styles.inputIcon} />
                  <TextInput
                    style={[styles.input, { color: c.text }]}
                    placeholder="https://deleveri.alllal.com"
                    placeholderTextColor={c.textFaint}
                    value={serverUrl}
                    onChangeText={setServerUrl}
                    autoCapitalize="none"
                    autoCorrect={false}
                    keyboardType="url"
                    textAlign="right"
                    editable={!isBusy}
                  />
                </View>
              </View>

              <View style={styles.fieldGroup}>
                <Text style={[styles.label, { color: c.textMuted }]}>اسم الشاحنة</Text>
                <View style={[styles.inputWrap, { borderColor: c.hairline, backgroundColor: c.surface }]}>
                  <Feather name="truck" size={16} color={c.textMuted} style={styles.inputIcon} />
                  <TextInput
                    style={[styles.input, { color: c.text }]}
                    placeholder="مثال: شاحنة 1"
                    placeholderTextColor={c.textFaint}
                    value={truckName}
                    onChangeText={setTruckName}
                    autoCapitalize="none"
                    autoCorrect={false}
                    textAlign="right"
                    editable={!isBusy}
                  />
                </View>
              </View>

              <View style={styles.fieldGroup}>
                <Text style={[styles.label, { color: c.textMuted }]}>كلمة المرور</Text>
                <View style={[styles.inputWrap, { borderColor: c.hairline, backgroundColor: c.surface }]}>
                  <PressableScale
                    onPress={() => setShowPass(v => !v)}
                    style={styles.inputIcon}
                    disabled={isBusy}
                  >
                    <Feather name={showPass ? "eye-off" : "eye"} size={16} color={c.textMuted} />
                  </PressableScale>
                  <TextInput
                    style={[styles.input, { color: c.text }]}
                    placeholder="كلمة المرور"
                    placeholderTextColor={c.textFaint}
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry={!showPass}
                    textAlign="right"
                    editable={!isBusy}
                  />
                </View>
              </View>

              <AppButton
                label={phase === "login" ? "جارٍ تسجيل الدخول..." : "ربط الجهاز بالشاحنة"}
                size="lg"
                fullWidth
                loading={phase === "login"}
                disabled={isBusy}
                onPress={handleSetup}
                style={styles.btn}
              />
            </>
          ) : null}

          {phase === "pulling" && (
            <View style={[styles.progressBox, { borderColor: c.hairline, backgroundColor: c.surface }]}>
              <View style={styles.progressHeader}>
                <ActivityIndicator color={c.brand} size="small" />
                <Text style={[styles.progressTitle, { color: c.text }]}>
                  جارٍ سحب البيانات...
                </Text>
              </View>
              {currentTable && (
                <Text style={[styles.progressCurrent, { color: c.brand }]}>
                  ▶ {TABLE_LABEL_MAP[currentTable] ?? currentTable}
                </Text>
              )}
              <View style={styles.progressList}>
                {progress.map(({ tableName, count }) => (
                  <View key={tableName} style={styles.progressRow}>
                    <Text style={[styles.progressTableName, { color: c.textMuted }]}>
                      {TABLE_LABEL_MAP[tableName] ?? tableName}
                    </Text>
                    <Text style={[styles.progressCount, { color: c.text }]}>
                      {count} سجل
                    </Text>
                  </View>
                ))}
              </View>
              {totalRecords > 0 && (
                <Text style={[styles.progressTotal, { color: c.textMuted, borderTopColor: c.hairline }]}>
                  الإجمالي: {totalRecords} سجل
                </Text>
              )}
            </View>
          )}

          {phase === "done" && (
            <View style={[styles.doneBox, { borderColor: c.hairline, backgroundColor: c.surface }]}>
              <Feather name="check-circle" size={40} color={c.success} />
              <Text style={[styles.doneTitle, { color: c.text }]}>
                تم ربط الجهاز بنجاح!
              </Text>
              <Text style={[styles.doneSubtitle, { color: c.textMuted }]}>
                تم استيراد {totalRecords} سجل. جارٍ فتح التطبيق...
              </Text>
              <ActivityIndicator color={c.brand} style={{ marginTop: 12 }} />
            </View>
          )}
        </View>
      </ScrollView>

      <ResultDialog
        visible={dialog.visible}
        variant={dialog.variant}
        title={dialog.title}
        message={dialog.message}
        actions={dialog.actions}
        onRequestClose={hideDialog}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { flexGrow: 1, justifyContent: "center", alignItems: "center", padding: 24 },
  card: { width: "100%", maxWidth: 400, alignItems: "center", gap: 14 },
  logoBox: {
    width: 80, height: 80, borderRadius: 20,
    alignItems: "center", justifyContent: "center", marginBottom: 4,
  },
  title: { fontSize: 24, fontFamily: fonts.bold },
  subtitle: { fontSize: 14, fontFamily: fonts.regular, textAlign: "center", marginBottom: 4 },
  fieldGroup: { width: "100%", gap: 6 },
  label: { fontSize: 13, fontFamily: fonts.semibold, textAlign: "right" },
  inputWrap: {
    width: "100%", flexDirection: "row-reverse", alignItems: "center",
    borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, height: 52,
  },
  inputIcon: { marginLeft: 8 },
  input: { flex: 1, fontSize: 15, fontFamily: fonts.regular, textAlign: "right" },
  btn: {
    width: "100%", marginTop: 6,
  },
  progressBox: {
    width: "100%", borderWidth: 1, borderRadius: 16,
    padding: 16, gap: 10,
  },
  progressHeader: { flexDirection: "row-reverse", alignItems: "center", gap: 10 },
  progressTitle: { fontSize: 16, fontFamily: fonts.bold },
  progressCurrent: { fontSize: 14, fontFamily: fonts.semibold, textAlign: "right" },
  progressList: { gap: 6 },
  progressRow: {
    flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "center",
  },
  progressTableName: { fontSize: 13, fontFamily: fonts.regular },
  progressCount: { fontSize: 13, fontFamily: fonts.semibold },
  progressTotal: {
    fontSize: 13, fontFamily: fonts.semibold, textAlign: "right",
    borderTopWidth: 1, paddingTop: 8, marginTop: 4,
  },
  doneBox: {
    width: "100%", borderWidth: 1, borderRadius: 16,
    padding: 24, alignItems: "center", gap: 10,
  },
  doneTitle: { fontSize: 18, fontFamily: fonts.bold },
  doneSubtitle: { fontSize: 14, fontFamily: fonts.regular, textAlign: "center" },
});
