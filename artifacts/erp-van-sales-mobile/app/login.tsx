import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator, Alert, KeyboardAvoidingView, Platform,
  StyleSheet, Text, TextInput, TouchableOpacity, View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/contexts/AuthContext";
import { useColors } from "@/hooks/useColors";

type Tab = "user" | "truck";

export default function LoginScreen() {
  const { login, truckLogin } = useAuth();
  const colors = useColors();
  const insets = useSafeAreaInsets();

  const [tab, setTab] = useState<Tab>("user");

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);

  const [truckName, setTruckName] = useState("");
  const [truckPassword, setTruckPassword] = useState("");
  const [showTruckPass, setShowTruckPass] = useState(false);

  const [loading, setLoading] = useState(false);

  const handleUserLogin = async () => {
    if (!username.trim() || !password.trim()) {
      Alert.alert("تنبيه", "يرجى إدخال اسم المستخدم وكلمة المرور");
      return;
    }
    try {
      setLoading(true);
      await login(username.trim(), password.trim());
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.replace("/(tabs)");
    } catch (e: any) {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert("خطأ", e?.message ?? "فشل تسجيل الدخول. تحقق من بيانات الاتصال والسيرفر.");
    } finally {
      setLoading(false);
    }
  };

  const handleTruckLogin = async () => {
    if (!truckName.trim() || !truckPassword.trim()) {
      Alert.alert("تنبيه", "يرجى إدخال اسم الشاحنة وكلمة المرور");
      return;
    }
    try {
      setLoading(true);
      await truckLogin(truckName.trim(), truckPassword.trim());
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.replace("/(tabs)");
    } catch (e: any) {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert("خطأ", e?.message ?? "فشل تسجيل الدخول. تحقق من اسم الشاحنة وكلمة المرور.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top }]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={styles.card}>
        <View style={[styles.logoBox, { backgroundColor: colors.primary }]}>
          <Feather name="truck" size={36} color="#fff" />
        </View>
        <Text style={[styles.title, { color: colors.foreground }]}>ERP Van Sales</Text>
        <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>تسجيل الدخول</Text>

        {/* Tab switcher */}
        <View style={[styles.tabRow, { backgroundColor: colors.muted ?? "#f0f0f0", borderColor: colors.border }]}>
          <TouchableOpacity
            style={[
              styles.tabBtn,
              tab === "user"
                ? { backgroundColor: colors.primary }
                : { backgroundColor: "transparent" },
            ]}
            onPress={() => setTab("user")}
            activeOpacity={0.8}
          >
            <Feather
              name="user"
              size={14}
              color={tab === "user" ? "#fff" : colors.foreground}
              style={{ marginBottom: 2 }}
            />
            <Text style={[styles.tabText, { color: tab === "user" ? "#fff" : colors.foreground }]}>
              مستخدم
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.tabBtn,
              tab === "truck"
                ? { backgroundColor: colors.primary }
                : { backgroundColor: "transparent" },
            ]}
            onPress={() => setTab("truck")}
            activeOpacity={0.8}
          >
            <Feather
              name="truck"
              size={14}
              color={tab === "truck" ? "#fff" : colors.foreground}
              style={{ marginBottom: 2 }}
            />
            <Text style={[styles.tabText, { color: tab === "truck" ? "#fff" : colors.foreground }]}>
              شاحنة
            </Text>
          </TouchableOpacity>
        </View>

        {tab === "user" ? (
          <>
            <View style={[styles.inputWrap, { borderColor: colors.border, backgroundColor: colors.card }]}>
              <Feather name="user" size={16} color={colors.mutedForeground} style={styles.inputIcon} />
              <TextInput
                style={[styles.input, { color: colors.foreground }]}
                placeholder="اسم المستخدم"
                placeholderTextColor={colors.mutedForeground}
                value={username}
                onChangeText={setUsername}
                autoCapitalize="none"
                autoCorrect={false}
                textAlign="right"
              />
            </View>

            <View style={[styles.inputWrap, { borderColor: colors.border, backgroundColor: colors.card }]}>
              <TouchableOpacity onPress={() => setShowPass(v => !v)} style={styles.inputIcon}>
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
              />
            </View>

            <TouchableOpacity
              style={[styles.btn, { backgroundColor: loading ? colors.muted : colors.primary }]}
              onPress={handleUserLogin}
              disabled={loading}
              activeOpacity={0.8}
            >
              {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>دخول</Text>}
            </TouchableOpacity>
          </>
        ) : (
          <>
            <View style={[styles.inputWrap, { borderColor: colors.border, backgroundColor: colors.card }]}>
              <Feather name="truck" size={16} color={colors.mutedForeground} style={styles.inputIcon} />
              <TextInput
                style={[styles.input, { color: colors.foreground }]}
                placeholder="اسم الشاحنة (مثال: شاحنة 1)"
                placeholderTextColor={colors.mutedForeground}
                value={truckName}
                onChangeText={setTruckName}
                autoCapitalize="none"
                autoCorrect={false}
                textAlign="right"
              />
            </View>

            <View style={[styles.inputWrap, { borderColor: colors.border, backgroundColor: colors.card }]}>
              <TouchableOpacity onPress={() => setShowTruckPass(v => !v)} style={styles.inputIcon}>
                <Feather name={showTruckPass ? "eye-off" : "eye"} size={16} color={colors.mutedForeground} />
              </TouchableOpacity>
              <TextInput
                style={[styles.input, { color: colors.foreground }]}
                placeholder="كلمة المرور"
                placeholderTextColor={colors.mutedForeground}
                value={truckPassword}
                onChangeText={setTruckPassword}
                secureTextEntry={!showTruckPass}
                textAlign="right"
              />
            </View>

            <TouchableOpacity
              style={[styles.btn, { backgroundColor: loading ? colors.muted : colors.primary }]}
              onPress={handleTruckLogin}
              disabled={loading}
              activeOpacity={0.8}
            >
              {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>دخول كشاحنة</Text>}
            </TouchableOpacity>
          </>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: "center", alignItems: "center", padding: 24 },
  card: { width: "100%", maxWidth: 380, alignItems: "center", gap: 14 },
  logoBox: { width: 80, height: 80, borderRadius: 20, alignItems: "center", justifyContent: "center", marginBottom: 4 },
  title: { fontSize: 24, fontFamily: "Cairo_700Bold" },
  subtitle: { fontSize: 15, fontFamily: "Cairo_400Regular", marginBottom: 4 },
  tabRow: {
    width: "100%", flexDirection: "row", borderWidth: 1,
    borderRadius: 12, overflow: "hidden", marginBottom: 4,
  },
  tabBtn: { flex: 1, paddingVertical: 10, alignItems: "center", gap: 2 },
  tabText: { fontSize: 13, fontFamily: "Cairo_700Bold" },
  inputWrap: {
    width: "100%", flexDirection: "row-reverse", alignItems: "center",
    borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, height: 52,
  },
  inputIcon: { marginLeft: 8 },
  input: { flex: 1, fontSize: 15, fontFamily: "Cairo_400Regular", textAlign: "right" },
  btn: { width: "100%", height: 52, borderRadius: 12, alignItems: "center", justifyContent: "center", marginTop: 6 },
  btnText: { color: "#fff", fontSize: 17, fontFamily: "Cairo_700Bold" },
});
