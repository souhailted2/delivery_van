/**
 * Legacy flat color object consumed by `useColors()` (used by not-yet-migrated
 * screens). Re-skinned to the ALLAL Command Center dark theme so the whole app
 * moves to the brand identity without a per-screen refactor. Values mirror the
 * desktop `.dark` theme (artifacts/erp-van-sales/src/index.css).
 *
 * New code should prefer `useTheme()`. Screens still on `useColors()` will read
 * dark surfaces here; any hardcoded light hex inside those screens is cleaned up
 * as each screen is migrated.
 */
import { palette } from "./tokens";

const colors = {
  light: {
    // key name kept for back-compat; values are the dark command-center theme
    text: palette.text,
    tint: palette.brand,
    background: palette.bg,
    foreground: palette.text,
    card: palette.surface,
    cardForeground: palette.text,
    primary: palette.brand,
    primaryForeground: palette.white,
    secondary: palette.surfaceElevated,
    secondaryForeground: palette.text,
    muted: palette.surfaceElevated,
    mutedForeground: palette.textMuted,
    accent: "#12414A",
    accentForeground: "#7FD6DF",
    destructive: palette.red,
    destructiveForeground: palette.white,
    success: palette.success,
    successForeground: palette.white,
    warning: palette.warning,
    warningForeground: palette.bg,
    border: palette.hairline,
    input: palette.hairline,
    ring: palette.brandBright,
    // additive semantic tints
    successTint: "rgba(43,182,115,0.16)",
    warningTint: "rgba(245,165,36,0.14)",
    dangerTint: "rgba(216,40,40,0.16)",
    brandTint: "rgba(14,154,167,0.14)",
  },
  radius: 12,
};

export default colors;
