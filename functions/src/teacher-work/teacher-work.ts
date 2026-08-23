import { getFirestore } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import {
  MembershipRole,
  type MembershipRole as MembershipRoleType,
} from "@takween/contracts";
import { canReviewStaffPortfolio } from "@takween/domain";

const REGION = "me-central2";
const TEACHER_WORK_COLLECTIONS = [
  "studentMeasurementBatches",
  "studentLearningLossPlans",
  "studentNotes",
  "studentGamificationEvents",
  "studentHomeworkAssignments",
  "subjectLessonPreps",
] as const;

type Row = Record<string, unknown>;
type TeacherWorkPeriod = "WEEK" | "MONTH" | "ALL";
type TeacherWorkMetricKey =
  | "measurements"
  | "learningLoss"
  | "notes"
  | "gamification"
  | "homework"
  | "lessonPrep";

type TeacherWorkMetric = {
  count: number;
  latestActivityAt: number | null;
  uniqueStudents?: number;
  submittedCount?: number;
  activeCount?: number;
  closedCount?: number;
  draftCount?: number;
  publishedCount?: number;
  approvedCount?: number;
  returnedCount?: number;
  classLabels: string[];
  subjectLabels: string[];
};

type TeacherWorkSummary = {
  teacherPersonId: string;
  displayName: string;
  schoolIds: string[];
  schoolNames: string[];
  classLabels: string[];
  subjectLabels: string[];
  metrics: Record<TeacherWorkMetricKey, TeacherWorkMetric>;
};

type TeacherWorkResponse = {
  academicYearId: string;
  period: TeacherWorkPeriod;
  teachers: TeacherWorkSummary[];
};

type MetricAccumulator = TeacherWorkMetric & {
  studentIds: Set<string>;
};

type TeacherWorkActor = {
  personId: string;
  schoolIds: string[];
  schools: Array<{ id: string; name: string }>;
};

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function numberValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function row(value: unknown): Row {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Row)
    : {};
}

function unique(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function requireId(value: unknown, fieldName: string) {
  const result = text(value);
  if (!result || result.includes("/")) {
    throw new HttpsError("invalid-argument", `${fieldName} is required.`);
  }
  return result;
}

function optionalId(value: unknown, fieldName: string) {
  if (value === undefined || value === null || value === "") return "";
  return requireId(value, fieldName);
}

function readStringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && !!item.trim())
    : [];
}

function membershipRole(membership: Row): MembershipRoleType | null {
  const parsed = MembershipRole.safeParse(
    text(membership.roleKey) || text(membership.role),
  );
  return parsed.success ? parsed.data : null;
}

function membershipIsActive(membership: Row, now: number) {
  if (membership.isActive === false || membership.active === false) return false;

  const startAt = numberValue(membership.startAt);
  const endAt = numberValue(membership.endAt);
  return !(startAt !== null && startAt > now) && !(endAt !== null && endAt < now);
}

function schoolIdsOf(membership: Row) {
  const scopes = row(membership.scopes);
  const schoolIds = readStringArray(scopes.schoolIds);
  const scopeType = text(membership.scopeType);
  const scopeId = text(membership.scopeId);

  if (scopeType === "SCHOOL" && scopeId) schoolIds.push(scopeId);
  return unique(schoolIds);
}

function hasAllSchoolsAccess(membership: Row, role: MembershipRoleType) {
  const scopes = row(membership.scopes);
  return (
    ["platform_owner", "platform_admin", "org_owner", "org_admin"].includes(role) ||
    scopes.canAccessAllSchools === true ||
    text(membership.scopeType) === "ORG"
  );
}

function getPeriod(value: unknown): TeacherWorkPeriod {
  if (value === "WEEK" || value === "MONTH" || value === "ALL") return value;
  return "ALL";
}

function periodStart(period: TeacherWorkPeriod) {
  if (period === "ALL") return null;

  const now = new Date();
  if (period === "WEEK") {
    const start = new Date(now);
    start.setDate(now.getDate() - 6);
    start.setHours(0, 0, 0, 0);
    return start.getTime();
  }

  return new Date(now.getFullYear(), now.getMonth(), 1).getTime();
}

function isInPeriod(activityAt: number | null, startAt: number | null) {
  return startAt === null || (activityAt !== null && activityAt >= startAt);
}

function latest(...values: Array<number | null>) {
  const available = values.filter((value): value is number => value !== null);
  return available.length ? Math.max(...available) : null;
}

function rowActivity(rowData: Row, fields: string[]) {
  return latest(...fields.map((field) => numberValue(rowData[field])));
}

