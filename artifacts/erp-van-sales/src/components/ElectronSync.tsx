import { useState, useEffect, useCallback, useRef } from "react";
import {
  CloudOff, RefreshCw, CheckCircle, AlertCircle,
  X, Download, Upload, CloudCog,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

declare global {
  interface Window {
    electronAPI?: {
      checkOnline:              () => Promise<boolean>;
      getVersion:               () => Promise<string>;
      backupDb:                 (dest?: string) => Promise<{ success: boolean; path?: string; canceled?: boolean; error?: string }>;
      restoreDb:                (src?: string)  => Promise<{ success: boolean; canceled?: boolean; error?: string }>;
      isElectron:               boolean;
      getSyncStatus:            () => Promise<SyncStatus>;
      saveSyncCredentials:      (creds: { username: string; password: string }) => Promise<{ ok: boolean; error?: string }>;
      triggerSync:              () => Promise<{ ok: boolean }>;
      onSyncStatus:             (cb: (s: SyncStatus) => void) => void;
      removeSyncStatusListener: () => void;
    };
  }
}

interface SyncStatus {
  online: boolean;
  syncing: boolean;
  lastSync: string | null;
  error: string | null;
  pending: number;
}

const DEFAULT_STATUS: SyncStatus = {
  online: false, syncing: false, lastSync: null, error: null, pending: 0,
};

function formatTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("ar-DZ", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

// ─── Unified adapter ─────────────────────────────────────────────────────────
// Wraps either Electron IPC or local REST API so the UI doesn't care which.

type DesktopMode = "electron" | "standalone";

async function restGetStatus(): Promise<SyncStatus> {
  const r = await fetch("/api/sync/status");
  if (!r.ok) throw new Error("status error");
  return r.json();
}

async function restSaveCreds(username: string, password: string): Promise<void> {
  const r = await fetch("/api/sync/credentials", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  if (!r.ok) throw new Error("credentials error");
}

async function restTrigger(): Promise<void> {
  await fetch("/api/sync/trigger", { method: "POST" });
}

// ─── Component ───────────────────────────────────────────────────────────────

export function ElectronSyncButton() {
  const [mode, setMode] = useState<DesktopMode | null>(null);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>(DEFAULT_STATUS);
  const [open, setOpen] = useState(false);

  const [autoUsername, setAutoUsername] = useState("");
  const [autoPassword, setAutoPassword] = useState("")  ;
  const [savingCreds, setSavingCreds] = useState(false);
  const [credsMsg, setCredsMsg] = useState<string | null>(null);

  const [backingUp, setBackingUp] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [confirmRestore, setConfirmRestore] = useState(false);

  const { toast } = useToast();
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Detect desktop mode on mount ──────────────────────────────────────────
  useEffect(() => {
    if (window.electronAPI?.isElectron) {
      setMode("electron");
      return;
    }
    // Try standalone REST endpoint (exists only when running inside installer)
    const ctrl = new AbortController();
    fetch("/api/sync/status", { signal: ctrl.signal })
      .then(r => { if (r.ok) setMode("standalone"); })
      .catch(() => {});
    return () => ctrl.abort();
  }, []);

  // ── Status fetching ───────────────────────────────────────────────────────
  const fetchStatus = useCallback(async () => {
    if (!mode) return;
    try {
      if (mode === "electron") {
        const s = await window.electronAPI!.getSyncStatus();
        if (s) setSyncStatus(s);
      } else {
        const s = await restGetStatus();
        setSyncStatus(s);
      }
    } catch {}
  }, [mode]);

  // Initial fetch + Electron push events
  useEffect(() => {
    if (!mode) return undefined;
    fetchStatus();

    if (mode === "electron" && window.electronAPI?.onSyncStatus) {
      window.electronAPI.onSyncStatus(s => setSyncStatus(s));
      return () => window.electronAPI?.removeSyncStatusListener?.();
    }
    return undefined;
  }, [mode, fetchStatus]);

  // Poll every 5 s (both modes — Electron as fallback, standalone as primary)
  useEffect(() => {
    if (!mode) return;
    pollRef.current = setInterval(fetchStatus, 5000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [mode, fetchStatus]);

  // ── Actions ───────────────────────────────────────────────────────────────
  const handleTrigger = useCallback(async () => {
    if (!mode) return;
    try {
      if (mode === "electron") await window.electronAPI?.triggerSync?.();
      else await restTrigger();
      // Refresh status after a short delay
      setTimeout(fetchStatus, 800);
    } catch {}
  }, [mode, fetchStatus]);

  const handleSaveCreds = useCallback(async () => {
    if (!autoUsername || !autoPassword || !mode) return;
    setSavingCreds(true); setCredsMsg(null);
    try {
      if (mode === "electron") {
        await window.electronAPI?.saveSyncCredentials?.({ username: autoUsername, password: autoPassword });
      } else {
        await restSaveCreds(autoUsername, autoPassword);
      }
      setCredsMsg("تم حفظ البيانات — المزامنة تعمل تلقائياً");
      setAutoPassword("");
      toast({ title: "تم الحفظ", description: "ستبدأ المزامنة التلقائية خلال لحظات" });
      setTimeout(fetchStatus, 2000);
    } catch {
      setCredsMsg("خطأ في الحفظ، تحقق من البيانات");
    } finally {
      setSavingCreds(false);
    }
  }, [autoUsername, autoPassword, mode, fetchStatus, toast]);

  // Standalone: hidden file input ref for restore
  const restoreInputRef = useRef<HTMLInputElement>(null);
  const [pendingRestoreFile, setPendingRestoreFile] = useState<File | null>(null);

  const handleBackup = async () => {
    if (!mode) return;
    if (mode === "electron") {
      setBackingUp(true);
      try {
        const result = await window.electronAPI!.backupDb();
        if (result.canceled) return;
        if (result.success) {
          toast({ title: "✅ تم حفظ النسخة الاحتياطية", description: result.path });
        } else {
          toast({ title: "❌ فشل الحفظ", description: result.error, variant: "destructive" });
        }
      } finally {
        setBackingUp(false);
      }
    } else {
      // Standalone: trigger browser download
      window.location.href = "/api/backup/download";
    }
  };

  // Standalone restore: file picked → show confirm dialog
  const handleRestoreFilePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPendingRestoreFile(file);
    setConfirmRestore(true);
    e.target.value = "";
  };

  const handleRestoreConfirmed = async () => {
    if (!mode) return;
    setRestoring(true);
    try {
      if (mode === "electron") {
        const result = await window.electronAPI!.restoreDb();
        if (result.canceled) return;
        if (!result.success) {
          toast({ title: "❌ فشلت الاستعادة", description: result.error, variant: "destructive" });
          return;
        }
      } else {
        if (!pendingRestoreFile) return;
        const buf = await pendingRestoreFile.arrayBuffer();
        const b64 = btoa(String.fromCharCode(...new Uint8Array(buf)));
        const r = await fetch("/api/backup/restore", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ data: b64 }),
        });
        if (!r.ok) {
          const err = await r.json().catch(() => ({ error: "فشل الاتصال" }));
          toast({ title: "❌ فشلت الاستعادة", description: err.error, variant: "destructive" });
          return;
        }
        setPendingRestoreFile(null);
      }
      toast({
        title: "✅ تمت الاستعادة بنجاح",
        description: "سيُعاد تشغيل البرنامج خلال لحظات...",
      });
    } finally {
      setRestoring(false);
    }
  };

  // ── Render guard ──────────────────────────────────────────────────────────
  if (!mode) return null;

  const { online, syncing, error } = syncStatus;
  const dotClass = syncing
    ? "bg-blue-400 animate-pulse"
    : error   ? "bg-red-400"
    : online   ? "bg-green-400"
    :            "bg-gray-400";

  const busy = savingCreds || backingUp || restoring;

  return (
    <>
      {/* ─── Header button ─── */}
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setOpen(true)}
        className="relative gap-2 text-xs px-2.5"
        title="المزامنة والنسخ الاحتياطي"
      >
        <CloudCog className="h-4 w-4" />
        <span
          className={cn(
            "absolute top-1.5 right-1.5 h-2 w-2 rounded-full border border-background",
            dotClass,
          )}
        />
        <span className="hidden sm:inline">
          {syncing ? "مزامنة..." : online ? "متصل" : "أوفلاين"}
        </span>
      </Button>

      {/* ─── Restore confirmation (both modes) ─── */}
      <AlertDialog open={confirmRestore} onOpenChange={setConfirmRestore}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>تأكيد استعادة البيانات</AlertDialogTitle>
            <AlertDialogDescription>
              سيتم <strong>استبدال جميع البيانات الحالية</strong> بالبيانات الموجودة في ملف النسخة الاحتياطية،
              ثم سيُعاد تشغيل البرنامج تلقائياً. هذا الإجراء لا يمكن التراجع عنه.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-row-reverse gap-2">
            <AlertDialogCancel onClick={() => setPendingRestoreFile(null)}>إلغاء</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleRestoreConfirmed}
            >
              نعم، استعادة البيانات
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Hidden file input for standalone restore */}
      <input
        ref={restoreInputRef}
        type="file"
        accept=".db"
        className="hidden"
        onChange={handleRestoreFilePick}
      />

      {/* ─── Main dialog ─── */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CloudCog className="h-5 w-5" />
              المزامنة التلقائية مع السيرفر
            </DialogTitle>
            <DialogDescription>
              البيانات تُزامَن تلقائياً كل 30 ثانية عند الاتصال بالإنترنت.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Status card */}
            <div className={cn(
              "flex items-start gap-3 p-3 rounded-lg border",
              online ? "bg-green-50 border-green-200" : "bg-gray-50 border-gray-200"
            )}>
              {syncing
                ? <RefreshCw className="h-5 w-5 text-blue-500 animate-spin shrink-0 mt-0.5" />
                : error
                ? <AlertCircle className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
                : online
                ? <CheckCircle className="h-5 w-5 text-green-600 shrink-0 mt-0.5" />
                : <CloudOff className="h-5 w-5 text-gray-400 shrink-0 mt-0.5" />
              }
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">
                    {syncing ? "جاري المزامنة..." : online ? "متصل بالسيرفر" : "غير متصل"}
                  </span>
                  <Badge variant="secondary" className={cn(
                    "text-xs",
                    online ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"
                  )}>
                    {online ? "Online" : "Offline"}
                  </Badge>
                </div>
                {error && <p className="text-xs text-red-600 mt-0.5 break-words">{error}</p>}
                {syncStatus.lastSync && (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    آخر مزامنة: {formatTime(syncStatus.lastSync)}
                  </p>
                )}
                {syncStatus.pending > 0 && (
                  <p className="text-xs text-amber-600 mt-0.5">{syncStatus.pending} سجل بانتظار الإرسال</p>
                )}
              </div>
            </div>

            <Button
              variant="outline"
              size="sm"
              className="w-full gap-2"
              onClick={handleTrigger}
              disabled={syncing}
            >
              <RefreshCw className={cn("h-3.5 w-3.5", syncing && "animate-spin")} />
              مزامنة الآن
            </Button>

            {/* Credentials form */}
            <div className="space-y-3 pt-1">
              <p className="text-xs font-medium text-muted-foreground">
                بيانات دخول السيرفر (deleveri.alllal.com)
              </p>
              <div className="space-y-2">
                <div>
                  <Label className="text-xs">اسم المستخدم</Label>
                  <Input
                    value={autoUsername}
                    onChange={e => setAutoUsername(e.target.value)}
                    placeholder="admin"
                    className="h-8 text-sm mt-1"
                    dir="ltr"
                  />
                </div>
                <div>
                  <Label className="text-xs">كلمة المرور</Label>
                  <Input
                    type="password"
                    value={autoPassword}
                    onChange={e => setAutoPassword(e.target.value)}
                    placeholder="••••••••"
                    className="h-8 text-sm mt-1"
                    dir="ltr"
                    onKeyDown={e => e.key === "Enter" && handleSaveCreds()}
                  />
                </div>
              </div>
              <Button
                size="sm"
                className="w-full"
                onClick={handleSaveCreds}
                disabled={busy || !autoUsername || !autoPassword}
              >
                {savingCreds ? "جاري الحفظ..." : "حفظ وبدء المزامنة التلقائية"}
              </Button>
              {credsMsg && (
                <p className="text-xs text-center text-muted-foreground">{credsMsg}</p>
              )}
              <p className="text-[10px] text-muted-foreground text-center">
                تُحفظ البيانات محلياً ولا تُرسل إلا للسيرفر المحدد أعلاه
              </p>
            </div>

            {/* Backup / Restore — both Electron and Standalone */}
            <Separator />
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground text-center">النسخ الاحتياطي المحلي</p>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleBackup}
                  disabled={busy}
                  className="gap-2 border-slate-300 text-slate-700 hover:bg-slate-50"
                >
                  {backingUp
                    ? <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                    : <Download className="h-3.5 w-3.5" />
                  }
                  {backingUp ? "جارٍ الحفظ..." : "نسخة احتياطية"}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    if (mode === "electron") setConfirmRestore(true);
                    else restoreInputRef.current?.click();
                  }}
                  disabled={busy}
                  className="gap-2 border-amber-300 text-amber-700 hover:bg-amber-50"
                >
                  {restoring
                    ? <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                    : <Upload className="h-3.5 w-3.5" />
                  }
                  {restoring ? "جارٍ الاستعادة..." : "استعادة البيانات"}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground text-center">
                💾 احفظ نسخة على قرص خارجي بشكل دوري
              </p>
            </div>

            <div className="flex justify-end">
              <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
                <X className="h-4 w-4 ml-1" />
                إغلاق
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
