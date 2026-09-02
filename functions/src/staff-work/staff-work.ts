import { getFirestore } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import {
  MembershipRole,
  PersonSupervisionScopeSchema,
  type MembershipRole as MembershipRoleType,
  type PersonSupervisionScope,
} from "@takween/contracts";
import { getPersonSupervisionSchoolIds } from "@takween/domain";

const REGION = "me-central2";
const STAFF_ROLE_KEYS = new Set<MembershipRoleType>([
  "BOYS_PRINCIPAL",
  "GIRLS_PRINCIPAL",
  "KG_PRINCIPAL",
  "BOYS_EDU_VP",
  "EDU_SUPERVISOR",
  "BOYS_EDU_SUPERVISOR",
  "GIRLS_EDU_SUPERVISOR",
  "KG_EDU_SUPERVISOR",
  "BOYS_STUDENTS_VP",
]);

const ROLE_LABELS: Partial<Record<MembershipRoleType, string>> = {
  BOYS_PRINCIPAL: "مدير المدرسة (بنين)",
  GIRLS_PRINCIPAL: "مديرة المدرسة (بنات)",
  KG_PRINCIPAL: "مديرة الروضة",
  BOYS_EDU_VP: "وكيل الشؤون التعليمية",
  EDU_SUPERVISOR: "مشرف تربوي",
  BOYS_EDU_SUPERVISOR: "مشرف تربوي (بنين)",
  GIRLS_EDU_SUPERVISOR: "مشرفة تربوية (بنات)",
  KG_EDU_SUPERVISOR: "مشرفة تربوية (روضة)",
  BOYS_STUDENTS_VP: "وكيل شؤون الطلاب",
};

type Row = Record<string, unknown>;
type StaffWorkPeriod = "WEEK" | "MONTH" | "ALL";
type StaffWorkMetricKey =
  | "evaluations"
  | "performanceImprovement"
  | "studentCases"
  | "attendance"
  | "lessonPrepReview";

type StaffWorkActivity = {
  id: string;
  type: string;
  metricKey: StaffWorkMetricKey;
  personId: string;
  schoolId: string;
  activityAt: number;
  title: string;
  description: string;
  status: string;
  targetName: string;
  classLabel: string;
  sourceEntityId: string;
  href?: string;
};

type StaffWorkMetric = { count: number; latestActivityAt: number | null };
type StaffWorkSummary = {
  personId: string;
  displayName: string;
  roleKey: string;
  roleLabel: string;
  schoolIds: string[];
  schoolNames: string[];
  totalActivityCount: number;
  latestActivityAt: number | null;
  metrics: Record<StaffWorkMetricKey, StaffWorkMetric>;
};

type StaffRecord = Omit<StaffWorkSummary, "totalActivityCount" | "latestActivityAt" | "metrics">;
type Actor = { personId: string; schoolIds: string[]; schools: Array<{ id: string; name: string }> };

const metricKeys: StaffWorkMetricKey[] = [
  "evaluations",
  "performanceImprovement",
  "studentCases",
  "attendance",
  "lessonPrepReview",
];

function row(value: unknown): Row {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Row : {};
}
function text(value: unknown) { return typeof value === "string" ? value.trim() : ""; }
function timestamp(value: unknown) { return typeof value === "number" && Number.isFinite(value) ? value : null; }
function unique(values: string[]) { return [...new Set(values.map((value) => value.trim()).filter(Boolean))]; }
function id(value: unknown, name: string) {
  const result = text(value);
  if (!result || result.includes("/")) throw new HttpsError("invalid-argument", `${name} is required.`);
  return result;
}
function period(value: unknown): StaffWorkPeriod {
  return value === "WEEK" || value === "MONTH" || value === "ALL" ? value : "ALL";
}
function periodStart(value: StaffWorkPeriod) {
  if (value === "ALL") return null;
  const now = new Date();
  if (value === "WEEK") {
    now.setDate(now.getDate() - 6);
    now.setHours(0, 0, 0, 0);
    return now.getTime();
  }
  return new Date(now.getFullYear(), now.getMonth(), 1).getTime();
}
function inPeriod(activityAt: number | null, startAt: number | null) {
  return activityAt !== null && (startAt === null || activityAt >= startAt);
}
function currentYear(item: Row, academicYearId: string) {
  return !academicYearId || text(item.academicYearId) === academicYearId;
}
function role(value: unknown): MembershipRoleType | null {
  const parsed = MembershipRole.safeParse(text(value));
  return parsed.success ? parsed.data : null;
}
function active(item: Row, now: number) {
  if (item.isActive === false || item.active === false || text(item.status) === "INACTIVE") return false;
  const startAt = timestamp(item.startAt);
  const endAt = timestamp(item.endAt);
  return !(startAt !== null && startAt > now) && !(endAt !== null && endAt < now);
}
function emptyMetrics(): Record<StaffWorkMetricKey, StaffWorkMetric> {
  return Object.fromEntries(metricKeys.map((key) => [key, { count: 0, latestActivityAt: null }])) as Record<StaffWorkMetricKey, StaffWorkMetric>;
}

