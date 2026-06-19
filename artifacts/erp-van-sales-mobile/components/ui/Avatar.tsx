import { Feather } from "@expo/vector-icons";
import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { fonts } from "@/constants/tokens";
import { useTheme } from "@/hooks/useTheme";

interface Props {
  /** Name → first letter becomes the monogram; tint is deterministic per name. */
  name?: string | null;
  size?: number;
  /** Force an icon instead of a monogram (e.g. invoices, trucks). */
  icon?: React.ComponentProps<typeof Feather>["name"];
}

// Six on-brand tints. Deterministic by name so a client always looks the same —
// instant recognition at a glance, zero data cost (audit point #9).
const TINTS = [
  { bg: "#e6f2f1", fg: "#0b6463" },
  { bg: "#e7f6ee", fg: "#0c7d51" },
  { bg: "#fdf3e2", fg: "#a85f00" },
  { bg: "#eef0fb", fg: "#3b4aa0" },
  { bg: "#f4ecfb", fg: "#7a3ba0" },
  { bg: "#fdeaeb", fg: "#c1121f" },
];

function tintFor(name: string): { bg: string; fg: string } {
  let sum = 0;
  for (let i = 0; i < name.length; i++) sum += name.charCodeAt(i);
  return TINTS[sum % TINTS.length];
}

export function Avatar({ name, size = 40, icon }: Props) {
  const t = useTheme();
  const clean = (name ?? "").trim();
  const letter = clean ? Array.from(clean)[0] : "";
  const c = clean && !icon ? tintFor(clean) : { bg: t.color.brandTint, fg: t.color.brandText };

  return (
    <View
      style={[
        styles.box,
        { width: size, height: size, borderRadius: t.radius.sm, backgroundColor: c.bg },
      ]}
    >
      {icon || !letter ? (
        <Feather name={icon ?? "user"} size={size * 0.45} color={c.fg} />
      ) : (
        <Text style={{ color: c.fg, fontFamily: fonts.bold, fontSize: size * 0.4 }}>{letter}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { alignItems: "center", justifyContent: "center" },
});
