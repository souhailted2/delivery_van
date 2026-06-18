import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider, QueryCache, MutationCache } from "@tanstack/react-query";
import { getGetMeQueryKey } from "@workspace/api-client-react";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as SonnerToaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import { AuthProvider } from "./contexts/AuthContext";
import { ThemeProvider } from "./contexts/ThemeContext";
import { ExperienceBackground } from "./experience/ExperienceBackground";
import { AppTransition } from "./experience/AppTransition";
import { ArrivalProvider } from "./experience/ArrivalProvider";
import { useAuth } from "./contexts/AuthContext";
import { Layout } from "./components/layout/Layout";
import Dashboard from "./pages/Dashboard";
import Connexion from "./pages/Connexion";
import Produits from "./pages/Produits";
import Categories from "./pages/Categories";
import Fournisseurs from "./pages/Fournisseurs";
import Achats from "./pages/Achats";
import Clients from "./pages/Clients";
import Camions from "./pages/Camions";
import Stock from "./pages/Stock";
import Factures from "./pages/Factures";
import Retours from "./pages/Retours";
import Caisse from "./pages/Caisse";
import Rapports from "./pages/Rapports";
import Utilisateurs from "./pages/Utilisateurs";
import TruckPortal from "./pages/TruckPortal";

// Global session-expiry handling. If any query/mutation comes back 401, the
// session is gone — send the user to the login screen instead of leaving them
// on a silently-broken page. The /me query is excluded because AuthContext
// already owns that redirect (a smooth in-app navigation on first load); this
// handler covers the gap where a NON-/me request 401s mid-session.
const ME_QUERY_KEY = JSON.stringify(getGetMeQueryKey());

function redirectToLoginOn401(error: unknown) {
  const status = (error as { status?: number } | null)?.status;
  if (status !== 401) return;
  // Don't loop / don't clobber the login screen's own error toasts.
  if (window.location.pathname.replace(/\/+$/, "").endsWith("/connexion")) return;
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");
  window.location.assign(`${base}/connexion`);
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Don't retry client errors (401/403/404/422) — only transient failures.
      retry: (failureCount, error) => {
        const status = (error as { status?: number } | null)?.status;
        if (typeof status === "number" && status >= 400 && status < 500) return false;
        return failureCount < 2;
      },
    },
  },
  queryCache: new QueryCache({
    onError: (error, query) => {
      if (JSON.stringify(query.queryKey) === ME_QUERY_KEY) return; // AuthContext owns /me
      redirectToLoginOn401(error);
    },
  }),
  mutationCache: new MutationCache({
    onError: redirectToLoginOn401,
  }),
});

function Router() {
  const { user, isLoading } = useAuth();
  const [location] = useLocation();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground">جارٍ التحميل...</p>
      </div>
    );
  }

  // Login is a standalone scene — the Arrival overlay owns its cinematic.
  if (location === "/connexion") return <Connexion />;

  // Truck drivers get the restricted portal (no command-center shell).
  if (user?.role === "truck") return <TruckPortal />;

  // Admin / vendeur — ONE persistent command-center shell. The command bar and
  // sub-nav stay mounted; only the page CONTENT fades on navigation
  // (AppTransition). No exit, no scene swap, no blink.
  return (
    <Layout>
      <AppTransition>
        <Switch location={location}>
          <Route path="/">{() => <Dashboard />}</Route>
          <Route path="/produits">{() => <Produits />}</Route>
          <Route path="/categories">{() => <Categories />}</Route>
          <Route path="/fournisseurs">{() => <Fournisseurs />}</Route>
          <Route path="/achats">{() => <Achats />}</Route>
          <Route path="/clients">{() => <Clients />}</Route>
          <Route path="/camions">{() => <Camions />}</Route>
          <Route path="/stock">{() => <Stock />}</Route>
          <Route path="/factures">{() => <Factures />}</Route>
          <Route path="/retours">{() => <Retours />}</Route>
          <Route path="/caisse">{() => <Caisse />}</Route>
          <Route path="/rapports">{() => <Rapports />}</Route>
          <Route path="/utilisateurs">{() => <Utilisateurs />}</Route>
          <Route>{() => <NotFound />}</Route>
        </Switch>
      </AppTransition>
    </Layout>
  );
}

function App() {
  return (
    <ErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <TooltipProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <AuthProvider>
              <ArrivalProvider>
                {/* ALLAL — ONE Operations Center behind the whole app. The
                    environment is a single static layer; the only cinematic is
                    the login/logout Arrival overlay (owned by ArrivalProvider). */}
                <ExperienceBackground />
                {/* App content composited ABOVE the cinematic layer (UI is the hero). */}
                <div style={{ position: "relative", zIndex: 1 }}>
                  <Router />
                </div>
              </ArrivalProvider>
            </AuthProvider>
          </WouterRouter>
          <Toaster />
          <SonnerToaster />
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;
