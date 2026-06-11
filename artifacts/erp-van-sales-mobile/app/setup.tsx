import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { getDb, setSyncMeta } from "@/lib/db";
import { saveServerUrl, saveSession } from "@/lib/api";
import { pullSync } from "@/lib/sync";
import { useColors } from "@/hooks/useColors";
import { TABLE_LABELS } from "@/lib/db";

const TABLE_LABEL_MAP: Record<string, string> = Object.fromEntries(TABLE_LABELS);

type Phase = "idle" | "login" | "pulling" | "done";

interface ProgressEntry {
  tableName: string;
  count: number;
}

export default function SetupScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();

  const [serverUrl, setServerUrl] = useState("https://deleveri.alllal.com");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);

  const [phase, setPhase] = useState<Phase>("idle");
  const [currentTable, setCurrentTable] = useState<string | null>(null);
  const [progress, setProgress] = useState<ProgressEntry[]>([]);
  const [totalRecords, setTotalRecords] = useState(0);

  const handleSetup = async () => {
    if (!serverUrl.trim()) {
      Alert.alert("تنبيه", "يرجى إدخال رابط السيرفر");
      return;
    }
    if (!username.trim() || !password.trim()) {
      Alert.alert("تنبيه", "يرجى إدخال اسم المستخدم وكلمة المرور");
      return;
    }

    const baseUrl = serverUrl.trim().replace(/\/$/, "");

    try {
      setPhase("login");
      setProgress([]);
      setTotalRecords(0);
      setCurrentTable(null);

      const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: username.trim(), password: password.trim() }),
      });

      if (!loginRes.ok) {
        setPhase("idle");
        Alert.alert("خطأ في تسجيل الدخول", "بيانات الدخول خاطئة أو السيرفر غير متاح");
        return;
      }

      const setCookieHeader = loginRes.headers.get("set-cookie");
      const match = setCookieHeader?.match(/connect\.sid=([^;]+)/);
      if (!match?.[1]) {
        setPhase("idle");
        Alert.alert("خطأ", "لم يتم استلام جلسة صالحة من السيرفر");
        return;
      }
      const sid = match[1];

      await saveServerUrl(baseUrl);
      await saveSession(setCookieHeader);

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

      setTimeout(() => {
        router.replace("/login");
      }, 1500);
    } catch (err: any) {
      setPhase("idle");
      const msg =
        err?.message?.includes("Network request failed") || err?.message?.includes("fetch")
          ? "تعذّر الاتصال بالسيرفر. تحقق من الرابط واتصال الإنترنت."
          : err?.message ?? "حدث خطأ غير متوقع";
      Alert.alert("خطأ في الإعداد", msg);
    }
  };

  const isBusy = phase === "login" || phase === "pulling";

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top }]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.card}>
          <View style={[styles.logoBox, { backgroundColor: colors.primary }]}>
            <Feather name="download-cloud" size={36} color="#fff" />
          </View>
          <Text style={[styles.title, { color: colors.foreground }]}>الإعداد الأولي</Text>
          <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
            سيتم سحب جميع البيانات من السيرفر مرة واحدة
          </Text>

          {phase === "idle" || phase === "login" ? (
            <>
              <View style={styles.fieldGroup}>
                <Text style={[styles.label, { color: colors.mutedForeground }]}>رابط السيرفر</Text>
                <View style={[styles.inputWrap, { borderColor: colors.border, backgroundColor: colors.card }]}>
                  <Feather name="server" size={16} color={colors.mutedForeground} style={styles.inputIcon} />
                  <TextInput
                    style={[styles.input, { color: colors.foreground }]}
                    placeholder="https://deleveri.alllal.com"
                    placeholderTextColor={colors.mutedForeground}
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
                <Text style={[styles.label, { color: colors.mutedForeground }]}>اسم المستخدم</Text>
                <View style={[styles.inputWrap, { borderColor: colors.border, backgroundColor: colors.card }]}>
                  <Feather name="user" size={16} color={colors.mutedForeground} style={styles.inputIcon} />
                  <TextInput
                    style={[styles.input, { color: colors.foreground }]}
                    placeholder="admin"
                    placeholderTextColor={colors.mutedForeground}
                    value={username}
                    onChangeText={setUsername}
                    autoCapitalize="none"
                    autoCorrect={false}
                    textAlign="right"
                    editable={!isBusy}
                  />
                </View>
              </View>

              <View style={styles.fieldGroup}>
                <Text style={[styles.label, { color: colors.mutedForeground }]}>كلمة المرور</Text>
                <View style={[styles.inputWrap, { borderColor: colors.border, backgroundColor: colors.card }]}>
                  <TouchableOpacity
                    onPress={() => setShowPass(v => !v)}
                    style={styles.inputIcon}
                    disabled={isBusy}
                  >
                    <Feather name={showPass ? "eye-off" : "eye"} size={16} color={colors.mutedForeground} />
                  </TouchableOpacity>
                  <TextInput
                    style={[styles.input, { color: colors.foreground }]}
                    placeholder="كلمة المرور"
                    placeholderTextColor={colors.mutedForeground}
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry={!showPass}
                    textAlign="right"
                    editable={!isBusy}
                  />
                </View>
              </View>

              <TouchableOpacity
                style={[styles.btn, { backgroundColor: isBusy ? colors.muted : colors.primary }]}
                onPress={handleSetup}
                disabled={isBusy}
                activeOpacity={0.8}
              >
                {phase === "login" ? (
                  <View style={styles.btnInner}>
                    <ActivityIndicator color="#fff" size="small" />
                    <Text style={styles.btnText}>جارٍ تسجيل الدخول...</Text>
                  </View>
                ) : (
                  <Text style={styles.btnText}>بدء الإعداد</Text>
                )}
              </TouchableOpacity>
            </>
          ) : null}

          {phase === "pulling" && (
            <View style={[styles.progressBox, { borderColor: colors.border, backgroundColor: colors.card }]}>
              <View style={styles.progressHeader}>
                <ActivityIndicator color={colors.primary} size="small" />
                <Text style={[styles.progressTitle, { color: colors.foreground }]}>
                  جارٍ سحب البيانات...
                </Text>
              </View>
              {currentTable && (
                <Text style={[styles.progressCurrent, { color: colors.primary }]}>
                  ▶ {TABLE_LABEL_MAP[currentTable] ?? currentTable}
                </Text>
              )}
              <View style={styles.progressList}>
                {progress.map(({ tableName, count }) => (
                  <View key={tableName} style={styles.progressRow}>
                    <Text style={[styles.progressTableName, { color: colors.mutedForeground }]}>
                      {TABLE_LABEL_MAP[tableName] ?? tableName}
                    </Text>
                    <Text style={[styles.progressCount, { color: colors.foreground }]}>
                      {count} سجل
                    </Text>
                  </View>
                ))}
              </View>
              {totalRecords > 0 && (
                <Text style={[styles.progressTotal, { color: colors.mutedForeground }]}>
                  الإجمالي: {totalRecords} سجل
                </Text>
              )}
            </View>
          )}

          {phase === "done" && (
            <View style={[styles.doneBox, { borderColor: colors.border, backgroundColor: colors.card }]}>
              <Feather name="check-circle" size={40} color="#22c55e" />
              <Text style={[styles.doneTitle, { color: colors.foreground }]}>
                اكتمل الإعداد بنجاح!
              </Text>
              <Text style={[styles.doneSubtitle, { color: colors.mutedForeground }]}>
                تم استيراد {totalRecords} سجل. جارٍ الانتقال لتسجيل الدخول...
              </Text>
              <ActivityIndicator color={colors.primary} style={{ marginTop: 12 }} />
            </View>
          )}
        </View>
      </ScrollView>
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
  title: { fontSize: 24, fontFamily: "Cairo_700Bold" },
  subtitle: { fontSize: 14, fontFamily: "Cairo_400Regular", textAlign: "center", marginBottom: 4 },
  fieldGroup: { width: "100%", gap: 6 },
  label: { fontSize: 13, fontFamily: "Cairo_600SemiBold", textAlign: "right" },
  inputWrap: {
    width: "100%", flexDirection: "row-reverse", alignItems: "center",
    borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, height: 52,
  },
  inputIcon: { marginLeft: 8 },
  input: { flex: 1, fontSize: 15, fontFamily: "Cairo_400Regular", textAlign: "right" },
  btn: {
    width: "100%", height: 52, borderRadius: 12,
    alignItems: "center", justifyContent: "center", marginTop: 6,
  },
  btnInner: { flexDirection: "row", alignItems: "center", gap: 8 },
  btnText: { color: "#fff", fontSize: 17, fontFamily: "Cairo_700Bold" },
  progressBox: {
    width: "100%", borderWidth: 1, borderRadius: 16,
    padding: 16, gap: 10,
  },
  progressHeader: { flexDirection: "row-reverse", alignItems: "center", gap: 10 },
  progressTitle: { fontSize: 16, fontFamily: "Cairo_700Bold" },
  progressCurrent: { fontSize: 14, fontFamily: "Cairo_600SemiBold", textAlign: "right" },
  progressList: { gap: 6 },
  progressRow: {
    flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "center",
  },
  progressTableName: { fontSize: 13, fontFamily: "Cairo_400Regular" },
  progressCount: { fontSize: 13, fontFamily: "Cairo_600SemiBold" },
  progressTotal: {
    fontSize: 13, fontFamily: "Cairo_600SemiBold", textAlign: "right",
    borderTopWidth: 1, borderTopColor: "#e5e7eb", paddingTop: 8, marginTop: 4,
  },
  doneBox: {
    width: "100%", borderWidth: 1, borderRadius: 16,
    padding: 24, alignItems: "center", gap: 10,
  },
  doneTitle: { fontSize: 18, fontFamily: "Cairo_700Bold" },
  doneSubtitle: { fontSize: 14, fontFamily: "Cairo_400Regular", textAlign: "center" },
});
