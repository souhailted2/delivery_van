import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import { useEffect, useRef, useState } from "react";
import {
  Animated, Image, KeyboardAvoidingView, Platform,
  StyleSheet, Text, TextInput, View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppButton, Card, PressableScale, ResultDialog } from "@/components/ui";
import type { DialogAction, ResultVariant } from "@/components/ui";
import { useAuth } from "@/contexts/AuthContext";
import { fonts, motion } from "@/constants/tokens";
import { useTheme } from "@/hooks/useTheme";

const logo = require("../assets/images/logo.png");

export default function LoginScreen() {
  const { truckLogin } = useAuth();
  const c = useTheme().color;
  const insets = useSafeAreaInsets();

  const [truckName, setTruckName] = useState("");
  const [truckPassword, setTruckPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);

  const [dialog, setDialog] = useState<{ visible: boolean; variant: ResultVariant; title: string; message?: string; actions?: DialogAction[] }>(
    { visible: false, variant: "info", title: "" }
  );
  const showDialog = (variant: ResultVariant, title: string, message?: string, actions?: DialogAction[]) =>
    setDialog({ visible: true, variant, title, message, actions });
  const hideDialog = () => setDialog((d) => ({ ...d, visible: false }));

  const fade = useRef(new Animated.Value(0)).current;
  const rise = useRef(new Animated.Value(24)).current;
  useEffect(() => {
    Animated.parallel([
      Animated.timing(fade, { toValue: 1, duration: motion.duration.slow, easing: motion.easing.out, useNativeDriver: true }),
      Animated.timing(rise, { toValue: 0, duration: motion.duration.slow, easing: motion.easing.out, useNativeDriver: true }),
    ]).start();
  }, [fade, rise]);

  const handleTruckLogin = async () => {
    if (!truckName.trim() || !truckPassword.trim()) { showDialog("warning", "تنبيه", "يرجى إدخال اسم الشاحنة وكلمة المرور"); return; }
    try {
      setLoading(true);
      await truckLogin(truckName.trim(), truckPassword.trim());
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.replace("/(tabs)");
    } catch (e: any) {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      showDialog("error", "خطأ", e?.message ?? "فشل تسجيل الدخول. تحقق من اسم الشاحنة وكلمة المرور.");
    } finally { setLoading(false); }
  };

  return (
    <View style={[styles.root, { backgroundColor: c.bg }]}>
      <View pointerEvents="none" style={[styles.glow, { backgroundColor: c.brandTint }]} />
      <KeyboardAvoidingView style={[styles.container, { paddingTop: insets.top }]} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <Animated.View style={[styles.card, { opacity: fade, transform: [{ translateY: rise }] }]}>
          <View style={styles.medal}><Image source={logo} style={styles.logoImg} resizeMode="contain" /></View>
          <Text style={[styles.brand, { color: c.text }]}>ALLAL <Text style={{ color: c.brand }}>Delivery</Text></Text>
          <Text style={[styles.sub, { color: c.textMuted }]}>نظام مبيعات الشاحنة</Text>

          <Card radius={16} pad={0} style={styles.field}>
            <Feather name="truck" size={18} color={c.textFaint} />
            <TextInput
              style={[styles.input, { color: c.text }]}
              placeholder="اسم الشاحنة (مثال: شاحنة 1)" placeholderTextColor={c.textFaint}
              value={truckName} onChangeText={setTruckName} textAlign="right" autoCapitalize="none" autoCorrect={false} />
          </Card>

          <Card radius={16} pad={0} style={styles.field}>
            <PressableScale onPress={() => setShowPass(v => !v)}>
              <Feather name={showPass ? "eye-off" : "eye"} size={18} color={c.textFaint} />
            </PressableScale>
            <TextInput
              style={[styles.input, { color: c.text }]}
              placeholder="كلمة المرور" placeholderTextColor={c.textFaint}
              value={truckPassword} onChangeText={setTruckPassword} secureTextEntry={!showPass} textAlign="right" />
          </Card>

          <AppButton label="دخول" size="lg" fullWidth loading={loading} disabled={loading} onPress={handleTruckLogin} style={{ width: "100%", marginTop: 6 }} />
        </Animated.View>
      </KeyboardAvoidingView>

      <ResultDialog visible={dialog.visible} variant={dialog.variant} title={dialog.title} message={dialog.message} actions={dialog.actions} onRequestClose={hideDialog} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  glow: { position: "absolute", width: 380, height: 380, borderRadius: 999, top: -120, right: -120 },
  container: { flex: 1, justifyContent: "center", alignItems: "center", padding: 28 },
  card: { width: "100%", maxWidth: 380, alignItems: "center", gap: 14 },
  medal: {
    width: 96, height: 96, borderRadius: 30, backgroundColor: "#fff", alignItems: "center", justifyContent: "center", marginBottom: 4,
    shadowColor: "#0E9AA7", shadowOpacity: 0.4, shadowRadius: 30, shadowOffset: { width: 0, height: 16 }, elevation: 10,
  },
  logoImg: { width: 62, height: 62 },
  brand: { fontSize: 26, fontFamily: fonts.bold, letterSpacing: 0.5 },
  sub: { fontSize: 13, fontFamily: fonts.regular, marginBottom: 6 },
  field: { width: "100%", flexDirection: "row-reverse", alignItems: "center", gap: 10, paddingHorizontal: 16, height: 54 },
  input: { flex: 1, fontSize: 15, fontFamily: fonts.regular, textAlign: "right" },
});
