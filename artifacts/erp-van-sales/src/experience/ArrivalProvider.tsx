// ALLAL Experience — arrival + departure provider (Video-First, decoupled).
//
// The cinematics no longer wait on the network. Both begin the instant the
// user clicks; authentication / logout run in PARALLEL and the video hides the
// latency.
//
//   LOGIN:  Connexion calls startArrival() ON CLICK (video starts immediately)
//           and fires the login request in parallel. When the request settles
//           it calls resolveArrival(ok). LoginArrival reveals the dashboard
//           only once auth has SUCCEEDED (it holds on the final frame if the
//           request is still pending at video-end), or aborts back to the login
//           screen if it FAILED.
//
//   LOGOUT: CommandBar calls startLogout() ON CLICK (reverse starts immediately),
//           navigates to /connexion immediately (so the login exterior is
//           prepared UNDER the overlay), and fires the logout request in
//           parallel. The overlay therefore fades to the login screen — never
//           back to the Operations Center.
//
// `dashboardReady` gates the dashboard cards + command-bar descent.

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { LoginArrival } from "./LoginArrival";
import { LogoutSequence } from "./LogoutSequence";

export type AuthOutcome = "pending" | "success" | "error";

interface ArrivalCtx {
  /** Raise the arrival cinematic (call ON CLICK, before/parallel to login). */
  startArrival: () => void;
  /** Report the login request outcome so the arrival can reveal or abort. */
  resolveArrival: (ok: boolean) => void;
  isArriving: boolean;

  /** Raise the departure cinematic (call ON CLICK, before/parallel to logout). */
  startLogout: () => void;
  isLeaving: boolean;

  dashboardReady: boolean;
}

const Ctx = createContext<ArrivalCtx | null>(null);

export function ArrivalProvider({ children }: { children: ReactNode }) {
  const [isArriving, setIsArriving]         = useState(false);
  const [isLeaving, setIsLeaving]           = useState(false);
  const [dashboardReady, setDashboardReady] = useState(true);
  const [authOutcome, setAuthOutcome]       = useState<AuthOutcome>("pending");

  const startArrival = useCallback(() => {
    setAuthOutcome("pending");
    setDashboardReady(false);
    setIsArriving(true);
  }, []);
  const resolveArrival = useCallback((ok: boolean) => setAuthOutcome(ok ? "success" : "error"), []);
  const reveal = useCallback(() => setDashboardReady(true), []);
  const finishArrival = useCallback(() => { setIsArriving(false); setAuthOutcome("pending"); }, []);

  const startLogout = useCallback(() => setIsLeaving(true), []);
  const finishLogout = useCallback(() => setIsLeaving(false), []);

  // Dev/QA hooks — preview from the browser console.
  useEffect(() => {
    const w = window as unknown as { __playArrival?: () => void; __playLogout?: () => void };
    w.__playArrival = () => { startArrival(); window.setTimeout(() => resolveArrival(true), 50); };
    w.__playLogout  = startLogout;
  }, [startArrival, resolveArrival, startLogout]);

  return (
    <Ctx.Provider value={{ startArrival, resolveArrival, isArriving, startLogout, isLeaving, dashboardReady }}>
      {children}
      {isArriving && <LoginArrival authOutcome={authOutcome} onReveal={reveal} onComplete={finishArrival} />}
      {isLeaving && <LogoutSequence onComplete={finishLogout} />}
    </Ctx.Provider>
  );
}

export function useArrival() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useArrival must be used inside <ArrivalProvider>");
  return ctx;
}
