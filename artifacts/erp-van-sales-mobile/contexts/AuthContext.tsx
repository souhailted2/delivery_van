import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { apiFetch, clearSession, clearTruckCredentials, getActiveApiUrl, getSessionSid, getTruckCredentials, saveSession } from "@/lib/api";
import { getDb, setSyncMeta } from "@/lib/db";

async function readTruckCanSellOnCredit(truckId: number | null | undefined): Promise<boolean> {
  if (!truckId) return true;
  try {
    const db = await getDb();
    if (!db) return true;
    const row = await db.getFirstAsync<{ can_sell_on_credit: number }>(
      "SELECT can_sell_on_credit FROM trucks WHERE id = ? LIMIT 1",
      [truckId]
    );
    if (row == null) return true;
    return row.can_sell_on_credit !== 0;
  } catch {
    return true;
  }
}

interface UserInfo {
  id: number;
  username: string;
  role: string;
  truckId?: number | null;
  branchId?: number | null;
  fullName?: string;
  truckCanSellOnCredit?: boolean;
}

interface AuthContextValue {
  user: UserInfo | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<void>;
  truckLogin: (truckName: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  resetDevice: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  loading: true,
  login: async () => {},
  truckLogin: async () => {},
  logout: async () => {},
  resetDevice: async () => {},
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
            const truckId = data.truckId;
            const truckCanSellOnCredit = data.role === "truck"
              ? await readTruckCanSellOnCredit(truckId)
              : undefined;
            setUser({ id: data.id, username: data.username, role: data.role, truckId, branchId: data.branchId, fullName: data.fullName, truckCanSellOnCredit });
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
            const truckId = data.user?.truckId;
            const truckCanSellOnCredit = await readTruckCanSellOnCredit(truckId);
            setUser({ id: data.user?.id ?? 0, username: data.user?.username ?? creds.truckName, role: "truck", truckId, branchId: data.user?.branchId, fullName: data.user?.fullName, truckCanSellOnCredit });
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
    setUser({ id: data.user?.id ?? 0, username: data.user?.username ?? username, role: data.user?.role ?? "vendeur", truckId: data.user?.truckId, branchId: data.user?.branchId, fullName: data.user?.fullName });
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
    const truckId = data.user?.truckId;
    const truckCanSellOnCredit = await readTruckCanSellOnCredit(truckId);
    setUser({ id: data.user?.id ?? 0, username: data.user?.username ?? truckName, role: "truck", truckId, branchId: data.user?.branchId, fullName: data.user?.fullName, truckCanSellOnCredit });
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

  return (
    <AuthContext.Provider value={{ user, loading, login, truckLogin, logout, resetDevice }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