function emptyMetric(): MetricAccumulator {
  return {
    count: 0,
    latestActivityAt: null,
    classLabels: [],
    subjectLabels: [],
    studentIds: new Set<string>(),
  };
}

function emptyMetrics(): Record<TeacherWorkMetricKey, MetricAccumulator> {
  return {
    measurements: emptyMetric(),
    learningLoss: emptyMetric(),
    notes: emptyMetric(),
    gamification: emptyMetric(),
    homework: emptyMetric(),
    lessonPrep: emptyMetric(),
  };
}

function metricDto(metric: MetricAccumulator): TeacherWorkMetric {
  const result: TeacherWorkMetric = {
    count: metric.count,
    latestActivityAt: metric.latestActivityAt,
    classLabels: metric.classLabels,
    subjectLabels: metric.subjectLabels,
  };

  if (metric.studentIds.size) result.uniqueStudents = metric.studentIds.size;
  if (metric.submittedCount) result.submittedCount = metric.submittedCount;
  if (metric.activeCount) result.activeCount = metric.activeCount;
  if (metric.closedCount) result.closedCount = metric.closedCount;
  if (metric.draftCount) result.draftCount = metric.draftCount;
  if (metric.publishedCount) result.publishedCount = metric.publishedCount;
  if (metric.approvedCount) result.approvedCount = metric.approvedCount;
  if (metric.returnedCount) result.returnedCount = metric.returnedCount;
  return result;
}

function isActiveAssignment(assignment: Row, now: number, academicYearId: string) {
  if (text(assignment.status) !== "ACTIVE") return false;
  if (academicYearId && text(assignment.academicYearId) !== academicYearId) {
    return false;
  }

  const startAt = numberValue(assignment.startAt);
  const endAt = numberValue(assignment.endAt);
  return (!startAt || startAt <= now) && (!endAt || endAt >= now);
}

async function resolveActor(params: {
  orgId: string;
  uid: string;
}): Promise<TeacherWorkActor> {
  const db = getFirestore();
  const membershipSnapshot = await db
    .doc(`users/${params.uid}/orgMemberships/${params.orgId}`)
    .get();

  if (!membershipSnapshot.exists) {
    throw new HttpsError("permission-denied", "Organization membership was not found.");
  }

  const membership = row(membershipSnapshot.data());
  const role = membershipRole(membership);
  const personId = text(membership.personId);

  if (!role || !personId || !membershipIsActive(membership, Date.now())) {
    throw new HttpsError("permission-denied", "An active staff membership is required.");
  }

  if (!canReviewStaffPortfolio([role])) {
    throw new HttpsError("permission-denied", "Teacher work monitoring access is required.");
  }

  const scopedSchoolIds = schoolIdsOf(membership);
  const schoolSnapshots = hasAllSchoolsAccess(membership, role)
    ? (await db.collection(`orgs/${params.orgId}/schools`).get()).docs
    : await Promise.all(
        scopedSchoolIds.map((schoolId) =>
          db.doc(`orgs/${params.orgId}/schools/${schoolId}`).get(),
        ),
      );

  const schools = schoolSnapshots
    .filter((snapshot) => snapshot.exists)
    .map((snapshot) => ({
      id: snapshot.id,
      name: text(snapshot.data()?.name),
    }));

  if (!schools.length) {
    throw new HttpsError("permission-denied", "No school scope is available.");
  }

  return {
    personId,
    schoolIds: schools.map((school) => school.id),
    schools,
  };
}

async function listRowsForSchools(params: {
  orgId: string;
  collectionName: (typeof TEACHER_WORK_COLLECTIONS)[number] | "teacherAssignments" | "teacherAssignmentClassLinks" | "classSubjectOfferings";
  schoolIds: string[];
}) {
  const db = getFirestore();
  const snapshots = await Promise.all(
    params.schoolIds.map((schoolId) =>
      db
        .collection(`orgs/${params.orgId}/${params.collectionName}`)
        .where("schoolId", "==", schoolId)
        .get(),
    ),
  );

  return snapshots.flatMap((snapshot) =>
    snapshot.docs.map((document) => ({ id: document.id, ...document.data() }) as Row),
  );
}

async function loadTeacherNames(orgId: string, teacherPersonIds: string[]) {
  const db = getFirestore();
  const snapshots = await Promise.all(
    teacherPersonIds.map((personId) =>
      db.doc(`orgs/${orgId}/people/${personId}`).get(),
    ),
  );

  return new Map(
    snapshots.map((snapshot, index) => [
      teacherPersonIds[index] ?? "",
      text(snapshot.data()?.displayName),
    ] as const),
  );
}

