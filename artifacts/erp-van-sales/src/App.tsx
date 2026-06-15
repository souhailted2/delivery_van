import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as SonnerToaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import { AuthProvider } from "./contexts/AuthContext";
import { ThemeProvider } from "./contexts/ThemeContext";
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

function ProtectedRoute({ component: Component }: { component: any }) {
  return (
    <Layout>
      <Component />
    </Layout>
  );
}

function Router() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground">جارٍ التحميل...</p>
      </div>
    );
  }

  if (user?.role === "truck") {
    return (
      <Switch>
        <Route path="/connexion" component={Connexion} />
        <Route>{() => <TruckPortal />}</Route>
      </Switch>
    );
  }

  return (
    <Switch>
      <Route path="/connexion" component={Connexion} />
      <Route path="/">
        {() => <ProtectedRoute component={Dashboard} />}
      </Route>
      <Route path="/produits">
        {() => <ProtectedRoute component={Produits} />}
      </Route>
      <Route path="/categories">
        {() => <ProtectedRoute component={Categories} />}
      </Route>
      <Route path="/fournisseurs">
        {() => <ProtectedRoute component={Fournisseurs} />}
      </Route>
      <Route path="/achats">
        {() => <ProtectedRoute component={Achats} />}
      </Route>
      <Route path="/clients">
        {() => <ProtectedRoute component={Clients} />}
      </Route>
      <Route path="/camions">
        {() => <ProtectedRoute component={Camions} />}
      </Route>
      <Route path="/stock">
        {() => <ProtectedRoute component={Stock} />}
      </Route>
      <Route path="/factures">
        {() => <ProtectedRoute component={Factures} />}
      </Route>
      <Route path="/retours">
        {() => <ProtectedRoute component={Retours} />}
      </Route>
      <Route path="/caisse">
        {() => <ProtectedRoute component={Caisse} />}
      </Route>
      <Route path="/rapports">
        {() => <ProtectedRoute component={Rapports} />}
      </Route>
      <Route path="/utilisateurs">
        {() => <ProtectedRoute component={Utilisateurs} />}
      </Route>
      <Route>
        {() => <ProtectedRoute component={NotFound} />}
      </Route>
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <TooltipProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <AuthProvider>
              <Router />
            </AuthProvider>
          </WouterRouter>
          <Toaster />
          <SonnerToaster />
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
