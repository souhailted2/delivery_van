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
}: {
  label: string;
  value: string | number;
  icon: LucideIcon;
  accent?: Accent;
  hint?: string;
  index?: number;
}) {
  const styles = accentStyles[accent];
  return (
    <motion.div
      variants={fadeUp}
      initial="hidden"
      animate="show"
      transition={{ duration: 0.35, delay: index * 0.05, ease: "easeOut" }}
    >
      <Card className="overflow-hidden border-card-border bg-card/60 backdrop-blur-sm transition-shadow hover:shadow-lg hover:shadow-black/5">
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
