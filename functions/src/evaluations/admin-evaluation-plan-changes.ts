import { createHash } from "node:crypto";

import { getFirestore } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import {
  EvaluationAdminPlanChangeInputSchema,
  type EvaluationAdminPlanChangeAction,
  type EvaluationAdminPlanChangeApplyResult,
  type EvaluationAdminPlanChangeInput,
  type EvaluationAdminPlanChangeItem,
  type EvaluationAdminPlanChangePreview,
} from "@takween/contracts";
import {
  assertSafeDocumentId,
  readNumber,
  readString,
  resolvePerformanceImprovementActor,
} from "./performance-improvement-access";

const REGION = "me-central2";
const MAX_WRITES_PER_OPERATION = 450;

type EvaluationRow = Record<string, unknown>;
type Row = EvaluationRow & { id: string };
type CollectionName =
  | "evaluationPlans"
  | "evaluationCycles"
  | "evaluationTargetAssignments"
  | "evaluationEvaluatorAssignments";

type Person = {
  id: string;
  uid: string;
  displayName: string;
  email: string;
  roleKey: string;
};

type PlannedMutation = {
  collection: CollectionName;
  id: string;
  action: "CREATE" | "UPDATE" | "REMOVE" | "REACTIVATE";
  label: string;
  cycleId?: string;
  targetPersonId?: string;
  evaluatorPersonId?: string;
  data: EvaluationRow;
};

type PlanState = {
  plan: Row;
  framework: Row | null;
  school: Row | null;
  cycles: Row[];
  targetAssignments: Row[];
  evaluatorAssignments: Row[];
  submissions: Row[];
  people: Map<string, Person>;
};

type OperationPlan = {
  preview: EvaluationAdminPlanChangePreview;
  mutations: PlannedMutation[];
};

function asRow(id: string, data: EvaluationRow): Row {
  return { id, ...data };
}

function readStatus(row: EvaluationRow): string {
  return readString(row.status).toUpperCase();
}

function isActiveAssignment(row: EvaluationRow): boolean {
  const status = readStatus(row);
  return status === "ACTIVE" || (!status && row.isActive === true);
}

function isRemovedAssignment(row: EvaluationRow): boolean {
  return ["REMOVED", "INACTIVE"].includes(readStatus(row));
}

function isUsableCycle(row: EvaluationRow): boolean {
  const status = readStatus(row);
  return status === "OPEN" || status === "ACTIVE" || !status;
}

function isRemovedCycle(row: EvaluationRow): boolean {
  return ["REMOVED", "INACTIVE"].includes(readStatus(row));
}

function isPlanActive(plan: EvaluationRow): boolean {
  const status = readStatus(plan);
  return status ? status === "ACTIVE" : plan.isActive !== false;
}

function isFrameworkActive(framework: EvaluationRow | null): boolean {
  if (!framework || framework.isActive === false) return false;
  const status = readStatus(framework);
  return !status || status === "ACTIVE";
}

function cycleOrder(row: EvaluationRow): number {
  const value = readNumber(
    row.visitNumber,
    readNumber(
      row.cycleNumber,
      readNumber(row.sequence, readNumber(row.order, Number.MAX_SAFE_INTEGER)),
    ),
  );

  return Number.isInteger(value) && value > 0
    ? value
    : Number.MAX_SAFE_INTEGER;
}

function sortCycles(cycles: Row[]): Row[] {
  return [...cycles].sort((left, right) => {
    const difference = cycleOrder(left) - cycleOrder(right);
    return difference || left.id.localeCompare(right.id);
  });
}

function cycleTitle(cycle: EvaluationRow): string {
  return readString(cycle.title) || readString(cycle.shortTitle) || "دورة تقييم";
}

function schoolTitle(school: EvaluationRow | null, fallback: string): string {
  return (
    readString(school?.name) ||
    readString(school?.nameAr) ||
    readString(school?.title) ||
    fallback
  );
}

function displayName(row: EvaluationRow, fallback: string): string {
  return (
    readString(row.displayName) ||
    readString(row.fullName) ||
    readString(row.name) ||
    fallback
  );
}

function titleForPlan(plan: EvaluationRow): string {
  return readString(plan.title) || "خطة تقييم";
}

function targetAssignmentId(planId: string, targetPersonId: string): string {
  return `${planId}-target-${targetPersonId}`;
}

function evaluatorAssignmentId(params: {
  planId: string;
  cycleId: string;
  targetPersonId: string;
  evaluatorPersonId: string;
}): string {
  return [
    params.planId,
    params.cycleId,
    params.targetPersonId,
    params.evaluatorPersonId,
  ].join("-");
}

function replacementCycleId(
  patternCycleId: string,
  planId: string,
  cycleNumber: number,
): string {
  const padded = String(cycleNumber).padStart(2, "0");
  const patterns = [
    /(?:visit|evaluation|cycle|period|week)-\d+$/i,
    /-\d+$/,
  ];

  for (const pattern of patterns) {
    if (pattern.test(patternCycleId)) {
      return patternCycleId.replace(pattern, (match) => {
        const prefix = match.match(/(visit|evaluation|cycle|period|week)-/i);
        return prefix ? `${prefix[1]}-${padded}` : `-${padded}`;
      });
    }
  }

  return `${planId}-evaluation-${padded}`;
}

function visitTitle(cycleNumber: number): string {
  const known: Record<number, string> = {
    1: "الزيارة الأولى",
    2: "الزيارة الثانية",
    3: "الزيارة الثالثة",
    4: "الزيارة الرابعة",
    5: "الزيارة الخامسة",
    6: "الزيارة السادسة",
    7: "الزيارة السابعة",
    8: "الزيارة الثامنة",
    9: "الزيارة التاسعة",
    10: "الزيارة العاشرة",
  };

  return known[cycleNumber] ?? `الزيارة ${cycleNumber}`;
}

