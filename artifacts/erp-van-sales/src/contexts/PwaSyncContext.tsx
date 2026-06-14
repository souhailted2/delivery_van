/**
 * PWA Sync Context — wraps the pwa-sync engine and exposes state to React.
 */
import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import {
  SyncState, getSyncState, onSyncState, syncOnce, resetSync, startSync, stopSync,
} from "@/lib/pwa-sync";

interface PwaSyncContextType extends SyncState {
  syncNow: () => void;
  resetAndSync: () => Promise<void>;
}

const PwaSyncContext = createContext<PwaSyncContextType>({
  ...getSyncState(),
  syncNow: () => {},
  resetAndSync: async () => {},
});

export function PwaSyncProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<SyncState>(getSyncState);

  useEffect(() => {
    startSync();
    const unsub = onSyncState(setState);
    return () => {
      stopSync();
      unsub();
    };
  }, []);

  const syncNow = useCallback(() => syncOnce(), []);

  const resetAndSync = useCallback(async () => {
    await resetSync();
    await syncOnce();
  }, []);

  return (
    <PwaSyncContext.Provider value={{ ...state, syncNow, resetAndSync }}>
      {children}
    </PwaSyncContext.Provider>
  );
}

export function usePwaSync() {
  return useContext(PwaSyncContext);
}
