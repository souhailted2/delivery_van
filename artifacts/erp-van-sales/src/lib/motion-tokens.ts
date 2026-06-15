export const fadeUp = {
  hidden: { opacity: 0, y: 16 },
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
