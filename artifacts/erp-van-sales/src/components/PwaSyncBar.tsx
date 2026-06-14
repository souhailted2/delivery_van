/**
 * PWA Sync status button — shown in the header toolbar.
 * Shows online/offline status, last sync time, and pending count.
 * Clicking triggers an immediate sync.
 */
import { usePwaSync } from "@/contexts/PwaSyncContext";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { RefreshCw, Wifi, WifiOff, CloudOff, Cloud, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

function timeAgo(iso: string | null): string {
  if (!iso) return "لم تتم بعد";
  const diffMs = Date.now() - new Date(iso).getTime();
  const diffS  = Math.floor(diffMs / 1000);
  if (diffS < 5)  return "الآن";
  if (diffS < 60) return `منذ ${diffS} ثانية`;
  const diffM = Math.floor(diffS / 60);
  if (diffM < 60) return `منذ ${diffM} دقيقة`;
  const diffH = Math.floor(diffM / 60);
  return `منذ ${diffH} ساعة`;
}

export function PwaSyncBar() {
  const { online, syncing, lastSync, error, pending, syncNow, resetAndSync } = usePwaSync();

  const dotColor = !online
    ? "bg-gray-400"
    : syncing
    ? "bg-amber-400 animate-pulse"
    : error
    ? "bg-red-500"
    : "bg-emerald-500";

  const Icon = !online ? WifiOff : syncing ? RefreshCw : error ? AlertCircle : Cloud;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 gap-1.5 px-2 text-xs font-normal"
          aria-label="حالة المزامنة"
        >
          <span className={cn("h-2 w-2 rounded-full shrink-0", dotColor)} />
          <Icon className={cn("h-3.5 w-3.5", syncing && "animate-spin")} />
          {pending > 0 && (
            <Badge variant="destructive" className="h-4 min-w-4 px-1 text-[10px] leading-none">
              {pending}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>

      <PopoverContent align="end" className="w-64 p-3 text-sm" dir="rtl">
        {/* Status row */}
        <div className="flex items-center gap-2 mb-3">
          <span className={cn("h-2.5 w-2.5 rounded-full shrink-0", dotColor)} />
          <span className="font-medium">
            {!online
              ? "غير متصل بالإنترنت"
              : syncing
              ? "جارٍ المزامنة…"
              : error
              ? "خطأ في المزامنة"
              : "متصل ومزامَن"}
          </span>
        </div>

        {/* Details */}
        <div className="space-y-1.5 text-xs text-muted-foreground mb-3">
          <div className="flex justify-between">
            <span>آخر مزامنة</span>
            <span className="font-medium text-foreground">{timeAgo(lastSync)}</span>
          </div>
          {pending > 0 && (
            <div className="flex justify-between">
              <span>في انتظار المزامنة</span>
              <span className="font-medium text-amber-600">{pending} سجل</span>
            </div>
          )}
          {error && (
            <p className="text-red-500 text-[11px] mt-1 leading-snug">{error}</p>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-2">
          <Button
            size="sm"
            className="flex-1 h-7 text-xs"
            onClick={syncNow}
            disabled={syncing || !online}
          >
            <RefreshCw className={cn("ml-1.5 h-3 w-3", syncing && "animate-spin")} />
            مزامنة الآن
          </Button>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="sm"
                variant="outline"
                className="h-7 px-2 text-xs"
                onClick={resetAndSync}
                disabled={syncing || !online}
              >
                <CloudOff className="h-3 w-3" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">إعادة تنزيل كل البيانات</TooltipContent>
          </Tooltip>
        </div>
      </PopoverContent>
    </Popover>
  );
}
