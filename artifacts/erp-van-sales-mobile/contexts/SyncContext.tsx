import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import { checkOnline, getSessionSid } from "@/lib/api";
import { getDb, getPendingCount } from "@/lib/db";
import { syncNow } from "@/lib/sync";

interface SyncState {
  online: boolean;
  syncing: boolean;
  lastSync: string | null;
  pending: number;
  error: string | null;
}

interface SyncContextValue extends SyncState {
  triggerSync: () => void;
}

const SyncContext = createContext<SyncContextValue>({
  online: true, syncing: false, lastSync: null, pending: 0, error: null,
  triggerSync: () => {},
});

const SYNC_INTERVAL = 30_000;

export function SyncProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<SyncState>({
    online: true, syncing: false, lastSync: null, pending: 0, error: null,
  });
  const syncingRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const doSync = useCallback(async () => {
    if (syncingRef.current) return;
    const isOnline = await checkOnline();
    setState(s => ({ ...s, online: isOnline }));
    if (!isOnline) return;

    const sid = await getSessionSid();
    if (!sid) return;

    syncingRef.current = true;
    setState(s => ({ ...s, syncing: true, error: null }));
    try {
      const { pending } = await syncNow(sid);
      setState(s => ({ ...s, syncing: false, lastSync: new Date().toISOString(), pending, error: null }));
    } catch (e: any) {
      const db = await getDb();
      const pending = db ? await getPendingCount(db) : 0;
      setState(s => ({ ...s, syncing: false, pending, error: e?.message ?? "خطأ في المزامنة" }));
    } finally {
      syncingRef.current = false;
    }
  }, []);

  useEffect(() => {
    doSync();
    timerRef.current = setInterval(doSync, SYNC_INTERVAL);
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") doSync();
    });
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      sub.remove();
    };
  }, [doSync]);

  return (
    <SyncContext.Provider value={{ ...state, triggerSync: doSync }}>
      {children}
    </SyncContext.Provider>
  );
}

export function useSync() {
  return useContext(SyncContext);
}
