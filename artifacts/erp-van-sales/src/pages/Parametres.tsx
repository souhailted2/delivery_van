import { useState, useEffect } from "react";
import { useGetCompanySettings, useUpdateCompanySettings, getGetCompanySettingsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { useLocation } from "wouter";
import { Settings, Store, Phone, MapPin, Loader2, Save } from "lucide-react";

export default function Parametres() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();

  // Redirect non-admin users immediately
  useEffect(() => {
    if (user && user.role !== "admin") {
      setLocation("/");
    }
  }, [user, setLocation]);

  const { data: settings, isLoading } = useGetCompanySettings();
  const updateSettings = useUpdateCompanySettings();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [storeName, setStoreName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");

  useEffect(() => {
    if (settings) {
      setStoreName(settings.storeName ?? "");
      setPhone(settings.phone ?? "");
      setAddress(settings.address ?? "");
    }
  }, [settings]);

  const handleSave = () => {
    updateSettings.mutate(
      { data: { storeName, phone, address } },
      {
        onSuccess: (updated) => {
          queryClient.setQueryData(getGetCompanySettingsQueryKey(), updated);
          toast({ title: "تم الحفظ", description: "تم تحديث بيانات الشركة بنجاح" });
        },
        onError: () => {
          toast({ title: "خطأ", description: "تعذّر حفظ البيانات", variant: "destructive" });
        },
      }
    );
  };

  if (!user || user.role !== "admin") return null;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Settings className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-2xl font-bold">إعدادات النظام</h1>
          <p className="text-muted-foreground text-sm">تخصيص بيانات المتجر التي تظهر في الإيصالات</p>
        </div>
      </div>

      <Card className="max-w-xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Store className="h-5 w-5 text-primary" />
            بيانات المتجر / الشركة
          </CardTitle>
          <CardDescription>
            هذه البيانات تظهر في رأس كل إيصال مطبوع (فاتورة أو مرتجع)
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
              <span className="mr-3 text-muted-foreground">جارٍ التحميل...</span>
            </div>
          ) : (
            <div className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="storeName" className="flex items-center gap-2">
                  <Store className="h-4 w-4 text-muted-foreground" />
                  اسم المتجر / الشركة
                </Label>
                <Input
                  id="storeName"
                  value={storeName}
                  onChange={(e) => setStoreName(e.target.value)}
                  placeholder="مثال: متجر الأمل للتوزيع"
                  dir="rtl"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="phone" className="flex items-center gap-2">
                  <Phone className="h-4 w-4 text-muted-foreground" />
                  رقم الهاتف
                </Label>
                <Input
                  id="phone"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="مثال: 0555 123 456"
                  dir="rtl"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="address" className="flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-muted-foreground" />
                  العنوان
                </Label>
                <Input
                  id="address"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="مثال: شارع الاستقلال، الجزائر العاصمة"
                  dir="rtl"
                />
              </div>

              <Button
                onClick={handleSave}
                disabled={updateSettings.isPending}
                className="w-full gap-2"
              >
                {updateSettings.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                حفظ الإعدادات
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Preview card */}
      {!isLoading && (
        <Card className="max-w-xl">
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">معاينة رأس الإيصال</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="border border-dashed border-gray-300 rounded p-4 text-center font-mono text-sm bg-white" dir="rtl">
              <div className="font-bold text-base">{storeName || "اسم المتجر"}</div>
              {phone && <div className="text-xs mt-1">هاتف: {phone}</div>}
              {address && <div className="text-xs mt-1">{address}</div>}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
