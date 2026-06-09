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

export default function LoginScreen() {
  const { login } = useAuth();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
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
          onPress={handleLogin}
          disabled={loading}
          activeOpacity={0.8}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.btnText}>دخول</Text>
          )}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: "center", alignItems: "center", padding: 24 },
  card: { width: "100%", maxWidth: 380, alignItems: "center", gap: 14 },
  logoBox: { width: 80, height: 80, borderRadius: 20, alignItems: "center", justifyContent: "center", marginBottom: 4 },
  title: { fontSize: 24, fontFamily: "Cairo_700Bold" },
  subtitle: { fontSize: 15, fontFamily: "Cairo_400Regular", marginBottom: 8 },
  inputWrap: {
    width: "100%", flexDirection: "row-reverse", alignItems: "center",
    borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, height: 52,
  },
  inputIcon: { marginLeft: 8 },
  input: { flex: 1, fontSize: 15, fontFamily: "Cairo_400Regular", textAlign: "right" },
  btn: { width: "100%", height: 52, borderRadius: 12, alignItems: "center", justifyContent: "center", marginTop: 6 },
  btnText: { color: "#fff", fontSize: 17, fontFamily: "Cairo_700Bold" },
});
