// ALLAL Command Bar — single source of truth for navigation.
//
// 8 first-class Arabic sections (RTL). Three carry contextual children that
// surface as a secondary nav row only when you're inside that section; the
// other five are singletons (no second row → maximally cinematic, esp. the
// Dashboard). One config drives the desktop bar, the subnav, active states,
// and the mobile command sheet.

import {
  LayoutDashboard,
  Receipt,
  Package,
  Boxes,
  Truck,
  Briefcase,
  BarChart3,
  Settings,
  type LucideIcon,
} from "lucide-react";

export interface NavChild {
  href: string;
  label: string;
}

export interface NavItem {
  href: string;        // landing route for the section
  label: string;       // Arabic primary label
  icon: LucideIcon;    // used by the mobile sheet
  match: string[];     // routes that make this section active (incl. href)
  children?: NavChild[]; // contextual secondary nav (≥2 → renders a subnav row)
}

export const NAV: NavItem[] = [
  { href: "/", label: "الرئيسية", icon: LayoutDashboard, match: ["/"] },
  {
    href: "/factures", label: "المبيعات", icon: Receipt,
    match: ["/factures", "/retours", "/caisse"],
    children: [
      { href: "/factures", label: "الفواتير" },
      { href: "/retours", label: "المرتجعات" },
      { href: "/caisse", label: "الصندوق" },
    ],
  },
  {
    href: "/produits", label: "المنتجات", icon: Package,
    match: ["/produits", "/categories"],
    children: [
      { href: "/produits", label: "المنتجات" },
      { href: "/categories", label: "الفئات" },
    ],
  },
  { href: "/stock", label: "المخزون", icon: Boxes, match: ["/stock"] },
  { href: "/camions", label: "الأسطول", icon: Truck, match: ["/camions"] },
  {
    href: "/clients", label: "الأعمال", icon: Briefcase,
    match: ["/clients", "/fournisseurs", "/achats"],
    children: [
      { href: "/clients", label: "العملاء" },
      { href: "/fournisseurs", label: "الموردون" },
      { href: "/achats", label: "أوامر الشراء" },
    ],
  },
  { href: "/rapports", label: "التقارير", icon: BarChart3, match: ["/rapports"] },
  { href: "/utilisateurs", label: "الإدارة", icon: Settings, match: ["/utilisateurs"] },
];

const norm = (path: string) => path.replace(/\/+$/, "") || "/";

export function isItemActive(item: NavItem, path: string): boolean {
  const p = norm(path);
  if (item.href === "/") return p === "/";
  return item.match.some((m) => p === m || p.startsWith(m + "/"));
}

/** The section the current route belongs to (for the contextual subnav). */
export function activeItem(path: string): NavItem | undefined {
  return NAV.find((i) => isItemActive(i, path));
}

export function isChildActive(child: NavChild, path: string): boolean {
  const p = norm(path);
  return p === child.href || p.startsWith(child.href + "/");
}
