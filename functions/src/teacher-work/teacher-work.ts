import { getFirestore } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import {
  MembershipRole,
  PersonSupervisionScopeSchema,
  type MembershipRole as MembershipRoleType,
  type PersonSupervisionScope,
} from "@takween/contracts";
import {
  canReviewStaffPortfolio,
  hasPersonSupervisionSubjectAccess,
} from "@takween/domain";

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

type TeacherWorkLessonPrep = {
  id: string;
  lessonTitle: string;
  subjectLabel: string;
  classLabel: string;
  lessonDate: string;
  status: string;
  unitTitle: string;
  weekLabel: string;
  durationMinutes: string;
  lessonNumber: string;
  objectives: string;
  learningOutcomes: string;
  warmup: string;
  lessonSteps: string;
  strategies: string;
  resources: string;
  assessment: string;
  homeworkNote: string;
  approvalNote: string;
  returnReason: string;
};

type TeacherWorkDrillDownKey = Exclude<TeacherWorkMetricKey, "lessonPrep">;

type TeacherWorkDrillDownItem = {
  id: string;
  title: string;
  status: string;
  activityAt: number | null;
  classLabel: string;
  subjectLabel: string;
};

type TeacherWorkDrillDowns = Record<
  TeacherWorkDrillDownKey,
  TeacherWorkDrillDownItem[]
>;

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
  supervisionScopes: PersonSupervisionScope[];
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

