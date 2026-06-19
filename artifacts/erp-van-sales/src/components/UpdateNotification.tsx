import { useEffect } from "react";
import { toast } from "sonner";

/**
 * Wires up electron-updater events when running inside the Electron desktop
 * app. In a browser (web admin) this component renders nothing and adds no
 * listeners. Shows a sonner toast for "downloading" and a persistent
 * "restart to install" toast once the update is ready.
 */
export function UpdateNotification() {
  useEffect(() => {
    const api = window.electronAPI;
    if (!api?.isElectron) return;

    api.onUpdateAvailable?.(() => {
      toast.info("جارٍ تنزيل تحديث جديد...", {
        duration: 6000,
        description: "سيتم التثبيت تلقائياً عند إعادة التشغيل",
      });
    });

    api.onUpdateDownloaded?.(() => {
      toast.success("التحديث جاهز للتثبيت", {
        description: "أعد تشغيل التطبيق لتطبيق التحديث الجديد",
        duration: Infinity,
        action: {
          label: "إعادة التشغيل الآن",
          onClick: () => api.installUpdate?.(),
        },
      });
    });
  }, []);

  return null;
}
