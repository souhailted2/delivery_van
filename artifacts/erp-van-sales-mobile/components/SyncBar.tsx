import { Feather } from "@expo/vector-icons";
import React from "react";
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useSync } from "@/contexts/SyncContext";
import { useColors } from "@/hooks/useColors";

function timeAgo(iso: string | null): string {
  if (!iso) return "لم تتم بعد";
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "الآن";
  if (m < 60) return `منذ ${m} دقيقة`;
  const h = Math.floor(m / 60);
  return `منذ ${h} ساعة`;
}

export function SyncBar() {
  const { online, syncing, lastSync, pending, triggerSync } = useSync();
  const colors = useColors();

  return (
    <View style={[styles.bar, { backgroundColor: online ? colors.card : "#fef2f2", borderBottomColor: colors.border }]}>
      <View style={styles.row}>
        {syncing ? (
          <ActivityIndicator size={12} color={colors.primary} style={{ marginLeft: 4 }} />
        ) : (
          <View style={[styles.dot, { backgroundColor: online ? colors.success : colors.destructive }]} />
        )}
        <Text style={[styles.label, { color: online ? colors.mutedForeground : colors.destructive }]}>
          {syncing ? "جاري المزامنة..." : online ? `آخر مزامنة: ${timeAgo(lastSync)}` : "غير متصل"}
        </Text>
        {pending > 0 && (
          <View style={[styles.badge, { backgroundColor: colors.warning }]}>
            <Text style={styles.badgeText}>{pending}</Text>
          </View>
        )}
      </View>
      <TouchableOpacity onPress={triggerSync} disabled={syncing} style={styles.btn}>
        <Feather name="refresh-cw" size={14} color={colors.primary} />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderBottomWidth: 1,
  },
  row: { flexDirection: "row", alignItems: "center", gap: 6 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  label: { fontSize: 12, fontFamily: "Cairo_400Regular" },
  badge: { paddingHorizontal: 6, paddingVertical: 1, borderRadius: 10 },
  badgeText: { color: "#fff", fontSize: 10, fontFamily: "Cairo_700Bold" },
  btn: { padding: 6 },
});
