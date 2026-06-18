// ALLAL Experience — Logout (Video-First, reverse, decoupled).
//
// Departure is the arrival played backwards, and it starts the INSTANT the user
// clicks — the logout request runs in parallel.
//
//   • CommandBar calls startLogout() ON CLICK (this mounts immediately and
//     adopts the pre-decoded warmer) AND navigates to /connexion immediately,
//     so the login exterior (= this video's FRAME 0) is prepared UNDERNEATH the
//     overlay while the reverse plays. The overlay therefore fades to the login
//     screen — NEVER back to the Operations Center.
//   • The overlay opens on the video's LAST frame (= the dashboard backdrop it
//     covers) → seamless fade-in. It reverses end → 0 (OC → threshold →
//     exterior), then fades to the prepared login screen.
//
// Reverse playback: HTML5 has no reliable negative playbackRate, so we drive
// currentTime backwards via rAF on the (warm, buffered) clip, targeting a
// wall-clock progress so it always finishes in REVERSE_DUR.

import { motion, useReducedMotion } from "framer-motion";
import { useCallback, useEffect, useRef, useState } from "react";
import { adoptArrivalVideo, parkArrivalVideo, ARRIVAL_POSTER_END } from "./arrival-asset";

const REVERSE_DUR = 3.2;   // s — wall-clock duration of the reverse move
const FADE_OUT = 0.5;      // s — overlay fades to the prepared login screen
const STALL_GUARD = 6000;  // ms — last-resort finish if reverse never starts

interface Props {
  /** Invoked when the overlay can be unmounted. */
  onComplete: () => void;
}

type Stage = "reversing" | "leaving" | "done";

export function LogoutSequence({ onComplete }: Props) {
  const reduce = !!useReducedMotion();
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [stage, setStage] = useState<Stage>("reversing");
  const doneRef = useRef(false);
  const rafRef = useRef(0);

  const finish = useCallback(() => {
    if (doneRef.current) return;
    doneRef.current = true;
    setStage("leaving");
    window.setTimeout(() => { setStage("done"); onComplete(); }, FADE_OUT * 1000);
  }, [onComplete]);

  // ── REDUCED MOTION: brief hold then finish ────────────────────────────────
  useEffect(() => {
    if (!reduce) return;
    const t = window.setTimeout(finish, 300);
    return () => window.clearTimeout(t);
  }, [reduce, finish]);

  // ── REVERSE PATH: adopt the pre-decoded warmer, drive currentTime backwards ─
  useEffect(() => {
    if (reduce) return;
    const container = containerRef.current;
    if (!container) return;
    const v = adoptArrivalVideo(container, "cover");
    videoRef.current = v;
    if (!v) { finish(); return; }
    let cancelled = false;

    const start = () => {
      if (cancelled) return;
      const dur = v.duration || 4.9;
      try { v.pause(); } catch { /* noop */ }
      try { v.currentTime = Math.max(0, dur - 0.05); } catch { /* noop */ }
      let t0 = 0;
      const step = (ts: number) => {
        if (cancelled) return;
        if (!t0) t0 = ts;
        const p = Math.min(1, (ts - t0) / (REVERSE_DUR * 1000));
        if (!v.seeking) { try { v.currentTime = Math.max(0, dur * (1 - p)); } catch { /* noop */ } }
        if (p >= 1) { finish(); return; }
        rafRef.current = requestAnimationFrame(step);
      };
      rafRef.current = requestAnimationFrame(step);
    };

    if (v.readyState >= 1) start();
    else v.addEventListener("loadedmetadata", start, { once: true });

    const guard = window.setTimeout(finish, STALL_GUARD);

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafRef.current);
      window.clearTimeout(guard);
      v.removeEventListener("loadedmetadata", start);
      parkArrivalVideo();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduce]);

  return (
    <motion.div
      aria-hidden
      ref={containerRef}
      // OPAQUE FROM THE FIRST PAINT — no fade-in. The overlay opens on the
      // video's LAST frame (= the dashboard backdrop the user is already
      // looking at), so rendering it fully opaque on mount is visually
      // seamless AND instantly hides the synchronous /connexion swap happening
      // underneath (CommandBar navigates on click). This kills the exterior +
      // login-card flash that a fade-in used to reveal during its 0→1 ramp.
      // It only ever animates OUT — fading to the prepared login screen.
      initial={{ opacity: 1 }}
      animate={{ opacity: stage === "reversing" ? 1 : 0 }}
      transition={{ duration: FADE_OUT, ease: [0.4, 0, 0.2, 1] }}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 100,
        overflow: "hidden",
        // End poster (= video last frame = dashboard backdrop) → seamless, no black.
        background: `#05080f url(${ARRIVAL_POSTER_END}) center / cover no-repeat`,
        willChange: "opacity",
      }}
    />
  );
}
