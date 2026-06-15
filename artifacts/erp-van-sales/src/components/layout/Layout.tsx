import { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { motion } from "framer-motion";
import { useAuth } from "../../contexts/AuthContext";
import { useTheme } from "../../contexts/ThemeContext";
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
  Menu,
  Sun,
  Moon,
  Boxes,
} from "lucide-react";
import { Button } from "../ui/button";
import { Sheet, SheetContent, SheetTrigger } from "../ui/sheet";
import { cn } from "../../lib/utils";
import { ElectronSyncButton } from "../ElectronSync";

const navSections = [
  {
    label: "العمليات",
    items: [
      { href: "/", label: "لوحة التحكم", icon: LayoutDashboard },
      { href: "/factures", label: "الفواتير", icon: FileText },
      { href: "/retours", label: "المرتجعات", icon: Undo2 },
      { href: "/caisse", label: "الصندوق", icon: Wallet },
    ],
  },
  {
    label: "المخزون",
    items: [
      { href: "/produits", label: "المنتجات", icon: Package },
      { href: "/categories", label: "الفئات", icon: Tags },
      { href: "/stock", label: "المخزن", icon: Boxes },
    ],
  },
  {
    label: "الأسطول",
    items: [
      { href: "/camions", label: "الشاحنات", icon: Truck },
    ],
  },
  {
    label: "الأعمال",
    items: [
      { href: "/clients", label: "العملاء", icon: Users },
      { href: "/fournisseurs", label: "الموردون", icon: Building2 },
      { href: "/achats", label: "أوامر الشراء", icon: ShoppingCart },
    ],
  },
  {
    label: "الإدارة",
    items: [
      { href: "/rapports", label: "التقارير", icon: BarChart3 },
      { href: "/utilisateurs", label: "المستخدمون", icon: Settings },
    ],
  },
];

function BrandMark() {
  return (
    <div className="flex items-center gap-2.5 font-semibold cursor-pointer text-sidebar-foreground">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/15 ring-1 ring-primary/30">
        <Boxes className="h-5 w-5 text-primary" />
      </div>
      <div className="flex flex-col leading-tight">
        <span className="text-sm font-bold tracking-wide">
          ALLAL <span className="text-primary">DELIVERY</span>
        </span>
        <span className="text-[10px] font-medium uppercase tracking-[0.18em] text-sidebar-foreground/40">
          Logistics Command Center
        </span>
      </div>
    </div>
  );
}

function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  return (
    <Button
      variant="outline"
      size="icon"
      onClick={toggleTheme}
      className="shrink-0"
      title={theme === "dark" ? "تفعيل الوضع الفاتح" : "تفعيل الوضع الداكن"}
    >
      {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
      <span className="sr-only">تبديل المظهر</span>
    </Button>
  );
}

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

  const NavLinks = ({ layoutId }: { layoutId: string }) => (
    <>
      {navSections.map((section, sIdx) => (
        <div key={section.label} className={cn("space-y-1", sIdx > 0 && "mt-4")}>
          <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-sidebar-foreground/35">
            {section.label}
          </p>
          {section.items.map((item) => {
            const Icon = item.icon;
            const isActive = location === item.href || (item.href !== "/" && location.startsWith(item.href));
            return (
              <Link key={item.href} href={item.href}>
                <div className={cn(
                  "relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors cursor-pointer",
                  isActive
                    ? "text-sidebar-primary-foreground"
                    : "text-sidebar-foreground/65 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                )}>
                  {isActive && (
                    <motion.div
                      layoutId={layoutId}
                      className="absolute inset-0 rounded-xl bg-primary glow-primary"
                      transition={{ type: "spring", stiffness: 400, damping: 32 }}
                    />
                  )}
                  <Icon className="relative z-10 h-4 w-4 shrink-0" />
                  <span className="relative z-10">{item.label}</span>
                </div>
              </Link>
            );
          })}
        </div>
      ))}
    </>
  );

  return (
    <div className="flex min-h-screen w-full bg-background">
      {/* القائمة الجانبية — شاشات كبيرة */}
      <aside className="hidden border-l border-sidebar-border bg-sidebar lg:flex w-64 flex-col order-last">
        <div className="flex h-16 items-center border-b border-sidebar-border px-4 lg:px-5 command-grid-bg">
          <Link href="/">
            <BrandMark />
          </Link>
        </div>
        <div className="flex-1 overflow-auto py-3">
          <nav className="grid items-start px-3 text-sm font-medium gap-1">
            <NavLinks layoutId="sidebar-active-desktop" />
          </nav>
        </div>
        <div className="mt-auto p-4 border-t border-sidebar-border">
          <div className="flex items-center gap-3 mb-4 text-sidebar-foreground">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/15 ring-1 ring-primary/30 text-primary font-bold shrink-0">
              {user?.fullName?.charAt(0) || "م"}
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-medium">{user?.fullName}</span>
              <span className="text-xs text-sidebar-foreground/50">{roleLabel}</span>
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
        <header className="flex h-16 items-center gap-3 border-b border-border bg-card/60 backdrop-blur-md px-4 lg:px-6">
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
              <div className="flex h-16 items-center border-b border-sidebar-border px-4 command-grid-bg">
                <BrandMark />
              </div>
              <nav className="grid gap-1 p-3 text-sm font-medium overflow-y-auto">
                <NavLinks layoutId="sidebar-active-mobile" />
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
          <ThemeToggle />
          <ElectronSyncButton />
        </header>
        <main className="flex-1 p-4 lg:p-6 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
