import { getFirestore } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import {
  EvaluationCycleTargetSummarySchema,
  EvaluationStaffSummarySchema,
  PerformanceImprovementSettingsSchema,
  PerformanceImprovementSignalSchema,
} from "@takween/contracts";
import {
  buildPerformanceImprovementDetection,
  DEFAULT_PERFORMANCE_IMPROVEMENT_THRESHOLDS,
} from "./build-performance-improvement-signal";

const REGION = "me-central2";

const FULL_EVALUATION_ROLES = new Set([
  "platform_owner",
  "platform_admin",
  "org_owner",
  "org_admin",
]);

type ApproveEvaluationSubmissionInput = {
  orgId?: unknown;
  submissionId?: unknown;
};

type EvaluationRow = Record<string, unknown>;

type ApproveEvaluationSubmissionResult = {
  ok: true;
  submissionId: string;
  cycleSummaryId: string;
  staffSummaryId: string;
  normalizedScore: number;
  weightedScore: number;
  completedSubmissionsCount: number;
  missingSubmissionsCount: number;
  cycleCompleted: boolean;
  approvedAt: number;
  performanceImprovementSignalId?: string;
};

function requireNonEmptyString(
  value: unknown,
  fieldName: string,
): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new HttpsError(
      "invalid-argument",
      `${fieldName} is required.`,
    );
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

  if (startAt !== undefined && startAt > now) return false;
  if (endAt !== undefined && endAt < now) return false;

  return true;
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

  if (scopeType === "ORG" || scopes.canAccessAllSchools === true) {
    return true;
  }

  if (scopeType === "SCHOOL" && scopeId === params.schoolId) {
    return true;
  }

  return readStringArray(scopes.schoolIds).includes(params.schoolId);
}

function hasEvaluationPermission(
  membership: EvaluationRow,
  roleKey: string,
): boolean {
  if (FULL_EVALUATION_ROLES.has(roleKey)) return true;

  const permissions = readRecord(membership.permissions);

  return permissions.manageEvaluations === true;
}

function submissionMatchesAssignment(params: {
  submission: EvaluationRow;
  assignment: EvaluationRow;
  evaluatorPersonId: string;
}): boolean {
  return (
    params.assignment.status === "ACTIVE" &&
    readString(params.assignment.planId) ===
      readString(params.submission.planId) &&
    readString(params.assignment.cycleId) ===
      readString(params.submission.cycleId) &&
    readString(params.assignment.targetPersonId) ===
      readString(params.submission.targetPersonId) &&
    readString(params.assignment.evaluatorPersonId) ===
      params.evaluatorPersonId &&
    readString(params.assignment.schoolId) ===
      readString(params.submission.schoolId)
  );
}

