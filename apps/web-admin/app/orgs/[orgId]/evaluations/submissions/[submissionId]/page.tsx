"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  EvaluationSubmissionSchema,
  EvaluationSubmissionStatus,
  EvaluationSubmissionItemScoreSchema,
} from "@takween/contracts";
import { ArrowLeft, ClipboardCheck, Loader2, Save } from "lucide-react";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  writeBatch,
} from "firebase/firestore";
import { toast } from "sonner";

import { db } from "@/lib/firebase";
import { useRequireAuth } from "@/hooks/use-require-auth";
import { useDocumentLoader } from "@/hooks/use-document-loader";
import {
  buildEvaluationSummaryReadModels,
  type EvaluationSummaryReadModel,
} from "@/lib/evaluation-read-model";

import PageHero from "@/components/shared/PageHero";
import FormSection from "@/components/shared/FormSection";
import InfoCard from "@/components/shared/InfoCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type PersonRow = {
  id: string;
  displayName?: string;
};

type PlanRow = {
  id: string;
  title: string;
  frameworkId: string;
  templateKey: string;
  targetRoleKey?: string;
};

type CycleRow = {
  id: string;
  label: string;
};

type SchoolRow = {
  id: string;
  name: string;
};

type AcademicYearRow = {
  id: string;
  schoolId: string;
  title: string;
};

type MembershipRow = {
  id: string;
  uid?: string;
  personId?: string;
  isActive?: boolean;
};

type SubmissionRow = {
  id: string;
  planId: string;
  cycleId?: string;
  orgId?: string;
  schoolId: string;
  academicYearId: string;
  evaluatorPersonId: string;
  evaluatorRoleKey?: string;
  targetPersonId?: string;
  targetTeacherPersonId?: string;
  targetRoleKey?: string;
  cycleLabel: string;
  templateKey?: string;
  status: (typeof EvaluationSubmissionStatus.options)[number];
  submittedAt?: number;
  reviewedAt?: number;
  approvedAt?: number;
  lockedAt?: number;
  reviewedByPersonId?: string;
  approvedByPersonId?: string;
  totalScore?: number;
  maxScore?: number;
  weightedScore?: number;
  summary?: string;
  recommendations?: string;
  createdAt?: number;
  updatedAt?: number;
};

type RubricItemRow = {
  id: string;
  frameworkId: string;
  templateKey: string;
  title: string;
  category: string;
  description?: string;
  order: number;
  maxScore: number;
  weight: number;
  tags?: string[];
  isRequired?: boolean;
  isActive?: boolean;
};

type ItemScoreRow = {
  id: string;
  submissionId: string;
  rubricItemId: string;
  title: string;
  category: string;
  score: number;
  maxScore: number;
  weight: number;
  comment?: string;
};

type ScoreDraftRow = {
  rubricItemId: string;
  title: string;
  category: string;
  score: string;
  maxScore: number;
  weight: number;
  comment: string;
};

type PageData = {
  submission: SubmissionRow;
  people: PersonRow[];
  plans: PlanRow[];
  cycles: CycleRow[];
  schools: SchoolRow[];
  years: AcademicYearRow[];
  memberships: MembershipRow[];
  rubricItems: RubricItemRow[];
  itemScores: ItemScoreRow[];
};

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "حدث خطأ غير متوقع";
}

function formatDate(timestamp?: number) {
  if (!timestamp) return "—";
  return new Intl.DateTimeFormat("ar-SA", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(timestamp));
}

function getSubmissionStatusLabel(status?: string) {
  switch (status) {
    case "DRAFT":
      return "مسودة";
    case "SUBMITTED":
      return "مُرسل";
    case "UNDER_REVIEW":
      return "قيد المراجعة";
    case "APPROVED":
      return "معتمد";
    case "RETURNED":
      return "معاد";
    case "LOCKED":
      return "مقفل";
    case "CANCELLED":
      return "ملغى";
    default:
      return status || "—";
  }
}

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

