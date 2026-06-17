// ALLAL Command Bar — premium glass top navigation (RTL-first).
//
// Brand → Command Bar → Environment. A 64px dark-glass band over the
// Operations Center; the vertical sidebar is gone. Active section carries a
// teal underline that slides between items (shared layoutId). Utility cluster
// at the end: search · notifications · profile (theme + sync + logout).

import { useState } from "react";
import { Link, useLocation } from "wouter";
import { motion, useReducedMotion } from "framer-motion";
import {
  Search, Bell, ChevronDown, Menu, Sun, Moon, LogOut, Boxes, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent,
  DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  Popover, PopoverTrigger, PopoverContent,
} from "@/components/ui/popover";
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/contexts/ThemeContext";
import { useLogout } from "@workspace/api-client-react";
import { ElectronSyncButton } from "@/components/ElectronSync";
import { NAV, isItemActive, isChildActive, type NavItem } from "./nav";

function Brand() {
  return (
    <Link href="/" className="flex shrink-0 items-center gap-2.5">
      <span className="grid h-9 w-9 place-items-center rounded-xl bg-primary/15 ring-1 ring-primary/30">
        <Boxes className="h-5 w-5 text-primary" />
      </span>
      <span className="hidden flex-col leading-tight sm:flex">
        <span className="text-sm font-bold tracking-wide text-foreground">
          ALLAL <span className="text-primary">DELIVERY</span>
        </span>
        <span className="text-[9px] font-medium uppercase tracking-[0.2em] text-foreground/40">
          Command Center
        </span>
      </span>
    </Link>
  );
}

function PrimaryItem({ item, active, reduce }: { item: NavItem; active: boolean; reduce: boolean }) {
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group relative flex h-16 items-center px-3 text-[0.95rem] transition-colors",
        active ? "font-semibold text-foreground" : "font-medium text-foreground/65 hover:text-foreground"
      )}
    >
      {item.label}
      {/* hover hairline (inactive) */}
      {!active && (
        <span className="pointer-events-none absolute inset-x-3 bottom-0 h-px scale-x-0 bg-foreground/25 transition-transform duration-200 group-hover:scale-x-100" />
      )}
      {/* active underline — slides between items */}
      {active && (
        <motion.span
          layoutId="cmdbar-underline"
          className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-primary"
          transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 380, damping: 30 }}
        />
      )}
    </Link>
  );
}

function NotificationsBell() {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="الإشعارات"
          className="relative grid h-9 w-9 place-items-center rounded-lg text-foreground/70 transition-colors hover:bg-white/5 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
        >
          <Bell className="h-[18px] w-[18px]" />
          <span className="absolute end-2 top-2 h-1.5 w-1.5 rounded-full bg-primary ring-2 ring-background" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-0">
        <div className="border-b border-border px-4 py-3 text-sm font-semibold text-foreground">الإشعارات</div>
        <div className="px-4 py-8 text-center text-sm text-muted-foreground">لا توجد إشعارات جديدة.</div>
      </PopoverContent>
    </Popover>
  );
}

