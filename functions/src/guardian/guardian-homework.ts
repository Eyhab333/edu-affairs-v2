import { FieldPath, FieldValue } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { StudentHomeworkAssignmentSchema, StudentHomeworkSubmissionSchema, type StudentHomeworkAnswer } from "@takween/contracts";
import { calculateHomeworkSubmissionScore } from "@takween/domain";
import { assertGuardianStudentAccess } from "./guardian-student-access";

const options = { region: "me-central2", cors: true, memory: "1GiB" as const, minInstances: 0 };
const pageSize = 50;
type Data = Record<string, unknown>;
const text = (value: unknown): string => typeof value === "string" ? value : "";
const number = (value: unknown): number | null => typeof value === "number" && Number.isFinite(value) ? value : null;

function id(value: unknown): string {
  if (typeof value !== "string" || !value || value.length > 1500 || value.includes("/")) {
    throw new HttpsError("invalid-argument", "Invalid document identifier.");
  }
  return value;
}

function visible(assignment: Data, studentId: string, now: number): boolean {
  return ["PUBLISHED", "CLOSED", "LOCKED"].includes(String(assignment.status)) &&
    Array.isArray(assignment.targetStudentIds) && assignment.targetStudentIds.includes(studentId) &&
    typeof assignment.publishedAt === "number" && assignment.publishedAt <= now &&
    (typeof assignment.scheduledPublishAt !== "number" || assignment.scheduledPublishAt <= now) &&
    assignment.isArchived !== true;
}

// Reject mismatched historical records without requiring optional legacy fields.
function matchingContext(assignment: Data, submission: Data, orgId: string): boolean {
  if ((assignment.orgId && assignment.orgId !== orgId) || (submission.orgId && submission.orgId !== orgId)) return false;
  return ["schoolId", "academicYearId", "termId", "classId", "subjectKey", "classSubjectOfferingId"]
    .every((field) => !assignment[field] || !submission[field] || assignment[field] === submission[field]);
}

function safeResult(submissionId: string, assignment: Data, submission: Data) {
  const released = submission.status === "GRADED";
  const now = Date.now();
  const effectiveStatus = typeof assignment.lockedAt === "number" && assignment.lockedAt <= now ? "LOCKED" :
    typeof assignment.closedAt === "number" && assignment.closedAt <= now ? "CLOSED" : text(assignment.status);
  const questions = Array.isArray(submission.homeworkQuestions) && submission.homeworkQuestions.length
    ? submission.homeworkQuestions : Array.isArray(assignment.questions) ? assignment.questions : [];
  const answers = Array.isArray(submission.answers) ? submission.answers : [];
  return {
    submissionId,
    title: String(assignment.title ?? ""), description: String(assignment.description ?? ""),
    subject: String(assignment.subjectTitle ?? assignment.subjectKey ?? ""),
    publishedAt: number(assignment.publishedAt), dueAt: number(assignment.dueAt),
    assignmentStatus: effectiveStatus, status: text(submission.status),
    score: released ? number(submission.score) : null,
    maxScore: released ? number(submission.maxScore) : null,
    feedback: released || submission.status === "RETURNED" ? String(submission.feedback ?? "") : "",
    questions: questions.map((raw: Data) => ({
      id: text(raw.id), questionType: text(raw.questionType), title: text(raw.title), prompt: text(raw.prompt),
      order: number(raw.order) ?? 0,
      choices: Array.isArray(raw.choices) ? raw.choices.map((choice: Data) => ({ id: text(choice?.id), text: text(choice?.text), order: number(choice?.order) ?? 0 })) : [],
    })),
    answers: answers.map((raw: Data) => ({
      questionId: text(raw.questionId), selectedChoiceIds: Array.isArray(raw.selectedChoiceIds) ? raw.selectedChoiceIds.filter((value: unknown) => typeof value === "string") : [],
      answerText: text(raw.answerText), booleanAnswer: typeof raw.booleanAnswer === "boolean" ? raw.booleanAnswer : null,
      feedback: released || submission.status === "RETURNED" ? text(raw.feedback) : "",
    })),
  };
}

