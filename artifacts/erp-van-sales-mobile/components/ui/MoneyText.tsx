import React from "react";
import { Text, type StyleProp, type TextStyle } from "react-native";

import { typeScale, type TypeRole } from "@/constants/tokens";
import { formatMoney } from "@/lib/money";
import { useTheme } from "@/hooks/useTheme";

type Tone = "neutral" | "positive" | "negative" | "brand" | "muted";

interface Props {
  amount: number | null | undefined;
  /** Semantic color. negative=debt (red), positive=credit/received (green). */
  tone?: Tone;
  /** Type role from the scale. Defaults to bodyStrong. */
  size?: TypeRole;
  /** Show an explicit +/- sign (used for cash movements). */
  signed?: boolean;
  /** Render the absolute value (color carries the owed/credit meaning). */
  absolute?: boolean;
  style?: StyleProp<TextStyle>;
}

/**
 * Every on-screen amount goes through this — the ALLAL money standard
 * (2 decimals, space grouping, "DZD") plus tabular figures and semantic tone.
 */
export function MoneyText({ amount, tone = "neutral", size = "bodyStrong", signed = false, absolute = false, style }: Props) {
  const t = useTheme();
  const n = Number(amount ?? 0);
  const shown = absolute ? Math.abs(n) : n;

  const colorByTone: Record<Tone, string> = {
    neutral: t.color.text,
    positive: t.color.successText,
    negative: t.color.dangerText,
    brand: t.color.brandText,
    muted: t.color.textMuted,
  };

  // formatMoney already prefixes "-" for negatives; for explicit +/- on positive
  // movements we add a leading "+".
  const base = formatMoney(shown);
  const body = signed && shown > 0 ? `+${base}` : base;

  return (
    <Text style={[typeScale[size], { color: colorByTone[tone], fontVariant: ["tabular-nums"] }, style]}>{body}</Text>
  );
}
