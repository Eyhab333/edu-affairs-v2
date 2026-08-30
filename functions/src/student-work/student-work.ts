import { getFirestore } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import type {
  Class,
  Membership,
  OperationalAssignment,
  TeacherAssignment,
  TeacherAssignmentClassLink,
} from "@takween/contracts";
import { getVisibleClassesForActor } from "@takween/domain";

const REGION = "me-central2";
const STUDENT_WORK_COLLECTIONS = [
  "studentAttendanceRecords",
  "studentAssessmentRecords",
  "studentTrackerEntries",
  "studentLearningLossPlans",
  "studentHomeworkSubmissions",
  "studentGamificationEvents",
  "studentNotes",
] as const;

type Row = Record<string, unknown>;
type StudentWorkPeriod = "WEEK" | "MONTH" | "ALL";
type StudentWorkMetricKey =
  | "attendance"
  | "measurements"
  | "learningLoss"
  | "gamification";
type StudentWorkModuleKey =
  | StudentWorkMetricKey
  | "homework"
  | "notes";

type StudentWorkMetric = {
  count: number;
  latestActivityAt: number | null;
  value?: number;
};

type StudentWorkSummary = {
  studentId: string;
  enrollmentId: string;
  displayName: string;
  schoolId: string;
  academicYearId: string;
  classId: string;
  gradeId: string;
  streamId: string;
  metrics: Record<StudentWorkMetricKey, StudentWorkMetric>;
};

type StudentWorkDrillDownItem = {
  id: string;
  title: string;
  status: string;
  activityAt: number | null;
  details: string[];
};

type StudentWorkDrillDowns = Record<
  StudentWorkModuleKey,
  StudentWorkDrillDownItem[]
>;

type StudentWorkActor = {
  personId: string;
  membership: Membership;
  operationalAssignments: OperationalAssignment[];
  teacherAssignments: TeacherAssignment[];
  teacherAssignmentClassLinks: TeacherAssignmentClassLink[];
  visibleClasses: Class[];
  hasBroadSchoolAccess: boolean;
};

type EnrollmentContext = {
  enrollmentId: string;
  studentId: string;
  schoolId: string;
  academicYearId: string;
  classId: string;
  gradeId: string;
  streamId: string;
  classItem: Class;
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

function readStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && !!item.trim())
    : [];
}

function requireId(value: unknown, fieldName: string) {
  const id = text(value);
  if (!id || id.includes("/")) {
    throw new HttpsError("invalid-argument", `${fieldName} is required.`);
  }
  return id;
}

function requireAuth(uid: string | undefined): string {
  if (!uid) throw new HttpsError("unauthenticated", "Authentication is required.");
  return uid;
}

function readString(data: Row | undefined, keys: string[]) {
  if (!data) return "";
  for (const key of keys) {
    const value = text(data[key]);
    if (value) return value;
  }
  return "";
}

function isActiveMembership(data: Row) {
  return data.isActive === true || data.active === true;
}

function chunk<T>(items: T[], size: number) {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) result.push(items.slice(index, index + size));
  return result;
}

function classKey(params: { schoolId: string; academicYearId: string; classId: string }) {
  return `${params.schoolId}::${params.academicYearId}::${params.classId}`;
}

