// ALLAL Experience — Login → Dashboard arrival cinematic.
//
// The deliberate storyboard. Plays ONCE, as a fixed full-screen overlay above
// everything else, then unmounts. Static images only — no Three.js, no moving
// environments, just scale / blur / opacity / brightness choreography.
//
// Storyboard (~3.4s):
//   T = 0.00s  : sequence begins; HQ exterior rises in (overlay opaque @0.18)
//   T = 0.18s  : slow cinematic push-in toward the entrance (expoOut camera)
//   T = 1.68s  : CRESCENDO — entrance lights catch you (brightness pop)
//                then cross-dissolve begins (HQ blurs + fades out)
//   T = 1.68s  : Operations Center interior rises through the dissolve
//   T = 2.43s  : interior fully present — "the lights come up" beat (brighten)
//   T = 2.93s  : curtain lifts (overlay fades) → onReveal() fires so the live
//                Dashboard STAGGERS IN as the curtain rises (not before)
//   T = 3.43s  : onComplete() — overlay unmounts
//
// Why onReveal at T=2.93 (curtain-lift), not at navigation: the Dashboard
// mounts behind the overlay at t≈0. If its cards animated on mount they'd be
// settled before the user ever sees them. onReveal gates the Dashboard's
// reveal to THIS moment, so the command-center UI materialises AS the curtain
// rises — the user feels they walked in and the consoles lit up.

import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import { routeToScene } from "./scenes";
import { ease } from "./cinematic";

// timing (seconds)
const D = {
  appear:   0.18, // HQ image rises in
  push:     1.50, // slow cinematic push-in (camera approaches the entrance)
  dissolve: 0.75, // cross-dissolve HQ → Operations Center interior
  beat:     0.50, // "the lights come up" hold on the interior
  reveal:   0.50, // curtain lifts onto the materialising Dashboard
} as const;

const T_CROSS    = D.appear + D.push;                 // 1.68
const T_INTERIOR = T_CROSS + D.dissolve;              // 2.43
const T_OVERLAY  = T_INTERIOR + D.beat;               // 2.93  (curtain begins to lift)
const T_DONE     = T_OVERLAY + D.reveal;              // 3.43
const HQ_DUR     = D.appear + D.push + D.dissolve;    // 2.43

// expoOut — a camera move decelerates as it "arrives"; ease-in-out reads as a
// CSS zoom, expoOut reads as approach. (audit fix P1.1)
const EXPO_OUT = ease.expoOut;

interface Props {
  /** Fires when the curtain begins to lift — the Dashboard should reveal now. */
  onReveal: () => void;
  /** Fires when the overlay has fully lifted and can unmount. */
  onComplete: () => void;
}

