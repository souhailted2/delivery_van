import { Feather } from "@expo/vector-icons";
import React, { useEffect, useRef } from "react";
import { AccessibilityInfo, Animated, StyleSheet, Text, View } from "react-native";

import { fonts } from "@/constants/tokens";
import { useSync } from "@/contexts/SyncContext";
import { useTheme } from "@/hooks/useTheme";

import { PressableScale } from "./ui/PressableScale";

function timeAgo(iso: string | null): string {
  if (!iso) return "لم تتم بعد";
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "الآن";
  if (m < 60) return `منذ ${m} دقيقة`;
  const h = Math.floor(m / 60);
  return `منذ ${h} ساعة`;
}

/**
 * Offline-first trust signal — redesigned per the audit. For a driver, "did my
 * sale save?" is the core anxiety, so this is now a confident 44px banner with
 * semantic tinting (live/offline/syncing), a pulsing dot while syncing, and a
 * clear pending count — not a 12px whisper. Logic (useSync) is unchanged.
 */
export function SyncBar() {
  const { online, syncing, lastSync, pending, triggerSync } = useSync();
  const t = useTheme();
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    let loop: Animated.CompositeAnimation | null = null;
    if (syncing) {
      AccessibilityInfo.isReduceMotionEnabled().then((reduce) => {
        if (reduce) return;
        loop = Animated.loop(
          Animated.sequence([
            Animated.timing(pulse, { toValue: 0.3, duration: 600, useNativeDriver: true }),
            Animated.timing(pulse, { toValue: 1, duration: 600, useNativeDriver: true }),
          ]),
        );
        loop.start();
      });
    } else {
      pulse.setValue(1);
    }
    return () => loop?.stop();
  }, [syncing, pulse]);

  // Tone: offline → danger tint; pending while online → warning tint; else live.
  const tone = !online
    ? { bg: t.color.dangerTint, dot: t.color.danger, fg: t.color.dangerText }
    : pending > 0
      ? { bg: t.color.warningTint, dot: t.color.warning, fg: t.color.warningText }
      : { bg: t.color.surface, dot: t.color.success, fg: t.color.textMuted };

  const label = syncing
    ? "جاري المزامنة..."
    : !online
      ? "غير متصل — سيُرفع تلقائياً عند عودة الشبكة"
      : `آخر مزامنة: ${timeAgo(lastSync)}`;

  return (
    <View style={[styles.bar, { backgroundColor: tone.bg, borderBottomColor: t.color.hairline }]}>
      <View style={styles.row}>
        <Animated.View style={[styles.dot, { backgroundColor: tone.dot, opacity: pulse }]} />
        <Text style={[styles.label, { color: tone.fg }]} numberOfLines={1}>
          {label}
        </Text>
        {pending > 0 && (
          <View style={[styles.badge, { backgroundColor: t.color.warning }]}>
            <Text style={styles.badgeText}>{pending} بانتظار الرفع</Text>
          </View>
        )}
      </View>
      <PressableScale
        onPress={triggerSync}
        disabled={syncing}
        haptic
        hitSlop={10}
        accessibilityRole="button"
        accessibilityLabel="مزامنة الآن"
        style={[styles.btn, { backgroundColor: t.color.brandTint }]}
      >
        <Feather name="refresh-cw" size={15} color={t.color.brandText} />
      </PressableScale>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    minHeight: 44,
    paddingVertical: 8,
    borderBottomWidth: 1,
  },
  row: { flex: 1, flexDirection: "row-reverse", alignItems: "center", gap: 8 },
  dot: { width: 9, height: 9, borderRadius: 5 },
  label: { fontSize: 13, fontFamily: fonts.regular, flexShrink: 1 },
  badge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999 },
  badgeText: { color: "#fff", fontSize: 11, fontFamily: fonts.bold },
  btn: { width: 32, height: 32, borderRadius: 999, alignItems: "center", justifyContent: "center" },
});
