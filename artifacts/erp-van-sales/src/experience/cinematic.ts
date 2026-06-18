// ALLAL Experience — motion tokens (consolidated).
//
// The app is ONE Operations Center, so the motion system is intentionally tiny:
//   • internal navigation  — a fast opacity fade-in of the page content
//     (AppTransition); the persistent shell never re-animates.
//   • environment exposure — the shell's own background alpha fades between the
//     bright dashboard (OC visible) and dimmed work pages (Layout); CSS only.
//
// The login/logout cinematic is owned ENTIRELY by the Arrival overlay
// (experience/arrival-asset + LoginArrival/LogoutSequence) and does NOT use
// these tokens — there is no longer any hidden hero transition.

import { type Easing } from "framer-motion";

export const ease = {
  smooth: [0.22, 1, 0.36, 1] as Easing, // standard ease-out for UI motion
} as const;

export const dur = {
  page: 0.14, // internal navigation — page-content fade-in
} as const;