async function loadClassLabels(params: {
  orgId: string;
  assignments: Row[];
  links: Row[];
}) {
  const contexts = new Map<string, { schoolId: string; academicYearId: string }>();
  for (const item of [...params.assignments, ...params.links]) {
    const schoolId = text(item.schoolId);
    const academicYearId = text(item.academicYearId);
    if (schoolId && academicYearId) {
      contexts.set(`${schoolId}:${academicYearId}`, { schoolId, academicYearId });
    }
  }

  const db = getFirestore();
  const snapshots = await Promise.all(
    Array.from(contexts.values()).map(({ schoolId, academicYearId }) =>
      db
        .collection(
          `orgs/${params.orgId}/schools/${schoolId}/academicYears/${academicYearId}/classes`,
        )
        .get(),
    ),
  );

  const labels = new Map<string, string>();
  snapshots.forEach((snapshot) => {
    snapshot.docs.forEach((document) => {
      labels.set(document.id, text(document.data().title));
    });
  });
  return labels;
}

function offeringLabel(offering: Row | undefined) {
  return (
    text(offering?.displayName) ||
    text(offering?.subjectTitleSnapshot) ||
    text(offering?.shortLabel)
  );
}

function addMetric(params: {
  metric: MetricAccumulator;
  activityAt: number | null;
  classLabel: string;
  subjectLabel: string;
  studentId?: string;
}) {
  params.metric.count += 1;
  params.metric.latestActivityAt = latest(
    params.metric.latestActivityAt,
    params.activityAt,
  );
  params.metric.classLabels = unique([
    ...params.metric.classLabels,
    params.classLabel,
  ]);
  params.metric.subjectLabels = unique([
    ...params.metric.subjectLabels,
    params.subjectLabel,
  ]);
  if (params.studentId) params.metric.studentIds.add(params.studentId);
}

