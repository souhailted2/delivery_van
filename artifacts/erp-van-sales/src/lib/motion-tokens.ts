// SECOND CUT — KPI cards rise from BELOW with weight (translateY 28).
// At handover, the cards are guests entering the Operations Center at the
// operator's eye-level. Each card carries enough vertical travel for the
// rise to read as physical, not as a UI fade.
export const fadeUp = {
  hidden: { opacity: 0, y: 28 },
  show: { opacity: 1, y: 0 },
};

export const staggerContainer = {
  hidden: {},
  show: { transition: { staggerChildren: 0.05 } },
};

export const accentStyles = {
  primary: {
    icon: "bg-primary/15 text-primary ring-1 ring-primary/25",
    value: "text-foreground",
  },
  destructive: {
    icon: "bg-destructive/15 text-destructive ring-1 ring-destructive/25",
    value: "text-destructive",
  },
  warning: {
    icon: "bg-warning/15 text-warning ring-1 ring-warning/25",
    value: "text-foreground",
  },
  success: {
    icon: "bg-success/15 text-success ring-1 ring-success/25",
    value: "text-foreground",
  },
  muted: {
    icon: "bg-muted text-muted-foreground ring-1 ring-border",
    value: "text-foreground",
  },
} as const;

export type Accent = keyof typeof accentStyles;
