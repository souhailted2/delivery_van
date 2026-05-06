import { Link } from "wouter";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-center">
      <h1 className="text-6xl font-bold text-muted-foreground">404</h1>
      <h2 className="text-2xl font-semibold">الصفحة غير موجودة</h2>
      <p className="text-muted-foreground">عذراً، الصفحة التي تبحث عنها غير متوفرة.</p>
      <Link href="/">
        <Button>العودة إلى لوحة التحكم</Button>
      </Link>
    </div>
  );
}
