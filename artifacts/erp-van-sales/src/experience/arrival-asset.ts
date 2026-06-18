// ALLAL Experience — the canonical arrival video asset.
//
// VIDEO-FIRST ARCHITECTURE: one video is the entire arrival/departure
// experience. There are no separate HQ / Operations-Center stills bridging
// into or out of it. The only stills used are the video's OWN first and last
// frames (exported below as posters): they are the login backdrop and the
// dashboard backdrop, so every handoff is between identical frames and is
// therefore seamless.
//
//   login backdrop      = arrival video FRAME 0   (POSTER_START)
//   arrival (forward)   = the video, 0 → end
//   dashboard backdrop  = arrival video LAST FRAME (POSTER_END)
//   logout (reverse)    = the video, end → 0
//
// Source: 2904×2176 (4:3), ~4.92s, 24fps, H.264. Large (~30MB), so it MUST be
// warmed before the user clicks — see preloadArrivalVideo().
//
// SINGLE SHARED ELEMENT: rather than mounting a fresh <video> for each
// cinematic (which incurs a ~0.5s decode/canplay delay → a visible frozen
// frame-0), we keep ONE persistent, pre-decoded <video> (the "warmer") and
// REPARENT it into the active overlay on demand (adoptArrivalVideo). Because
// the element is already decoded and buffered, playback begins on the very
// next frame — "click → motion begins". On overlay teardown we park it back
// off-DOM (parkArrivalVideo) so it stays warm for the next cinematic.

const B = import.meta.env.BASE_URL;

export const ARRIVAL_VIDEO        = `${B}scenes/arrival.mp4`;
export const ARRIVAL_POSTER_START = `${B}scenes/arrival-poster-start.jpg`;
export const ARRIVAL_POSTER_END   = `${B}scenes/arrival-poster-end.jpg`;

const PARKED_STYLE =
  "position:absolute;width:1px;height:1px;opacity:0;pointer-events:none;left:-9999px;top:-9999px";

let warmer: HTMLVideoElement | null = null;

function park(v: HTMLVideoElement): void {
  v.style.cssText = PARKED_STYLE;
  if (typeof document !== "undefined" && v.parentElement !== document.body) {
    document.body.appendChild(v);
  }
}

function ensureWarmer(): HTMLVideoElement | null {
  if (typeof document === "undefined") return null;
  if (warmer) return warmer;
  const v = document.createElement("video");
  v.src = ARRIVAL_VIDEO;
  v.muted = true;
  v.preload = "auto";
  v.playsInline = true;
  v.setAttribute("aria-hidden", "true");
  park(v);
  v.load();
  warmer = v;
  return v;
}

/** Idempotent. Begin buffering/decoding the arrival video + posters in the
 *  background so the click triggers motion instantly from cache. */
export function preloadArrivalVideo(): void {
  if (typeof document === "undefined") return;
  [ARRIVAL_POSTER_START, ARRIVAL_POSTER_END].forEach((src) => {
    const img = new Image();
    img.src = src;
  });
  ensureWarmer();
}

/** Reparent the pre-decoded warmer into `container`, styled to fill it.
 *  Returns the live element (already buffered → plays on the next frame). */
export function adoptArrivalVideo(container: HTMLElement, objectFit: "cover" | "contain" = "cover"): HTMLVideoElement | null {
  const v = ensureWarmer();
  if (!v) return null;
  v.style.cssText = `position:absolute;inset:0;width:100%;height:100%;object-fit:${objectFit};`;
  v.removeAttribute("aria-hidden");
  container.appendChild(v);
  return v;
}

/** Pause and return the warmer off-DOM so it stays warm for the next cinematic. */
export function parkArrivalVideo(): void {
  if (!warmer) return;
  try { warmer.pause(); } catch { /* noop */ }
  warmer.setAttribute("aria-hidden", "true");
  park(warmer);
}
