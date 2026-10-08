import { getFirestore } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import {
  EvaluationReportRequestSchema,
  MembershipRole,
  type EvaluationReportEmployee,
  type EvaluationReportFilterOptions,
  type EvaluationReportKpis,
  type EvaluationReportOption,
  type EvaluationReportOverview,
  type EvaluationReportPersonCycle,
  type EvaluationReportPersonDetail,
  type EvaluationReportPersonPlan,
  type EvaluationReportRequest,
  type EvaluationReportSchool,
  type EvaluationReportStatusFilter,
  type MembershipRole as MembershipRoleType,
} from "@takween/contracts";
import { getSpecialStaffReportingAccess, hasOrgWideAccess } from "@takween/domain";

import { normalizeEvaluatorWeights } from "../evaluations/evaluator-weighting";

const REGION = "me-central2";
const IN_QUERY_CHUNK_SIZE = 10;

type Row = Record<string, unknown>;
type RowWithId = Row & { id: string };

type ReportActor = {
  personId: string;
  schoolIds: string[];
  schools: Array<{ id: string; name: string }>;
};

type PlanInfo = {
  id: string;
  title: string;
  schoolId: string;
  schoolName: string;
  academicYearId: string;
  termId: string;
  frameworkId: string;
  frameworkTitle: string;
  frameworkKind: string;
  planKind: string;
  targetKind: string;
  status: string;
  evaluationType: string;
  evaluationTypeLabel: string;
  row: RowWithId;
};

type CycleRecord = {
  targetPersonId: string;
  displayName: string;
  email: string;
  roleKey: string;
  plan: PlanInfo;
  cycle: RowWithId;
  cycleTitle: string;
  cycleNumber: number | undefined;
  cycleKind: string;
  cycleStatus: string;
  status: EvaluationReportStatusFilter;
  completed: boolean;
  includedInAverage: boolean;
  finalScore: number | undefined;
  submittedAt: number | undefined;
  approvedAt: number | undefined;
  updatedAt: number | undefined;
  evaluatorAssignments: RowWithId[];
};

type ReportDataset = {
  contextPlans: PlanInfo[];
  records: CycleRecord[];
  people: Map<string, RowWithId>;
};

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