function cleanForCopy(row: EvaluationRow): EvaluationRow {
  const copy = { ...row };
  for (const field of [
    "id",
    "createdAt",
    "updatedAt",
    "assignedAt",
    "removedAt",
    "removedReason",
    "reactivatedAt",
    "lastAdminMutation",
  ]) {
    delete copy[field];
  }

  return copy;
}

function mutationItem(mutation: PlannedMutation): EvaluationAdminPlanChangeItem {
  return {
    id: mutation.id,
    action: mutation.action,
    label: mutation.label,
    ...(mutation.cycleId ? { cycleId: mutation.cycleId } : {}),
    ...(mutation.targetPersonId
      ? { targetPersonId: mutation.targetPersonId }
      : {}),
    ...(mutation.evaluatorPersonId
      ? { evaluatorPersonId: mutation.evaluatorPersonId }
      : {}),
  };
}

function parseInput(value: unknown): EvaluationAdminPlanChangeInput {
  const parsed = EvaluationAdminPlanChangeInputSchema.safeParse(value);
  if (!parsed.success) {
    throw new HttpsError(
      "invalid-argument",
      parsed.error.issues.map((issue) => issue.message).join(" "),
    );
  }

  for (const [fieldName, fieldValue] of Object.entries({
    orgId: parsed.data.orgId,
    planId: parsed.data.planId,
    targetPersonId: parsed.data.targetPersonId,
    evaluatorPersonId: parsed.data.evaluatorPersonId,
    replacementTargetPersonId: parsed.data.replacementTargetPersonId,
  })) {
    if (fieldValue) assertSafeDocumentId(fieldValue, fieldName);
  }

  return parsed.data;
}

function buildFingerprint(input: EvaluationAdminPlanChangeInput, state: PlanState): string {
  const rows = (items: Row[]) =>
    [...items]
      .sort((left, right) => left.id.localeCompare(right.id))
      .map((row) => ({
        id: row.id,
        status: readStatus(row),
        updatedAt: readNumber(row.updatedAt),
        cycleId: readString(row.cycleId),
        targetPersonId: readString(row.targetPersonId),
        evaluatorPersonId: readString(row.evaluatorPersonId),
        weight: readNumber(row.weight),
        cycleOrder: cycleOrder(row),
      }));

  return createHash("sha256")
    .update(
      JSON.stringify({
        input,
        plan: {
          id: state.plan.id,
          status: readStatus(state.plan),
          updatedAt: readNumber(state.plan.updatedAt),
        },
        cycles: rows(state.cycles),
        targetAssignments: rows(state.targetAssignments),
        evaluatorAssignments: rows(state.evaluatorAssignments),
        submissions: rows(state.submissions),
      }),
    )
    .digest("hex");
}

function planScope(state: PlanState) {
  const schoolId = readString(state.plan.schoolId);
  const academicYearId = readString(state.plan.academicYearId);
  const termId = readString(state.plan.termId);
  const frameworkId = readString(state.plan.frameworkId);

  if (!schoolId || !academicYearId || !termId || !frameworkId) {
    throw new HttpsError(
      "failed-precondition",
      "The selected plan is missing required school, academic year, term, or framework data.",
    );
  }

  return { schoolId, academicYearId, termId, frameworkId };
}

function isInPlanScope(row: EvaluationRow, state: PlanState): boolean {
  const scope = planScope(state);
  return (
    readString(row.planId) === state.plan.id &&
    readString(row.schoolId) === scope.schoolId &&
    readString(row.academicYearId) === scope.academicYearId &&
    readString(row.termId) === scope.termId
  );
}

function submissionCountForTarget(
  state: PlanState,
  targetPersonId: string,
  cycleId?: string,
  evaluatorPersonId?: string,
): number {
  return state.submissions.filter((submission) => {
    // Submissions are historical records. Count every record for this plan even
    // when a legacy document has incomplete scope fields, so a mutation cannot
    // reactivate or replace an assignment over unseen history.
    if (readString(submission.planId) !== state.plan.id) return false;
    if (readString(submission.targetPersonId) !== targetPersonId) return false;
    if (cycleId && readString(submission.cycleId) !== cycleId) return false;
    if (
      evaluatorPersonId &&
      readString(submission.evaluatorPersonId) !== evaluatorPersonId
    ) {
      return false;
    }
    return true;
  }).length;
}

function writeTargetAssignment(params: {
  state: PlanState;
  target: Person;
  targetRoleKey: string;
  targetRoleLabel: string;
  now: number;
}): EvaluationRow {
  const { state, target, targetRoleKey, targetRoleLabel, now } = params;
  const scope = planScope(state);
  const id = targetAssignmentId(state.plan.id, target.id);

  return {
    id,
    orgId: readString(state.plan.orgId),
    schoolId: scope.schoolId,
    schoolTitle: schoolTitle(state.school, scope.schoolId),
    academicYearId: scope.academicYearId,
    termId: scope.termId,
    planId: state.plan.id,
    planTitle: titleForPlan(state.plan),
    frameworkId: scope.frameworkId,
    targetKind: readString(state.plan.targetKind),
    targetPersonId: target.id,
    ...(target.uid ? { targetUid: target.uid } : {}),
    ...(target.email ? { targetEmail: target.email } : {}),
    targetDisplayName: target.displayName,
    ...(targetRoleKey ? { targetRoleKey } : {}),
    ...(targetRoleLabel ? { targetRoleLabel } : {}),
    status: "ACTIVE",
    assignedAt: now,
    createdAt: now,
    updatedAt: now,
    source: "WEB_ADMIN",
  };
}

