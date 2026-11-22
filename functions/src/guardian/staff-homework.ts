import {
  FieldPath,
  getFirestore,
  type DocumentSnapshot,
  type Query,
  type Transaction,
} from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import {
  QuestionBankItemSchema,
  StudentHomeworkAssignmentSchema,
  StudentHomeworkSubmissionSchema,
} from "@takween/contracts";
import {
  buildHomeworkQuestionSnapshot,
  calculateHomeworkMaxScore,
  validateHomeworkQuestions,
  validateQuestionBankItem,
} from "@takween/domain";

const options = {
  region: "me-central2",
  cors: true,
  memory: "1GiB" as const,
  minInstances: 0,
};
const cap = 200;
type Row = Record<string, any>;
function identifier(value: unknown): string {
  if (
    typeof value !== "string" ||
    !value ||
    value.includes("/") ||
    value.length > 500
  )
    throw new HttpsError("invalid-argument", "Invalid identifier.");
  return value;
}
function data(value: unknown): Row {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new HttpsError("invalid-argument", "Invalid input.");
  return value as Row;
}

async function authorize(
  uid: string | undefined,
  orgId: string,
  offeringId: string,
  termId: string,
) {
  if (!uid) throw new HttpsError("unauthenticated", "Authentication required.");
  const db = getFirestore();
  const [membershipSnap, userSnap, offeringSnap] = await Promise.all([
    db.doc(`users/${uid}/orgMemberships/${orgId}`).get(),
    db.doc(`users/${uid}`).get(),
    db.doc(`orgs/${orgId}/classSubjectOfferings/${offeringId}`).get(),
  ]);
  const membership = membershipSnap.data();
  const user = userSnap.data();
  const offering = offeringSnap.data();
  if (
    !membership ||
    !(membership.active === true || membership.isActive === true)
  )
    throw new HttpsError("permission-denied", "Active membership required.");
  if (
    !offering ||
    offering.orgId !== orgId ||
    offering.isArchived === true ||
    !offering.schoolId ||
    !offering.academicYearId ||
    !offering.classId ||
    !offering.subjectKey
  )
    throw new HttpsError("not-found", "Teaching context not found.");
  const admin = [
    "platform_owner",
    "platform_admin",
    "org_owner",
    "org_admin",
  ].includes(String(membership.role ?? membership.roleKey ?? ""));
  const personId =
    typeof user?.personId === "string" && user.personId ? user.personId : uid;
  const proofs: DocumentSnapshot[] = [membershipSnap, userSnap, offeringSnap];
  if (!admin) {
    const teachers = await db
      .collection(`orgs/${orgId}/teacherAssignments`)
      .where("teacherPersonId", "==", personId)
      .limit(cap + 1)
      .get();
    if (teachers.size > cap)
      throw new HttpsError(
        "resource-exhausted",
        "Too many teacher assignments.",
      );
    const now = Date.now();
    const candidates = teachers.docs.filter((doc) => {
      const item = doc.data();
      return (
        item.orgId === orgId &&
        item.schoolId === offering.schoolId &&
        item.academicYearId === offering.academicYearId &&
        item.subjectKey === offering.subjectKey &&
        item.status === "ACTIVE" &&
        item.isActive !== false &&
        item.isArchived !== true &&
        (!item.startAt || item.startAt <= now) &&
        (!item.endAt || item.endAt >= now) &&
        (!item.termId || item.termId === termId) &&
        (!item.classSubjectOfferingId ||
          item.classSubjectOfferingId === offeringId)
      );
    });
    const direct = candidates.find((doc) => {
      const item = doc.data();
      return (
        (item.targetScopeType === "CLASS" &&
          item.targetScopeId === offering.classId) ||
        (item.coverageMode === "ALL_CLASSES_IN_SCOPE" &&
          typeof item.targetScopeId === "string" &&
          item.targetScopeId.length > 0 &&
          ((item.targetScopeType === "SCHOOL" &&
            item.targetScopeId === offering.schoolId) ||
            (item.targetScopeType === "GRADE" &&
              item.targetScopeId === offering.gradeId) ||
            (item.targetScopeType === "STREAM" &&
              item.targetScopeId === offering.streamId)))
      );
    });
    let allowed = !!direct;
    if (direct) proofs.push(direct);
    if (!allowed) {
      for (const candidate of candidates) {
        const links = await db
          .collection(`orgs/${orgId}/teacherAssignmentClassLinks`)
          .where("assignmentId", "==", candidate.id)
          .limit(cap + 1)
          .get();
        if (links.size > cap)
          throw new HttpsError("resource-exhausted", "Too many class links.");
        const link = links.docs.find((doc) => {
          const row = doc.data();
          return (
            row.orgId === orgId &&
            row.schoolId === offering.schoolId &&
            row.academicYearId === offering.academicYearId &&
            row.classId === offering.classId &&
            row.isArchived !== true &&
            row.isActive !== false &&
            (!row.termId || row.termId === termId) &&
            (!row.classSubjectOfferingId ||
              row.classSubjectOfferingId === offeringId)
          );
        });
        if (link) {
          proofs.push(candidate, link);
          allowed = true;
          break;
        }
      }
    }
    if (!allowed)
      throw new HttpsError(
        "permission-denied",
        "Teaching assignment does not cover this class and subject.",
      );
  }
  return { db, orgId, offeringId, offering, personId, admin, proofs };
}

