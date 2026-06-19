import React from "react";
import { View, type StyleProp, type ViewProps, type ViewStyle } from "react-native";

import { useTheme } from "@/hooks/useTheme";

interface Props extends ViewProps {
  /** Heavier translucency — for heroes and sheets. */
  strong?: boolean;
  /** Teal-tinted edge + teal glow shadow (accented/important cards). */
  tealEdge?: boolean;
  /** Teal glow shadow. */
  glow?: boolean;
  radius?: number;
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
}

/**
 * Translucent glass surface for the "Glass & Glow" language. Reads as frosted
 * depth when placed over <AmbientBackground/>. Replaces the flat solid cards.
 */
export function GlassCard({ strong, tealEdge, glow, radius = 20, style, children, ...rest }: Props) {
  const c = useTheme().color;
  const elev = useTheme().elevation;
  return (
    <View
      style={[
        {
          backgroundColor: strong ? c.glassStrong : c.glass,
          borderWidth: 1,
          borderColor: tealEdge ? c.glassBorderTeal : c.glassBorder,
          borderRadius: radius,
          ...(glow || tealEdge ? elev.glow : elev.e2),
        },
        style,
      ]}
      {...rest}
    >
      {children}
    </View>
  );
}