async function resolveActor(params: { uid: string; orgId: string }): Promise<Actor> {
  const db = getFirestore();
  const membership = await db.doc(`users/${params.uid}/orgMemberships/${params.orgId}`).get();
  if (!membership.exists) throw new HttpsError("permission-denied", "Organization membership was not found.");
  const member = row(membership.data());
  const personId = text(member.personId);
  if (!personId || !active(member, Date.now())) throw new HttpsError("permission-denied", "An active staff membership is required.");

  const scopeSnapshot = await db.collection(`orgs/${params.orgId}/personSupervisionScopes`).where("personId", "==", personId).get();
  const scopes: PersonSupervisionScope[] = scopeSnapshot.docs.flatMap((item) => {
    const parsed = PersonSupervisionScopeSchema.safeParse({ id: item.id, ...item.data() });
    return parsed.success ? [parsed.data] : [];
  });
  const schoolIds = getPersonSupervisionSchoolIds({ scopes, orgId: params.orgId, personId, capability: "STAFF_WORK_VIEW" });
  if (!schoolIds.length) throw new HttpsError("permission-denied", "Staff work monitoring access is required.");
  const schoolSnapshots = await Promise.all(schoolIds.map((schoolId) => db.doc(`orgs/${params.orgId}/schools/${schoolId}`).get()));
  const schools = schoolSnapshots.filter((item) => item.exists).map((item) => ({ id: item.id, name: text(item.data()?.name) || item.id }));
  if (!schools.length) throw new HttpsError("permission-denied", "No active staff-work school scope is available.");
  return { personId, schoolIds: schools.map((item) => item.id), schools };
}

async function rowsForSchools(params: { orgId: string; collectionName: string; schoolIds: string[] }) {
  const db = getFirestore();
  const snapshots = await Promise.all(params.schoolIds.map((schoolId) => db.collection(`orgs/${params.orgId}/${params.collectionName}`).where("schoolId", "==", schoolId).get()));
  return snapshots.flatMap((snapshot) => snapshot.docs.map((document) => ({ id: document.id, ...document.data() }) as Row));
}

async function listEligibleStaff(params: { orgId: string; actor: Actor; academicYearId: string }) {
  const db = getFirestore();
  const now = Date.now();
  const records = new Map<string, { personId: string; roleKey: MembershipRoleType; schoolIds: string[] }>();
  const add = (personId: string, roleKey: MembershipRoleType | null, schoolId: string) => {
    if (!personId || !roleKey || !STAFF_ROLE_KEYS.has(roleKey) || !params.actor.schoolIds.includes(schoolId)) return;
    const existing = records.get(personId);
    if (existing) { existing.schoolIds = unique([...existing.schoolIds, schoolId]); return; }
    records.set(personId, { personId, roleKey, schoolIds: [schoolId] });
  };
  const assignmentRows = await rowsForSchools({ orgId: params.orgId, collectionName: "operationalAssignments", schoolIds: params.actor.schoolIds });
  for (const assignment of assignmentRows) {
    if (!active(assignment, now) || !currentYear(assignment, params.academicYearId)) continue;
    add(text(assignment.actorPersonId), role(assignment.actorRoleKey), text(assignment.schoolId));
  }
  const membershipSnapshots = await Promise.all(params.actor.schoolIds.flatMap((schoolId) => [
    db.collectionGroup("orgMemberships").where("orgId", "==", params.orgId).where("scopeType", "==", "SCHOOL").where("scopeId", "==", schoolId).get(),
    db.collectionGroup("orgMemberships").where("orgId", "==", params.orgId).where("scopes.schoolIds", "array-contains", schoolId).get(),
  ]));
  for (const snapshot of membershipSnapshots) for (const document of snapshot.docs) {
    const membership = row(document.data());
    if (!active(membership, now)) continue;
    const schoolId = text(membership.scopeType) === "SCHOOL" ? text(membership.scopeId) : "";
    const membershipScopes = row(membership.scopes);
    const scopedSchoolIds = Array.isArray(membershipScopes.schoolIds)
      ? membershipScopes.schoolIds.filter(
          (item: unknown): item is string => typeof item === "string",
        )
      : [];
    const membershipSchoolIds = unique([schoolId, ...scopedSchoolIds]);
    for (const scopedSchoolId of membershipSchoolIds) add(text(membership.personId), role(membership.roleKey) || role(membership.role), scopedSchoolId);
  }
  const people = [...records.values()];
  const personSnapshots = people.length ? await db.getAll(...people.map((item) => db.doc(`orgs/${params.orgId}/people/${item.personId}`))) : [];
  const names = new Map(personSnapshots.map((snapshot) => [snapshot.id, text(snapshot.data()?.displayName)]));
  const schoolNameById = new Map(params.actor.schools.map((school) => [school.id, school.name]));
  return people.map<StaffRecord>((item) => ({
    personId: item.personId,
    displayName: names.get(item.personId) || "موظف غير محدد",
    roleKey: item.roleKey,
    roleLabel: ROLE_LABELS[item.roleKey] || item.roleKey,
    schoolIds: item.schoolIds,
    schoolNames: item.schoolIds.map((schoolId) => schoolNameById.get(schoolId) || schoolId),
  }));
}

