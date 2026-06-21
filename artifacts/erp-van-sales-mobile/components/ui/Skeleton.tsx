import React, { useEffect, useRef } from "react";
import { AccessibilityInfo, Animated, View, type DimensionValue } from "react-native";

import { useTheme } from "@/hooks/useTheme";

interface BlockProps {
  width?: DimensionValue;
  height?: number;
  radius?: "sm" | "md" | "lg";
  style?: object;
}

/** A single shimmering placeholder block. */
export function Skeleton({ width = "100%", height = 14, radius = "sm", style }: BlockProps) {
  const t = useTheme();
  const opacity = useRef(new Animated.Value(0.5)).current;

  useEffect(() => {
    let cancelled = false;
    AccessibilityInfo.isReduceMotionEnabled().then((reduce) => {
      if (cancelled || reduce) return;
      Animated.loop(
        Animated.sequence([
          Animated.timing(opacity, { toValue: 1, duration: 700, useNativeDriver: true }),
          Animated.timing(opacity, { toValue: 0.5, duration: 700, useNativeDriver: true }),
        ]),
      ).start();
    });
    return () => {
      cancelled = true;
      opacity.stopAnimation();
    };
  }, [opacity]);

  return (
    <Animated.View
      style={[{ width, height, borderRadius: t.radius[radius], backgroundColor: t.color.hairline, opacity }, style]}
    />
  );
}

/**
 * A card-shaped skeleton row matching the list-card layout — drop into a
 * FlatList header / placeholder while data loads, instead of a blank flash or a
 * blocking spinner (ui-ux-pro-max `progressive-loading`).
 */
export function SkeletonCard() {
  const t = useTheme();
  return (
    <View
      style={{
        flexDirection: "row-reverse",
        alignItems: "center",
        gap: t.spacing.md,
        backgroundColor: t.color.surface,
        borderRadius: t.radius.md,
        padding: t.spacing.lg,
        ...t.elevation.e1,
      }}
    >
      <Skeleton width={40} height={40} radius="sm" />
      <View style={{ flex: 1, alignItems: "flex-end", gap: 8 }}>
        <Skeleton width="55%" height={14} />
        <Skeleton width="35%" height={11} />
      </View>
      <Skeleton width={64} height={16} />
    </View>
  );
}

export function SkeletonList({ count = 6 }: { count?: number }) {
  const t = useTheme();
  return (
    <View style={{ paddingHorizontal: t.spacing.md, gap: t.spacing.sm, paddingTop: t.spacing.md }}>
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} />
      ))}
    </View>
  );
}
