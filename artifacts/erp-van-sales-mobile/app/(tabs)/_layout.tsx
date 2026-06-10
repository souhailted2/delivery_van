import { Feather } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import { Redirect, Tabs } from "expo-router";
import React from "react";
import { Platform, StyleSheet, View } from "react-native";

import { useAuth } from "@/contexts/AuthContext";
import { useColors } from "@/hooks/useColors";

function ClassicTabLayout() {
  const colors = useColors();
  const { user } = useAuth();
  const isIOS = Platform.OS === "ios";
  const isWeb = Platform.OS === "web";
  const isAdmin = user?.role === "admin";

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.mutedForeground,
        headerShown: true,
        headerTitleStyle: { fontFamily: "Cairo_700Bold", fontSize: 17 },
        headerStyle: { backgroundColor: colors.card },
        headerTintColor: colors.foreground,
        tabBarStyle: {
          position: "absolute",
          backgroundColor: isIOS ? "transparent" : colors.card,
          borderTopWidth: 1,
          borderTopColor: colors.border,
          elevation: 0,
          ...(isWeb ? { height: 84 } : {}),
        },
        tabBarLabelStyle: {
          fontFamily: "Cairo_600SemiBold",
          fontSize: 11,
        },
        tabBarBackground: () =>
          isIOS ? (
            <BlurView intensity={100} tint="light" style={StyleSheet.absoluteFill} />
          ) : isWeb ? (
            <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.card }]} />
          ) : null,
      }}
    >
      {/* ── الرئيسية ── */}
      <Tabs.Screen
        name="index"
        options={{
          title: "لوحة التحكم",
          tabBarLabel: "الرئيسية",
          tabBarIcon: ({ color }) => <Feather name="home" size={22} color={color} />,
        }}
      />

      {/* ── المنتجات ── */}
      <Tabs.Screen
        name="products"
        options={{
          title: "المنتجات",
          tabBarLabel: "المنتجات",
          tabBarIcon: ({ color }) => <Feather name="package" size={22} color={color} />,
        }}
      />

      {/* ── الفئات ── */}
      <Tabs.Screen
        name="categories"
        options={{
          title: "الفئات",
          tabBarLabel: "الفئات",
          tabBarIcon: ({ color }) => <Feather name="tag" size={22} color={color} />,
        }}
      />

      {/* ── الموردون ── */}
      <Tabs.Screen
        name="suppliers"
        options={{
          title: "الموردون",
          tabBarLabel: "الموردون",
          tabBarIcon: ({ color }) => <Feather name="briefcase" size={22} color={color} />,
        }}
      />

      {/* ── أوامر الشراء ── */}
      <Tabs.Screen
        name="purchases"
        options={{
          title: "أوامر الشراء",
          tabBarLabel: "الشراء",
          tabBarIcon: ({ color }) => <Feather name="shopping-cart" size={22} color={color} />,
        }}
      />

      {/* ── العملاء ── */}
      <Tabs.Screen
        name="clients"
        options={{
          title: "العملاء",
          tabBarLabel: "العملاء",
          tabBarIcon: ({ color }) => <Feather name="users" size={22} color={color} />,
        }}
      />

      {/* ── الفواتير ── */}
      <Tabs.Screen
        name="invoices"
        options={{
          title: "الفواتير",
          tabBarLabel: "الفواتير",
          tabBarIcon: ({ color }) => <Feather name="file-text" size={22} color={color} />,
        }}
      />

      {/* ── المرتجعات ── */}
      <Tabs.Screen
        name="returns"
        options={{
          title: "المرتجعات",
          tabBarLabel: "المرتجعات",
          tabBarIcon: ({ color }) => <Feather name="rotate-ccw" size={22} color={color} />,
        }}
      />

      {/* ── المخزن المركزي ── */}
      <Tabs.Screen
        name="warehouse"
        options={{
          title: "المخزن",
          tabBarLabel: "المخزن",
          tabBarIcon: ({ color }) => <Feather name="archive" size={22} color={color} />,
        }}
      />

      {/* ── الشاحنات (إدارة) ── */}
      <Tabs.Screen
        name="trucks"
        options={{
          title: "الشاحنات",
          tabBarLabel: "الشاحنات",
          tabBarIcon: ({ color }) => <Feather name="truck" size={22} color={color} />,
        }}
      />

      {/* ── شاحنتي (مخزون الشاحنة) ── */}
      <Tabs.Screen
        name="truck"
        options={{
          title: "شاحنتي",
          tabBarLabel: "شاحنتي",
          tabBarIcon: ({ color }) => <Feather name="box" size={22} color={color} />,
        }}
      />

      {/* ── الصندوق ── */}
      <Tabs.Screen
        name="caisse"
        options={{
          title: "الصندوق",
          tabBarLabel: "الصندوق",
          tabBarIcon: ({ color }) => <Feather name="dollar-sign" size={22} color={color} />,
        }}
      />

      {/* ── التقارير ── */}
      <Tabs.Screen
        name="rapports"
        options={{
          title: "التقارير",
          tabBarLabel: "التقارير",
          tabBarIcon: ({ color }) => <Feather name="bar-chart-2" size={22} color={color} />,
        }}
      />

      {/* ── المستخدمون (admin) ── */}
      <Tabs.Screen
        name="users"
        options={{
          title: "المستخدمون",
          tabBarLabel: "المستخدمون",
          tabBarIcon: ({ color }) => <Feather name="user-check" size={22} color={color} />,
          href: isAdmin ? undefined : null,
        }}
      />

      {/* ── الفروع (admin) ── */}
      <Tabs.Screen
        name="branches"
        options={{
          title: "الفروع",
          tabBarLabel: "الفروع",
          tabBarIcon: ({ color }) => <Feather name="map-pin" size={22} color={color} />,
          href: isAdmin ? undefined : null,
        }}
      />

      {/* ── الإعدادات ── */}
      <Tabs.Screen
        name="settings"
        options={{
          title: "الإعدادات",
          tabBarLabel: "الإعدادات",
          tabBarIcon: ({ color }) => <Feather name="settings" size={22} color={color} />,
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
