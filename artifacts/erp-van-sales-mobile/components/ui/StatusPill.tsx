import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { fonts } from "@/constants/tokens";
import { useTheme } from "@/hooks/useTheme";

export type Status =
  | "paid" // نقد
  | "credit" // آجل
  | "pending" // قيد الانتظار
  | "approved" // مقبول
  | "rejected" // مرفوض
  | "out" // نفد
  | "neutral";

interface Props {
  status: Status;
  /** Override the default Arabic label (e.g. show a client-type label). */
  label?: string;
}

const DEFAULT_LABELS: Record<Status, string> = {
  paid: "نقد",
  credit: "آجل",
  pending: "قيد الانتظار",
  approved: "مقبول",
  rejected: "مرفوض",
  out: "نفد",
  neutral: "",
};

/**
 * One pill replaces every ad-hoc `color + "22"` badge and the hardcoded
 * caisse status pills. Semantic tone is derived from tokens, so "paid" is always
 * the same green and "pending" the same amber, app-wide.
 */
export function StatusPill({ status, label }: Props) {
  const t = useTheme();

  const tone: Record<Status, { bg: string; fg: string }> = {
    paid: { bg: t.color.successTint, fg: t.color.successText },
    approved: { bg: t.color.successTint, fg: t.color.successText },
    credit: { bg: t.color.warningTint, fg: t.color.warningText },
    pending: { bg: t.color.warningTint, fg: t.color.warningText },
    rejected: { bg: t.color.dangerTint, fg: t.color.dangerText },
    out: { bg: t.color.dangerTint, fg: t.color.dangerText },
    neutral: { bg: t.color.brandTint, fg: t.color.brandText },
  };
  const c = tone[status];

  return (
    <View style={[styles.pill, { backgroundColor: c.bg, borderRadius: t.radius.sm }]}>
      <Text style={[styles.text, { color: c.fg }]}>{label ?? DEFAULT_LABELS[status]}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: { paddingHorizontal: 8, paddingVertical: 3, alignSelf: "flex-start" },
  text: { fontFamily: fonts.semibold, fontSize: 12, lineHeight: 16 },
});
