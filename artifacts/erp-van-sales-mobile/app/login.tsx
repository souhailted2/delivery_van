import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import { useEffect, useRef, useState } from "react";
import {
  Animated, Image, KeyboardAvoidingView, Platform,
  StyleSheet, Text, TextInput, View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AmbientBackground, AppButton, GlassCard, PressableScale, ResultDialog } from "@/components/ui";
import type { DialogAction, ResultVariant } from "@/components/ui";
import { useAuth } from "@/contexts/AuthContext";
import { fonts, motion } from "@/constants/tokens";
import { useTheme } from "@/hooks/useTheme";

const logo = require("../assets/images/logo.png");

type Tab = "user" | "truck";

export default function LoginScreen() {
  const { login, truckLogin } = useAuth();
  const c = useTheme().color;
  const insets = useSafeAreaInsets();

  const [tab, setTab] = useState<Tab>("truck"); // driver-first: this is a field tool
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

  // Glass entrance: card fades + rises in.
  const fade = useRef(new Animated.Value(0)).current;
  const rise = useRef(new Animated.Value(24)).current;
  useEffect(() => {
    Animated.parallel([
      Animated.timing(fade, { toValue: 1, duration: motion.duration.slow, easing: motion.easing.out, useNativeDriver: true }),
      Animated.timing(rise, { toValue: 0, duration: motion.duration.slow, easing: motion.easing.out, useNativeDriver: true }),
    ]).start();
  }, [fade, rise]);

  const handleUserLogin = async () => {
    if (!username.trim() || !password.trim()) { showDialog("warning", "تنبيه", "يرجى إدخال اسم المستخدم وكلمة المرور"); return; }
    try {
      setLoading(true);
      await login(username.trim(), password.trim());
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.replace("/(tabs)");
    } catch (e: any) {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      showDialog("error", "خطأ", e?.message ?? "فشل تسجيل الدخول. تحقق من بيانات الاتصال والسيرفر.");
    } finally { setLoading(false); }
  };

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

  const Input = ({ icon, value, onChangeText, placeholder, secure, onToggle, showing, ...extra }: any) => (
    <GlassCard radius={14} style={styles.inputWrap}>
      <PressableScale onPress={onToggle ?? (() => {})} style={styles.inputIcon} disabled={!onToggle}>
        <Feather name={onToggle ? (showing ? "eye-off" : "eye") : icon} size={16} color={c.textMuted} />
      </PressableScale>
      <TextInput
        style={[styles.input, { color: c.text }]}
        placeholder={placeholder}
        placeholderTextColor={c.textFaint}
        value={value}
        onChangeText={onChangeText}
        secureTextEntry={secure}
        textAlign="right"
        {...extra}
      />
    </GlassCard>
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.glassBase }}>
      <AmbientBackground />
      <KeyboardAvoidingView
        style={[styles.container, { paddingTop: insets.top }]}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <Animated.View style={[styles.card, { opacity: fade, transform: [{ translateY: rise }] }]}>
          {/* Logo lockup — glowing glass medallion */}
          <GlassCard strong tealEdge radius={999} style={styles.medallion}>
            <Image source={logo} style={styles.logoImg} resizeMode="contain" />
          </GlassCard>
          <Text style={[styles.brand, { color: c.text }]}>ALLAL <Text style={{ color: c.brandText }}>Delivery</Text></Text>
          <Text style={[styles.subtitle, { color: c.textMuted }]}>نظام مبيعات الشاحنة</Text>

          {/* Glass tab switcher */}
          <GlassCard radius={14} style={styles.tabRow}>
            {(["truck", "user"] as Tab[]).map(tb => {
              const active = tab === tb;
              return (
                <PressableScale key={tb} style={[styles.tabBtn, active && { backgroundColor: c.brand, borderRadius: 11 }]} onPress={() => setTab(tb)}>
                  <Feather name={tb === "truck" ? "truck" : "user"} size={14} color={active ? c.onBrand : c.textMuted} />
                  <Text style={[styles.tabText, { color: active ? c.onBrand : c.textMuted }]}>{tb === "truck" ? "شاحنة" : "مستخدم"}</Text>
                </PressableScale>
              );
            })}
          </GlassCard>

          {tab === "user" ? (
            <>
              <Input icon="user" value={username} onChangeText={setUsername} placeholder="اسم المستخدم" autoCapitalize="none" autoCorrect={false} />
              <Input value={password} onChangeText={setPassword} placeholder="كلمة المرور" secure={!showPass} onToggle={() => setShowPass(v => !v)} showing={showPass} />
              <AppButton label="دخول" size="lg" fullWidth loading={loading} disabled={loading} onPress={handleUserLogin} style={styles.btn} />
            </>
          ) : (
            <>
              <Input icon="truck" value={truckName} onChangeText={setTruckName} placeholder="اسم الشاحنة (مثال: شاحنة 1)" autoCapitalize="none" autoCorrect={false} />
              <Input value={truckPassword} onChangeText={setTruckPassword} placeholder="كلمة المرور" secure={!showTruckPass} onToggle={() => setShowTruckPass(v => !v)} showing={showTruckPass} />
              <AppButton label="دخول كشاحنة" size="lg" fullWidth loading={loading} disabled={loading} onPress={handleTruckLogin} style={styles.btn} />
            </>
          )}
        </Animated.View>
      </KeyboardAvoidingView>

      <ResultDialog visible={dialog.visible} variant={dialog.variant} title={dialog.title} message={dialog.message} actions={dialog.actions} onRequestClose={hideDialog} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: "center", alignItems: "center", padding: 24 },
  card: { width: "100%", maxWidth: 380, alignItems: "center", gap: 14 },
  medallion: { width: 96, height: 96, alignItems: "center", justifyContent: "center", marginBottom: 6 },
  logoImg: { width: 64, height: 64 },
  brand: { fontSize: 24, fontFamily: fonts.bold, letterSpacing: 1 },
  subtitle: { fontSize: 14, fontFamily: fonts.regular, marginBottom: 6 },
  tabRow: { width: "100%", flexDirection: "row", padding: 4, gap: 4, marginBottom: 4 },
  tabBtn: { flex: 1, flexDirection: "row-reverse", justifyContent: "center", alignItems: "center", gap: 6, paddingVertical: 10 },
  tabText: { fontSize: 13, fontFamily: fonts.bold },
  inputWrap: { width: "100%", flexDirection: "row-reverse", alignItems: "center", paddingHorizontal: 14, height: 52 },
  inputIcon: { marginLeft: 8 },
  input: { flex: 1, fontSize: 15, fontFamily: fonts.regular, textAlign: "right" },
  btn: { width: "100%", marginTop: 6 },
});
