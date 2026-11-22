"use client";

import { useState } from "react";
import { httpsCallable } from "firebase/functions";
import type { StudentHomeworkAssignment, StudentHomeworkSubmission } from "@takween/contracts";
import { functions } from "@/lib/firebase";

export function HomeworkGrading({ orgId, assignment, submission, onChanged }: {
  orgId: string;
  assignment: StudentHomeworkAssignment;
  submission: StudentHomeworkSubmission;
  onChanged: () => void;
}) {
  const [scores, setScores] = useState<Record<string, string>>({});
  const [questionFeedback, setQuestionFeedback] = useState<Record<string, string>>({});
  const [feedback, setFeedback] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const questions = submission.homeworkQuestions.length ? submission.homeworkQuestions : assignment.questions;
  const canGrade = ["SUBMITTED", "LATE_SUBMITTED"].includes(submission.status);
  const manualQuestion = (question: typeof questions[number]) => question.gradingMode === "MANUAL" ||
    (question.gradingMode === "MIXED" && question.questionType === "SHORT_ANSWER" && !question.correctAnswer.trim());

  async function run(action: "GRADE" | "RETURN") {
    if (action === "RETURN" && !window.confirm("إعادة الواجب للطالب للتعديل؟")) return;
    if (action === "GRADE" && !window.confirm("اعتماد التصحيح وإظهار النتيجة لولي الأمر؟")) return;
    const grades = questions.map((question) => ({
      questionId: question.id,
      feedback: questionFeedback[question.id] ?? "",
      ...(manualQuestion(question) ? { score: scores[question.id]?.trim() ? Number(scores[question.id]) : null } : {}),
    }));
    setBusy(true); setError("");
    try {
      await httpsCallable(functions, "gradeStudentHomework")({ orgId, submissionId: submission.id, expectedUpdatedAt: submission.updatedAt, expectedSubmittedAt: submission.submittedAt ?? null, expectedAnswers: submission.answers.map((answer) => ({ questionId: answer.questionId, selectedChoiceIds: answer.selectedChoiceIds, answerText: answer.answerText, booleanAnswer: answer.booleanAnswer ?? null })), action, feedback, scores: grades });
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذر حفظ التصحيح، يرجى إعادة تحميل التسليم والمحاولة مجدداً.");
    } finally { setBusy(false); }
  }

  return <details className="mt-4 rounded-2xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
    <summary className="cursor-pointer font-bold">عرض الإجابات والتصحيح</summary>
    <div className="mt-3 space-y-4">
      {questions.map((question, index) => {
        const answer = submission.answers.find((item) => item.questionId === question.id);
        const response = question.questionType === "MULTIPLE_CHOICE"
          ? (answer?.selectedChoiceIds ?? []).map((id) => question.choices.find((choice) => choice.id === id)?.text ?? id).join("، ")
          : question.questionType === "TRUE_FALSE"
            ? answer?.booleanAnswer === true ? "صح" : answer?.booleanAnswer === false ? "خطأ" : "—"
            : answer?.answerText || "—";
        const manual = manualQuestion(question);
        return <div key={question.id} className="rounded-xl bg-slate-50 p-3 text-sm dark:bg-slate-950">
          <p className="font-semibold">{index + 1}. {question.prompt}</p>
          <p className="mt-2">الإجابة: {response || "—"}</p>
          <p className="mt-1 text-slate-500">{manual && canGrade ? "يحتاج تصحيحاً يدوياً" : `الدرجة: ${answer?.score ?? "—"} / ${question.maxScore}${manual ? "" : " (آلي)"}`}</p>
          {!canGrade && answer?.feedback && <p className="mt-1">ملاحظة المعلم: {answer.feedback}</p>}
          {canGrade && manual && <label className="mt-2 block">الدرجة من {question.maxScore}
            <input className="mt-1 block w-full rounded-lg border p-2 text-slate-900" type="number" min={0} max={question.maxScore} step="any" value={scores[question.id] ?? ""} onChange={(event) => setScores({ ...scores, [question.id]: event.target.value })} />
          </label>}
          {canGrade && <label className="mt-2 block">ملاحظة السؤال
            <input className="mt-1 block w-full rounded-lg border p-2 text-slate-900" maxLength={10000} value={questionFeedback[question.id] ?? ""} onChange={(event) => setQuestionFeedback({ ...questionFeedback, [question.id]: event.target.value })} />
          </label>}
        </div>;
      })}
      {canGrade && <>
        <label className="block text-sm">ملاحظات عامة
          <textarea className="mt-1 block w-full rounded-lg border p-2 text-slate-900" maxLength={10000} value={feedback} onChange={(event) => setFeedback(event.target.value)} />
        </label>
        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={busy} onClick={() => void run("GRADE")} className="rounded-xl bg-emerald-700 px-3 py-2 text-white disabled:opacity-50">اعتماد التصحيح</button>
          {assignment.status === "PUBLISHED" && <button type="button" disabled={busy} onClick={() => void run("RETURN")} className="rounded-xl border px-3 py-2 disabled:opacity-50">إعادة للتعديل</button>}
        </div>
      </>}
    </div>
  </details>;
}
