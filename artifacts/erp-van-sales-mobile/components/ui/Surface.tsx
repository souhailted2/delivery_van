import React from "react";
import { View, type StyleProp, type ViewProps, type ViewStyle } from "react-native";

import { useTheme } from "@/hooks/useTheme";

interface Props extends ViewProps {
  /** e0 = flush (inside a card), e1 = raised card (default), e2 = floating. */
  level?: "e0" | "e1" | "e2";
  /** Radius tier. Cards use md; sheets/hero use lg; chips/inputs use sm. */
  radius?: "sm" | "md" | "lg";
  /** Padding token applied to all sides. Omit to pad manually. */
  padding?: keyof ReturnType<typeof useTheme>["spacing"];
  /** Draw a hairline border — only needed when a card sits on a white surface. */
  bordered?: boolean;
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
}

/**
 * The one card primitive. Separates by elevation + tint, not by a 1px border on
 * everything (which is what made the old UI read as an "ERP form grid").
 */
export function Surface({
  level = "e1",
  radius = "md",
  padding,
  bordered = false,
  style,
  children,
  ...rest
}: Props) {
  const t = useTheme();
  return (
    <View
      style={[
        {
          backgroundColor: t.color.surface,
          borderRadius: t.radius[radius],
          ...t.elevation[level],
        },
        padding != null && { padding: t.spacing[padding] },
        bordered && { borderWidth: 1, borderColor: t.color.hairline },
        style,
      ]}
      {...rest}
    >
      {children}
    </View>
  );
}
