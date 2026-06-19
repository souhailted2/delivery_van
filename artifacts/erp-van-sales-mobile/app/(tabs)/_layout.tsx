import { Feather } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import { Redirect, Tabs } from "expo-router";
import React from "react";
import { Platform, StyleSheet, View } from "react-native";

import { useAuth } from "@/contexts/AuthContext";
import { fonts } from "@/constants/tokens";
import { useTheme } from "@/hooks/useTheme";

// Active tab gets a teal "command-center" pill behind the icon (approved
// direction) — a shape change, not just a color change, for sunlight legibility.
function tabIcon(name: React.ComponentProps<typeof Feather>["name"], brandTint: string) {
  return ({ color, focused }: { color: string; focused: boolean }) => (
    <View
      style={[
        styles.iconPill,
        focused && { backgroundColor: brandTint },
      ]}
    >
      <Feather name={name} size={20} color={color} />
    </View>
  );
}

function ClassicTabLayout() {
  const t = useTheme();
  const c = t.color;
  const { user } = useAuth();
  const isIOS = Platform.OS === "ios";
  const isWeb = Platform.OS === "web";
  const isAdmin = user?.role === "admin";
  const isTruck = user?.role === "truck";

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: c.brandBright,
        tabBarInactiveTintColor: c.textFaint,
        headerShown: true,
        headerTitleStyle: { fontFamily: fonts.bold, fontSize: 17, color: c.text },
        headerStyle: { backgroundColor: c.rail },
        headerTintColor: c.text,
        headerShadowVisible: false,
        tabBarStyle: {
          position: "absolute",
          backgroundColor: isIOS ? "transparent" : c.rail,
          borderTopWidth: 1,
          borderTopColor: c.hairline,
          elevation: 0,
          ...(isWeb ? { height: 84 } : {}),
        },
        tabBarLabelStyle: {
          fontFamily: fonts.semibold,
          fontSize: 11,
        },
        tabBarBackground: () =>
          isIOS ? (
            <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFill} />
          ) : isWeb ? (
            <View style={[StyleSheet.absoluteFill, { backgroundColor: c.rail }]} />
          ) : null,
      }}
    >
      {/* ── الرئيسية (لوحة الشاحنة) ── */}
      <Tabs.Screen
        name="truck-dashboard"
        options={{
          title: "ALLAL Delivery",
          tabBarLabel: "الرئيسية",
          tabBarIcon: tabIcon("home", c.brandTint),
          href: isTruck ? undefined : null,
        }}
      />

      {/* ── الرئيسية (لوحة الأدمن/البائع) ── */}
      <Tabs.Screen
        name="index"
        options={{
          title: "لوحة التحكم",
          tabBarLabel: "الرئيسية",
          tabBarIcon: tabIcon("home", c.brandTint),
          href: isTruck ? null : undefined,
        }}
      />

      {/* ── المنتجات ── */}
      <Tabs.Screen
        name="products"
        options={{
          title: "المنتجات",
          tabBarLabel: "المنتجات",
          tabBarIcon: tabIcon("package", c.brandTint),
          href: isTruck ? null : undefined,
        }}
      />

      {/* ── الفئات ── */}
      <Tabs.Screen
        name="categories"
        options={{
          title: "الفئات",
          tabBarLabel: "الفئات",
          tabBarIcon: tabIcon("tag", c.brandTint),
          href: isTruck ? null : undefined,
        }}
      />

      {/* ── الموردون ── */}
      <Tabs.Screen
        name="suppliers"
        options={{
          title: "الموردون",
          tabBarLabel: "الموردون",
          tabBarIcon: tabIcon("briefcase", c.brandTint),
          href: isTruck ? null : undefined,
        }}
      />

      {/* ── أوامر الشراء ── */}
      <Tabs.Screen
        name="purchases"
        options={{
          title: "أوامر الشراء",
          tabBarLabel: "الشراء",
          tabBarIcon: tabIcon("shopping-cart", c.brandTint),
          href: isTruck ? null : undefined,
        }}
      />

      {/* ── العملاء ── */}
      <Tabs.Screen
        name="clients"
        options={{
          title: "العملاء",
          tabBarLabel: "العملاء",
          tabBarIcon: tabIcon("users", c.brandTint),
          href: undefined,
        }}
      />

      {/* ── الفواتير ── */}
      <Tabs.Screen
        name="invoices"
        options={{
          title: "الفواتير",
          tabBarLabel: "الفواتير",
          tabBarIcon: tabIcon("file-text", c.brandTint),
          href: isTruck ? null : undefined,
        }}
      />

      {/* ── المرتجعات ── */}
      <Tabs.Screen
        name="returns"
        options={{
          title: "المرتجعات",
          tabBarLabel: "المرتجعات",
          tabBarIcon: tabIcon("rotate-ccw", c.brandTint),
          href: isTruck ? null : undefined,
        }}
      />

      {/* ── المخزن المركزي ── */}
      <Tabs.Screen
        name="warehouse"
        options={{
          title: "المخزن",
          tabBarLabel: "المخزن",
          tabBarIcon: tabIcon("archive", c.brandTint),
          href: isTruck ? null : undefined,
        }}
      />

      {/* ── الشاحنات (إدارة) ── */}
      <Tabs.Screen
        name="trucks"
        options={{
          title: "الشاحنات",
          tabBarLabel: "الشاحنات",
          tabBarIcon: tabIcon("truck", c.brandTint),
          href: isTruck ? null : undefined,
        }}
      />

      {/* ── شاحنتي (مخزون الشاحنة — للسائق فقط) ── */}
      <Tabs.Screen
        name="truck"
        options={{
          title: "شاحنتي",
          tabBarLabel: "شاحنتي",
          tabBarIcon: tabIcon("box", c.brandTint),
          href: isTruck ? undefined : null,
        }}
      />

      {/* ── استلام البضاعة (dispatch inbox) ── */}
      <Tabs.Screen
        name="dispatch"
        options={{
          title: "استلام البضاعة",
          tabBarLabel: "التحميل",
          tabBarIcon: tabIcon("download", c.brandTint),
          href: isTruck ? undefined : null,
        }}
      />

      {/* ── الصندوق ── */}
      <Tabs.Screen
        name="caisse"
        options={{
          title: "الصندوق",
          tabBarLabel: "الصندوق",
          tabBarIcon: tabIcon("dollar-sign", c.brandTint),
          href: undefined,
        }}
      />

      {/* ── التقارير ── */}
      <Tabs.Screen
        name="rapports"
        options={{
          title: "التقارير",
          tabBarLabel: "التقارير",
          tabBarIcon: tabIcon("bar-chart-2", c.brandTint),
          href: isTruck ? null : undefined,
        }}
      />

      {/* ── المستخدمون (admin) ── */}
      <Tabs.Screen
        name="users"
        options={{
          title: "المستخدمون",
          tabBarLabel: "المستخدمون",
          tabBarIcon: tabIcon("user-check", c.brandTint),
          href: isAdmin ? undefined : null,
        }}
      />

      {/* ── الفروع (admin) ── */}
      <Tabs.Screen
        name="branches"
        options={{
          title: "الفروع",
          tabBarLabel: "الفروع",
          tabBarIcon: tabIcon("map-pin", c.brandTint),
          href: isAdmin ? undefined : null,
        }}
      />

      {/* ── الإعدادات ── */}
      <Tabs.Screen
        name="settings"
        options={{
          title: "الإعدادات",
          tabBarLabel: "الإعدادات",
          tabBarIcon: tabIcon("settings", c.brandTint),
        }}
      />
    </Tabs>
  );
}

export default function TabLayout() {
  const { user } = useAuth();
  if (!user) return <Redirect href="/login" />;
  return <ClassicTabLayout />;
}

const styles = StyleSheet.create({
  iconPill: { width: 46, height: 30, borderRadius: 999, alignItems: "center", justifyContent: "center" },
});