function writeEvaluatorAssignment(params: {
  state: PlanState;
  cycle: Row;
  pattern: Row;
  target: Person;
  evaluator: Person;
  targetRoleKey: string;
  targetRoleLabel: string;
  evaluatorRoleKey: string;
  now: number;
}): EvaluationRow {
  const {
    state,
    cycle,
    pattern,
    target,
    evaluator,
    targetRoleKey,
    targetRoleLabel,
    evaluatorRoleKey,
    now,
  } = params;
  const scope = planScope(state);
  const id = evaluatorAssignmentId({
    planId: state.plan.id,
    cycleId: cycle.id,
    targetPersonId: target.id,
    evaluatorPersonId: evaluator.id,
  });

  return {
    ...cleanForCopy(pattern),
    id,
    orgId: readString(state.plan.orgId),
    schoolId: scope.schoolId,
    schoolTitle: schoolTitle(state.school, scope.schoolId),
    academicYearId: scope.academicYearId,
    termId: scope.termId,
    planId: state.plan.id,
    planTitle: titleForPlan(state.plan),
    frameworkId: scope.frameworkId,
    cycleId: cycle.id,
    cycleTitle: cycleTitle(cycle),
    targetAssignmentId: targetAssignmentId(state.plan.id, target.id),
    targetKind: readString(state.plan.targetKind),
    targetPersonId: target.id,
    ...(target.uid ? { targetUid: target.uid } : {}),
    ...(target.email ? { targetEmail: target.email } : {}),
    targetDisplayName: target.displayName,
    ...(targetRoleKey ? { targetRoleKey } : {}),
    ...(targetRoleLabel ? { targetRoleLabel } : {}),
    evaluatorPersonId: evaluator.id,
    ...(evaluator.uid ? { evaluatorUid: evaluator.uid } : {}),
    ...(evaluator.email ? { evaluatorEmail: evaluator.email } : {}),
    evaluatorDisplayName: evaluator.displayName,
    ...(evaluatorRoleKey ? { evaluatorRoleKey } : {}),
    evaluatorRoleLabel:
      readString(pattern.evaluatorRoleLabel) || evaluatorRoleKey,
    weight: readNumber(pattern.weight, 100),
    status: "ACTIVE",
    createdAt: now,
    updatedAt: now,
    source: "WEB_ADMIN",
    sourceType: "MANUAL",
  };
}

function addTargetOperation(
  input: EvaluationAdminPlanChangeInput,
  state: PlanState,
  now: number,
  mutations: PlannedMutation[],
  warnings: string[],
  conflicts: string[],
) {
  const targetPersonId = input.targetPersonId!;
  const evaluatorPersonId = input.evaluatorPersonId!;
  const target = state.people.get(targetPersonId);
  const evaluator = state.people.get(evaluatorPersonId);

  if (!target) conflicts.push("TARGET_PERSON_NOT_FOUND");
  if (!evaluator) conflicts.push("EVALUATOR_PERSON_NOT_FOUND");
  if (!target || !evaluator) return;

  const scopedTargets = state.targetAssignments.filter((row) =>
    isInPlanScope(row, state),
  );
  const existingTarget = scopedTargets.find(
    (row) => readString(row.targetPersonId) === target.id,
  );
  const scopedAssignments = state.evaluatorAssignments.filter((row) =>
    isInPlanScope(row, state),
  );
  const usableCycles = sortCycles(
    state.cycles.filter(
      (cycle) => isInPlanScope(cycle, state) && isUsableCycle(cycle),
    ),
  );

  if (usableCycles.length === 0) {
    conflicts.push("PLAN_HAS_NO_USABLE_CYCLES");
    return;
  }

  const targetRoleKey =
    readString(existingTarget?.targetRoleKey) ||
    readString(state.plan.targetRoleKey) ||
    target.roleKey ||
    readString(scopedTargets[0]?.targetRoleKey);
  const targetRoleLabel =
    readString(existingTarget?.targetRoleLabel) ||
    readString(scopedTargets[0]?.targetRoleLabel);

  if (!existingTarget) {
    mutations.push({
      collection: "evaluationTargetAssignments",
      id: targetAssignmentId(state.plan.id, target.id),
      action: "CREATE",
      label: target.displayName,
      targetPersonId: target.id,
      data: writeTargetAssignment({
        state,
        target,
        targetRoleKey,
        targetRoleLabel,
        now,
      }),
    });
  } else if (isActiveAssignment(existingTarget)) {
    warnings.push("TARGET_ASSIGNMENT_ALREADY_ACTIVE");
  } else if (submissionCountForTarget(state, target.id) > 0) {
    conflicts.push("REMOVED_TARGET_HAS_HISTORICAL_SUBMISSIONS");
  } else {
    mutations.push({
      collection: "evaluationTargetAssignments",
      id: existingTarget.id,
      action: "REACTIVATE",
      label: target.displayName,
      targetPersonId: target.id,
      data: { status: "ACTIVE", reactivatedAt: now, updatedAt: now },
    });
  }

  for (const cycle of usableCycles) {
    const existing = scopedAssignments.find(
      (assignment) =>
        readString(assignment.cycleId) === cycle.id &&
        readString(assignment.targetPersonId) === target.id &&
        readString(assignment.evaluatorPersonId) === evaluator.id,
    );

    if (existing && isActiveAssignment(existing)) {
      warnings.push(`EVALUATOR_ASSIGNMENT_ALREADY_ACTIVE:${cycle.id}`);
      continue;
    }

    if (
      existing &&
      submissionCountForTarget(state, target.id, cycle.id, evaluator.id) > 0
    ) {
      conflicts.push(`REMOVED_ASSIGNMENT_HAS_HISTORICAL_SUBMISSION:${cycle.id}`);
      continue;
    }

    const pattern =
      scopedAssignments.find(
        (assignment) =>
          isActiveAssignment(assignment) &&
          readString(assignment.cycleId) === cycle.id &&
          readString(assignment.evaluatorPersonId) === evaluator.id,
      ) ??
      scopedAssignments.find(
        (assignment) =>
          isActiveAssignment(assignment) &&
          readString(assignment.cycleId) === cycle.id,
      );

    if (!pattern) {
      conflicts.push(`NO_EVALUATOR_PATTERN_FOR_CYCLE:${cycle.id}`);
      continue;
    }

    const evaluatorRoleKey =
      evaluator.roleKey || readString(pattern.evaluatorRoleKey);
    if (!evaluatorRoleKey) {
      conflicts.push(`EVALUATOR_ROLE_NOT_RESOLVED:${cycle.id}`);
      continue;
    }

    if (existing && isRemovedAssignment(existing)) {
      mutations.push({
        collection: "evaluationEvaluatorAssignments",
        id: existing.id,
        action: "REACTIVATE",
        label: `${evaluator.displayName} — ${cycleTitle(cycle)}`,
        cycleId: cycle.id,
        targetPersonId: target.id,
        evaluatorPersonId: evaluator.id,
        data: { status: "ACTIVE", reactivatedAt: now, updatedAt: now },
      });
      continue;
    }

    mutations.push({
      collection: "evaluationEvaluatorAssignments",
      id: evaluatorAssignmentId({
        planId: state.plan.id,
        cycleId: cycle.id,
        targetPersonId: target.id,
        evaluatorPersonId: evaluator.id,
      }),
      action: "CREATE",
      label: `${evaluator.displayName} — ${cycleTitle(cycle)}`,
      cycleId: cycle.id,
      targetPersonId: target.id,
      evaluatorPersonId: evaluator.id,
      data: writeEvaluatorAssignment({
        state,
        cycle,
        pattern,
        target,
        evaluator,
        targetRoleKey,
        targetRoleLabel,
        evaluatorRoleKey,
        now,
      }),
    });
  }
}