export default function EditEvaluationSubmissionPage() {
  const params = useParams<{ orgId: string; submissionId: string }>();
  const orgId = params.orgId;
  const submissionId = params.submissionId;

  const { user, checkingAuth } = useRequireAuth();

  const [status, setStatus] =
    useState<(typeof EvaluationSubmissionStatus.options)[number]>("DRAFT");
  const [evaluatorPersonId, setEvaluatorPersonId] = useState("");
  const [targetPersonId, setTargetPersonId] = useState("");
  const [summary, setSummary] = useState("");
  const [recommendations, setRecommendations] = useState("");
  const [createdAt, setCreatedAt] = useState<number | undefined>(undefined);
  const [submittedAt, setSubmittedAt] = useState<number | undefined>(undefined);
  const [reviewedAt, setReviewedAt] = useState<number | undefined>(undefined);
  const [approvedAt, setApprovedAt] = useState<number | undefined>(undefined);
  const [lockedAt, setLockedAt] = useState<number | undefined>(undefined);
  const [reviewedByPersonId, setReviewedByPersonId] = useState("");
  const [approvedByPersonId, setApprovedByPersonId] = useState("");
  const [scoreRows, setScoreRows] = useState<ScoreDraftRow[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const loadPage = useCallback(async (): Promise<PageData | null> => {
    const submissionRef = doc(db, `orgs/${orgId}/evaluationSubmissions/${submissionId}`);
    const peopleRef = collection(db, `orgs/${orgId}/people`);
    const plansRef = collection(db, `orgs/${orgId}/evaluationPlans`);
    const cyclesRef = collection(db, `orgs/${orgId}/evaluationCycles`);
    const schoolsRef = collection(db, `orgs/${orgId}/schools`);
    const membershipsRef = collection(db, `orgs/${orgId}/memberships`);
    const rubricItemsRef = collection(db, `orgs/${orgId}/evaluationRubricItems`);
    const itemScoresRef = collection(db, `orgs/${orgId}/evaluationSubmissionItemScores`);

    const [
      submissionSnap,
      peopleSnap,
      plansSnap,
      cyclesSnap,
      schoolsSnap,
      membershipsSnap,
      rubricItemsSnap,
      itemScoresSnap,
    ] = await Promise.all([
      getDoc(submissionRef),
      getDocs(query(peopleRef)),
      getDocs(query(plansRef)),
      getDocs(query(cyclesRef)),
      getDocs(query(schoolsRef)),
      getDocs(query(membershipsRef)),
      getDocs(query(rubricItemsRef)),
      getDocs(query(itemScoresRef)),
    ]);

    if (!submissionSnap.exists()) return null;

    const submission = {
      id: submissionSnap.id,
      ...(submissionSnap.data() as Omit<SubmissionRow, "id">),
    };

    const people = peopleSnap.docs.map((item) => ({
      id: item.id,
      ...(item.data() as Omit<PersonRow, "id">),
    }));

    const plans = plansSnap.docs.map((item) => ({
      id: item.id,
      ...(item.data() as Omit<PlanRow, "id">),
    }));

    const cycles = cyclesSnap.docs.map((item) => ({
      id: item.id,
      label: (item.data() as { label?: string }).label ?? item.id,
    }));

    const schools = schoolsSnap.docs.map((item) => ({
      id: item.id,
      ...(item.data() as Omit<SchoolRow, "id">),
    }));

    const yearsNested = await Promise.all(
      schools.map(async (school) => {
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

    const memberships = membershipsSnap.docs.map((item) => ({
      id: item.id,
      ...(item.data() as Omit<MembershipRow, "id">),
    }));

    const rubricItems = rubricItemsSnap.docs.map((item) => ({
      id: item.id,
      ...(item.data() as Omit<RubricItemRow, "id">),
    }));

    const itemScores = itemScoresSnap.docs
      .map((item) => ({
        id: item.id,
        ...(item.data() as Omit<ItemScoreRow, "id">),
      }))
      .filter((item) => item.submissionId === submissionId);

    return {
      submission,
      people,
      plans,
      cycles,
      schools,
      years: yearsNested.flat(),
      memberships,
      rubricItems,
      itemScores,
    };
  }, [orgId, submissionId]);

  const { data, loading, error, notFound, reload } = useDocumentLoader<PageData>({
    enabled: !!user,
    loader: loadPage,
    deps: [orgId, submissionId],
  });

  useEffect(() => {
    if (error) toast.error("تعذر تحميل الـ Submission");
  }, [error]);

  const peopleMap = useMemo(
    () => new Map((data?.people ?? []).map((item) => [item.id, item.displayName || item.id])),
    [data?.people]
  );
  const planMap = useMemo(
    () => new Map((data?.plans ?? []).map((item) => [item.id, item.title])),
    [data?.plans]
  );
  const cycleMap = useMemo(
    () => new Map((data?.cycles ?? []).map((item) => [item.id, item.label])),
    [data?.cycles]
  );
  const schoolMap = useMemo(
    () => new Map((data?.schools ?? []).map((item) => [item.id, item.name])),
    [data?.schools]
  );
  const yearMap = useMemo(
    () => new Map((data?.years ?? []).map((item) => [item.id, item.title])),
    [data?.years]
  );

  const currentActorPersonId = useMemo(() => {
    const membership =
      (data?.memberships ?? []).find(
        (item) => item.uid === user?.uid && item.isActive !== false
      ) ?? null;

    return membership?.personId || user?.uid || "";
  }, [data?.memberships, user?.uid]);

  const selectedPlan = useMemo(
    () => (data?.plans ?? []).find((item) => item.id === data?.submission.planId),
    [data?.plans, data?.submission.planId]
  );

  const visibleRubricItems = useMemo(() => {
    if (!selectedPlan) return [];

    return (data?.rubricItems ?? [])
      .filter((item) => item.frameworkId === selectedPlan.frameworkId)
      .filter((item) =>
        selectedPlan.templateKey
          ? item.templateKey === selectedPlan.templateKey
          : true
      )
      .filter((item) => item.isActive !== false)
      .sort((a, b) => a.order - b.order);
  }, [data?.rubricItems, selectedPlan]);

  useEffect(() => {
    if (!data?.submission) return;

    setStatus(data.submission.status);
    setEvaluatorPersonId(data.submission.evaluatorPersonId || "");
    setTargetPersonId(data.submission.targetPersonId || data.submission.targetTeacherPersonId || "");
    setSummary(data.submission.summary || "");
    setRecommendations(data.submission.recommendations || "");
    setCreatedAt(data.submission.createdAt);
    setSubmittedAt(data.submission.submittedAt);
    setReviewedAt(data.submission.reviewedAt);
    setApprovedAt(data.submission.approvedAt);
    setLockedAt(data.submission.lockedAt);
    setReviewedByPersonId(data.submission.reviewedByPersonId || "");
    setApprovedByPersonId(data.submission.approvedByPersonId || "");
  }, [data?.submission]);

  useEffect(() => {
    if (!data?.submission) return;

    const itemScoreMap = new Map(
      (data.itemScores ?? []).map((row) => [row.rubricItemId, row])
    );

    const nextRows: ScoreDraftRow[] = visibleRubricItems.map((item) => {
      const saved = itemScoreMap.get(item.id);

      return {
        rubricItemId: item.id,
        title: saved?.title || item.title,
        category: saved?.category || item.category,
        score: String(saved?.score ?? 0),
        maxScore: saved?.maxScore ?? item.maxScore,
        weight: saved?.weight ?? item.weight,
        comment: saved?.comment || "",
      };
    });

    setScoreRows(nextRows);
  }, [data?.submission, data?.itemScores, visibleRubricItems]);

  const totalScore = useMemo(
    () =>
      round2(
        scoreRows.reduce((sum, row) => sum + Number(row.score || 0), 0)
      ),
    [scoreRows]
  );

  const maxScore = useMemo(
    () => round2(scoreRows.reduce((sum, row) => sum + Number(row.maxScore || 0), 0)),
    [scoreRows]
  );

  const weightedScore = useMemo(() => {
    const value = scoreRows.reduce((sum, row) => {
      const score = Number(row.score || 0);
      const max = Number(row.maxScore || 0);
      const weight = Number(row.weight || 0);

      if (max <= 0) return sum;
      return sum + (score / max) * weight;
    }, 0);

    return round2(value);
  }, [scoreRows]);

  function updateScoreRow(
    rubricItemId: string,
    patch: Partial<ScoreDraftRow>
  ) {
    setScoreRows((prev) =>
      prev.map((row) =>
        row.rubricItemId === rubricItemId ? { ...row, ...patch } : row
      )
    );
  }

  async function rebuildSummaryReadModels() {
    const submissionsSnap = await getDocs(
      query(collection(db, `orgs/${orgId}/evaluationSubmissions`))
    );

    const allSubmissions = submissionsSnap.docs.map((item) => ({
      id: item.id,
      ...(item.data() as Omit<SubmissionRow, "id">),
    }));

    const summaries = buildEvaluationSummaryReadModels({
      orgId,
      submissions: allSubmissions,
      people: data?.people ?? [],
      plans: data?.plans ?? [],
    });

    const chunkSize = 400;

    for (let i = 0; i < summaries.length; i += chunkSize) {
      const chunk = summaries.slice(i, i + chunkSize);
      const batch = writeBatch(db);

      for (const row of chunk) {
        batch.set(
          doc(db, `orgs/${orgId}/evaluationSummaryReadModels/${row.id}`),
          row,
          { merge: true }
        );
      }

      await batch.commit();
    }
  }

  async function save() {
    setSaving(true);
    setSaveError(null);

    try {
      if (!data?.submission) throw new Error("تعذر تحميل بيانات الإدخال.");

      const nowMs = Date.now();

      let nextSubmittedAt = submittedAt;
      let nextReviewedAt = reviewedAt;
      let nextApprovedAt = approvedAt;
      let nextLockedAt = lockedAt;
      let nextReviewedByPersonId = reviewedByPersonId;
      let nextApprovedByPersonId = approvedByPersonId;

      if (status === "SUBMITTED" && !nextSubmittedAt) {
        nextSubmittedAt = nowMs;
      }

      if (status === "UNDER_REVIEW" && !nextReviewedAt) {
        nextReviewedAt = nowMs;
        nextReviewedByPersonId = currentActorPersonId;
      }

      if (status === "APPROVED" && !nextApprovedAt) {
        nextApprovedAt = nowMs;
        nextApprovedByPersonId = currentActorPersonId;
      }

      if (status === "LOCKED" && !nextLockedAt) {
        nextLockedAt = nowMs;
      }

      const submissionPayload = {
        id: submissionId,
        planId: data.submission.planId,
        cycleId: data.submission.cycleId || "",
        orgId,
        schoolId: data.submission.schoolId,
        academicYearId: data.submission.academicYearId,
        evaluatorPersonId,
        evaluatorRoleKey: data.submission.evaluatorRoleKey || undefined,
        targetPersonId,
        targetTeacherPersonId:
          data.submission.targetRoleKey?.includes("TEACHER") ? targetPersonId : "",
        targetRoleKey: data.submission.targetRoleKey || undefined,
        cycleLabel: data.submission.cycleLabel,
        templateKey: data.submission.templateKey || "",
        status,
        submittedAt: nextSubmittedAt,
        reviewedAt: nextReviewedAt,
        approvedAt: nextApprovedAt,
        lockedAt: nextLockedAt,
        reviewedByPersonId: nextReviewedByPersonId || "",
        approvedByPersonId: nextApprovedByPersonId || "",
        totalScore,
        maxScore,
        weightedScore,
        summary: summary.trim(),
        recommendations: recommendations.trim(),
        createdAt: createdAt ?? nowMs,
        updatedAt: nowMs,
      };

      const parsedSubmission = EvaluationSubmissionSchema.safeParse(submissionPayload);
      if (!parsedSubmission.success) {
        throw new Error(parsedSubmission.error.issues.map((i) => i.message).join("\n"));
      }

      const batch = writeBatch(db);

      batch.set(
        doc(db, `orgs/${orgId}/evaluationSubmissions/${submissionId}`),
        parsedSubmission.data,
        { merge: true }
      );

      for (const row of scoreRows) {
        const itemDocId = `submission-item-${submissionId}-${row.rubricItemId}`;

        const itemPayload = {
          id: itemDocId,
          submissionId,
          rubricItemId: row.rubricItemId,
          title: row.title,
          category: row.category,
          score: Number(row.score || 0),
          maxScore: Number(row.maxScore || 0),
          weight: Number(row.weight || 0),
          comment: row.comment.trim(),
          createdAt: nowMs,
          updatedAt: nowMs,
        };

        const parsedItem = EvaluationSubmissionItemScoreSchema.safeParse(itemPayload);
        if (!parsedItem.success) {
          throw new Error(parsedItem.error.issues.map((i) => i.message).join("\n"));
        }

        batch.set(
          doc(db, `orgs/${orgId}/evaluationSubmissionItemScores/${itemDocId}`),
          parsedItem.data,
          { merge: true }
        );
      }

      await batch.commit();
      await rebuildSummaryReadModels();

      toast.success("تم حفظ الـ Submission والبنود التفصيلية بنجاح");
      await reload();
    } catch (error: unknown) {
      const msg = getErrorMessage(error);
      setSaveError(msg);
      toast.error("تعذر حفظ الـ Submission");
    } finally {
      setSaving(false);
    }
  }

  if (checkingAuth || loading) {
    return (
      <div className="space-y-6">
        <div className="h-24 animate-pulse rounded-3xl bg-muted" />
        <div className="h-[920px] animate-pulse rounded-2xl bg-muted" />
      </div>
    );
  }

  if (notFound) {
    return (
      <PageHero
        badge="Submission"
        badgeIcon={<ClipboardCheck className="h-3.5 w-3.5" />}
        title="تعذر العثور على الإدخال"
        description="قد لا يكون هذا الـ Submission موجودًا."
        actions={
          <Button asChild variant="outline">
            <Link href={`/orgs/${orgId}/evaluations/submissions`}>
              <ArrowLeft className="h-4 w-4" />
              العودة
            </Link>
          </Button>
        }
      />
    );
  }

  const submission = data?.submission;

  return (
    <div className="space-y-6">
      <PageHero
        badge="Submission"
        badgeIcon={<ClipboardCheck className="h-3.5 w-3.5" />}
        title={submission?.cycleLabel || "Submission"}
        description="تعبئة البنود والدرجات والملخص والتوصيات وتحديث الحالة."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline">
              <Link href={`/orgs/${orgId}/evaluations/submissions`}>
                <ArrowLeft className="h-4 w-4" />
                العودة
              </Link>
            </Button>

            {targetPersonId ? (
              <Button asChild variant="outline">
                <Link href={`/orgs/${orgId}/evaluations/summary/${targetPersonId}`}>
                  فتح Summary
                </Link>
              </Button>
            ) : null}

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

      <div className="grid gap-4 md:grid-cols-3">
        <InfoCard label="totalScore" value={totalScore} hint="مجموع البنود الحالي" />
        <InfoCard label="maxScore" value={maxScore} hint="الحد الأعلى للبنود" />
        <InfoCard label="weightedScore" value={weightedScore} hint="المجموع الوزني المحسوب" />
      </div>

      <FormSection
        title="معلومات مرجعية"
        description="مرجع سريع قبل تعديل الإدخال."
        contentClassName="grid gap-4 md:grid-cols-2"
      >
        <div className="rounded-2xl border bg-card px-4 py-4 text-sm text-muted-foreground">
          Plan:{" "}
          <span className="font-medium text-foreground">
            {planMap.get(submission?.planId || "") ?? submission?.planId}
          </span>
        </div>

        <div className="rounded-2xl border bg-card px-4 py-4 text-sm text-muted-foreground">
          Cycle:{" "}
          <span className="font-medium text-foreground">
            {cycleMap.get(submission?.cycleId || "") ?? submission?.cycleLabel}
          </span>
        </div>

        <div className="rounded-2xl border bg-card px-4 py-4 text-sm text-muted-foreground">
          المدرسة:{" "}
          <span className="font-medium text-foreground">
            {schoolMap.get(submission?.schoolId || "") ?? submission?.schoolId}
          </span>
        </div>

        <div className="rounded-2xl border bg-card px-4 py-4 text-sm text-muted-foreground">
          السنة:{" "}
          <span className="font-medium text-foreground">
            {yearMap.get(submission?.academicYearId || "") ?? submission?.academicYearId}
          </span>
        </div>

        <div className="rounded-2xl border bg-card px-4 py-4 text-sm text-muted-foreground">
          Framework / templateKey:{" "}
          <span className="font-medium text-foreground">
            {selectedPlan?.frameworkId || "—"} / {selectedPlan?.templateKey || "—"}
          </span>
        </div>

        {selectedPlan?.frameworkId ? (
          <div className="rounded-2xl border bg-card px-4 py-4 text-sm text-muted-foreground">
            <Button asChild variant="outline" size="sm">
              <Link
                href={`/orgs/${orgId}/evaluations/frameworks/${selectedPlan.frameworkId}/rubric-items`}
              >
                فتح Rubric Items
              </Link>
            </Button>
          </div>
        ) : null}
      </FormSection>

      <FormSection
        title="بيانات الإدخال"
        description="الأشخاص والحالة والملخص العام."
        contentClassName="space-y-4"
      >
        {saveError ? (
          <div className="whitespace-pre-line rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {saveError}
          </div>
        ) : null}

        <div className="grid gap-4 md:grid-cols-3">
          <div className="space-y-2">
            <label className="text-sm font-medium">المقيّم</label>
            <select
              value={evaluatorPersonId}
              onChange={(e) => setEvaluatorPersonId(e.target.value)}
              className="h-10 rounded-xl border bg-background px-3 text-sm outline-none"
            >
              <option value="">اختر</option>
              {(data?.people ?? []).map((item) => (
                <option key={item.id} value={item.id}>
                  {item.displayName ?? item.id}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2 md:col-span-2">
            <label className="text-sm font-medium">المستهدف</label>
            <select
              value={targetPersonId}
              onChange={(e) => setTargetPersonId(e.target.value)}
              className="h-10 rounded-xl border bg-background px-3 text-sm outline-none"
            >
              <option value="">اختر</option>
              {(data?.people ?? []).map((item) => (
                <option key={item.id} value={item.id}>
                  {item.displayName ?? item.id}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <label className="text-sm font-medium">الحالة</label>
            <select
              value={status}
              onChange={(e) =>
                setStatus(e.target.value as (typeof EvaluationSubmissionStatus.options)[number])
              }
              className="h-10 rounded-xl border bg-background px-3 text-sm outline-none"
            >
              {EvaluationSubmissionStatus.options.map((item) => (
                <option key={item} value={item}>
                  {getSubmissionStatusLabel(item)}
                </option>
              ))}
            </select>
          </div>

          <div className="rounded-2xl border bg-card px-4 py-4 text-sm text-muted-foreground">
            createdAt:{" "}
            <span className="font-medium text-foreground">{formatDate(createdAt)}</span>
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">الملخص</label>
          <textarea
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            className="min-h-24 w-full rounded-xl border bg-background px-3 py-2 text-sm outline-none"
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">التوصيات</label>
          <textarea
            value={recommendations}
            onChange={(e) => setRecommendations(e.target.value)}
            className="min-h-24 w-full rounded-xl border bg-background px-3 py-2 text-sm outline-none"
          />
        </div>
      </FormSection>

      <FormSection
        title="بنود التقييم التفصيلية"
        description="هذه البنود تأتي من الـ Framework وتُصفّى حسب templateKey الخاص بالخطة."
        contentClassName="space-y-4"
      >
        {scoreRows.length === 0 ? (
          <div className="rounded-2xl border border-dashed px-6 py-12 text-center text-sm text-muted-foreground">
            لا توجد Rubric Items مطابقة لهذا الـ Submission بعد.
          </div>
        ) : (
          <div className="grid gap-4">
            {scoreRows.map((row, index) => (
              <div key={row.rubricItemId} className="rounded-2xl border bg-card p-4">
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="font-semibold">
                      {index + 1}. {row.title}
                    </div>

                    <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs text-primary">
                      {row.category}
                    </span>

                    <span className="rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground">
                      max: {row.maxScore}
                    </span>

                    <span className="rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground">
                      weight: {row.weight}
                    </span>
                  </div>

                  <div className="grid gap-4 md:grid-cols-[160px_1fr]">
                    <div className="space-y-2">
                      <label className="text-sm font-medium">الدرجة</label>
                      <Input
                        type="number"
                        min={0}
                        max={row.maxScore}
                        step="0.01"
                        value={row.score}
                        onChange={(e) =>
                          updateScoreRow(row.rubricItemId, { score: e.target.value })
                        }
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-medium">التعليق</label>
                      <textarea
                        value={row.comment}
                        onChange={(e) =>
                          updateScoreRow(row.rubricItemId, { comment: e.target.value })
                        }
                        className="min-h-20 w-full rounded-xl border bg-background px-3 py-2 text-sm outline-none"
                      />
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </FormSection>

      <FormSection
        title="تواريخ الحالة"
        description="تُحدّث تلقائيًا عند الحفظ حسب الحالة المختارة."
        contentClassName="grid gap-4 md:grid-cols-2"
      >
        <div className="rounded-2xl border bg-card px-4 py-4 text-sm text-muted-foreground">
          submittedAt:{" "}
          <span className="font-medium text-foreground">{formatDate(submittedAt)}</span>
        </div>

        <div className="rounded-2xl border bg-card px-4 py-4 text-sm text-muted-foreground">
          reviewedAt:{" "}
          <span className="font-medium text-foreground">{formatDate(reviewedAt)}</span>
        </div>

        <div className="rounded-2xl border bg-card px-4 py-4 text-sm text-muted-foreground">
          approvedAt:{" "}
          <span className="font-medium text-foreground">{formatDate(approvedAt)}</span>
        </div>

        <div className="rounded-2xl border bg-card px-4 py-4 text-sm text-muted-foreground">
          lockedAt:{" "}
          <span className="font-medium text-foreground">{formatDate(lockedAt)}</span>
        </div>

        <div className="rounded-2xl border bg-card px-4 py-4 text-sm text-muted-foreground">
          reviewedBy:{" "}
          <span className="font-medium text-foreground">
            {peopleMap.get(reviewedByPersonId) || reviewedByPersonId || "—"}
          </span>
        </div>

        <div className="rounded-2xl border bg-card px-4 py-4 text-sm text-muted-foreground">
          approvedBy:{" "}
          <span className="font-medium text-foreground">
            {peopleMap.get(approvedByPersonId) || approvedByPersonId || "—"}
          </span>
        </div>
      </FormSection>
    </div>
  );
}