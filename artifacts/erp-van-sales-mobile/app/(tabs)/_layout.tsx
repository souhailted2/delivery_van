import { Redirect, Tabs } from "expo-router";
import React from "react";

import { TabBar } from "@/components/ui";
import { useAuth } from "@/contexts/AuthContext";

// ALLAL Mobile is a TRUCK-DRIVER app only. A custom premium bottom bar renders
// four tabs around a raised "بيع" action; الصندوق + التحميل are reached from the
// dashboard. Each screen draws its own header, so the navigator header is off.
function TruckTabLayout() {
  return (
    <Tabs
      tabBar={(props) => <TabBar {...props} />}
      screenOptions={{ headerShown: false }}
    >
      <Tabs.Screen name="index" options={{ href: null }} />
      <Tabs.Screen name="truck-dashboard" />
      <Tabs.Screen name="clients" />
      <Tabs.Screen name="truck" />
      <Tabs.Screen name="dispatch" options={{ href: null }} />
      <Tabs.Screen name="caisse" options={{ href: null }} />
      <Tabs.Screen name="settings" options={{ href: null }} />
      {/* settings is reached from the dashboard header, not the bottom bar */}
    </Tabs>
  );
}

export default function TabLayout() {
  const { user } = useAuth();
  if (!user) return <Redirect href="/login" />;
  return <TruckTabLayout />;
}
