import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import {
  EvaluationCycleTargetSummarySchema,
  EvaluationStaffSummarySchema,
} from "@takween/contracts";

const REGION = "me-central2";

const CORS_ORIGINS = [
  "http://localhost:3001",
  "https://edu-affairs-v2-web-staff.vercel.app",
];

const FULL_EVALUATION_ROLES = new Set([
  "platform_owner",
  "platform_admin",
  "org_owner",
  "org_admin",
]);

type ReopenEvaluationSubmissionInput = {
  orgId?: unknown;
  submissionId?: unknown;
};

type EvaluationRow = Record<string, unknown>;

type ReopenEvaluationSubmissionResult = {
  ok: true;
  submissionId: string;
  cycleSummaryId: string;
  staffSummaryId: string;
};

function requireNonEmptyString(value: unknown, fieldName: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new HttpsError("invalid-argument", `${fieldName} is required.`);
  }

  return value.trim();
}

function readString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function readNumber(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : fallback;
}

function readOptionalTimestamp(value: unknown): number | undefined {
  return typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 0
    ? value
    : undefined;
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  return Array.from(
    new Set(
      value
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  );
}

function readRecord(value: unknown): EvaluationRow {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as EvaluationRow)
    : {};
}

function clampPercentage(value: number): number {
  return Math.min(Math.max(value, 0), 100);
}