export function LoginArrival({ onReveal, onComplete }: Props) {
  const [overlayPhase, setOverlayPhase] = useState<"in" | "out">("in");

  useEffect(() => {
    const tReveal = window.setTimeout(() => { setOverlayPhase("out"); onReveal(); }, T_OVERLAY * 1000);
    const tDone   = window.setTimeout(onComplete, T_DONE * 1000);
    return () => { window.clearTimeout(tReveal); window.clearTimeout(tDone); };
  }, [onReveal, onComplete]);

  const hq = routeToScene("/connexion").image!;
  const interiorSrc = routeToScene("/").image;

  return (
    <motion.div
      aria-hidden
      initial={{ opacity: 1 }}
      animate={{ opacity: overlayPhase === "in" ? 1 : 0 }}
      transition={{ duration: D.reveal, ease: ease.land as any }}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 100,
        overflow: "hidden",
        background: "#05080f",
      }}
    >
      {/* HQ exterior — rise in, push toward the entrance, crescendo, dissolve */}
      <motion.img
        src={hq}
        alt=""
        initial={{ opacity: 0, scale: 1, filter: "blur(0px) brightness(1)" }}
        animate={{
          opacity: [0, 1, 1, 1, 0],
          scale:   [1, 1, 1.22, 1.26, 1.26],
          filter: [
            "blur(0px) brightness(1)",
            "blur(0px) brightness(1)",
            "blur(0px) brightness(1.14)",
            "blur(0px) brightness(1.30)", // crescendo — entrance lights catch you
            "blur(16px) brightness(1.06)",
          ],
        }}
        transition={{
          duration: HQ_DUR,
          times: [
            0,
            D.appear / HQ_DUR,                          // 0.074 — appear done
            (D.appear + D.push * 0.85) / HQ_DUR,        // 0.599 — push nearly there
            T_CROSS / HQ_DUR,                           // 0.691 — at the entrance (crescendo)
            1,                                          // dissolved out
          ],
          ease: [
            EXPO_OUT as any,            // appear
            EXPO_OUT as any,            // push (camera approach)
            [0.34, 1.1, 0.64, 1] as any, // crescendo — slight overshoot "pop"
            ease.land as any,           // dissolve out
          ],
        }}
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          objectFit: "cover",
          transformOrigin: "50% 52%", // push toward the building entrance
          willChange: "transform, opacity, filter",
        }}
      />

      {/* Operations Center interior — rises through the dissolve, then the
          lights come up during the beat (brightness 0.8 → 1.04). */}
      <motion.div
        initial={{ opacity: 0, scale: 1.08, filter: "blur(16px) brightness(0.8)" }}
        animate={{
          opacity: [0, 1, 1],
          scale:   [1.08, 1.0, 1.0],
          filter: [
            "blur(16px) brightness(0.80)",
            "blur(0px) brightness(0.92)",
            "blur(0px) brightness(1.04)", // lights come up
          ],
        }}
        transition={{
          duration: D.dissolve + D.beat,
          delay: T_CROSS,
          times: [0, D.dissolve / (D.dissolve + D.beat), 1],
          ease: [ease.land as any, [0.22, 1, 0.36, 1] as any],
        }}
        style={{ position: "absolute", inset: 0, willChange: "transform, opacity, filter" }}
      >
        <InteriorLayer src={interiorSrc} />
        {/* volumetric depth — warm key from the screen wall + cool floor fill */}
        <div style={{ position: "absolute", inset: 0, background: "radial-gradient(58% 48% at 50% 36%, rgba(14,154,167,0.12), transparent 72%)", pointerEvents: "none" }} />
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, transparent 58%, rgba(5,8,15,0.5))", pointerEvents: "none" }} />
      </motion.div>
    </motion.div>
  );
}

function InteriorLayer({ src }: { src: string | undefined }) {
  const [failed, setFailed] = useState(false);
  if (src && !failed) {
    return (
      <img
        src={src}
        alt=""
        onError={() => setFailed(true)}
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
      />
    );
  }
  return <OperationsInteriorPlaceholder />;
}

// Static stylized "operations center" backdrop — pure CSS, no animation.
// Fallback only; unreachable once public/scenes/operations_center.png exists.
function OperationsInteriorPlaceholder() {
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        background: `
          radial-gradient(38% 26% at 50% 36%, rgba(14, 154, 167, 0.26), transparent 72%),
          radial-gradient(75% 60% at 50% 70%, rgba(8, 24, 42, 0.62), transparent 88%),
          linear-gradient(180deg, #0a1726 0%, #050a14 60%, #03060c 100%)
        `,
      }}
    >
      <div style={{ position: "absolute", left: "16%", right: "16%", top: "28%", height: "20%",
        background: "linear-gradient(180deg, rgba(14,154,167,0.14), transparent)",
        filter: "blur(32px)", borderRadius: "20px" }} />
      <div style={{ position: "absolute", left: "24%", right: "24%", top: "31%", height: "16%",
        background: "linear-gradient(180deg, rgba(14,154,167,0.20), transparent)",
        filter: "blur(12px)", borderRadius: "10px" }} />
      <div style={{ position: "absolute", left: "30%", right: "30%", top: "34%", height: "12%",
        background: "linear-gradient(180deg, rgba(14,154,167,0.28), transparent)",
        filter: "blur(3px)", borderRadius: "4px" }} />
      <div style={{ position: "absolute", left: 0, right: 0, bottom: "18%", height: "1px",
        background: "linear-gradient(90deg, transparent, rgba(216, 162, 30, 0.35), transparent)",
        filter: "blur(0.5px)" }} />
    </div>
  );
}
