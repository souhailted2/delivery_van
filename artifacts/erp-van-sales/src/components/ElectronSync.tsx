import { useState, useEffect, useCallback, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  CloudOff, RefreshCw, CheckCircle, AlertCircle,
  X, Download, Upload, CloudCog, ChevronDown, ChevronUp,
  Wifi, WifiOff,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
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
      resetSync:                () => Promise<{ ok: boolean }>;
      onSyncStatus:             (cb: (s: SyncStatus) => void) => void;
      removeSyncStatusListener: () => void;
    };
  }
}

interface PullTableDetail {
  received: number;
  written: number;
  error: string | null;
}

interface SyncStatus {
  online: boolean;
  syncing: boolean;
  lastSync: string | null;
  error: string | null;
  pending: number;
  lastPullReceived?: number;
  lastPullWritten?: number;
  lastPullFirstError?: string | null;
  lastPullTables?: Record<string, PullTableDetail>;
}

interface SqliteCounts { [table: string]: number | string; }

async function fetchSqliteCounts(): Promise<SqliteCounts> {
  try {
    const r = await fetch("/api/debug/sqlite-counts");
    if (!r.ok) return {};
    const { counts } = await r.json();
    return counts || {};
  } catch { return {}; }
}

const DEFAULT_STATUS: SyncStatus = {
  online: false, syncing: false, lastSync: null, error: null, pending: 0,
};

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  const today = new Date();
  const timeStr = d.toLocaleTimeString("ar-DZ", { hour: "2-digit", minute: "2-digit" });
  if (d.toDateString() === today.toDateString()) return `اليوم ${timeStr}`;
  return d.toLocaleDateString("ar-DZ", { month: "short", day: "numeric" }) + " " + timeStr;
}

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

async function restResetSync(): Promise<void> {
  await fetch("/api/sync/reset", { method: "POST" });
}

// ─── Component ───────────────────────────────────────────────────────────────