function answersFor(input: unknown, assignment: ReturnType<typeof StudentHomeworkAssignmentSchema.parse>, complete: boolean): StudentHomeworkAnswer[] {
  if (!Array.isArray(input) || input.length > assignment.questions.length) throw new HttpsError("invalid-argument", "Invalid answers.");
  const provided = new Map<string, Data>();
  for (const entry of input) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) throw new HttpsError("invalid-argument", "Invalid answer.");
    const answer = entry as Data;
    const questionId = id(answer.questionId);
    if (provided.has(questionId) || !assignment.questions.some((question) => question.id === questionId)) throw new HttpsError("invalid-argument", "Unknown or duplicate question.");
    provided.set(questionId, answer);
  }
  return assignment.questions.flatMap((question): StudentHomeworkAnswer[] => {
    const answer = provided.get(question.id);
    if (!answer) {
      if (complete) throw new HttpsError("invalid-argument", "All questions must be answered.");
      return [];
    }
    const base = { questionId: question.id, questionBankItemId: question.questionBankItemId, questionType: question.questionType, selectedChoiceIds: [] as string[], answerText: "", feedback: "", gradedByPersonId: "" };
    if (question.questionType === "MULTIPLE_CHOICE") {
      if (!Array.isArray(answer.selectedChoiceIds) || answer.selectedChoiceIds.some((choice) => typeof choice !== "string" || !question.choices.some((item) => item.id === choice)) || new Set(answer.selectedChoiceIds).size !== answer.selectedChoiceIds.length) throw new HttpsError("invalid-argument", "Invalid choices.");
      if (complete && !answer.selectedChoiceIds.length) throw new HttpsError("invalid-argument", "All questions must be answered.");
      if (!answer.selectedChoiceIds.length) return [];
      return [{ ...base, selectedChoiceIds: answer.selectedChoiceIds as string[] }];
    }
    if (question.questionType === "TRUE_FALSE") {
      if (typeof answer.booleanAnswer !== "boolean") { if (complete) throw new HttpsError("invalid-argument", "All questions must be answered."); return []; }
      return [{ ...base, booleanAnswer: answer.booleanAnswer }];
    }
    if (typeof answer.answerText !== "string" || answer.answerText.length > 10000) throw new HttpsError("invalid-argument", "Invalid text answer.");
    if (!answer.answerText.trim()) { if (complete) throw new HttpsError("invalid-argument", "All questions must be answered."); return []; }
    return [{ ...base, answerText: answer.answerText }];
  });
}

export const getMyGuardianHomeworks = onCall(options, async (request) => {
  const context = await assertGuardianStudentAccess(request.auth?.uid, request.data?.studentId);
  const collection = context.db.collection(`orgs/${context.orgId}/studentHomeworkSubmissions`);
  let query = collection.where("studentId", "==", context.studentId).orderBy(FieldPath.documentId()).limit(pageSize);
  if (request.data?.cursor) query = query.startAfter(id(request.data.cursor));
  const page = await query.get();
  const rows = page.docs.filter((doc) => typeof doc.data().homeworkId === "string" && !String(doc.data().homeworkId).includes("/"));
  const refs = [...new Set(rows.map((doc) => String(doc.data().homeworkId)))].filter(Boolean).map((homeworkId) => context.db.doc(`orgs/${context.orgId}/studentHomeworkAssignments/${homeworkId}`));
  const docs = refs.length ? await context.db.getAll(...refs) : [];
  const assignments = new Map(docs.filter((doc) => doc.exists).map((doc) => [doc.id, doc.data() as Data]));
  const items = rows.flatMap((doc) => {
    const submission = doc.data(); const assignment = assignments.get(String(submission.homeworkId));
    if (!assignment || !matchingContext(assignment, submission, context.orgId) || !visible(assignment, context.studentId, Date.now()) || submission.status === "CANCELLED") return [];
    const { questions: _questions, answers: _answers, ...summary } = safeResult(doc.id, assignment, submission);
    return [summary];
  });
  return { items, nextCursor: page.size === pageSize ? page.docs[page.docs.length - 1].id : null };
});

export const getMyGuardianHomeworkDetails = onCall(options, async (request) => {
  const context = await assertGuardianStudentAccess(request.auth?.uid, request.data?.studentId);
  const submission = await context.db.doc(`orgs/${context.orgId}/studentHomeworkSubmissions/${id(request.data?.submissionId)}`).get();
  const row = submission.data();
  if (!row || row.studentId !== context.studentId || row.status === "CANCELLED") throw new HttpsError("not-found", "Homework not found.");
  const assignment = await context.db.doc(`orgs/${context.orgId}/studentHomeworkAssignments/${id(row.homeworkId)}`).get();
  const data = assignment.data();
  if (!data || !matchingContext(data, row, context.orgId) || !visible(data, context.studentId, Date.now())) throw new HttpsError("not-found", "Homework not found.");
  return safeResult(submission.id, data, row);
});