async function checkProofs(tx: Transaction, proofs: DocumentSnapshot[]) {
  for (const proof of proofs) {
    const current = await tx.get(proof.ref);
    if (
      current.exists !== proof.exists ||
      (current.exists &&
        (!current.updateTime ||
          !proof.updateTime ||
          !current.updateTime.isEqual(proof.updateTime)))
    )
      throw new HttpsError(
        "aborted",
        "Staff access changed; retry the operation.",
      );
  }
}

function matchesOffering(
  row: Row,
  context: Awaited<ReturnType<typeof authorize>>,
): boolean {
  return (
    row.orgId === context.orgId &&
    row.schoolId === context.offering.schoolId &&
    row.academicYearId === context.offering.academicYearId &&
    row.classId === context.offering.classId &&
    row.subjectKey === context.offering.subjectKey &&
    row.classSubjectOfferingId === context.offeringId
  );
}
async function requireTerm(
  context: Awaited<ReturnType<typeof authorize>>,
  value: unknown,
): Promise<string> {
  const termId = identifier(value);
  const term = await context.db
    .doc(
      `orgs/${context.orgId}/academicYears/${identifier(context.offering.academicYearId)}/terms/${termId}`,
    )
    .get();
  if (!term.exists)
    throw new HttpsError("failed-precondition", "Academic term not found.");
  return termId;
}
function bounded(size: number) {
  if (size > cap)
    throw new HttpsError(
      "resource-exhausted",
      "Too many records; contact an administrator.",
    );
}
async function page(query: Query, cursor: unknown) {
  let boundedQuery = query.orderBy(FieldPath.documentId()).limit(100);
  if (cursor != null)
    boundedQuery = boundedQuery.startAfter(identifier(cursor));
  const snapshot = await boundedQuery.get();
  return {
    docs: snapshot.docs,
    nextCursor:
      snapshot.size === 100 ? snapshot.docs[snapshot.size - 1].id : null,
  };
}

