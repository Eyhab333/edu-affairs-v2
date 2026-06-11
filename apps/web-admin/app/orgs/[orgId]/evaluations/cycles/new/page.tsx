"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  EvaluationCycleSchema,
  EvaluationCycleType,
} from "@takween/contracts";
import { ArrowLeft, CalendarRange, Loader2, Save } from "lucide-react";
import { collection, getDocs, query, setDoc, doc } from "firebase/firestore";
import { toast } from "sonner";

import { db } from "@/lib/firebase";
import { useRequireAuth } from "@/hooks/use-require-auth";

import PageHero from "@/components/shared/PageHero";
import FormSection from "@/components/shared/FormSection";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type SchoolRow = {
  id: string;
  name: string;
};

type AcademicYearRow = {
  id: string;
  schoolId: string;
  title: string;
};

type PlanRow = {
  id: string;
  title: string;
  schoolId?: string;
  cycleType?: string;
};

function generateId(prefix: string) {
  return `${prefix}-${Date.now()}`;
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "حدث خطأ غير متوقع";
}

export default function NewEvaluationCyclePage() {
  const router = useRouter();
  const params = useParams<{ orgId: string }>();
  const orgId = params.orgId;

  const { checkingAuth } = useRequireAuth();

  const [schools, setSchools] = useState<SchoolRow[]>([]);
  const [years, setYears] = useState<AcademicYearRow[]>([]);
  const [plans, setPlans] = useState<PlanRow[]>([]);

  const [planId, setPlanId] = useState("");
  const [schoolId, setSchoolId] = useState("");
  const [academicYearId, setAcademicYearId] = useState("");
  const [cycleType, setCycleType] =
    useState<(typeof EvaluationCycleType.options)[number]>("WEEK");
  const [label, setLabel] = useState("");
  const [order, setOrder] = useState("0");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [isOpen, setIsOpen] = useState(true);
  const [isLocked, setIsLocked] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const schoolsSnap = await getDocs(query(collection(db, `orgs/${orgId}/schools`)));
        const schoolsRows = schoolsSnap.docs.map((item) => ({
          id: item.id,
          ...(item.data() as Omit<SchoolRow, "id">),
        }));

        const yearsNested = await Promise.all(
          schoolsRows.map(async (school) => {
            const yearsRef = collection(
              db,
              `orgs/${orgId}/schools/${school.id}/academicYears`
            );
            const yearsSnap = await getDocs(query(yearsRef));

            return yearsSnap.docs.map((item) => ({
              id: item.id,
              schoolId: school.id,
              title: (item.data() as { title?: string }).title ?? item.id,
            }));
          })
        );

        const plansSnap = await getDocs(query(collection(db, `orgs/${orgId}/evaluationPlans`)));

        if (cancelled) return;

        setSchools(schoolsRows);
        setYears(yearsNested.flat());
        setPlans(
          plansSnap.docs.map((item) => ({
            id: item.id,
            ...(item.data() as Omit<PlanRow, "id">),
          }))
        );
      } catch {
        toast.error("تعذر تحميل البيانات المرجعية");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [orgId]);

  const selectedPlan = useMemo(
    () => plans.find((item) => item.id === planId),
    [plans, planId]
  );

  useEffect(() => {
    if (!selectedPlan) return;

    if (selectedPlan.schoolId) {
      setSchoolId(selectedPlan.schoolId);
    }

    if (
      selectedPlan.cycleType &&
      EvaluationCycleType.options.includes(
        selectedPlan.cycleType as (typeof EvaluationCycleType.options)[number]
      )
    ) {
      setCycleType(
        selectedPlan.cycleType as (typeof EvaluationCycleType.options)[number]
      );
    }
  }, [selectedPlan]);

  const yearOptions = useMemo(
    () => years.filter((item) => item.schoolId === schoolId),
    [years, schoolId]
  );

  async function save() {
    setSaving(true);
    setSaveError(null);

    try {
      const id = generateId("evaluation-cycle");
      const nowMs = Date.now();

      const payload = {
        id,
        planId,
        orgId,
        schoolId,
        academicYearId,
        cycleType,
        label: label.trim(),
        order: Number(order || 0),
        startsAt: startsAt ? new Date(startsAt).getTime() : undefined,
        endsAt: endsAt ? new Date(endsAt).getTime() : undefined,
        isOpen,
        isLocked,
        createdAt: nowMs,
        updatedAt: nowMs,
      };

      const parsed = EvaluationCycleSchema.safeParse(payload);
      if (!parsed.success) {
        throw new Error(parsed.error.issues.map((i) => i.message).join("\n"));
      }

      await setDoc(doc(db, `orgs/${orgId}/evaluationCycles/${id}`), parsed.data);

      toast.success("تم إنشاء الـ Cycle بنجاح");
      router.push(`/orgs/${orgId}/evaluations/cycles`);
      router.refresh();
    } catch (error: unknown) {
      const msg = getErrorMessage(error);
      setSaveError(msg);
      toast.error("تعذر إنشاء الـ Cycle");
    } finally {
      setSaving(false);
    }
  }

  if (checkingAuth) {
    return (
      <div className="space-y-6">
        <div className="h-24 animate-pulse rounded-3xl bg-muted" />
        <div className="h-[620px] animate-pulse rounded-2xl bg-muted" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHero
        badge="Cycle جديدة"
        badgeIcon={<CalendarRange className="h-3.5 w-3.5" />}
        title="إضافة Cycle"
        description="إنشاء دورة تشغيلية مرتبطة بخطة تقييم."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline">
              <Link href={`/orgs/${orgId}/evaluations/cycles`}>
                <ArrowLeft className="h-4 w-4" />
                العودة
              </Link>
            </Button>

            <Button onClick={save} disabled={saving}>
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  جارٍ الحفظ...
                </>
              ) : (
                <>
                  <Save className="h-4 w-4" />
                  حفظ
                </>
              )}
            </Button>
          </div>
        }
      />

      <FormSection
        title="بيانات الدورة"
        description="اختر الخطة والسنة وأدخل التسمية والترتيب."
        contentClassName="space-y-4"
      >
        {saveError ? (
          <div className="whitespace-pre-line rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {saveError}
          </div>
        ) : null}

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <label className="text-sm font-medium">الخطة</label>
            <select
              value={planId}
              onChange={(e) => setPlanId(e.target.value)}
              className="h-10 rounded-xl border bg-background px-3 text-sm outline-none"
            >
              <option value="">اختر</option>
              {plans.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.title}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">المدرسة</label>
            <select
              value={schoolId}
              onChange={(e) => {
                setSchoolId(e.target.value);
                setAcademicYearId("");
              }}
              className="h-10 rounded-xl border bg-background px-3 text-sm outline-none"
            >
              <option value="">اختر</option>
              {schools.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-4">
          <div className="space-y-2 md:col-span-2">
            <label className="text-sm font-medium">السنة الدراسية</label>
            <select
              value={academicYearId}
              onChange={(e) => setAcademicYearId(e.target.value)}
              className="h-10 rounded-xl border bg-background px-3 text-sm outline-none"
            >
              <option value="">اختر</option>
              {yearOptions.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.title}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">نوع الدورة</label>
            <select
              value={cycleType}
              onChange={(e) =>
                setCycleType(e.target.value as (typeof EvaluationCycleType.options)[number])
              }
              className="h-10 rounded-xl border bg-background px-3 text-sm outline-none"
            >
              {EvaluationCycleType.options.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">الترتيب</label>
            <Input
              type="number"
              min={0}
              value={order}
              onChange={(e) => setOrder(e.target.value)}
            />
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <div className="space-y-2 md:col-span-1">
            <label className="text-sm font-medium">التسمية</label>
            <Input value={label} onChange={(e) => setLabel(e.target.value)} />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">البداية</label>
            <Input type="date" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">النهاية</label>
            <Input type="date" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl border px-4 py-4">
            <label className="flex cursor-pointer items-center justify-between gap-4">
              <div className="text-sm font-medium">الدورة مفتوحة</div>
              <input
                type="checkbox"
                checked={isOpen}
                onChange={(e) => setIsOpen(e.target.checked)}
                className="h-4 w-4 accent-primary"
              />
            </label>
          </div>

          <div className="rounded-2xl border px-4 py-4">
            <label className="flex cursor-pointer items-center justify-between gap-4">
              <div className="text-sm font-medium">الدورة مقفلة</div>
              <input
                type="checkbox"
                checked={isLocked}
                onChange={(e) => setIsLocked(e.target.checked)}
                className="h-4 w-4 accent-primary"
              />
            </label>
          </div>
        </div>
      </FormSection>
    </div>
  );
}