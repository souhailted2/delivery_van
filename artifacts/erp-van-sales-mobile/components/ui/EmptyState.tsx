import { Feather } from "@expo/vector-icons";
import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { typeScale } from "@/constants/tokens";
import { useTheme } from "@/hooks/useTheme";

import { AppButton } from "./AppButton";

interface Props {
  icon: React.ComponentProps<typeof Feather>["name"];
  title: string;
  subtitle?: string;
  actionLabel?: string;
  onAction?: () => void;
  actionIcon?: React.ComponentProps<typeof Feather>["name"];
}

/**
 * Empty states as onboarding moments, not dead ends: tinted icon disc, a
 * headline, optional one-line guidance, and an inline primary action where one
 * makes sense (ui-ux-pro-max `empty-states`).
 */
export function EmptyState({ icon, title, subtitle, actionLabel, onAction, actionIcon }: Props) {
  const t = useTheme();
  return (
    <View style={styles.wrap}>
      <View style={[styles.disc, { backgroundColor: t.color.brandTint }]}>
        <Feather name={icon} size={30} color={t.color.brandText} />
      </View>
      <Text style={[typeScale.headline, { color: t.color.text, textAlign: "center" }]}>{title}</Text>
      {subtitle ? (
        <Text style={[typeScale.footnote, { color: t.color.textMuted, textAlign: "center" }]}>
          {subtitle}
        </Text>
      ) : null}
      {actionLabel && onAction ? (
        <AppButton label={actionLabel} onPress={onAction} icon={actionIcon} size="md" style={{ marginTop: 4 }} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: "center", justifyContent: "center", paddingVertical: 64, gap: 10 },
  disc: { width: 72, height: 72, borderRadius: 36, alignItems: "center", justifyContent: "center", marginBottom: 4 },
});
