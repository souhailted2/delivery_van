import { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "../../contexts/AuthContext";
import { useLogout } from "@workspace/api-client-react";
import {
  LayoutDashboard,
  Package,
  Tags,
  Truck,
  Users,
  Building2,
  ShoppingCart,
  FileText,
  Undo2,
  Wallet,
  BarChart3,
  Settings,
  LogOut,
  Menu
} from "lucide-react";
import { Button } from "../ui/button";
import { Sheet, SheetContent, SheetTrigger } from "../ui/sheet";
import { cn } from "../../lib/utils";
import { ElectronSyncButton } from "../ElectronSync";

const navItems = [
  { href: "/", label: "لوحة التحكم", icon: LayoutDashboard },
  { href: "/produits", label: "المنتجات", icon: Package },
  { href: "/categories", label: "الفئات", icon: Tags },
  { href: "/fournisseurs", label: "الموردون", icon: Building2 },
  { href: "/achats", label: "أوامر الشراء", icon: ShoppingCart },
  { href: "/clients", label: "العملاء", icon: Users },
  { href: "/camions", label: "الشاحنات", icon: Truck },
  { href: "/stock", label: "المخزن", icon: Package },
  { href: "/factures", label: "الفواتير", icon: FileText },
  { href: "/retours", label: "المرتجعات", icon: Undo2 },
  { href: "/caisse", label: "الصندوق", icon: Wallet },
  { href: "/rapports", label: "التقارير", icon: BarChart3 },
  { href: "/utilisateurs", label: "المستخدمون", icon: Settings },
];

export function Layout({ children }: { children: ReactNode }) {
  const [location, setLocation] = useLocation();
  const { user } = useAuth();
  const logout = useLogout();

  const handleLogout = () => {
    logout.mutate(undefined, {
      onSuccess: () => {
        setLocation("/connexion");
      }
    });
  };

  const roleLabel = user?.role === "admin" ? "مدير" : "بائع";

  const NavLinks = () => (
    <>
      {navItems.map((item) => {
        const Icon = item.icon;
        const isActive = location === item.href || (item.href !== "/" && location.startsWith(item.href));
        return (
          <Link key={item.href} href={item.href}>
            <div className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors cursor-pointer",
              isActive
                ? "bg-primary text-primary-foreground"
                : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            )}>
              <Icon className="h-4 w-4 shrink-0" />
              {item.label}
            </div>
          </Link>
        );
      })}
    </>
  );

  return (
    <div className="flex min-h-screen w-full bg-background">
      {/* القائمة الجانبية — شاشات كبيرة */}
      <aside className="hidden border-l border-sidebar-border bg-sidebar lg:flex w-64 flex-col order-last">
        <div className="flex h-14 items-center border-b border-sidebar-border px-4 lg:h-[60px] lg:px-6">
          <Link href="/">
            <div className="flex items-center gap-2 font-semibold cursor-pointer text-sidebar-foreground">
              <Truck className="h-6 w-6 text-primary shrink-0" />
              <span>VanSales ERP</span>
            </div>
          </Link>
        </div>
        <div className="flex-1 overflow-auto py-2">
          <nav className="grid items-start px-2 text-sm font-medium lg:px-4 gap-1">
            <NavLinks />
          </nav>
        </div>
        <div className="mt-auto p-4 border-t border-sidebar-border">
          <div className="flex items-center gap-3 mb-4 text-sidebar-foreground">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground font-bold shrink-0">
              {user?.fullName?.charAt(0) || "م"}
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-medium">{user?.fullName}</span>
              <span className="text-xs text-muted-foreground">{roleLabel}</span>
            </div>
          </div>
          <Button
            variant="outline"
            className="w-full justify-start text-destructive hover:text-destructive hover:bg-destructive/10 border-transparent bg-transparent"
            onClick={handleLogout}
          >
            <LogOut className="ml-2 h-4 w-4" />
            تسجيل الخروج
          </Button>
        </div>
      </aside>

      {/* المحتوى الرئيسي */}
      <div className="flex flex-col flex-1">
        <header className="flex h-14 items-center gap-4 border-b bg-card px-4 lg:h-[60px] lg:px-6">
          <Sheet>
            <SheetTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                className="shrink-0 lg:hidden"
              >
                <Menu className="h-5 w-5" />
                <span className="sr-only">فتح القائمة</span>
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="flex flex-col bg-sidebar border-sidebar-border p-0">
              <div className="flex h-14 items-center border-b border-sidebar-border px-4">
                <div className="flex items-center gap-2 font-semibold text-sidebar-foreground">
                  <Truck className="h-6 w-6 text-primary shrink-0" />
                  <span>VanSales ERP</span>
                </div>
              </div>
              <nav className="grid gap-2 p-4 text-lg font-medium overflow-y-auto">
                <NavLinks />
              </nav>
              <div className="mt-auto p-4 border-t border-sidebar-border">
                <Button
                  variant="outline"
                  className="w-full justify-start text-destructive hover:text-destructive hover:bg-destructive/10 border-transparent bg-transparent"
                  onClick={handleLogout}
                >
                  <LogOut className="ml-2 h-4 w-4" />
                  تسجيل الخروج
                </Button>
              </div>
            </SheetContent>
          </Sheet>
          <div className="w-full flex-1" />
          <ElectronSyncButton />
        </header>
        <main className="flex-1 p-4 lg:p-6 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
