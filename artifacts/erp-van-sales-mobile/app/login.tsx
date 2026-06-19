import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import { useState } from "react";
import {
  KeyboardAvoidingView, Platform,
  StyleSheet, Text, TextInput, View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppButton, PressableScale, ResultDialog } from "@/components/ui";
import type { DialogAction, ResultVariant } from "@/components/ui";
import { useAuth } from "@/contexts/AuthContext";
import { fonts } from "@/constants/tokens";
import { useTheme } from "@/hooks/useTheme";

type Tab = "user" | "truck";

export default function LoginScreen() {
  const { login, truckLogin } = useAuth();
  const t = useTheme();
  const c = t.color;
  const insets = useSafeAreaInsets();

  const [tab, setTab] = useState<Tab>("user");

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);

  const [truckName, setTruckName] = useState("");
  const [truckPassword, setTruckPassword] = useState("");
  const [showTruckPass, setShowTruckPass] = useState(false);

  const [loading, setLoading] = useState(false);

  const [dialog, setDialog] = useState<{ visible: boolean; variant: ResultVariant; title: string; message?: string; actions?: DialogAction[] }>(
    { visible: false, variant: "info", title: "" }
  );
  const showDialog = (variant: ResultVariant, title: string, message?: string, actions?: DialogAction[]) =>
    setDialog({ visible: true, variant, title, message, actions });
  const hideDialog = () => setDialog((d) => ({ ...d, visible: false }));

  const handleUserLogin = async () => {
    if (!username.trim() || !password.trim()) {
      showDialog("warning", "تنبيه", "يرجى إدخال اسم المستخدم وكلمة المرور");
      return;
    }
    try {
      setLoading(true);
      await login(username.trim(), password.trim());
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.replace("/(tabs)");
    } catch (e: any) {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      showDialog("error", "خطأ", e?.message ?? "فشل تسجيل الدخول. تحقق من بيانات الاتصال والسيرفر.");
    } finally {
      setLoading(false);
    }
  };

  const handleTruckLogin = async () => {
    if (!truckName.trim() || !truckPassword.trim()) {
      showDialog("warning", "تنبيه", "يرجى إدخال اسم الشاحنة وكلمة المرور");
      return;
    }
    try {
      setLoading(true);
      await truckLogin(truckName.trim(), truckPassword.trim());
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.replace("/(tabs)");
    } catch (e: any) {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      showDialog("error", "خطأ", e?.message ?? "فشل تسجيل الدخول. تحقق من اسم الشاحنة وكلمة المرور.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: c.bg, paddingTop: insets.top }]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={styles.card}>
        <View style={[styles.logoBox, { backgroundColor: c.brand }]}>
          <Feather name="truck" size={36} color={c.onBrand} />
        </View>
        <Text style={[styles.title, { color: c.text }]}>ERP Van Sales</Text>
        <Text style={[styles.subtitle, { color: c.textMuted }]}>تسجيل الدخول</Text>

        {/* Tab switcher */}
        <View style={[styles.tabRow, { backgroundColor: c.surfaceElevated, borderColor: c.hairline }]}>
          <PressableScale
            style={[
              styles.tabBtn,
              tab === "user"
                ? { backgroundColor: c.brand }
                : { backgroundColor: "transparent" },
            ]}
            onPress={() => setTab("user")}
          >
            <Feather
              name="user"
              size={14}
              color={tab === "user" ? c.onBrand : c.text}
              style={{ marginBottom: 2 }}
            />
            <Text style={[styles.tabText, { color: tab === "user" ? c.onBrand : c.text }]}>
              مستخدم
            </Text>
          </PressableScale>
          <PressableScale
            style={[
              styles.tabBtn,
              tab === "truck"
                ? { backgroundColor: c.brand }
                : { backgroundColor: "transparent" },
            ]}
            onPress={() => setTab("truck")}
          >
            <Feather
              name="truck"
              size={14}
              color={tab === "truck" ? c.onBrand : c.text}
              style={{ marginBottom: 2 }}
            />
            <Text style={[styles.tabText, { color: tab === "truck" ? c.onBrand : c.text }]}>
              شاحنة
            </Text>
          </PressableScale>
        </View>

        {tab === "user" ? (
          <>
            <View style={[styles.inputWrap, { borderColor: c.hairline, backgroundColor: c.surface }]}>
              <Feather name="user" size={16} color={c.textMuted} style={styles.inputIcon} />
              <TextInput
                style={[styles.input, { color: c.text }]}
                placeholder="اسم المستخدم"
                placeholderTextColor={c.textFaint}
                value={username}
                onChangeText={setUsername}
                autoCapitalize="none"
                autoCorrect={false}
                textAlign="right"
              />
            </View>

            <View style={[styles.inputWrap, { borderColor: c.hairline, backgroundColor: c.surface }]}>
              <PressableScale onPress={() => setShowPass(v => !v)} style={styles.inputIcon}>
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
              />
            </View>

            <AppButton
              label="دخول"
              size="lg"
              fullWidth
              loading={loading}
              disabled={loading}
              onPress={handleUserLogin}
              style={styles.btn}
            />
          </>
        ) : (
          <>
            <View style={[styles.inputWrap, { borderColor: c.hairline, backgroundColor: c.surface }]}>
              <Feather name="truck" size={16} color={c.textMuted} style={styles.inputIcon} />
              <TextInput
                style={[styles.input, { color: c.text }]}
                placeholder="اسم الشاحنة (مثال: شاحنة 1)"
                placeholderTextColor={c.textFaint}
                value={truckName}
                onChangeText={setTruckName}
                autoCapitalize="none"
                autoCorrect={false}
                textAlign="right"
              />
            </View>

            <View style={[styles.inputWrap, { borderColor: c.hairline, backgroundColor: c.surface }]}>
              <PressableScale onPress={() => setShowTruckPass(v => !v)} style={styles.inputIcon}>
                <Feather name={showTruckPass ? "eye-off" : "eye"} size={16} color={c.textMuted} />
              </PressableScale>
              <TextInput
                style={[styles.input, { color: c.text }]}
                placeholder="كلمة المرور"
                placeholderTextColor={c.textFaint}
                value={truckPassword}
                onChangeText={setTruckPassword}
                secureTextEntry={!showTruckPass}
                textAlign="right"
              />
            </View>

            <AppButton
              label="دخول كشاحنة"
              size="lg"
              fullWidth
              loading={loading}
              disabled={loading}
              onPress={handleTruckLogin}
              style={styles.btn}
            />
          </>
        )}
      </View>

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
  container: { flex: 1, justifyContent: "center", alignItems: "center", padding: 24 },
  card: { width: "100%", maxWidth: 380, alignItems: "center", gap: 14 },
  logoBox: { width: 80, height: 80, borderRadius: 20, alignItems: "center", justifyContent: "center", marginBottom: 4 },
  title: { fontSize: 24, fontFamily: fonts.bold },
  subtitle: { fontSize: 15, fontFamily: fonts.regular, marginBottom: 4 },
  tabRow: {
    width: "100%", flexDirection: "row", borderWidth: 1,
    borderRadius: 12, overflow: "hidden", marginBottom: 4,
  },
  tabBtn: { flex: 1, paddingVertical: 10, alignItems: "center", gap: 2 },
  tabText: { fontSize: 13, fontFamily: fonts.bold },
  inputWrap: {
    width: "100%", flexDirection: "row-reverse", alignItems: "center",
    borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, height: 52,
  },
  inputIcon: { marginLeft: 8 },
  input: { flex: 1, fontSize: 15, fontFamily: fonts.regular, textAlign: "right" },
  btn: { width: "100%", marginTop: 6 },
});
