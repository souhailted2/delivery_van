// ALLAL Experience — HQ Reactive Layer
//
// Overlays the HQ exterior photograph with positioned reactive zones — light
// sources, threshold beacons, breathing distant windows — that respond to the
// user's actions. Renders the WORLD's reaction, not UI effects.
//
// Phases (Director's Plan §HQ):
//   standby  → idle micro-life: distant warehouse windows breathe, entrance lamp at 30%
//   notice   → user is engaging the form: entrance lamp lifts to 45%
//   charge   → button is pressed; 120ms charge ring (button-local, handled in Connexion)
//   cascade  → 200ms HOLD, then the building responds in sequence:
//              200-380ms  truck headlights flare
//              320-600ms  entrance lamp rises to 100% (warm spill on pavement)
//              480-560ms  wall display visible through glass pulses once
//              580-1180ms doorway threshold ignites (offered way in)
//   approach → camera is pushing forward; doorway warmth intensifies as we near
//
// All positions are % of the image so they track scale transforms applied by
// the LoginArrival camera move. Hotspots use mix-blend-mode: screen so they
// ADD light to the photograph rather than painting on top of it.

import { motion } from "framer-motion";

export type HQPhase = "standby" | "notice" | "charge" | "cascade" | "approach";

interface Props {
  phase: HQPhase;
}

/* Hotspot positions are % relative to the image bounds. Tuned to the
   production HQ exterior photo (ChatGPT Image 16 يونيو 2026، 07_24_24 م.png). */
const POS = {
  truckL:        { x: 44.5, y: 64,   size: 14 },
  truckR:        { x: 52.5, y: 64,   size: 14 },
  entranceLamp:  { x: 42,   y: 37,   size: 22 },
  entrySpill:    { x: 42,   y: 64,   size: 36 },
  wallDisplay:   { x: 42,   y: 45,   size: 12 },
  warehouseW1:   { x:  7,   y: 42,   size:  4 },
  warehouseW2:   { x: 13,   y: 44,   size:  4 },
  warehouseW3:   { x: 17,   y: 47,   size:  4 },
  doorwayCore:   { x: 42,   y: 50,   size: 30 },
} as const;

/** Generates the inline style for a hotspot positioned by % of parent. */
function spot(x: number, y: number, size: number, color: string, blur = 12) {
  return {
    position: "absolute" as const,
    left:   `${x}%`,
    top:    `${y}%`,
    width:  `${size}%`,
    aspectRatio: "1 / 1",
    transform: "translate(-50%, -50%)",
    background: `radial-gradient(circle, ${color} 0%, transparent 70%)`,
    mixBlendMode: "screen" as const,
    filter: `blur(${blur}px)`,
    pointerEvents: "none" as const,
    willChange: "opacity, transform",
  };
}

