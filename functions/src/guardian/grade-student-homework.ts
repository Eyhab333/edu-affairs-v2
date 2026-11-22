import { getFirestore } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { StudentHomeworkAssignmentSchema, StudentHomeworkSubmissionSchema } from "@takween/contracts";
import { calculateHomeworkSubmissionScore } from "@takween/domain";

type Data = Record<string, unknown>;
const documentId = (value: unknown): string => {
  if (typeof value !== "string" || !value || value.includes("/") || value.length > 1500) throw new HttpsError("invalid-argument", "Invalid document identifier.");
  return value;
};

/** Only active organization administrators or teachers assigned to the exact class and subject can grade. */
export const gradeStudentHomework = onCall(
  { region: "me-central2", cors: true, memory: "1GiB", minInstances: 0 },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError("unauthenticated", "Authentication required.");
    const orgId = documentId(request.data?.orgId);
    const submissionId = documentId(request.data?.submissionId);
    const action = request.data?.action;
    if (action !== "GRADE" && action !== "RETURN") throw new HttpsError("invalid-argument", "Invalid action.");
    const expectedUpdatedAt = request.data?.expectedUpdatedAt;
    if (typeof expectedUpdatedAt !== "number" || !Number.isFinite(expectedUpdatedAt)) throw new HttpsError("invalid-argument", "Expected version is required.");
    const feedback = request.data?.feedback;
    if (typeof feedback !== "string" || feedback.length > 10000) throw new HttpsError("invalid-argument", "Invalid feedback.");
    const db = getFirestore();
    return db.runTransaction(async (tx) => {
      const membershipRef = db.doc(`users/${uid}/orgMemberships/${orgId}`);
      const userRef = db.doc(`users/${uid}`);
      const submissionRef = db.doc(`orgs/${orgId}/studentHomeworkSubmissions/${submissionId}`);
      const [membershipSnap, userSnap, submissionSnap] = await Promise.all([tx.get(membershipRef), tx.get(userRef), tx.get(submissionRef)]);
      const membership = membershipSnap.data();
      const user = userSnap.data();
      const rawSubmission = submissionSnap.data();
      if (!membership || !(membership.isActive === true || membership.active === true)) throw new HttpsError("permission-denied", "Active membership required.");
      if (!rawSubmission || rawSubmission.orgId !== orgId) throw new HttpsError("not-found", "Submission not found.");
      const assignmentRef = db.doc(`orgs/${orgId}/studentHomeworkAssignments/${documentId(rawSubmission.homeworkId)}`);
      const assignmentSnap = await tx.get(assignmentRef);
      const rawAssignment = assignmentSnap.data();
      if (!rawAssignment || rawAssignment.orgId !== orgId || !["PUBLISHED", "CLOSED", "LOCKED"].includes(String(rawAssignment.status)) || !Array.isArray(rawAssignment.targetStudentIds) || !rawAssignment.targetStudentIds.includes(rawSubmission.studentId) || !["schoolId", "academicYearId", "termId", "classId", "subjectKey", "classSubjectOfferingId"].every((key) => rawAssignment[key] === rawSubmission[key])) throw new HttpsError("failed-precondition", "Homework context mismatch.");
      const offeringSnap = await tx.get(db.doc(`orgs/${orgId}/classSubjectOfferings/${documentId(rawAssignment.classSubjectOfferingId)}`));
      const offering = offeringSnap.data();
      if (!offering || offering.orgId !== orgId || offering.isArchived === true || !["schoolId", "academicYearId", "classId", "subjectKey"].every((key) => offering[key] === rawAssignment[key])) throw new HttpsError("failed-precondition", "Teaching context mismatch.");
      const personId = typeof user?.personId === "string" ? user.personId : "";
      const admin = ["platform_owner", "platform_admin", "org_owner", "org_admin"].includes(String(membership.role ?? membership.roleKey ?? ""));
      if (!admin) {
        if (!personId) throw new HttpsError("permission-denied", "Staff identity required.");
        const teacherQuery = db.collection(`orgs/${orgId}/teacherAssignments`).where("teacherPersonId", "==", personId).limit(201);
        const teachers = await tx.get(teacherQuery);
        if (teachers.size > 200) throw new HttpsError("resource-exhausted", "Too many teacher assignments.");
        const now = Date.now();
        const candidates = teachers.docs.filter((doc) => {
          const item = doc.data();
          return item.orgId === orgId && item.schoolId === rawAssignment.schoolId && item.academicYearId === rawAssignment.academicYearId && item.subjectKey === rawAssignment.subjectKey && item.status === "ACTIVE" && item.isActive !== false && item.isArchived !== true && (!item.startAt || item.startAt <= now) && (!item.endAt || item.endAt >= now) && (!item.termId || item.termId === rawAssignment.termId) && (!item.classSubjectOfferingId || item.classSubjectOfferingId === rawAssignment.classSubjectOfferingId);
        });
        let allowed = candidates.some((doc) => {
          const item = doc.data();
          return (item.targetScopeType === "CLASS" && item.targetScopeId === rawAssignment.classId) ||
            (item.coverageMode === "ALL_CLASSES_IN_SCOPE" && ((item.targetScopeType === "SCHOOL" && item.targetScopeId === offering.schoolId) || (item.targetScopeType === "GRADE" && item.targetScopeId && item.targetScopeId === offering.gradeId) || (item.targetScopeType === "STREAM" && item.targetScopeId && item.targetScopeId === offering.streamId)));
        });
        if (!allowed) {
          for (const candidate of candidates) {
            const links = await tx.get(db.collection(`orgs/${orgId}/teacherAssignmentClassLinks`).where("assignmentId", "==", candidate.id).limit(201));
            if (links.size > 200) throw new HttpsError("resource-exhausted", "Too many class links.");
            if (links.docs.some((link) => { const item = link.data(); return item.orgId === orgId && item.schoolId === rawAssignment.schoolId && item.academicYearId === rawAssignment.academicYearId && item.classId === rawAssignment.classId && item.isArchived !== true && item.isActive !== false && (!item.termId || item.termId === rawAssignment.termId) && (!item.classSubjectOfferingId || item.classSubjectOfferingId === rawAssignment.classSubjectOfferingId); })) { allowed = true; break; }
          }
        }
        if (!allowed) throw new HttpsError("permission-denied", "Teacher assignment does not cover this class and subject.");
      }
      if (rawSubmission.updatedAt !== expectedUpdatedAt) throw new HttpsError("aborted", "Submission changed. Reload before grading.");
      if (!["SUBMITTED", "LATE_SUBMITTED"].includes(String(rawSubmission.status))) throw new HttpsError("failed-precondition", "Only submitted homework can be graded or returned.");
      const assignmentParsed = StudentHomeworkAssignmentSchema.safeParse({ ...rawAssignment, id: assignmentSnap.id });
      const submissionParsed = StudentHomeworkSubmissionSchema.safeParse({ ...rawSubmission, id: submissionSnap.id });
      if (!assignmentParsed.success || !submissionParsed.success) throw new HttpsError("failed-precondition", "Incompatible homework record.");
      const assignment = assignmentParsed.data;
      const submission = submissionParsed.data;
      const expectedAnswers = submission.answers.map((answer) => ({ questionId: answer.questionId, selectedChoiceIds: answer.selectedChoiceIds, answerText: answer.answerText, booleanAnswer: answer.booleanAnswer ?? null }));
      if (request.data?.expectedSubmittedAt !== (submission.submittedAt ?? null) || JSON.stringify(request.data?.expectedAnswers) !== JSON.stringify(expectedAnswers)) throw new HttpsError("aborted", "Submission changed. Reload before grading.");
      if (submission.homeworkQuestions.length) assignment.questions = submission.homeworkQuestions;
      const now = Date.now();
      if (action === "RETURN") {
        if (assignment.status !== "PUBLISHED" || (assignment.closedAt && assignment.closedAt <= now) || (assignment.lockedAt && assignment.lockedAt <= now)) throw new HttpsError("failed-precondition", "Only published homework can be returned.");
        if (!Array.isArray(request.data?.scores) || request.data.scores.length > assignment.questions.length) throw new HttpsError("invalid-argument", "Invalid question feedback.");
        const comments = new Map<string, string>();
        for (const raw of request.data.scores) {
          if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new HttpsError("invalid-argument", "Invalid question feedback.");
          const questionId = documentId(raw.questionId);
          if (comments.has(questionId) || !assignment.questions.some((question) => question.id === questionId) || typeof raw.feedback !== "string" || raw.feedback.length > 10000) throw new HttpsError("invalid-argument", "Invalid question feedback.");
          comments.set(questionId, raw.feedback);
        }
        const returnedAnswers = submission.answers.map((answer) => ({ ...answer, feedback: comments.get(answer.questionId) ?? "" }));
        tx.update(submissionRef, { answers: JSON.parse(JSON.stringify(returnedAnswers)), status: "RETURNED", feedback, returnedAt: now, updatedAt: now });
        tx.update(assignmentRef, { submittedCount: Math.max(0, (typeof rawAssignment.submittedCount === "number" ? rawAssignment.submittedCount : 0) - 1), missingCount: (typeof rawAssignment.missingCount === "number" ? rawAssignment.missingCount : 0) + 1, updatedAt: now });
        return { ok: true, status: "RETURNED" };
      }
      const scores = request.data?.scores;
      if (!Array.isArray(scores) || scores.length > assignment.questions.length) throw new HttpsError("invalid-argument", "Invalid question grades.");
      const byId = new Map<string, Data>();
      for (const score of scores) {
        if (!score || typeof score !== "object" || Array.isArray(score)) throw new HttpsError("invalid-argument", "Invalid question grade.");
        const entry = score as Data; const questionId = documentId(entry.questionId);
        if (byId.has(questionId)) throw new HttpsError("invalid-argument", "Duplicate question grade.");
        byId.set(questionId, entry);
      }
      const questionIds = new Set(assignment.questions.map((question) => question.id));
      if ([...byId.keys()].some((questionId) => !questionIds.has(questionId))) throw new HttpsError("invalid-argument", "Unknown question.");
      const answers = submission.answers.map((answer) => {
        const question = assignment.questions.find((item) => item.id === answer.questionId);
        if (!question) throw new HttpsError("failed-precondition", "Unknown answer in submission.");
        const entry = byId.get(question.id);
        const manual = question.gradingMode === "MANUAL" || (question.gradingMode === "MIXED" && question.questionType === "SHORT_ANSWER" && !question.correctAnswer.trim());
        if (!manual && entry && entry.score != null) throw new HttpsError("invalid-argument", "Automatic scores cannot be changed.");
        if (entry && typeof entry.feedback !== "string") throw new HttpsError("invalid-argument", "Invalid question feedback.");
        if (entry && String(entry.feedback).length > 10000) throw new HttpsError("invalid-argument", "Feedback too long.");
        if (manual && (!entry || typeof entry.score !== "number" || !Number.isFinite(entry.score) || entry.score < 0 || entry.score > question.maxScore)) throw new HttpsError("failed-precondition", "Every manual question requires a valid score.");
        return { ...answer, ...(manual ? { score: entry!.score as number } : {}), feedback: entry ? String(entry.feedback) : "", gradedAt: now, gradedByPersonId: personId || uid };
      });
      if (answers.length !== assignment.questions.length || new Set(answers.map((answer) => answer.questionId)).size !== assignment.questions.length || questionIds.size !== assignment.questions.length) throw new HttpsError("failed-precondition", "Submission has missing or duplicate answers.");
      const result = calculateHomeworkSubmissionScore({ assignment, submission: { ...submission, answers } });
      if (result.manualPendingCount) throw new HttpsError("failed-precondition", "Manual grading is incomplete.");
      tx.update(submissionRef, { status: "GRADED", answers: JSON.parse(JSON.stringify(result.answers)), score: result.score, maxScore: result.maxScore, feedback, gradedAt: now, gradedByPersonId: personId || uid, updatedAt: now });
      tx.update(assignmentRef, { gradedCount: (typeof rawAssignment.gradedCount === "number" ? rawAssignment.gradedCount : 0) + 1, updatedAt: now });
      return { ok: true, status: "GRADED" };
    });
  },
);
