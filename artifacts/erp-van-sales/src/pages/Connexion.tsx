import { useLocation } from "wouter";
import { useLogin, useTruckLogin } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Truck, User, Lock, Eye, EyeOff, ArrowLeft, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { motion, useReducedMotion } from "framer-motion";
import { useArrival } from "@/experience/ArrivalProvider";
import { preloadArrivalVideo } from "@/experience/arrival-asset";

type Tab = "user" | "truck";

export default function Connexion() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const login = useLogin();
  const truckLogin = useTruckLogin();
  const queryClient = useQueryClient();
  const reduce = useReducedMotion();
  const { startArrival, resolveArrival } = useArrival();

  const [tab, setTab] = useState<Tab>("user");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [truckName, setTruckName] = useState("");
  const [truckPassword, setTruckPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  /* The login card recedes (scale 0.94 + opacity 0 + soft blur) the instant the
     user clicks — in parallel with the arrival video, not after the network. */
  const [receding, setReceding] = useState(false);

  const pending = login.isPending || truckLogin.isPending;

  // VIDEO-FIRST: warm the arrival video (and its posters) the moment the login
  // screen mounts. The user spends seconds reading/typing — that buffers the
  // ~30MB clip so the click triggers "motion begins", not "wait → video".
  useEffect(() => {
    preloadArrivalVideo();
  }, []);

  // DECOUPLED ARRIVAL: start the cinematic ON CLICK (motion begins immediately)
  // and run authentication IN PARALLEL. The video hides the API latency.
  //   - onSuccess  → resolveArrival(true): the arrival reveals the dashboard,
  //                  and we navigate so it's mounted underneath the overlay.
  //   - onError    → resolveArrival(false): the arrival aborts back to the login
  //                  screen; the card returns and we surface the error.
  const begin = () => { setReceding(true); startArrival(); };
  const onAuthError = (titleKey: "user" | "truck") => {
    resolveArrival(false);
    setReceding(false);
    toast(
      titleKey === "user"
        ? { title: "خطأ في تسجيل الدخول", description: "اسم المستخدم أو كلمة المرور غير صحيحة.", variant: "destructive" }
        : { title: "خطأ في تسجيل دخول الشاحنة", description: "اسم الشاحنة أو كلمة المرور غير صحيحة.", variant: "destructive" },
    );
  };

  const handleUserSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (pending) return;
    begin();
    login.mutate(
      { data: { username, password } },
      {
        onSuccess: () => { queryClient.invalidateQueries(); resolveArrival(true); setLocation("/"); },
        onError: () => onAuthError("user"),
      },
    );
  };

  const handleTruckSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (pending) return;
    begin();
    truckLogin.mutate(
      { data: { truckName, password: truckPassword } },
      {
        onSuccess: () => { queryClient.invalidateQueries(); resolveArrival(true); setLocation("/"); },
        onError: () => onAuthError("truck"),
      },
    );
  };

  // ── motion ────────────────────────────────────────────────────────────────
  // Entrance: left-drift + blur-clear + inner stagger.
  // SECOND CUT acknowledge: the card recedes into z-depth (scale 0.94 + opacity
  // 0 + soft blur) — the user's attention drops the form and lifts toward the
  // destination. The building does NOT move during this beat.
  const cardV = {
    hidden:  { opacity: 0, x: reduce ? 0 : -56, filter: reduce ? "blur(0px)" : "blur(8px)" },
    in:      { opacity: 1, x: 0, scale: 1, filter: "blur(0px)", transition: { duration: reduce ? 0.25 : 0.85, ease: [0.22, 1, 0.36, 1] } },
    receding:{ opacity: 0, scale: 0.94, filter: "blur(4px)", transition: { duration: 0.35, ease: [0.4, 0, 0.2, 1] } },
  } as const;
  const listV = { hidden: {}, in: { transition: { staggerChildren: reduce ? 0 : 0.06, delayChildren: reduce ? 0 : 0.18 } } } as const;
  const itemV = { hidden: { opacity: 0, y: reduce ? 0 : 12 }, in: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] } } } as const;

  // Glass input — high-contrast text on translucent surface
  const field =
    "h-10 ps-9 text-[0.9rem] text-white bg-white/[0.06] border-white/15 placeholder:text-white/45 focus-visible:ring-primary/50 focus-visible:border-primary/60 focus-visible:bg-white/[0.08]";

  return (
    // dir=ltr ONLY to anchor the card to the visual LEFT; content stays RTL/Arabic
    <div dir="ltr" className="min-h-screen w-full flex items-center justify-center md:justify-start p-6 md:ps-[7vw]">
      <motion.div
        dir="rtl"
        variants={cardV}
        initial="hidden"
        animate={receding ? "receding" : "in"}
        className="relative w-full max-w-[22.5rem] rounded-2xl border border-white/15 bg-[#08111e]/92 backdrop-blur-[28px] supports-[backdrop-filter]:bg-[#08111e]/82 p-7 shadow-[0_50px_140px_-30px_rgba(0,0,0,0.9),0_0_0_1px_rgba(255,255,255,0.04)_inset] overflow-hidden"
      >
        {/* premium glass highlights */}
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/30 to-transparent" />
        <div className="pointer-events-none absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-primary/60 to-transparent" />
        <div className="pointer-events-none absolute -top-32 -end-24 h-56 w-56 rounded-full bg-primary/12 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-32 -start-20 h-48 w-48 rounded-full bg-white/[0.04] blur-3xl" />

        <motion.div variants={listV} initial="hidden" animate="in" className="relative">
          {/* brand mark */}
          <motion.div variants={itemV} className="mb-7 flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-primary/20 ring-1 ring-primary/40 shadow-[0_8px_24px_-8px_rgba(14,154,167,0.6)]">
              <Truck className="h-[18px] w-[18px] text-primary" />
            </span>
            <span className="text-[10px] font-medium uppercase tracking-[0.24em] text-white/65">Bienvenue · مرحباً بك</span>
          </motion.div>

          {/* title + subtitle */}
          <motion.h1 variants={itemV} className="text-[1.7rem] font-bold leading-[1.15] tracking-tight text-white">
            ALLAL <span className="text-primary">DELIVERY</span>
          </motion.h1>
          <motion.p variants={itemV} className="mt-2.5 text-[0.875rem] leading-[1.7] text-white/75">
            منصة ذكية لإدارة المخزون والأسطول والعمليات.
          </motion.p>

          {/* tabs */}
          <motion.div variants={itemV} className="mt-7 grid grid-cols-2 gap-1 rounded-xl border border-white/12 bg-white/[0.04] p-1">
            {([
              { k: "user", label: "مستخدم" },
              { k: "truck", label: "شاحنة" },
            ] as const).map((t) => (
              <button
                key={t.k}
                type="button"
                onClick={() => setTab(t.k)}
                className={`rounded-lg py-1.5 text-[0.85rem] font-medium transition-all ${
                  tab === t.k
                    ? "bg-primary text-primary-foreground shadow-[0_4px_14px_-4px_rgba(14,154,167,0.7)]"
                    : "text-white/65 hover:text-white"
                }`}
              >
                {t.label}
              </button>
            ))}
          </motion.div>

          {/* form */}
          {tab === "user" ? (
            <form onSubmit={handleUserSubmit} className="mt-5 space-y-3">
              <motion.div variants={itemV} className="relative">
                <User className="pointer-events-none absolute top-1/2 -translate-y-1/2 start-3 h-4 w-4 text-white/55" />
                <Input className={field} value={username} onChange={(e) => setUsername(e.target.value)} placeholder="اسم المستخدم" autoComplete="username" required />
              </motion.div>
              <motion.div variants={itemV} className="relative">
                <Lock className="pointer-events-none absolute top-1/2 -translate-y-1/2 start-3 h-4 w-4 text-white/55" />
                <Input className={`${field} pe-10`} type={showPw ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="كلمة المرور" autoComplete="current-password" required />
                <button type="button" onClick={() => setShowPw((s) => !s)} aria-label={showPw ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"} className="absolute top-1/2 -translate-y-1/2 end-3 text-white/55 hover:text-white transition-colors">
                  {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </motion.div>
              <motion.div variants={itemV} className="pt-2">
                <Button type="submit" disabled={pending} className="group h-10 w-full gap-2 text-[0.9rem] font-semibold shadow-[0_8px_24px_-8px_rgba(14,154,167,0.6)]">
                  {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-0.5" />}
                  {pending ? "جارٍ تسجيل الدخول..." : "تسجيل الدخول"}
                </Button>
              </motion.div>
            </form>
          ) : (
            <form onSubmit={handleTruckSubmit} className="mt-5 space-y-3">
              <motion.div variants={itemV} className="relative">
                <Truck className="pointer-events-none absolute top-1/2 -translate-y-1/2 start-3 h-4 w-4 text-white/55" />
                <Input className={field} value={truckName} onChange={(e) => setTruckName(e.target.value)} placeholder="اسم الشاحنة" required />
              </motion.div>
              <motion.div variants={itemV} className="relative">
                <Lock className="pointer-events-none absolute top-1/2 -translate-y-1/2 start-3 h-4 w-4 text-white/55" />
                <Input className={`${field} pe-10`} type={showPw ? "text" : "password"} value={truckPassword} onChange={(e) => setTruckPassword(e.target.value)} placeholder="كلمة المرور" required />
                <button type="button" onClick={() => setShowPw((s) => !s)} aria-label={showPw ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"} className="absolute top-1/2 -translate-y-1/2 end-3 text-white/55 hover:text-white transition-colors">
                  {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </motion.div>
              <motion.div variants={itemV} className="pt-2">
                <Button type="submit" disabled={pending} className="group h-10 w-full gap-2 text-[0.9rem] font-semibold shadow-[0_8px_24px_-8px_rgba(14,154,167,0.6)]">
                  {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-0.5" />}
                  {pending ? "جارٍ تسجيل الدخول..." : "دخول كشاحنة"}
                </Button>
              </motion.div>
            </form>
          )}
        </motion.div>
      </motion.div>
    </div>
  );
}