async function buildTeacherWorkSummaries(params: {
  orgId: string;
  actor: TeacherWorkActor;
  academicYearId: string;
  period: TeacherWorkPeriod;
}): Promise<TeacherWorkSummary[]> {
  const [assignmentRows, linkRows, measurementRows, learningLossRows, noteRows, gamificationRows, homeworkRows, lessonPrepRows, offeringRows] =
    await Promise.all([
      listRowsForSchools({ orgId: params.orgId, schoolIds: params.actor.schoolIds, collectionName: "teacherAssignments" }),
      listRowsForSchools({ orgId: params.orgId, schoolIds: params.actor.schoolIds, collectionName: "teacherAssignmentClassLinks" }),
      listRowsForSchools({ orgId: params.orgId, schoolIds: params.actor.schoolIds, collectionName: "studentMeasurementBatches" }),
      listRowsForSchools({ orgId: params.orgId, schoolIds: params.actor.schoolIds, collectionName: "studentLearningLossPlans" }),
      listRowsForSchools({ orgId: params.orgId, schoolIds: params.actor.schoolIds, collectionName: "studentNotes" }),
      listRowsForSchools({ orgId: params.orgId, schoolIds: params.actor.schoolIds, collectionName: "studentGamificationEvents" }),
      listRowsForSchools({ orgId: params.orgId, schoolIds: params.actor.schoolIds, collectionName: "studentHomeworkAssignments" }),
      listRowsForSchools({ orgId: params.orgId, schoolIds: params.actor.schoolIds, collectionName: "subjectLessonPreps" }),
      listRowsForSchools({ orgId: params.orgId, schoolIds: params.actor.schoolIds, collectionName: "classSubjectOfferings" }),
    ]);

  const now = Date.now();
  const assignments = assignmentRows.filter((assignment) =>
    isActiveAssignment(assignment, now, params.academicYearId),
  );
  const assignmentIds = new Set(assignments.map((assignment) => text(assignment.id)));
  const links = linkRows.filter((link) => assignmentIds.has(text(link.assignmentId)));
  const teacherPersonIds = unique(assignments.map((assignment) => text(assignment.teacherPersonId)));
  const [teacherNames, classLabels] = await Promise.all([
    loadTeacherNames(params.orgId, teacherPersonIds),
    loadClassLabels({ orgId: params.orgId, assignments, links }),
  ]);
  const schoolNameById = new Map(params.actor.schools.map((school) => [school.id, school.name]));
  const offeringById = new Map(offeringRows.map((offering) => [text(offering.id), offering]));
  const periodStartAt = periodStart(params.period);
  const summaries = new Map<string, TeacherWorkSummary & { metrics: Record<TeacherWorkMetricKey, MetricAccumulator> }>();

  for (const teacherPersonId of teacherPersonIds) {
    const teacherAssignments = assignments.filter(
      (assignment) => text(assignment.teacherPersonId) === teacherPersonId,
    );
    const teacherAssignmentIds = new Set(teacherAssignments.map((assignment) => text(assignment.id)));
    const teacherLinks = links.filter((link) => teacherAssignmentIds.has(text(link.assignmentId)));
    const classIds = unique([
      ...teacherAssignments.map((assignment) =>
        text(assignment.targetScopeType) === "CLASS" ? text(assignment.targetScopeId) : "",
      ),
      ...teacherAssignments.map((assignment) =>
        text(offeringById.get(text(assignment.classSubjectOfferingId))?.classId),
      ),
      ...teacherLinks.map((link) => text(link.classId)),
    ]);
    const schoolIds = unique(teacherAssignments.map((assignment) => text(assignment.schoolId)));

    summaries.set(teacherPersonId, {
      teacherPersonId,
      displayName: teacherNames.get(teacherPersonId) || "معلم غير محدد",
      schoolIds,
      schoolNames: schoolIds.map((schoolId) => schoolNameById.get(schoolId) || "").filter(Boolean),
      classLabels: unique(classIds.map((classId) => classLabels.get(classId) || "")),
      subjectLabels: unique(
        teacherAssignments.map((assignment) =>
          offeringLabel(offeringById.get(text(assignment.classSubjectOfferingId))),
        ),
      ),
      metrics: emptyMetrics(),
    });
  }

  const ownerSummary = (personId: string) => summaries.get(personId);
  const isCurrentYear = (rowData: Row) =>
    !params.academicYearId || text(rowData.academicYearId) === params.academicYearId;
  const labelsFor = (rowData: Row) => ({
    classLabel: classLabels.get(text(rowData.classId)) || "",
    subjectLabel: offeringLabel(offeringById.get(text(rowData.classSubjectOfferingId))),
  });

  for (const rowData of measurementRows) {
    if (!isCurrentYear(rowData)) continue;
    const activityAt = rowActivity(rowData, ["measuredAt", "submittedAt", "createdAt"]);
    if (!isInPeriod(activityAt, periodStartAt)) continue;
    const summary = ownerSummary(text(rowData.createdByPersonId));
    if (!summary) continue;
    const labels = labelsFor(rowData);
    addMetric({ metric: summary.metrics.measurements, activityAt, ...labels });
    if (text(rowData.status) === "SUBMITTED") {
      summary.metrics.measurements.submittedCount =
        (summary.metrics.measurements.submittedCount ?? 0) + 1;
    }
  }

  for (const rowData of learningLossRows) {
    if (!isCurrentYear(rowData)) continue;
    const activityAt = rowActivity(rowData, ["createdAt"]);
    if (!isInPeriod(activityAt, periodStartAt)) continue;
    const summary = ownerSummary(text(rowData.createdByPersonId));
    if (!summary) continue;
    addMetric({ metric: summary.metrics.learningLoss, activityAt, ...labelsFor(rowData) });
    if (["ACTIVE", "IN_PROGRESS"].includes(text(rowData.status))) {
      summary.metrics.learningLoss.activeCount =
        (summary.metrics.learningLoss.activeCount ?? 0) + 1;
    }
    if (text(rowData.status) === "CLOSED") {
      summary.metrics.learningLoss.closedCount =
        (summary.metrics.learningLoss.closedCount ?? 0) + 1;
    }
  }

  for (const rowData of noteRows) {
    if (!isCurrentYear(rowData)) continue;
    const activityAt = rowActivity(rowData, ["recordedAt", "createdAt"]);
    if (!isInPeriod(activityAt, periodStartAt)) continue;
    const summary = ownerSummary(text(rowData.recordedByPersonId));
    if (!summary) continue;
    addMetric({
      metric: summary.metrics.notes,
      activityAt,
      ...labelsFor(rowData),
      studentId: text(rowData.studentId),
    });
  }

  for (const rowData of gamificationRows) {
    if (!isCurrentYear(rowData) || text(rowData.sourceType) !== "MANUAL") continue;
    const activityAt = rowActivity(rowData, ["occurredAt", "createdAt"]);
    if (!isInPeriod(activityAt, periodStartAt)) continue;
    const summary = ownerSummary(text(rowData.createdByPersonId));
    if (!summary) continue;
    addMetric({
      metric: summary.metrics.gamification,
      activityAt,
      ...labelsFor(rowData),
      studentId: text(rowData.studentId),
    });
  }

  for (const rowData of homeworkRows) {
    if (!isCurrentYear(rowData)) continue;
    const activityAt = rowActivity(rowData, ["publishedAt", "createdAt"]);
    if (!isInPeriod(activityAt, periodStartAt)) continue;
    const summary = ownerSummary(text(rowData.createdByPersonId));
    if (!summary) continue;
    addMetric({ metric: summary.metrics.homework, activityAt, ...labelsFor(rowData) });
    const status = text(rowData.status);
    if (status === "DRAFT") summary.metrics.homework.draftCount = (summary.metrics.homework.draftCount ?? 0) + 1;
    if (status === "PUBLISHED") summary.metrics.homework.publishedCount = (summary.metrics.homework.publishedCount ?? 0) + 1;
    if (status === "CLOSED") summary.metrics.homework.closedCount = (summary.metrics.homework.closedCount ?? 0) + 1;
  }

  for (const rowData of lessonPrepRows) {
    if (!isCurrentYear(rowData)) continue;
    const activityAt = rowActivity(rowData, ["updatedAt", "submittedAt", "approvedAt", "returnedAt", "createdAt"]);
    if (!isInPeriod(activityAt, periodStartAt)) continue;
    const summary = ownerSummary(text(rowData.teacherPersonId));
    if (!summary) continue;
    addMetric({ metric: summary.metrics.lessonPrep, activityAt, ...labelsFor(rowData) });
    const status = text(rowData.status);
    if (status === "DRAFT") summary.metrics.lessonPrep.draftCount = (summary.metrics.lessonPrep.draftCount ?? 0) + 1;
    if (status === "SUBMITTED") summary.metrics.lessonPrep.submittedCount = (summary.metrics.lessonPrep.submittedCount ?? 0) + 1;
    if (status === "APPROVED") summary.metrics.lessonPrep.approvedCount = (summary.metrics.lessonPrep.approvedCount ?? 0) + 1;
    if (status === "RETURNED") summary.metrics.lessonPrep.returnedCount = (summary.metrics.lessonPrep.returnedCount ?? 0) + 1;
  }

  return Array.from(summaries.values())
    .map(({ metrics, ...summary }) => ({
      ...summary,
      metrics: {
        measurements: metricDto(metrics.measurements),
        learningLoss: metricDto(metrics.learningLoss),
        notes: metricDto(metrics.notes),
        gamification: metricDto(metrics.gamification),
        homework: metricDto(metrics.homework),
        lessonPrep: metricDto(metrics.lessonPrep),
      },
    }))
    .sort((left, right) => left.displayName.localeCompare(right.displayName, "ar"));
}

