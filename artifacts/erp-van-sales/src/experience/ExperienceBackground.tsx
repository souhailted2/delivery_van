// ALLAL Experience — the single, static environment layer.
//
// ONE Operations Center. This layer just renders the canonical environment
// behind the whole app and never animates:
//   • authenticated routes → the Operations Center (video's last frame)
//   • /connexion           → the HQ exterior (video's first frame)
//
// There is no scene model, no per-route swap animation, no "breath", no
// AnimatePresence. The dashboard vs. work-page "exposure" (OC visible vs.
// dimmed) is handled by the SHELL's own background alpha in Layout.tsx — a
// single CSS colour transition where it belongs. The login/logout cinematic
// is owned by the Arrival overlay. This file does zero JS animation.

import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Volume2, VolumeX } from "lucide-react";
import { ambient } from "./ambient-audio";
import { ARRIVAL_POSTER_START, ARRIVAL_POSTER_END } from "./arrival-asset";

// Film grain — shared across the app for one filmic look.
const GRAIN =
  "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='140' height='140'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/></filter><rect width='100%' height='100%' filter='url(%23n)' opacity='0.5'/></svg>\")";

const COVER = { position: "absolute", inset: 0, width: "100%", height: "100%" } as const;

export function ExperienceBackground() {
  const [location] = useLocation();
  const isLogin = location.replace(/\/+$/, "") === "/connexion";
  const poster = isLogin ? ARRIVAL_POSTER_START : ARRIVAL_POSTER_END;

  const [audioOn, setAudioOn] = useState(false);

  useEffect(() => {
    ambient.setScene(isLogin ? "login" : "dashboard");
  }, [isLogin]);

  return (
    <>
      {/* environment layer — fixed behind everything, never animates */}
      <div aria-hidden style={{ position: "fixed", inset: 0, zIndex: 0, pointerEvents: "none", overflow: "hidden", background: "#05080f" }}>
        {/* the canonical photograph */}
        <div style={{ ...COVER, backgroundImage: `url(${poster})`, backgroundSize: "cover", backgroundPosition: "center" }} />

        {/* constant grade accents — teal radial cast + soft bottom anchor */}
        <div style={{ ...COVER, background: "radial-gradient(58% 48% at 50% 36%, rgba(14,154,167,0.10), transparent 72%)" }} />
        <div style={{ ...COVER, background: "linear-gradient(180deg, transparent 68%, rgba(5,8,15,0.32))" }} />

        {/* heading-protection top gradient — keeps page titles legible over the
            bright wall-display area. Strengthened: a deeper top anchor that
            fades more gradually so the hero heading band has real contrast
            behind it (the previous 0.55→0/34% ramp was too weak for the bright
            display zone where the baked-in wall text lives). */}
        <div style={{ ...COVER, background: "linear-gradient(180deg, rgba(5,8,15,0.78) 0%, rgba(5,8,15,0.34) 18%, rgba(5,8,15,0) 44%)" }} />

        {/* shared filmic top-band + grain */}
        <div style={{ ...COVER, background: "linear-gradient(180deg, #0E9AA714 0%, transparent 22%)" }} />
        <div style={{ ...COVER, backgroundImage: GRAIN, backgroundSize: "140px 140px", opacity: 0.05, mixBlendMode: "overlay" }} />
      </div>

      {/* ambient sound toggle — subtle, muted by default */}
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
