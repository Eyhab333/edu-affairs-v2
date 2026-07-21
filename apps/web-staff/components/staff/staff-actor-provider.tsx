"use client";

import {
  createContext,
  ReactNode,
  useContext,
  useEffect,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import type { User } from "firebase/auth";

import { ensureSelectedOrgId } from "@/lib/org";
import {
  getStaffActorData,
  type StaffActorData,
} from "@/lib/staff-actor";
import { useRequireAuth } from "@/hooks/use-require-auth";
import { FullScreenTakweenLoader } from "@/components/ui/takween-loader";


type StaffActorContextValue = {
  user: User;
  actor: StaffActorData;
  loading: false;
  error: string | null;
  reload: () => Promise<void>;
};

const StaffActorContext = createContext<StaffActorContextValue | null>(null);

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "حدث خطأ غير متوقع";
}

function LoadingScreen() {
  return (
    <FullScreenTakweenLoader
      label="جاري تجهيز بوابة الموظفين..."
      sublabel="نحمّل بياناتك وصلاحياتك ومساحة العمل"
    />
  );
}

export function StaffActorProvider({
  children,
}: {
  children: ReactNode;
}) {
  const router = useRouter();
  const { user, checkingAuth } = useRequireAuth();

  const [actor, setActor] = useState<StaffActorData | null>(null);
  const [loadingActor, setLoadingActor] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function loadActor() {
    if (!user) return;

    setLoadingActor(true);
    setError(null);

    try {
      const orgId = await ensureSelectedOrgId(user.uid);

      if (!orgId) {
        router.replace("/select-org");
        return;
      }

      const nextActor = await getStaffActorData({
        uid: user.uid,
        orgId,
      });

      setActor(nextActor);
    } catch (error) {
      setActor(null);
      setError(getErrorMessage(error));
    } finally {
      setLoadingActor(false);
    }
  }

  useEffect(() => {
    let active = true;

    async function run() {
      if (!user) return;

      setLoadingActor(true);
      setError(null);

      try {
        const orgId = await ensureSelectedOrgId(user.uid);

        if (!active) return;

        if (!orgId) {
          router.replace("/select-org");
          return;
        }

        const nextActor = await getStaffActorData({
          uid: user.uid,
          orgId,
        });

        if (!active) return;

        setActor(nextActor);
      } catch (error) {
        if (!active) return;
        setActor(null);
        setError(getErrorMessage(error));
      } finally {
        if (active) {
          setLoadingActor(false);
        }
      }
    }

    void run();

    return () => {
      active = false;
    };
  }, [router, user]);

  if (checkingAuth || loadingActor) {
    return <LoadingScreen />;
  }

  if (!user) {
    return <LoadingScreen />;
  }

  if (error) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="max-w-lg rounded-2xl border border-destructive/30 bg-card p-5 text-sm shadow-sm">
          <p className="font-semibold text-destructive">
            تعذر تجهيز بيانات المستخدم
          </p>

          <p className="mt-2 leading-6 text-muted-foreground">{error}</p>

          <button
            type="button"
            onClick={() => void loadActor()}
            className="mt-4 rounded-xl bg-primary px-4 py-2 text-primary-foreground"
          >
            إعادة المحاولة
          </button>
        </div>
      </main>
    );
  }

  if (!actor) {
    return <LoadingScreen />;
  }

  return (
    <StaffActorContext.Provider
      value={{
        user,
        actor,
        loading: false,
        error: null,
        reload: loadActor,
      }}
    >
      {children}
    </StaffActorContext.Provider>
  );
}

export function useStaffActor(): StaffActorContextValue {
  const context = useContext(StaffActorContext);

  if (!context) {
    throw new Error("useStaffActor must be used inside StaffActorProvider");
  }

  return context;
}