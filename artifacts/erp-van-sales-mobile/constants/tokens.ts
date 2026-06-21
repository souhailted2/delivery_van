/**
 * ALLAL Mobile — design tokens (the new "Premium Light" identity).
 *
 * A clean, premium, sunlight-legible interface for the truck driver: soft
 * off-white canvas, white cards with soft shadows, a signature teal GRADIENT
 * for the cash hero / primary actions, big tabular figures, Cairo bold.
 *
 * Light is intentional: the driver works outdoors in bright sun, where a light
 * UI reads far better than dark. The token structure keeps a dark variant easy
 * to add later, but the app ships light-first.
 */
import { Easing, type TextStyle } from "react-native";

// ── Brand + premium-light primitives ─────────────────────────────────────────
export const palette = {
  brand: "#0E9AA7",       // ALLAL teal
  brandBright: "#13B6C4", // accent / gradient end
  brandDeep: "#0C7E89",   // gradient tail
  red: "#E2483F",

  bg: "#EEF1F6",          // page canvas
  screen: "#F7F8FB",      // app surface behind cards
  card: "#FFFFFF",        // cards / panels
  ink: "#0E1525",         // primary text
  ink2: "#4C5666",        // secondary text (darkened for sunlight readability)
  ink3: "#6E7A8C",        // faint text (darkened for sunlight readability)
  line: "#E8ECF3",        // hairlines / borders
  soft: "#EAF6F7",        // teal-tinted soft fill

  success: "#1FA971",
  warning: "#E8902B",
  white: "#ffffff",
  black: "#000000",
} as const;

// Signature gradient (cash hero, primary CTA). Consumed by expo-linear-gradient.
export const gradient = {
  brand: ["#0E9AA7", "#13B6C4", "#0C7E89"] as const,
  success: ["#1FA971", "#0C7E89"] as const,
};

// ── Spacing — strict 4-point base. ───────────────────────────────────────────
export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24, xxxl: 32 } as const;

// ── Radius — generous, modern. ───────────────────────────────────────────────
export const radius = { sm: 12, md: 16, lg: 18, xl: 22, hero: 28, pill: 999 } as const;

// ── Elevation — soft, layered shadows on a light canvas. ─────────────────────
export const elevation = {
  e0: {},
  e1: { shadowColor: "#101C37", shadowOpacity: 0.06, shadowRadius: 14, shadowOffset: { width: 0, height: 8 }, elevation: 3 },
  e2: { shadowColor: "#101C37", shadowOpacity: 0.10, shadowRadius: 22, shadowOffset: { width: 0, height: 14 }, elevation: 8 },
  glow: { shadowColor: palette.brand, shadowOpacity: 0.45, shadowRadius: 26, shadowOffset: { width: 0, height: 16 }, elevation: 12 },
} as const;

// ── Typography — Cairo (bundled weights). Figures use tabular-nums. ──────────
export const fonts = {
  regular: "Cairo_400Regular",
  semibold: "Cairo_600SemiBold",
  bold: "Cairo_700Bold",
} as const;

export const typeScale = {
  display: { fontFamily: fonts.bold, fontSize: 30, lineHeight: 38 },
  title: { fontFamily: fonts.bold, fontSize: 21, lineHeight: 30 },
  headline: { fontFamily: fonts.bold, fontSize: 17, lineHeight: 26 },
  body: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 24 },
  bodyStrong: { fontFamily: fonts.semibold, fontSize: 15, lineHeight: 24 },
  callout: { fontFamily: fonts.semibold, fontSize: 14, lineHeight: 22 },
  footnote: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 20 },
  caption: { fontFamily: fonts.semibold, fontSize: 12, lineHeight: 18 },
} satisfies Record<string, TextStyle>;

export type TypeRole = keyof typeof typeScale;

// ── Motion — sub-300ms, strong ease-out. ─────────────────────────────────────
export const motion = {
  duration: { instant: 120, fast: 180, normal: 220, slow: 300 },
  easing: {
    out: Easing.bezier(0.22, 1, 0.36, 1),
    inOut: Easing.bezier(0.77, 0, 0.175, 1),
    standard: Easing.bezier(0.4, 0, 0.2, 1),
  },
  press: { speed: 50, bounciness: 0 },
} as const;

// ── Semantic theme (premium light) ───────────────────────────────────────────
export const theme = {
  scheme: "light" as const,
  color: {
    bg: palette.screen,             // screen background
    canvas: palette.bg,             // page canvas
    surface: palette.card,          // card / panel
    surfaceElevated: palette.card,
    rail: palette.card,             // tab bar / header
    text: palette.ink,
    textMuted: palette.ink2,
    textFaint: palette.ink3,
    hairline: palette.line,

    brand: palette.brand,
    brandBright: palette.brandBright,
    brandDeep: palette.brandDeep,
    brandText: palette.brand,        // teal text on white
    brandTint: "rgba(14,154,167,0.10)",
    brandBorder: "rgba(14,154,167,0.28)",
    soft: palette.soft,
    onBrand: palette.white,

    success: palette.success,
    successText: "#1FA971",
    successTint: "#E6F7F0",
    warning: palette.warning,
    warningText: "#C9781E",
    warningTint: "#FCF1E3",
    danger: palette.red,
    dangerText: "#D23B33",
    dangerTint: "#FCEBEA",

    onColor: palette.white,
    scrim: "rgba(16,28,55,0.35)",
    glow: "rgba(14,154,167,0.25)",

    // Back-compat keys (older "glass" components map to clean light surfaces)
    glassBase: palette.screen,
    glass: palette.card,
    glassStrong: palette.card,
    glassBorder: palette.line,
    glassBorderTeal: "rgba(14,154,167,0.28)",
    glassHighlight: "rgba(255,255,255,0.7)",
    glowTeal: palette.brand,
  },
  gradient,
} as const;

export type ThemeColors = typeof theme.color;