function average(values: number[]): number {
  if (values.length === 0) return 0;

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function isMembershipActive(data: EvaluationRow, now: number): boolean {
  if (data.isActive === false || data.active === false) return false;

  const startAt = readOptionalTimestamp(data.startAt);
  const endAt = readOptionalTimestamp(data.endAt);

  return !(
    (startAt !== undefined && startAt > now) ||
    (endAt !== undefined && endAt < now)
  );
}

function membershipCanAccessSchool(params: {
  membership: EvaluationRow;
  roleKey: string;
  schoolId: string;
}): boolean {
  if (FULL_EVALUATION_ROLES.has(params.roleKey)) return true;

  const scopes = readRecord(params.membership.scopes);
  const scopeType = readString(params.membership.scopeType);
  const scopeId = readString(params.membership.scopeId);

  return (
    scopeType === "ORG" ||
    scopes.canAccessAllSchools === true ||
    (scopeType === "SCHOOL" && scopeId === params.schoolId) ||
    readStringArray(scopes.schoolIds).includes(params.schoolId)
  );
}

function submissionMatchesAssignment(params: {
  submission: EvaluationRow;
  assignment: EvaluationRow;
  evaluatorPersonId: string;
}): boolean {
  return (
    params.assignment.status === "ACTIVE" &&
    readString(params.assignment.planId) === readString(params.submission.planId) &&
    readString(params.assignment.cycleId) === readString(params.submission.cycleId) &&
    readString(params.assignment.targetPersonId) ===
      readString(params.submission.targetPersonId) &&
    readString(params.assignment.evaluatorPersonId) === params.evaluatorPersonId &&
    readString(params.assignment.schoolId) === readString(params.submission.schoolId)
  );
}

export const reopenEvaluationSubmission = onCall(
  {
    region: REGION,
    cors: CORS_ORIGINS,
    invoker: "public",
  },
  async (request): Promise<ReopenEvaluationSubmissionResult> => {
    const uid = request.auth?.uid;

    if (!uid) {
      throw new HttpsError("unauthenticated", "Authentication is required.");
    }

    const input = request.data as ReopenEvaluationSubmissionInput;
    const orgId = requireNonEmptyString(input.orgId, "orgId");
    const submissionId = requireNonEmptyString(input.submissionId, "submissionId");

    if (orgId.includes("/") || submissionId.includes("/")) {
      throw new HttpsError(
        "invalid-argument",
        "Document identifiers cannot contain '/'.",
      );
    }

    const db = getFirestore();
    const now = Date.now();
    const userRef = db.doc(`users/${uid}`);
    const membershipRef = db.doc(`users/${uid}/orgMemberships/${orgId}`);
    const submissionRef = db.doc(
      `orgs/${orgId}/evaluationSubmissions/${submissionId}`,
    );

    try {
      return await db.runTransaction(async (transaction) => {
        const [userSnapshot, membershipSnapshot, submissionSnapshot] =
          await Promise.all([
            transaction.get(userRef),
            transaction.get(membershipRef),
            transaction.get(submissionRef),
          ]);

        if (!membershipSnapshot.exists) {
          throw new HttpsError(
            "permission-denied",
            "Active organization membership is required.",
          );
        }

        if (!submissionSnapshot.exists) {
          throw new HttpsError(
            "not-found",
            "Evaluation submission was not found.",
          );
        }

        const membership = membershipSnapshot.data() ?? {};
        const user = userSnapshot.data() ?? {};
        const submission = submissionSnapshot.data() ?? {};

        if (!isMembershipActive(membership, now)) {
          throw new HttpsError(
            "permission-denied",
            "Organization membership is inactive.",
          );
        }

        const evaluatorPersonId =
          readString(membership.personId) || readString(user.personId);
        const roleKey =
          readString(membership.roleKey) || readString(membership.role);

        if (!evaluatorPersonId || !roleKey) {
          throw new HttpsError(
            "permission-denied",
            "The user is not linked to an evaluation actor.",
          );
        }

        const schoolId = requireNonEmptyString(
          submission.schoolId,
          "submission.schoolId",
        );
        const academicYearId = requireNonEmptyString(
          submission.academicYearId,
          "submission.academicYearId",
        );
        const termId = requireNonEmptyString(submission.termId, "submission.termId");
        const planId = requireNonEmptyString(submission.planId, "submission.planId");
        const cycleId = requireNonEmptyString(submission.cycleId, "submission.cycleId");
        const targetPersonId = requireNonEmptyString(
          submission.targetPersonId,
          "submission.targetPersonId",
        );

        if (
          readString(submission.orgId) &&
          readString(submission.orgId) !== orgId
        ) {
          throw new HttpsError(
            "permission-denied",
            "Evaluation submission organization mismatch.",
          );
        }

        if (readString(submission.status) !== "APPROVED") {
          throw new HttpsError(
            "failed-precondition",
            "Only an approved evaluation can be reopened.",
          );
        }

        if (
          !membershipCanAccessSchool({ membership, roleKey, schoolId }) ||
          readString(submission.evaluatorPersonId) !== evaluatorPersonId
        ) {
          throw new HttpsError(
            "permission-denied",
            "You do not have permission to reopen this evaluation.",
          );
        }

        const assignmentQuery = db
          .collection(`orgs/${orgId}/evaluationEvaluatorAssignments`)
          .where("cycleId", "==", cycleId);
        const submissionsQuery = db
          .collection(`orgs/${orgId}/evaluationSubmissions`)
          .where("cycleId", "==", cycleId);
        const planCyclesQuery = db
          .collection(`orgs/${orgId}/evaluationCycles`)
          .where("planId", "==", planId);
        const planSummariesQuery = db
          .collection(`orgs/${orgId}/evaluationCycleTargetSummaries`)
          .where("planId", "==", planId);
        const cycleRef = db.doc(`orgs/${orgId}/evaluationCycles/${cycleId}`);

        const [
          assignmentSnapshot,
          submissionsSnapshot,
          planCyclesSnapshot,
          planSummariesSnapshot,
          cycleSnapshot,
        ] = await Promise.all([
          transaction.get(assignmentQuery),
          transaction.get(submissionsQuery),
          transaction.get(planCyclesQuery),
          transaction.get(planSummariesQuery),
          transaction.get(cycleRef),
        ]);

        if (!cycleSnapshot.exists || cycleSnapshot.data()?.status !== "OPEN") {
          throw new HttpsError(
            "failed-precondition",
            "Only evaluations in an open cycle can be reopened.",
          );
        }

        const assignments: Array<EvaluationRow & { id: string }> =
          assignmentSnapshot.docs.map((document) => ({
            id: document.id,
            ...(document.data() as EvaluationRow),
          }));
        const actorAssignment = assignments.find((assignment) =>
          submissionMatchesAssignment({
            submission,
            assignment,
            evaluatorPersonId,
          }),
        );

        if (!actorAssignment) {
          throw new HttpsError(
            "permission-denied",
            "Active evaluator assignment was not found.",
          );
        }

        const matchingAssignments = assignments.filter(
          (assignment) =>
            assignment.status === "ACTIVE" &&
            readString(assignment.planId) === planId &&
            readString(assignment.cycleId) === cycleId &&
            readString(assignment.schoolId) === schoolId &&
            readString(assignment.targetPersonId) === targetPersonId,
        );

        const expectedAssignmentsByEvaluator = new Map<string, EvaluationRow>();
        for (const assignment of matchingAssignments) {
          const assignmentEvaluatorPersonId = readString(
            assignment.evaluatorPersonId,
          );

          if (!assignmentEvaluatorPersonId) {
            throw new HttpsError(
              "failed-precondition",
              "An active evaluator assignment is missing its evaluator.",
            );
          }

          if (expectedAssignmentsByEvaluator.has(assignmentEvaluatorPersonId)) {
            throw new HttpsError(
              "failed-precondition",
              "Duplicate active evaluator assignments exist for this target.",
            );
          }

          expectedAssignmentsByEvaluator.set(
            assignmentEvaluatorPersonId,
            assignment,
          );
        }

        const expectedAssignments = Array.from(
          expectedAssignmentsByEvaluator.values(),
        );
        const totalAssignmentWeight = expectedAssignments.reduce(
          (total, assignment) =>
            total + clampPercentage(readNumber(assignment.weight, 100)),
          0,
        );

        if (Math.abs(totalAssignmentWeight - 100) > 0.001) {
          throw new HttpsError(
            "failed-precondition",
            "Active evaluator assignment weights must total 100.",
          );
        }

        const approvedSubmissionsByEvaluator = new Map<string, EvaluationRow>();

        for (const document of submissionsSnapshot.docs) {
          const row = document.data();

          if (
            document.id === submissionId ||
            readString(row.status) !== "APPROVED" ||
            readString(row.planId) !== planId ||
            readString(row.schoolId) !== schoolId ||
            readString(row.targetPersonId) !== targetPersonId
          ) {
            continue;
          }

          const submissionEvaluatorPersonId = readString(row.evaluatorPersonId);
          if (submissionEvaluatorPersonId) {
            approvedSubmissionsByEvaluator.set(submissionEvaluatorPersonId, row);
          }
        }

        let completedSubmissionsCount = 0;
        let finalScore = 0;
        let latestSubmittedAt: number | undefined;

        for (const assignment of expectedAssignments) {
          const approvedSubmission = approvedSubmissionsByEvaluator.get(
            readString(assignment.evaluatorPersonId),
          );
          if (!approvedSubmission) continue;

          completedSubmissionsCount += 1;
          finalScore +=
            clampPercentage(readNumber(approvedSubmission.normalizedScore)) *
            (clampPercentage(readNumber(assignment.weight, 100)) / 100);

          const submittedAt = readOptionalTimestamp(approvedSubmission.submittedAt);
          if (submittedAt !== undefined) {
            latestSubmittedAt = Math.max(latestSubmittedAt ?? 0, submittedAt);
          }
        }

        const missingSubmissionsCount = Math.max(
          expectedAssignments.length - completedSubmissionsCount,
          0,
        );
        const cycleSummaryId = `${planId}-${cycleId}-${targetPersonId}`;
        const cycleSummaryRef = db.doc(
          `orgs/${orgId}/evaluationCycleTargetSummaries/${cycleSummaryId}`,
        );
        const targetEmail = readString(submission.targetEmail);
        const hasSubmittedResults = completedSubmissionsCount > 0;
        const cycleSummary = EvaluationCycleTargetSummarySchema.parse({
          id: cycleSummaryId,
          orgId,
          schoolId,
          academicYearId,
          termId,
          planId,
          cycleId,
          targetPersonId,
          ...(targetEmail ? { targetEmail } : {}),
          ...(hasSubmittedResults
            ? { finalScore: clampPercentage(finalScore), maxScore: 100 }
            : {}),
          status: hasSubmittedResults ? "SUBMITTED" : "DRAFT",
          includedInAverage: false,
          completedSubmissionsCount,
          missingSubmissionsCount,
          ...(latestSubmittedAt !== undefined
            ? { submittedAt: latestSubmittedAt }
            : {}),
          updatedAt: now,
        });

        const cycleSummaries = new Map<string, EvaluationRow>();
        for (const document of planSummariesSnapshot.docs) {
          const row = document.data();
          if (
            readString(row.targetPersonId) === targetPersonId &&
            readString(row.schoolId) === schoolId
          ) {
            cycleSummaries.set(readString(row.cycleId) || document.id, row);
          }
        }
        cycleSummaries.set(cycleId, cycleSummary);

        const approvedCycleSummaries = Array.from(cycleSummaries.values()).filter(
          (row) => row.status === "APPROVED" && row.includedInAverage === true,
        );
        const submittedCycleSummaries = Array.from(cycleSummaries.values()).filter(
          (row) =>
            (row.status === "SUBMITTED" || row.status === "APPROVED") &&
            typeof row.finalScore === "number",
        );
        const approvedScores = approvedCycleSummaries.map((row) =>
          clampPercentage(readNumber(row.finalScore)),
        );
        const submittedScores = submittedCycleSummaries.map((row) =>
          clampPercentage(readNumber(row.finalScore)),
        );
        const latestApprovedSummary = [...approvedCycleSummaries].sort(
          (left, right) =>
            readNumber(right.approvedAt, readNumber(right.updatedAt)) -
            readNumber(left.approvedAt, readNumber(left.updatedAt)),
        )[0];
        const latestSubmittedSummary = [...submittedCycleSummaries].sort(
          (left, right) =>
            readNumber(right.submittedAt, readNumber(right.updatedAt)) -
            readNumber(left.submittedAt, readNumber(left.updatedAt)),
        )[0];
        const relevantCyclesCount = planCyclesSnapshot.docs.filter(
          (document) =>
            readString(document.data().schoolId) === schoolId &&
            document.data().status !== "CANCELLED",
        ).length;
        const staffSummaryId = `${planId}-${targetPersonId}`;
        const staffSummaryRef = db.doc(
          `orgs/${orgId}/evaluationStaffSummaries/${staffSummaryId}`,
        );
        const staffSummary = EvaluationStaffSummarySchema.parse({
          id: staffSummaryId,
          orgId,
          schoolId,
          academicYearId,
          termId,
          planId,
          targetPersonId,
          ...(targetEmail ? { targetEmail } : {}),
          approvedAverageScore: average(approvedScores),
          submittedAverageScore: average(submittedScores),
          approvedCyclesCount: approvedCycleSummaries.length,
          submittedCyclesCount: submittedCycleSummaries.length,
          missingCyclesCount: Math.max(
            relevantCyclesCount - submittedCycleSummaries.length,
            0,
          ),
          lastApprovedScore: latestApprovedSummary
            ? clampPercentage(readNumber(latestApprovedSummary.finalScore))
            : 0,
          lastSubmittedScore: latestSubmittedSummary
            ? clampPercentage(readNumber(latestSubmittedSummary.finalScore))
            : 0,
          status:
            approvedCycleSummaries.length > 0
              ? "HAS_APPROVED_RESULTS"
              : submittedCycleSummaries.length > 0
                ? "HAS_SUBMITTED_RESULTS"
                : relevantCyclesCount > 0
                  ? "IN_PROGRESS"
                  : "PENDING",
          updatedAt: now,
        });

        transaction.update(submissionRef, {
          status: "DRAFT",
          approvedAt: FieldValue.delete(),
          approvedByUid: FieldValue.delete(),
          approvedByPersonId: FieldValue.delete(),
          approvedByDisplayName: FieldValue.delete(),
          updatedAt: now,
        });
        transaction.set(cycleSummaryRef, cycleSummary);
        transaction.set(staffSummaryRef, staffSummary);

        return {
          ok: true,
          submissionId,
          cycleSummaryId,
          staffSummaryId,
        };
      });
    } catch (error) {
      if (error instanceof HttpsError) throw error;

      throw new HttpsError(
        "failed-precondition",
        error instanceof Error
          ? error.message
          : "Failed to reopen evaluation submission.",
      );
    }
  },
);
