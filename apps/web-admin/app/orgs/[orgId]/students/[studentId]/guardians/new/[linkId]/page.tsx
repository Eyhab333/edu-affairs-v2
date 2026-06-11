"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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

type GuardianRow = {
  id: string;
  personId: string;
  orgId: string;
  isArchived?: boolean;
};

type PersonRow = {
  id: string;
  displayName?: string;
};

type GuardianLinkRow = {
  id: string;
  orgId: string;
  studentId: string;
  guardianId: string;
  relationType: (typeof GuardianRelationType.options)[number];
  active?: boolean;
  startAt?: number;
  endAt?: number;
  createdAt?: number;
  updatedAt?: number;
};

type PageData = {
  student: {
    id: string;
    personId: string;
  };
  studentPerson: {
    id: string;
    displayName?: string;
  };
  guardians: Array<
    GuardianRow & {
      displayName: string;
    }
  >;
  link: GuardianLinkRow;
};

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "حدث خطأ غير متوقع";
}

function toDateInputValue(timestamp?: number) {
  if (!timestamp) return "";
  const d = new Date(timestamp);
  const yyyy = d.getFullYear();
  const mm = `${d.getMonth() + 1}`.padStart(2, "0");
  const dd = `${d.getDate()}`.padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export default function EditStudentGuardianLinkPage() {
  const router = useRouter();
  const params = useParams<{ orgId: string; studentId: string; linkId: string }>();
  const orgId = params.orgId;
  const studentId = params.studentId;
  const linkId = params.linkId;

  const { user, checkingAuth } = useRequireAuth();

  const [guardianId, setGuardianId] = useState("");
  const [relationType, setRelationType] =
    useState<(typeof GuardianRelationType.options)[number]>("OTHER");
  const [active, setActive] = useState(true);
  const [startAt, setStartAt] = useState("");
  const [endAt, setEndAt] = useState("");
  const [createdAt, setCreatedAt] = useState<number | undefined>(undefined);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const loadSummary = useCallback(async (): Promise<PageData | null> => {
    const studentRef = doc(db, `orgs/${orgId}/students/${studentId}`);
    const linkRef = doc(db, `orgs/${orgId}/guardianLinks/${linkId}`);
    const guardiansRef = collection(db, `orgs/${orgId}/guardians`);
    const peopleRef = collection(db, `orgs/${orgId}/people`);

    const [studentSnap, linkSnap, guardiansSnap, peopleSnap] = await Promise.all([
      getDoc(studentRef),
      getDoc(linkRef),
      getDocs(query(guardiansRef)),
      getDocs(query(peopleRef)),
    ]);

    if (!studentSnap.exists() || !linkSnap.exists()) {
      return null;
    }

    const link = {
      id: linkSnap.id,
      ...(linkSnap.data() as Omit<GuardianLinkRow, "id">),
    };

    if (link.studentId !== studentId) {
      return null;
    }

    const student = {
      id: studentSnap.id,
      ...(studentSnap.data() as { personId: string }),
    };

    const peopleMap = new Map<string, PersonRow>();
    peopleSnap.docs.forEach((item) => {
      peopleMap.set(item.id, {
        id: item.id,
        ...(item.data() as Omit<PersonRow, "id">),
      });
    });

    const guardians = guardiansSnap.docs
      .map((item) => {
        const guardian = item.data() as GuardianRow;
        const person = peopleMap.get(guardian.personId);

        return {
          id: item.id,
          personId: guardian.personId,
          orgId: guardian.orgId,
          isArchived: !!guardian.isArchived,
          displayName: person?.displayName ?? item.id,
        };
      })
      .sort((a, b) => a.displayName.localeCompare(b.displayName, "ar"));

    return {
      student,
      studentPerson: peopleMap.get(student.personId) ?? {
        id: student.personId,
        displayName: student.personId,
      },
      guardians,
      link,
    };
  }, [orgId, studentId, linkId]);

  const { data, loading, error, notFound } = useDocumentLoader<PageData>({
    enabled: !!user,
    loader: loadSummary,
    deps: [orgId, studentId, linkId],
  });

  useEffect(() => {
    if (!data) return;

    setGuardianId(data.link.guardianId);
    setRelationType(data.link.relationType);
    setActive(data.link.active !== false);
    setStartAt(toDateInputValue(data.link.startAt));
    setEndAt(toDateInputValue(data.link.endAt));
    setCreatedAt(data.link.createdAt);
  }, [data]);

  const guardianOptions = useMemo(() => data?.guardians ?? [], [data?.guardians]);

  async function save() {
    setSaving(true);
    setSaveError(null);

    try {
      const nowMs = Date.now();

      const payload = {
        id: linkId,
        orgId,
        studentId,
        guardianId,
        relationType,
        active,
        startAt: startAt ? new Date(startAt).getTime() : undefined,
        endAt: endAt ? new Date(endAt).getTime() : undefined,
        createdAt: createdAt ?? nowMs,
        updatedAt: nowMs,
      };

      const parsed = GuardianLinkSchema.safeParse(payload);
      if (!parsed.success) {
        throw new Error(parsed.error.issues.map((i) => i.message).join("\n"));
      }

      await setDoc(doc(db, `orgs/${orgId}/guardianLinks/${linkId}`), parsed.data, {
        merge: true,
      });

      toast.success("تم حفظ الرابط بنجاح");
      router.push(`/orgs/${orgId}/students/${studentId}`);
      router.refresh();
    } catch (error: unknown) {
      const message = getErrorMessage(error);
      setSaveError(message);
      toast.error("تعذر حفظ الرابط");
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
        badge="تعديل الرابط"
        badgeIcon={<Link2 className="h-3.5 w-3.5" />}
        title="تعذر العثور على الرابط"
        description="قد يكون الرابط غير موجود أو لا يتبع الطالب الحالي."
        actions={
          <Button asChild variant="outline">
            <Link href={`/orgs/${orgId}/students/${studentId}`}>
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
        badge="تعديل الرابط"
        badgeIcon={<Link2 className="h-3.5 w-3.5" />}
        title="تعديل رابط طالب ↔ ولي أمر"
        description={`الطالب: ${data?.studentPerson.displayName ?? ""}`}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline">
              <Link href={`/orgs/${orgId}/students/${studentId}`}>
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
        description="عدّل ولي الأمر ونوع العلاقة وحالة الرابط."
        contentClassName="space-y-4"
      >
        {error || saveError ? (
          <div className="whitespace-pre-line rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error ?? saveError}
          </div>
        ) : null}

        <div className="space-y-2">
          <label className="text-sm font-medium">ولي الأمر</label>
          <select
            value={guardianId}
            onChange={(e) => setGuardianId(e.target.value)}
            className="h-10 rounded-xl border bg-background px-3 text-sm outline-none"
          >
            <option value="">اختر</option>
            {guardianOptions.map((item) => (
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