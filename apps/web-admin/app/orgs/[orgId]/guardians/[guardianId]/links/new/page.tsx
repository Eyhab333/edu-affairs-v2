"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  Link2,
  Loader2,
  Save,
} from "lucide-react";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
} from "firebase/firestore";
import {
  GuardianLinkSchema,
  GuardianRelationType,
} from "@takween/contracts";
import { toast } from "sonner";

import { db } from "@/lib/firebase";
import { useRequireAuth } from "@/hooks/use-require-auth";
import { useDocumentLoader } from "@/hooks/use-document-loader";

import PageHero from "@/components/shared/PageHero";
import FormSection from "@/components/shared/FormSection";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type StudentRow = {
  id: string;
  personId: string;
  orgId: string;
  isArchived?: boolean;
};

type PersonRow = {
  id: string;
  displayName?: string;
};

type PageData = {
  guardian: {
    id: string;
    personId: string;
  };
  guardianPerson: {
    id: string;
    displayName?: string;
  };
  students: Array<
    StudentRow & {
      displayName: string;
    }
  >;
};

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "حدث خطأ غير متوقع";
}

function generateId(prefix: string) {
  return `${prefix}-${Date.now()}`;
}

export default function NewGuardianLinkPage() {
  const router = useRouter();
  const params = useParams<{ orgId: string; guardianId: string }>();
  const orgId = params.orgId;
  const guardianId = params.guardianId;

  const { user, checkingAuth } = useRequireAuth();

  const [studentId, setStudentId] = useState("");
  const [relationType, setRelationType] =
    useState<(typeof GuardianRelationType.options)[number]>("OTHER");
  const [active, setActive] = useState(true);
  const [startAt, setStartAt] = useState("");
  const [endAt, setEndAt] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const loadSummary = useCallback(async (): Promise<PageData | null> => {
    const guardianRef = doc(db, `orgs/${orgId}/guardians/${guardianId}`);
    const studentsRef = collection(db, `orgs/${orgId}/students`);
    const peopleRef = collection(db, `orgs/${orgId}/people`);

    const [guardianSnap, studentsSnap, peopleSnap] = await Promise.all([
      getDoc(guardianRef),
      getDocs(query(studentsRef)),
      getDocs(query(peopleRef)),
    ]);

    if (!guardianSnap.exists()) {
      return null;
    }

    const guardian = {
      id: guardianSnap.id,
      ...(guardianSnap.data() as { personId: string }),
    };

    const peopleMap = new Map<string, PersonRow>();
    peopleSnap.docs.forEach((item) => {
      peopleMap.set(item.id, {
        id: item.id,
        ...(item.data() as Omit<PersonRow, "id">),
      });
    });

    const students = studentsSnap.docs
      .map((item) => {
        const student = item.data() as StudentRow;
        const person = peopleMap.get(student.personId);

        return {
          id: item.id,
          personId: student.personId,
          orgId: student.orgId,
          isArchived: !!student.isArchived,
          displayName: person?.displayName ?? item.id,
        };
      })
      .sort((a, b) => a.displayName.localeCompare(b.displayName, "ar"));

    return {
      guardian,
      guardianPerson: peopleMap.get(guardian.personId) ?? {
        id: guardian.personId,
        displayName: guardian.personId,
      },
      students,
    };
  }, [orgId, guardianId]);

  const { data, loading, error, notFound } = useDocumentLoader<PageData>({
    enabled: !!user,
    loader: loadSummary,
    deps: [orgId, guardianId],
  });

  const studentOptions = useMemo(() => data?.students ?? [], [data?.students]);

  async function save() {
    setSaving(true);
    setSaveError(null);

    try {
      const nowMs = Date.now();
      const id = generateId("guardian-link");

      const payload = {
        id,
        orgId,
        studentId,
        guardianId,
        relationType,
        active,
        startAt: startAt ? new Date(startAt).getTime() : undefined,
        endAt: endAt ? new Date(endAt).getTime() : undefined,
        createdAt: nowMs,
        updatedAt: nowMs,
      };

      const parsed = GuardianLinkSchema.safeParse(payload);
      if (!parsed.success) {
        throw new Error(parsed.error.issues.map((i) => i.message).join("\n"));
      }

      await setDoc(doc(db, `orgs/${orgId}/guardianLinks/${id}`), parsed.data);

      toast.success("تم إنشاء الرابط بنجاح");
      router.push(`/orgs/${orgId}/guardians/${guardianId}`);
      router.refresh();
    } catch (error: unknown) {
      const message = getErrorMessage(error);
      setSaveError(message);
      toast.error("تعذر إنشاء الرابط");
    } finally {
      setSaving(false);
    }
  }

  if (checkingAuth || loading) {
    return (
      <div className="space-y-6">
        <div className="h-24 animate-pulse rounded-3xl bg-muted" />
        <div className="h-[560px] animate-pulse rounded-2xl bg-muted" />
      </div>
    );
  }

  if (notFound) {
    return (
      <PageHero
        badge="ربط طالب"
        badgeIcon={<Link2 className="h-3.5 w-3.5" />}
        title="تعذر العثور على ولي الأمر"
        description="قد يكون ولي الأمر غير موجود."
        actions={
          <Button asChild variant="outline">
            <Link href={`/orgs/${orgId}/guardians`}>
              <ArrowLeft className="h-4 w-4" />
              العودة
            </Link>
          </Button>
        }
      />
    );
  }

  return (
    <div className="space-y-6">
      <PageHero
        badge="ربط طالب"
        badgeIcon={<Link2 className="h-3.5 w-3.5" />}
        title="إنشاء رابط طالب ↔ ولي أمر"
        description={`ولي الأمر: ${data?.guardianPerson.displayName ?? ""}`}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline">
              <Link href={`/orgs/${orgId}/guardians/${guardianId}`}>
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
        title="بيانات الرابط"
        description="اختر الطالب ونوع العلاقة وحالة الرابط."
        contentClassName="space-y-4"
      >
        {error || saveError ? (
          <div className="whitespace-pre-line rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error ?? saveError}
          </div>
        ) : null}

        <div className="space-y-2">
          <label className="text-sm font-medium">الطالب</label>
          <select
            value={studentId}
            onChange={(e) => setStudentId(e.target.value)}
            className="h-10 rounded-xl border bg-background px-3 text-sm outline-none"
          >
            <option value="">اختر</option>
            {studentOptions.map((item) => (
              <option key={item.id} value={item.id}>
                {item.displayName}
              </option>
            ))}
          </select>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <div className="space-y-2">
            <label className="text-sm font-medium">نوع العلاقة</label>
            <select
              value={relationType}
              onChange={(e) =>
                setRelationType(
                  e.target.value as (typeof GuardianRelationType.options)[number]
                )
              }
              className="h-10 rounded-xl border bg-background px-3 text-sm outline-none"
            >
              {GuardianRelationType.options.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">تاريخ البداية</label>
            <Input type="date" value={startAt} onChange={(e) => setStartAt(e.target.value)} />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">تاريخ النهاية</label>
            <Input type="date" value={endAt} onChange={(e) => setEndAt(e.target.value)} />
          </div>
        </div>

        <div className="rounded-2xl border px-4 py-4">
          <label className="flex cursor-pointer items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="text-sm font-medium">الرابط نشط</div>
              <div className="text-xs text-muted-foreground">
                عند الإيقاف يبقى الرابط محفوظًا لكنه غير فعّال.
              </div>
            </div>

            <input
              type="checkbox"
              checked={active}
              onChange={(e) => setActive(e.target.checked)}
              className="h-4 w-4 accent-primary"
            />
          </label>
        </div>
      </FormSection>
    </div>
  );
}