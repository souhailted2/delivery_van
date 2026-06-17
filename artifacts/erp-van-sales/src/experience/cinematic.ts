// ALLAL Experience — shared cinematic motion tokens.
//
// One rhythm and language across every transition:
//   • login entrance, login success, page-to-page, logout
//   • the background scene layer (ExperienceBackground)
//   • the page/UI layer (AppTransition)
// Keep ALL durations & easings here — never inline values across the engine.

import { type Easing } from "framer-motion";

export const ease = {
  smooth:  [0.22, 1,   0.36, 1] as Easing, // entrance — premium, elegant
  sharp:   [0.4,  0,   0.2,  1] as Easing, // hero / through-glass arrival
  exit:    [0.5,  0,   0.75, 0] as Easing, // exit — short, decisive
  expoOut: [0.16, 1,   0.3,  1] as Easing, // camera approach — deep deceleration
  land:    [0.4,  0,   0.2,  1] as Easing, // arrival / cross-dissolve settle
} as const;

export const dur = {
  reduced: 0.18,
  exit:    0.34,
  base:    0.58,
  hero:    1.05,
} as const;

export const blur = {
  page: 8,
  hero: 14,
} as const;

export const distance = {
  page: 10, // px directional drift
} as const;