export function HQReactiveLayer({ phase }: Props) {
  /* ── standby idle: distant warehouse windows breathe at irregular intervals
     (Phase 1 of the Director's Plan). Each window has its own period so the
     overall pattern reads as life, not a metronome. */
  const breath = (period: number, delay: number) => ({
    animate: { opacity: [0.25, 0.95, 0.30, 0.85, 0.25] },
    transition: { duration: period, delay, repeat: Infinity, repeatType: "loop" as const, ease: "easeInOut" as const, times: [0, 0.18, 0.5, 0.76, 1] },
  });

  /* Entrance lamp baseline level by phase. Charge piggy-backs on notice — the
     button cascade orchestrates the dramatic lift. */
  const lampLevel = {
    standby: 0.30,
    notice:  0.45,
    charge:  0.45,
    cascade: 1.00,  // animated by keyframes below
    approach: 1.00,
  }[phase];

  return (
    <div aria-hidden style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>

      {/* ── Distant warehouse windows — breathe through every phase but mute
            once the cascade begins (the eye should be on the entrance). */}
      <motion.div style={spot(POS.warehouseW1.x, POS.warehouseW1.y, POS.warehouseW1.size, "rgba(255,225,170,0.9)", 6)}
                  {...breath(9.0, 0.0)} />
      <motion.div style={spot(POS.warehouseW2.x, POS.warehouseW2.y, POS.warehouseW2.size, "rgba(255,220,160,0.85)", 6)}
                  {...breath(11.5, 1.8)} />
      <motion.div style={spot(POS.warehouseW3.x, POS.warehouseW3.y, POS.warehouseW3.size, "rgba(255,215,150,0.8)", 6)}
                  {...breath(7.5, 3.2)} />

      {/* ── Entrance lamp — single warm point above the canopy that the building
            uses to greet arrivals. Steady at 30% by default; lifts on notice;
            crescendos during the cascade. */}
      <motion.div
        style={spot(POS.entranceLamp.x, POS.entranceLamp.y, POS.entranceLamp.size, "rgba(255,210,150,1.0)", 18)}
        initial={{ opacity: 0.30 }}
        animate={
          phase === "cascade"
            ? { opacity: [0.45, 0.45, 1.0, 1.0] }
            : { opacity: lampLevel }
        }
        transition={
          phase === "cascade"
            ? { duration: 0.60, times: [0, 0.20 / 0.60, 0.60 / 0.60, 1], delay: 0, ease: [0.22, 1, 0.36, 1] }
            : { duration: 0.65, ease: [0.22, 1, 0.36, 1] }
        }
      />

      {/* ── Truck headlight flare — both trucks ignite together at +200ms.
            180ms ramp from 0 to full, settles at 80%. */}
      <motion.div
        style={spot(POS.truckL.x, POS.truckL.y, POS.truckL.size, "rgba(255,238,200,1.0)", 10)}
        initial={{ opacity: 0 }}
        animate={
          phase === "cascade" || phase === "approach"
            ? { opacity: [0, 0, 1.0, 0.80] }
            : { opacity: 0 }
        }
        transition={
          phase === "cascade"
            ? { duration: 0.80, times: [0, 0.20 / 0.80, 0.38 / 0.80, 1], ease: [0.22, 1, 0.36, 1] }
            : { duration: 0.4, ease: [0.22, 1, 0.36, 1] }
        }
      />
      <motion.div
        style={spot(POS.truckR.x, POS.truckR.y, POS.truckR.size, "rgba(255,238,200,1.0)", 10)}
        initial={{ opacity: 0 }}
        animate={
          phase === "cascade" || phase === "approach"
            ? { opacity: [0, 0, 1.0, 0.80] }
            : { opacity: 0 }
        }
        transition={
          phase === "cascade"
            ? { duration: 0.80, times: [0, 0.20 / 0.80, 0.38 / 0.80, 1], ease: [0.22, 1, 0.36, 1] }
            : { duration: 0.4, ease: [0.22, 1, 0.36, 1] }
        }
      />

      {/* ── Wall display through the entrance glass — a single teal pulse at
            +480ms. The operations center has been notified. */}
      <motion.div
        style={spot(POS.wallDisplay.x, POS.wallDisplay.y, POS.wallDisplay.size, "rgba(14,180,200,0.95)", 8)}
        initial={{ opacity: 0 }}
        animate={
          phase === "cascade" || phase === "approach"
            ? { opacity: [0, 0, 0.95, 0.55] }
            : { opacity: 0 }
        }
        transition={
          phase === "cascade"
            ? { duration: 0.80, times: [0, 0.48 / 0.80, 0.56 / 0.80, 1], ease: [0.22, 1, 0.36, 1] }
            : { duration: 0.4, ease: [0.22, 1, 0.36, 1] }
        }
      />

      {/* ── Warm light spill on the wet pavement directly below the entrance.
            Tracks the entrance lamp but lower and wider, with a slight delay. */}
      <motion.div
        style={spot(POS.entrySpill.x, POS.entrySpill.y, POS.entrySpill.size, "rgba(255,200,140,0.55)", 24)}
        initial={{ opacity: 0 }}
        animate={
          phase === "cascade"
            ? { opacity: [0, 0, 0.55, 0.55] }
            : phase === "approach" ? { opacity: 0.65 } : { opacity: 0 }
        }
        transition={
          phase === "cascade"
            ? { duration: 0.80, times: [0, 0.32 / 0.80, 0.60 / 0.80, 1], ease: [0.22, 1, 0.36, 1] }
            : { duration: 0.5, ease: [0.22, 1, 0.36, 1] }
        }
      />

      {/* ── Doorway core ignition — the entry "offers itself." Starts after
            the lamp is up, intensifies through the rest of the cascade and the
            approach. This is what becomes the doorway dilation core in Phase 4. */}
      <motion.div
        style={spot(POS.doorwayCore.x, POS.doorwayCore.y, POS.doorwayCore.size, "rgba(255,220,170,0.75)", 28)}
        initial={{ opacity: 0 }}
        animate={
          phase === "cascade"
            ? { opacity: [0, 0, 0.40, 0.75] }
            : phase === "approach" ? { opacity: 0.95 } : { opacity: 0 }
        }
        transition={
          phase === "cascade"
            ? { duration: 0.80, times: [0, 0.58 / 0.80, 0.70 / 0.80, 1], ease: [0.22, 1, 0.36, 1] }
            : { duration: 0.7, ease: [0.22, 1, 0.36, 1] }
        }
      />
    </div>
  );
}
