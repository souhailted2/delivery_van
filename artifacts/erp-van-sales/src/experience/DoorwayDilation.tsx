// ALLAL Experience — Doorway Dilation (Threshold Cross)
//
// Replaces the cross-dissolve between the HQ exterior and the Operations
// Center interior with a spatial threshold crossing. The interior is REVEALED
// THROUGH a clip-path mask shaped like the building's entrance — a soft
// rounded portal centered at the HQ's doorway position (50%, 52%). The mask
// expands outward over 600ms, swallowing the exterior view as the user
// "passes through."
//
// Cinematic grammar (Director's Plan §Phase 4):
//   0ms     mask shape = aperture at the doorway (~30vw)
//   80ms    mask begins to dilate outward
//   300ms   exterior is pushed past the frame edges
//   500ms   mask fully dilated, interior fills screen
//   500-600 momentary edge darkening — eye adjusts to interior light
//
// Implementation: a positioned absolute layer that holds the interior image
// and applies an animated clip-path on its OWN element. The parent stacks
// this above the exterior, so dilation reveals interior.

import { motion } from "framer-motion";
import { useEffect, useState } from "react";

interface Props {
  /** Interior image source */
  src: string;
  /** When true, plays the dilation. When false, layer is hidden. */
  active: boolean;
  /** Optional callback when dilation completes. */
  onComplete?: () => void;
  /** Children rendered INSIDE the dilating clip (the OCReactiveLayer + tint). */
  children?: React.ReactNode;
}

const D_DILATE = 0.60;  // 600ms
const D_ADJUST = 0.10;  // 100ms edge-darken eye-adjustment
const TOTAL    = D_DILATE + D_ADJUST;

/* Doorway portal in % of viewport — tuned to the HQ exterior's entrance.
   At t=0: a tight rounded rectangle at the doorway position.
   At t=1: a square that covers the entire viewport. */
function aperture(progress: number): string {
  // ease the clip out
  const t = progress;
  // The portal grows from a small region at (50%, 52%) outward.
  // We express it as inset(top right bottom left round R)
  // At t=0: inset(40% 35% 33% 35% round 22% 18%)  — small doorway-shaped hole
  // At t=1: inset(0 0 0 0 round 0)                — full viewport
  const top    = 40 * (1 - t);
  const right  = 35 * (1 - t);
  const bottom = 33 * (1 - t);
  const left   = 35 * (1 - t);
  const radius = 22 * (1 - t);
  return `inset(${top}% ${right}% ${bottom}% ${left}% round ${radius}% ${radius * 0.82}%)`;
}

export function DoorwayDilation({ src, active, onComplete, children }: Props) {
  const [phase, setPhase] = useState<"idle" | "dilating" | "done">("idle");

  useEffect(() => {
    if (!active || phase !== "idle") return;
    setPhase("dilating");
    const tDone = window.setTimeout(() => {
      setPhase("done");
      onComplete?.();
    }, TOTAL * 1000);
    return () => window.clearTimeout(tDone);
  }, [active, phase, onComplete]);

  if (!active) return null;

  return (
    <motion.div
      aria-hidden
      style={{
        position: "absolute",
        inset: 0,
        overflow: "hidden",
        pointerEvents: "none",
        willChange: "clip-path, filter",
      }}
      initial={{ clipPath: aperture(0), filter: "brightness(0.92)" }}
      animate={{
        clipPath: [aperture(0), aperture(0.4), aperture(0.85), aperture(1.0), aperture(1.0)],
        filter:   ["brightness(0.92)", "brightness(0.96)", "brightness(1.0)", "brightness(0.85)", "brightness(1.0)"],
      }}
      transition={{
        duration: TOTAL,
        times: [0, 0.30, 0.70, D_DILATE / TOTAL, 1],
        ease: [0.22, 1, 0.36, 1],
      }}
    >
      <img
        src={src}
        alt=""
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          objectFit: "cover",
        }}
      />
      {children}
    </motion.div>
  );
}
