// ALLAL Command Bar — contextual secondary navigation.
//
// Renders ONLY when the active section carries children (المبيعات / المنتجات /
// الأعمال). A slim glass row of the section's pages; the Dashboard and the
// other singletons show nothing → the Operations Center stays the hero.

import { Link, useLocation } from "wouter";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";
import { activeItem, isChildActive } from "./nav";

export function SectionSubnav() {
  const [location] = useLocation();
  const reduce = useReducedMotion();
  const section = activeItem(location);
  const children = section?.children;
  const show = !!children && children.length > 1;

  return (
    <AnimatePresence mode="wait" initial={false}>
      {show && (
        <motion.div
          key={section!.href}
          initial={reduce ? { opacity: 0 } : { opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={reduce ? { opacity: 0 } : { opacity: 0, y: -6 }}
          transition={{ duration: reduce ? 0.12 : 0.22, ease: [0.22, 1, 0.36, 1] }}
          className="sticky top-16 z-30 border-b border-white/5 bg-background/30 backdrop-blur-lg"
        >
          <nav
            aria-label={`أقسام ${section!.label}`}
            className="flex h-11 items-center gap-1 overflow-x-auto px-4 lg:px-6"
          >
            {children!.map((c) => {
              const active = isChildActive(c, location);
              return (
                <Link
                  key={c.href}
                  href={c.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "relative whitespace-nowrap rounded-lg px-3 py-1.5 text-[0.85rem] transition-colors",
                    active
                      ? "font-semibold text-primary"
                      : "font-medium text-foreground/55 hover:text-foreground"
                  )}
                >
                  {c.label}
                  {active && (
                    <motion.span
                      layoutId="subnav-underline"
                      className="absolute inset-x-3 -bottom-px h-0.5 rounded-full bg-primary"
                      transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 380, damping: 30 }}
                    />
                  )}
                </Link>
              );
            })}
          </nav>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
