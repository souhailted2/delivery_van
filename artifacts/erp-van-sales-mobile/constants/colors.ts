/**
 * Legacy flat color object consumed by `useColors()` (used by not-yet-migrated
 * screens). Re-skinned to the ALLAL "Premium Light" identity so the whole app
 * moves to the new look without a per-screen refactor.
 *
 * New code should prefer `useTheme()`.
 */
import { palette } from "./tokens";

const colors = {
  light: {
    text: palette.ink,
    tint: palette.brand,
    background: palette.screen,
    foreground: palette.ink,
    card: palette.card,
    cardForeground: palette.ink,
    primary: palette.brand,
    primaryForeground: palette.white,
    secondary: palette.bg,
    secondaryForeground: palette.ink,
    muted: palette.bg,
    mutedForeground: palette.ink2,
    accent: palette.soft,
    accentForeground: palette.brand,
    destructive: palette.red,
    destructiveForeground: palette.white,
    success: palette.success,
    successForeground: palette.white,
    warning: palette.warning,
    warningForeground: palette.white,
    border: palette.line,
    input: palette.line,
    ring: palette.brandBright,
    successTint: "#E6F7F0",
    warningTint: "#FCF1E3",
    dangerTint: "#FCEBEA",
    brandTint: "rgba(14,154,167,0.10)",
  },
  radius: 16,
};

export default colors;