function removeTargetOperation(
  input: EvaluationAdminPlanChangeInput,
  state: PlanState,
  now: number,
  mutations: PlannedMutation[],
  warnings: string[],
  conflicts: string[],
) {
  const targetPersonId = input.targetPersonId!;
  const activeTargets = state.targetAssignments.filter(
    (row) =>
      isInPlanScope(row, state) &&
      readString(row.targetPersonId) === targetPersonId &&
      isActiveAssignment(row),
  );
  const activeAssignments = state.evaluatorAssignments.filter(
    (row) =>
      isInPlanScope(row, state) &&
      readString(row.targetPersonId) === targetPersonId &&
      isActiveAssignment(row),
  );
  const historicalCount = submissionCountForTarget(state, targetPersonId);

  if (activeTargets.length === 0) {
    conflicts.push("ACTIVE_TARGET_ASSIGNMENT_NOT_FOUND");
    return;
  }

  if (historicalCount > 0) {
    warnings.push(`HISTORICAL_SUBMISSIONS_PRESERVED:${historicalCount}`);
  }

  for (const target of activeTargets) {
    mutations.push({
      collection: "evaluationTargetAssignments",
      id: target.id,
      action: "REMOVE",
      label: displayName(target, targetPersonId),
      targetPersonId,
      data: {
        status: "REMOVED",
        removedAt: now,
        removedReason: "WEB_ADMIN_TARGET_REMOVED",
        updatedAt: now,
      },
    });
  }

  for (const assignment of activeAssignments) {
    mutations.push({
      collection: "evaluationEvaluatorAssignments",
      id: assignment.id,
      action: "REMOVE",
      label: `${displayName(assignment, readString(assignment.evaluatorPersonId))} — ${readString(assignment.cycleTitle) || readString(assignment.cycleId)}`,
      cycleId: readString(assignment.cycleId),
      targetPersonId,
      evaluatorPersonId: readString(assignment.evaluatorPersonId),
      data: {
        status: "REMOVED",
        removedAt: now,
        removedReason: "WEB_ADMIN_TARGET_REMOVED",
        updatedAt: now,
      },
    });
  }
}

