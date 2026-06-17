// ALLAL Experience — Operations Center Reactive Layer
//
// Overlays the Operations Center photograph with positioned reactive zones.
// The room is the destination — it must *wake* when the operator arrives and
// *sleep* when the operator leaves.
//
// Phases (Director's Plan §OC):
//   dim      → room at standby: wall display dark, monitors black, ambient
//              window light only
//   waking   → 1300ms activation cascade:
//              0-150ms    wall display scanline sweeps L→R
//              150-300ms  display background gradient ON
//              300-900ms  KPIs populate L→R (80ms stagger)
//              450-800ms  desk monitors wake in 3 waves
//              700-1100ms cyan accent lighting lifts 60%→100%
//              900-1100ms a single floor pulse — all systems online
//              1100-1300ms hold (room is awake, waiting for command)
//   active   → full brightness, all systems on; resting micro-life runs
//   resting  → operator is working: sparse, infrequent life cycles
//              wall display single-pixel KPI pulse every 12-18s
//              random desk monitor flicker every 25-40s
//              window light slow drift 90s loop
//   sleeping → 1100ms reverse cascade for logout
//              monitors sleep R→L, lighting cools, KPIs fade R→L

import { motion } from "framer-motion";

export type OCPhase = "dim" | "waking" | "active" | "resting" | "sleeping";

interface Props {
  phase: OCPhase;
}

/* Hotspot positions are % relative to the OC photo bounds. Tuned to the
   production interior photo (public/scenes/operations_center.png). */
const POS = {
  // wall display sections — the giant horizontal screen at top
  wallScan:     { x: 50, y: 28, w: 70, h: 32 },  // scanline sweep band
  wallBg:       { x: 50, y: 28, w: 68, h: 30 },  // background activation glow

  // wall-display KPI activation points (L→R stagger)
  kpi1: { x: 22, y: 22, size: 9 },   // top-left "FLEET TRACKING"
  kpi2: { x: 22, y: 30, size: 9 },   // "TOTAL ORDERS"
  kpi3: { x: 22, y: 38, size: 9 },   // "DELIVERY %"
  kpi4: { x: 50, y: 32, size: 18 },  // central map glow
  kpi5: { x: 76, y: 22, size: 8 },   // "ALERTS"
  kpi6: { x: 76, y: 32, size: 8 },   // "TOP ROUTES"

  // desk-monitor banks (wave-sequenced wake)
  centralDesk: { x: 50, y: 78, size: 32 },
  leftBank:    { x: 18, y: 64, size: 22 },
  rightBank:   { x: 82, y: 64, size: 22 },

  // ambient lighting + windows
  cyanCeiling: { x: 50, y: 10, w: 96, h: 18 },
  windowL:     { x:  6, y: 20, size: 16 },
  windowR:     { x: 94, y: 20, size: 16 },
} as const;

function spot(x: number, y: number, size: number, color: string, blur = 14) {
  return {
    position: "absolute" as const,
    left: `${x}%`,
    top:  `${y}%`,
    width: `${size}%`,
    aspectRatio: "1 / 1",
    transform: "translate(-50%, -50%)",
    background: `radial-gradient(circle, ${color} 0%, transparent 70%)`,
    mixBlendMode: "screen" as const,
    filter: `blur(${blur}px)`,
    pointerEvents: "none" as const,
    willChange: "opacity, transform",
  };
}

function band(x: number, y: number, w: number, h: number, color: string, blur = 18) {
  return {
    position: "absolute" as const,
    left: `${x}%`, top: `${y}%`,
    width: `${w}%`, height: `${h}%`,
    transform: "translate(-50%, -50%)",
    background: color,
    mixBlendMode: "screen" as const,
    filter: `blur(${blur}px)`,
    pointerEvents: "none" as const,
    willChange: "opacity, transform",
  };
}

