// ALLAL Experience — arrival + click-cascade + logout provider.
//
// Three orchestrated state machines, all controlled here:
//
//  1. CLICK CASCADE (Phase 2 of Director's Plan)
//     Connexion calls startClickCascade() the instant credentials succeed.
//     For 800ms the HQ resting view shows the building's response (truck
//     headlights flare, entrance lamp brightens, wall display pulses through
//     the glass, doorway core ignites). Only then does navigation fire.
//
//  2. ARRIVAL CINEMATIC (Phases 3-6)
//     startArrival() raises the LoginArrival overlay. It plays the approach,
//     the doorway threshold, the Operations Center activation cascade, and
//     hands control over to the Dashboard.
//
//  3. LOGOUT SEQUENCE (Phase 8)
//     startLogout(commit) plays the reverse cinematic — OC power-down,
//     doorway contraction, return to HQ standby — and invokes `commit()` at
//     the appropriate moment to perform the actual logout API call and
//     navigation.
//
// AppTransition reads `isArriving` / `isLeaving` to suspend its own page
// transitions during these set-pieces (only one cinematic plays at a time).
//
// `dashboardReady` gates the Dashboard's content reveal so KPI cards
// materialise AS the curtain lifts (Phase 6 handover), not invisibly behind it.

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { LoginArrival } from "./LoginArrival";
import { LogoutSequence } from "./LogoutSequence";

export type ClickPhase = "idle" | "charging" | "cascading";

interface ArrivalCtx {
  /** Begin the 800ms HQ reaction cascade. Resolves when complete so the
   *  caller can fire its navigation. */
  startClickCascade: () => Promise<void>;
  /** Current click cascade phase — drives HQReactiveLayer. */
  clickPhase: ClickPhase;

  /** Begin the cinematic arrival (LoginArrival overlay). */
  startArrival: () => void;
  isArriving: boolean;

  /** Begin the logout sequence. `commit` is invoked at the moment the
   *  exterior arrives (so the user feels they've left before the actual
   *  navigation happens). */
  startLogout: (commit: () => void) => void;
  isLeaving: boolean;

  dashboardReady: boolean;
}

const Ctx = createContext<ArrivalCtx | null>(null);

// 200ms charge ring on the button, then 600ms world cascade. The
// HQReactiveLayer's "cascade" keyframes use this 800ms total budget.
const CLICK_CHARGE_MS  = 200;
const CLICK_CASCADE_MS = 600;
const CLICK_TOTAL_MS   = CLICK_CHARGE_MS + CLICK_CASCADE_MS;

export function ArrivalProvider({ children }: { children: ReactNode }) {
  const [clickPhase, setClickPhase]    = useState<ClickPhase>("idle");
  const [isArriving, setIsArriving]    = useState(false);
  const [isLeaving, setIsLeaving]      = useState(false);
  const [dashboardReady, setDashboardReady] = useState(true);
  const [logoutCommit, setLogoutCommit] = useState<(() => void) | null>(null);

  // ── 1. Click cascade
  const startClickCascade = useCallback(async () => {
    setClickPhase("charging");
    await new Promise(r => window.setTimeout(r, CLICK_CHARGE_MS));
    setClickPhase("cascading");
    await new Promise(r => window.setTimeout(r, CLICK_CASCADE_MS));
    // leave phase at "cascading" — caller is about to navigate; the HQ
    // resting view is replaced by the LoginArrival overlay which takes
    // over the choreography.
  }, []);

  // ── 2. Cinematic arrival
  const startArrival = useCallback(() => {
    setDashboardReady(false);
    setIsArriving(true);
  }, []);
  const reveal = useCallback(() => setDashboardReady(true), []);
  const finish = useCallback(() => {
    setIsArriving(false);
    setClickPhase("idle"); // reset for any future arrival
  }, []);

  // ── 3. Logout
  const startLogout = useCallback((commit: () => void) => {
    setLogoutCommit(() => commit);
    setIsLeaving(true);
  }, []);
  const logoutDone = useCallback(() => {
    setIsLeaving(false);
    setLogoutCommit(null);
  }, []);

  // Dev/QA hooks — preview either cinematic from the browser console:
  //   window.__playArrival()
  //   window.__playLogout()
  useEffect(() => {
    const w = window as unknown as { __playArrival?: () => void; __playLogout?: () => void };
    w.__playArrival = startArrival;
    w.__playLogout  = () => startLogout(() => { /* dev: no-op commit */ });
  }, [startArrival, startLogout]);

  return (
    <Ctx.Provider value={{
      startClickCascade, clickPhase,
      startArrival, isArriving,
      startLogout, isLeaving,
      dashboardReady,
    }}>
      {children}
      {isArriving && <LoginArrival onReveal={reveal} onComplete={finish} />}
      {isLeaving && <LogoutSequence onCommit={logoutCommit ?? (() => {})} onComplete={logoutDone} />}
    </Ctx.Provider>
  );
}

export function useArrival() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useArrival must be used inside <ArrivalProvider>");
  return ctx;
}

export const CLICK_CASCADE_TOTAL_MS = CLICK_TOTAL_MS;
