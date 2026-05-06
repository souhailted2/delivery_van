import { useLocation } from "wouter";
import { useLogin, useTruckLogin } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Truck } from "lucide-react";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";

type Tab = "user" | "truck";

export default function Connexion() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const login = useLogin();
  const truckLogin = useTruckLogin();
  const queryClient = useQueryClient();

  const [tab, setTab] = useState<Tab>("user");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [truckName, setTruckName] = useState("");
  const [truckPassword, setTruckPassword] = useState("");

  const handleUserSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    login.mutate({ data: { username, password } }, {
      onSuccess: () => {
        queryClient.invalidateQueries();
        setLocation("/");
      },
      onError: () => {
        toast({
          title: "خطأ في تسجيل الدخول",
          description: "اسم المستخدم أو كلمة المرور غير صحيحة.",
          variant: "destructive",
        });
      }
    });
  };

  const handleTruckSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    truckLogin.mutate({ data: { truckName, password: truckPassword } }, {
      onSuccess: () => {
        queryClient.invalidateQueries();
        setLocation("/");
      },
      onError: () => {
        toast({
          title: "خطأ في تسجيل دخول الشاحنة",
          description: "اسم الشاحنة أو كلمة المرور غير صحيحة.",
          variant: "destructive",
        });
      }
    });
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md border-card-border shadow-lg">
        <CardHeader className="space-y-1 items-center text-center">
          <div className="h-12 w-12 bg-primary rounded-full flex items-center justify-center mb-4">
            <Truck className="h-6 w-6 text-primary-foreground" />
          </div>
          <CardTitle className="text-2xl font-bold">تسجيل الدخول</CardTitle>
          <CardDescription>
            مرحباً بك في نظام إدارة مبيعات الشاحنات
          </CardDescription>
        </CardHeader>
        <CardContent>
          {/* Tab switcher */}
          <div className="flex rounded-lg border border-border mb-6 overflow-hidden">
            <button
              type="button"
              onClick={() => setTab("user")}
              className={`flex-1 py-2 text-sm font-medium transition-colors ${
                tab === "user"
                  ? "bg-primary text-primary-foreground"
                  : "bg-background text-muted-foreground hover:bg-muted"
              }`}
            >
              مستخدم / إدارة
            </button>
            <button
              type="button"
              onClick={() => setTab("truck")}
              className={`flex-1 py-2 text-sm font-medium transition-colors ${
                tab === "truck"
                  ? "bg-primary text-primary-foreground"
                  : "bg-background text-muted-foreground hover:bg-muted"
              }`}
            >
              🚛 حساب شاحنة
            </button>
          </div>

          {tab === "user" ? (
            <form onSubmit={handleUserSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="username">اسم المستخدم</Label>
                <Input
                  id="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="admin"
                  autoComplete="username"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">كلمة المرور</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  required
                />
              </div>
              <Button type="submit" className="w-full" disabled={login.isPending}>
                {login.isPending ? "جارٍ تسجيل الدخول..." : "دخول"}
              </Button>
              <p className="text-center text-xs text-muted-foreground pt-2">
                تجريبي: admin / admin123 &nbsp;|&nbsp; vendeur1 / vendeur123
              </p>
            </form>
          ) : (
            <form onSubmit={handleTruckSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="truckName">اسم الشاحنة</Label>
                <Input
                  id="truckName"
                  value={truckName}
                  onChange={(e) => setTruckName(e.target.value)}
                  placeholder="مثال: شاحنة 1"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="truckPassword">كلمة المرور</Label>
                <Input
                  id="truckPassword"
                  type="password"
                  value={truckPassword}
                  onChange={(e) => setTruckPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                />
              </div>
              <Button type="submit" className="w-full" disabled={truckLogin.isPending}>
                {truckLogin.isPending ? "جارٍ تسجيل الدخول..." : "دخول كشاحنة"}
              </Button>
              <p className="text-center text-xs text-muted-foreground pt-2">
                الدخول خاص بحساب الشاحنة المستقل
              </p>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