async function writeHomework(request: { auth?: { uid: string }; data: any }, submit: boolean) {
  const context = await assertGuardianStudentAccess(request.auth?.uid, request.data?.studentId);
  const ref = context.db.doc(`orgs/${context.orgId}/studentHomeworkSubmissions/${id(request.data?.submissionId)}`);
  return context.db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref); const row = snapshot.data();
    if (!row || row.studentId !== context.studentId || row.status === "CANCELLED") throw new HttpsError("not-found", "Homework not found.");
    const assignmentRef = context.db.doc(`orgs/${context.orgId}/studentHomeworkAssignments/${id(row.homeworkId)}`);
    const assignmentSnapshot = await transaction.get(assignmentRef); const rawAssignment = assignmentSnapshot.data();
    const now = Date.now();
    if (!rawAssignment || !matchingContext(rawAssignment, row, context.orgId) || !visible(rawAssignment, context.studentId, now)) throw new HttpsError("not-found", "Homework not found.");
    if (submit && ["SUBMITTED", "LATE_SUBMITTED", "GRADED"].includes(String(row.status))) return { ok: true, status: row.status };
    if (rawAssignment.status !== "PUBLISHED" || (typeof rawAssignment.closedAt === "number" && rawAssignment.closedAt <= now) || (typeof rawAssignment.lockedAt === "number" && rawAssignment.lockedAt <= now)) throw new HttpsError("failed-precondition", "Homework is closed.");
    if (!["NOT_STARTED", "IN_PROGRESS", "RETURNED"].includes(String(row.status))) throw new HttpsError("failed-precondition", "Homework cannot be changed.");
    if (row.submittedAt && row.status !== "RETURNED") throw new HttpsError("failed-precondition", "Homework has already been submitted.");
    const parsedAssignment = StudentHomeworkAssignmentSchema.safeParse({ ...rawAssignment, id: assignmentSnapshot.id });
    const parsedSubmission = StudentHomeworkSubmissionSchema.safeParse({ ...row, id: snapshot.id });
    if (!parsedAssignment.success || !parsedSubmission.success) throw new HttpsError("failed-precondition", "Homework record is incompatible.");
    const assignment = parsedAssignment.data;
    if (parsedSubmission.data.homeworkQuestions.length) assignment.questions = parsedSubmission.data.homeworkQuestions;
    const answers = answersFor(request.data?.answers, assignment, submit);
    if (!submit) {
      transaction.update(ref, { answers, status: row.status === "RETURNED" ? "RETURNED" : answers.length ? "IN_PROGRESS" : "NOT_STARTED", startedAt: row.startedAt ?? now, updatedAt: now });
      return { ok: true, status: row.status === "RETURNED" ? "RETURNED" : answers.length ? "IN_PROGRESS" : "NOT_STARTED" };
    }
    const grade = calculateHomeworkSubmissionScore({ assignment, submission: { ...parsedSubmission.data, answers } });
    const late = typeof assignment.dueAt === "number" && now > assignment.dueAt;
    const status = late ? "LATE_SUBMITTED" : "SUBMITTED";
    const gradedAnswers = JSON.parse(JSON.stringify(grade.answers));
    transaction.update(ref, { answers: gradedAnswers, score: grade.score, maxScore: grade.maxScore, status, submittedAt: now, startedAt: row.startedAt ?? now, isLate: late, updatedAt: now, gradedByPersonId: "", feedback: "", gradedAt: FieldValue.delete(), returnedAt: FieldValue.delete() });
    if (!row.submittedAt || row.status === "RETURNED") transaction.update(assignmentRef, { submittedCount: (typeof rawAssignment.submittedCount === "number" ? rawAssignment.submittedCount : 0) + 1, missingCount: Math.max(0, (typeof rawAssignment.missingCount === "number" ? rawAssignment.missingCount : 0) - 1), updatedAt: now });
    return { ok: true, status };
  });
}

export const saveMyGuardianHomeworkDraft = onCall(options, (request) => writeHomework(request, false));
export const submitMyGuardianHomework = onCall(options, (request) => writeHomework(request, true));