function periodStart(period: StudentWorkPeriod) {
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

function getPeriod(value: unknown): StudentWorkPeriod {
  return value === "WEEK" || value === "MONTH" || value === "ALL" ? value : "ALL";
}

function latest(...values: Array<number | null>) {
  const available = values.filter((value): value is number => value !== null);
  return available.length ? Math.max(...available) : null;
}

function activityAt(data: Row, fields: string[]) {
  return latest(...fields.map((field) => numberValue(data[field])));
}

function inPeriod(value: number | null, startAt: number | null) {
  return startAt === null || (value !== null && value >= startAt);
}

function isBroadMembership(membership: Membership) {
  const role = membership.roleKey ?? membership.role;
  return ["platform_owner", "platform_admin", "org_owner", "org_admin"].includes(role ?? "")
    || membership.permissions?.manageOrg === true
    || membership.permissions?.manageSchools === true
    || membership.permissions?.manageDirectory === true
    || membership.scopes?.canAccessAllSchools === true;
}

function normalizeMembership(params: { uid: string; orgId: string; id: string; data: Row }): Membership {
  const scopes = row(params.data.scopes);
  const permissions = row(params.data.permissions);
  const role = readString(params.data, ["roleKey", "role"]);
  return {
    id: params.id,
    uid: params.uid,
    personId: readString(params.data, ["personId"]),
    orgId: readString(params.data, ["orgId"]) || params.orgId,
    role: role as Membership["role"],
    roleKey: role as Membership["roleKey"],
    scopes: {
      schoolIds: readStringArray(scopes.schoolIds),
      gradeIds: readStringArray(scopes.gradeIds),
      classIds: readStringArray(scopes.classIds),
      scopeGroupIds: readStringArray(scopes.scopeGroupIds),
      subjectKeys: readStringArray(scopes.subjectKeys),
      routeIds: readStringArray(scopes.routeIds),
      canAccessAllSchools: scopes.canAccessAllSchools === true,
    },
    permissions: {
      manageOrg: permissions.manageOrg === true,
      manageSchools: permissions.manageSchools === true,
      manageDirectory: permissions.manageDirectory === true,
    },
    scopeType: readString(params.data, ["scopeType"]) as Membership["scopeType"],
    scopeId: readString(params.data, ["scopeId"]),
    isActive: true,
  } as Membership;
}

function asClass(id: string, data: Row): Class {
  return { id, ...data } as Class;
}

function asOperationalAssignment(id: string, data: Row): OperationalAssignment {
  return {
    id,
    ...data,
    targetClassIds: readStringArray(data.targetClassIds),
    targetGradeIds: readStringArray(data.targetGradeIds),
  } as OperationalAssignment;
}

function asTeacherAssignment(id: string, data: Row): TeacherAssignment {
  return { id, ...data } as TeacherAssignment;
}

function asTeacherAssignmentClassLink(id: string, data: Row): TeacherAssignmentClassLink {
  return { id, ...data } as TeacherAssignmentClassLink;
}

async function resolveActor(params: { uid: string; orgId: string }): Promise<StudentWorkActor> {
  const db = getFirestore();
  const membershipSnapshot = await db.doc(`users/${params.uid}/orgMemberships/${params.orgId}`).get();
  if (!membershipSnapshot.exists || !isActiveMembership(row(membershipSnapshot.data()))) {
    throw new HttpsError("permission-denied", "An active organization membership is required.");
  }

  const membership = normalizeMembership({
    uid: params.uid,
    orgId: params.orgId,
    id: membershipSnapshot.id,
    data: row(membershipSnapshot.data()),
  });
  const userSnapshot = await db.doc(`users/${params.uid}`).get();
  const personId = membership.personId || readString(row(userSnapshot.data()), ["personId"]) || params.uid;
  const [operationalSnapshot, teacherSnapshot, schoolsSnapshot] = await Promise.all([
    db.collection(`orgs/${params.orgId}/operationalAssignments`).where("actorPersonId", "==", personId).get(),
    db.collection(`orgs/${params.orgId}/teacherAssignments`).where("teacherPersonId", "==", personId).get(),
    db.collection(`orgs/${params.orgId}/schools`).get(),
  ]);
  const operationalAssignments = operationalSnapshot.docs.map((document) => asOperationalAssignment(document.id, row(document.data())));
  const teacherAssignments = teacherSnapshot.docs.map((document) => asTeacherAssignment(document.id, row(document.data())));
  const linkSnapshots = await Promise.all(
    chunk(teacherAssignments.map((assignment) => assignment.id), 10).map((ids) =>
      db.collection(`orgs/${params.orgId}/teacherAssignmentClassLinks`).where("assignmentId", "in", ids).get(),
    ),
  );
  const teacherAssignmentClassLinks = linkSnapshots.flatMap((snapshot) =>
    snapshot.docs.map((document) => asTeacherAssignmentClassLink(document.id, row(document.data()))),
  );
  const academicYears = await Promise.all(
    schoolsSnapshot.docs.map((school) => school.ref.collection("academicYears").get()),
  );
  const classSnapshots = await Promise.all(
    academicYears.flatMap((years) => years.docs.map((year) => year.ref.collection("classes").get())),
  );
  const classes = classSnapshots.flatMap((snapshot) =>
    snapshot.docs.map((document) => asClass(document.id, row(document.data()))),
  );
  const visibleClasses = getVisibleClassesForActor({
    context: {
      actorPersonId: personId,
      orgId: params.orgId,
      memberships: [membership],
      operationalAssignments,
      teacherAssignments,
      teacherAssignmentClassLinks,
    },
    classes,
    teacherAssignmentClassLinks,
  });
  return {
    personId,
    membership,
    operationalAssignments,
    teacherAssignments,
    teacherAssignmentClassLinks,
    visibleClasses,
    hasBroadSchoolAccess: isBroadMembership(membership) || (
      !["teacher", "BOYS_TEACHER", "GIRLS_TEACHER", "KG_TEACHER"].includes(membership.roleKey ?? membership.role ?? "") &&
      ((membership.scopes?.schoolIds?.length ?? 0) > 0 || membership.scopeType === "SCHOOL")
    ),
  };
}

async function loadEnrollmentContexts(params: { orgId: string; visibleClasses: Class[] }) {
  const classByKey = new Map(
    params.visibleClasses.map((classItem) => [
      classKey({ schoolId: classItem.schoolId, academicYearId: classItem.academicYearId, classId: classItem.id }),
      classItem,
    ]),
  );
  const schoolIds = Array.from(new Set(params.visibleClasses.map((classItem) => classItem.schoolId).filter(Boolean)));
  if (!schoolIds.length) return [] as EnrollmentContext[];
  const db = getFirestore();
  const snapshots = await Promise.all(
    chunk(schoolIds, 30).map((ids) =>
      db.collection(`orgs/${params.orgId}/studentEnrollments`).where("schoolId", "in", ids).where("status", "==", "ACTIVE").get(),
    ),
  );
  return snapshots.flatMap((snapshot) => snapshot.docs).flatMap((document) => {
    const data = row(document.data());
    const studentId = readString(data, ["studentId"]);
    const schoolId = readString(data, ["schoolId"]);
    const academicYearId = readString(data, ["academicYearId"]);
    const classId = readString(data, ["classId"]);
    const classItem = classByKey.get(classKey({ schoolId, academicYearId, classId }));
    if (!studentId || !classItem) return [];
    return [{
      enrollmentId: document.id,
      studentId,
      schoolId,
      academicYearId,
      classId,
      gradeId: readString(data, ["gradeId"]) || classItem.gradeId || "",
      streamId: readString(data, ["streamId"]) || classItem.streamId || "",
      classItem,
    }];
  });
}

async function loadDisplayNames(params: { orgId: string; studentIds: string[] }) {
  const db = getFirestore();
  const studentSnapshots = await Promise.all(
    params.studentIds.map((studentId) => db.doc(`orgs/${params.orgId}/students/${studentId}`).get()),
  );
  const students = new Map(studentSnapshots.map((snapshot) => [snapshot.id, snapshot.exists ? row(snapshot.data()) : undefined]));
  const personIds = Array.from(new Set(Array.from(students.values()).map((student) => readString(student, ["personId"])).filter(Boolean)));
  const people = new Map((await Promise.all(personIds.map((personId) => db.doc(`orgs/${params.orgId}/people/${personId}`).get())))
    .map((snapshot) => [snapshot.id, snapshot.exists ? row(snapshot.data()) : undefined]));
  return new Map(params.studentIds.map((studentId) => {
    const student = students.get(studentId);
    const person = people.get(readString(student, ["personId"]));
    return [studentId, readString(person, ["displayName", "fullName", "nameAr", "name"]) || readString(student, ["displayName", "fullName", "nameAr", "name"]) || studentId] as const;
  }));
}

async function loadRowsForSchools(params: { orgId: string; schoolIds: string[] }) {
  const db = getFirestore();
  const entries = await Promise.all(
    STUDENT_WORK_COLLECTIONS.flatMap((collectionName) =>
      chunk(params.schoolIds, 30).map(async (schoolIds) => ({
        collectionName,
        snapshot: await db.collection(`orgs/${params.orgId}/${collectionName}`).where("schoolId", "in", schoolIds).get(),
      })),
    ),
  );
  const byCollection = new Map<(typeof STUDENT_WORK_COLLECTIONS)[number], Row[]>();
  for (const collectionName of STUDENT_WORK_COLLECTIONS) byCollection.set(collectionName, []);
  for (const entry of entries) {
    byCollection.get(entry.collectionName)?.push(...entry.snapshot.docs.map((document) => ({ id: document.id, ...document.data() }) as Row));
  }
  return byCollection;
}

function isActiveAssignment(assignment: TeacherAssignment, now: number) {
  const data = assignment as unknown as Row;
  const startAt = numberValue(data.startAt);
  const endAt = numberValue(data.endAt);
  return text(data.status) === "ACTIVE" && (!startAt || startAt <= now) && (!endAt || endAt >= now);
}

function teacherAssignmentMatchesContext(params: { assignment: TeacherAssignment; context: EnrollmentContext; links: TeacherAssignmentClassLink[] }) {
  const assignment = params.assignment as unknown as Row;
  const classItem = params.context.classItem;
  if (text(assignment.orgId) !== classItem.orgId || text(assignment.schoolId) !== classItem.schoolId || text(assignment.academicYearId) !== classItem.academicYearId) return false;
  if (text(assignment.targetScopeType) === "CLASS" && text(assignment.targetScopeId) === classItem.id) return true;
  if (text(assignment.coverageMode) === "ALL_CLASSES_IN_SCOPE" && text(assignment.targetScopeType) === "SCHOOL" && text(assignment.targetScopeId) === classItem.schoolId) return true;
  if (text(assignment.coverageMode) === "ALL_CLASSES_IN_SCOPE" && text(assignment.targetScopeType) === "GRADE" && text(assignment.targetScopeId) === classItem.gradeId) return true;
  if (text(assignment.coverageMode) === "ALL_CLASSES_IN_SCOPE" && text(assignment.targetScopeType) === "STREAM" && text(assignment.targetScopeId) === classItem.streamId) return true;
  return params.links.some((link) => {
    const linkData = link as unknown as Row;
    return text(linkData.assignmentId) === assignment.id
      && text(linkData.orgId) === classItem.orgId
      && text(linkData.schoolId) === classItem.schoolId
      && text(linkData.academicYearId) === classItem.academicYearId
      && text(linkData.classId) === classItem.id;
  });
}

function canReadRow(params: { actor: StudentWorkActor; context: EnrollmentContext; data: Row }) {
  if (
    readString(params.data, ["studentId"]) !== params.context.studentId ||
    readString(params.data, ["schoolId"]) !== params.context.schoolId ||
    readString(params.data, ["academicYearId"]) !== params.context.academicYearId ||
    readString(params.data, ["classId"]) !== params.context.classId
  ) return false;

  const offeringId = readString(params.data, ["classSubjectOfferingId"]);
  const subjectKey = readString(params.data, ["subjectKey"]);
  if (!offeringId && !subjectKey) return true;
  if (params.actor.hasBroadSchoolAccess) return true;
  if (offeringId && params.actor.operationalAssignments.some((assignment) => {
    const assignmentData = assignment as unknown as Row;
    return text(assignmentData.status) === "ACTIVE"
      && text(assignmentData.schoolId) === params.context.schoolId
      && text(assignmentData.academicYearId) === params.context.academicYearId
      && text(assignmentData.classSubjectOfferingId) === offeringId;
  })) return true;
  const now = Date.now();
  return params.actor.teacherAssignments.some((assignment) => {
    const assignmentData = assignment as unknown as Row;
    if (!isActiveAssignment(assignment, now) || !teacherAssignmentMatchesContext({ assignment, context: params.context, links: params.actor.teacherAssignmentClassLinks })) return false;
    if (offeringId && readString(assignmentData, ["classSubjectOfferingId"]) === offeringId) return true;
    if (subjectKey && readString(assignmentData, ["subjectKey"]) === subjectKey) return true;
    return params.actor.teacherAssignmentClassLinks.some((link) => {
      const linkData = link as unknown as Row;
      return text(linkData.assignmentId) === assignment.id
        && text(linkData.schoolId) === params.context.schoolId
        && text(linkData.academicYearId) === params.context.academicYearId
        && text(linkData.classId) === params.context.classId
        && offeringId
        && text(linkData.classSubjectOfferingId) === offeringId;
    });
  });
}

function emptyMetric(): StudentWorkMetric {
  return { count: 0, latestActivityAt: null };
}

function emptyMetrics(): Record<StudentWorkMetricKey, StudentWorkMetric> {
  return { attendance: emptyMetric(), measurements: emptyMetric(), learningLoss: emptyMetric(), gamification: emptyMetric() };
}

function addMetric(metric: StudentWorkMetric, at: number | null, value?: number) {
  metric.count += 1;
  metric.latestActivityAt = latest(metric.latestActivityAt, at);
  if (value !== undefined) metric.value = (metric.value ?? 0) + value;
}

function isAbsence(data: Row) {
  return ["ABSENT", "EXCUSED_ABSENT", "REMOTE_ABSENT"].includes(text(data.status));
}

function measurementActivity(data: Row, collectionName: string) {
  return collectionName === "studentAssessmentRecords"
    ? activityAt(data, ["measuredAt", "updatedAt", "createdAt"])
    : activityAt(data, ["recordedAt", "updatedAt", "createdAt"]);
}

function details(...values: Array<string | null | undefined>) {
  return values.map((value) => value?.trim() ?? "").filter(Boolean);
}

function recordTitle(data: Row, fallback: string) {
  return readString(data, ["title", "templateTitle", "topicTitle", "lessonTitle", "homeworkTitle", "planTitle", "reasonTitle"]) || fallback;
}

function formatScore(data: Row) {
  const score = numberValue(data.score);
  const maxScore = numberValue(data.maxScore);
  return score === null ? "" : maxScore === null ? `النتيجة: ${score}` : `النتيجة: ${score}/${maxScore}`;
}

function drillDownItem(params: { collectionName: string; data: Row }): { key: StudentWorkModuleKey; item: StudentWorkDrillDownItem } | null {
  const { collectionName, data } = params;
  if (collectionName === "studentAttendanceRecords") return {
    key: "attendance",
    item: { id: text(data.id), title: "سجل حضور", status: text(data.status), activityAt: activityAt(data, ["recordedAt", "updatedAt", "createdAt"]), details: details(numberValue(data.lateMinutes) ? `تأخر: ${numberValue(data.lateMinutes)} دقيقة` : "", numberValue(data.leftEarlyMinutes) ? `انصراف مبكر: ${numberValue(data.leftEarlyMinutes)} دقيقة` : "", readString(data, ["excuseReason", "note"])) },
  };
  if (collectionName === "studentAssessmentRecords" || collectionName === "studentTrackerEntries") return {
    key: "measurements",
    item: { id: text(data.id), title: recordTitle(data, collectionName === "studentAssessmentRecords" ? "قياس" : "متابعة"), status: text(data.status), activityAt: measurementActivity(data, collectionName), details: details(readString(data, ["subjectKey"]), formatScore(data), readString(data, ["level", "valueText", "notes"])) },
  };
  if (collectionName === "studentLearningLossPlans") return {
    key: "learningLoss",
    item: { id: text(data.id), title: recordTitle(data, "خطة فاقد تعليمي"), status: text(data.status), activityAt: activityAt(data, ["updatedAt", "createdAt", "planStartAt"]), details: details(readString(data, ["subjectKey"]), numberValue(data.improvementPercentage) === null ? "" : `التحسن: ${numberValue(data.improvementPercentage)}%`, Array.isArray(data.lostSkills) ? `مهارات: ${data.lostSkills.map((skill) => readString(row(skill), ["title", "name", "skillTitle"]) || text(skill)).filter(Boolean).join("، ")}` : "") },
  };
  if (collectionName === "studentHomeworkSubmissions") return {
    key: "homework",
    item: { id: text(data.id), title: recordTitle(data, "واجب"), status: text(data.status), activityAt: activityAt(data, ["gradedAt", "submittedAt", "updatedAt", "createdAt"]), details: details(readString(data, ["subjectKey"]), formatScore(data), data.isLate === true ? "تسليم متأخر" : "", readString(data, ["feedback"])) },
  };
  if (collectionName === "studentGamificationEvents") return {
    key: "gamification",
    item: { id: text(data.id), title: recordTitle(data, "حدث تحفيزي"), status: text(data.status), activityAt: activityAt(data, ["occurredAt", "updatedAt", "createdAt"]), details: details(readString(data, ["subjectKey", "badgeTitle"]), `النقاط: ${numberValue(data.value) ?? 0}`, readString(data, ["description", "note"])) },
  };
  if (collectionName === "studentNotes") return {
    key: "notes",
    item: { id: text(data.id), title: recordTitle(data, "ملاحظة"), status: readString(data, ["followUpStatus", "status"]) || "RECORDED", activityAt: activityAt(data, ["recordedAt", "updatedAt", "createdAt"]), details: details(readString(data, ["category", "priority"]), readString(data, ["body", "followUpNote"])) },
  };
  return null;
}

function buildSummary(params: { context: EnrollmentContext; displayName: string; actor: StudentWorkActor; rowsByCollection: Map<(typeof STUDENT_WORK_COLLECTIONS)[number], Row[]>; period: StudentWorkPeriod }): StudentWorkSummary {
  const metrics = emptyMetrics();
  const startAt = periodStart(params.period);
  for (const collectionName of STUDENT_WORK_COLLECTIONS) {
    for (const data of params.rowsByCollection.get(collectionName) ?? []) {
      if (!canReadRow({ actor: params.actor, context: params.context, data })) continue;
      if (collectionName === "studentAttendanceRecords") {
        const at = activityAt(data, ["recordedAt", "updatedAt", "createdAt"]);
        if (isAbsence(data) && inPeriod(at, startAt)) addMetric(metrics.attendance, at);
      }
      if (collectionName === "studentAssessmentRecords" || collectionName === "studentTrackerEntries") {
        const at = measurementActivity(data, collectionName);
        if (inPeriod(at, startAt)) addMetric(metrics.measurements, at);
      }
      if (collectionName === "studentLearningLossPlans") {
        const at = activityAt(data, ["updatedAt", "createdAt", "planStartAt"]);
        if (["ACTIVE", "IN_PROGRESS"].includes(text(data.status)) && inPeriod(at, startAt)) addMetric(metrics.learningLoss, at);
      }
      if (collectionName === "studentGamificationEvents") {
        const at = activityAt(data, ["occurredAt", "updatedAt", "createdAt"]);
        if (text(data.status) === "ACTIVE" && inPeriod(at, startAt)) addMetric(metrics.gamification, at, numberValue(data.value) ?? 0);
      }
    }
  }
  return {
    studentId: params.context.studentId,
    enrollmentId: params.context.enrollmentId,
    displayName: params.displayName,
    schoolId: params.context.schoolId,
    academicYearId: params.context.academicYearId,
    classId: params.context.classId,
    gradeId: params.context.gradeId,
    streamId: params.context.streamId,
    metrics,
  };
}

function emptyDrillDowns(): StudentWorkDrillDowns {
  return { attendance: [], measurements: [], learningLoss: [], homework: [], gamification: [], notes: [] };
}

function buildDrillDowns(params: { context: EnrollmentContext; actor: StudentWorkActor; rowsByCollection: Map<(typeof STUDENT_WORK_COLLECTIONS)[number], Row[]>; period: StudentWorkPeriod }) {
  const startAt = periodStart(params.period);
  const drillDowns = emptyDrillDowns();
  for (const collectionName of STUDENT_WORK_COLLECTIONS) {
    for (const data of params.rowsByCollection.get(collectionName) ?? []) {
      if (!canReadRow({ actor: params.actor, context: params.context, data })) continue;
      const item = drillDownItem({ collectionName, data });
      if (!item || !inPeriod(item.item.activityAt, startAt)) continue;
      drillDowns[item.key].push(item.item);
    }
  }
  for (const key of Object.keys(drillDowns) as StudentWorkModuleKey[]) {
    drillDowns[key].sort((left, right) => (right.activityAt ?? 0) - (left.activityAt ?? 0));
  }
  return drillDowns;
}

async function loadStudentWork(params: { uid: string; orgId: string; period: StudentWorkPeriod }) {
  const actor = await resolveActor({ uid: params.uid, orgId: params.orgId });
  const contexts = await loadEnrollmentContexts({ orgId: params.orgId, visibleClasses: actor.visibleClasses });
  const [displayNames, rowsByCollection] = await Promise.all([
    loadDisplayNames({ orgId: params.orgId, studentIds: Array.from(new Set(contexts.map((context) => context.studentId))) }),
    loadRowsForSchools({ orgId: params.orgId, schoolIds: Array.from(new Set(contexts.map((context) => context.schoolId))) }),
  ]);
  return { actor, contexts, displayNames, rowsByCollection };
}

export const getStudentWorkOverview = onCall(
  { region: REGION, cors: true, invoker: "public", memory: "512MiB" },
  async (request) => {
    const uid = requireAuth(request.auth?.uid);
    const input = row(request.data);
    const orgId = requireId(input.orgId, "orgId");
    const period = getPeriod(input.period);
    const work = await loadStudentWork({ uid, orgId, period });
    const students = work.contexts
      .map((context) => buildSummary({ context, displayName: work.displayNames.get(context.studentId) || context.studentId, actor: work.actor, rowsByCollection: work.rowsByCollection, period }))
      .sort((left, right) => left.displayName.localeCompare(right.displayName, "ar"));
    return { orgId, period, students };
  },
);

export const getStudentWorkDetail = onCall(
  { region: REGION, cors: true, invoker: "public", memory: "512MiB" },
  async (request) => {
    const uid = requireAuth(request.auth?.uid);
    const input = row(request.data);
    const orgId = requireId(input.orgId, "orgId");
    const studentId = requireId(input.studentId, "studentId");
    const schoolId = requireId(input.schoolId, "schoolId");
    const academicYearId = requireId(input.academicYearId, "academicYearId");
    const classId = requireId(input.classId, "classId");
    const period = getPeriod(input.period);
    const work = await loadStudentWork({ uid, orgId, period });
    const context = work.contexts.find((item) =>
      item.studentId === studentId && item.schoolId === schoolId && item.academicYearId === academicYearId && item.classId === classId,
    );
    if (!context) throw new HttpsError("not-found", "Student is not enrolled in an authorized active class.");
    return {
      orgId,
      period,
      student: buildSummary({ context, displayName: work.displayNames.get(studentId) || studentId, actor: work.actor, rowsByCollection: work.rowsByCollection, period }),
      drillDowns: buildDrillDowns({ context, actor: work.actor, rowsByCollection: work.rowsByCollection, period }),
    };
  },
);