function bool(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function statusOf(rowData: Row): string {
  return text(rowData.status).toUpperCase();
}

function activityAt(rowData: Row): number {
  return (
    numberValue(rowData.updatedAt) ??
    numberValue(rowData.approvedAt) ??
    numberValue(rowData.reviewedAt) ??
    numberValue(rowData.submittedAt) ??
    numberValue(rowData.createdAt) ??
    0
  );
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function clampPercentage(value: number | undefined): number | undefined {
  if (value === undefined) return undefined;
  return Math.max(0, Math.min(100, value));
}

function average(values: number[]): number | undefined {
  return values.length
    ? round2(values.reduce((sum, value) => sum + value, 0) / values.length)
    : undefined;
}

function asRowWithId(id: string, data: Row): RowWithId {
  return { id, ...data };
}

function chunk<T>(values: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }
  return chunks;
}

function requireSafeId(value: string, name: string): string {
  const id = value.trim();
  if (!id || id.includes("/")) {
    throw new HttpsError("invalid-argument", `${name} is required.`);
  }
  return id;
}

function parseRequest(value: unknown): EvaluationReportRequest {
  const parsed = EvaluationReportRequestSchema.safeParse(value);
  if (!parsed.success) {
    throw new HttpsError("invalid-argument", "Invalid evaluation report filters.");
  }

  const input = parsed.data;
  for (const [name, id] of Object.entries({
    orgId: input.orgId,
    academicYearId: input.academicYearId,
    termId: input.termId,
    schoolId: input.schoolId,
    targetRoleKey: input.targetRoleKey,
    targetPersonId: input.targetPersonId,
    evaluationType: input.evaluationType,
  })) {
    if (id) requireSafeId(id, name);
  }

  return input;
}

function membershipIsActive(membership: Row, now: number): boolean {
  if (membership.isActive === false || membership.active === false) return false;
  const startAt = numberValue(membership.startAt);
  const endAt = numberValue(membership.endAt);
  return !(startAt !== undefined && startAt > now) &&
    !(endAt !== undefined && endAt < now);
}

function membershipRole(membership: Row): MembershipRoleType | null {
  const parsed = MembershipRole.safeParse(
    text(membership.roleKey) || text(membership.role),
  );
  return parsed.success ? parsed.data : null;
}

function isActiveAssignment(rowData: Row): boolean {
  const status = statusOf(rowData);
  return status === "ACTIVE" || (!status && bool(rowData.isActive) === true);
}

function isRelevantCycle(rowData: Row): boolean {
  return !["CANCELLED", "REMOVED", "INACTIVE", "ARCHIVED"].includes(
    statusOf(rowData),
  );
}

function isReportablePlan(rowData: Row): boolean {
  const status = statusOf(rowData);
  return status !== "ARCHIVED" && status !== "DRAFT";
}

function cycleNumber(rowData: Row): number | undefined {
  for (const field of ["cycleNumber", "visitNumber", "sequence", "order"]) {
    const value = numberValue(rowData[field]);
    if (value !== undefined) return value;
  }
  return undefined;
}

function cycleTitle(rowData: Row): string {
  return text(rowData.title) || text(rowData.label) || text(rowData.shortTitle) || "دورة تقييم";
}

function displayName(rowData: Row | undefined, fallback: string): string {
  return (
    text(rowData?.displayName) ||
    text(rowData?.fullName) ||
    text(rowData?.name) ||
    fallback
  );
}

function targetId(rowData: Row): string {
  return text(rowData.targetPersonId) || text(rowData.targetTeacherPersonId);
}

function scoreFromSubmission(rowData: Row): number | undefined {
  const normalized = clampPercentage(numberValue(rowData.normalizedScore));
  if (normalized !== undefined) return normalized;

  const total = numberValue(rowData.totalScore) ?? numberValue(rowData.rawScore);
  const max = numberValue(rowData.maxScore);
  return total !== undefined && max !== undefined && max > 0
    ? clampPercentage((total / max) * 100)
    : undefined;
}

function isCompletedStatus(status: string): boolean {
  return status === "APPROVED" || status === "LOCKED";
}

function normalizedStatus(status: string): EvaluationReportStatusFilter {
  return [
    "DRAFT",
    "SUBMITTED",
    "UNDER_REVIEW",
    "RETURNED",
    "APPROVED",
    "LOCKED",
    "CANCELLED",
  ].includes(status)
    ? (status as EvaluationReportStatusFilter)
    : "PENDING";
}

function chooseIncompleteStatus(rows: Row[]): EvaluationReportStatusFilter {
  const statuses = rows.map(statusOf);
  if (statuses.includes("SUBMITTED")) return "SUBMITTED";
  if (statuses.includes("UNDER_REVIEW")) return "UNDER_REVIEW";
  if (statuses.includes("RETURNED")) return "RETURNED";
  if (statuses.includes("DRAFT")) return "DRAFT";
  if (statuses.includes("CANCELLED")) return "CANCELLED";
  return "PENDING";
}

async function resolveActor(params: {
  uid: string;
  orgId: string;
}): Promise<ReportActor> {
  const db = getFirestore();
  const membershipSnapshot = await db
    .doc(`users/${params.uid}/orgMemberships/${params.orgId}`)
    .get();

  if (!membershipSnapshot.exists) {
    throw new HttpsError("permission-denied", "Organization membership was not found.");
  }

  const membership = membershipSnapshot.data() ?? {};
  const role = membershipRole(membership);
  const personId = text(membership.personId);

  if (!role || !personId || !membershipIsActive(membership, Date.now())) {
    throw new HttpsError("permission-denied", "An active staff membership is required.");
  }

  const specialReportingAccess = getSpecialStaffReportingAccess({
    orgId: params.orgId,
    personId,
    uid: params.uid,
  });
  const isOrgWideAdministrator = hasOrgWideAccess([role]);
  if (!isOrgWideAdministrator && !specialReportingAccess) {
    throw new HttpsError("permission-denied", "Organization-wide reports access is required.");
  }

  const schoolDocuments = isOrgWideAdministrator
    ? (await db.collection(`orgs/${params.orgId}/schools`).get()).docs
    : await db.getAll(
        ...specialReportingAccess!.schoolIds.map((schoolId) =>
          db.doc(`orgs/${params.orgId}/schools/${schoolId}`),
        ),
      );
  const schools = schoolDocuments
    .filter((document) => {
      const school: Row = document.data() ?? {};
      return (
        document.exists &&
        school.isArchived !== true &&
        school.archived !== true &&
        statusOf(school) !== "ARCHIVED"
      );
    })
    .map((document) => {
      const school: Row = document.data() ?? {};
      return {
        id: document.id,
        name: text(school.name) || text(school.nameAr) || document.id,
      };
    })
    .sort((left, right) => left.name.localeCompare(right.name, "ar"));

  if (!schools.length) {
    throw new HttpsError("permission-denied", "No active school scope is available.");
  }

  return { personId, schoolIds: schools.map((school) => school.id), schools };
}

async function rowsForSchools(params: {
  orgId: string;
  collectionName: string;
  schoolIds: string[];
}): Promise<RowWithId[]> {
  const db = getFirestore();
  const snapshots = await Promise.all(
    params.schoolIds.map((schoolId) =>
      db
        .collection(`orgs/${params.orgId}/${params.collectionName}`)
        .where("schoolId", "==", schoolId)
        .get(),
    ),
  );
  const byId = new Map<string, RowWithId>();
  for (const snapshot of snapshots) {
    for (const document of snapshot.docs) {
      byId.set(document.id, asRowWithId(document.id, document.data()));
    }
  }
  return Array.from(byId.values());
}

async function rowsForPlanIds(params: {
  orgId: string;
  collectionName: string;
  planIds: string[];
}): Promise<RowWithId[]> {
  if (!params.planIds.length) return [];
  const db = getFirestore();
  const snapshots = await Promise.all(
    chunk(params.planIds, IN_QUERY_CHUNK_SIZE).map((planIds) =>
      db
        .collection(`orgs/${params.orgId}/${params.collectionName}`)
        .where("planId", "in", planIds)
        .get(),
    ),
  );
  const byId = new Map<string, RowWithId>();
  for (const snapshot of snapshots) {
    for (const document of snapshot.docs) {
      byId.set(document.id, asRowWithId(document.id, document.data()));
    }
  }
  return Array.from(byId.values());
}

async function rowsForPersonField(params: {
  orgId: string;
  collectionName: string;
  field: string;
  personId: string;
}): Promise<RowWithId[]> {
  const snapshot = await getFirestore()
    .collection(`orgs/${params.orgId}/${params.collectionName}`)
    .where(params.field, "==", params.personId)
    .get();
  return snapshot.docs.map((document) =>
    asRowWithId(document.id, document.data()),
  );
}

async function rowsByIds(params: {
  orgId: string;
  collectionName: string;
  ids: string[];
}): Promise<RowWithId[]> {
  if (!params.ids.length) return [];
  const db = getFirestore();
  const snapshots = await Promise.all(
    chunk(unique(params.ids), 200).map((ids) =>
      db.getAll(
        ...ids.map((id) => db.doc(`orgs/${params.orgId}/${params.collectionName}/${id}`)),
      ),
    ),
  );
  return snapshots
    .flat()
    .filter((document) => document.exists)
    .map((document) => asRowWithId(document.id, document.data() ?? {}));
}

function planMatchesContext(params: {
  plan: RowWithId;
  input: EvaluationReportRequest;
  schoolIds: Set<string>;
}): boolean {
  const { plan, input, schoolIds } = params;
  const schoolId = text(plan.schoolId);
  return (
    schoolIds.has(schoolId) &&
    isReportablePlan(plan) &&
    (!input.schoolId || schoolId === input.schoolId) &&
    (!input.academicYearId || text(plan.academicYearId) === input.academicYearId) &&
    (!input.termId || text(plan.termId) === input.termId)
  );
}

function buildPlanInfo(params: {
  plan: RowWithId;
  framework: RowWithId | undefined;
  schoolName: string;
}): PlanInfo {
  const frameworkKind = text(params.framework?.frameworkKind) || text(params.plan.frameworkKind);
  const planKind = text(params.plan.planKind) || text(params.plan.frequencyType);
  const evaluationType = planKind || frameworkKind || text(params.plan.targetKind) || "OTHER";
  const frameworkTitle = text(params.framework?.title) || text(params.plan.frameworkTitle);
  return {
    id: params.plan.id,
    title: text(params.plan.title) || text(params.plan.shortTitle) || params.plan.id,
    schoolId: text(params.plan.schoolId),
    schoolName: params.schoolName,
    academicYearId: text(params.plan.academicYearId),
    termId: text(params.plan.termId),
    frameworkId: text(params.plan.frameworkId),
    frameworkTitle,
    frameworkKind,
    planKind,
    targetKind: text(params.plan.targetKind),
    status: statusOf(params.plan) || "ACTIVE",
    evaluationType,
    evaluationTypeLabel: frameworkTitle
      ? `${frameworkTitle}${planKind ? ` — ${planKind}` : ""}`
      : evaluationType,
    row: params.plan,
  };
}

function latestByKey(rows: RowWithId[], keyFor: (row: RowWithId) => string) {
  const values = new Map<string, RowWithId>();
  for (const item of rows) {
    const key = keyFor(item);
    if (!key) continue;
    const current = values.get(key);
    if (!current || activityAt(item) > activityAt(current)) values.set(key, item);
  }
  return values;
}

function summaryForRecord(params: {
  summaries: RowWithId[];
  planId: string;
  cycleId: string;
  targetPersonId: string;
}): RowWithId | undefined {
  return params.summaries
    .filter(
      (summary) =>
        text(summary.planId) === params.planId &&
        text(summary.cycleId) === params.cycleId &&
        targetId(summary) === params.targetPersonId,
    )
    .sort((left, right) => activityAt(right) - activityAt(left))[0];
}

function resolveCycleRecord(params: {
  plan: PlanInfo;
  cycle: RowWithId;
  target: RowWithId;
  person: RowWithId | undefined;
  evaluatorAssignments: RowWithId[];
  submissions: RowWithId[];
  summaries: RowWithId[];
}): CycleRecord {
  const { plan, cycle, target, person } = params;
  const personId = targetId(target);
  const assignments = params.evaluatorAssignments.filter(
    (assignment) =>
      text(assignment.planId) === plan.id &&
      text(assignment.cycleId) === cycle.id &&
      targetId(assignment) === personId &&
      isActiveAssignment(assignment),
  );
  const submissions = params.submissions.filter(
    (submission) =>
      text(submission.planId) === plan.id &&
      text(submission.cycleId) === cycle.id &&
      targetId(submission) === personId,
  );
  const summary = summaryForRecord({
    summaries: params.summaries,
    planId: plan.id,
    cycleId: cycle.id,
    targetPersonId: personId,
  });

  const cycleIncluded = bool(cycle.isIncludedInAverage) !== false;
  const summaryStatus = summary ? normalizedStatus(statusOf(summary)) : undefined;
  const summaryCompleted = summaryStatus ? isCompletedStatus(summaryStatus) : false;

  let status: EvaluationReportStatusFilter = summaryStatus ?? "PENDING";
  let completed = summaryCompleted;
  let finalScore = summaryCompleted
    ? clampPercentage(numberValue(summary?.finalScore))
    : undefined;
  let submittedAt = numberValue(summary?.submittedAt);
  let approvedAt = numberValue(summary?.approvedAt);
  let updatedAt = summary ? activityAt(summary) : undefined;

  if (!summary) {
    const latestSubmissions = latestByKey(
      submissions,
      (submission) => text(submission.evaluatorPersonId) || submission.id,
    );
    const submissionsByEvaluator = latestSubmissions;
    const assignmentByEvaluator = latestByKey(
      assignments,
      (assignment) => text(assignment.evaluatorPersonId),
    );
    const expectedAssignments = Array.from(assignmentByEvaluator.values());
    const allSubmissions = Array.from(latestSubmissions.values());

    if (expectedAssignments.length > 0) {
      const normalizedAssignments = normalizeEvaluatorWeights(expectedAssignments);
      const completedRows = normalizedAssignments.flatMap(({ assignment }) => {
        const evaluatorId = text(assignment.evaluatorPersonId);
        const submission = submissionsByEvaluator.get(evaluatorId);
        return submission && isCompletedStatus(statusOf(submission))
          ? [{ assignment, submission }]
          : [];
      });

      completed = completedRows.length === expectedAssignments.length;
      if (completed) {
        const scoreByAssignment = new Map(
          completedRows.map(({ assignment, submission }) => [
            assignment.id,
            scoreFromSubmission(submission),
          ]),
        );
        const weighted = normalizeEvaluatorWeights(expectedAssignments)
          .map(({ assignment, effectiveWeight }) => {
            const score = scoreByAssignment.get(assignment.id);
            return score === undefined ? undefined : score * effectiveWeight;
          })
          .filter((value): value is number => value !== undefined);
        finalScore = weighted.length === expectedAssignments.length
          ? clampPercentage(weighted.reduce((sum, value) => sum + value, 0))
          : undefined;
        status = allSubmissions.some((submission) => statusOf(submission) === "LOCKED")
          ? "LOCKED"
          : "APPROVED";
      } else {
        const incomplete = allSubmissions.filter(
          (submission) => !isCompletedStatus(statusOf(submission)),
        );
        status = incomplete.length
          ? chooseIncompleteStatus(incomplete)
          : allSubmissions.length
            ? "SUBMITTED"
            : "PENDING";
      }
    } else if (allSubmissions.length > 0) {
      const latestSubmission = [...allSubmissions].sort(
        (left, right) => activityAt(right) - activityAt(left),
      )[0];
      const latestStatus = normalizedStatus(statusOf(latestSubmission));
      completed = isCompletedStatus(latestStatus);
      status = latestStatus;
      finalScore = completed ? scoreFromSubmission(latestSubmission) : undefined;
    }

    const submissionTimes = allSubmissions.map(activityAt);
    updatedAt = submissionTimes.length ? Math.max(...submissionTimes) : undefined;
    const latestCompleted = allSubmissions
      .filter((submission) => isCompletedStatus(statusOf(submission)))
      .sort((left, right) => activityAt(right) - activityAt(left))[0];
    submittedAt = numberValue(latestCompleted?.submittedAt);
    approvedAt = numberValue(latestCompleted?.approvedAt);
  }

  return {
    targetPersonId: personId,
    displayName:
      displayName(person, "") ||
      text(target.targetDisplayName) ||
      text(target.targetName) ||
      personId,
    email: text(person?.email) || text(target.targetEmail),
    roleKey:
      text(target.targetRoleKey) ||
      text(plan.row.targetRoleKey) ||
      text(person?.roleKey) ||
      text(person?.role),
    plan,
    cycle,
    cycleTitle: cycleTitle(cycle),
    cycleNumber: cycleNumber(cycle),
    cycleKind: text(cycle.cycleKind) || text(cycle.cycleType),
    cycleStatus: statusOf(cycle) || "OPEN",
    status,
    completed,
    includedInAverage:
      completed &&
      cycleIncluded &&
      (summary ? bool(summary.includedInAverage) !== false : true),
    finalScore,
    submittedAt,
    approvedAt,
    updatedAt,
    evaluatorAssignments: assignments,
  };
}

function recordMatchesFilters(record: CycleRecord, input: EvaluationReportRequest): boolean {
  return (
    (!input.targetRoleKey || record.roleKey === input.targetRoleKey) &&
    (!input.targetPersonId || record.targetPersonId === input.targetPersonId) &&
    (!input.evaluationType || record.plan.evaluationType === input.evaluationType) &&
    (!input.status || record.status === input.status)
  );
}

function optionRows(items: Array<{ id: string; label: string }>): EvaluationReportOption[] {
  const options = new Map<string, string>();
  for (const item of items) {
    if (item.id && !options.has(item.id)) options.set(item.id, item.label || item.id);
  }
  return Array.from(options, ([id, label]) => ({ id, label })).sort((left, right) =>
    left.label.localeCompare(right.label, "ar"),
  );
}

function filterOptions(params: {
  actor: ReportActor;
  contextPlans: PlanInfo[];
  records: CycleRecord[];
}): EvaluationReportFilterOptions {
  return {
    schools: params.actor.schools.map((school) => ({ id: school.id, label: school.name })),
    academicYears: optionRows(
      params.contextPlans.map((plan) => ({
        id: plan.academicYearId,
        label: plan.academicYearId,
      })),
    ),
    terms: optionRows(
      params.contextPlans.map((plan) => ({ id: plan.termId, label: plan.termId })),
    ),
    roles: optionRows(
      params.records.map((record) => ({ id: record.roleKey, label: record.roleKey })),
    ),
    people: optionRows(
      Array.from(
        new Map(
          params.records.map((record) => [
            record.targetPersonId,
            { id: record.targetPersonId, label: record.displayName },
          ]),
        ).values(),
      ),
    ),
    evaluationTypes: optionRows(
      params.contextPlans.map((plan) => ({
        id: plan.evaluationType,
        label: plan.evaluationTypeLabel,
      })),
    ),
    statuses: optionRows(
      unique(params.records.map((record) => record.status)).map((status) => ({
        id: status,
        label: status,
      })),
    ),
  };
}

function employeeRows(records: CycleRecord[]): EvaluationReportEmployee[] {
  const grouped = new Map<string, CycleRecord[]>();
  for (const record of records) {
    const rows = grouped.get(record.targetPersonId) ?? [];
    rows.push(record);
    grouped.set(record.targetPersonId, rows);
  }

  return Array.from(grouped, ([targetPersonId, rows]) => {
    const completedRows = rows.filter((row) => row.completed);
    const includedScores = completedRows.flatMap((row) =>
      row.includedInAverage && row.finalScore !== undefined ? [row.finalScore] : [],
    );
    const latestCompleted = [...completedRows].sort(
      (left, right) => (right.approvedAt ?? right.updatedAt ?? 0) - (left.approvedAt ?? left.updatedAt ?? 0),
    )[0];
    const incomplete = rows.filter((row) => !row.completed);
    const aggregateStatus: EvaluationReportStatusFilter = incomplete.length
      ? chooseIncompleteStatus(
          incomplete.map((row) =>
            asRowWithId(row.cycle.id, { status: row.status }),
          ),
        )
      : completedRows.some((row) => row.status === "LOCKED")
        ? "LOCKED"
        : completedRows.length
          ? "APPROVED"
          : "PENDING";
    const latestActivity = Math.max(0, ...rows.map((row) => row.updatedAt ?? 0));
    const approvedAverageScore = average(includedScores);
    return {
      targetPersonId,
      displayName: rows[0]?.displayName || targetPersonId,
      ...(rows[0]?.email ? { email: rows[0].email } : {}),
      roleKeys: unique(rows.map((row) => row.roleKey)),
      schoolIds: unique(rows.map((row) => row.plan.schoolId)),
      schoolNames: unique(rows.map((row) => row.plan.schoolName)),
      planCount: new Set(rows.map((row) => row.plan.id)).size,
      totalCycles: rows.length,
      completedCycles: completedRows.length,
      remainingCycles: rows.length - completedRows.length,
      ...(approvedAverageScore !== undefined
        ? { approvedAverageScore }
        : {}),
      ...(latestCompleted?.finalScore !== undefined
        ? { lastScore: latestCompleted.finalScore }
        : {}),
      status: aggregateStatus,
      ...(latestActivity > 0 ? { latestActivityAt: latestActivity } : {}),
    };
  }).sort((left, right) => left.displayName.localeCompare(right.displayName, "ar"));
}

function schoolRows(records: CycleRecord[]): EvaluationReportSchool[] {
  const grouped = new Map<string, CycleRecord[]>();
  for (const record of records) {
    const rows = grouped.get(record.plan.schoolId) ?? [];
    rows.push(record);
    grouped.set(record.plan.schoolId, rows);
  }
  return Array.from(grouped, ([schoolId, rows]) => {
    const completedRows = rows.filter((row) => row.completed);
    const scores = completedRows.flatMap((row) =>
      row.includedInAverage && row.finalScore !== undefined ? [row.finalScore] : [],
    );
    const totalCycles = rows.length;
    const approvedAverageScore = average(scores);
    return {
      schoolId,
      schoolName: rows[0]?.plan.schoolName || schoolId,
      employeesCount: new Set(rows.map((row) => row.targetPersonId)).size,
      plansCount: new Set(rows.map((row) => row.plan.id)).size,
      totalCycles,
      completedCycles: completedRows.length,
      remainingCycles: totalCycles - completedRows.length,
      ...(approvedAverageScore !== undefined ? { approvedAverageScore } : {}),
      ...(totalCycles > 0
        ? { completionPercentage: round2((completedRows.length / totalCycles) * 100) }
        : {}),
    };
  }).sort((left, right) => left.schoolName.localeCompare(right.schoolName, "ar"));
}

function reportKpis(records: CycleRecord[], employees: EvaluationReportEmployee[]): EvaluationReportKpis {
  const completed = records.filter((record) => record.completed);
  const includedScores = completed.flatMap((record) =>
    record.includedInAverage && record.finalScore !== undefined ? [record.finalScore] : [],
  );
  const totalCycles = records.length;
  const approvedAverageScore = average(includedScores);
  return {
    employeesCount: employees.length,
    ...(approvedAverageScore !== undefined
      ? { approvedAverageScore }
      : {}),
    plansCount: new Set(records.map((record) => record.plan.id)).size,
    totalCycles,
    completedCycles: completed.length,
    remainingCycles: totalCycles - completed.length,
  };
}

async function loadDataset(params: {
  actor: ReportActor;
  input: EvaluationReportRequest;
  onlyTargetPersonId?: string;
  includeEvaluatorPeople?: boolean;
}): Promise<ReportDataset> {
  const { actor, input, onlyTargetPersonId = "" } = params;
  const allowedSchoolIds = new Set(actor.schoolIds);
  if (input.schoolId && !allowedSchoolIds.has(input.schoolId)) {
    throw new HttpsError("permission-denied", "The selected school is outside your scope.");
  }

  const rawPlans = await rowsForSchools({
    orgId: input.orgId,
    collectionName: "evaluationPlans",
    schoolIds: input.schoolId ? [input.schoolId] : actor.schoolIds,
  });
  const scopedPlans = rawPlans.filter((plan) =>
    planMatchesContext({ plan, input, schoolIds: allowedSchoolIds }),
  );
  const frameworkRows = await rowsByIds({
    orgId: input.orgId,
    collectionName: "evaluationFrameworks",
    ids: unique(scopedPlans.map((plan) => text(plan.frameworkId))),
  });
  const frameworks = new Map(frameworkRows.map((framework) => [framework.id, framework]));
  const schoolNames = new Map(actor.schools.map((school) => [school.id, school.name]));
  const contextPlans = scopedPlans.map((plan) =>
    buildPlanInfo({
      plan,
      framework: frameworks.get(text(plan.frameworkId)),
      schoolName: schoolNames.get(text(plan.schoolId)) || text(plan.schoolId),
    }),
  );
  const planIds = contextPlans.map((plan) => plan.id);
  if (!planIds.length) return { contextPlans, records: [], people: new Map() };

  const [cycles, targetAssignments, evaluatorAssignments, submissions, summaries] = onlyTargetPersonId
    ? await Promise.all([
        rowsForPlanIds({ orgId: input.orgId, collectionName: "evaluationCycles", planIds }),
        Promise.all([
          rowsForPersonField({
            orgId: input.orgId,
            collectionName: "evaluationTargetAssignments",
            field: "targetPersonId",
            personId: onlyTargetPersonId,
          }),
          rowsForPersonField({
            orgId: input.orgId,
            collectionName: "evaluationTargetAssignments",
            field: "targetTeacherPersonId",
            personId: onlyTargetPersonId,
          }),
        ]).then((sets) => Array.from(new Map(sets.flat().map((item) => [item.id, item])).values())),
        Promise.all([
          rowsForPersonField({
            orgId: input.orgId,
            collectionName: "evaluationEvaluatorAssignments",
            field: "targetPersonId",
            personId: onlyTargetPersonId,
          }),
          rowsForPersonField({
            orgId: input.orgId,
            collectionName: "evaluationEvaluatorAssignments",
            field: "targetTeacherPersonId",
            personId: onlyTargetPersonId,
          }),
        ]).then((sets) => Array.from(new Map(sets.flat().map((item) => [item.id, item])).values())),
        Promise.all([
          rowsForPersonField({
            orgId: input.orgId,
            collectionName: "evaluationSubmissions",
            field: "targetPersonId",
            personId: onlyTargetPersonId,
          }),
          rowsForPersonField({
            orgId: input.orgId,
            collectionName: "evaluationSubmissions",
            field: "targetTeacherPersonId",
            personId: onlyTargetPersonId,
          }),
        ]).then((sets) => Array.from(new Map(sets.flat().map((item) => [item.id, item])).values())),
        Promise.all([
          rowsForPersonField({
            orgId: input.orgId,
            collectionName: "evaluationCycleTargetSummaries",
            field: "targetPersonId",
            personId: onlyTargetPersonId,
          }),
          rowsForPersonField({
            orgId: input.orgId,
            collectionName: "evaluationCycleTargetSummaries",
            field: "targetTeacherPersonId",
            personId: onlyTargetPersonId,
          }),
        ]).then((sets) => Array.from(new Map(sets.flat().map((item) => [item.id, item])).values())),
      ])
    : await Promise.all([
        rowsForPlanIds({ orgId: input.orgId, collectionName: "evaluationCycles", planIds }),
        rowsForPlanIds({ orgId: input.orgId, collectionName: "evaluationTargetAssignments", planIds }),
        rowsForPlanIds({ orgId: input.orgId, collectionName: "evaluationEvaluatorAssignments", planIds }),
        rowsForPlanIds({ orgId: input.orgId, collectionName: "evaluationSubmissions", planIds }),
        rowsForPlanIds({ orgId: input.orgId, collectionName: "evaluationCycleTargetSummaries", planIds }),
      ]);

  const planIdSet = new Set(planIds);
  const filteredTargets = targetAssignments.filter(
    (target) =>
      planIdSet.has(text(target.planId)) &&
      isActiveAssignment(target) &&
      (!onlyTargetPersonId || targetId(target) === onlyTargetPersonId),
  );
  const targetPersonIds = unique(filteredTargets.map(targetId));
  const evaluatorPersonIds = params.includeEvaluatorPeople
    ? unique(evaluatorAssignments.map((assignment) => text(assignment.evaluatorPersonId)))
    : [];
  const peopleRows = await rowsByIds({
    orgId: input.orgId,
    collectionName: "people",
    ids: unique([...targetPersonIds, ...evaluatorPersonIds]),
  });
  const people = new Map(peopleRows.map((person) => [person.id, person]));
  const cyclesByPlan = new Map<string, RowWithId[]>();
  for (const cycle of cycles) {
    const planId = text(cycle.planId);
    if (!planIdSet.has(planId) || !isRelevantCycle(cycle)) continue;
    const rows = cyclesByPlan.get(planId) ?? [];
    rows.push(cycle);
    cyclesByPlan.set(planId, rows);
  }

  const plansById = new Map(contextPlans.map((plan) => [plan.id, plan]));
  const deduplicatedTargets = latestByKey(
    filteredTargets,
    (target) => `${text(target.planId)}:${targetId(target)}`,
  );
  const records: CycleRecord[] = [];
  for (const target of deduplicatedTargets.values()) {
    const plan = plansById.get(text(target.planId));
    if (!plan) continue;
    const targetPersonId = targetId(target);
    const targetPerson = people.get(targetPersonId);
    for (const cycle of cyclesByPlan.get(plan.id) ?? []) {
      records.push(
        resolveCycleRecord({
          plan,
          cycle,
          target,
          person: targetPerson,
          evaluatorAssignments,
          submissions,
          summaries,
        }),
      );
    }
  }

  return { contextPlans, records, people };
}

async function overview(params: {
  uid: string;
  input: EvaluationReportRequest;
}): Promise<EvaluationReportOverview> {
  const actor = await resolveActor({ uid: params.uid, orgId: params.input.orgId });
  const dataset = await loadDataset({ actor, input: params.input });
  const records = dataset.records.filter((record) => recordMatchesFilters(record, params.input));
  const employees = employeeRows(records);
  return {
    filters: filterOptions({ actor, contextPlans: dataset.contextPlans, records: dataset.records }),
    kpis: reportKpis(records, employees),
    employees,
    schools: schoolRows(records),
  };
}

function detailPlans(params: {
  records: CycleRecord[];
  people: Map<string, RowWithId>;
}): EvaluationReportPersonPlan[] {
  const grouped = new Map<string, CycleRecord[]>();
  for (const record of params.records) {
    const rows = grouped.get(record.plan.id) ?? [];
    rows.push(record);
    grouped.set(record.plan.id, rows);
  }
  return Array.from(grouped.values())
    .map((rows) => {
      const first = rows[0];
      const completed = rows.filter((row) => row.completed);
      const scores = completed.flatMap((row) =>
        row.includedInAverage && row.finalScore !== undefined ? [row.finalScore] : [],
      );
      const cycles: EvaluationReportPersonCycle[] = rows
        .sort((left, right) =>
          (left.cycleNumber ?? Number.MAX_SAFE_INTEGER) -
            (right.cycleNumber ?? Number.MAX_SAFE_INTEGER) ||
          left.cycleTitle.localeCompare(right.cycleTitle, "ar"),
        )
        .map((record) => ({
          cycleId: record.cycle.id,
          cycleTitle: record.cycleTitle,
          ...(record.cycleNumber !== undefined ? { cycleNumber: record.cycleNumber } : {}),
          ...(record.cycleKind ? { cycleKind: record.cycleKind } : {}),
          cycleStatus: record.cycleStatus,
          status: record.status,
          evaluators: record.evaluatorAssignments.map((assignment) => {
            const personId = text(assignment.evaluatorPersonId);
            const evaluator = params.people.get(personId);
            const weight = numberValue(assignment.weight);
            return {
              personId,
              displayName:
                displayName(evaluator, "") ||
                text(assignment.evaluatorDisplayName) ||
                personId,
              ...(text(evaluator?.email) || text(assignment.evaluatorEmail)
                ? { email: text(evaluator?.email) || text(assignment.evaluatorEmail) }
                : {}),
              ...(text(assignment.evaluatorRoleKey)
                ? { roleKey: text(assignment.evaluatorRoleKey) }
                : {}),
              ...(weight !== undefined ? { weight } : {}),
            };
          }),
          ...(record.finalScore !== undefined ? { finalScore: record.finalScore } : {}),
          includedInAverage: record.includedInAverage,
          ...(record.submittedAt !== undefined ? { submittedAt: record.submittedAt } : {}),
          ...(record.approvedAt !== undefined ? { approvedAt: record.approvedAt } : {}),
          ...(record.updatedAt !== undefined ? { updatedAt: record.updatedAt } : {}),
        }));
      const approvedAverageScore = average(scores);
      return {
        planId: first.plan.id,
        planTitle: first.plan.title,
        schoolId: first.plan.schoolId,
        schoolName: first.plan.schoolName,
        ...(first.plan.frameworkId ? { frameworkId: first.plan.frameworkId } : {}),
        ...(first.plan.frameworkTitle ? { frameworkTitle: first.plan.frameworkTitle } : {}),
        ...(first.plan.frameworkKind ? { frameworkKind: first.plan.frameworkKind } : {}),
        ...(first.plan.planKind ? { planKind: first.plan.planKind } : {}),
        ...(first.roleKey ? { targetRoleKey: first.roleKey } : {}),
        planStatus: first.plan.status,
        totalCycles: rows.length,
        completedCycles: completed.length,
        remainingCycles: rows.length - completed.length,
        ...(approvedAverageScore !== undefined ? { approvedAverageScore } : {}),
        cycles,
      };
    })
    .sort((left, right) =>
      left.schoolName.localeCompare(right.schoolName, "ar") ||
      left.planTitle.localeCompare(right.planTitle, "ar"),
    );
}

async function personDetail(params: {
  uid: string;
  input: EvaluationReportRequest;
  targetPersonId: string;
}): Promise<EvaluationReportPersonDetail> {
  const actor = await resolveActor({ uid: params.uid, orgId: params.input.orgId });
  const dataset = await loadDataset({
    actor,
    input: { ...params.input, targetPersonId: params.targetPersonId },
    onlyTargetPersonId: params.targetPersonId,
    includeEvaluatorPeople: true,
  });
  const records = dataset.records.filter((record) =>
    recordMatchesFilters(record, { ...params.input, targetPersonId: params.targetPersonId }),
  );
  const employee = employeeRows(records)[0];
  if (!employee) {
    throw new HttpsError("not-found", "Employee evaluation data was not found in scope.");
  }
  const scores = records.flatMap((record) =>
    record.completed && record.includedInAverage && record.finalScore !== undefined
      ? [record.finalScore]
      : [],
  );
  const overallApprovedAverageScore = average(scores);
  return {
    employee,
    ...(overallApprovedAverageScore !== undefined
      ? { overallApprovedAverageScore }
      : {}),
    plans: detailPlans({ records, people: dataset.people }),
  };
}

export const getEvaluationReportOverview = onCall(
  { region: REGION, cors: true, invoker: "public", memory: "1GiB" },
  async (request): Promise<EvaluationReportOverview> => {
    if (!request.auth?.uid) {
      throw new HttpsError("unauthenticated", "Authentication is required.");
    }
    return overview({ uid: request.auth.uid, input: parseRequest(request.data) });
  },
);

export const getEvaluationReportPersonDetail = onCall(
  { region: REGION, cors: true, invoker: "public", memory: "1GiB" },
  async (request): Promise<EvaluationReportPersonDetail> => {
    if (!request.auth?.uid) {
      throw new HttpsError("unauthenticated", "Authentication is required.");
    }
    const input = parseRequest(request.data);
    const targetPersonId = requireSafeId(text((request.data as Row).targetPersonId), "targetPersonId");
    return personDetail({ uid: request.auth.uid, input, targetPersonId });
  },
);
