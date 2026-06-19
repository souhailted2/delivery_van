/**
 * ALLAL Command Center — mobile design tokens.
 *
 * This is the mobile expression of the desktop flagship `.dark` theme
 * (source of truth: artifacts/erp-van-sales/src/index.css). Same brand teal,
 * same alert red, same charcoal command-center surfaces, same Cairo type.
 * One ALLAL identity, adapted to the phone — NOT a separate design language.
 *
 * Dark is the live, default theme (the desktop ships `<html class="dark">`).
 */
import { Easing, type TextStyle } from "react-native";

// ── Brand primitives (exact values from the desktop command-center theme) ─────
export const palette = {
  brand: "#0E9AA7", // ALLAL teal — hsl(185 85% 35%)
  brandBright: "#16C2D2", // accent / glow / focus ring — hsl(185 85% 45%)
  brandDeep: "#0B6E77",
  red: "#D62828", // ALLAL alert red
  // Charcoal command-center surfaces (not OLED black).
  bg: "#0F1117", // app background — hsl(227 24% 6%)
  surface: "#14171F", // card / panel — hsl(224 20% 10%)
  surfaceElevated: "#1B1F29", // secondary surface
  rail: "#0A0C12", // header / bottom nav (deepest)
  hairline: "#232838",
  text: "#F8FAFC", // hsl(210 40% 98%)
  textMuted: "#8E9BAE", // hsl(215 16% 62%)
  textFaint: "#5A6473",
  success: "#2BB673",
  warning: "#F5A524",
  white: "#ffffff",
  black: "#000000",
} as const;

// ── Spacing — strict 4-point base. ───────────────────────────────────────────
export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24, xxxl: 32 } as const;

// ── Radius — aligned to the desktop 12px base. ───────────────────────────────
export const radius = { sm: 10, md: 14, lg: 20, pill: 999 } as const;

// ── Elevation — on charcoal, the hairline carries separation; shadow is faint.
// `glow` is the signature teal command-center accent for hero/CTA only.
export const elevation = {
  e0: {},
  e1: { shadowColor: palette.black, shadowOpacity: 0.4, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 3 },
  e2: { shadowColor: palette.black, shadowOpacity: 0.5, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 8 },
  glow: { shadowColor: palette.brand, shadowOpacity: 0.55, shadowRadius: 22, shadowOffset: { width: 0, height: 8 }, elevation: 8 },
} as const;

// ── Typography — Cairo (the 3 loaded weights). Figures use tabular-nums. ──────
export const fonts = {
  regular: "Cairo_400Regular",
  semibold: "Cairo_600SemiBold",
  bold: "Cairo_700Bold",
} as const;

export const typeScale = {
  display: { fontFamily: fonts.bold, fontSize: 28, lineHeight: 38 },
  title: { fontFamily: fonts.bold, fontSize: 20, lineHeight: 30 },
  headline: { fontFamily: fonts.bold, fontSize: 17, lineHeight: 26 },
  body: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 24 },
  bodyStrong: { fontFamily: fonts.semibold, fontSize: 15, lineHeight: 24 },
  callout: { fontFamily: fonts.semibold, fontSize: 14, lineHeight: 22 },
  footnote: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 20 },
  caption: { fontFamily: fonts.semibold, fontSize: 12, lineHeight: 18 },
} satisfies Record<string, TextStyle>;

export type TypeRole = keyof typeof typeScale;

// ── Motion — sub-300ms, strong ease-out. Every cue communicates state. ───────
export const motion = {
  duration: { instant: 120, fast: 180, normal: 220, slow: 300 },
  easing: {
    out: Easing.bezier(0.22, 1, 0.36, 1),
    inOut: Easing.bezier(0.77, 0, 0.175, 1),
    standard: Easing.bezier(0.4, 0, 0.2, 1),
  },
  press: { speed: 50, bounciness: 0 },
} as const;

// ── Semantic theme (dark command center) ─────────────────────────────────────
export const theme = {
  scheme: "dark" as const,
  color: {
    bg: palette.bg,
    surface: palette.surface,
    surfaceElevated: palette.surfaceElevated,
    rail: palette.rail,
    text: palette.text,
    textMuted: palette.textMuted,
    textFaint: palette.textFaint,
    hairline: palette.hairline,

    brand: palette.brand,
    brandBright: palette.brandBright,
    brandText: "#5FD6E2", // teal text legible on charcoal
    brandTint: "rgba(14,154,167,0.14)",
    brandBorder: "rgba(22,194,210,0.28)",
    onBrand: palette.white, // matches desktop: white text on teal fills

    success: palette.success,
    successText: "#34C07D",
    successTint: "rgba(43,182,115,0.16)",
    warning: palette.warning,
    warningText: "#F5B54A",
    warningTint: "rgba(245,165,36,0.14)",
    danger: palette.red,
    dangerText: "#F47179",
    dangerTint: "rgba(216,40,40,0.16)",

    onColor: palette.white,
    scrim: "rgba(0,0,0,0.6)",
    glow: "rgba(14,154,167,0.45)",
    // ── Glass & Glow language ──
    glassBase: "#0A0D13",                       // ambient backdrop base (behind the glow)
    glass: "rgba(22,27,38,0.55)",               // translucent card fill
    glassStrong: "rgba(26,32,44,0.74)",         // heavier glass (heroes / sheets)
    glassBorder: "rgba(255,255,255,0.09)",      // hairline light edge
    glassBorderTeal: "rgba(22,194,210,0.26)",   // teal-tinted edge for accented glass
    glassHighlight: "rgba(255,255,255,0.06)",
    glowTeal: "#0E9AA7",
  },
} as const;

export type ThemeColors = typeof theme.color;