function ProfileMenu() {
  const { user } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const logout = useLogout();
  const [, setLocation] = useLocation();
  const roleLabel = user?.role === "admin" ? "مدير" : "بائع";
  const initial = user?.fullName?.charAt(0) || "م";

  const handleLogout = () =>
    logout.mutate(undefined, { onSuccess: () => setLocation("/connexion") });

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex items-center gap-2 rounded-full border border-white/12 bg-white/[0.03] py-1 pe-3 ps-1 transition-colors hover:border-white/20 hover:bg-white/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
        >
          <span className="grid h-7 w-7 place-items-center rounded-full bg-primary/20 text-xs font-bold text-primary ring-1 ring-primary/30">
            {initial}
          </span>
          <span className="hidden text-sm font-medium text-foreground/90 sm:inline">{user?.fullName || "مدير"}</span>
          <ChevronDown className="h-4 w-4 text-foreground/50" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel className="flex flex-col gap-0.5">
          <span className="text-sm font-semibold">{user?.fullName || "مدير"}</span>
          <span className="text-xs font-normal text-muted-foreground">{roleLabel}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={(e) => { e.preventDefault(); toggleTheme(); }}>
          {theme === "dark" ? <Sun className="me-2 h-4 w-4" /> : <Moon className="me-2 h-4 w-4" />}
          {theme === "dark" ? "المظهر الفاتح" : "المظهر الداكن"}
        </DropdownMenuItem>
        {/* Sync — self-hides on the cloud web; shows the sync control on desktop. */}
        <div className="px-1 py-0.5">
          <ElectronSyncButton />
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={handleLogout}
          className="text-destructive focus:text-destructive focus:bg-destructive/10"
        >
          <LogOut className="me-2 h-4 w-4" />
          تسجيل الخروج
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function MobileSheet({ location }: { location: string }) {
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="outline" size="icon" className="shrink-0 lg:hidden" aria-label="فتح القائمة">
          <Menu className="h-5 w-5" />
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="flex w-80 flex-col gap-0 border-sidebar-border bg-sidebar p-0">
        <SheetTitle className="flex h-16 items-center border-b border-sidebar-border px-5 text-base font-bold text-sidebar-foreground">
          مركز القيادة
        </SheetTitle>
        <nav className="flex-1 overflow-auto p-3" aria-label="التنقل">
          {NAV.map((item) => {
            const active = isItemActive(item, location);
            const Icon = item.icon;
            const hasChildren = (item.children?.length ?? 0) > 0;
            const isOpen = expanded === item.href || active;
            if (!hasChildren) {
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setOpen(false)}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium transition-colors",
                    active ? "bg-primary text-primary-foreground" : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground"
                  )}
                >
                  <Icon className="h-[18px] w-[18px] shrink-0" />
                  {item.label}
                </Link>
              );
            }
            return (
              <div key={item.href} className="mb-0.5">
                <button
                  type="button"
                  onClick={() => setExpanded(isOpen && expanded === item.href ? null : item.href)}
                  aria-expanded={isOpen}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium transition-colors",
                    active ? "text-primary" : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground"
                  )}
                >
                  <Icon className="h-[18px] w-[18px] shrink-0" />
                  {item.label}
                  <ChevronDown className={cn("ms-auto h-4 w-4 transition-transform", isOpen && "rotate-180")} />
                </button>
                {isOpen && (
                  <div className="mb-1 ms-4 flex flex-col border-s border-sidebar-border ps-3">
                    {item.children!.map((c) => {
                      const cActive = isChildActive(c, location);
                      return (
                        <Link
                          key={c.href}
                          href={c.href}
                          onClick={() => setOpen(false)}
                          aria-current={cActive ? "page" : undefined}
                          className={cn(
                            "rounded-lg px-3 py-2 text-sm transition-colors",
                            cActive ? "font-medium text-primary" : "text-sidebar-foreground/60 hover:text-sidebar-foreground"
                          )}
                        >
                          {c.label}
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </nav>
      </SheetContent>
    </Sheet>
  );
}

export function CommandBar() {
  const [location] = useLocation();
  const reduce = !!useReducedMotion();
  const commandCenter = location === "/";

  return (
    <header
      className={cn(
        "sticky top-0 z-40 flex h-16 items-center gap-1 border-b px-4 lg:px-6 backdrop-blur-xl",
        commandCenter ? "border-white/8 bg-background/78" : "border-white/8 bg-background/85"
      )}
    >
      <Brand />

      {/* primary nav — desktop */}
      <nav className="hidden items-center lg:flex" aria-label="التنقل الرئيسي">
        {NAV.map((item) => (
          <PrimaryItem key={item.href} item={item} active={isItemActive(item, location)} reduce={reduce} />
        ))}
      </nav>

      <div className="flex-1" />

      {/* utility cluster */}
      <div className="flex items-center gap-1">
        <button
          type="button"
          aria-label="بحث"
          className="grid h-9 w-9 place-items-center rounded-lg text-foreground/70 transition-colors hover:bg-white/5 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
        >
          <Search className="h-[18px] w-[18px]" />
        </button>
        <NotificationsBell />
        <div className="mx-1 hidden h-6 w-px bg-white/10 sm:block" />
        <ProfileMenu />
        <MobileSheet location={location} />
      </div>
    </header>
  );
}