export const staffHomework = onCall(options, async (request) => {
  const input = data(request.data);
  const orgId = identifier(input.orgId);
  let offeringIdInput = input.offeringId;
  let termIdInput = input.termId ?? input.item?.termId;
  if (["details", "listSubmissions", "publish"].includes(input.action)) {
    const existing = await getFirestore()
      .doc(
        `orgs/${orgId}/studentHomeworkAssignments/${identifier(input.homeworkId)}`,
      )
      .get();
    if (!existing.exists)
      throw new HttpsError("not-found", "Homework not found.");
    offeringIdInput = existing.data()?.classSubjectOfferingId;
    termIdInput = existing.data()?.termId;
  }
  const termId = identifier(termIdInput);
  const context = await authorize(
    request.auth?.uid,
    orgId,
    identifier(offeringIdInput),
    termId,
  );
  await requireTerm(context, termId);
  const { db, offering, offeringId, personId, admin } = context;
  const questions = db.collection(`orgs/${orgId}/questionBankItems`);
  const assignments = db.collection(`orgs/${orgId}/studentHomeworkAssignments`);
  const submissions = db.collection(`orgs/${orgId}/studentHomeworkSubmissions`);
  switch (input.action) {
    case "listQuestions": {
      const result = await page(
        admin
          ? questions.where("subjectKey", "==", offering.subjectKey)
          : questions.where("classSubjectOfferingId", "==", offeringId),
        input.cursor,
      );
      return {
        nextCursor: result.nextCursor,
        items: result.docs.flatMap((doc) => {
          const item = doc.data();
          const scoped =
            item.orgId === orgId &&
            item.schoolId === offering.schoolId &&
            item.academicYearId === offering.academicYearId &&
            item.subjectKey === offering.subjectKey &&
            item.classSubjectOfferingId === offeringId;
          const unscoped =
            !item.schoolId ||
            !item.academicYearId ||
            !item.classSubjectOfferingId;
          return (scoped && item.termId === termId) ||
            (admin && unscoped && item.orgId === orgId)
            ? [{ ...item, id: doc.id }]
            : [];
        }),
      };
    }
    case "scopeLegacyQuestion": {
      if (!admin)
        throw new HttpsError("permission-denied", "Administrator required.");
      const ref = questions.doc(identifier(input.questionId));
      await db.runTransaction(async (tx) => {
        await checkProofs(tx, context.proofs);
        const snapshot = await tx.get(ref);
        const item = snapshot.data();
        if (
          !item ||
          item.orgId !== orgId ||
          item.subjectKey !== offering.subjectKey ||
          item.termId !== termId ||
          (item.gradeId && item.gradeId !== offering.gradeId) ||
          (item.schoolId && item.schoolId !== offering.schoolId) ||
          (item.academicYearId &&
            item.academicYearId !== offering.academicYearId) ||
          (item.classSubjectOfferingId &&
            item.classSubjectOfferingId !== offeringId) ||
          (item.schoolId && item.academicYearId && item.classSubjectOfferingId)
        )
          throw new HttpsError(
            "failed-precondition",
            "Question cannot be assigned to this context.",
          );
        tx.update(ref, {
          schoolId: offering.schoolId,
          academicYearId: offering.academicYearId,
          classSubjectOfferingId: offeringId,
          updatedAt: Date.now(),
        });
      });
      return { ok: true };
    }
    case "createQuestion": {
      const item = data(input.item);
      const termId = await requireTerm(context, item.termId);
      const ref = questions.doc();
      const now = Date.now();
      const parsed = QuestionBankItemSchema.safeParse({
        ...item,
        id: ref.id,
        orgId,
        schoolId: offering.schoolId,
        academicYearId: offering.academicYearId,
        gradeId: offering.gradeId ?? "",
        subjectKey: offering.subjectKey,
        classSubjectOfferingId: offeringId,
        termId,
        createdByPersonId: personId,
        createdByRoleKey: undefined,
        isActive: true,
        isArchived: false,
        createdAt: now,
        updatedAt: now,
      });
      if (!parsed.success || !validateQuestionBankItem(parsed.data).ok)
        throw new HttpsError("invalid-argument", "Invalid question.");
      await db.runTransaction(async (tx) => {
        await checkProofs(tx, context.proofs);
        tx.create(ref, JSON.parse(JSON.stringify(parsed.data)));
      });
      return { id: ref.id };
    }
    case "listAssignments": {
      const termId = await requireTerm(context, input.termId);
      const result = await page(
        assignments.where("classSubjectOfferingId", "==", offeringId),
        input.cursor,
      );
      return {
        nextCursor: result.nextCursor,
        items: result.docs.flatMap((doc) =>
          matchesOffering(doc.data(), context) && doc.data().termId === termId
            ? [{ ...doc.data(), id: doc.id }]
            : [],
        ),
      };
    }
    case "createAssignment": {
      const item = data(input.item);
      const termId = await requireTerm(context, item.termId);
      if (
        !Array.isArray(input.questionIds) ||
        !input.questionIds.length ||
        input.questionIds.length > 100
      )
        throw new HttpsError("invalid-argument", "Invalid questions.");
      const ids = input.questionIds.map(identifier);
      if (new Set(ids).size !== ids.length)
        throw new HttpsError("invalid-argument", "Duplicate questions.");
      const snapshots = await db.getAll(
        ...ids.map((questionId: string) => questions.doc(questionId)),
      );
      const parsedItems = snapshots.map((snapshot) => {
        const itemData = snapshot.data();
        if (
          !itemData ||
          itemData.orgId !== orgId ||
          itemData.schoolId !== offering.schoolId ||
          itemData.academicYearId !== offering.academicYearId ||
          itemData.classSubjectOfferingId !== offeringId ||
          itemData.subjectKey !== offering.subjectKey ||
          itemData.termId !== termId ||
          itemData.isArchived === true ||
          itemData.isActive === false
        )
          throw new HttpsError(
            "permission-denied",
            "Question is not available in this context.",
          );
        return QuestionBankItemSchema.parse({ ...itemData, id: snapshot.id });
      });
      const questionSnapshots = parsedItems.map((question, index) =>
        buildHomeworkQuestionSnapshot(question, {
          id: `q-${index + 1}-${question.id}`,
          order: index,
        }),
      );
      if (!validateHomeworkQuestions(questionSnapshots).ok)
        throw new HttpsError("invalid-argument", "Invalid homework questions.");
      const ref = assignments.doc();
      const now = Date.now();
      const parsed = StudentHomeworkAssignmentSchema.safeParse({
        id: ref.id,
        orgId,
        schoolId: offering.schoolId,
        academicYearId: offering.academicYearId,
        classId: offering.classId,
        gradeId: offering.gradeId ?? "",
        subjectKey: offering.subjectKey,
        classSubjectOfferingId: offeringId,
        termId,
        termTitle: typeof item.termTitle === "string" ? item.termTitle : "",
        termShortTitle:
          typeof item.termShortTitle === "string" ? item.termShortTitle : "",
        title: item.title,
        description: item.description,
        dueAt: item.dueAt,
        status: "DRAFT",
        publishMode: "DRAFT_ONLY",
        gradingMode: "MIXED",
        questions: questionSnapshots,
        maxScore: calculateHomeworkMaxScore(questionSnapshots),
        targetStudentIds: [],
        targetCount: 0,
        submittedCount: 0,
        gradedCount: 0,
        missingCount: 0,
        createdByPersonId: personId,
        createdAt: now,
        updatedAt: now,
      });
      if (!parsed.success)
        throw new HttpsError("invalid-argument", "Invalid homework.");
      await db.runTransaction(async (tx) => {
        await checkProofs(tx, context.proofs);
        await checkProofs(tx, snapshots);
        tx.create(ref, JSON.parse(JSON.stringify(parsed.data)));
      });
      return { id: ref.id };
    }
    case "details":
    case "listSubmissions": {
      const snapshot = await assignments
        .doc(identifier(input.homeworkId))
        .get();
      const assignment = snapshot.data();
      if (!assignment || !matchesOffering(assignment, context))
        throw new HttpsError("not-found", "Homework not found.");
      if (input.action === "details")
        return { item: { ...assignment, id: snapshot.id } };
      const rows = await page(
        submissions.where("homeworkId", "==", snapshot.id),
        input.cursor,
      );
      return {
        nextCursor: rows.nextCursor,
        items: rows.docs.flatMap((doc) =>
          matchesOffering(doc.data(), context) &&
          doc.data().termId === assignment.termId &&
          Array.isArray(assignment.targetStudentIds) &&
          assignment.targetStudentIds.includes(doc.data().studentId)
            ? [{ ...doc.data(), id: doc.id }]
            : [],
        ),
      };
    }
    case "publish": {
      const ref = assignments.doc(identifier(input.homeworkId));
      return db.runTransaction(async (tx) => {
        await checkProofs(tx, context.proofs);
        const snapshot = await tx.get(ref);
        const row = snapshot.data();
        if (!row || !matchesOffering(row, context))
          throw new HttpsError("not-found", "Homework not found.");
        if (row.status === "PUBLISHED") return { ok: true };
        if (row.status !== "DRAFT")
          throw new HttpsError(
            "failed-precondition",
            "Homework cannot be published.",
          );
        const parsed = StudentHomeworkAssignmentSchema.safeParse({
          ...row,
          id: snapshot.id,
        });
        if (
          !parsed.success ||
          !validateHomeworkQuestions(parsed.data.questions).ok
        )
          throw new HttpsError("failed-precondition", "Invalid homework.");
        const enrolled = await tx.get(
          db
            .collection(`orgs/${orgId}/studentEnrollments`)
            .where("classId", "==", offering.classId)
            .limit(cap + 1),
        );
        bounded(enrolled.size);
        const targets = new Map<string, string>();
        for (const doc of enrolled.docs) {
          const item = doc.data();
          if (
            (!item.orgId || item.orgId === orgId) &&
            item.schoolId === offering.schoolId &&
            item.academicYearId === offering.academicYearId &&
            item.classId === offering.classId &&
            item.status === "ACTIVE" &&
            typeof item.studentId === "string" &&
            item.studentId &&
            !targets.has(item.studentId)
          )
            targets.set(item.studentId, doc.id);
        }
        if (!targets.size)
          throw new HttpsError(
            "failed-precondition",
            "No active students in this class.",
          );
        const now = Date.now();
        const refs = [...targets.keys()].map((studentId) =>
          submissions.doc(`${snapshot.id}_${encodeURIComponent(studentId)}`),
        );
        const existing = await Promise.all(
          refs.map((submissionRef) => tx.get(submissionRef)),
        );
        if (existing.some((doc) => doc.exists))
          throw new HttpsError(
            "failed-precondition",
            "An existing submission prevents publication.",
          );
        let index = 0;
        for (const [studentId, enrollmentId] of targets) {
          const assignment = parsed.data;
          const submissionId = refs[index].id;
          const submission = StudentHomeworkSubmissionSchema.parse({
            id: submissionId,
            orgId,
            schoolId: assignment.schoolId,
            academicYearId: assignment.academicYearId,
            termId: assignment.termId,
            termTitle: assignment.termTitle,
            termShortTitle: assignment.termShortTitle,
            homeworkId: assignment.id,
            homeworkTitle: assignment.title,
            homeworkDescription: assignment.description,
            homeworkDueAt: assignment.dueAt,
            homeworkPublishedAt: now,
            homeworkQuestions: assignment.questions,
            studentId,
            enrollmentId,
            gradeId: assignment.gradeId,
            classId: assignment.classId,
            subjectKey: assignment.subjectKey,
            classSubjectOfferingId: assignment.classSubjectOfferingId,
            answers: [],
            score: 0,
            maxScore: assignment.maxScore,
            status: "NOT_STARTED",
            createdAt: now,
            updatedAt: now,
          });
          tx.create(refs[index++], JSON.parse(JSON.stringify(submission)));
        }
        tx.update(ref, {
          status: "PUBLISHED",
          publishMode: "PUBLISH_NOW",
          targetStudentIds: [...targets.keys()],
          targetCount: targets.size,
          missingCount: targets.size,
          submittedCount: 0,
          gradedCount: 0,
          publishedAt: now,
          updatedAt: now,
        });
        return { ok: true };
      });
    }
    default:
      throw new HttpsError("invalid-argument", "Unknown action.");
  }
});
