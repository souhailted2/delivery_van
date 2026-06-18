import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import { fadeUp, accentStyles, type Accent } from "@/lib/motion-tokens";
import type { LucideIcon } from "lucide-react";

export function StatCard({
  label,
  value,
  icon: Icon,
  accent = "muted",
  hint,
  index = 0,
  reveal = true,
}: {
  label: string;
  value: string | number;
  icon: LucideIcon;
  accent?: Accent;
  hint?: string;
  index?: number;
  /** When false the card stays hidden — used to gate the Dashboard reveal to
   *  the cinematic curtain-lift. Defaults true so every other page is normal. */
  reveal?: boolean;
}) {
  const styles = accentStyles[accent];
  return (
    <motion.div
      variants={fadeUp}
      initial="hidden"
      animate={reveal ? "show" : "hidden"}
      transition={{ duration: 0.55, delay: index * 0.08, ease: [0.22, 1, 0.36, 1] }}
    >
      <Card className="overflow-hidden border-card-border bg-card/88 backdrop-blur-md transition-shadow hover:shadow-lg hover:shadow-black/30">
        <CardContent className="flex items-center justify-between gap-4 p-5">
          <div className="space-y-1.5">
            <p className="text-sm font-medium text-muted-foreground">{label}</p>
            <p className={cn("text-2xl font-bold tracking-tight", styles.value)}>{value}</p>
            {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
          </div>
          <div className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-xl", styles.icon)}>
            <Icon className="h-5 w-5" />
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