function addActivity(result: StaffWorkActivity[], item: Omit<StaffWorkActivity, "id">) {
  if (!item.personId || !item.schoolId || !item.activityAt) return;
  result.push({ ...item, id: `${item.type}:${item.sourceEntityId}:${item.personId}:${item.activityAt}` });
}

async function collectActivities(params: { orgId: string; actor: Actor; staffIds: Set<string>; academicYearId: string; period: StaffWorkPeriod }) {
  const startAt = periodStart(params.period);
  const activities: StaffWorkActivity[] = [];
  const [evaluations, plans, cases, attendance, lessonPreps] = await Promise.all([
    rowsForSchools({ orgId: params.orgId, collectionName: "evaluationSubmissions", schoolIds: params.actor.schoolIds }),
    rowsForSchools({ orgId: params.orgId, collectionName: "performanceImprovementPlans", schoolIds: params.actor.schoolIds }),
    rowsForSchools({ orgId: params.orgId, collectionName: "studentCases", schoolIds: params.actor.schoolIds }),
    rowsForSchools({ orgId: params.orgId, collectionName: "studentAttendanceBatches", schoolIds: params.actor.schoolIds }),
    rowsForSchools({ orgId: params.orgId, collectionName: "subjectLessonPreps", schoolIds: params.actor.schoolIds }),
  ]);
  for (const item of evaluations) {
    if (!currentYear(item, params.academicYearId)) continue;
    const targetName = text(item.targetDisplayName) || text(item.targetPersonId);
    const submittedAt = timestamp(item.submittedAt) ?? timestamp(item.updatedAt);
    if (["SUBMITTED", "APPROVED"].includes(text(item.status)) && params.staffIds.has(text(item.evaluatorPersonId)) && inPeriod(submittedAt, startAt)) addActivity(activities, { type: "EVALUATION_SUBMITTED", metricKey: "evaluations", personId: text(item.evaluatorPersonId), schoolId: text(item.schoolId), activityAt: submittedAt!, title: "إرسال تقييم", description: text(item.cycleTitle) || text(item.planTitle), status: text(item.status), targetName, classLabel: "", sourceEntityId: text(item.id), href: "/staff/evaluations" });
    const approvedAt = timestamp(item.approvedAt);
    if (params.staffIds.has(text(item.approvedByPersonId)) && inPeriod(approvedAt, startAt)) addActivity(activities, { type: "EVALUATION_APPROVED", metricKey: "evaluations", personId: text(item.approvedByPersonId), schoolId: text(item.schoolId), activityAt: approvedAt!, title: "اعتماد تقييم", description: text(item.cycleTitle) || text(item.planTitle), status: text(item.status), targetName, classLabel: "", sourceEntityId: text(item.id), href: "/staff/evaluations" });
  }
  for (const item of plans) {
    if (!currentYear(item, params.academicYearId)) continue;
    const targetName = text(item.targetDisplayName) || text(item.targetPersonId);
    const addPlan = (type: string, personId: string, at: number | null, title: string, sourceEntityId: string, description = "") => {
      if (params.staffIds.has(personId) && inPeriod(at, startAt)) addActivity(activities, { type, metricKey: "performanceImprovement", personId, schoolId: text(item.schoolId), activityAt: at!, title, description, status: text(item.status), targetName, classLabel: "", sourceEntityId, href: "/staff/performance-improvement" });
    };
    addPlan("PERFORMANCE_PLAN_CREATED", text(item.createdByPersonId), timestamp(item.createdAt), "إنشاء خطة تحسين أداء", text(item.id), text(item.objective));
    for (const action of Array.isArray(item.actions) ? item.actions.map(row) : []) addPlan("PERFORMANCE_ACTION_COMPLETED", text(action.completedByPersonId), timestamp(action.completedAt), "إكمال إجراء في خطة التحسين", `${text(item.id)}:${text(action.id)}`, text(action.title));
    for (const followUp of Array.isArray(item.followUps) ? item.followUps.map(row) : []) addPlan("PERFORMANCE_FOLLOW_UP_RECORDED", text(followUp.recordedByPersonId), timestamp(followUp.recordedAt), "تسجيل متابعة لخطة التحسين", `${text(item.id)}:${text(followUp.id)}`, text(followUp.note));
    addPlan("PERFORMANCE_PLAN_CLOSED", text(item.closedByPersonId), timestamp(item.closedAt), "إغلاق خطة تحسين أداء", text(item.id), text(item.closureNote));
    addPlan("PERFORMANCE_PLAN_ESCALATED", text(item.escalatedByPersonId), timestamp(item.escalatedAt), "تصعيد خطة تحسين أداء", text(item.id), text(item.escalationReason));
  }
  const caseEvents = await Promise.all(params.actor.schoolIds.map((schoolId) => getFirestore().collectionGroup("events").where("orgId", "==", params.orgId).where("schoolId", "==", schoolId).get()));
  const createdEvents = new Set<string>();
  const caseById = new Map(cases.map((item) => [text(item.id), item]));
  const caseLabels: Record<string, string> = { CREATED: "إنشاء حالة طلابية", REFERRED: "إحالة حالة طلابية", ACTION_ADDED: "إضافة إجراء لحالة", PARENT_CONTACTED: "تسجيل تواصل مع ولي الأمر", TRANSFERRED: "تحويل حالة طلابية", ESCALATED: "تصعيد حالة طلابية", RETURNED: "إعادة حالة طلابية", RESOLVED: "حل حالة طلابية", CLOSED: "إغلاق حالة طلابية", REOPENED: "إعادة فتح حالة طلابية", CANCELLED: "إلغاء حالة طلابية" };
  for (const snapshot of caseEvents) for (const document of snapshot.docs) {
    const pathParts = document.ref.path.split("/");
    if (pathParts[2] !== "studentCases" || pathParts[4] !== "events") continue;
    const event = { id: document.id, ...document.data() } as Row;
    if (!currentYear(event, params.academicYearId) || !caseLabels[text(event.eventType)] || !params.staffIds.has(text(event.createdByPersonId))) continue;
    const at = timestamp(event.createdAt);
    if (!inPeriod(at, startAt)) continue;
    if (text(event.eventType) === "CREATED") createdEvents.add(`${text(event.caseId)}:${text(event.createdByPersonId)}`);
    const studentCase = caseById.get(text(event.caseId));
    addActivity(activities, { type: `STUDENT_CASE_${text(event.eventType)}`, metricKey: "studentCases", personId: text(event.createdByPersonId), schoolId: text(event.schoolId), activityAt: at!, title: caseLabels[text(event.eventType)], description: "", status: text(event.statusAfter), targetName: text(studentCase?.studentDisplayName), classLabel: text(studentCase?.classTitle), sourceEntityId: text(event.caseId) || text(event.id), href: text(event.caseId) ? `/staff/cases/${encodeURIComponent(text(event.caseId))}` : undefined });
  }
  for (const item of cases) {
    const personId = text(item.createdByPersonId); const at = timestamp(item.createdAt);
    if (currentYear(item, params.academicYearId) && params.staffIds.has(personId) && !createdEvents.has(`${text(item.id)}:${personId}`) && inPeriod(at, startAt)) addActivity(activities, { type: "STUDENT_CASE_CREATED", metricKey: "studentCases", personId, schoolId: text(item.schoolId), activityAt: at!, title: "إنشاء حالة طلابية", description: "", status: text(item.status), targetName: text(item.studentDisplayName), classLabel: text(item.classTitle), sourceEntityId: text(item.id), href: `/staff/cases/${encodeURIComponent(text(item.id))}` });
  }
  for (const item of attendance) {
    const at = timestamp(item.recordedAt) ?? timestamp(item.submittedAt) ?? timestamp(item.createdAt); const personId = text(item.createdByPersonId);
    if (currentYear(item, params.academicYearId) && params.staffIds.has(personId) && inPeriod(at, startAt)) addActivity(activities, { type: "ATTENDANCE_BATCH_RECORDED", metricKey: "attendance", personId, schoolId: text(item.schoolId), activityAt: at!, title: "تسجيل دفعة حضور", description: text(item.schoolDayId), status: text(item.status), targetName: "", classLabel: text(item.classTitle) || text(item.classId), sourceEntityId: text(item.id), href: `/staff/attendance/batches/${encodeURIComponent(text(item.id))}` });
  }
  for (const item of lessonPreps) {
    if (!currentYear(item, params.academicYearId)) continue;
    const approvedAt = timestamp(item.approvedAt); const returnedAt = timestamp(item.returnedAt);
    if (params.staffIds.has(text(item.approvedByPersonId)) && inPeriod(approvedAt, startAt)) addActivity(activities, { type: "LESSON_PREP_APPROVED", metricKey: "lessonPrepReview", personId: text(item.approvedByPersonId), schoolId: text(item.schoolId), activityAt: approvedAt!, title: "اعتماد تحضير درس", description: text(item.lessonTitle), status: text(item.status), targetName: text(item.teacherDisplayName), classLabel: text(item.classTitle) || text(item.classId), sourceEntityId: text(item.id) });
    if (params.staffIds.has(text(item.returnedByPersonId)) && inPeriod(returnedAt, startAt)) addActivity(activities, { type: "LESSON_PREP_RETURNED", metricKey: "lessonPrepReview", personId: text(item.returnedByPersonId), schoolId: text(item.schoolId), activityAt: returnedAt!, title: "إعادة تحضير للتعديل", description: text(item.lessonTitle), status: text(item.status), targetName: text(item.teacherDisplayName), classLabel: text(item.classTitle) || text(item.classId), sourceEntityId: text(item.id) });
  }
  return activities.sort((a, b) => b.activityAt - a.activityAt);
}