function replaceTargetOperation(
  input: EvaluationAdminPlanChangeInput,
  state: PlanState,
  now: number,
  mutations: PlannedMutation[],
  warnings: string[],
  conflicts: string[],
) {
  const oldTargetPersonId = input.targetPersonId!;
  const newTargetPersonId = input.replacementTargetPersonId!;

  if (oldTargetPersonId === newTargetPersonId) {
    conflicts.push("REPLACEMENT_TARGET_MUST_BE_DIFFERENT");
    return;
  }

  const newTarget = state.people.get(newTargetPersonId);
  if (!newTarget) {
    conflicts.push("REPLACEMENT_TARGET_PERSON_NOT_FOUND");
    return;
  }

  const activeOldTargets = state.targetAssignments.filter(
    (row) =>
      isInPlanScope(row, state) &&
      readString(row.targetPersonId) === oldTargetPersonId &&
      isActiveAssignment(row),
  );
  const activeOldAssignments = state.evaluatorAssignments.filter(
    (row) =>
      isInPlanScope(row, state) &&
      readString(row.targetPersonId) === oldTargetPersonId &&
      isActiveAssignment(row),
  );
  const existingNewTarget = state.targetAssignments.find(
    (row) =>
      isInPlanScope(row, state) &&
      readString(row.targetPersonId) === newTargetPersonId,
  );

  if (activeOldTargets.length !== 1) {
    conflicts.push("EXPECTED_EXACTLY_ONE_ACTIVE_OLD_TARGET_ASSIGNMENT");
  }
  if (activeOldAssignments.length === 0) {
    conflicts.push("NO_ACTIVE_EVALUATOR_ASSIGNMENTS_FOR_OLD_TARGET");
  }
  if (existingNewTarget && isActiveAssignment(existingNewTarget)) {
    conflicts.push("REPLACEMENT_TARGET_ALREADY_ACTIVE_IN_PLAN");
  }
  if (
    existingNewTarget &&
    !isActiveAssignment(existingNewTarget) &&
    submissionCountForTarget(state, newTargetPersonId) > 0
  ) {
    conflicts.push("REPLACEMENT_TARGET_HAS_HISTORICAL_SUBMISSIONS");
  }
  if (conflicts.length > 0) return;

  const oldTarget = activeOldTargets[0];
  const oldHistory = submissionCountForTarget(state, oldTargetPersonId);
  if (oldHistory > 0) {
    warnings.push(`HISTORICAL_SUBMISSIONS_PRESERVED:${oldHistory}`);
  }

  const newTargetId = targetAssignmentId(state.plan.id, newTarget.id);
  const newTargetData = existingNewTarget
    ? {
        targetUid: newTarget.uid || readString(existingNewTarget.targetUid),
        targetEmail:
          newTarget.email || readString(existingNewTarget.targetEmail),
        targetDisplayName: newTarget.displayName,
        targetRoleKey:
          readString(oldTarget.targetRoleKey) || newTarget.roleKey,
        targetRoleLabel: readString(oldTarget.targetRoleLabel),
        status: "ACTIVE",
        reactivatedAt: now,
        updatedAt: now,
      }
    : {
        ...cleanForCopy(oldTarget),
        ...writeTargetAssignment({
          state,
          target: newTarget,
          targetRoleKey:
            readString(oldTarget.targetRoleKey) || newTarget.roleKey,
          targetRoleLabel: readString(oldTarget.targetRoleLabel),
          now,
        }),
      };
  mutations.push({
    collection: "evaluationTargetAssignments",
    id: newTargetId,
    action: existingNewTarget ? "REACTIVATE" : "CREATE",
    label: newTarget.displayName,
    targetPersonId: newTarget.id,
    data: newTargetData,
  });

  for (const oldAssignment of activeOldAssignments) {
    const cycleId = readString(oldAssignment.cycleId);
    const evaluatorPersonId = readString(oldAssignment.evaluatorPersonId);
    if (!cycleId || !evaluatorPersonId) {
      conflicts.push(`OLD_ASSIGNMENT_MISSING_CYCLE_OR_EVALUATOR:${oldAssignment.id}`);
      continue;
    }

    const newAssignmentId = evaluatorAssignmentId({
      planId: state.plan.id,
      cycleId,
      targetPersonId: newTarget.id,
      evaluatorPersonId,
    });
    const existing = state.evaluatorAssignments.find(
      (row) => row.id === newAssignmentId,
    );
    if (existing && isActiveAssignment(existing)) {
      conflicts.push(`REPLACEMENT_EVALUATOR_ASSIGNMENT_ALREADY_ACTIVE:${cycleId}`);
      continue;
    }
    if (
      existing &&
      submissionCountForTarget(state, newTarget.id, cycleId, evaluatorPersonId) > 0
    ) {
      conflicts.push(`REPLACEMENT_ASSIGNMENT_HAS_HISTORICAL_SUBMISSION:${cycleId}`);
      continue;
    }

    const newAssignmentData = existing
      ? {
          targetAssignmentId: newTargetId,
          targetPersonId: newTarget.id,
          ...(newTarget.uid ? { targetUid: newTarget.uid } : {}),
          ...(newTarget.email ? { targetEmail: newTarget.email } : {}),
          targetDisplayName: newTarget.displayName,
          targetRoleKey:
            readString(oldAssignment.targetRoleKey) || newTarget.roleKey,
          status: "ACTIVE",
          reactivatedAt: now,
          updatedAt: now,
        }
      : {
          ...cleanForCopy(oldAssignment),
          id: newAssignmentId,
          targetAssignmentId: newTargetId,
          targetPersonId: newTarget.id,
          ...(newTarget.uid ? { targetUid: newTarget.uid } : {}),
          ...(newTarget.email ? { targetEmail: newTarget.email } : {}),
          targetDisplayName: newTarget.displayName,
          targetRoleKey:
            readString(oldAssignment.targetRoleKey) || newTarget.roleKey,
          status: "ACTIVE",
          createdAt: now,
          updatedAt: now,
          source: "WEB_ADMIN",
        };
    mutations.push({
      collection: "evaluationEvaluatorAssignments",
      id: newAssignmentId,
      action: existing ? "REACTIVATE" : "CREATE",
      label: `${displayName(oldAssignment, evaluatorPersonId)} — ${readString(oldAssignment.cycleTitle) || cycleId}`,
      cycleId,
      targetPersonId: newTarget.id,
      evaluatorPersonId,
      data: newAssignmentData,
    });
  }

  if (conflicts.length > 0) return;

  for (const oldTarget of activeOldTargets) {
    mutations.push({
      collection: "evaluationTargetAssignments",
      id: oldTarget.id,
      action: "REMOVE",
      label: displayName(oldTarget, oldTargetPersonId),
      targetPersonId: oldTargetPersonId,
      data: {
        status: "REMOVED",
        removedAt: now,
        removedReason: "WEB_ADMIN_TARGET_REPLACED",
        updatedAt: now,
      },
    });
  }
  for (const oldAssignment of activeOldAssignments) {
    mutations.push({
      collection: "evaluationEvaluatorAssignments",
      id: oldAssignment.id,
      action: "REMOVE",
      label: displayName(oldAssignment, oldAssignment.id),
      cycleId: readString(oldAssignment.cycleId),
      targetPersonId: oldTargetPersonId,
      evaluatorPersonId: readString(oldAssignment.evaluatorPersonId),
      data: {
        status: "REMOVED",
        removedAt: now,
        removedReason: "WEB_ADMIN_TARGET_REPLACED",
        updatedAt: now,
      },
    });
  }
}

