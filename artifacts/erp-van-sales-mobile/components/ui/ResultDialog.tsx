import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Animated, Modal, StyleSheet, Text, View } from "react-native";

import { motion, typeScale } from "@/constants/tokens";
import { useTheme } from "@/hooks/useTheme";

import { AppButton } from "./AppButton";

export type ResultVariant = "success" | "error" | "warning" | "info";

export interface DialogAction {
  label: string;
  onPress?: () => void;
  variant?: "primary" | "success" | "danger" | "tonal" | "ghost";
}

interface Props {
  visible: boolean;
  variant?: ResultVariant;
  title: string;
  message?: string;
  /** Defaults to a single "موافق" button that just closes. */
  actions?: DialogAction[];
  onRequestClose: () => void;
}

/**
 * Branded replacement for native `Alert.alert` — the single highest-leverage
 * premium-feel fix (a stock OS dialog instantly breaks the "designed product"
 * illusion).
 *
 * Motion (Emil/motion-ui): scale-in from 0.95 (never from 0) + fade, backdrop
 * fades in; exit is faster than enter; reduced-motion collapses to a quick fade.
 * Internal `mounted` state keeps the Modal alive long enough to play the exit.
 */
export function ResultDialog({
  visible,
  variant = "info",
  title,
  message,
  actions,
  onRequestClose,
}: Props) {
  const t = useTheme();
  const [mounted, setMounted] = useState(visible);
  const fade = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.95)).current;
  const reduceRef = useRef(false);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then((v) => (reduceRef.current = v));
  }, []);

  useEffect(() => {
    if (visible) {
      setMounted(true);
      const fired = {
        success: Haptics.NotificationFeedbackType.Success,
        warning: Haptics.NotificationFeedbackType.Warning,
        error: Haptics.NotificationFeedbackType.Error,
        info: Haptics.NotificationFeedbackType.Success,
      }[variant];
      Haptics.notificationAsync(fired).catch(() => {});

      scale.setValue(reduceRef.current ? 1 : 0.95);
      Animated.parallel([
        Animated.timing(fade, {
          toValue: 1,
          duration: motion.duration.fast,
          easing: motion.easing.out,
          useNativeDriver: true,
        }),
        Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 18, bounciness: 4 }),
      ]).start();
    } else if (mounted) {
      Animated.parallel([
        Animated.timing(fade, {
          toValue: 0,
          duration: motion.duration.instant, // exit faster than enter
          easing: motion.easing.standard,
          useNativeDriver: true,
        }),
        Animated.timing(scale, {
          toValue: 0.97,
          duration: motion.duration.instant,
          useNativeDriver: true,
        }),
      ]).start(({ finished }) => finished && setMounted(false));
    }
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!mounted) return null;

  const accent = {
    success: { c: t.color.success, tint: t.color.successTint, icon: "check-circle" as const },
    error: { c: t.color.danger, tint: t.color.dangerTint, icon: "alert-circle" as const },
    warning: { c: t.color.warning, tint: t.color.warningTint, icon: "alert-triangle" as const },
    info: { c: t.color.brand, tint: t.color.brandTint, icon: "info" as const },
  }[variant];

  const resolved: DialogAction[] = actions?.length ? actions : [{ label: "موافق" }];

  return (
    <Modal visible transparent animationType="none" onRequestClose={onRequestClose} statusBarTranslucent>
      <Animated.View style={[styles.overlay, { backgroundColor: t.color.scrim, opacity: fade }]}>
        <Animated.View
          accessibilityViewIsModal
          accessibilityLabel={title}
          style={[
            styles.card,
            { backgroundColor: t.color.surface, borderRadius: t.radius.lg, transform: [{ scale }], ...t.elevation.e2 },
          ]}
        >
          <View style={[styles.iconDisc, { backgroundColor: accent.tint }]}>
            <Feather name={accent.icon} size={28} color={accent.c} />
          </View>

          <Text style={[typeScale.title, { color: t.color.text, textAlign: "center" }]}>{title}</Text>
          {message ? (
            <Text style={[typeScale.body, { color: t.color.textMuted, textAlign: "center" }]}>{message}</Text>
          ) : null}

          <View style={styles.actions}>
            {resolved.map((a, i) => (
              <AppButton
                key={i}
                label={a.label}
                variant={a.variant ?? (i === 0 ? "primary" : "tonal")}
                size="lg"
                fullWidth
                onPress={() => {
                  a.onPress?.();
                  onRequestClose();
                }}
              />
            ))}
          </View>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, alignItems: "center", justifyContent: "center", padding: 28 },
  card: { width: "100%", maxWidth: 360, padding: 24, alignItems: "center", gap: 10 },
  iconDisc: { width: 64, height: 64, borderRadius: 32, alignItems: "center", justifyContent: "center", marginBottom: 4 },
  actions: { alignSelf: "stretch", gap: 8, marginTop: 8 },
});
