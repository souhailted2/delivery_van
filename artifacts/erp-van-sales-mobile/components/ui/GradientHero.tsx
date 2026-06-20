import { LinearGradient } from "expo-linear-gradient";
import React from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";

import { useTheme } from "@/hooks/useTheme";

interface Props {
  /** Gradient stops. Defaults to the brand teal gradient. */
  colors?: readonly string[];
  radius?: number;
  /** Glow shadow color (defaults to brand teal). */
  glow?: string;
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
}

/**
 * The signature gradient panel — the cash hero and other focal surfaces. Carries
 * a soft brand-colored glow and two decorative light/dark orbs for depth.
 */
export function GradientHero({ colors, radius = 28, glow, style, children }: Props) {
  const t = useTheme();
  const stops = (colors ?? t.gradient.brand) as any;
  return (
    <LinearGradient
      colors={stops}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[
        {
          borderRadius: radius,
          overflow: "hidden",
          shadowColor: glow ?? t.color.brand,
          shadowOpacity: 0.4,
          shadowRadius: 24,
          shadowOffset: { width: 0, height: 16 },
          elevation: 10,
        },
        style,
      ]}
    >
      <View pointerEvents="none" style={[styles.orb, styles.orbA]} />
      <View pointerEvents="none" style={[styles.orb, styles.orbB]} />
      {children}
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  orb: { position: "absolute", borderRadius: 999 },
  orbA: { width: 240, height: 240, backgroundColor: "rgba(255,255,255,0.16)", top: -130, left: -60 },
  orbB: { width: 180, height: 180, backgroundColor: "rgba(0,0,0,0.10)", bottom: -90, right: -40 },
});