function cycleCountOperation(
  input: EvaluationAdminPlanChangeInput,
  state: PlanState,
  now: number,
  mutations: PlannedMutation[],
  warnings: string[],
  conflicts: string[],
) {
  const requestedCount = input.cycleCount!;
  const scopedCycles = sortCycles(
    state.cycles.filter((cycle) => isInPlanScope(cycle, state)),
  );
  const cyclesByNumber = new Map<number, Row>();
  for (const cycle of scopedCycles) {
    const number = cycleOrder(cycle);
    if (number === Number.MAX_SAFE_INTEGER) {
      conflicts.push(`CYCLE_MISSING_SEQUENCE:${cycle.id}`);
      continue;
    }
    if (cyclesByNumber.has(number)) {
      conflicts.push(`DUPLICATE_CYCLE_SEQUENCE:${number}`);
      continue;
    }
    cyclesByNumber.set(number, cycle);
  }

  const activeCycles = scopedCycles.filter(isUsableCycle);
  const patternCycle = activeCycles[activeCycles.length - 1];
  if (requestedCount > activeCycles.length && !patternCycle) {
    conflicts.push("NO_USABLE_CYCLE_PATTERN_FOR_EXPANSION");
  }

  const assignments = state.evaluatorAssignments.filter((assignment) =>
    isInPlanScope(assignment, state),
  );

  for (let cycleNumber = 1; cycleNumber <= requestedCount; cycleNumber += 1) {
    const existing = cyclesByNumber.get(cycleNumber);
    if (existing && isUsableCycle(existing)) continue;

    if (existing && isRemovedCycle(existing)) {
      const existingSubmissions = state.submissions.filter(
        (submission) =>
          isInPlanScope(submission, state) &&
          readString(submission.cycleId) === existing.id,
      );
      if (existingSubmissions.length > 0) {
        conflicts.push(`REMOVED_CYCLE_HAS_HISTORICAL_SUBMISSIONS:${existing.id}`);
        continue;
      }

      mutations.push({
        collection: "evaluationCycles",
        id: existing.id,
        action: "REACTIVATE",
        label: cycleTitle(existing),
        cycleId: existing.id,
        data: {
          status: "OPEN",
          sequence: cycleNumber,
          order: cycleNumber,
          cycleNumber,
          visitNumber: cycleNumber,
          reactivatedAt: now,
          updatedAt: now,
        },
      });
      for (const assignment of assignments.filter(
        (item) =>
          readString(item.cycleId) === existing.id && isRemovedAssignment(item),
      )) {
        mutations.push({
          collection: "evaluationEvaluatorAssignments",
          id: assignment.id,
          action: "REACTIVATE",
          label: displayName(assignment, assignment.id),
          cycleId: existing.id,
          targetPersonId: readString(assignment.targetPersonId),
          evaluatorPersonId: readString(assignment.evaluatorPersonId),
          data: { status: "ACTIVE", reactivatedAt: now, updatedAt: now },
        });
      }
      continue;
    }

    if (!patternCycle) continue;
    const patternAssignments = assignments.filter(
      (assignment) =>
        readString(assignment.cycleId) === patternCycle.id &&
        isActiveAssignment(assignment),
    );
    if (patternAssignments.length === 0) {
      conflicts.push("NO_ACTIVE_EVALUATOR_ASSIGNMENT_PATTERN_FOR_NEW_CYCLE");
      continue;
    }

    const cycleId = replacementCycleId(patternCycle.id, state.plan.id, cycleNumber);
    if (scopedCycles.some((cycle) => cycle.id === cycleId)) {
      conflicts.push(`NEW_CYCLE_ID_ALREADY_EXISTS:${cycleId}`);
      continue;
    }
    const newCycle: EvaluationRow = {
      ...cleanForCopy(patternCycle),
      id: cycleId,
      orgId: readString(state.plan.orgId),
      schoolId: readString(state.plan.schoolId),
      schoolTitle: schoolTitle(state.school, readString(state.plan.schoolId)),
      academicYearId: readString(state.plan.academicYearId),
      termId: readString(state.plan.termId),
      planId: state.plan.id,
      planTitle: titleForPlan(state.plan),
      frameworkId: readString(state.plan.frameworkId),
      title: visitTitle(cycleNumber),
      shortTitle: visitTitle(cycleNumber),
      sequence: cycleNumber,
      order: cycleNumber,
      cycleNumber,
      visitNumber: cycleNumber,
      status: "OPEN",
      createdAt: now,
      updatedAt: now,
      source: "WEB_ADMIN",
    };
    mutations.push({
      collection: "evaluationCycles",
      id: cycleId,
      action: "CREATE",
      label: visitTitle(cycleNumber),
      cycleId,
      data: newCycle,
    });

    for (const patternAssignment of patternAssignments) {
      const assignmentId = evaluatorAssignmentId({
        planId: state.plan.id,
        cycleId,
        targetPersonId: readString(patternAssignment.targetPersonId),
        evaluatorPersonId: readString(patternAssignment.evaluatorPersonId),
      });
      if (!readString(patternAssignment.targetPersonId) || !readString(patternAssignment.evaluatorPersonId)) {
        conflicts.push(`PATTERN_ASSIGNMENT_MISSING_IDENTITY:${patternAssignment.id}`);
        continue;
      }
      if (assignments.some((assignment) => assignment.id === assignmentId)) {
        conflicts.push(`NEW_EVALUATOR_ASSIGNMENT_ID_ALREADY_EXISTS:${assignmentId}`);
        continue;
      }
      mutations.push({
        collection: "evaluationEvaluatorAssignments",
        id: assignmentId,
        action: "CREATE",
        label: displayName(patternAssignment, assignmentId),
        cycleId,
        targetPersonId: readString(patternAssignment.targetPersonId),
        evaluatorPersonId: readString(patternAssignment.evaluatorPersonId),
        data: {
          ...cleanForCopy(patternAssignment),
          id: assignmentId,
          cycleId,
          cycleTitle: visitTitle(cycleNumber),
          status: "ACTIVE",
          createdAt: now,
          updatedAt: now,
          source: "WEB_ADMIN",
        },
      });
    }
  }

  for (const cycle of scopedCycles) {
    const number = cycleOrder(cycle);
    if (number <= requestedCount || !isUsableCycle(cycle)) continue;
    const submissionCount = state.submissions.filter(
      (submission) =>
        isInPlanScope(submission, state) &&
        readString(submission.cycleId) === cycle.id,
    ).length;
    if (submissionCount > 0) {
      warnings.push(
        `DEACTIVATING_CYCLE_PRESERVES_HISTORICAL_SUBMISSIONS:${cycle.id}:${submissionCount}`,
      );
    }
    mutations.push({
      collection: "evaluationCycles",
      id: cycle.id,
      action: "REMOVE",
      label: cycleTitle(cycle),
      cycleId: cycle.id,
      data: {
        status: "REMOVED",
        removedAt: now,
        removedReason: "WEB_ADMIN_CYCLE_COUNT_REDUCED",
        updatedAt: now,
      },
    });
    for (const assignment of assignments.filter(
      (item) =>
        readString(item.cycleId) === cycle.id && isActiveAssignment(item),
    )) {
      mutations.push({
        collection: "evaluationEvaluatorAssignments",
        id: assignment.id,
        action: "REMOVE",
        label: displayName(assignment, assignment.id),
        cycleId: cycle.id,
        targetPersonId: readString(assignment.targetPersonId),
        evaluatorPersonId: readString(assignment.evaluatorPersonId),
        data: {
          status: "REMOVED",
          removedAt: now,
          removedReason: "WEB_ADMIN_CYCLE_COUNT_REDUCED",
          updatedAt: now,
        },
      });
    }
  }

  const currentCount = readNumber(
    state.plan.cycleCount,
    readNumber(state.plan.maxCyclesPerTerm, activeCycles.length),
  );
  if (currentCount !== requestedCount) {
    mutations.push({
      collection: "evaluationPlans",
      id: state.plan.id,
      action: "UPDATE",
      label: titleForPlan(state.plan),
      data: {
        cycleCount: requestedCount,
        maxCyclesPerTerm: requestedCount,
        updatedAt: now,
      },
    });
  } else if (mutations.length === 0) {
    warnings.push("REQUESTED_CYCLE_COUNT_ALREADY_CONFIGURED");
  }
}