export const approveEvaluationSubmission = onCall(
  {
    region: REGION,
    cors: true,
    invoker: "public",
  },
  async (
    request,
  ): Promise<ApproveEvaluationSubmissionResult> => {
    const uid = request.auth?.uid;

    if (!uid) {
      throw new HttpsError(
        "unauthenticated",
        "Authentication is required.",
      );
    }

    const input = request.data as ApproveEvaluationSubmissionInput;
    const orgId = requireNonEmptyString(input.orgId, "orgId");
    const submissionId = requireNonEmptyString(
      input.submissionId,
      "submissionId",
    );

    if (orgId.includes("/") || submissionId.includes("/")) {
      throw new HttpsError(
        "invalid-argument",
        "Document identifiers cannot contain '/'.",
      );
    }

    const db = getFirestore();
    const now = Date.now();

    const userRef = db.doc(`users/${uid}`);
    const membershipRef = db.doc(
      `users/${uid}/orgMemberships/${orgId}`,
    );
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
        const termId = requireNonEmptyString(
          submission.termId,
          "submission.termId",
        );
        const planId = requireNonEmptyString(
          submission.planId,
          "submission.planId",
        );
        const cycleId = requireNonEmptyString(
          submission.cycleId,
          "submission.cycleId",
        );
        const targetPersonId = requireNonEmptyString(
          submission.targetPersonId,
          "submission.targetPersonId",
        );
        const frameworkId = requireNonEmptyString(
          submission.frameworkId,
          "submission.frameworkId",
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

        if (readString(submission.evaluatorPersonId) !== evaluatorPersonId) {
          throw new HttpsError(
            "permission-denied",
            "Only the assigned evaluator can approve this submission.",
          );
        }

        const currentStatus = readString(submission.status);

        if (currentStatus !== "SUBMITTED" && currentStatus !== "APPROVED") {
          throw new HttpsError(
            "failed-precondition",
            "Only a submitted evaluation can be approved.",
          );
        }

        if (
          !hasEvaluationPermission(membership, roleKey) ||
          !membershipCanAccessSchool({ membership, roleKey, schoolId })
        ) {
          throw new HttpsError(
            "permission-denied",
            "You do not have evaluation access for this school.",
          );
        }

        const assignmentQuery = db
          .collection(`orgs/${orgId}/evaluationEvaluatorAssignments`)
          .where("cycleId", "==", cycleId);
        const policyQuery = db
          .collection(`orgs/${orgId}/evaluatorPolicies`)
          .where("planId", "==", planId);
        const submissionsQuery = db
          .collection(`orgs/${orgId}/evaluationSubmissions`)
          .where("cycleId", "==", cycleId);
        const planCyclesQuery = db
          .collection(`orgs/${orgId}/evaluationCycles`)
          .where("planId", "==", planId);
        const planSummariesQuery = db
          .collection(`orgs/${orgId}/evaluationCycleTargetSummaries`)
          .where("planId", "==", planId);
        const targetSummariesQuery = db
          .collection(`orgs/${orgId}/evaluationCycleTargetSummaries`)
          .where("targetPersonId", "==", targetPersonId);
        const targetSubmissionsQuery = db
          .collection(`orgs/${orgId}/evaluationSubmissions`)
          .where("targetPersonId", "==", targetPersonId);
        const cycleRef = db.doc(
          `orgs/${orgId}/evaluationCycles/${cycleId}`,
        );
        const targetAssignmentRef = db.doc(
          `orgs/${orgId}/evaluationTargetAssignments/${planId}-target-${targetPersonId}`,
        );
        const performanceImprovementSettingsRef = db.doc(
          `orgs/${orgId}/performanceImprovementSettings/${schoolId}`,
        );

        const [
          assignmentSnapshot,
          policySnapshot,
          submissionsSnapshot,
          planCyclesSnapshot,
          planSummariesSnapshot,
          targetSummariesSnapshot,
          targetSubmissionsSnapshot,
          cycleSnapshot,
          targetAssignmentSnapshot,
          performanceImprovementSettingsSnapshot,
        ] = await Promise.all([
          transaction.get(assignmentQuery),
          transaction.get(policyQuery),
          transaction.get(submissionsQuery),
          transaction.get(planCyclesQuery),
          transaction.get(planSummariesQuery),
          transaction.get(targetSummariesQuery),
          transaction.get(targetSubmissionsQuery),
          transaction.get(cycleRef),
          transaction.get(targetAssignmentRef),
          transaction.get(performanceImprovementSettingsRef),
        ]);

        if (!cycleSnapshot.exists) {
          throw new HttpsError(
            "failed-precondition",
            "Evaluation cycle was not found.",
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

        const evaluatorRoleKey =
          readString(actorAssignment.evaluatorRoleKey) ||
          readString(submission.evaluatorRoleKey) ||
          roleKey;

        const canApprove =
          FULL_EVALUATION_ROLES.has(roleKey) ||
          policySnapshot.docs.some((document) => {
            const policy = document.data();

            return (
              readString(policy.planId) === planId &&
              readString(policy.evaluatorRoleKey) === evaluatorRoleKey &&
              policy.canApprove === true
            );
          });

        if (!canApprove) {
          throw new HttpsError(
            "permission-denied",
            "The evaluator policy does not allow approval.",
          );
        }

        const matchingAssignments = assignments.filter((assignment) => {
          return (
            assignment.status === "ACTIVE" &&
            readString(assignment.planId) === planId &&
            readString(assignment.cycleId) === cycleId &&
            readString(assignment.schoolId) === schoolId &&
            readString(assignment.targetPersonId) === targetPersonId
          );
        });

        if (matchingAssignments.length === 0) {
          throw new HttpsError(
            "failed-precondition",
            "No active evaluator assignments exist for this target.",
          );
        }

        const expectedAssignmentsByEvaluator = new Map<
          string,
          (typeof matchingAssignments)[number]
        >();

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

        const approvedSubmissionsByEvaluator = new Map<
          string,
          EvaluationRow
        >();

        for (const document of submissionsSnapshot.docs) {
          const row = document.data();
          const isCurrentSubmission = document.id === submissionId;

          if (
            readString(row.planId) !== planId ||
            readString(row.cycleId) !== cycleId ||
            readString(row.schoolId) !== schoolId ||
            readString(row.targetPersonId) !== targetPersonId ||
            (!isCurrentSubmission && row.status !== "APPROVED")
          ) {
            continue;
          }

          const rowEvaluatorPersonId = readString(row.evaluatorPersonId);

          if (rowEvaluatorPersonId) {
            approvedSubmissionsByEvaluator.set(
              rowEvaluatorPersonId,
              row,
            );
          }
        }

        approvedSubmissionsByEvaluator.set(evaluatorPersonId, submission);

        let completedSubmissionsCount = 0;
        let finalScore = 0;

        for (const assignment of expectedAssignments) {
          const assignmentEvaluatorPersonId = readString(
            assignment.evaluatorPersonId,
          );
          const approvedSubmission = approvedSubmissionsByEvaluator.get(
            assignmentEvaluatorPersonId,
          );

          if (!approvedSubmission) continue;

          completedSubmissionsCount += 1;

          const normalizedScore = clampPercentage(
            readNumber(approvedSubmission.normalizedScore),
          );
          const weight = clampPercentage(readNumber(assignment.weight, 100));

          finalScore += normalizedScore * (weight / 100);
        }

        finalScore = clampPercentage(finalScore);

        const missingSubmissionsCount = Math.max(
          expectedAssignments.length - completedSubmissionsCount,
          0,
        );
        const cycleCompleted = missingSubmissionsCount === 0;
        const approvedAt =
          readOptionalTimestamp(submission.approvedAt) ?? now;
        const normalizedScore = clampPercentage(
          readNumber(submission.normalizedScore),
        );
        const actorWeight = clampPercentage(
          readNumber(actorAssignment.weight, 100),
        );
        const weightedScore = normalizedScore * (actorWeight / 100);
        const cycle = cycleSnapshot.data() ?? {};

        const cycleSummaryId = `${planId}-${cycleId}-${targetPersonId}`;
        const cycleSummaryRef = db.doc(
          `orgs/${orgId}/evaluationCycleTargetSummaries/${cycleSummaryId}`,
        );
        const targetEmail = readString(submission.targetEmail);
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
          finalScore,
          maxScore: 100,
          status: cycleCompleted ? "APPROVED" : "SUBMITTED",
          includedInAverage:
            cycleCompleted && cycle.isIncludedInAverage !== false,
          completedSubmissionsCount,
          missingSubmissionsCount,
          submittedAt: readOptionalTimestamp(submission.submittedAt) ?? now,
          ...(cycleCompleted ? { approvedAt } : {}),
          updatedAt: now,
        });

        const cycleSummaries = new Map<string, EvaluationRow>();

        for (const document of planSummariesSnapshot.docs) {
          const row = document.data();

          if (
            readString(row.targetPersonId) !== targetPersonId ||
            readString(row.schoolId) !== schoolId
          ) {
            continue;
          }

          cycleSummaries.set(readString(row.cycleId) || document.id, row);
        }

        cycleSummaries.set(cycleId, cycleSummary);

        const approvedCycleSummaries = Array.from(
          cycleSummaries.values(),
        ).filter(
          (row) =>
            row.status === "APPROVED" &&
            row.includedInAverage === true,
        );
        const submittedCycleSummaries = Array.from(
          cycleSummaries.values(),
        ).filter(
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
          (document) => {
            const row = document.data();

            return (
              readString(row.schoolId) === schoolId &&
              row.status !== "CANCELLED"
            );
          },
        ).length;
        const submittedCyclesCount = submittedCycleSummaries.length;
        const approvedCyclesCount = approvedCycleSummaries.length;
        const missingCyclesCount = Math.max(
          relevantCyclesCount - submittedCyclesCount,
          0,
        );

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
          approvedCyclesCount,
          submittedCyclesCount,
          missingCyclesCount,
          lastApprovedScore: latestApprovedSummary
            ? clampPercentage(readNumber(latestApprovedSummary.finalScore))
            : 0,
          lastSubmittedScore: latestSubmittedSummary
            ? clampPercentage(readNumber(latestSubmittedSummary.finalScore))
            : 0,
          status:
            approvedCyclesCount > 0
              ? "HAS_APPROVED_RESULTS"
              : submittedCyclesCount > 0
                ? "HAS_SUBMITTED_RESULTS"
                : relevantCyclesCount > 0
                  ? "IN_PROGRESS"
                  : "PENDING",
          updatedAt: now,
        });

        const targetCycleSummaries = new Map<string, EvaluationRow>();

        for (const document of targetSummariesSnapshot.docs) {
          const row = document.data();

          if (
            readString(row.schoolId) !== schoolId ||
            readString(row.academicYearId) !== academicYearId ||
            readString(row.termId) !== termId
          ) {
            continue;
          }

          targetCycleSummaries.set(document.id, row);
        }

        targetCycleSummaries.set(cycleSummaryId, cycleSummary);

        const approvedTargetSubmissions = new Map<string, EvaluationRow>();

        for (const document of targetSubmissionsSnapshot.docs) {
          const row = document.data();

          if (
            readString(row.schoolId) !== schoolId ||
            readString(row.academicYearId) !== academicYearId ||
            readString(row.termId) !== termId ||
            row.status !== "APPROVED"
          ) {
            continue;
          }

          approvedTargetSubmissions.set(document.id, row);
        }

        approvedTargetSubmissions.set(submissionId, {
          ...submission,
          status: "APPROVED",
          approvedAt,
          updatedAt: now,
        });

        const performanceImprovementSettingsResult =
          PerformanceImprovementSettingsSchema.safeParse({
            id: schoolId,
            orgId,
            schoolId,
            ...performanceImprovementSettingsSnapshot.data(),
            updatedAt: readNumber(
              performanceImprovementSettingsSnapshot.data()?.updatedAt,
            ),
          });
        const performanceImprovementThresholds =
          performanceImprovementSettingsResult.success
            ? performanceImprovementSettingsResult.data
            : DEFAULT_PERFORMANCE_IMPROVEMENT_THRESHOLDS;

        const detection = buildPerformanceImprovementDetection({
          cycleSummaries: Array.from(targetCycleSummaries.values()),
          submissions: Array.from(approvedTargetSubmissions.values()),
          lowScoreThreshold:
            performanceImprovementThresholds.lowScoreThreshold,
          lowCycleCountThreshold:
            performanceImprovementThresholds.lowCycleCountThreshold,
          weakItemPercentageThreshold:
            performanceImprovementThresholds.weakItemPercentageThreshold,
          weakItemOccurrenceThreshold:
            performanceImprovementThresholds.weakItemOccurrenceThreshold,
        });

        let performanceImprovementSignalId: string | undefined;
        let performanceImprovementSignalRef:
          | ReturnType<typeof db.doc>
          | undefined;
        let performanceImprovementSignal:
          | ReturnType<typeof PerformanceImprovementSignalSchema.parse>
          | undefined;

        if (detection.shouldCreateSignal) {
          performanceImprovementSignalId = [
            academicYearId,
            termId,
            schoolId,
            targetPersonId,
          ].join("--");
          performanceImprovementSignalRef = db.doc(
            `orgs/${orgId}/performanceImprovementSignals/${performanceImprovementSignalId}`,
          );

          const existingSignalSnapshot = await transaction.get(
            performanceImprovementSignalRef,
          );
          const existingSignal = existingSignalSnapshot.data() ?? {};
          const targetAssignment = targetAssignmentSnapshot.data() ?? {};
          const targetDisplayName = readString(
            targetAssignment.targetDisplayName,
          );
          const signalTargetEmail =
            readString(targetAssignment.targetEmail) || targetEmail;
          const existingStatus = readString(existingSignal.status);
          const signalStatus =
            existingStatus === "PLAN_OPEN" || existingStatus === "DISMISSED"
              ? existingStatus
              : "NEEDS_REVIEW";
          const linkedImprovementPlanId = readString(
            existingSignal.linkedImprovementPlanId,
          );
          const dismissedByPersonId = readString(
            existingSignal.dismissedByPersonId,
          );
          const dismissalNote = readString(existingSignal.dismissalNote);
          const evaluationPlanIds = Array.from(
            new Set(
              [
                planId,
                ...Array.from(targetCycleSummaries.values()).map((row) =>
                  readString(row.planId),
                ),
              ].filter(Boolean),
            ),
          );
          const frameworkIds = Array.from(
            new Set(
              [
                frameworkId,
                ...Array.from(approvedTargetSubmissions.values()).map((row) =>
                  readString(row.frameworkId),
                ),
              ].filter(Boolean),
            ),
          );

          performanceImprovementSignal =
            PerformanceImprovementSignalSchema.parse({
              id: performanceImprovementSignalId,
              orgId,
              schoolId,
              academicYearId,
              termId,
              evaluationPlanIds,
              frameworkIds,
              targetPersonId,
              ...(targetDisplayName ? { targetDisplayName } : {}),
              ...(signalTargetEmail ? { targetEmail: signalTargetEmail } : {}),
              status: signalStatus,
              triggerReasons: detection.triggerReasons,
              lowScoreThreshold:
                performanceImprovementThresholds.lowScoreThreshold,
              lowCycleCountThreshold:
                performanceImprovementThresholds.lowCycleCountThreshold,
              weakItemPercentageThreshold:
                performanceImprovementThresholds.weakItemPercentageThreshold,
              weakItemOccurrenceThreshold:
                performanceImprovementThresholds.weakItemOccurrenceThreshold,
              approvedCyclesCount: detection.approvedCyclesCount,
              lowCyclesCount: detection.lowCyclesCount,
              approvedAverageScore: detection.approvedAverageScore,
              lastApprovedScore: detection.lastApprovedScore,
              lowCycleIds: detection.lowCycleIds,
              weakItems: detection.weakItems,
              ...(linkedImprovementPlanId
                ? { linkedImprovementPlanId }
                : {}),
              ...(readOptionalTimestamp(existingSignal.dismissedAt) !==
              undefined
                ? {
                    dismissedAt: readOptionalTimestamp(
                      existingSignal.dismissedAt,
                    ),
                  }
                : {}),
              ...(dismissedByPersonId ? { dismissedByPersonId } : {}),
              ...(dismissalNote ? { dismissalNote } : {}),
              createdAt:
                readOptionalTimestamp(existingSignal.createdAt) ?? now,
              updatedAt: now,
            });
        }

        transaction.set(
          submissionRef,
          {
            status: "APPROVED",
            weightedScore,
            approvedAt,
            approvedByPersonId: evaluatorPersonId,
            updatedAt: now,
          },
          { merge: true },
        );
        transaction.set(cycleSummaryRef, cycleSummary);
        transaction.set(staffSummaryRef, staffSummary);
        if (
          performanceImprovementSignalRef &&
          performanceImprovementSignal
        ) {
          transaction.set(
            performanceImprovementSignalRef,
            performanceImprovementSignal,
          );
        }

        return {
          ok: true,
          submissionId,
          cycleSummaryId,
          staffSummaryId,
          normalizedScore,
          weightedScore,
          completedSubmissionsCount,
          missingSubmissionsCount,
          cycleCompleted,
          approvedAt,
          ...(performanceImprovementSignalId
            ? { performanceImprovementSignalId }
            : {}),
        };
      });
    } catch (error) {
      if (error instanceof HttpsError) throw error;

      const message =
        error instanceof Error
          ? error.message
          : "Failed to approve evaluation submission.";

      throw new HttpsError("failed-precondition", message);
    }
  },
);
