"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";

import { Button } from "@/components/ui/button";
import { useRequireAuth } from "@/hooks/use-require-auth";
import {
  approveEvaluationSubmission,
  EvaluationSubmissionFormData,
  loadEvaluationSubmissionForm,
  saveEvaluationDraft,
  submitEvaluation,
} from "@/lib/staff-evaluations";

function toNumber(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export default function EvaluationSubmissionPage() {
  const params = useParams<{
    cycleId: string;
    targetPersonId: string;
  }>();

  const { user, checkingAuth } = useRequireAuth();

  const [formData, setFormData] = useState<EvaluationSubmissionFormData | null>(
    null,
  );

  const [scores, setScores] = useState<Record<string, string>>({});
  const [generalNote, setGeneralNote] = useState("");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [approving, setApproving] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const cycleId = params.cycleId;
  const targetPersonId = params.targetPersonId;

  const loadForm = useCallback(async () => {
    if (!user || !cycleId || !targetPersonId) return;

    setLoading(true);
    setError(null);

    try {
      const result = await loadEvaluationSubmissionForm({
        uid: user.uid,
        orgId: "takween",
        cycleId,
        targetPersonId,
      });

      setFormData(result);

      if (result) {
        const nextScores: Record<string, string> = {};

        for (const itemScore of result.existingItemScores ?? []) {
          nextScores[itemScore.itemId] = String(itemScore.score);
        }

        setScores(nextScores);
        setGeneralNote(result.existingGeneralNote ?? "");
      }
    } catch (error) {
      console.error(error);
      setError(
        error instanceof Error ? error.message : "تعذر تحميل نموذج التقييم",
      );
    } finally {
      setLoading(false);
    }
  }, [user, cycleId, targetPersonId]);

  useEffect(() => {
    if (!checkingAuth && user) {
      void loadForm();
    }

    if (!checkingAuth && !user) {
      setLoading(false);
    }
  }, [checkingAuth, user, loadForm]);

  const itemsBySection = useMemo(() => {
    if (!formData) return {};

    return formData.items.reduce<Record<string, typeof formData.items>>(
      (acc, item) => {
        if (!acc[item.sectionId]) acc[item.sectionId] = [];
        acc[item.sectionId].push(item);
        return acc;
      },
      {},
    );
  }, [formData]);

  const scoreSummary = useMemo(() => {
    if (!formData) {
      return {
        rawScore: 0,
        maxScore: 0,
        completedItems: 0,
        totalItems: 0,
        percentage: 0,
      };
    }

    const totalItems = formData.items.length;

    let rawScore = 0;
    let maxScore = 0;
    let completedItems = 0;

    for (const item of formData.items) {
      maxScore += item.maxScore;

      const value = scores[item.id];

      if (value !== undefined && value !== "") {
        completedItems += 1;
        rawScore += Math.min(Math.max(toNumber(value), 0), item.maxScore);
      }
    }

    const percentage = maxScore > 0 ? (rawScore / maxScore) * 100 : 0;

    return {
      rawScore,
      maxScore,
      completedItems,
      totalItems,
      percentage,
    };
  }, [formData, scores]);

  const handleSaveDraft = async () => {
    if (!user || !formData) return;

    setSaving(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const result = await saveEvaluationDraft({
        uid: user.uid,
        orgId: "takween",
        cycleId: formData.cycleId,
        targetPersonId: formData.targetPersonId,
        scores,
        generalNote,
      });

      setFormData((current) => {
        if (!current) return current;

        return {
          ...current,
          existingSubmissionId: result.submissionId,
          existingSubmissionStatus: "DRAFT",
        };
      });

      setSuccessMessage("تم حفظ المسودة بنجاح.");
    } catch (error) {
      console.error(error);
      setError(error instanceof Error ? error.message : "تعذر حفظ المسودة");
    } finally {
      setSaving(false);
    }
  };

  const handleSubmitEvaluation = async () => {
    if (!user || !formData) return;

    const confirmed = window.confirm(
      "هل أنت متأكد من إرسال التقييم؟ بعد الإرسال ستصبح الحالة مرسل.",
    );

    if (!confirmed) return;

    setSubmitting(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const result = await submitEvaluation({
        uid: user.uid,
        orgId: "takween",
        cycleId: formData.cycleId,
        targetPersonId: formData.targetPersonId,
        scores,
        generalNote,
      });

      setFormData((current) => {
        if (!current) return current;

        return {
          ...current,
          existingSubmissionId: result.submissionId,
          existingSubmissionStatus: "SUBMITTED",
        };
      });

      setSuccessMessage("تم إرسال التقييم بنجاح.");
    } catch (error) {
      console.error(error);
      setError(error instanceof Error ? error.message : "تعذر إرسال التقييم");
    } finally {
      setSubmitting(false);
    }
  };

  const handleApproveEvaluation = async () => {
    if (!user || !formData) return;

    const confirmed = window.confirm(
      "هل أنت متأكد من اعتماد التقييم؟ بعد الاعتماد ستصبح النتيجة رسمية.",
    );

    if (!confirmed) return;

    setApproving(true);
    setError(null);
    setSuccessMessage(null);

    try {
      await approveEvaluationSubmission({
        uid: user.uid,
        orgId: "takween",
        cycleId: formData.cycleId,
        targetPersonId: formData.targetPersonId,
      });

      setFormData((current) => {
        if (!current) return current;

        return {
          ...current,
          existingSubmissionStatus: "APPROVED",
        };
      });

      setSuccessMessage("تم اعتماد التقييم بنجاح.");
    } catch (error) {
      console.error(error);
      setError(error instanceof Error ? error.message : "تعذر اعتماد التقييم");
    } finally {
      setApproving(false);
    }
  };

  const submissionStatus = formData?.existingSubmissionStatus;
  const isSubmitted = submissionStatus === "SUBMITTED";
  const isApproved = submissionStatus === "APPROVED";
  const isFinal = isApproved || submissionStatus === "LOCKED";

  if (checkingAuth || loading) {
    return (
      <main className="mx-auto max-w-5xl p-6">
        <div className="rounded-2xl border bg-card p-6">
          جاري تحميل نموذج التقييم...
        </div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="mx-auto max-w-5xl p-6">
        <div className="rounded-2xl border border-destructive/40 bg-card p-6">
          <h1 className="text-xl font-bold">تعذر تحميل نموذج التقييم</h1>
          <p className="mt-2 text-sm text-muted-foreground">{error}</p>
          <Button className="mt-4" onClick={() => void loadForm()}>
            إعادة المحاولة
          </Button>
        </div>
      </main>
    );
  }

  if (!formData) {
    return (
      <main className="mx-auto max-w-5xl p-6">
        <div className="rounded-2xl border bg-card p-6">
          <h1 className="text-xl font-bold">التقييم غير متاح</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            لم يتم العثور على إسناد تقييم مناسب لهذا المستخدم.
          </p>
          <Button asChild className="mt-4" variant="outline">
            <Link href="/staff/evaluations">الرجوع إلى تقييماتي</Link>
          </Button>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-5xl space-y-6 p-6">
      <section className="rounded-3xl border bg-card p-6 shadow-sm">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="space-y-2">
            <div className="text-sm text-muted-foreground">
              {formData.frameworkTitle}
            </div>

            <h1 className="text-2xl font-bold">
              تقييم المعلم: {formData.targetDisplayName}
            </h1>

            <div className="text-sm text-muted-foreground">
              {formData.planTitle} — {formData.cycleTitle}
            </div>

            <div className="text-sm text-muted-foreground">
              حالة الدورة: {formData.cycleStatus || "غير محددة"}
            </div>
            <div className="text-sm text-muted-foreground">
              حالة التقييم:{" "}
              {formData.existingSubmissionStatus === "DRAFT"
                ? "مسودة"
                : formData.existingSubmissionStatus === "SUBMITTED"
                  ? "مرسل"
                  : formData.existingSubmissionStatus === "APPROVED"
                    ? "معتمد"
                    : "لم يبدأ"}
            </div>
          </div>

          <Button asChild variant="outline">
            <Link href="/staff/evaluations">الرجوع</Link>
          </Button>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-4">
        <div className="rounded-2xl border bg-card p-4 shadow-sm">
          <div className="text-sm text-muted-foreground">البنود المكتملة</div>
          <div className="mt-2 text-2xl font-bold">
            {scoreSummary.completedItems}/{scoreSummary.totalItems}
          </div>
        </div>

        <div className="rounded-2xl border bg-card p-4 shadow-sm">
          <div className="text-sm text-muted-foreground">الدرجة الحالية</div>
          <div className="mt-2 text-2xl font-bold">
            {scoreSummary.rawScore}/{scoreSummary.maxScore}
          </div>
        </div>

        <div className="rounded-2xl border bg-card p-4 shadow-sm">
          <div className="text-sm text-muted-foreground">النسبة الحالية</div>
          <div className="mt-2 text-2xl font-bold">
            {scoreSummary.percentage.toFixed(1)}%
          </div>
        </div>

        <div className="rounded-2xl border bg-card p-4 shadow-sm">
          <div className="text-sm text-muted-foreground">وزن المقيم</div>
          <div className="mt-2 text-2xl font-bold">{formData.weight}%</div>
        </div>
      </section>

      <section className="space-y-4">
        {formData.sections.map((section) => {
          const sectionItems = itemsBySection[section.id] ?? [];

          return (
            <div
              key={section.id}
              className="rounded-3xl border bg-card p-6 shadow-sm"
            >
              <div className="mb-5 flex flex-col gap-1">
                <h2 className="text-lg font-bold">{section.title}</h2>
                <div className="text-sm text-muted-foreground">
                  وزن المحور: {section.weight}%
                </div>
              </div>

              <div className="space-y-3">
                {sectionItems.map((item) => (
                  <div
                    key={item.id}
                    className="grid gap-3 rounded-2xl border p-4 md:grid-cols-[1fr_140px]"
                  >
                    <div>
                      <div className="font-medium">{item.title}</div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        الدرجة من {item.maxScore}
                        {item.isRequired ? " — مطلوب" : ""}
                      </div>
                    </div>

                    <input
                      type="number"
                      min={0}
                      max={item.maxScore}
                      step={1}
                      value={scores[item.id] ?? ""}
                      onChange={(event) => {
                        setScores((current) => ({
                          ...current,
                          [item.id]: event.target.value,
                        }));
                      }}
                      className="h-10 rounded-xl border bg-background px-3 text-center"
                      placeholder={`0-${item.maxScore}`}
                    />
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </section>

      <section className="rounded-3xl border bg-card p-6 shadow-sm">
        <label className="text-sm font-medium">ملاحظة عامة</label>
        <textarea
          value={generalNote}
          onChange={(event) => setGeneralNote(event.target.value)}
          className="mt-2 min-h-28 w-full rounded-2xl border bg-background p-3"
          placeholder="اكتب ملاحظة عامة على التقييم..."
        />

        {successMessage ? (
          <div className="mt-4 rounded-2xl border border-green-500/30 bg-green-500/10 p-3 text-sm">
            {successMessage}
          </div>
        ) : null}

        <div className="mt-4 flex flex-col gap-3 md:flex-row md:justify-end">
          <Button
            variant="outline"
            onClick={() => void handleSaveDraft()}
            disabled={
              saving || submitting || approving || isSubmitted || isFinal
            }
          >
            {saving ? "جاري حفظ المسودة..." : "حفظ مسودة"}
          </Button>

          <Button
            onClick={() => void handleSubmitEvaluation()}
            disabled={saving || submitting || approving || isFinal}
          >
            {submitting ? "جاري إرسال التقييم..." : "إرسال التقييم"}
          </Button>

          {isSubmitted ? (
            <Button
              onClick={() => void handleApproveEvaluation()}
              disabled={saving || submitting || approving}
            >
              {approving ? "جاري اعتماد التقييم..." : "اعتماد التقييم"}
            </Button>
          ) : null}
        </div>
      </section>
    </main>
  );
}
