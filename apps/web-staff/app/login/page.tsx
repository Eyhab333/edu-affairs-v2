"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import {
  browserLocalPersistence,
  browserSessionPersistence,
  setPersistence,
  signInWithEmailAndPassword,
} from "firebase/auth";
import { FullScreenTakweenLoader } from "@/components/ui/takween-loader";
import {
  CheckCircle2,
  Eye,
  EyeOff,
  Loader2,
  LockKeyhole,
  Mail,
  ShieldCheck,
  Sparkles,
} from "lucide-react";

import { auth } from "@/lib/firebase";

const YOUTUBE_VIDEO_ID = "7uJwuONN4ko";

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "حدث خطأ غير متوقع";
}

export default function LoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setLoading(true);
    setError("");

    try {
      await setPersistence(
        auth,
        rememberMe ? browserLocalPersistence : browserSessionPersistence,
      );

      await signInWithEmailAndPassword(auth, email.trim(), password);
      router.replace("/select-org");
    } catch (error) {
      setError(getErrorMessage(error));
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <FullScreenTakweenLoader
        label="جاري تسجيل الدخول..."
        sublabel="نجهّز لك مساحة العمل"
      />
    );
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-slate-950 text-white">
      <div className="absolute inset-0 z-0 bg-slate-950" />

      <iframe
        aria-hidden="true"
        tabIndex={-1}
        title="Takween background video"
        src={`https://www.youtube.com/embed/${YOUTUBE_VIDEO_ID}?autoplay=1&mute=1&controls=0&playsinline=1&loop=1&playlist=${YOUTUBE_VIDEO_ID}&modestbranding=1&rel=0&iv_load_policy=3&disablekb=1&fs=0`}
        allow="autoplay; encrypted-media; picture-in-picture"
        className="pointer-events-none absolute left-1/2 top-1/2 z-10 h-[56.25vw] min-h-full w-[177.777vh] min-w-full -translate-x-1/2 -translate-y-1/2 border-0 opacity-75"
      />

      <div className="absolute inset-0 z-20 bg-gradient-to-br from-slate-950/95 via-slate-950/72 to-teal-950/82" />
      <div className="absolute inset-0 z-20 bg-[radial-gradient(circle_at_top_right,rgba(20,184,166,0.30),transparent_32%),radial-gradient(circle_at_bottom_left,rgba(14,165,233,0.20),transparent_34%)]" />
      <div className="absolute inset-0 z-20 backdrop-blur-[2px]" />

      <section className="relative z-30 mx-auto grid min-h-screen w-full max-w-6xl items-center gap-10 px-4 py-8 lg:grid-cols-[1.05fr_0.95fr] lg:px-6">
        <div className="hidden space-y-8 lg:block">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-4 py-2 text-sm text-white/80 shadow-2xl backdrop-blur">
            <Sparkles className="size-4 text-teal-300" />
            بوابة تكوين للموظفين
          </div>

          <div className="space-y-5">
            <h1 className="max-w-2xl text-5xl font-bold leading-tight">
              مساحة عمل موحدة لتنظيم اليوم الدراسي.
            </h1>

            <p className="max-w-xl text-lg leading-9 text-white/75">
              بوابة تساعد منسوبي تكوين المعرفة على متابعة الفصول والطلاب والحضور
              والقياسات والتقييمات والتواصل من مكان واحد واضح ومنظم.
            </p>
          </div>

          <div className="grid max-w-xl gap-3">
            {[
              "متابعة يومية أكثر وضوحًا للفصول والطلاب.",
              "تنظيم أفضل للمهام التعليمية والإدارية.",
              "دعم جودة المتابعة وسرعة إنجاز الأعمال.",
            ].map((item) => (
              <div
                key={item}
                className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/10 px-4 py-3 text-sm text-white/85 backdrop-blur"
              >
                <CheckCircle2 className="size-5 shrink-0 text-teal-300" />
                <span>{item}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="mx-auto w-full max-w-md">
          <section className="rounded-[2rem] border border-white/15 bg-white/92 p-6 text-slate-950 shadow-2xl backdrop-blur-xl md:p-8">
            <div className="mb-7 text-center">
              <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-2xl bg-teal-700 text-white shadow-lg shadow-teal-900/20">
                <ShieldCheck className="size-7" />
              </div>

              <p className="text-sm font-semibold text-teal-700">
                تكوين المعرفة للتعليم
              </p>

              <h1 className="mt-2 text-2xl font-bold text-slate-950">
                تسجيل الدخول
              </h1>

              <p className="mt-3 text-sm leading-7 text-slate-500">
                سجّل دخولك للوصول إلى مساحة عملك اليومية ومتابعة أعمالك
                التعليمية والإدارية.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <label className="block space-y-2">
                <span className="text-sm font-semibold text-slate-700">
                  البريد الإلكتروني
                </span>

                <div className="relative">
                  <Mail className="absolute right-3 top-1/2 size-5 -translate-y-1/2 text-white/45 pointer-events-none z-10" />

                  <input
                    dir="ltr"
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    autoComplete="email"
                    placeholder="name@example.com"
                    className="auth-glass-input w-full rounded-2xl border border-white/15 bg-slate-950/45 px-3 py-3 pr-11 text-left text-sm text-white shadow-inner shadow-black/20 outline-none backdrop-blur-md transition placeholder:text-white/35 focus:border-teal-300/70 focus:bg-slate-950/65 focus:ring-4 focus:ring-teal-300/15"
                    required
                  />
                </div>
              </label>

              <label className="block space-y-2">
                <span className="text-sm font-semibold text-slate-700">
                  كلمة المرور
                </span>

                <div className="relative">
                  <LockKeyhole className="absolute right-3 top-1/2 size-5 -translate-y-1/2 text-white/45 pointer-events-none z-10" />

                  <input
                    dir="ltr"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    autoComplete="current-password"
                    placeholder="••••••••"
                    className="auth-glass-input w-full rounded-2xl border border-white/15 bg-slate-950/45 px-11 py-3 text-left text-sm text-white shadow-inner shadow-black/20 outline-none backdrop-blur-md transition placeholder:text-white/35 focus:border-teal-300/70 focus:bg-slate-950/65 focus:ring-4 focus:ring-teal-300/15"
                    required
                  />

                  <button
                    type="button"
                    onClick={() => setShowPassword((current) => !current)}
                    className="absolute left-3 top-1/2 -translate-y-1/2 rounded-lg p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                    aria-label={
                      showPassword ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"
                    }
                  >
                    {showPassword ? (
                      <EyeOff className="size-5" />
                    ) : (
                      <Eye className="size-5" />
                    )}
                  </button>
                </div>
              </label>

              <div className="flex items-center justify-between gap-3">
                <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-slate-700">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(event) => setRememberMe(event.target.checked)}
                    className="size-4 rounded border-slate-300 accent-teal-700"
                  />
                  <span>تذكرني</span>
                </label>
              </div>

              {error ? (
                <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm leading-6 text-red-700">
                  {error}
                </div>
              ) : null}

              <button
                type="submit"
                disabled={loading}
                className="flex w-full items-center justify-center gap-2 rounded-2xl bg-teal-700 px-4 py-3 text-sm font-bold text-white shadow-lg shadow-teal-900/15 transition hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? (
                  <>
                    <Loader2 className="size-5 animate-spin" />
                    جاري الدخول...
                  </>
                ) : (
                  "دخول إلى البوابة"
                )}
              </button>
            </form>
          </section>

          <p className="mt-5 text-center text-xs leading-6 text-white/60">
            بوابة داخلية مخصصة لمنسوبي تكوين المعرفة للتعليم.
          </p>
        </div>
      </section>
    </main>
  );
}
