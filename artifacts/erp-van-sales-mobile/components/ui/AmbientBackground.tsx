import React from "react";
import { StyleSheet } from "react-native";
import Svg, { Defs, RadialGradient, Rect, Stop } from "react-native-svg";

import { useTheme } from "@/hooks/useTheme";

/**
 * The signature "Glass & Glow" backdrop: a near-black base with a teal aurora
 * glow (top) and a cool deep-blue glow (bottom). Translucent glass cards sit
 * over this, so they read as frosted depth rather than flat panels.
 *
 * Place once per screen as the first child of a full-bleed container; keep the
 * scroll/content layers transparent above it.
 */
export function AmbientBackground() {
  const c = useTheme().color;
  return (
    <Svg style={StyleSheet.absoluteFill} pointerEvents="none">
      <Defs>
        <RadialGradient id="ambTeal" cx="82%" cy="4%" r="62%">
          <Stop offset="0" stopColor={c.glowTeal} stopOpacity={0.32} />
          <Stop offset="1" stopColor={c.glassBase} stopOpacity={0} />
        </RadialGradient>
        <RadialGradient id="ambCool" cx="4%" cy="98%" r="78%">
          <Stop offset="0" stopColor="#13384f" stopOpacity={0.42} />
          <Stop offset="1" stopColor={c.glassBase} stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Rect x="0" y="0" width="100%" height="100%" fill={c.glassBase} />
      <Rect x="0" y="0" width="100%" height="100%" fill="url(#ambTeal)" />
      <Rect x="0" y="0" width="100%" height="100%" fill="url(#ambCool)" />
    </Svg>
  );
}
