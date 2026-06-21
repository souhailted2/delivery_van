import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { apiFetch, clearSession, clearTruckCredentials, getActiveApiUrl, getSessionSid, getTruckCredentials, saveSession } from "@/lib/api";
import { getDb, setSyncMeta } from "@/lib/db";

interface UserInfo {
  id: number;
  username: string;
  role: string;
  truckId?: number | null;
  branchId?: number | null;
  fullName?: string;
  truckCanSellOnCredit?: boolean | null;
}

interface AuthContextValue {
  user: UserInfo | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<void>;
  truckLogin: (truckName: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  resetDevice: () => Promise<void>;
  refreshCanSellOnCredit: () => void;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  loading: true,
  login: async () => {},
  truckLogin: async () => {},
  logout: async () => {},
  resetDevice: async () => {},
  refreshCanSellOnCredit: () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserInfo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const sid = await getSessionSid();
        if (sid) {
          const res = await apiFetch("/auth/me");
          if (res.ok) {
            const data = await res.json();
            setUser({ id: data.id, username: data.username, role: data.role, truckId: data.truckId, branchId: data.branchId, fullName: data.fullName, truckCanSellOnCredit: data.truckCanSellOnCredit });
            return;
          }
        }
        // Session missing or expired — try auto truck login with saved credentials
        const creds = await getTruckCredentials();
        if (creds) {
          const baseUrl = await getActiveApiUrl();
          const res = await fetch(`${baseUrl}/api/auth/truck-login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ truckName: creds.truckName, password: creds.password }),
          });
          if (res.ok) {
            const setCookie = res.headers.get("set-cookie");
            await saveSession(setCookie);
            const data = await res.json();
            setUser({ id: data.user?.id ?? 0, username: data.user?.username ?? creds.truckName, role: "truck", truckId: data.user?.truckId, branchId: data.user?.branchId, fullName: data.user?.fullName, truckCanSellOnCredit: data.user?.truckCanSellOnCredit });
          }
        }
      } catch {
        // Network error or no session — stay logged out
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    const baseUrl = await getActiveApiUrl();
    const res = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    if (!res.ok) throw new Error("بيانات الدخول خاطئة");
    const setCookie = res.headers.get("set-cookie");
    await saveSession(setCookie);
    const data = await res.json();
    setUser({ id: data.user?.id ?? 0, username: data.user?.username ?? username, role: data.user?.role ?? "vendeur", truckId: data.user?.truckId, branchId: data.user?.branchId, fullName: data.user?.fullName, truckCanSellOnCredit: data.user?.truckCanSellOnCredit });
  }, []);

  const truckLogin = useCallback(async (truckName: string, password: string) => {
    const baseUrl = await getActiveApiUrl();
    const res = await fetch(`${baseUrl}/api/auth/truck-login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ truckName, password }),
    });
    if (!res.ok) throw new Error("بيانات الشاحنة خاطئة");
    const setCookie = res.headers.get("set-cookie");
    await saveSession(setCookie);
    const data = await res.json();
    setUser({ id: data.user?.id ?? 0, username: data.user?.username ?? truckName, role: "truck", truckId: data.user?.truckId, branchId: data.user?.branchId, fullName: data.user?.fullName, truckCanSellOnCredit: data.user?.truckCanSellOnCredit });
  }, []);

  const logout = useCallback(async () => {
    try { await apiFetch("/auth/logout", { method: "POST" }); } catch {}
    await clearSession();
    setUser(null);
  }, []);

  const resetDevice = useCallback(async () => {
    try { await apiFetch("/auth/logout", { method: "POST" }); } catch {}
    await clearSession();
    await clearTruckCredentials();
    try {
      const db = await getDb();
      if (db) await setSyncMeta(db, "bootstrap_done", "0");
    } catch {}
    setUser(null);
  }, []);

  // Re-pull the current identity (incl. the truck's can-sell-on-credit flag)
  // from the server and merge it into the user. Called after a sync so the
  // invoice screen's credit gating reflects the latest server-side permission.
  const refreshCanSellOnCredit = useCallback(async () => {
    try {
      const res = await apiFetch("/auth/me");
      if (!res.ok) return;
      const data = await res.json();
      setUser(prev => (prev ? { ...prev, truckCanSellOnCredit: data.truckCanSellOnCredit ?? prev.truckCanSellOnCredit } : prev));
    } catch {
      // offline / transient — keep the last known value
    }
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, truckLogin, logout, resetDevice, refreshCanSellOnCredit }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
