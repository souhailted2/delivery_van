// ALLAL Experience — page navigation transition (consolidated).
//
// ONE concept: a fast opacity fade-in of the PAGE CONTENT on route change.
// No directional model, no blur, no scene/hero machinery, no exit animation —
// the app is one Operations Center, so navigation is just the workspace content
// swapping quickly and smoothly while the shell stays put.
//
// "No blink, no gap": there is deliberately NO exit animation and NO
// AnimatePresence. React swaps the route in a single commit (old content is
// replaced directly by the new content), then the new content fades 0→1 over
// ~140ms. There is never an empty/blank moment between pages.
//
// Login/logout are NOT handled here — the Arrival overlay owns them. During an
// arrival (or reduced-motion) the fade collapses to instant so nothing competes.

import { motion, useReducedMotion } from "framer-motion";
import { useLocation } from "wouter";
import { type ReactNode } from "react";
import { ease, dur } from "./cinematic";
import { useArrival } from "./ArrivalProvider";

export function AppTransition({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const reduce = useReducedMotion();
  const { isArriving } = useArrival();
  const duration = isArriving || reduce ? 0 : dur.page;

  return (
    <motion.div
      key={location}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration, ease: ease.smooth as any }}
    >
      {children}
    </motion.div>
  );
}
