import React, { createContext, useContext, useEffect, useState } from "react";
import { useGetMe, getGetMeQueryKey, User } from "@workspace/api-client-react";
import { useLocation } from "wouter";

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType>({ user: null, isLoading: true });

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [location, setLocation] = useLocation();
  const { data: user, isLoading, isError, isFetching, error } = useGetMe({
    query: {
      queryKey: getGetMeQueryKey(),
      retry: false,
    },
  });

  const status = (error as { status?: number } | null)?.status;

  useEffect(() => {
    // Only bounce to the login screen once /me has DEFINITIVELY resolved to an
    // unauthenticated state. The previous version redirected on any `isError`,
    // which produced the intermittent "login → dashboard → back to login" bug:
    //
    //   1. Before login the /me query is in an error (401) state.
    //   2. On login success Connexion calls invalidateQueries() → /me REFETCHES
    //      and navigates to "/". For an already-errored query React Query keeps
    //      status==="error" (isError stays true, isLoading stays false) while the
    //      refetch is in flight — so the old guard fired and redirected the user
    //      straight back out, racing the refetch. Whether it won the race was
    //      timing-dependent → intermittent.
    //
    // Fixes: (a) wait for any in-flight fetch to settle (`!isFetching`) so a
    // post-login refetch isn't mistaken for "logged out"; (b) only treat a real
    // 401 as a session loss — a transient 5xx / network blip must NOT log the
    // user out.
    if (isLoading || isFetching) return;
    if (location === "/connexion") return;
    if (isError && status === 401) {
      setLocation("/connexion");
    }
  }, [isLoading, isFetching, isError, status, location, setLocation]);

  return (
    <AuthContext.Provider value={{ user: user || null, isLoading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
