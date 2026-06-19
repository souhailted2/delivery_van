import { elevation, fonts, motion, radius, spacing, theme, typeScale } from "@/constants/tokens";

/**
 * ALLAL Command Center theme hook — the structured token API for components.
 *
 * The app is dark-by-default to mirror the desktop flagship theme
 * (`<html class="dark">`), so this returns the single command-center theme.
 */
export function useTheme() {
  return {
    scheme: theme.scheme,
    color: theme.color,
    spacing,
    radius,
    elevation,
    type: typeScale,
    fonts,
    motion,
  };
}

export type Theme = ReturnType<typeof useTheme>;
