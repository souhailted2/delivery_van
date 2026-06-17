// ALLAL Experience — page-level cinematic transition.
//
// ONE AnimatePresence around the entire routed UI. On every navigation:
//   • hero "through-glass"  — Login → Dashboard (arriving at HQ)
//   • hero "recede"         — Dashboard → Login (logout)
//   • directional drift     — every other route change (slight scale + blur)
//   • reduced-motion        — instant opacity crossfade
//
// Motion tokens are shared with ExperienceBackground (see ./cinematic) so the
// background and the UI move together as one camera. NEVER inline durations
// or easings here.
//
// Why we freeze location into <Switch location={location}>: AnimatePresence
// keeps the exiting motion.div mounted in-tree, but its descendant Switch
// would otherwise read the NEW location from context and render the new route
// during exit — causing a flash. Passing the per-render snapshot keeps the
// exiting subtree on its OLD route until the exit completes.

import { AnimatePresence, motion, useReducedMotion, type Variants } from "framer-motion";
import { useLocation } from "wouter";
import { useEffect, useRef, type ReactNode } from "react";
import { routeToScene } from "./scenes";
import { ease, dur, blur, distance } from "./cinematic";
import { useArrival } from "./ArrivalProvider";

interface CamCtx {
  dir: number;                 // narrative direction along scene.order
  hero: "in" | "out" | null;   // "in"  = login → dashboard, "out" = anywhere → login
  reduced: boolean;
}

// exit transition lives on the exit variant (framer-motion doesn't accept a
// per-direction `exit` key inside transition props).
const buildExitTransition = (reduced: boolean, hero: CamCtx["hero"]) => ({
  duration: reduced ? dur.reduced : hero ? dur.exit + 0.12 : dur.exit,
  ease: ease.exit,
});

const pageVariants: Variants = {
  initial: (c: CamCtx) => {
    if (c.reduced) return { opacity: 0 };
    if (c.hero === "in")
      return { opacity: 0, scale: 1.035, filter: `blur(${blur.hero}px)`, y: 0 };
    if (c.hero === "out")
      return { opacity: 0, scale: 0.99,  filter: `blur(${blur.page}px)`, y: 0 };
    return { opacity: 0, scale: 1.012, y: c.dir * distance.page, filter: `blur(${blur.page}px)` };
  },
  animate: { opacity: 1, scale: 1, y: 0, filter: "blur(0px)" },
  exit: (c: CamCtx) => {
    if (c.reduced) return { opacity: 0, transition: buildExitTransition(c.reduced, c.hero) };
    if (c.hero === "in")
      return { opacity: 0, scale: 0.985, filter: `blur(${blur.page}px)`, y: -4, transition: buildExitTransition(false, "in") };
    if (c.hero === "out")
      return { opacity: 0, scale: 1.025, filter: `blur(${blur.hero}px)`, y: 0, transition: buildExitTransition(false, "out") };
    return { opacity: 0, scale: 0.995, y: -c.dir * 4, filter: `blur(${blur.page}px)`, transition: buildExitTransition(false, null) };
  },
};

export function AppTransition({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const reducedPref = useReducedMotion();
  const { isArriving } = useArrival();
  const scene = routeToScene(location);
  const prev = useRef({ id: scene.id, order: scene.order });

  const dir = Math.sign(scene.order - prev.current.order) || 1;
  const heroRaw: CamCtx["hero"] =
    prev.current.id === "login"     && scene.id === "dashboard" ? "in"  :
    prev.current.id === "dashboard" && scene.id === "login"     ? "out" :
    null;

  useEffect(() => {
    prev.current = { id: scene.id, order: scene.order };
  }, [scene.id, scene.order]);

  // During the LoginArrival cinematic, the overlay owns the show — collapse
  // the page transition to a near-instant opacity crossfade so the Dashboard
  // simply mounts behind the overlay with no competing animation.
  const reduced = !!reducedPref || isArriving;
  const hero = isArriving ? null : heroRaw;

  const ctx: CamCtx = { dir, hero, reduced };
  const enterDur  = reduced ? dur.reduced : hero ? dur.hero : dur.base;
  const enterEase = hero === "in" ? ease.sharp : ease.smooth;

  return (
    <AnimatePresence mode="wait" custom={ctx} initial={false}>
      <motion.div
        key={location}
        custom={ctx}
        variants={pageVariants}
        initial="initial"
        animate="animate"
        exit="exit"
        transition={{ duration: enterDur, ease: enterEase as any }}
        style={{ minHeight: "100vh", willChange: "transform, opacity, filter" }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}