export function OCReactiveLayer({ phase }: Props) {
  // ── Cascade timing within phase "waking" (1300ms total) ──
  // We express timings as fractions of duration 1.3s for framer-motion `times`.
  const T = 1.3;

  // Activation values per phase
  const wallAlpha = phase === "waking" || phase === "active" || phase === "resting" ? 1 : 0;
  const kpiAlpha  = phase === "active" || phase === "resting" ? 1 : 0;

  // KPI population stagger — each KPI's keyframe completes at its own slot.
  // Phase "waking": fade in at delay; Phase "sleeping": fade out at reverse delay.
  const SMOOTH = [0.22, 1, 0.36, 1] as const;
  const SHARP  = [0.4,  0, 0.2,  1] as const;

  const kpiAnim = (slot: number): any => {
    const start = 0.30 + slot * 0.08;
    if (phase === "waking") {
      return {
        animate: { opacity: [0, 0, 1] },
        transition: { duration: T, times: [0, start / T, Math.min((start + 0.18) / T, 1)], ease: SMOOTH as any },
      };
    }
    if (phase === "sleeping") {
      const reverseStart = (5 - slot) * 0.08;
      return {
        animate: { opacity: [1, 0] },
        transition: { duration: 1.1, delay: reverseStart, ease: SHARP as any },
      };
    }
    return { animate: { opacity: kpiAlpha }, transition: { duration: 0.45 } };
  };

  const deskAnim = (delay: number): any => {
    if (phase === "waking") {
      const start = delay / 1000;
      return {
        animate: { opacity: [0, 0, 1] },
        transition: { duration: T, times: [0, start / T, Math.min((start + 0.18) / T, 1)], ease: SMOOTH as any },
      };
    }
    if (phase === "sleeping") {
      const reverseDelay = { 450: 0.45, 550: 0.30, 650: 0.15 }[delay] ?? 0;
      return {
        animate: { opacity: [1, 0] },
        transition: { duration: 0.45, delay: reverseDelay, ease: SHARP as any },
      };
    }
    return {
      animate: { opacity: (phase === "active" || phase === "resting") ? 1 : 0 },
      transition: { duration: 0.4 },
    };
  };

  return (
    <div aria-hidden style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>

      {/* ── Wall display background — comes on first */}
      <motion.div
        style={band(POS.wallBg.x, POS.wallBg.y, POS.wallBg.w, POS.wallBg.h, "radial-gradient(ellipse, rgba(14,180,200,0.40) 0%, transparent 70%)", 22)}
        initial={{ opacity: 0 }}
        animate={
          phase === "waking"
            ? { opacity: [0, 0, 1, 1] }
            : { opacity: wallAlpha }
        }
        transition={
          phase === "waking"
            ? { duration: T, times: [0, 0.15 / T, 0.30 / T, 1], ease: [0.22, 1, 0.36, 1] }
            : phase === "sleeping"
              ? { duration: 1.1, delay: 0.55, ease: [0.4, 0, 0.2, 1] }
              : { duration: 0.6, ease: [0.22, 1, 0.36, 1] }
        }
      />

      {/* ── Scanline sweep — only during waking, 0-150ms */}
      {phase === "waking" && (
        <motion.div
          style={{
            position: "absolute",
            left: "15%", top: "12%",
            width: "70%", height: "0.8%",
            background: "linear-gradient(90deg, transparent, rgba(180,250,255,0.9), transparent)",
            mixBlendMode: "screen",
            filter: "blur(2px)",
            pointerEvents: "none",
          }}
          initial={{ opacity: 0, scaleX: 0 }}
          animate={{ opacity: [0, 1, 1, 0], scaleX: [0, 1, 1, 1] }}
          transition={{ duration: 0.5, times: [0, 0.1, 0.5, 1], ease: "easeOut" }}
        />
      )}

      {/* ── Cyan accent ceiling lighting — lifts 60% → 100% during waking */}
      <motion.div
        style={band(POS.cyanCeiling.x, POS.cyanCeiling.y, POS.cyanCeiling.w, POS.cyanCeiling.h, "linear-gradient(180deg, rgba(14,180,200,0.30) 0%, transparent 100%)", 28)}
        initial={{ opacity: 0.30 }}
        animate={
          phase === "waking"
            ? { opacity: [0.30, 0.30, 0.85, 1.0] }
            : phase === "sleeping" ? { opacity: 0.40 }
            : phase === "active" || phase === "resting" ? { opacity: 0.85 }
            : { opacity: 0.30 }
        }
        transition={
          phase === "waking"
            ? { duration: T, times: [0, 0.70 / T, 1.0 / T, 1], ease: [0.22, 1, 0.36, 1] }
            : { duration: 0.8, ease: [0.22, 1, 0.36, 1] }
        }
      />

      {/* ── KPI activation points on the wall display ── */}
      <motion.div style={spot(POS.kpi1.x, POS.kpi1.y, POS.kpi1.size, "rgba(160,240,255,0.95)", 10)} initial={{ opacity: 0 }} {...kpiAnim(0)} />
      <motion.div style={spot(POS.kpi2.x, POS.kpi2.y, POS.kpi2.size, "rgba(160,240,255,0.90)", 10)} initial={{ opacity: 0 }} {...kpiAnim(1)} />
      <motion.div style={spot(POS.kpi3.x, POS.kpi3.y, POS.kpi3.size, "rgba(160,240,255,0.90)", 10)} initial={{ opacity: 0 }} {...kpiAnim(2)} />
      <motion.div style={spot(POS.kpi4.x, POS.kpi4.y, POS.kpi4.size, "rgba(120,220,250,0.85)", 14)} initial={{ opacity: 0 }} {...kpiAnim(3)} />
      <motion.div style={spot(POS.kpi5.x, POS.kpi5.y, POS.kpi5.size, "rgba(160,240,255,0.90)", 10)} initial={{ opacity: 0 }} {...kpiAnim(4)} />
      <motion.div style={spot(POS.kpi6.x, POS.kpi6.y, POS.kpi6.size, "rgba(160,240,255,0.90)", 10)} initial={{ opacity: 0 }} {...kpiAnim(5)} />

      {/* ── Desk monitor banks — wave-sequenced */}
      <motion.div style={spot(POS.centralDesk.x, POS.centralDesk.y, POS.centralDesk.size, "rgba(140,220,250,0.70)", 18)} initial={{ opacity: 0 }} {...deskAnim(450)} />
      <motion.div style={spot(POS.leftBank.x,    POS.leftBank.y,    POS.leftBank.size,    "rgba(140,220,250,0.65)", 16)} initial={{ opacity: 0 }} {...deskAnim(550)} />
      <motion.div style={spot(POS.rightBank.x,   POS.rightBank.y,   POS.rightBank.size,   "rgba(140,220,250,0.65)", 16)} initial={{ opacity: 0 }} {...deskAnim(650)} />

      {/* ── Floor pulse — single ripple at 900ms confirming "all systems online" */}
      {phase === "waking" && (
        <motion.div
          style={{
            position: "absolute",
            left: "50%", top: "85%",
            width: "60%", height: "8%",
            transform: "translate(-50%, -50%)",
            background: "radial-gradient(ellipse, rgba(14,180,200,0.55), transparent 70%)",
            mixBlendMode: "screen",
            filter: "blur(12px)",
            pointerEvents: "none",
          }}
          initial={{ opacity: 0, scale: 0.4 }}
          animate={{ opacity: [0, 0, 0.9, 0], scale: [0.4, 0.4, 1.0, 1.4] }}
          transition={{ duration: T, times: [0, 0.65 / T, 0.85 / T, 1], ease: [0.22, 1, 0.36, 1] }}
        />
      )}

      {/* ── Window light drift — only during resting state, 90s loop */}
      {phase === "resting" && (
        <>
          <motion.div
            style={spot(POS.windowL.x, POS.windowL.y, POS.windowL.size, "rgba(180,220,250,0.45)", 18)}
            animate={{ opacity: [0.35, 0.50, 0.32, 0.45, 0.35] }}
            transition={{ duration: 90, repeat: Infinity, ease: "easeInOut" }}
          />
          <motion.div
            style={spot(POS.windowR.x, POS.windowR.y, POS.windowR.size, "rgba(180,220,250,0.45)", 18)}
            animate={{ opacity: [0.35, 0.48, 0.38, 0.42, 0.35] }}
            transition={{ duration: 90, repeat: Infinity, ease: "easeInOut", delay: 22 }}
          />
        </>
      )}

      {/* ── Resting micro-life: a single KPI region pulses every 12-18s — looks
            like real data updating on the wall display. */}
      {phase === "resting" && (
        <>
          <motion.div
            style={spot(POS.kpi2.x, POS.kpi2.y, POS.kpi2.size * 0.8, "rgba(180,250,255,0.85)", 8)}
            animate={{ opacity: [0, 0, 0.7, 0] }}
            transition={{ duration: 15, times: [0, 0.93, 0.95, 1], repeat: Infinity, ease: "easeOut" }}
          />
          <motion.div
            style={spot(POS.kpi5.x, POS.kpi5.y, POS.kpi5.size * 0.8, "rgba(180,250,255,0.85)", 8)}
            animate={{ opacity: [0, 0, 0.7, 0] }}
            transition={{ duration: 18, times: [0, 0.93, 0.95, 1], repeat: Infinity, delay: 9, ease: "easeOut" }}
          />

          {/* random desk monitor flicker every 25-40s — a teammate is working remotely */}
          <motion.div
            style={spot(POS.leftBank.x, POS.leftBank.y, POS.leftBank.size * 0.6, "rgba(140,220,250,0.55)", 12)}
            animate={{ opacity: [0.65, 0.65, 0.95, 0.65] }}
            transition={{ duration: 32, times: [0, 0.92, 0.94, 1], repeat: Infinity, ease: "easeOut" }}
          />
          <motion.div
            style={spot(POS.rightBank.x, POS.rightBank.y, POS.rightBank.size * 0.6, "rgba(140,220,250,0.55)", 12)}
            animate={{ opacity: [0.65, 0.65, 0.95, 0.65] }}
            transition={{ duration: 38, times: [0, 0.92, 0.94, 1], repeat: Infinity, delay: 14, ease: "easeOut" }}
          />
        </>
      )}
    </div>
  );
}
