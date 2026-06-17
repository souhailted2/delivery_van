// ALLAL Experience — arrival cinematic provider.
//
// One context controls whether the Login → Dashboard cinematic is currently
// playing. Connexion calls startArrival() the instant credentials succeed;
// the overlay then plays the storyboard above the rest of the app while the
// live Dashboard quietly mounts underneath.
//
// AppTransition reads `isArriving` to skip its own hero variant during the
// sequence (the overlay owns the cinematic — no double animation).
//
// `dashboardReady` gates the Dashboard's content reveal. It is TRUE by default
// (normal navigation reveals immediately), set FALSE the moment an arrival
// starts (so the Dashboard mounts hidden behind the overlay), and flipped back
// TRUE when the curtain begins to lift — so the command-center UI staggers in
// AS the user arrives, not invisibly behind the curtain.

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { LoginArrival } from "./LoginArrival";

interface ArrivalCtx {
  startArrival: () => void;
  isArriving: boolean;
  dashboardReady: boolean;
}

const Ctx = createContext<ArrivalCtx | null>(null);

export function ArrivalProvider({ children }: { children: ReactNode }) {
  const [isArriving, setIsArriving] = useState(false);
  const [dashboardReady, setDashboardReady] = useState(true);

  const startArrival = useCallback(() => {
    setDashboardReady(false); // hide the Dashboard until the curtain lifts
    setIsArriving(true);
  }, []);
  const reveal = useCallback(() => setDashboardReady(true), []);
  const finish = useCallback(() => setIsArriving(false), []);

  // Dev/QA hook — preview the arrival cinematic from the console:
  //   window.__playArrival()
  useEffect(() => {
    (window as unknown as { __playArrival?: () => void }).__playArrival = startArrival;
  }, [startArrival]);

  return (
    <Ctx.Provider value={{ startArrival, isArriving, dashboardReady }}>
      {children}
      {isArriving && <LoginArrival onReveal={reveal} onComplete={finish} />}
    </Ctx.Provider>
  );
}

export function useArrival() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useArrival must be used inside <ArrivalProvider>");
  return ctx;
}
