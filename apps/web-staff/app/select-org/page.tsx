"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { useRequireAuth } from "@/hooks/use-require-auth";
import { FullScreenTakweenLoader } from "@/components/ui/takween-loader";
import {
  getAvailableOrgsForUser,
  getOrgDisplayName,
  OrgRecord,
  setOrgId,
} from "@/lib/org";

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "حدث خطأ غير متوقع";
}

export default function SelectOrgPage() {
  const router = useRouter();
  const { user, checkingAuth } = useRequireAuth();

  const [orgs, setOrgs] = useState<OrgRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    async function loadOrgs() {
      if (!user) return;

      setLoading(true);
      setError(""); 

      try {
        const nextOrgs = await getAvailableOrgsForUser(user.uid);

        if (!active) return;

        setOrgs(nextOrgs);

        if (nextOrgs.length === 1) {
          setOrgId(user.uid, nextOrgs[0].id);
          router.replace("/");
        }
      } catch (error) {
        if (!active) return;
        setError(getErrorMessage(error));
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void loadOrgs();

    return () => {
      active = false;
    };
  }, [router, user]);

  function handleSelectOrg(orgId: string) {
    if (!user) return;

    setOrgId(user.uid, orgId);
    router.replace("/");
  }

  if (checkingAuth || loading) {
  return (
    <FullScreenTakweenLoader
      label={
        checkingAuth
          ? "جاري التحقق من حسابك..."
          : "جاري تحميل المؤسسات..."
      }
      sublabel="نجهّز لك مساحة العمل"
    />
  );
}

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-10">
      <div className="mx-auto max-w-2xl">
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-6 space-y-2">
            <p className="text-sm font-medium text-teal-700">بوابة الموظفين</p>
            <h1 className="text-2xl font-bold text-slate-950">
              اختر المؤسسة
            </h1>
            <p className="text-sm leading-6 text-slate-500">
              اختر المؤسسة التي تريد العمل عليها في هذه الجلسة.
            </p>
          </div>

          {error ? (
            <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          ) : null}

          {!orgs.length && !error ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-800">
              لا توجد عضويات مؤسسات متاحة لهذا المستخدم.
            </div>
          ) : null}

          <div className="space-y-3">
            {orgs.map((org) => (
              <button
                key={org.id}
                type="button"
                onClick={() => handleSelectOrg(org.id)}
                className="flex w-full items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3 text-right transition hover:border-teal-300 hover:bg-teal-50"
              >
                <span>
                  <span className="block font-semibold text-slate-950">
                    {getOrgDisplayName(org, org.id)}
                  </span>
                  <span className="mt-1 block text-xs text-slate-500">
                    {org.role ? `الدور: ${org.role}` : org.id}
                  </span>
                </span>

                <span className="text-sm font-medium text-teal-700">
                  اختيار
                </span>
              </button>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}