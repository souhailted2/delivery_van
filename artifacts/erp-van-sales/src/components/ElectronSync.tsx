import { useState, useEffect } from "react";
import { Cloud, CloudOff, RefreshCw, CheckCircle, AlertCircle, X, Download, Upload } from "lucide-react";
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
import { useToast } from "@/hooks/use-toast";

declare global {
  interface Window {
    electronAPI?: {
      checkOnline: () => Promise<boolean>;
      getVersion:  () => Promise<string>;
      backupDb:    () => Promise<{ success: boolean; path?: string; canceled?: boolean; error?: string }>;
      restoreDb:   () => Promise<{ success: boolean; canceled?: boolean; error?: string }>;
      isElectron: boolean;
    };
  }
}

export function ElectronSyncButton() {
  const [online, setOnline] = useState<boolean | null>(null);
  const [open, setOpen] = useState(false);
  const [loading, setSyncing] = useState(false);
  const [pulling, setPulling] = useState(false);
  const [pullingStock, setPullingStock] = useState(false);
  const [backingUp, setBackingUp] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [confirmRestore, setConfirmRestore] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [lastResult, setLastResult] = useState<{ success: boolean; message: string; errors?: string[] } | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    if (!window.electronAPI) return;
    const check = async () => {
      const isOnline = await window.electronAPI!.checkOnline();
      setOnline(isOnline);
    };
    check();
    const interval = setInterval(check, 30000);
    return () => clearInterval(interval);
  }, []);

  if (!window.electronAPI) return null;

  const handlePullStock = async () => {
    if (!username || !password) {
      toast({ title: "بيانات مطلوبة", description: "أدخل اسم المستخدم وكلمة المرور للسيرفر الرئيسي", variant: "destructive" });
      return;
    }
    setPullingStock(true);
    setLastResult(null);
    try {
      const res = await fetch("/api/sync/pull-stock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ remoteUsername: username, remotePassword: password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setLastResult({ success: false, message: data.error || "فشل سحب المخزون" });
      } else {
        setLastResult({ success: true, message: data.message });
        toast({ title: "تم سحب مخزون الفروع", description: data.message });
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "خطأ غير معروف";
      setLastResult({ success: false, message: "خطأ في الاتصال: " + message });
    } finally {
      setPullingStock(false);
    }
  };

  const handlePullUsers = async () => {
    if (!username || !password) {
      toast({ title: "بيانات مطلوبة", description: "أدخل اسم المستخدم وكلمة المرور للسيرفر الرئيسي", variant: "destructive" });
      return;
    }
    setPulling(true);
    setLastResult(null);
    try {
      const res = await fetch("/api/sync/pull-users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ remoteUsername: username, remotePassword: password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setLastResult({ success: false, message: data.error || "فشل سحب المستخدمين" });
      } else {
        setLastResult({ success: true, message: data.message });
        toast({ title: "تم سحب المستخدمين", description: data.message });
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "خطأ غير معروف";
      setLastResult({ success: false, message: "خطأ في الاتصال: " + message });
    } finally {
      setPulling(false);
    }
  };

  const handleSync = async () => {
    if (!username || !password) {
      toast({ title: "بيانات مطلوبة", description: "أدخل اسم المستخدم وكلمة المرور للسيرفر الرئيسي", variant: "destructive" });
      return;
    }
    setSyncing(true);
    setLastResult(null);
    try {
      const res = await fetch("/api/sync/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ remoteUsername: username, remotePassword: password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setLastResult({ success: false, message: data.error || "فشلت المزامنة" });
      } else {
        setLastResult({ success: true, message: data.message, errors: data.errors });
        toast({ title: "تمت المزامنة", description: data.message });
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "خطأ غير معروف";
      setLastResult({ success: false, message: "خطأ في الاتصال: " + message });
    } finally {
      setSyncing(false);
    }
  };

  const handleBackup = async () => {
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
  };

  const handleRestoreConfirmed = async () => {
    setRestoring(true);
    try {
      const result = await window.electronAPI!.restoreDb();
      if (result.canceled) return;
      if (!result.success) {
        toast({ title: "❌ فشلت الاستعادة", description: result.error, variant: "destructive" });
        return;
      }
      toast({
        title: "✅ تمت الاستعادة بنجاح",
        description: "سيُعاد تشغيل البرنامج خلال لحظات لتطبيق البيانات المستعادة...",
      });
    } finally {
      setRestoring(false);
    }
  };

  const busy = loading || pulling || pullingStock || backingUp || restoring;

  return (
    <>
      <Button
        variant={online ? "default" : "outline"}
        size="sm"
        onClick={() => setOpen(true)}
        className="gap-2 text-xs"
        title={online ? "متصل — انقر للمزامنة" : "غير متصل — وضع أوفلاين"}
      >
        {online ? <Cloud className="h-3.5 w-3.5" /> : <CloudOff className="h-3.5 w-3.5" />}
        {online ? "مزامنة" : "أوفلاين"}
      </Button>

      {/* ─── Restore confirmation dialog ─── */}
      <AlertDialog open={confirmRestore} onOpenChange={setConfirmRestore}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>تأكيد استعادة البيانات</AlertDialogTitle>
            <AlertDialogDescription>
              سيتم <strong>استبدال جميع البيانات الحالية</strong> بالبيانات الموجودة في ملف النسخة الاحتياطية،
              ثم سيُعاد تشغيل البرنامج تلقائياً. هذا الإجراء لا يمكن التراجع عنه.
              <br /><br />
              هل أنت متأكد من المتابعة؟
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-row-reverse gap-2">
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleRestoreConfirmed}
            >
              نعم، استعادة البيانات
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ─── Main sync dialog ─── */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <RefreshCw className="h-5 w-5" />
              مزامنة مع السيرفر الرئيسي
            </DialogTitle>
            <DialogDescription>
              {online
                ? "أدخل بيانات دخول السيرفر الرئيسي على deleveri.alllal.com لرفع البيانات المحلية."
                : "لا يوجد اتصال بالإنترنت حالياً. المزامنة غير متاحة في وضع أوفلاين."}
            </DialogDescription>
          </DialogHeader>

          {!online ? (
            <div className="flex items-center gap-3 p-4 bg-orange-50 rounded-lg border border-orange-200">
              <CloudOff className="h-8 w-8 text-orange-500 shrink-0" />
              <div>
                <p className="font-medium text-orange-800">وضع أوفلاين</p>
                <p className="text-sm text-orange-600">جميع بياناتك محفوظة محلياً. عند توفر الإنترنت ستتمكن من المزامنة.</p>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="sync-username">اسم المستخدم (السيرفر الرئيسي)</Label>
                <Input
                  id="sync-username"
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  placeholder="admin"
                  dir="ltr"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="sync-password">كلمة المرور</Label>
                <Input
                  id="sync-password"
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  dir="ltr"
                />
              </div>

              {lastResult && (
                <div className={`flex items-start gap-3 p-3 rounded-lg border ${lastResult.success ? "bg-green-50 border-green-200" : "bg-red-50 border-red-200"}`}>
                  {lastResult.success
                    ? <CheckCircle className="h-5 w-5 text-green-600 shrink-0 mt-0.5" />
                    : <AlertCircle className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
                  }
                  <div className="flex-1">
                    <p className={`text-sm font-medium ${lastResult.success ? "text-green-800" : "text-red-800"}`}>
                      {lastResult.message}
                    </p>
                    {lastResult.errors && lastResult.errors.length > 0 && (
                      <ul className="mt-1 text-xs text-red-600 space-y-0.5">
                        {lastResult.errors.map((e, i) => <li key={i}>• {e}</li>)}
                      </ul>
                    )}
                  </div>
                </div>
              )}

              <div className="space-y-2 pt-2">
                <div className="flex gap-2">
                  <Button onClick={handleSync} disabled={busy} className="flex-1 gap-2">
                    {loading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Cloud className="h-4 w-4" />}
                    {loading ? "جارٍ الرفع..." : "رفع البيانات"}
                  </Button>
                  <Button variant="outline" onClick={() => setOpen(false)}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
                <Button
                  variant="outline"
                  onClick={handlePullUsers}
                  disabled={busy}
                  className="w-full gap-2 border-blue-200 text-blue-700 hover:bg-blue-50"
                >
                  {pulling ? <RefreshCw className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                  {pulling ? "جارٍ السحب..." : "سحب المستخدمين من السيرفر"}
                </Button>
                <Button
                  variant="outline"
                  onClick={handlePullStock}
                  disabled={busy}
                  className="w-full gap-2 border-green-200 text-green-700 hover:bg-green-50"
                >
                  {pullingStock ? <RefreshCw className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                  {pullingStock ? "جارٍ سحب المخزون..." : "سحب مخزون الفروع"}
                </Button>
              </div>

              <div className="text-xs text-muted-foreground space-y-0.5 text-center">
                <p>🔼 <strong>رفع البيانات</strong>: فئات، منتجات، موردون، عملاء، شاحنات، فواتير، مخزون، مستخدمون</p>
                <p>🔽 <strong>سحب المستخدمين</strong>: يجلب حسابات الدخول من السيرفر</p>
                <p>🔽 <strong>سحب مخزون الفروع</strong>: يجلب مخزون كل الفروع للعرض (قراءة فقط)</p>
              </div>
            </div>
          )}

          {/* ─── Backup / Restore section (always visible in Electron) ─── */}
          <Separator />
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground text-center">النسخ الاحتياطي المحلي</p>
            <div className="grid grid-cols-2 gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleBackup}
                disabled={backingUp || restoring}
                className="gap-2 border-slate-300 text-slate-700 hover:bg-slate-50"
              >
                {backingUp
                  ? <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                  : <Download className="h-3.5 w-3.5" />
                }
                {backingUp ? "جارٍ الحفظ..." : "إنشاء نسخة احتياطية"}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setConfirmRestore(true)}
                disabled={backingUp || restoring}
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
              💾 احفظ نسخة على قرص خارجي قبل إعادة تثبيت البرنامج
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
