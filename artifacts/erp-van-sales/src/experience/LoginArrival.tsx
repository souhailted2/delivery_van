// ALLAL Experience — Login → Dashboard Arrival (Video-First, decoupled).
//
// The video IS the experience and it starts the INSTANT the user clicks —
// authentication runs in parallel and the clip hides its latency.
//
//   • startArrival() is called ON CLICK, so this overlay mounts immediately and
//     adopts the pre-decoded warmer video (arrival-asset) → playback begins on
//     the next frame. No frame-0 freeze, no "click → wait → motion".
//   • The login backdrop is this video's FRAME 0, so the overlay (also frame 0)
//     mounting over it is seamless; only the receding login card disappears.
//   • Reveal is gated on AUTH SUCCESS, not on the video alone:
//       - auth success + video ended → reveal: the dashboard cards rise AS the
//         overlay cross-fades out (the room assembles, not appears pre-built).
//       - auth still pending at video end → HOLD on the final frame until it
//         resolves.
//       - auth error (any time) → abort: fade back to the login screen (which
//         is still underneath — we never navigated).
//   • The dashboard backdrop is this video's LAST frame, so the success fade is
//     between identical frames — seamless.

import { motion, useReducedMotion } from "framer-motion";
import { useCallback, useEffect, useRef, useState } from "react";
import { adoptArrivalVideo, parkArrivalVideo, ARRIVAL_POSTER_START } from "./arrival-asset";
import type { AuthOutcome } from "./ArrivalProvider";

const FADE_IN = 0.18;  // s — overlay rises as the login card recedes (frame-0 == backdrop, so seamless)
const FADE_OUT = 0.55; // s — overlay cross-fades to the dashboard / back to login

interface Props {
  authOutcome: AuthOutcome;
  /** Fires when the Operations Center is revealed — dashboard rises now. */
  onReveal: () => void;
  /** Fires when the overlay can be unmounted. */
  onComplete: () => void;
}

type Stage = "playing" | "revealing" | "aborting" | "done";

export function LoginArrival({ authOutcome, onReveal, onComplete }: Props) {
  const reduce = !!useReducedMotion();
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [stage, setStage] = useState<Stage>("playing");

  const authRef = useRef<AuthOutcome>(authOutcome);
  const endedRef = useRef(false);
  const finalizedRef = useRef(false);

  const finishAfter = useCallback((ms: number) => {
    window.setTimeout(() => { setStage("done"); onComplete(); }, ms);
  }, [onComplete]);

  const tryFinalize = useCallback(() => {
    if (finalizedRef.current) return;
    const auth = authRef.current;
    if (auth === "error") {
      finalizedRef.current = true;
      try { videoRef.current?.pause(); } catch { /* noop */ }
      setStage("aborting");          // fade out → reveal the login screen beneath
      finishAfter(FADE_OUT * 1000);
      return;
    }
    if (auth === "success" && endedRef.current) {
      finalizedRef.current = true;
      onReveal();                    // cards rise as the overlay fades
      setStage("revealing");
      finishAfter(FADE_OUT * 1000);
      return;
    }
    // pending, or success-but-not-yet-ended → hold on the current/final frame
  }, [onReveal, finishAfter]);

  // Keep the auth ref fresh and re-attempt finalize whenever the outcome changes.
  useEffect(() => { authRef.current = authOutcome; tryFinalize(); }, [authOutcome, tryFinalize]);

  // ── REDUCED MOTION: no video, gate purely on auth ─────────────────────────
  useEffect(() => {
    if (!reduce) return;
    endedRef.current = true;
    tryFinalize();
  }, [reduce, tryFinalize]);

  // ── VIDEO PATH: adopt the pre-decoded warmer and play instantly ───────────
  useEffect(() => {
    if (reduce) return;
    const container = containerRef.current;
    if (!container) return;
    const v = adoptArrivalVideo(container, "cover");
    videoRef.current = v;
    if (!v) { endedRef.current = true; tryFinalize(); return; }

    const onEnded = () => { endedRef.current = true; tryFinalize(); };
    const onError = () => { endedRef.current = true; tryFinalize(); };
    v.addEventListener("ended", onEnded);
    v.addEventListener("error", onError);

    try { v.currentTime = 0; } catch { /* noop */ }
    v.playbackRate = 1;
    const p = v.play();
    if (p && p.catch) p.catch(() => { /* poster holds; ended/auth still drive finalize */ });

    return () => {
      v.removeEventListener("ended", onEnded);
      v.removeEventListener("error", onError);
      parkArrivalVideo();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduce]);

  return (
    <motion.div
      aria-hidden
      ref={containerRef}
      initial={{ opacity: 0 }}
      animate={{ opacity: stage === "playing" ? 1 : 0 }}
      transition={{ duration: stage === "playing" ? FADE_IN : FADE_OUT, ease: [0.4, 0, 0.2, 1] }}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 100,
        overflow: "hidden",
        // Start poster as the base → never a black frame before/around the video.
        background: `#05080f url(${ARRIVAL_POSTER_START}) center / cover no-repeat`,
        willChange: "opacity",
        pointerEvents: stage === "done" ? "none" : "auto",
      }}
    />
  );
}
