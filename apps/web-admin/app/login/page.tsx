"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { FirebaseError } from "firebase/app";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
} from "firebase/auth";
import { LogIn } from "lucide-react";
import { toast } from "sonner";

import { auth } from "@/lib/firebase";
import { ensureSelectedOrgId } from "@/lib/org";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function getErrorMessage(error: unknown) {
  if (error instanceof FirebaseError) {
    switch (error.code) {
      case "auth/invalid-email":
        return "صيغة البريد الإلكتروني غير صحيحة.";
      case "auth/invalid-credential":
        return "بيانات الدخول غير صحيحة.";
      case "auth/user-disabled":
        return "تم تعطيل هذا الحساب.";
      case "auth/too-many-requests":
        return "تمت محاولات كثيرة. حاول مرة أخرى لاحقًا.";
      case "auth/network-request-failed":
        return "تعذر الاتصال بالشبكة. تحقق من الإنترنت.";
      default:
        return error.message || "حدث خطأ غير متوقع أثناء تسجيل الدخول.";
    }
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "حدث خطأ غير متوقع.";
}

export default function LoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [checkingSession, setCheckingSession] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      if (user) {
        router.replace("/");
        return;
      }

      setCheckingSession(false);
    });

    return () => unsub();
  }, [router]);

  const disabled = useMemo(() => {
    return loading || !email.trim() || !password.trim();
  }, [loading, email, password]);

  async function handleSignIn(e?: React.FormEvent<HTMLFormElement>) {
    e?.preventDefault();

    if (disabled) return;

    setLoading(true);
    setMsg(null);

    try {
      const cred = await signInWithEmailAndPassword(
        auth,
        email.trim(),
        password
      );

      await ensureSelectedOrgId(cred.user.uid);

      toast.success("تم تسجيل الدخول بنجاح");
      router.replace("/");
    } catch (error: unknown) {
      const message = getErrorMessage(error);
      setMsg(message);
      toast.error("فشل تسجيل الدخول");
    } finally {
      setLoading(false);
    }
  }

  if (checkingSession) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted/30 px-4 py-10">
        <Card className="w-full max-w-md rounded-2xl shadow-sm">
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            جارٍ التحقق من الجلسة...
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 px-4 py-10">
      <Card className="w-full max-w-md rounded-2xl shadow-sm">
        <CardHeader className="space-y-2">
          <CardTitle className="text-2xl font-extrabold">تسجيل الدخول</CardTitle>
          <CardDescription>
            أدخل بيانات حسابك للوصول إلى منصة الشؤون التعليمية.
          </CardDescription>
        </CardHeader>

        <CardContent>
          <form className="space-y-5" onSubmit={handleSignIn}>
            <div className="space-y-2">
              <Label htmlFor="email">البريد الإلكتروني</Label>
              <Input
                id="email"
                type="email"
                dir="ltr"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@example.com"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">كلمة المرور</Label>
              <Input
                id="password"
                type="password"
                dir="ltr"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
              />
            </div>

            {msg ? (
              <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                {msg}
              </div>
            ) : null}

            <Button type="submit" disabled={disabled} className="w-full">
              <LogIn className="h-4 w-4" />
              {loading ? "جارٍ تسجيل الدخول..." : "تسجيل الدخول"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}