function emptyDrillDowns(): TeacherWorkDrillDowns {
  return {
    measurements: [],
    learningLoss: [],
    notes: [],
    gamification: [],
    homework: [],
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

  const supervisionScopeSnapshot = await db
    .collection(`orgs/${params.orgId}/personSupervisionScopes`)
    .where("personId", "==", personId)
    .get();
  const supervisionScopes = supervisionScopeSnapshot.docs.flatMap((document) => {
    const parsed = PersonSupervisionScopeSchema.safeParse({
      id: document.id,
      ...document.data(),
    });
    return parsed.success ? [parsed.data] : [];
  });

  return {
    personId,
    schoolIds: schools.map((school) => school.id),
    schools,
    supervisionScopes,
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

function subjectKeyFor(rowData: Row, offering?: Row) {
  return text(rowData.subjectKey) || text(offering?.subjectKey);
}

function canViewTeacherWorkSubject(params: {
  actor: TeacherWorkActor;
  orgId: string;
  schoolId: string;
  subjectKey: string;
}) {
  return hasPersonSupervisionSubjectAccess({
    scopes: params.actor.supervisionScopes,
    request: {
      orgId: params.orgId,
      personId: params.actor.personId,
      capability: "TEACHER_WORK_VIEW",
      schoolId: params.schoolId,
      subjectKey: params.subjectKey,
    },
  });
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
  const hasScopeFor = (rowData: Row) => {
    const offering = offeringById.get(text(rowData.classSubjectOfferingId));
    return canViewTeacherWorkSubject({
      actor: params.actor,
      orgId: params.orgId,
      schoolId: text(rowData.schoolId),
      subjectKey: subjectKeyFor(rowData, offering),
    });
  };

  for (const teacherPersonId of teacherPersonIds) {
    const teacherAssignments = assignments.filter(
      (assignment) =>
        text(assignment.teacherPersonId) === teacherPersonId &&
        hasScopeFor(assignment),
    );
    if (!teacherAssignments.length) continue;
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
    if (!hasScopeFor(rowData)) continue;
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
    if (!hasScopeFor(rowData)) continue;
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
    if (!hasScopeFor(rowData)) continue;
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
    if (!hasScopeFor(rowData)) continue;
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
    if (!hasScopeFor(rowData)) continue;
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
    if (!hasScopeFor(rowData)) continue;
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

async function buildTeacherLessonPrepDetails(params: {
  orgId: string;
  actor: TeacherWorkActor;
  academicYearId: string;
  period: TeacherWorkPeriod;
  teacherPersonId: string;
}): Promise<TeacherWorkLessonPrep[]> {
  const [assignmentRows, linkRows, lessonPrepRows, offeringRows] = await Promise.all([
    listRowsForSchools({ orgId: params.orgId, schoolIds: params.actor.schoolIds, collectionName: "teacherAssignments" }),
    listRowsForSchools({ orgId: params.orgId, schoolIds: params.actor.schoolIds, collectionName: "teacherAssignmentClassLinks" }),
    listRowsForSchools({ orgId: params.orgId, schoolIds: params.actor.schoolIds, collectionName: "subjectLessonPreps" }),
    listRowsForSchools({ orgId: params.orgId, schoolIds: params.actor.schoolIds, collectionName: "classSubjectOfferings" }),
  ]);

  const now = Date.now();
  const assignments = assignmentRows.filter(
    (assignment) =>
      text(assignment.teacherPersonId) === params.teacherPersonId &&
      isActiveAssignment(assignment, now, params.academicYearId),
  );
  const assignmentIds = new Set(assignments.map((assignment) => text(assignment.id)));
  const links = linkRows.filter((link) => assignmentIds.has(text(link.assignmentId)));
  const classLabels = await loadClassLabels({
    orgId: params.orgId,
    assignments,
    links,
  });
  const offeringById = new Map(offeringRows.map((offering) => [text(offering.id), offering]));
  const periodStartAt = periodStart(params.period);

  return lessonPrepRows
    .filter((lessonPrep) => {
      if (text(lessonPrep.teacherPersonId) !== params.teacherPersonId) return false;
      if (params.academicYearId && text(lessonPrep.academicYearId) !== params.academicYearId) {
        return false;
      }
      if (
        !canViewTeacherWorkSubject({
          actor: params.actor,
          orgId: params.orgId,
          schoolId: text(lessonPrep.schoolId),
          subjectKey: subjectKeyFor(
            lessonPrep,
            offeringById.get(text(lessonPrep.classSubjectOfferingId)),
          ),
        })
      ) {
        return false;
      }

      return isInPeriod(
        rowActivity(lessonPrep, ["updatedAt", "submittedAt", "approvedAt", "returnedAt", "createdAt"]),
        periodStartAt,
      );
    })
    .map((lessonPrep) => {
      const offering = offeringById.get(text(lessonPrep.classSubjectOfferingId));
      const activityAt = rowActivity(lessonPrep, ["updatedAt", "submittedAt", "approvedAt", "returnedAt", "createdAt"]);

      return {
        activityAt,
        detail: {
          id: text(lessonPrep.id),
          lessonTitle: text(lessonPrep.lessonTitle),
          subjectLabel: offeringLabel(offering) || text(lessonPrep.subjectKey),
          classLabel: classLabels.get(text(lessonPrep.classId)) || text(lessonPrep.classId),
          lessonDate: text(lessonPrep.lessonDate),
          status: text(lessonPrep.status),
          unitTitle: text(lessonPrep.unitTitle),
          weekLabel: text(lessonPrep.weekLabel),
          durationMinutes: text(lessonPrep.durationMinutes),
          lessonNumber: text(lessonPrep.lessonNumber),
          objectives: text(lessonPrep.objectives),
          learningOutcomes: text(lessonPrep.learningOutcomes),
          warmup: text(lessonPrep.warmup),
          lessonSteps: text(lessonPrep.lessonSteps),
          strategies: text(lessonPrep.strategies),
          resources: text(lessonPrep.resources),
          assessment: text(lessonPrep.assessment),
          homeworkNote: text(lessonPrep.homeworkNote),
          approvalNote: text(lessonPrep.approvalNote),
          returnReason: text(lessonPrep.returnReason),
        },
      };
    })
    .sort((left, right) => (right.activityAt ?? 0) - (left.activityAt ?? 0))
    .map(({ detail }) => detail);
}

async function buildTeacherWorkDrillDowns(params: {
  orgId: string;
  actor: TeacherWorkActor;
  academicYearId: string;
  period: TeacherWorkPeriod;
  teacherPersonId: string;
}): Promise<TeacherWorkDrillDowns> {
  const [assignmentRows, linkRows, measurementRows, learningLossRows, noteRows, gamificationRows, homeworkRows, offeringRows] =
    await Promise.all([
      listRowsForSchools({ orgId: params.orgId, schoolIds: params.actor.schoolIds, collectionName: "teacherAssignments" }),
      listRowsForSchools({ orgId: params.orgId, schoolIds: params.actor.schoolIds, collectionName: "teacherAssignmentClassLinks" }),
      listRowsForSchools({ orgId: params.orgId, schoolIds: params.actor.schoolIds, collectionName: "studentMeasurementBatches" }),
      listRowsForSchools({ orgId: params.orgId, schoolIds: params.actor.schoolIds, collectionName: "studentLearningLossPlans" }),
      listRowsForSchools({ orgId: params.orgId, schoolIds: params.actor.schoolIds, collectionName: "studentNotes" }),
      listRowsForSchools({ orgId: params.orgId, schoolIds: params.actor.schoolIds, collectionName: "studentGamificationEvents" }),
      listRowsForSchools({ orgId: params.orgId, schoolIds: params.actor.schoolIds, collectionName: "studentHomeworkAssignments" }),
      listRowsForSchools({ orgId: params.orgId, schoolIds: params.actor.schoolIds, collectionName: "classSubjectOfferings" }),
    ]);

  const now = Date.now();
  const assignments = assignmentRows.filter(
    (assignment) =>
      text(assignment.teacherPersonId) === params.teacherPersonId &&
      isActiveAssignment(assignment, now, params.academicYearId),
  );
  const assignmentIds = new Set(assignments.map((assignment) => text(assignment.id)));
  const links = linkRows.filter((link) => assignmentIds.has(text(link.assignmentId)));
  const classLabels = await loadClassLabels({
    orgId: params.orgId,
    assignments,
    links,
  });
  const offeringById = new Map(offeringRows.map((offering) => [text(offering.id), offering]));
  const periodStartAt = periodStart(params.period);
  const drillDowns = emptyDrillDowns();

  const add = (item: {
    key: TeacherWorkDrillDownKey;
    rowData: Row;
    title: string;
    status: string;
    activityFields: string[];
  }) => {
    if (
      !canViewTeacherWorkSubject({
        actor: params.actor,
        orgId: params.orgId,
        schoolId: text(item.rowData.schoolId),
        subjectKey: subjectKeyFor(
          item.rowData,
          offeringById.get(text(item.rowData.classSubjectOfferingId)),
        ),
      })
    ) {
      return;
    }

    if (
      params.academicYearId &&
      text(item.rowData.academicYearId) !== params.academicYearId
    ) {
      return;
    }

    const activityAt = rowActivity(item.rowData, item.activityFields);
    if (!isInPeriod(activityAt, periodStartAt)) return;

    const offering = offeringById.get(text(item.rowData.classSubjectOfferingId));
    drillDowns[item.key].push({
      id: text(item.rowData.id),
      title: item.title,
      status: item.status,
      activityAt,
      classLabel: classLabels.get(text(item.rowData.classId)) || text(item.rowData.classId),
      subjectLabel: offeringLabel(offering),
    });
  };

  for (const rowData of measurementRows) {
    if (text(rowData.createdByPersonId) !== params.teacherPersonId) continue;
    add({
      key: "measurements",
      rowData,
      title: "دفعة قياسات",
      status: text(rowData.status),
      activityFields: ["measuredAt", "submittedAt", "createdAt"],
    });
  }

  for (const rowData of learningLossRows) {
    if (text(rowData.createdByPersonId) !== params.teacherPersonId) continue;
    add({
      key: "learningLoss",
      rowData,
      title: "خطة فاقد تعليمي",
      status: text(rowData.status),
      activityFields: ["createdAt"],
    });
  }

  for (const rowData of noteRows) {
    if (text(rowData.recordedByPersonId) !== params.teacherPersonId) continue;
    add({
      key: "notes",
      rowData,
      title: "ملاحظة مسجلة",
      status: "RECORDED",
      activityFields: ["recordedAt", "createdAt"],
    });
  }

  for (const rowData of gamificationRows) {
    if (
      text(rowData.createdByPersonId) !== params.teacherPersonId ||
      text(rowData.sourceType) !== "MANUAL"
    ) {
      continue;
    }
    add({
      key: "gamification",
      rowData,
      title: "تحفيز يدوي",
      status: "RECORDED",
      activityFields: ["occurredAt", "createdAt"],
    });
  }

  for (const rowData of homeworkRows) {
    if (text(rowData.createdByPersonId) !== params.teacherPersonId) continue;
    add({
      key: "homework",
      rowData,
      title: "واجب دراسي",
      status: text(rowData.status),
      activityFields: ["publishedAt", "createdAt"],
    });
  }

  for (const key of Object.keys(drillDowns) as TeacherWorkDrillDownKey[]) {
    drillDowns[key].sort((left, right) => (right.activityAt ?? 0) - (left.activityAt ?? 0));
  }

  return drillDowns;
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
  { region: REGION, cors: true, invoker: "public", memory: "512MiB" },
  async (request): Promise<{
    academicYearId: string;
    period: TeacherWorkPeriod;
    teacher: TeacherWorkSummary;
    lessonPreps: TeacherWorkLessonPrep[];
    drillDowns: TeacherWorkDrillDowns;
  }> => {
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

    const orgId = requireId(input.orgId, "orgId");
    const actor = await resolveActor({ orgId, uid: request.auth.uid });
    const lessonPreps = await buildTeacherLessonPrepDetails({
      orgId,
      actor,
      academicYearId: result.academicYearId,
      period: result.period,
      teacherPersonId,
    });
    const drillDowns = await buildTeacherWorkDrillDowns({
      orgId,
      actor,
      academicYearId: result.academicYearId,
      period: result.period,
      teacherPersonId,
    });

    return {
      academicYearId: result.academicYearId,
      period: result.period,
      teacher,
      lessonPreps,
      drillDowns,
    };
  },
);