async function staffWork(params: { uid: string; input: Row }) {
  const orgId = id(params.input.orgId, "orgId");
  const academicYearId = text(params.input.academicYearId);
  const selectedPeriod = period(params.input.period);
  const actor = await resolveActor({ uid: params.uid, orgId });
  const staff = await listEligibleStaff({ orgId, actor, academicYearId });
  const activities = await collectActivities({ orgId, actor, staffIds: new Set(staff.map((item) => item.personId)), academicYearId, period: selectedPeriod });
  const summaries = staff.map<StaffWorkSummary>((item) => {
    const personActivities = activities.filter((activity) => activity.personId === item.personId);
    const metrics = emptyMetrics();
    for (const activity of personActivities) { metrics[activity.metricKey].count += 1; metrics[activity.metricKey].latestActivityAt = Math.max(metrics[activity.metricKey].latestActivityAt ?? 0, activity.activityAt); }
    return { ...item, totalActivityCount: personActivities.length, latestActivityAt: personActivities[0]?.activityAt ?? null, metrics };
  }).sort((left, right) => left.displayName.localeCompare(right.displayName, "ar"));
  return { academicYearId, period: selectedPeriod, allowedSchoolIds: actor.schoolIds, summaries, activities };
}

export const getStaffWorkOverview = onCall({ region: REGION, cors: true, invoker: "public", memory: "512MiB" }, async (request) => {
  if (!request.auth?.uid) throw new HttpsError("unauthenticated", "Authentication is required.");
  const result = await staffWork({ uid: request.auth.uid, input: row(request.data) });
  return { academicYearId: result.academicYearId, period: result.period, allowedSchoolIds: result.allowedSchoolIds, staff: result.summaries };
});

export const getStaffWorkDetail = onCall({ region: REGION, cors: true, invoker: "public", memory: "512MiB" }, async (request) => {
  if (!request.auth?.uid) throw new HttpsError("unauthenticated", "Authentication is required.");
  const input = row(request.data); const personId = id(input.personId, "personId");
  const result = await staffWork({ uid: request.auth.uid, input });
  const staff = result.summaries.find((item) => item.personId === personId);
  if (!staff) throw new HttpsError("not-found", "Staff member is not available in your staff-work scope.");
  return { academicYearId: result.academicYearId, period: result.period, staff, activities: result.activities.filter((activity) => activity.personId === personId) };
});
