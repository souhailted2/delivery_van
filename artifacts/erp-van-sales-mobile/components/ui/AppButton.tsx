import { Feather } from "@expo/vector-icons";
import React from "react";
import { ActivityIndicator, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";

import { fonts } from "@/constants/tokens";
import { useTheme } from "@/hooks/useTheme";

import { PressableScale } from "./PressableScale";

type Variant = "primary" | "success" | "danger" | "tonal" | "ghost";
type Size = "lg" | "md" | "sm";

interface Props {
  label: string;
  onPress?: () => void;
  variant?: Variant;
  size?: Size;
  icon?: React.ComponentProps<typeof Feather>["name"];
  loading?: boolean;
  disabled?: boolean;
  haptic?: boolean;
  fullWidth?: boolean;
  style?: StyleProp<ViewStyle>;
}

const SIZES: Record<Size, { height: number; padH: number; font: number; icon: number; radius: "sm" | "md" }> = {
  lg: { height: 52, padH: 20, font: 16, icon: 20, radius: "md" },
  md: { height: 44, padH: 16, font: 15, icon: 18, radius: "sm" },
  sm: { height: 36, padH: 12, font: 14, icon: 16, radius: "sm" },
};

/**
 * The single button primitive. Built-in press-scale, loading spinner, haptics,
 * and exactly one primary CTA styling per screen (ui-ux-pro-max `primary-action`).
 * Replaces ~10 bespoke TouchableOpacity button styles across the app.
 */
export function AppButton({
  label,
  onPress,
  variant = "primary",
  size = "md",
  icon,
  loading = false,
  disabled = false,
  haptic = true,
  fullWidth = false,
  style,
}: Props) {
  const t = useTheme();
  const s = SIZES[size];
  const isDisabled = disabled || loading;

  const fills: Record<Variant, { bg: string; fg: string; border?: string }> = {
    primary: { bg: t.color.brand, fg: t.color.onBrand },
    success: { bg: t.color.success, fg: t.color.onColor },
    danger: { bg: t.color.danger, fg: t.color.onColor },
    tonal: { bg: t.color.brandTint, fg: t.color.brandText },
    ghost: { bg: "transparent", fg: t.color.brandText },
  };
  const v = isDisabled ? { bg: t.color.hairline, fg: t.color.textFaint } : fills[variant];

  return (
    <PressableScale
      onPress={isDisabled ? undefined : onPress}
      disabled={isDisabled}
      haptic={haptic && !isDisabled}
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      accessibilityLabel={label}
      style={[
        styles.base,
        {
          height: s.height,
          paddingHorizontal: s.padH,
          borderRadius: t.radius[s.radius],
          backgroundColor: v.bg,
        },
        fullWidth && { alignSelf: "stretch" },
        style,
      ]}
    >
      <View style={styles.row}>
        {loading ? (
          <ActivityIndicator color={v.fg} size="small" />
        ) : (
          <>
            {icon ? <Feather name={icon} size={s.icon} color={v.fg} /> : null}
            <Text style={{ color: v.fg, fontFamily: fonts.bold, fontSize: s.font }}>{label}</Text>
          </>
        )}
      </View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  base: { alignItems: "center", justifyContent: "center" },
  // row-reverse matches the app's RTL convention: icon sits to the right of the label.
  row: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 8 },
});
