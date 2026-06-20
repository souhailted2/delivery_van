import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { fonts } from "@/constants/tokens";
import { useTheme } from "@/hooks/useTheme";

type Cell =
  | { kind: "tab"; route: string; label: string; icon: any }
  | { kind: "sell" };

// RTL order (first = rightmost). Center "+بيع" is the raised primary action.
const CELLS: Cell[] = [
  { kind: "tab", route: "truck-dashboard", label: "الرئيسية", icon: "home" },
  { kind: "tab", route: "clients", label: "العملاء", icon: "users" },
  { kind: "sell" },
  { kind: "tab", route: "caisse", label: "الصندوق", icon: "dollar-sign" },
  { kind: "tab", route: "truck", label: "شاحنتي", icon: "box" },
  { kind: "tab", route: "settings", label: "الإعدادات", icon: "settings" },
];

/**
 * Custom premium bottom bar: five flat tabs around a raised, glowing gradient
 * "بيع" (new sale) action. الصندوق is a permanent tab; التحميل (receiving) is
 * reached from the dashboard.
 */
export function TabBar({ state, navigation }: any) {
  const c = useTheme().color;
  const t = useTheme();
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

  return (
    <View style={[styles.wrap, { backgroundColor: c.rail, borderTopColor: c.hairline, paddingBottom: Math.max(insets.bottom, 12) }]}>
      {CELLS.map((cell, i) => {
        if (cell.kind === "sell") {
          return (
            <View key="sell" style={styles.cell}>
              <Pressable onPress={onSell} style={({ pressed }) => [pressed && { transform: [{ scale: 0.94 }] }]} accessibilityRole="button" accessibilityLabel="بيع جديد">
                <LinearGradient colors={t.gradient.brand as any} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.sell}>
                  <Feather name="plus" size={26} color="#fff" />
                </LinearGradient>
                <Text style={[styles.sellLabel, { color: c.brand }]}>بيع</Text>
              </Pressable>
            </View>
          );
        }
        const focused = activeName === cell.route;
        return (
          <Pressable key={cell.route} style={styles.cell} onPress={() => onTab(cell.route)} hitSlop={6} accessibilityRole="button" accessibilityLabel={cell.label}>
            <Feather name={cell.icon} size={21} color={focused ? c.brand : c.textFaint} />
            <Text style={[styles.label, { color: focused ? c.brand : c.textFaint }]} numberOfLines={1}>{cell.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: "row-reverse", alignItems: "flex-start", justifyContent: "space-between",
    borderTopWidth: 1, paddingTop: 9, paddingHorizontal: 4,
    shadowColor: "#101C37", shadowOpacity: 0.08, shadowRadius: 20, shadowOffset: { width: 0, height: -8 }, elevation: 16,
  },
  cell: { flex: 1, alignItems: "center", gap: 3, paddingTop: 4 },
  label: { fontSize: 10, fontFamily: fonts.semibold },
  sell: {
    width: 50, height: 50, borderRadius: 17, alignItems: "center", justifyContent: "center", marginTop: -22,
    shadowColor: "#0E9AA7", shadowOpacity: 0.5, shadowRadius: 16, shadowOffset: { width: 0, height: 10 }, elevation: 14,
  },
  sellLabel: { fontSize: 10, fontFamily: fonts.bold, textAlign: "center", marginTop: 3 },
});
