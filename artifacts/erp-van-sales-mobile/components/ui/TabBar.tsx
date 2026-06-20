import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import React from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { fonts } from "@/constants/tokens";
import { useTheme } from "@/hooks/useTheme";

const ITEMS = [
  { route: "truck-dashboard", label: "الرئيسية", icon: "home" as const },
  { route: "clients", label: "العملاء", icon: "users" as const },
  { route: "truck", label: "شاحنتي", icon: "box" as const },
  { route: "settings", label: "الإعدادات", icon: "settings" as const },
];

/**
 * The custom premium bottom bar: four flat tabs split around a raised, glowing
 * gradient "بيع" (new sale) action — the app's single primary action.
 */
export function TabBar({ state, navigation }: any) {
  const t = useTheme();
  const c = t.color;
  const insets = useSafeAreaInsets();
  const activeName = state?.routes?.[state.index]?.name;

  const onTab = (route: string) => {
    if (route !== activeName) {
      Haptics.selectionAsync();
      navigation.navigate(route);
    }
  };
  const onSell = async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    router.push("/invoice/new");
  };

  const Tab = ({ item }: { item: typeof ITEMS[number] }) => {
    const focused = activeName === item.route;
    return (
      <Pressable style={styles.tab} onPress={() => onTab(item.route)} hitSlop={8}>
        <Feather name={item.icon} size={22} color={focused ? c.brand : c.textFaint} />
        <Text style={[styles.label, { color: focused ? c.brand : c.textFaint }]}>{item.label}</Text>
      </Pressable>
    );
  };

  return (
    <View style={[styles.wrap, { backgroundColor: c.rail, borderTopColor: c.hairline, paddingBottom: Math.max(insets.bottom, 12) }]}>
      <Tab item={ITEMS[0]} />
      <Tab item={ITEMS[1]} />
      <View style={styles.center}>
        <Pressable onPress={onSell} style={({ pressed }) => [pressed && { transform: [{ scale: 0.94 }] }]}>
          <LinearGradient colors={t.gradient.brand as any} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.sell}>
            <Feather name="plus" size={26} color="#fff" />
          </LinearGradient>
          <Text style={[styles.sellLabel, { color: c.brand }]}>بيع</Text>
        </Pressable>
      </View>
      <Tab item={ITEMS[2]} />
      <Tab item={ITEMS[3]} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: "row-reverse", alignItems: "flex-start", justifyContent: "space-around",
    borderTopWidth: 1, paddingTop: 9, paddingHorizontal: 6,
    ...Platform.select({
      default: { shadowColor: "#101C37", shadowOpacity: 0.08, shadowRadius: 20, shadowOffset: { width: 0, height: -8 }, elevation: 16 },
    }),
  },
  tab: { flex: 1, alignItems: "center", gap: 3, paddingTop: 4 },
  label: { fontSize: 11, fontFamily: fonts.semibold },
  center: { flex: 1, alignItems: "center" },
  sell: {
    width: 54, height: 54, borderRadius: 18, alignItems: "center", justifyContent: "center", marginTop: -22,
    shadowColor: "#0E9AA7", shadowOpacity: 0.5, shadowRadius: 16, shadowOffset: { width: 0, height: 10 }, elevation: 14,
  },
  sellLabel: { fontSize: 11, fontFamily: fonts.bold, textAlign: "center", marginTop: 3 },
});
