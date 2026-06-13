import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import { checkOnline, getSessionSid } from "@/lib/api";
import { getDb, getPendingCount, getTableCounts } from "@/lib/db";
import { syncNow, resetSync } from "@/lib/sync";
import { useAuth } from "@/contexts/AuthContext";

interface SyncState {
  online: boolean;
  syncing: boolean;
  lastSync: string | null;
  pending: number;
  error: string | null;
  tableCounts: Record<string, number>;
  resetting: boolean;
}

interface SyncContextValue extends SyncState {
  triggerSync: () => void;
  doResetSync: () => Promise<void>;
  localVersion: number;
  bumpLocalVersion: () => void;
}

const SyncContext = createContext<SyncContextValue>({
  online: true, syncing: false, lastSync: null, pending: 0, error: null,
  tableCounts: {}, resetting: false,
  triggerSync: () => {},
  doResetSync: async () => {},
  localVersion: 0,
  bumpLocalVersion: () => {},
});

const SYNC_INTERVAL = 30_000;

export function SyncProvider({ children }: { children: React.ReactNode }) {
  const { refreshCanSellOnCredit } = useAuth();
  const [state, setState] = useState<SyncState>({
    online: true, syncing: false, lastSync: null, pending: 0, error: null,
    tableCounts: {}, resetting: false,
  });
  const syncingRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [localVersion, setLocalVersion] = useState(0);
  const bumpLocalVersion = useCallback(() => setLocalVersion(v => v + 1), []);

  const refreshCounts = useCallback(async () => {
    const db = await getDb();
    if (!db) return;
    const counts = await getTableCounts(db);
    setState(s => ({ ...s, tableCounts: counts }));
  }, []);

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
      const db = await getDb();
      const counts = db ? await getTableCounts(db) : {};
      setState(s => ({ ...s, syncing: false, lastSync: new Date().toISOString(), pending, error: null, tableCounts: counts }));
      setLocalVersion(v => v + 1);
      await refreshCanSellOnCredit();
    } catch (e: any) {
      const db = await getDb();
      const pending = db ? await getPendingCount(db) : 0;
      setState(s => ({ ...s, syncing: false, pending, error: e?.message ?? "خطأ في المزامنة" }));
    } finally {
      syncingRef.current = false;
    }
  }, [refreshCanSellOnCredit]);

  const doResetSync = useCallback(async () => {
    if (syncingRef.current) return;
    const sid = await getSessionSid();
    if (!sid) return;

    syncingRef.current = true;
    setState(s => ({ ...s, resetting: true, syncing: true, error: null }));
    try {
      await resetSync(sid);
      const db = await getDb();
      const counts = db ? await getTableCounts(db) : {};
      const pending = db ? await getPendingCount(db) : 0;
      setState(s => ({ ...s, syncing: false, resetting: false, lastSync: new Date().toISOString(), pending, error: null, tableCounts: counts }));
    } catch (e: any) {
      setState(s => ({ ...s, syncing: false, resetting: false, error: e?.message ?? "فشل إعادة الضبط" }));
    } finally {
      syncingRef.current = false;
    }
  }, []);

  useEffect(() => {
    refreshCounts();
    doSync();
    timerRef.current = setInterval(doSync, SYNC_INTERVAL);
    const sub = AppState.addEventListener("change", (appState) => {
      if (appState === "active") doSync();
    });
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      sub.remove();
    };
  }, [doSync, refreshCounts]);

  return (
    <SyncContext.Provider value={{ ...state, triggerSync: doSync, doResetSync, localVersion, bumpLocalVersion }}>
      {children}
    </SyncContext.Provider>
  );
}

export function useSync() {
  return useContext(SyncContext);
}
