// ALLAL Experience — Logout (Phase 8 of Director's Plan)
//
// The reverse cinematic. Symmetry with the arrival is the single strongest
// signal that this is a *place* and not a web application. The arrival took
// the user IN; the logout takes the user OUT.
//
// Timeline (~3.3s total):
//   T=0.00  ACKNOWLEDGE — 300ms hold. The system is registering the command.
//   T=0.30  OC POWER-DOWN — 1.6s reverse cascade:
//             - Command Bar / dashboard cards retreat (handled by Dashboard
//               via isLeaving gate)
//             - Wall display fades out R→L (OCReactiveLayer "sleeping")
//             - Desk monitors sleep in reverse waves
//             - Cyan accent lighting cools to 40%
//   T=1.90  DOORWAY CONTRACTS — 600ms reverse dilation. We are looking
//             through the doorway from inside; the portal contracts around
//             our view as we step back out.
//   T=2.50  EXTERIOR — we arrive outside. Truck headlights dim. Entrance
//             lamp returns to 30% standby over 500ms.
//   T=3.00  COMMIT — actual logout API call + navigation fires here.
//   T=3.30  DONE — overlay fades, login card materialises naturally.

import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import { routeToScene } from "./scenes";
import { ease } from "./cinematic";
import { HQReactiveLayer, type HQPhase } from "./HQReactiveLayer";
import { OCReactiveLayer, type OCPhase } from "./OCReactiveLayer";

const T = {
  ackEnd:      0.30,
  pdEnd:       1.90,
  contractEnd: 2.50,
  exteriorEnd: 3.00,
  commit:      3.00,
  done:        3.30,
} as const;

interface Props {
  /** Invoked when the system should actually perform the logout (API + nav). */
  onCommit: () => void;
  /** Invoked when the overlay can be unmounted. */
  onComplete: () => void;
}

/* Reverse aperture — at progress=1 it's a tight doorway-shaped hole;
   at progress=0 it covers the full viewport. */
function reverseAperture(progress: number): string {
  const t = progress;
  const top    = 40 * t;
  const right  = 35 * t;
  const bottom = 33 * t;
  const left   = 35 * t;
  const radius = 22 * t;
  return `inset(${top}% ${right}% ${bottom}% ${left}% round ${radius}% ${radius * 0.82}%)`;
}

export function LogoutSequence({ onCommit, onComplete }: Props) {
  const hqSrc = routeToScene("/connexion").image!;
  const ocSrc = routeToScene("/").image!;

  const [stage, setStage] = useState<"ack" | "powerdown" | "contracting" | "exterior" | "done">("ack");

  useEffect(() => {
    const tPd     = window.setTimeout(() => setStage("powerdown"),    T.ackEnd       * 1000);
    const tContr  = window.setTimeout(() => setStage("contracting"),  T.pdEnd        * 1000);
    const tExt    = window.setTimeout(() => setStage("exterior"),     T.contractEnd  * 1000);
    const tCommit = window.setTimeout(onCommit,                       T.commit       * 1000);
    const tDone   = window.setTimeout(() => {
      setStage("done");
      onComplete();
    },                                                                T.done         * 1000);
    return () => {
      window.clearTimeout(tPd);
      window.clearTimeout(tContr);
      window.clearTimeout(tExt);
      window.clearTimeout(tCommit);
      window.clearTimeout(tDone);
    };
  }, [onCommit, onComplete]);

  const ocPhase: OCPhase =
    stage === "ack" ? "active"
    : stage === "powerdown" ? "sleeping"
    : "dim";

  // HQ phase: standby once we're back outside. During the contracting beat
  // the interior is still occupying the viewport so HQ doesn't matter yet.
  const hqPhase: HQPhase =
    stage === "exterior" || stage === "done" ? "standby" : "standby";

  // Overlay opacity by stage:
  //  ack         → translucent (0.05 → 0.45) so Dashboard's reverse-stagger
  //                is visible underneath (cards retreating into the room)
  //  powerdown+  → fully opaque (1.0) so the reverse cinematic owns the frame
  //  done        → fades to 0 so the login resting state is revealed
  const overlayOpacity =
    stage === "ack"  ? 0.45
    : stage === "done" ? 0
    : 1;

  // Doorway contraction progress
  const contractActive = stage === "contracting";

  return (
    <motion.div
      aria-hidden
      initial={{ opacity: 0.05 }}
      animate={{ opacity: overlayOpacity }}
      transition={{ duration: 0.4, ease: ease.land as any }}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 100,
        overflow: "hidden",
        background: "#05080f",
        willChange: "opacity",
      }}
    >
      {/* ── Interior plate — visible throughout ack + powerdown + contracting.
            During contracting, the clip-path shrinks around the view. */}
      {(stage === "ack" || stage === "powerdown" || stage === "contracting") && (
        <motion.div
          initial={{ clipPath: reverseAperture(0) }}
          animate={{ clipPath: contractActive ? reverseAperture(1) : reverseAperture(0) }}
          transition={{ duration: 0.6, ease: ease.expoOut as any }}
          style={{ position: "absolute", inset: 0, willChange: "clip-path" }}
        >
          <img src={ocSrc} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
          <OCReactiveLayer phase={ocPhase} />
          <div style={{ position: "absolute", inset: 0, background: "radial-gradient(58% 48% at 50% 36%, rgba(14,154,167,0.10), transparent 72%)", pointerEvents: "none" }} />
          <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, transparent 68%, rgba(5,8,15,0.32))", pointerEvents: "none" }} />
        </motion.div>
      )}

      {/* ── Exterior plate — revealed once the doorway has contracted past
            the screen edges. The camera has stepped back outside. */}
      {(stage === "exterior" || stage === "done") && (
        <motion.div
          initial={{ scale: 1.26, opacity: 0, transformOrigin: "50% 52%" }}
          animate={{ scale: 1.08, opacity: 1 }}
          transition={{ duration: 0.6, ease: ease.expoOut as any }}
          style={{ position: "absolute", inset: 0, willChange: "transform, opacity" }}
        >
          <img src={hqSrc} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
          <HQReactiveLayer phase={hqPhase} />
          <div style={{ position: "absolute", inset: 0, background: "radial-gradient(58% 48% at 50% 36%, rgba(14,154,167,0.10), transparent 72%)", pointerEvents: "none" }} />
          <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, transparent 68%, rgba(5,8,15,0.32))", pointerEvents: "none" }} />
        </motion.div>
      )}
    </motion.div>
  );
}
