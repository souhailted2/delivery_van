// ALLAL Experience — Login → Dashboard Arrival Cinematic (Reactive)
//
// Director's Plan Phases 3-6, choreographed as a single ~4.5s overlay:
//
//   T=0      Arrival starts.
//            (The Phase 2 click cascade already played BEFORE this mounts —
//             the building's lights and doorway are already on.)
//
//   T=0.00   APPROACH — exterior pushes forward (expoOut camera).
//            HQ Reactive Layer in "approach" phase: lights stay full,
//            doorway core intensifies as we close in.
//
//   T=1.50   ENTRY — Phase 4. The DoorwayDilation portal expands from the
//            building entrance, swallowing the exterior and revealing the
//            Operations Center interior. 600ms spatial threshold crossing.
//
//   T=2.10   ACTIVATION — Phase 5. The room wakes:
//              wall scan → KPIs L→R → desk monitors (3 waves) →
//              cyan lighting lifts → floor pulse → hold
//            1.3s cascade.
//
//   T=3.40   HANDOVER — Phase 6. The curtain begins to lift; the OCReactiveLayer
//            holds at "active"; the Dashboard's reveal gate (dashboardReady) is
//            flipped so cards stagger in from the wall display.
//
//   T=4.00   DONE — overlay unmounts. Dashboard has taken control.

import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import { routeToScene } from "./scenes";
import { ease } from "./cinematic";
import { HQReactiveLayer } from "./HQReactiveLayer";
import { OCReactiveLayer, type OCPhase } from "./OCReactiveLayer";
import { DoorwayDilation } from "./DoorwayDilation";

// Timeline (seconds within the overlay's lifetime)
const T = {
  approachEnd:  1.50,   // push-in done
  dilateEnd:    2.10,   // doorway dilation done — interior visible
  activateEnd:  3.40,   // OC awake cascade done
  handover:     3.40,   // dashboardReady flipped
  done:         4.00,   // overlay unmounts
} as const;

interface Props {
  /** Fires when the curtain begins to lift — Dashboard cards should reveal now. */
  onReveal: () => void;
  /** Fires when the overlay can be unmounted. */
  onComplete: () => void;
}

export function LoginArrival({ onReveal, onComplete }: Props) {
  const hqSrc = routeToScene("/connexion").image!;
  const ocSrc = routeToScene("/").image!;

  // Internal storyboard phases
  const [stage, setStage] = useState<"approach" | "dilating" | "activating" | "handover" | "done">("approach");

  useEffect(() => {
    const tDilate    = window.setTimeout(() => setStage("dilating"),    T.approachEnd * 1000);
    const tActivate  = window.setTimeout(() => setStage("activating"),  T.dilateEnd   * 1000);
    const tHandover  = window.setTimeout(() => {
      setStage("handover");
      onReveal();
    }, T.handover * 1000);
    const tDone      = window.setTimeout(() => {
      setStage("done");
      onComplete();
    }, T.done * 1000);
    return () => {
      window.clearTimeout(tDilate);
      window.clearTimeout(tActivate);
      window.clearTimeout(tHandover);
      window.clearTimeout(tDone);
    };
  }, [onReveal, onComplete]);

  // OC phase mapping
  const ocPhase: OCPhase =
    stage === "approach" || stage === "dilating" ? "dim"
    : stage === "activating" ? "waking"
    : "active";

  return (
    <motion.div
      aria-hidden
      initial={{ opacity: 1 }}
      animate={{ opacity: stage === "done" ? 0 : 1 }}
      transition={{ duration: 0.6, ease: ease.land as any }}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 100,
        overflow: "hidden",
        background: "#05080f",
        willChange: "opacity",
      }}
    >
      {/* ── HQ exterior plate — pushes forward over 1.5s, then holds at
            zoom while DoorwayDilation reveals the interior over it. */}
      <motion.div
        initial={{ scale: 1, transformOrigin: "50% 52%" }}
        animate={{ scale: stage === "approach" ? 1.26 : 1.26 }}
        transition={{ duration: T.approachEnd, ease: ease.expoOut as any }}
        style={{ position: "absolute", inset: 0, willChange: "transform" }}
      >
        <img
          src={hqSrc}
          alt=""
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
        />
        <HQReactiveLayer phase="approach" />
      </motion.div>

      {/* ── Doorway dilation — Phase 4. Begins at T_approachEnd, lasts 600ms.
            Inside it, the OC photograph + reactive layer at "dim" or "waking". */}
      <DoorwayDilation
        src={ocSrc}
        active={stage === "dilating" || stage === "activating" || stage === "handover"}
      >
        <OCReactiveLayer phase={ocPhase} />
        {/* warm tint matching the cinematic interior beat */}
        <div style={{ position: "absolute", inset: 0, background: "radial-gradient(58% 48% at 50% 36%, rgba(14,154,167,0.10), transparent 72%)", pointerEvents: "none" }} />
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, transparent 68%, rgba(5,8,15,0.32))", pointerEvents: "none" }} />
      </DoorwayDilation>
    </motion.div>
  );
}
