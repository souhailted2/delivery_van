// ALLAL Experience — the single-session cinematic layer.
//
// Mounted ONCE above the router; never torn down. The user doesn't "change
// pages" — the camera moves through the ALLAL universe:
//   • route → narrative scene; transitions are DIRECTIONAL along the journey
//   • mixed pacing: slow "through-glass" hero move for Login→Dashboard,
//     snappier directional moves elsewhere; reduced-motion → instant cut
//   • one shared ALLAL grade + grain overlay (no letterbox) for cohesion
//   • per-scene ambient sound, MUTED by default, with a subtle toggle
// The ERP UI is always the hero, composited above this layer.

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { Volume2, VolumeX } from "lucide-react";
import { routeToScene, type SceneDef } from "./scenes";
import { ambient } from "./ambient-audio";
import { ease as cinEase, dur as cinDur } from "./cinematic";
import { useArrival } from "./ArrivalProvider";
import { HQReactiveLayer, type HQPhase } from "./HQReactiveLayer";
import { OCReactiveLayer } from "./OCReactiveLayer";

const COVER = { position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" } as const;

// Renders the scene's final still (preferred) / loop / static placeholder.
// If a final image fails to load (not yet dropped in), it falls back gracefully.
function SceneLayer({ scene }: { scene: SceneDef }) {
  const [failed, setFailed] = useState(false);
  if (scene.image && !failed) return <img src={scene.image} alt="" onError={() => setFailed(true)} style={COVER} />;
  if (scene.video) return <video src={scene.video} autoPlay loop muted playsInline preload="auto" style={COVER} />;
  const R = scene.Render;
  return <R />;
}

// film grain (static, cheap) — shared across every scene for one filmic look
const GRAIN =
  "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='140' height='140'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/></filter><rect width='100%' height='100%' filter='url(%23n)' opacity='0.5'/></svg>\")";

interface Meta {
  dir: number;
  hero: boolean;
  reduced: boolean;
}

const variants = {
  initial: (m: Meta) =>
    m.reduced
      ? { opacity: 0, filter: "blur(0px) brightness(1)" }
      : m.hero
        ? { opacity: 0, scale: 1.18, x: "0%", filter: "blur(12px) brightness(1.9)" }
        : { opacity: 0, scale: 1.05, x: `${m.dir * 5}%`, filter: "blur(0px) brightness(1)" },
  animate: { opacity: 1, scale: 1, x: "0%", filter: "blur(0px) brightness(1)" },
  exit: (m: Meta) =>
    m.reduced
      ? { opacity: 0, filter: "blur(0px) brightness(1)" }
      : m.hero
        ? { opacity: 0, scale: 1.35, x: "0%", filter: "blur(10px) brightness(1.4)" }
        : { opacity: 0, scale: 1.02, x: `${-m.dir * 4}%`, filter: "blur(0px) brightness(1)" },
};

export function ExperienceBackground() {
  const [location] = useLocation();
  const scene = routeToScene(location);
  const reduced = useReducedMotion();
  const prevRef = useRef(scene);
  const [audioOn, setAudioOn] = useState(false);
  const { clickPhase } = useArrival();

  const dir = Math.sign(scene.order - prevRef.current.order) || 1;
  const hero = prevRef.current.id === "login" && scene.id === "dashboard";
  const meta: Meta = { dir, hero, reduced: !!reduced };

  // Map global click cascade phase → HQReactiveLayer phase.
  // 'idle' → "standby" (idle micro-life)
  // 'charging' → "charge" (notice level)
  // 'cascading' → "cascade" (full reaction choreography)
  const hqPhase: HQPhase =
    clickPhase === "cascading" ? "cascade"
    : clickPhase === "charging" ? "charge"
    : "standby";

  useEffect(() => {
    ambient.setScene(scene.id);
    prevRef.current = scene;
  }, [scene.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Tokens shared with AppTransition so background + UI move as one camera.
  const duration = reduced ? cinDur.reduced : hero ? cinDur.hero : cinDur.base;
  const easing = hero ? cinEase.sharp : cinEase.smooth;
  const isLogin = scene.id === "login";
  const isDashboard = scene.id === "dashboard";

  return (
    <>
      {/* scene layer */}
      <div aria-hidden style={{ position: "fixed", inset: 0, zIndex: 0, pointerEvents: "none", overflow: "hidden", background: "#05080f" }}>
        <AnimatePresence custom={meta} initial={false}>
          <motion.div
            key={scene.id}
            custom={meta}
            variants={variants}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={{ duration, ease: easing as any }}
            style={{ position: "absolute", inset: 0, willChange: "transform, opacity, filter" }}
          >
            <SceneLayer scene={scene} />
            {/* ── Reactive overlays — make the photograph respond to the user.
                  Login HQ: idle micro-life + click cascade.
                  Dashboard OC: resting micro-life (sparse, infrequent events). */}
            {isLogin && <HQReactiveLayer phase={hqPhase} />}
            {isDashboard && <OCReactiveLayer phase="resting" />}
          </motion.div>
        </AnimatePresence>

        {/* ── CANONICAL VISUAL WORLD ────────────────────────────────────────
            The photographs ARE the environment. The user must travel through
            one continuous world — Login resting / cinematic push-in / Dashboard
            resting all render the same HQ and the same Operations Center at
            the same natural brightness.

            Readability is solved LOCALLY at the card surface (see Connexion.tsx
            and the dashboard glass cards) — NEVER by darkening, blurring or
            vignetting the environment.

            For photoreal scenes (login, dashboard) we ONLY apply the same
            light cinematic accents the LoginArrival storyboard uses on the
            interior beat (teal radial cast + soft bottom anchor), so the
            grade stays continuous from cinematic to resting state.            */}
        {(isLogin || isDashboard) ? (
          <>
            {/* teal radial cast — matches LoginArrival.tsx:147 (interior beat) */}
            <div style={{ position: "absolute", inset: 0, background: "radial-gradient(58% 48% at 50% 36%, rgba(14,154,167,0.10), transparent 72%)", pointerEvents: "none" }} />
            {/* soft bottom anchor — matches LoginArrival.tsx:148 (safe area only) */}
            <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, transparent 68%, rgba(5,8,15,0.32))", pointerEvents: "none" }} />
          </>
        ) : (
          <>
            {/* non-photoreal placeholder scenes keep the edge vignette + scrim
                for legibility — they're abstract gradients, not photographs. */}
            <div style={{ position: "absolute", inset: 0, background: "radial-gradient(130% 130% at 50% 35%, transparent 35%, #05080fcc 100%)" }} />
            <div style={{ position: "absolute", inset: 0, background: "rgba(5,8,15,0.34)" }} />
          </>
        )}

        {/* shared filmic top-band + grain — one cohesive look across all scenes */}
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, #0E9AA714 0%, transparent 22%)" }} />
        <div style={{ position: "absolute", inset: 0, backgroundImage: GRAIN, backgroundSize: "140px 140px", opacity: 0.05, mixBlendMode: "overlay" }} />
      </div>

      {/* ambient sound toggle — subtle, premium, muted by default */}
      <button
        type="button"
        onClick={() => setAudioOn(ambient.toggle())}
        aria-label={audioOn ? "Couper l'ambiance sonore" : "Activer l'ambiance sonore"}
        title={audioOn ? "Ambiance sonore activée" : "Ambiance sonore (muette)"}
        style={{
          position: "fixed",
          bottom: 16,
          insetInlineStart: 16,
          zIndex: 60,
          width: 38,
          height: 38,
          borderRadius: 999,
          display: "grid",
          placeItems: "center",
          color: audioOn ? "#0E9AA7" : "#7c8794",
          background: "rgba(10,14,22,0.6)",
          border: "1px solid rgba(255,255,255,0.08)",
          backdropFilter: "blur(8px)",
          cursor: "pointer",
          opacity: 0.55,
          transition: "opacity 0.2s, color 0.2s",
        }}
        onMouseEnter={(e) => (e.currentTarget.style.opacity = "1")}
        onMouseLeave={(e) => (e.currentTarget.style.opacity = "0.55")}
      >
        {audioOn ? <Volume2 size={17} /> : <VolumeX size={17} />}
      </button>
    </>
  );
}
