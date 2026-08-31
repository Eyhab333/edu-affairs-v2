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
import { getActorSupervisionSchoolIds } from "../access/get-actor-supervision-school-ids";

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
  summary: string[];
  details: Array<{ label: string; value: string }>;
};

type StudentWorkDrillDowns = Record<
  StudentWorkModuleKey,
  StudentWorkDrillDownItem[]
>;

type StudentWorkActor = {
  visibleClasses: Class[];
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
  const [operationalSnapshot, teacherSnapshot, schoolsSnapshot, supervisionSchoolIds] = await Promise.all([
    db.collection(`orgs/${params.orgId}/operationalAssignments`).where("actorPersonId", "==", personId).get(),
    db.collection(`orgs/${params.orgId}/teacherAssignments`).where("teacherPersonId", "==", personId).get(),
    db.collection(`orgs/${params.orgId}/schools`).get(),
    getActorSupervisionSchoolIds({ orgId: params.orgId, personId }),
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
      supervisionSchoolIds,
    },
    classes,
    teacherAssignmentClassLinks,
  });
  return {
    visibleClasses,
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

async function loadPersonDisplayNames(params: { orgId: string; personIds: string[] }) {
  const db = getFirestore();
  const snapshots = await Promise.all(
    params.personIds.map((personId) => db.doc(`orgs/${params.orgId}/people/${personId}`).get()),
  );
  return new Map(snapshots.map((snapshot) => [
    snapshot.id,
    snapshot.exists ? readString(row(snapshot.data()), ["displayName", "fullName", "nameAr", "name"]) : "",
  ]));
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

function canReadRow(params: { context: EnrollmentContext; data: Row }) {
  if (
    readString(params.data, ["studentId"]) !== params.context.studentId ||
    readString(params.data, ["schoolId"]) !== params.context.schoolId ||
    readString(params.data, ["academicYearId"]) !== params.context.academicYearId ||
    readString(params.data, ["classId"]) !== params.context.classId
  ) return false;

  return true;
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

function recordTitle(data: Row, fallback: string) {
  return readString(data, ["title", "templateTitle", "topicTitle", "lessonTitle", "homeworkTitle", "planTitle", "reasonTitle"]) || fallback;
}

function formatDate(value: unknown) {
  const timestamp = numberValue(value);
  return timestamp === null ? "" : new Date(timestamp).toISOString().slice(0, 10);
}

function formatArabicDate(value: unknown) {
  const timestamp = numberValue(value);
  return timestamp === null
    ? "غير محدد"
    : new Intl.DateTimeFormat("ar-SA", { dateStyle: "medium" }).format(
        new Date(timestamp),
      );
}

const SUBJECT_LABELS: Record<string, string> = {
  ARABIC: "اللغة العربية",
  ENGLISH: "اللغة الإنجليزية",
  MATH: "رياضيات",
  SCIENCE: "علوم",
  QURAN: "القرآن الكريم",
  ISLAMIC_STUDIES: "الدراسات الإسلامية",
  QURAN_AND_ISLAMIC_STUDIES: "القرآن والدراسات الإسلامية",
  SOCIAL_STUDIES: "الدراسات الاجتماعية",
  LIFE_SKILLS: "المهارات الحياتية",
  ART: "التربية الفنية",
  PE: "التربية البدنية",
  COMPUTER: "الحاسب الآلي",
};

const MEASUREMENT_KIND_LABELS: Record<string, string> = {
  KG_TEACHER_MEASUREMENT: "قياس المعلم لرياض الأطفال",
  KG_VP_MEASUREMENT: "قياس وكيل رياض الأطفال",
  KG_MEASUREMENT_1: "القياس الأول لرياض الأطفال",
  KG_MEASUREMENT_2: "القياس الثاني لرياض الأطفال",
  KG_MEASUREMENT_3: "القياس الثالث لرياض الأطفال",
  KG_VALUES_ASSESSMENT: "قياس القيم لرياض الأطفال",
  KG_CORNERS_ASSESSMENT: "قياس الأركان لرياض الأطفال",
  PRIMARY_DIAGNOSTIC_TEST: "اختبار تشخيصي أولي",
  PRIMARY_DIAGNOSTIC: "اختبار تشخيصي أولي",
  PRIMARY_PERIODIC_TEST_1: "اختبار دوري أول",
  PRIMARY_PERIODIC_1: "اختبار دوري أول",
  PRIMARY_PERIODIC_TEST_2: "اختبار دوري ثانٍ",
  PRIMARY_PERIODIC_2: "اختبار دوري ثانٍ",
  PRIMARY_CENTRAL_MEASUREMENT_1: "قياس مركزي أول",
  PRIMARY_CENTRAL_1: "قياس مركزي أول",
  PRIMARY_CENTRAL_MEASUREMENT_2: "قياس مركزي ثانٍ",
  PRIMARY_CENTRAL_2: "قياس مركزي ثانٍ",
  CUSTOM_ASSESSMENT: "قياس مخصص",
  KG_QURAN_TRACKER: "متابعة القرآن لرياض الأطفال",
  KG_LEARNING_GARDENS_TRACKER: "متابعة حدائق التعلم",
  KG_NUMBERS_TRACKER: "متابعة الأرقام",
  KG_VALUES_TRACKER: "متابعة القيم",
  KG_CORNERS_TRACKER: "متابعة الأركان",
  KG_LOSS_TRACKER: "متابعة الفاقد التعليمي لرياض الأطفال",
  PRIMARY_QURAN_TRACKER: "متابعة القرآن الكريم",
  PRIMARY_LOSS_TRACKER: "متابعة الفاقد التعليمي",
  CUSTOM_TRACKER: "متابعة مخصصة",
};

function subjectLabel(data: Row) {
  const subjectKey = readString(data, ["subjectKey"]);

  return (
    SUBJECT_LABELS[subjectKey] ||
    readString(data, ["subjectTitle", "subjectTitleSnapshot"]) ||
    "غير محددة"
  );
}

function measurementKindLabel(data: Row, tracker: boolean) {
  const kind = readString(data, ["kind", "assessmentSlot"]);
  return MEASUREMENT_KIND_LABELS[kind] || (tracker ? "متابعة طالب" : "قياس طالب");
}

function measurementTesterPersonId(data: Row) {
  return readString(data, ["assessedByPersonId", "recordedByPersonId"]);
}

function formatScore(data: Row) {
  const score = numberValue(data.score);
  const maxScore = numberValue(data.maxScore);
  return score === null ? "" : maxScore === null ? String(score) : `${score}/${maxScore}`;
}

function formatPercentage(data: Row) {
  const score = numberValue(data.score);
  const maxScore = numberValue(data.maxScore);
  return score === null || maxScore === null || maxScore <= 0 ? "" : `${Math.round((score / maxScore) * 100)}%`;
}

function field(label: string, value: unknown) {
  const normalized = typeof value === "string" ? value.trim() : value === null || value === undefined ? "" : String(value);
  return normalized ? { label, value: normalized } : null;
}

function fields(...items: Array<{ label: string; value: string } | null>) {
  return items.filter((item): item is { label: string; value: string } => item !== null);
}

function yesNo(value: unknown) {
  return value === true ? "نعم" : value === false ? "لا" : "";
}

function itemScoreText(value: unknown) {
  if (!Array.isArray(value)) return "";
  return value.map((item) => {
    const score = row(item);
    const result = formatScore(score) || readString(score, ["level", "valueText"]) || yesNo(score.passed);
    const note = readString(score, ["note"]);
    return [readString(score, ["itemTitle"]), result, note].filter(Boolean).join(" — ");
  }).filter(Boolean).join("\n");
}

function learningLossSkills(value: unknown) {
  if (!Array.isArray(value)) return "";
  return value.map((item) => {
    const skill = row(item);
    return [readString(skill, ["title"]), readString(skill, ["domain", "severity", "description"])].filter(Boolean).join(" — ");
  }).filter(Boolean).join("\n");
}

function remediationActions(value: unknown) {
  if (!Array.isArray(value)) return "";
  return value.map((item) => {
    const action = row(item);
    return [
      readString(action, ["title"]),
      readString(action, ["status"]),
      formatDate(action.dueAt) ? `الاستحقاق: ${formatDate(action.dueAt)}` : "",
      readString(action, ["description", "note"]),
    ].filter(Boolean).join(" — ");
  }).filter(Boolean).join("\n");
}

function drillDownItem(params: { collectionName: string; data: Row; personNames: Map<string, string> }): { key: StudentWorkModuleKey; item: StudentWorkDrillDownItem } | null {
  const { collectionName, data } = params;
  if (collectionName === "studentAttendanceRecords") {
    const at = activityAt(data, ["recordedAt", "updatedAt", "createdAt"]);
    return { key: "attendance", item: {
      id: text(data.id), title: "سجل حضور", status: text(data.status), activityAt: at,
      summary: [readString(data, ["source"]), formatDate(at)].filter(Boolean),
      details: fields(field("التاريخ", formatDate(at)), field("الحالة", text(data.status)), field("المصدر", readString(data, ["source"])), field("دقائق التأخر", numberValue(data.lateMinutes)), field("دقائق الانصراف المبكر", numberValue(data.leftEarlyMinutes)), field("العذر", readString(data, ["excuseReason"])), field("ملاحظة", readString(data, ["note"]))),
    }};
  }
  if (collectionName === "studentAssessmentRecords" || collectionName === "studentTrackerEntries") {
    const at = measurementActivity(data, collectionName);
    const tracker = collectionName === "studentTrackerEntries";
    const testerName =
      params.personNames.get(measurementTesterPersonId(data)) || "غير محدد";
    return { key: "measurements", item: {
      id: text(data.id), title: recordTitle(data, tracker ? "متابعة" : "قياس"), status: text(data.status), activityAt: at,
      summary: [subjectLabel(data), formatScore(data) || "غير متاح", measurementKindLabel(data, tracker), formatArabicDate(at)],
      details: fields(field("المعلم المختبر", testerName), field("المادة", subjectLabel(data)), field("التاريخ", formatArabicDate(at)), field("النتيجة", formatScore(data) || "غير متاح"), field("نوع القياس", measurementKindLabel(data, tracker)), field("النسبة", formatPercentage(data)), field("المستوى", readString(data, ["level"])), field("القيمة", readString(data, ["valueText"])), field("مكتمل", yesNo(data.completed)), field("مجتاز", yesNo(data.passed)), field("يتطلب متابعة فاقد", yesNo(data.needsLearningLossFollowUp)), field("سبب المتابعة", readString(data, ["learningLossTriggerReason"])), field("تفاصيل البنود", itemScoreText(data.itemScores)), field("ملاحظات", readString(data, ["notes"]))),
    }};
  }
  if (collectionName === "studentLearningLossPlans") {
    const at = activityAt(data, ["updatedAt", "createdAt", "planStartAt"]);
    return { key: "learningLoss", item: {
      id: text(data.id), title: recordTitle(data, "خطة فاقد تعليمي"), status: text(data.status), activityAt: at,
      summary: [readString(data, ["subjectKey"]), numberValue(data.improvementPercentage) === null ? "" : `${numberValue(data.improvementPercentage)}%`, formatDate(at)].filter(Boolean),
      details: fields(field("المادة", readString(data, ["subjectKey"])), field("بداية الخطة", formatDate(data.planStartAt)), field("نهاية الخطة", formatDate(data.planEndAt)), field("نص الخطة", readString(data, ["planText"])), field("المهارات المفقودة", learningLossSkills(data.lostSkills)), field("إجراءات المعالجة", remediationActions(data.remediationActions)), field("القياس الأساسي", [numberValue(data.baselineScore), numberValue(data.baselineMaxScore)].every((value) => value === null) ? "" : `${numberValue(data.baselineScore) ?? ""}/${numberValue(data.baselineMaxScore) ?? ""}`), field("تاريخ القياس الأساسي", formatDate(data.baselineMeasuredAt)), field("القياس الأول", [numberValue(data.firstCheckScore), numberValue(data.firstCheckMaxScore)].every((value) => value === null) ? "" : `${numberValue(data.firstCheckScore) ?? ""}/${numberValue(data.firstCheckMaxScore) ?? ""}`), field("ملاحظة القياس الأول", readString(data, ["firstCheckNote"])), field("القياس الثاني", [numberValue(data.secondCheckScore), numberValue(data.secondCheckMaxScore)].every((value) => value === null) ? "" : `${numberValue(data.secondCheckScore) ?? ""}/${numberValue(data.secondCheckMaxScore) ?? ""}`), field("ملاحظة القياس الثاني", readString(data, ["secondCheckNote"])), field("مؤشر التحسن", readString(data, ["improvementIndicator"])), field("نسبة التحسن", numberValue(data.improvementPercentage) === null ? "" : `${numberValue(data.improvementPercentage)}%`), field("فرق التحسن", numberValue(data.improvementDelta)), field("ملاحظة", readString(data, ["note"])), field("ملاحظة الإغلاق", readString(data, ["closeNote"]))),
    }};
  }
  if (collectionName === "studentHomeworkSubmissions") {
    const at = activityAt(data, ["gradedAt", "submittedAt", "updatedAt", "createdAt"]);
    return { key: "homework", item: {
      id: text(data.id), title: recordTitle(data, "واجب"), status: text(data.status), activityAt: at,
      summary: [readString(data, ["subjectKey"]), formatScore(data), data.isLate === true ? "متأخر" : "", formatDate(at)].filter(Boolean),
      details: fields(field("المادة", readString(data, ["subjectKey"])), field("تاريخ الاستحقاق", formatDate(data.homeworkDueAt)), field("تاريخ البدء", formatDate(data.startedAt)), field("تاريخ التسليم", formatDate(data.submittedAt)), field("تاريخ التصحيح", formatDate(data.gradedAt)), field("الحالة", text(data.status)), field("النتيجة", formatScore(data)), field("النسبة", formatPercentage(data)), field("تسليم متأخر", yesNo(data.isLate)), field("ملاحظات المصحح", readString(data, ["feedback"])), field("ملاحظة", readString(data, ["note"]))),
    }};
  }
  if (collectionName === "studentGamificationEvents") {
    const at = activityAt(data, ["occurredAt", "updatedAt", "createdAt"]);
    return { key: "gamification", item: {
      id: text(data.id), title: recordTitle(data, "حدث تحفيزي"), status: text(data.status), activityAt: at,
      summary: [readString(data, ["subjectKey"]), `النقاط: ${numberValue(data.value) ?? 0}`, readString(data, ["badgeTitle"]), formatDate(at)].filter(Boolean),
      details: fields(field("المادة", readString(data, ["subjectKey"])), field("السبب", readString(data, ["reasonTitle"])), field("الفئة", readString(data, ["categoryTitle", "category"])), field("القيمة", numberValue(data.value)), field("نوع القيمة", readString(data, ["valueKind"])), field("الشارة", readString(data, ["badgeTitle"])), field("الظهور", readString(data, ["visibility"])), field("التاريخ", formatDate(at)), field("الوصف", readString(data, ["description"])), field("ملاحظة", readString(data, ["note"]))),
    }};
  }
  if (collectionName === "studentNotes") {
    const at = activityAt(data, ["recordedAt", "updatedAt", "createdAt"]);
    return { key: "notes", item: {
      id: text(data.id), title: recordTitle(data, "ملاحظة"), status: readString(data, ["followUpStatus", "status"]) || "RECORDED", activityAt: at,
      summary: [readString(data, ["category", "priority"]), formatDate(at)].filter(Boolean),
      details: fields(field("النص", readString(data, ["body"])), field("الفئة", readString(data, ["category"])), field("الأولوية", readString(data, ["priority"])), field("سجلها", params.personNames.get(readString(data, ["recordedByPersonId"])) || ""), field("الحالة", readString(data, ["status"])), field("الظهور", readString(data, ["visibility"])), field("حالة المتابعة", readString(data, ["followUpStatus"])), field("تاريخ المتابعة", formatDate(data.followUpAt)), field("ملاحظة المتابعة", readString(data, ["followUpNote"])), field("تاريخ التسجيل", formatDate(data.recordedAt)), field("تاريخ الإنشاء", formatDate(data.createdAt))),
    }};
  }
  return null;
}

function buildSummary(params: { context: EnrollmentContext; displayName: string; rowsByCollection: Map<(typeof STUDENT_WORK_COLLECTIONS)[number], Row[]>; period: StudentWorkPeriod }): StudentWorkSummary {
  const metrics = emptyMetrics();
  const startAt = periodStart(params.period);
  for (const collectionName of STUDENT_WORK_COLLECTIONS) {
    for (const data of params.rowsByCollection.get(collectionName) ?? []) {
      if (!canReadRow({ context: params.context, data })) continue;
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

function buildDrillDowns(params: { context: EnrollmentContext; rowsByCollection: Map<(typeof STUDENT_WORK_COLLECTIONS)[number], Row[]>; personNames: Map<string, string>; period: StudentWorkPeriod }) {
  const startAt = periodStart(params.period);
  const drillDowns = emptyDrillDowns();
  for (const collectionName of STUDENT_WORK_COLLECTIONS) {
    for (const data of params.rowsByCollection.get(collectionName) ?? []) {
      if (!canReadRow({ context: params.context, data })) continue;
      const item = drillDownItem({ collectionName, data, personNames: params.personNames });
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
      .map((context) => buildSummary({ context, displayName: work.displayNames.get(context.studentId) || context.studentId, rowsByCollection: work.rowsByCollection, period }))
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
    const personIds = Array.from(new Set([
      ...(work.rowsByCollection.get("studentNotes") ?? [])
        .filter((data) => canReadRow({ context, data }))
        .map((data) => readString(data, ["recordedByPersonId"])),
      ...(work.rowsByCollection.get("studentAssessmentRecords") ?? [])
        .filter((data) => canReadRow({ context, data }))
        .map(measurementTesterPersonId),
      ...(work.rowsByCollection.get("studentTrackerEntries") ?? [])
        .filter((data) => canReadRow({ context, data }))
        .map(measurementTesterPersonId),
    ].filter(Boolean)));
    const personNames = await loadPersonDisplayNames({ orgId, personIds });
    return {
      orgId,
      period,
      student: buildSummary({ context, displayName: work.displayNames.get(studentId) || studentId, rowsByCollection: work.rowsByCollection, period }),
      drillDowns: buildDrillDowns({ context, rowsByCollection: work.rowsByCollection, personNames, period }),
    };
  },
);
