import React from "react";
import { View, type StyleProp, type ViewProps, type ViewStyle } from "react-native";

import { useTheme } from "@/hooks/useTheme";

interface Props extends ViewProps {
  /** Padding inside the card. Default 14. */
  pad?: number;
  radius?: number;
  /** Stronger shadow (heroes / sheets). */
  raised?: boolean;
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
}

/**
 * The premium-light surface primitive: white card, hairline border, soft shadow,
 * generous radius. The building block of the new ALLAL interface.
 */
export function Card({ pad = 14, radius = 18, raised = false, style, children, ...rest }: Props) {
  const t = useTheme();
  return (
    <View
      style={[
        {
          backgroundColor: t.color.surface,
          borderRadius: radius,
          borderWidth: 1,
          borderColor: t.color.hairline,
          padding: pad,
          ...(raised ? t.elevation.e2 : t.elevation.e1),
        },
        style,
      ]}
      {...rest}
    >
      {children}
    </View>
  );
}