function buildOperationPlan(
  input: EvaluationAdminPlanChangeInput,
  state: PlanState,
  now: number,
): OperationPlan {
  const conflicts: string[] = [];
  const warnings: string[] = [];
  const mutations: PlannedMutation[] = [];
  const scope = planScope(state);

  if (readString(state.plan.orgId) && readString(state.plan.orgId) !== input.orgId) {
    throw new HttpsError("permission-denied", "Evaluation plan organization mismatch.");
  }
  if (!readString(state.plan.orgId)) conflicts.push("PLAN_MISSING_ORG_ID");
  if (!isPlanActive(state.plan)) conflicts.push("PLAN_IS_NOT_ACTIVE");
  if (!state.framework) conflicts.push("FRAMEWORK_NOT_FOUND");
  else if (!isFrameworkActive(state.framework)) conflicts.push("FRAMEWORK_IS_NOT_ACTIVE");

  for (const row of [
    ...state.cycles,
    ...state.targetAssignments,
    ...state.evaluatorAssignments,
  ]) {
    if (!isInPlanScope(row, state)) {
      conflicts.push(`PLAN_SCOPE_MISMATCH:${row.id}`);
    }
  }

  switch (input.action) {
    case "ADD_TARGET":
      addTargetOperation(input, state, now, mutations, warnings, conflicts);
      break;
    case "REMOVE_TARGET":
      removeTargetOperation(input, state, now, mutations, warnings, conflicts);
      break;
    case "REPLACE_TARGET":
      replaceTargetOperation(input, state, now, mutations, warnings, conflicts);
      break;
    case "SET_CYCLE_COUNT":
      cycleCountOperation(input, state, now, mutations, warnings, conflicts);
      break;
  }

  if (mutations.length === 0 && conflicts.length === 0) {
    warnings.push("NO_CHANGES_REQUIRED");
  }
  if (mutations.length + 1 > MAX_WRITES_PER_OPERATION) {
    conflicts.push(`WRITE_LIMIT_EXCEEDED:${mutations.length + 1}`);
  }

  const grouped = (collection: CollectionName) =>
    mutations.filter((mutation) => mutation.collection === collection).map(mutationItem);
  const historicalSubmissionCount = state.submissions.length;

  return {
    preview: {
      action: input.action,
      fingerprint: buildFingerprint(input, state),
      canApply: conflicts.length === 0 && mutations.length > 0,
      plan: {
        id: state.plan.id,
        title: titleForPlan(state.plan),
        schoolId: scope.schoolId,
        academicYearId: scope.academicYearId,
        termId: scope.termId,
        frameworkId: scope.frameworkId,
      },
      targetAssignments: grouped("evaluationTargetAssignments"),
      evaluatorAssignments: grouped("evaluationEvaluatorAssignments"),
      cycles: grouped("evaluationCycles"),
      planUpdates: grouped("evaluationPlans"),
      historicalSubmissionCount,
      warnings: Array.from(new Set(warnings)),
      conflicts: Array.from(new Set(conflicts)),
      totalWrites: mutations.length + (mutations.length > 0 ? 1 : 0),
    },
    mutations,
  };
}

async function loadPlanState(
  input: EvaluationAdminPlanChangeInput,
): Promise<PlanState> {
  const db = getFirestore();
  const planRef = db.doc(`orgs/${input.orgId}/evaluationPlans/${input.planId}`);
  const planSnapshot = await planRef.get();
  if (!planSnapshot.exists) {
    throw new HttpsError("not-found", "Evaluation plan was not found.");
  }
  const plan = asRow(planSnapshot.id, planSnapshot.data() ?? {});
  const schoolId = readString(plan.schoolId);
  const frameworkId = readString(plan.frameworkId);
  if (!schoolId || !frameworkId) {
    throw new HttpsError(
      "failed-precondition",
      "The selected plan is missing school or framework data.",
    );
  }

  const peopleToLoad = Array.from(
    new Set(
      [
        input.targetPersonId,
        input.evaluatorPersonId,
        input.replacementTargetPersonId,
      ].filter((value): value is string => Boolean(value)),
    ),
  );
  const orgPath = `orgs/${input.orgId}`;
  const [
    frameworkSnapshot,
    schoolSnapshot,
    cyclesSnapshot,
    targetsSnapshot,
    assignmentsSnapshot,
    submissionsSnapshot,
  ] = await Promise.all([
    db.doc(`${orgPath}/evaluationFrameworks/${frameworkId}`).get(),
    db.doc(`${orgPath}/schools/${schoolId}`).get(),
    db.collection(`${orgPath}/evaluationCycles`).where("planId", "==", input.planId).get(),
    db.collection(`${orgPath}/evaluationTargetAssignments`).where("planId", "==", input.planId).get(),
    db.collection(`${orgPath}/evaluationEvaluatorAssignments`).where("planId", "==", input.planId).get(),
    db.collection(`${orgPath}/evaluationSubmissions`).where("planId", "==", input.planId).get(),
  ]);
  const personSnapshots = await Promise.all(
    peopleToLoad.map((personId) => db.doc(`${orgPath}/people/${personId}`).get()),
  );

  const people = new Map<string, Person>();
  for (const snapshot of personSnapshots) {
    if (!snapshot.exists) continue;
    const data = snapshot.data() ?? {};
    people.set(snapshot.id, {
      id: snapshot.id,
      uid: readString(data.uid),
      displayName: displayName(data, snapshot.id),
      email: readString(data.email),
      roleKey: readString(data.roleKey) || readString(data.role),
    });
  }

  return {
    plan,
    framework: frameworkSnapshot.exists
      ? asRow(frameworkSnapshot.id, frameworkSnapshot.data() ?? {})
      : null,
    school: schoolSnapshot.exists
      ? asRow(schoolSnapshot.id, schoolSnapshot.data() ?? {})
      : null,
    cycles: cyclesSnapshot.docs.map((document) =>
      asRow(document.id, document.data()),
    ),
    targetAssignments: targetsSnapshot.docs.map((document) =>
      asRow(document.id, document.data()),
    ),
    evaluatorAssignments: assignmentsSnapshot.docs.map((document) =>
      asRow(document.id, document.data()),
    ),
    submissions: submissionsSnapshot.docs.map((document) =>
      asRow(document.id, document.data()),
    ),
    people,
  };
}

