import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { apiFetch, API_URL, clearSession, getSessionSid, saveSession } from "@/lib/api";

interface UserInfo {
  id: number;
  username: string;
  role: string;
  truckId?: number | null;
  branchId?: number | null;
  fullName?: string;
}

interface AuthContextValue {
  user: UserInfo | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<void>;
  truckLogin: (truckId: number, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  loading: true,
  login: async () => {},
  truckLogin: async () => {},
  logout: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserInfo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const sid = await getSessionSid();
        if (!sid) { setLoading(false); return; }
        const res = await apiFetch("/auth/me");
        if (res.ok) {
          const data = await res.json();
          setUser({ id: data.id, username: data.username, role: data.role, truckId: data.truckId, branchId: data.branchId, fullName: data.fullName });
        }
      } catch {
        // no session
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    const res = await fetch(`${API_URL}/api/auth/login`, {
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

  const truckLogin = useCallback(async (truckId: number, password: string) => {
    const res = await fetch(`${API_URL}/api/auth/truck-login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ truckId, password }),
    });
    if (!res.ok) throw new Error("بيانات الشاحنة خاطئة");
    const setCookie = res.headers.get("set-cookie");
    await saveSession(setCookie);
    const data = await res.json();
    setUser({ id: data.user?.id ?? 0, username: data.user?.username ?? `truck-${truckId}`, role: "truck", truckId: data.user?.truckId ?? truckId, branchId: data.user?.branchId, fullName: data.user?.fullName });
  }, []);

  const logout = useCallback(async () => {
    try { await apiFetch("/auth/logout", { method: "POST" }); } catch {}
    await clearSession();
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, truckLogin, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