export function ElectronSyncButton() {
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<DesktopMode | null>(null);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>(DEFAULT_STATUS);
  const prevSyncing = useRef(false);
  const [open, setOpen] = useState(false);

  const [autoUsername, setAutoUsername] = useState("");
  const [autoPassword, setAutoPassword] = useState("");
  const [savingCreds, setSavingCreds] = useState(false);
  const [credsMsg, setCredsMsg] = useState<string | null>(null);
  const [showCreds, setShowCreds] = useState(false);

  const [backingUp, setBackingUp]   = useState(false);
  const [restoring, setRestoring]   = useState(false);
  const [confirmRestore, setConfirmRestore] = useState(false);
  const [confirmReset, setConfirmReset]     = useState(false);
  const [resetting, setResetting]   = useState(false);
  const [sqliteCounts, setSqliteCounts] = useState<SqliteCounts | null>(null);

  const { toast } = useToast();
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Detect desktop mode on mount ──────────────────────────────────────────
  useEffect(() => {
    if (window.electronAPI?.isElectron) {
      setMode("electron");
      return;
    }
    // The cloud web ALSO exposes /api/sync/status (it's the v2 sync endpoint),
    // so a 200 there does NOT mean we're on the desktop standalone server — and
    // activating this desktop-only sync UI on the cloud site shows a broken
    // dialog (offline + "credentials" calls to routes that don't exist there).
    // The desktop standalone server is only ever served from localhost, so gate
    // standalone detection on the hostname.
    const host = window.location.hostname;
    const isLocal = host === "localhost" || host === "127.0.0.1" || host === "[::1]";
    if (!isLocal) return;
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

  useEffect(() => {
    if (!mode) return undefined;
    fetchStatus();
    if (mode === "electron" && window.electronAPI?.onSyncStatus) {
      window.electronAPI.onSyncStatus(s => setSyncStatus(s));
      return () => window.electronAPI?.removeSyncStatusListener?.();
    }
    return undefined;
  }, [mode, fetchStatus]);

  useEffect(() => {
    if (!mode) return;
    pollRef.current = setInterval(fetchStatus, 5000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [mode, fetchStatus]);

  // Fetch counts when dialog opens
  useEffect(() => {
    if (open && mode) {
      fetchSqliteCounts().then(setSqliteCounts);
    }
  }, [open, mode]);

  // Invalidate caches + refresh counts after sync completes
  useEffect(() => {
    if (prevSyncing.current && !syncStatus.syncing && !syncStatus.error && syncStatus.lastSync) {
      queryClient.invalidateQueries();
      fetchSqliteCounts().then(setSqliteCounts);
    }
    prevSyncing.current = syncStatus.syncing;
  }, [syncStatus.syncing, syncStatus.error, syncStatus.lastSync, queryClient]);

  // ── Actions ───────────────────────────────────────────────────────────────
  const handleTrigger = useCallback(async () => {
    if (!mode) return;
    try {
      if (mode === "electron") await window.electronAPI?.triggerSync?.();
      else await restTrigger();
      setTimeout(fetchStatus, 800);
    } catch {}
  }, [mode, fetchStatus]);

  const handleResetSync = useCallback(async () => {
    if (!mode) return;
    setResetting(true);
    try {
      if (mode === "electron") await window.electronAPI?.resetSync?.();
      else await restResetSync();
      toast({ title: "✅ تمت إعادة الضبط", description: "ستبدأ مزامنة كاملة خلال لحظات..." });
      setTimeout(fetchStatus, 1500);
    } catch {
      toast({ title: "❌ فشل", description: "تعذّرت إعادة الضبط", variant: "destructive" });
    } finally {
      setResetting(false);
      setConfirmReset(false);
    }
  }, [mode, fetchStatus, toast]);

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
      setShowCreds(false);
      toast({ title: "تم الحفظ", description: "ستبدأ المزامنة التلقائية خلال لحظات" });
      setTimeout(fetchStatus, 2000);
    } catch {
      setCredsMsg("خطأ في الحفظ، تحقق من البيانات");
    } finally {
      setSavingCreds(false);
    }
  }, [autoUsername, autoPassword, mode, fetchStatus, toast]);

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
      } finally { setBackingUp(false); }
    } else {
      window.location.href = "/api/backup/download";
    }
  };

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
      toast({ title: "✅ تمت الاستعادة بنجاح", description: "سيُعاد تشغيل البرنامج خلال لحظات..." });
    } finally { setRestoring(false); }
  };

  if (!mode) return null;

  const { online, syncing, error } = syncStatus;
  const busy = savingCreds || backingUp || restoring || resetting;

  const dotClass = syncing
    ? "bg-blue-400 animate-pulse"
    : error   ? "bg-red-400"
    : online   ? "bg-green-400"
    :            "bg-gray-300";

  const totalLocal = sqliteCounts
    ? Object.values(sqliteCounts).reduce<number>((sum, v) => sum + (typeof v === "number" ? v : 0), 0)
    : null;

  const DATA_TABLES: [string, string][] = [
    ["trucks","الشاحنات"], ["clients","العملاء"], ["products","المنتجات"],
    ["invoices","الفواتير"], ["returns","المرتجعات"], ["purchases","الطلبات"],
  ];

  return (
    <>
      {/* ─── Header button ─── */}
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setOpen(true)}
        className="relative gap-1.5 text-xs px-2.5"
        title="المزامنة والنسخ الاحتياطي"
      >
        <CloudCog className="h-4 w-4" />
        <span className={cn("absolute top-1.5 right-1.5 h-2 w-2 rounded-full border border-background", dotClass)} />
        <span className="hidden sm:inline text-xs">
          {syncing ? "مزامنة..." : online ? "متصل" : "أوفلاين"}
        </span>
      </Button>

      {/* ─── Reset confirmation ─── */}
      <AlertDialog open={confirmReset} onOpenChange={setConfirmReset}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>إعادة ضبط المزامنة</AlertDialogTitle>
            <AlertDialogDescription>
              سيتم مسح سجل المزامنة وإجراء مزامنة كاملة من السيرفر.
              لن تُفقد أي بيانات محلية.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-row-reverse gap-2">
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction onClick={handleResetSync} disabled={resetting}>
              {resetting ? "جاري الضبط..." : "تأكيد"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ─── Restore confirmation ─── */}
      <AlertDialog open={confirmRestore} onOpenChange={setConfirmRestore}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>تأكيد استعادة البيانات</AlertDialogTitle>
            <AlertDialogDescription>
              سيتم استبدال جميع البيانات الحالية بالبيانات الموجودة في ملف النسخة الاحتياطية.
              هذا الإجراء لا يمكن التراجع عنه.
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
        <DialogContent className="max-w-sm p-0 overflow-hidden" dir="rtl">
          <DialogHeader className="px-5 pt-5 pb-0">
            <DialogTitle className="flex items-center gap-2 text-base">
              <CloudCog className="h-4 w-4 text-muted-foreground" />
              المزامنة مع السيرفر
            </DialogTitle>
          </DialogHeader>

          <div className="px-5 pb-5 space-y-4 mt-3">

            {/* ── Status card ── */}
            <div className={cn(
              "rounded-xl border p-4 space-y-2 transition-colors",
              syncing ? "bg-blue-50 border-blue-200" :
              error   ? "bg-red-50 border-red-200"   :
              online  ? "bg-green-50 border-green-200":
                        "bg-gray-50 border-gray-200"
            )}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {syncing
                    ? <RefreshCw className="h-4 w-4 text-blue-500 animate-spin" />
                    : error
                    ? <AlertCircle className="h-4 w-4 text-red-500" />
                    : online
                    ? <Wifi className="h-4 w-4 text-green-600" />
                    : <WifiOff className="h-4 w-4 text-gray-400" />
                  }
                  <span className={cn(
                    "text-sm font-semibold",
                    syncing ? "text-blue-700" :
                    error   ? "text-red-700"   :
                    online  ? "text-green-700" :
                              "text-gray-500"
                  )}>
                    {syncing ? "جاري المزامنة..." :
                     error   ? "خطأ في المزامنة"  :
                     online  ? "متصل بالسيرفر"    :
                               "غير متصل"}
                  </span>
                </div>
                {syncStatus.lastSync && (
                  <span className="text-xs text-muted-foreground">{formatDate(syncStatus.lastSync)}</span>
                )}
              </div>

              {error && (
                <p className="text-xs text-red-600 bg-red-100 rounded p-2 break-words">{error}</p>
              )}

              {syncStatus.pending > 0 && !syncing && (
                <div className="flex items-center gap-1.5 text-xs text-amber-700 bg-amber-50 rounded px-2 py-1.5 border border-amber-200">
                  <Upload className="h-3 w-3 shrink-0" />
                  <span>{syncStatus.pending} سجل بانتظار الإرسال للسيرفر</span>
                </div>
              )}

              {!error && online && !syncing && syncStatus.lastSync && (
                <div className="flex items-center gap-1.5 text-xs text-green-700">
                  <CheckCircle className="h-3 w-3" />
                  <span>البيانات محدّثة — تزامن تلقائي كل 60 ثانية</span>
                </div>
              )}
            </div>

            {/* ── Data summary grid ── */}
            {sqliteCounts && (
              <div className="rounded-xl border bg-muted/20 p-3">
                <div className="flex items-center justify-between mb-2.5">
                  <p className="text-xs font-medium text-muted-foreground">البيانات المحلية</p>
                  {totalLocal !== null && totalLocal > 0 && (
                    <span className="text-xs font-bold text-foreground">{totalLocal.toLocaleString()} سجل</span>
                  )}
                </div>
                <div className="grid grid-cols-3 gap-1.5">
                  {DATA_TABLES.map(([key, label]) => {
                    const count = typeof sqliteCounts[key] === "number" ? (sqliteCounts[key] as number) : null;
                    const hasData = count !== null && count > 0;
                    return (
                      <div key={key} className={cn(
                        "rounded-lg p-2 text-center border transition-colors",
                        hasData ? "bg-white border-green-100" : "bg-background border-border"
                      )}>
                        <p className={cn(
                          "text-lg font-bold leading-none",
                          hasData ? "text-green-700" : "text-muted-foreground"
                        )}>
                          {count ?? "—"}
                        </p>
                        <p className="text-[10px] text-muted-foreground mt-0.5 leading-tight">{label}</p>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ── Action buttons ── */}
            <div className="flex gap-2">
              <Button
                size="sm"
                className="flex-1 gap-2"
                onClick={handleTrigger}
                disabled={busy}
              >
                <RefreshCw className={cn("h-3.5 w-3.5", syncing && "animate-spin")} />
                مزامنة الآن
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 text-orange-600 border-orange-200 hover:bg-orange-50 hover:text-orange-700"
                onClick={() => setConfirmReset(true)}
                disabled={busy}
                title="مزامنة كاملة من الصفر"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                إعادة الضبط
              </Button>
            </div>

            <Separator />

            {/* ── Credentials (collapsible) ── */}
            <div>
              <button
                className="w-full flex items-center justify-between text-xs font-medium text-muted-foreground hover:text-foreground transition-colors py-0.5"
                onClick={() => setShowCreds(v => !v)}
              >
                <span>بيانات الدخول للسيرفر</span>
                {showCreds
                  ? <ChevronUp className="h-3.5 w-3.5" />
                  : <ChevronDown className="h-3.5 w-3.5" />
                }
              </button>

              {credsMsg && !showCreds && (
                <p className="text-xs text-green-700 mt-1 flex items-center gap-1">
                  <CheckCircle className="h-3 w-3" /> {credsMsg}
                </p>
              )}

              {showCreds && (
                <div className="space-y-2 mt-3">
                  <p className="text-[11px] text-muted-foreground">السيرفر: deleveri.alllal.com</p>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label className="text-xs">المستخدم</Label>
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
                    {savingCreds ? "جاري الحفظ..." : "حفظ وبدء المزامنة"}
                  </Button>
                  {credsMsg && (
                    <p className="text-xs text-center text-muted-foreground">{credsMsg}</p>
                  )}
                </div>
              )}
            </div>

            <Separator />

            {/* ── Backup / Restore ── */}
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">النسخ الاحتياطي</p>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleBackup}
                  disabled={busy}
                  className="gap-1.5"
                >
                  {backingUp
                    ? <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                    : <Download className="h-3.5 w-3.5" />
                  }
                  {backingUp ? "جارٍ..." : "نسخة احتياطية"}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    if (mode === "electron") setConfirmRestore(true);
                    else restoreInputRef.current?.click();
                  }}
                  disabled={busy}
                  className="gap-1.5 text-amber-700 border-amber-200 hover:bg-amber-50"
                >
                  {restoring
                    ? <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                    : <Upload className="h-3.5 w-3.5" />
                  }
                  {restoring ? "جارٍ..." : "استعادة"}
                </Button>
              </div>
            </div>

            {/* ── Close ── */}
            <div className="flex justify-center pt-1">
              <Button variant="ghost" size="sm" onClick={() => setOpen(false)} className="text-xs text-muted-foreground gap-1">
                <X className="h-3.5 w-3.5" />
                إغلاق
              </Button>
            </div>

          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