async function requireEvaluationAdmin(params: {
  uid: string;
  orgId: string;
  schoolId: string;
  now: number;
}): Promise<{ personId: string; roleKey: string }> {
  const db = getFirestore();
  const [userSnapshot, membershipSnapshot] = await Promise.all([
    db.doc(`users/${params.uid}`).get(),
    db.doc(`users/${params.uid}/orgMemberships/${params.orgId}`).get(),
  ]);
  if (!membershipSnapshot.exists) {
    throw new HttpsError(
      "permission-denied",
      "Active organization membership is required.",
    );
  }

  return resolvePerformanceImprovementActor({
    user: userSnapshot.data() ?? {},
    membership: membershipSnapshot.data() ?? {},
    schoolId: params.schoolId,
    now: params.now,
  });
}

async function previewChange(
  uid: string,
  input: EvaluationAdminPlanChangeInput,
): Promise<OperationPlan> {
  const now = Date.now();
  const state = await loadPlanState(input);
  const scope = planScope(state);
  await requireEvaluationAdmin({ uid, orgId: input.orgId, schoolId: scope.schoolId, now });
  return buildOperationPlan(input, state, now);
}

function auditData(params: {
  uid: string;
  actorPersonId: string;
  action: EvaluationAdminPlanChangeAction;
  reason?: string;
  now: number;
}): EvaluationRow {
  return {
    lastAdminMutation: {
      source: "WEB_ADMIN",
      actorUid: params.uid,
      actorPersonId: params.actorPersonId,
      action: params.action,
      ...(params.reason ? { reason: params.reason } : {}),
      timestamp: params.now,
    },
  };
}

export const adminPreviewEvaluationPlanChange = onCall(
  { region: REGION, cors: true, invoker: "public" },
  async (request): Promise<EvaluationAdminPlanChangePreview> => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError("unauthenticated", "Authentication is required.");
    return (await previewChange(uid, parseInput(request.data))).preview;
  },
);

export const adminApplyEvaluationPlanChange = onCall(
  { region: REGION, cors: true, invoker: "public" },
  async (request): Promise<EvaluationAdminPlanChangeApplyResult> => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError("unauthenticated", "Authentication is required.");

    const input = parseInput(request.data);
    const previewFingerprint = readString(
      (request.data as EvaluationRow).previewFingerprint,
    );
    if (!previewFingerprint) {
      throw new HttpsError(
        "failed-precondition",
        "Preview the operation again before applying it.",
      );
    }

    const now = Date.now();
    const state = await loadPlanState(input);
    const scope = planScope(state);
    const actor = await requireEvaluationAdmin({
      uid,
      orgId: input.orgId,
      schoolId: scope.schoolId,
      now,
    });
    const operation = buildOperationPlan(input, state, now);

    if (operation.preview.fingerprint !== previewFingerprint) {
      throw new HttpsError(
        "failed-precondition",
        "Evaluation plan data changed after preview. Run preview again.",
      );
    }
    if (!operation.preview.canApply) {
      throw new HttpsError(
        "failed-precondition",
        operation.preview.conflicts.join(" ") || "No changes are ready to apply.",
      );
    }

    const db = getFirestore();
    const batch = db.batch();
    const audit = auditData({
      uid,
      actorPersonId: actor.personId,
      action: input.action,
      ...(input.reason ? { reason: input.reason } : {}),
      now,
    });

    for (const mutation of operation.mutations) {
      const ref = db.doc(`orgs/${input.orgId}/${mutation.collection}/${mutation.id}`);
      const data = { ...mutation.data, ...audit, updatedAt: now };
      if (mutation.action === "CREATE") {
        batch.create(ref, data);
      } else {
        batch.set(ref, data, { merge: true });
      }
    }

    const auditEventId = `evaluation-admin-${input.planId}-${now}`;
    batch.create(db.doc(`orgs/${input.orgId}/evaluationAdminAuditEvents/${auditEventId}`), {
      id: auditEventId,
      orgId: input.orgId,
      planId: input.planId,
      schoolId: scope.schoolId,
      action: input.action,
      source: "WEB_ADMIN",
      actorUid: uid,
      actorPersonId: actor.personId,
      ...(input.reason ? { reason: input.reason } : {}),
      previewFingerprint,
      totalWrites: operation.preview.totalWrites,
      createdAt: now,
      updatedAt: now,
    });

    await batch.commit();

    return {
      ok: true,
      auditEventId,
      appliedWrites: operation.preview.totalWrites,
      preview: operation.preview,
    };
  },
);
