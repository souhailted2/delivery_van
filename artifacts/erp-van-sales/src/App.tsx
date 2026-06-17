import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
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

const queryClient = new QueryClient();

// Authenticated pages render inside Layout (sidebar + header).
function ShellRoute({ component: Component }: { component: any }) {
  return (
    <Layout>
      <Component />
    </Layout>
  );
}

function Router() {
  const { user, isLoading } = useAuth();
  // Freeze location into Switch so the EXITING tree (held in place by
  // AnimatePresence) keeps rendering its OLD route until its exit completes.
  // Without this, both old & new motion.divs would show the new route during
  // the exit window, causing a flash.
  const [location] = useLocation();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground">جارٍ التحميل...</p>
      </div>
    );
  }

  if (user?.role === "truck") {
    return (
      <AppTransition>
        <Switch location={location}>
          <Route path="/connexion" component={Connexion} />
          <Route>{() => <TruckPortal />}</Route>
        </Switch>
      </AppTransition>
    );
  }

  return (
    <AppTransition>
      <Switch location={location}>
        <Route path="/connexion" component={Connexion} />
        <Route path="/">{() => <ShellRoute component={Dashboard} />}</Route>
        <Route path="/produits">{() => <ShellRoute component={Produits} />}</Route>
        <Route path="/categories">{() => <ShellRoute component={Categories} />}</Route>
        <Route path="/fournisseurs">{() => <ShellRoute component={Fournisseurs} />}</Route>
        <Route path="/achats">{() => <ShellRoute component={Achats} />}</Route>
        <Route path="/clients">{() => <ShellRoute component={Clients} />}</Route>
        <Route path="/camions">{() => <ShellRoute component={Camions} />}</Route>
        <Route path="/stock">{() => <ShellRoute component={Stock} />}</Route>
        <Route path="/factures">{() => <ShellRoute component={Factures} />}</Route>
        <Route path="/retours">{() => <ShellRoute component={Retours} />}</Route>
        <Route path="/caisse">{() => <ShellRoute component={Caisse} />}</Route>
        <Route path="/rapports">{() => <ShellRoute component={Rapports} />}</Route>
        <Route path="/utilisateurs">{() => <ShellRoute component={Utilisateurs} />}</Route>
        <Route>{() => <ShellRoute component={NotFound} />}</Route>
      </Switch>
    </AppTransition>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <TooltipProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            {/* ALLAL cinematic experience — one persistent session behind the UI.
                Each route is a scene; navigation is a cinematic camera move. */}
            <ExperienceBackground />
            {/* App content composited ABOVE the cinematic layer (UI is the hero). */}
            <div style={{ position: "relative", zIndex: 1 }}>
              <AuthProvider>
                <ArrivalProvider>
                  <Router />
                </ArrivalProvider>
              </AuthProvider>
            </div>
          </WouterRouter>
          <Toaster />
          <SonnerToaster />
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
