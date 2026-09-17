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

type TeacherWorkDirectoryEntry = {
  teacherPersonId: string;
  displayName: string;
  schoolIds: string[];
  schoolNames: string[];
  classLabels: string[];
  subjectLabels: string[];
};

type TeacherWorkSummary = TeacherWorkDirectoryEntry & {
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

type TeacherWorkDrillDownBase = {
  id: string;
  title: string;
  status: string;
  activityAt: number | null;
  classLabel: string;
  subjectLabel: string;
};

type TeacherWorkMeasurementStudentResult = {
  studentDisplayName: string;
  status: string;
  score: number | null;
  maxScore: number | null;
  level: string;
  valueText: string;
};

type TeacherWorkMeasurementItemScore = {
  itemKey: string;
  itemId: string;
  itemTitle: string;
  category: string;
  valueType: string;
  score: number | null;
  maxScore: number | null;
  weight: number | null;
  level: string;
  valueText: string;
  passed: boolean | null;
  note: string;
  order: number;
};

type TeacherWorkMeasurementStudentItemDetail =
  TeacherWorkMeasurementStudentResult & {
    studentId: string;
    itemScores: TeacherWorkMeasurementItemScore[];
  };

type TeacherWorkMeasurementDetail = {
  id: string;
  title: string;
  templateTitle: string;
  classLabel: string;
  subjectLabel: string;
  status: string;
  studentResults: TeacherWorkMeasurementStudentItemDetail[];
};

type TeacherWorkMeasurementDrillDown = TeacherWorkDrillDownBase & {
  kind: "measurements";
  details: {
    batchKind: string;
    templateTitle: string;
    assessmentKind: string;
    trackerKind: string;
    measuredAt: number | null;
    submittedAt: number | null;
    targetCount: number | null;
    completedCount: number | null;
    missingCount: number | null;
    studentResults: TeacherWorkMeasurementStudentResult[];
  };
};

type TeacherWorkLearningLossDrillDown = TeacherWorkDrillDownBase & {
  kind: "learningLoss";
  details: {
    sourceTitle: string;
    planText: string;
    planStartAt: number | null;
    planEndAt: number | null;
    closedAt: number | null;
    improvementIndicator: string;
    lostSkillTitles: string[];
    remediationActionTitles: string[];
  };
};

type TeacherWorkNoteDrillDown = TeacherWorkDrillDownBase & {
  kind: "notes";
  details: {
    category: string;
    priority: string;
    visibility: string;
    recordedAt: number | null;
    followUpStatus: string;
    followUpAt: number | null;
    body: string;
    bodyVisible: boolean;
  };
};

type TeacherWorkGamificationDrillDown = TeacherWorkDrillDownBase & {
  kind: "gamification";
  details: {
    eventType: string;
    value: number | null;
    valueKind: string;
    reasonTitle: string;
    categoryTitle: string;
    badgeTitle: string;
    occurredAt: number | null;
    visibility: string;
  };
};

type TeacherWorkHomeworkDrillDown = TeacherWorkDrillDownBase & {
  kind: "homework";
  details: {
    description: string;
    publishedAt: number | null;
    scheduledPublishAt: number | null;
    dueAt: number | null;
    closedAt: number | null;
    maxScore: number | null;
    questionCount: number | null;
    targetCount: number | null;
    submittedCount: number | null;
    gradedCount: number | null;
    missingCount: number | null;
  };
};

type TeacherWorkDrillDowns = {
  measurements: TeacherWorkMeasurementDrillDown[];
  learningLoss: TeacherWorkLearningLossDrillDown[];
  notes: TeacherWorkNoteDrillDown[];
  gamification: TeacherWorkGamificationDrillDown[];
  homework: TeacherWorkHomeworkDrillDown[];
};

type TeacherWorkResponse = {
  academicYearId: string;
  period: TeacherWorkPeriod;
  teachers: TeacherWorkSummary[];
};

type TeacherWorkDirectoryResponse = {
  academicYearId: string;
  teachers: TeacherWorkDirectoryEntry[];
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

function titlesFromRows(value: unknown) {
  return unique(
    Array.isArray(value)
      ? value.map((item) => text(row(item).title))
      : [],
  );
}

function noteBodyIsVisibleToStaff(visibility: string) {
  return visibility === "STAFF_ONLY" || visibility === "STAFF_INTERNAL";
}

type MeasurementStudentResultSource = TeacherWorkMeasurementStudentResult & {
  studentId: string;
};

function measurementStudentResultSources(rowData: Row): MeasurementStudentResultSource[] {
  const storedRows = Array.isArray(rowData.studentRows) ? rowData.studentRows : [];
  const sourceRows = storedRows.length
    ? storedRows
    : readStringArray(rowData.targetStudentIds).map((studentId) => ({
        studentId,
        studentDisplayName: "",
        status: "PENDING",
      }));

  return sourceRows.flatMap((source) => {
    const studentRow = row(source);
    const studentId = text(studentRow.studentId);
    if (!studentId) return [];

    return [{
      studentId,
      studentDisplayName: text(studentRow.studentDisplayName),
      status: text(studentRow.status) || "PENDING",
      score: numberValue(studentRow.score),
      maxScore: numberValue(studentRow.maxScore),
      level: text(studentRow.level),
      valueText: text(studentRow.valueText),
    }];
  });
}

function measurementItemScores(value: unknown): TeacherWorkMeasurementItemScore[] {
  return (Array.isArray(value) ? value : [])
    .map(row)
    .map((item) => ({
      itemKey: text(item.itemKey) || text(item.itemId),
      itemId: text(item.itemId),
      itemTitle: text(item.itemTitle),
      category: text(item.category),
      valueType: text(item.valueType),
      score: numberValue(item.score),
      maxScore: numberValue(item.maxScore),
      weight: numberValue(item.weight),
      level: text(item.level),
      valueText: text(item.valueText),
      passed: typeof item.passed === "boolean" ? item.passed : null,
      note: text(item.note),
      order: numberValue(item.order) ?? Number.MAX_SAFE_INTEGER,
    }))
    .sort((left, right) => left.order - right.order);
}

function hasFriendlyStudentName(value: string, studentId: string) {
  return Boolean(value) && value !== studentId;
}

async function loadMeasurementStudentNames(params: {
  orgId: string;
  lookups: Array<{ schoolId: string; studentId: string }>;
}) {
  const db = getFirestore();
  const uniqueLookups = Array.from(
    new Map(
      params.lookups
        .filter(({ schoolId, studentId }) => schoolId && studentId)
        .map((lookup) => [`${lookup.schoolId}:${lookup.studentId}`, lookup]),
    ).values(),
  );
  const names = new Map<string, string>();

  for (let start = 0; start < uniqueLookups.length; start += 100) {
    const lookupChunk = uniqueLookups.slice(start, start + 100);
    const snapshots = await db.getAll(
      ...lookupChunk.map(({ schoolId, studentId }) =>
        db.doc(`orgs/${params.orgId}/schools/${schoolId}/studentDirectory/${studentId}`),
      ),
    );

    snapshots.forEach((snapshot, index) => {
      const lookup = lookupChunk[index];
      if (!lookup) return;
      const displayName = text(snapshot.data()?.displayName);
      if (displayName) {
        names.set(`${lookup.schoolId}:${lookup.studentId}`, displayName);
      }
    });
  }

  return names;
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
  return value === "WEEK" || value === "MONTH" || value === "ALL" ? value : "ALL";
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
  const names = new Map<string, string>();

  for (let start = 0; start < teacherPersonIds.length; start += 100) {
    const personIdChunk = teacherPersonIds.slice(start, start + 100);
    const snapshots = await db.getAll(
      ...personIdChunk.map((personId) =>
        db.doc(`orgs/${orgId}/people/${personId}`),
      ),
    );

    snapshots.forEach((snapshot, index) => {
      const personId = personIdChunk[index];
      if (personId) names.set(personId, text(snapshot.data()?.displayName));
    });
  }

  return names;
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

async function buildTeacherWorkDirectory(params: {
  orgId: string;
  actor: TeacherWorkActor;
  academicYearId: string;
}): Promise<TeacherWorkDirectoryEntry[]> {
  const [assignmentRows, linkRows, offeringRows] = await Promise.all([
    listRowsForSchools({ orgId: params.orgId, schoolIds: params.actor.schoolIds, collectionName: "teacherAssignments" }),
    listRowsForSchools({ orgId: params.orgId, schoolIds: params.actor.schoolIds, collectionName: "teacherAssignmentClassLinks" }),
    listRowsForSchools({ orgId: params.orgId, schoolIds: params.actor.schoolIds, collectionName: "classSubjectOfferings" }),
  ]);

  const assignments = assignmentRows.filter((assignment) =>
    isActiveAssignment(assignment, Date.now(), params.academicYearId),
  );
  const assignmentIds = new Set(assignments.map((assignment) => text(assignment.id)));
  const links = linkRows.filter((link) => assignmentIds.has(text(link.assignmentId)));
  const offeringById = new Map(offeringRows.map((offering) => [text(offering.id), offering]));
  const scopedAssignments = assignments.filter((assignment) =>
    canViewTeacherWorkSubject({
      actor: params.actor,
      orgId: params.orgId,
      schoolId: text(assignment.schoolId),
      subjectKey: subjectKeyFor(
        assignment,
        offeringById.get(text(assignment.classSubjectOfferingId)),
      ),
    }),
  );
  const scopedAssignmentIds = new Set(scopedAssignments.map((assignment) => text(assignment.id)));
  const scopedLinks = links.filter((link) => scopedAssignmentIds.has(text(link.assignmentId)));
  const teacherPersonIds = unique(scopedAssignments.map((assignment) => text(assignment.teacherPersonId)));
  const [teacherNames, classLabels] = await Promise.all([
    loadTeacherNames(params.orgId, teacherPersonIds),
    loadClassLabels({ orgId: params.orgId, assignments: scopedAssignments, links: scopedLinks }),
  ]);
  const schoolNameById = new Map(params.actor.schools.map((school) => [school.id, school.name]));

  return teacherPersonIds
    .map((teacherPersonId) => {
      const teacherAssignments = scopedAssignments.filter(
        (assignment) => text(assignment.teacherPersonId) === teacherPersonId,
      );
      const teacherAssignmentIds = new Set(teacherAssignments.map((assignment) => text(assignment.id)));
      const teacherLinks = scopedLinks.filter((link) => teacherAssignmentIds.has(text(link.assignmentId)));
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

      return {
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
      };
    })
    .sort((left, right) => left.displayName.localeCompare(right.displayName, "ar"));
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
          subjectLabel: offeringLabel(offering),
          classLabel: classLabels.get(text(lessonPrep.classId)) || "",
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

  const baseItem = (item: {
    rowData: Row;
    title: string;
    status: string;
    activityFields: string[];
  }): TeacherWorkDrillDownBase | null => {
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
      return null;
    }

    if (
      params.academicYearId &&
      text(item.rowData.academicYearId) !== params.academicYearId
    ) {
      return null;
    }

    const activityAt = rowActivity(item.rowData, item.activityFields);
    if (!isInPeriod(activityAt, periodStartAt)) return null;

    const offering = offeringById.get(text(item.rowData.classSubjectOfferingId));
    return {
      id: text(item.rowData.id),
      title: item.title,
      status: item.status,
      activityAt,
      classLabel: classLabels.get(text(item.rowData.classId)) || "",
      subjectLabel: offeringLabel(offering),
    };
  };

  const measurementItems: Array<{
    item: TeacherWorkDrillDownBase;
    rowData: Row;
    studentResults: MeasurementStudentResultSource[];
  }> = [];

  for (const rowData of measurementRows) {
    if (text(rowData.createdByPersonId) !== params.teacherPersonId) continue;
    const item = baseItem({
      rowData,
      title: text(rowData.templateTitle) || "دفعة قياسات",
      status: text(rowData.status),
      activityFields: ["measuredAt", "submittedAt", "createdAt"],
    });
    if (!item) continue;
    measurementItems.push({
      item,
      rowData,
      studentResults: measurementStudentResultSources(rowData),
    });
  }

  const measurementStudentNames = await loadMeasurementStudentNames({
    orgId: params.orgId,
    lookups: measurementItems.flatMap(({ rowData, studentResults }) =>
      studentResults
        .filter(({ studentDisplayName, studentId }) =>
          !hasFriendlyStudentName(studentDisplayName, studentId),
        )
        .map(({ studentId }) => ({
          schoolId: text(rowData.schoolId),
          studentId,
        })),
    ),
  });

  for (const { item, rowData, studentResults } of measurementItems) {
    drillDowns.measurements.push({
      ...item,
      kind: "measurements",
      details: {
        batchKind: text(rowData.batchKind),
        templateTitle: text(rowData.templateTitle),
        assessmentKind: text(rowData.assessmentKind),
        trackerKind: text(rowData.trackerKind),
        measuredAt: numberValue(rowData.measuredAt),
        submittedAt: numberValue(rowData.submittedAt),
        targetCount: numberValue(rowData.targetCount),
        completedCount: numberValue(rowData.completedCount),
        missingCount: numberValue(rowData.missingCount),
        studentResults: studentResults.map(({ studentId, studentDisplayName, ...result }) => ({
          ...result,
          studentDisplayName:
            (hasFriendlyStudentName(studentDisplayName, studentId)
              ? studentDisplayName
              : "") ||
            measurementStudentNames.get(`${text(rowData.schoolId)}:${studentId}`) ||
            "غير محدد",
        })),
      },
    });
  }

  for (const rowData of learningLossRows) {
    if (text(rowData.createdByPersonId) !== params.teacherPersonId) continue;
    const item = baseItem({
      rowData,
      title: text(rowData.planTitle) || "خطة فاقد تعليمي",
      status: text(rowData.status),
      activityFields: ["createdAt"],
    });
    if (!item) continue;
    drillDowns.learningLoss.push({
      ...item,
      kind: "learningLoss",
      details: {
        sourceTitle: text(rowData.sourceTitle),
        planText: text(rowData.planText),
        planStartAt: numberValue(rowData.planStartAt),
        planEndAt: numberValue(rowData.planEndAt),
        closedAt: numberValue(rowData.closedAt),
        improvementIndicator: text(rowData.improvementIndicator),
        lostSkillTitles: titlesFromRows(rowData.lostSkills),
        remediationActionTitles: titlesFromRows(rowData.remediationActions),
      },
    });
  }

  for (const rowData of noteRows) {
    if (text(rowData.recordedByPersonId) !== params.teacherPersonId) continue;
    const item = baseItem({
      rowData,
      title: "ملاحظة مسجلة",
      status: text(rowData.status) || "RECORDED",
      activityFields: ["recordedAt", "createdAt"],
    });
    if (!item) continue;
    const visibility = text(rowData.visibility);
    const bodyVisible = noteBodyIsVisibleToStaff(visibility);
    drillDowns.notes.push({
      ...item,
      kind: "notes",
      details: {
        category: text(rowData.category),
        priority: text(rowData.priority),
        visibility,
        recordedAt: numberValue(rowData.recordedAt),
        followUpStatus: text(rowData.followUpStatus),
        followUpAt: numberValue(rowData.followUpAt),
        body: bodyVisible ? text(rowData.body) : "",
        bodyVisible,
      },
    });
  }

  for (const rowData of gamificationRows) {
    if (
      text(rowData.createdByPersonId) !== params.teacherPersonId ||
      text(rowData.sourceType) !== "MANUAL"
    ) {
      continue;
    }
    const item = baseItem({
      rowData,
      title: text(rowData.title) || text(rowData.reasonTitle) || "تحفيز يدوي",
      status: text(rowData.status) || "RECORDED",
      activityFields: ["occurredAt", "createdAt"],
    });
    if (!item) continue;
    drillDowns.gamification.push({
      ...item,
      kind: "gamification",
      details: {
        eventType: text(rowData.eventType),
        value: numberValue(rowData.value),
        valueKind: text(rowData.valueKind),
        reasonTitle: text(rowData.reasonTitle),
        categoryTitle: text(rowData.categoryTitle),
        badgeTitle: text(rowData.badgeTitle),
        occurredAt: numberValue(rowData.occurredAt),
        visibility: text(rowData.visibility),
      },
    });
  }

  for (const rowData of homeworkRows) {
    if (text(rowData.createdByPersonId) !== params.teacherPersonId) continue;
    const item = baseItem({
      rowData,
      title: text(rowData.title) || "واجب دراسي",
      status: text(rowData.status),
      activityFields: ["publishedAt", "createdAt"],
    });
    if (!item) continue;
    drillDowns.homework.push({
      ...item,
      kind: "homework",
      details: {
        description: text(rowData.description),
        publishedAt: numberValue(rowData.publishedAt),
        scheduledPublishAt: numberValue(rowData.scheduledPublishAt),
        dueAt: numberValue(rowData.dueAt),
        closedAt: numberValue(rowData.closedAt),
        maxScore: numberValue(rowData.maxScore),
        questionCount: Array.isArray(rowData.questions) ? rowData.questions.length : null,
        targetCount: numberValue(rowData.targetCount),
        submittedCount: numberValue(rowData.submittedCount),
        gradedCount: numberValue(rowData.gradedCount),
        missingCount: numberValue(rowData.missingCount),
      },
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

async function getTeacherWorkDirectory(params: {
  uid: string;
  input: Row;
}): Promise<TeacherWorkDirectoryResponse> {
  const orgId = requireId(params.input.orgId, "orgId");
  const academicYearId = optionalId(params.input.academicYearId, "academicYearId");
  const actor = await resolveActor({ orgId, uid: params.uid });
  const teachers = await buildTeacherWorkDirectory({
    orgId,
    actor,
    academicYearId,
  });

  return { academicYearId, teachers };
}

export const getTeacherWorkOverview = onCall(
  { region: REGION, cors: true, invoker: "public", memory: "512MiB" },
  async (request): Promise<TeacherWorkDirectoryResponse> => {
    if (!request.auth?.uid) {
      throw new HttpsError("unauthenticated", "Authentication is required.");
    }

    return getTeacherWorkDirectory({
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

export const getTeacherWorkMeasurementDetail = onCall(
  { region: REGION, cors: true, invoker: "public", memory: "512MiB" },
  async (request): Promise<TeacherWorkMeasurementDetail> => {
    if (!request.auth?.uid) {
      throw new HttpsError("unauthenticated", "Authentication is required.");
    }

    const input = row(request.data);
    const orgId = requireId(input.orgId, "orgId");
    const teacherPersonId = requireId(input.teacherPersonId, "teacherPersonId");
    const measurementBatchId = requireId(input.measurementBatchId, "measurementBatchId");
    const academicYearId = optionalId(input.academicYearId, "academicYearId");
    const actor = await resolveActor({ orgId, uid: request.auth.uid });
    const snapshot = await getFirestore()
      .doc(`orgs/${orgId}/studentMeasurementBatches/${measurementBatchId}`)
      .get();

    if (!snapshot.exists) {
      throw new HttpsError("not-found", "Measurement batch was not found.");
    }

    const batch = row(snapshot.data());
    if (text(batch.createdByPersonId) !== teacherPersonId) {
      throw new HttpsError("permission-denied", "Measurement batch access denied.");
    }
    if (academicYearId && text(batch.academicYearId) !== academicYearId) {
      throw new HttpsError("not-found", "Measurement batch was not found.");
    }
    if (
      !actor.schoolIds.includes(text(batch.schoolId)) ||
      !canViewTeacherWorkSubject({
        actor,
        orgId,
        schoolId: text(batch.schoolId),
        subjectKey: subjectKeyFor(batch),
      })
    ) {
      throw new HttpsError("permission-denied", "Measurement batch access denied.");
    }

    const sourceRows = Array.isArray(batch.studentRows) ? batch.studentRows : [];
    const studentSources = sourceRows.flatMap((source) => {
      const student = row(source);
      const studentId = text(student.studentId);
      if (!studentId) return [];
      return [{
        studentId,
        studentDisplayName: text(student.studentDisplayName),
        status: text(student.status) || "PENDING",
        score: numberValue(student.score),
        maxScore: numberValue(student.maxScore),
        level: text(student.level),
        valueText: text(student.valueText),
        itemScores: measurementItemScores(student.itemScores),
      }];
    });
    const studentNames = await loadMeasurementStudentNames({
      orgId,
      lookups: studentSources
        .filter((student) => !hasFriendlyStudentName(student.studentDisplayName, student.studentId))
        .map((student) => ({ schoolId: text(batch.schoolId), studentId: student.studentId })),
    });

    return {
      id: snapshot.id,
      title: text(batch.templateTitle) || "دفعة قياسات",
      templateTitle: text(batch.templateTitle),
      classLabel: text(batch.classTitle) || text(batch.classId),
      subjectLabel: text(batch.subjectTitle) || text(batch.subjectKey),
      status: text(batch.status),
      studentResults: studentSources.map((student) => ({
        ...student,
        studentDisplayName:
          (hasFriendlyStudentName(student.studentDisplayName, student.studentId)
            ? student.studentDisplayName
            : "") ||
          studentNames.get(`${text(batch.schoolId)}:${student.studentId}`) ||
          "غير محدد",
      })),
    };
  },
);
