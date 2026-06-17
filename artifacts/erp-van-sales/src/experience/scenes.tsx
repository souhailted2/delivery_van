// ALLAL Experience — per-page cinematic backdrops.
//
// DIRECTION (current, post-cleanup): each page shows a STATIC cinematic image.
// Motion happens ONLY during page/login transitions (handled by the engine).
// No persistent 3D world, no continuously-animated environments.
//
// These are TEMPORARY static placeholders until photoreal stills/clips are
// produced. Each scene can carry a final `image` (static cinematic still) or
// `video` (cinematic loop) — the engine renders whichever is set, else this
// static placeholder. Dropping in final art is one line per scene; no rework.

import type { ReactElement } from "react";
import type { SceneId } from "./ambient-audio";

export interface SceneDef {
  id: SceneId;
  order: number; // position in the narrative journey (for directional transitions)
  label: string;
  /** Final static cinematic still (preferred — the current direction). */
  image?: string;
  /** Optional cinematic loop, if a scene ever uses one. */
  video?: string;
  /** Static placeholder backdrop, used until final art is provided. */
  Render: () => ReactElement;
}

const TEAL = "#0E9AA7";

// One static, on-brand placeholder backdrop (no animation).
function StaticScene({ bg, accent = TEAL, glow = "50% 32%" }: { bg: string; accent?: string; glow?: string }) {
  return (
    <div style={{ position: "absolute", inset: 0, background: bg }}>
      <div style={{ position: "absolute", inset: 0, background: `radial-gradient(60% 45% at ${glow}, ${accent}1f, transparent 70%)` }} />
      <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, transparent 55%, #05080f)" }} />
    </div>
  );
}

export const SCENES: SceneDef[] = [
  { id: "login", order: 0, label: "ALLAL HQ", image: `${import.meta.env.BASE_URL}${encodeURIComponent("ChatGPT Image 16 يونيو 2026، 07_24_24 م.png")}`, Render: () => <StaticScene bg="radial-gradient(120% 90% at 50% 12%, #16243a 0%, #0a1120 45%, #05080f 100%)" glow="50% 24%" /> },
  { id: "dashboard", order: 1, label: "Operations Center", image: `${import.meta.env.BASE_URL}scenes/operations_center.png`, Render: () => <StaticScene bg="radial-gradient(120% 90% at 50% 38%, #0e1c2a 0%, #080f1a 52%, #05080f 100%)" /> },
  { id: "warehouse", order: 2, label: "Warehouse", Render: () => <StaticScene bg="radial-gradient(120% 100% at 50% 32%, #14202c 0%, #0a131d 55%, #05080f 100%)" accent="#d8a21e" /> },
  { id: "inspection", order: 3, label: "Inspection", Render: () => <StaticScene bg="radial-gradient(120% 90% at 50% 32%, #101b27 0%, #0a131d 55%, #05080f 100%)" accent="#3fb6c4" /> },
  { id: "dock", order: 4, label: "Dispatch", Render: () => <StaticScene bg="radial-gradient(120% 90% at 50% 34%, #101a26 0%, #0a131d 55%, #05080f 100%)" accent="#5a86c4" /> },
  { id: "analytics", order: 5, label: "Intelligence", Render: () => <StaticScene bg="radial-gradient(120% 90% at 50% 36%, #0e1b27 0%, #0a131d 55%, #05080f 100%)" accent="#2f9fb0" /> },
  { id: "office", order: 6, label: "Executive", Render: () => <StaticScene bg="radial-gradient(120% 90% at 50% 34%, #131a24 0%, #0a131d 55%, #05080f 100%)" accent="#9a8a5a" /> },
  { id: "generic", order: 7, label: "ALLAL", Render: () => <StaticScene bg="radial-gradient(120% 90% at 50% 32%, #101b27 0%, #0a131d 55%, #05080f 100%)" /> },
];

export function routeToScene(path: string): SceneDef {
  const p = path.replace(/\/+$/, "") || "/";
  const pick = (id: SceneId) => SCENES.find((s) => s.id === id)!;
  if (p === "/connexion") return pick("login");
  if (p === "/") return pick("dashboard");
  if (p.startsWith("/produits") || p.startsWith("/categories") || p.startsWith("/achats")) return pick("warehouse");
  if (p.startsWith("/stock")) return pick("inspection");
  if (p.startsWith("/camions")) return pick("dock");
  if (p.startsWith("/rapports") || p.startsWith("/factures") || p.startsWith("/caisse")) return pick("analytics");
  if (p.startsWith("/utilisateurs") || p.startsWith("/clients") || p.startsWith("/fournisseurs") || p.startsWith("/parametres"))
    return pick("office");
  return pick("generic");
}