async function getTeacherWork(params: {
  uid: string;
  input: Row;
}): Promise<TeacherWorkResponse> {
  const orgId = requireId(params.input.orgId, "orgId");
  const academicYearId = optionalId(params.input.academicYearId, "academicYearId");
  const period = getPeriod(params.input.period);
  const actor = await resolveActor({ orgId, uid: params.uid });
  const teachers = await buildTeacherWorkSummaries({
    orgId,
    actor,
    academicYearId,
    period,
  });

  return { academicYearId, period, teachers };
}

export const getTeacherWorkOverview = onCall(
  { region: REGION, cors: true, invoker: "public" },
  async (request): Promise<TeacherWorkResponse> => {
    if (!request.auth?.uid) {
      throw new HttpsError("unauthenticated", "Authentication is required.");
    }

    return getTeacherWork({
      uid: request.auth.uid,
      input: row(request.data),
    });
  },
);

export const getTeacherWorkDetail = onCall(
  { region: REGION, cors: true, invoker: "public" },
  async (request): Promise<{ academicYearId: string; period: TeacherWorkPeriod; teacher: TeacherWorkSummary }> => {
    if (!request.auth?.uid) {
      throw new HttpsError("unauthenticated", "Authentication is required.");
    }

    const input = row(request.data);
    const teacherPersonId = requireId(input.teacherPersonId, "teacherPersonId");
    const result = await getTeacherWork({ uid: request.auth.uid, input });
    const teacher = result.teachers.find(
      (summary) => summary.teacherPersonId === teacherPersonId,
    );

    if (!teacher) {
      throw new HttpsError("not-found", "Teacher is not available in your school scope.");
    }

    return {
      academicYearId: result.academicYearId,
      period: result.period,
      teacher,
    };
  },
);
