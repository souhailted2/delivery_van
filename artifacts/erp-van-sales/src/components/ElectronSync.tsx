import { useState, useEffect } from "react";
import { Cloud, CloudOff, RefreshCw, CheckCircle, AlertCircle, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";

declare global {
  interface Window {
    electronAPI?: {
      checkOnline: () => Promise<boolean>;
      getVersion: () => Promise<string>;
      isElectron: boolean;
    };
  }
}

export function ElectronSyncButton() {
  const [online, setOnline] = useState<boolean | null>(null);
  const [open, setOpen] = useState(false);
  const [loading, setSyncing] = useState(false);
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

              <div className="flex gap-2 pt-2">
                <Button onClick={handleSync} disabled={loading} className="flex-1 gap-2">
                  {loading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Cloud className="h-4 w-4" />}
                  {loading ? "جارٍ المزامنة..." : "بدء المزامنة"}
                </Button>
                <Button variant="outline" onClick={() => setOpen(false)}>
                  <X className="h-4 w-4" />
                </Button>
              </div>

              <p className="text-xs text-muted-foreground text-center">
                سيتم رفع: الفئات، المنتجات، الموردون، العملاء، الشاحنات
              </p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
