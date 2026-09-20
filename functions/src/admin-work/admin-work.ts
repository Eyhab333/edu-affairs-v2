import { getFirestore } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import {
  MembershipRole,
  PersonSupervisionScopeSchema,
  SchoolProfileSchema,
  type MembershipRole as MembershipRoleType,
  type PersonSupervisionScope,
} from "@takween/contracts";
import { getAdminWorkRoleInfo, getPersonSupervisionSchoolIds, isAdminWorkPrincipal } from "@takween/domain";

const REGION = "me-central2";
type Row = Record<string, unknown>;
type AdminWorkPeriod = "WEEK" | "MONTH" | "ALL";
type AdminWorkMetricKey = "evaluations" | "performanceImprovement" | "studentCases" | "attendance" | "lessonPrepReview" | "workDocumentation" | "schoolActivities";
type Metric = { count: number; latestActivityAt: number | null };
type Details =
  | { kind: "EVALUATION"; action: "SUBMITTED" | "APPROVED"; evaluationTitle: string; targetName: string; generalNote: string; status: string; submittedAt: number | null; approvedAt: number | null; totalScore: number | null; maxScore: number | null; percentage: number | null; criteria: Array<{ itemId: string; sectionId: string; itemTitle: string; sectionTitle: string; score: number | null; maxScore: number | null; valueText: string; level: string; order: number }> }
  | { kind: "PERFORMANCE_IMPROVEMENT"; targetName: string; objective: string; status: string; createdAt: number | null; startsAt: number | null; endsAt: number | null; actions: Array<{ title: string; status: string; dueAt: number | null; completedAt: number | null }>; followUps: Array<{ score: number | null; recordedAt: number | null; note: string }>; closedAt: number | null; closureNote: string; escalatedAt: number | null; escalationReason: string }
  | { kind: "STUDENT_CASE"; studentDisplayName: string; classLabel: string; eventType: string; status: string; statusBefore: string; statusAfter: string; occurredAt: number | null }
  | { kind: "ATTENDANCE"; classLabel: string; schoolDayId: string; status: string; recordedAt: number | null; submittedAt: number | null; counts: Record<string, number | null> }
  | { kind: "LESSON_PREP_REVIEW"; action: "APPROVED" | "RETURNED"; teacherName: string; lessonTitle: string; subjectLabel: string; classLabel: string; lessonDate: string; status: string; approvedAt: number | null; returnedAt: number | null; reviewNote: string }
  | { kind: "WORK_DOCUMENTATION"; templateTitle: string; templateKey: string; instanceMode: string; createdAt: number | null; updatedAt: number | null }
  | { kind: "SCHOOL_ACTIVITY"; activityTitle: string; activityKind: string; status: string; startsAt: number | null; endsAt: number | null; locationTitle: string; organizerDisplayName: string };
type Activity = { id: string; type: string; metricKey: AdminWorkMetricKey; personId: string; schoolId: string; activityAt: number; title: string; description: string; status: string; targetName: string; classLabel: string; sourceEntityId: string; details?: Details; href?: string };
type Assignment = { schoolId: string; schoolName: string; roleKey: string; roleLabel: string };
type AdminRecord = { personId: string; displayName: string; roleKey: string; roleLabel: string; schoolIds: string[]; schoolNames: string[]; assignments: Assignment[] };
type Summary = AdminRecord & { totalActivityCount: number; latestActivityAt: number | null; metrics: Record<AdminWorkMetricKey, Metric> };
type Actor = { personId: string; schoolIds: string[]; schools: Array<{ id: string; name: string; profile: Row }> };
const metricKeys: AdminWorkMetricKey[] = ["evaluations", "performanceImprovement", "studentCases", "attendance", "lessonPrepReview", "workDocumentation", "schoolActivities"];
const SECRET_TEMPLATE_KEYS = new Set(["confidential-case-study", "confidential-family-circumstances"]);
const caseLabels: Record<string, string> = { CREATED: "إنشاء حالة طلابية", REFERRED: "إحالة حالة طلابية", ACTION_ADDED: "إضافة إجراء لحالة", PARENT_CONTACTED: "تسجيل تواصل مع ولي الأمر", TRANSFERRED: "تحويل حالة طلابية", ESCALATED: "تصعيد حالة طلابية", RETURNED: "إعادة حالة طلابية", RESOLVED: "حل حالة طلابية", CLOSED: "إغلاق حالة طلابية", REOPENED: "إعادة فتح حالة طلابية", CANCELLED: "إلغاء حالة طلابية" };

function row(value: unknown): Row { return value && typeof value === "object" && !Array.isArray(value) ? value as Row : {}; }
function text(value: unknown) { return typeof value === "string" ? value.trim() : ""; }
function num(value: unknown) { return typeof value === "number" && Number.isFinite(value) ? value : null; }
function rows(value: unknown) { return Array.isArray(value) ? value.map(row) : []; }
function unique(values: string[]) { return [...new Set(values.map((value) => value.trim()).filter(Boolean))]; }
function human(value: unknown) { const result = text(value); return /^[a-z0-9]+(?:[-_][a-z0-9]+)+$/i.test(result) || /^[a-z0-9]{16,}$/i.test(result) ? "" : result; }
function id(value: unknown, name: string) { const result = text(value); if (!result || result.includes("/")) throw new HttpsError("invalid-argument", `${name} is required.`); return result; }
function period(value: unknown): AdminWorkPeriod { return value === "WEEK" || value === "MONTH" || value === "ALL" ? value : "ALL"; }
function periodStart(value: AdminWorkPeriod) { if (value === "ALL") return null; const now = new Date(); if (value === "WEEK") { now.setDate(now.getDate() - 6); now.setHours(0, 0, 0, 0); return now.getTime(); } return new Date(now.getFullYear(), now.getMonth(), 1).getTime(); }
function inPeriod(at: number | null, startAt: number | null) { return at !== null && (startAt === null || at >= startAt); }
function currentYear(item: Row, academicYearId: string) { return !academicYearId || text(item.academicYearId) === academicYearId; }
function active(item: Row, now: number) { return item.isActive !== false && item.active !== false && text(item.status) !== "INACTIVE" && !(num(item.startAt) !== null && num(item.startAt)! > now) && !(num(item.endAt) !== null && num(item.endAt)! < now); }
function parseRole(value: unknown): MembershipRoleType | null { const parsed = MembershipRole.safeParse(text(value)); return parsed.success ? parsed.data : null; }
function metrics(): Record<AdminWorkMetricKey, Metric> { return Object.fromEntries(metricKeys.map((key) => [key, { count: 0, latestActivityAt: null }])) as Record<AdminWorkMetricKey, Metric>; }
function add(result: Activity[], activity: Omit<Activity, "id">) { if (!activity.personId || !activity.schoolId || !activity.activityAt) return; result.push({ ...activity, id: `${activity.type}:${activity.sourceEntityId}:${activity.personId}:${activity.activityAt}` }); }

async function resolveActor(uid: string, orgId: string): Promise<Actor> {
  const db = getFirestore();
  const snap = await db.doc(`users/${uid}/orgMemberships/${orgId}`).get();
  const membership = row(snap.data());
  const viewerRole = parseRole(membership.roleKey ?? membership.role);
  if (!snap.exists || !active(membership, Date.now()) || !text(membership.personId) || !isAdminWorkPrincipal(viewerRole)) throw new HttpsError("permission-denied", "Principal admin-work access is required.");
  const personId = text(membership.personId);
  const scopeSnapshot = await db.collection(`orgs/${orgId}/personSupervisionScopes`).where("personId", "==", personId).get();
  const scopes: PersonSupervisionScope[] = scopeSnapshot.docs.flatMap((document) => { const parsed = PersonSupervisionScopeSchema.safeParse({ id: document.id, ...document.data() }); return parsed.success ? [parsed.data] : []; });
  const scopedIds = getPersonSupervisionSchoolIds({ scopes, orgId, personId, capability: "ADMIN_WORK_VIEW" });
  if (!scopedIds.length) throw new HttpsError("permission-denied", "Admin work monitoring access is required.");
  const schoolSnapshots = await db.getAll(...scopedIds.map((schoolId) => db.doc(`orgs/${orgId}/schools/${schoolId}`)));
  const schools = schoolSnapshots.flatMap((document) => { const school = row(document.data()); const profile = SchoolProfileSchema.safeParse(school.profile); return document.exists && school.archived !== true && text(school.status) !== "ARCHIVED" && profile.success ? [{ id: document.id, name: text(school.name) || "مدرسة غير محددة", profile: profile.data as unknown as Row }] : []; });
  if (!schools.length) throw new HttpsError("permission-denied", "No valid admin-work school scope is available.");
  return { personId, schoolIds: schools.map((school) => school.id), schools };
}

async function rowsForSchools(orgId: string, collectionName: string, schoolIds: string[]) {
  const db = getFirestore();
  const snapshots = await Promise.all(schoolIds.map((schoolId) => db.collection(`orgs/${orgId}/${collectionName}`).where("schoolId", "==", schoolId).get()));
  return snapshots.flatMap((snapshot) => snapshot.docs.map((document) => ({ id: document.id, ...document.data() }) as Row));
}

async function listEligibleAdmins(orgId: string, actor: Actor, academicYearId: string): Promise<AdminRecord[]> {
  const db = getFirestore(); const now = Date.now();
  const records = new Map<string, { personId: string; assignments: Assignment[] }>();
  const addTarget = (personId: string, rawRole: unknown, schoolId: string) => {
    const school = actor.schools.find((item) => item.id === schoolId); const roleKey = parseRole(rawRole);
    const info = school && getAdminWorkRoleInfo(school.profile as never, roleKey);
    if (!personId || !info || !school) return;
    const item = records.get(personId) ?? { personId, assignments: [] };
    if (!item.assignments.some((assignment) => assignment.schoolId === schoolId && assignment.roleKey === info.roleKey)) item.assignments.push({ schoolId, schoolName: school.name, roleKey: info.roleKey, roleLabel: info.roleLabel });
    records.set(personId, item);
  };
  for (const assignment of await rowsForSchools(orgId, "operationalAssignments", actor.schoolIds)) if (active(assignment, now) && currentYear(assignment, academicYearId)) addTarget(text(assignment.actorPersonId), assignment.actorRoleKey, text(assignment.schoolId));
  const snapshots = await Promise.all(actor.schoolIds.flatMap((schoolId) => [
    db.collectionGroup("orgMemberships").where("orgId", "==", orgId).where("scopeType", "==", "SCHOOL").where("scopeId", "==", schoolId).get(),
    db.collectionGroup("orgMemberships").where("orgId", "==", orgId).where("scopes.schoolIds", "array-contains", schoolId).get(),
  ]));
  for (const snapshot of snapshots) for (const document of snapshot.docs) { const membership = row(document.data()); if (!active(membership, now)) continue; const scope = row(membership.scopes); const schoolIds = unique([text(membership.scopeType) === "SCHOOL" ? text(membership.scopeId) : "", ...(Array.isArray(scope.schoolIds) ? scope.schoolIds.filter((value: unknown): value is string => typeof value === "string") : [])]); for (const schoolId of schoolIds) addTarget(text(membership.personId), membership.roleKey ?? membership.role, schoolId); }
  const snapshotsByPerson = records.size ? await db.getAll(...[...records.keys()].map((personId) => db.doc(`orgs/${orgId}/people/${personId}`))) : [];
  const names = new Map(snapshotsByPerson.map((document) => [document.id, human(document.data()?.displayName)]));
  return [...records.values()].map((item) => ({ personId: item.personId, displayName: names.get(item.personId) || "موظف غير محدد", roleKey: item.assignments[0]?.roleKey || "", roleLabel: item.assignments.map((assignment) => assignment.roleLabel).filter((value, index, values) => values.indexOf(value) === index).join(" • "), schoolIds: unique(item.assignments.map((assignment) => assignment.schoolId)), schoolNames: unique(item.assignments.map((assignment) => assignment.schoolName)), assignments: item.assignments }));
}

async function loadEvaluationPresentation(orgId: string, evaluations: Row[]) {
  const db = getFirestore();
  const load = async (collection: string, ids: string[]) => { const result = new Map<string, Row>(); for (let index = 0; index < ids.length; index += 100) { const snapshots = await db.getAll(...ids.slice(index, index + 100).map((item) => db.doc(`orgs/${orgId}/${collection}/${item}`))); for (const snapshot of snapshots) if (snapshot.exists) result.set(snapshot.id, row(snapshot.data())); } return result; };
  const personIds = unique(evaluations.map((item) => text(item.targetPersonId))); const cycleIds = unique(evaluations.map((item) => text(item.cycleId))); const planIds = unique(evaluations.map((item) => text(item.planId))); const frameworkIds = unique(evaluations.map((item) => text(item.frameworkId)));
  const [people, cycles, plans, frameworks] = await Promise.all([load("people", personIds), load("evaluationCycles", cycleIds), load("evaluationPlans", planIds), load("evaluationFrameworks", frameworkIds)]);
  return {
    targetName: (item: Row) => human(people.get(text(item.targetPersonId))?.displayName) || human(item.targetDisplayName) || "موظف غير محدد",
    title: (item: Row) => { const cycle = cycles.get(text(item.cycleId)); const plan = plans.get(text(item.planId)) ?? (cycle ? plans.get(text(cycle.planId)) : undefined); const framework = frameworks.get(text(item.frameworkId)) ?? (plan ? frameworks.get(text(plan.frameworkId)) : undefined); const specific = human(item.cycleTitle) || human(cycle?.title); const base = human(item.planTitle) || human(plan?.title) || human(item.frameworkTitle) || human(framework?.title); return specific && base && !base.includes(specific) ? `${base} — ${specific}` : specific || base || "تقييم موظف"; },
  };
}

function evaluationDetails(item: Row, action: "SUBMITTED" | "APPROVED", targetName: string, evaluationTitle: string): Details {
  return { kind: "EVALUATION", action, evaluationTitle, targetName, generalNote: text(item.generalNote), status: text(item.status), submittedAt: num(item.submittedAt), approvedAt: num(item.approvedAt), totalScore: num(item.rawScore) ?? num(item.totalScore), maxScore: num(item.maxScore), percentage: num(item.normalizedScore) ?? num(item.weightedScore), criteria: rows(item.itemScores).map((score) => ({ itemId: text(score.itemId), sectionId: text(score.sectionId), itemTitle: text(score.itemTitle) || text(score.title), sectionTitle: text(score.sectionTitle) || text(score.category), score: num(score.score), maxScore: num(score.maxScore), valueText: text(score.valueText), level: text(score.level), order: num(score.order) ?? Number.MAX_SAFE_INTEGER })).filter((score) => Boolean(score.itemId || score.itemTitle)).sort((a, b) => a.order - b.order) };
}
function planDetails(item: Row, targetName: string): Details { return { kind: "PERFORMANCE_IMPROVEMENT", targetName, objective: text(item.objective), status: text(item.status), createdAt: num(item.createdAt), startsAt: num(item.startAt) ?? num(item.startsAt), endsAt: num(item.endAt) ?? num(item.endsAt), actions: rows(item.actions).map((action) => ({ title: text(action.title), status: text(action.status), dueAt: num(action.dueAt), completedAt: num(action.completedAt) })), followUps: rows(item.followUps).map((followUp) => ({ score: num(followUp.score), recordedAt: num(followUp.recordedAt), note: text(followUp.note) })), closedAt: num(item.closedAt), closureNote: text(item.closureNote), escalatedAt: num(item.escalatedAt), escalationReason: text(item.escalationReason) }; }
function attendanceDetails(item: Row): Details { return { kind: "ATTENDANCE", classLabel: text(item.classTitle) || text(item.classId), schoolDayId: text(item.schoolDayId), status: text(item.status), recordedAt: num(item.recordedAt), submittedAt: num(item.submittedAt), counts: { target: num(item.targetCount), completed: num(item.completedCount), missing: num(item.missingCount), present: num(item.presentCount), absent: num(item.absentCount), late: num(item.lateCount), excusedLate: num(item.excusedLateCount), excusedAbsent: num(item.excusedAbsentCount), leftEarly: num(item.leftEarlyCount), studySuspended: num(item.studySuspendedCount), notRecorded: num(item.notRecordedCount) } }; }

async function collectActivities(params: { orgId: string; actor: Actor; staffIds: Set<string>; academicYearId: string; period: AdminWorkPeriod; details: boolean }) {
  const startAt = periodStart(params.period); const activities: Activity[] = [];
  const [evaluations, plans, cases, attendance, preps, documentation, schoolActivities] = await Promise.all(["evaluationSubmissions", "performanceImprovementPlans", "studentCases", "studentAttendanceBatches", "subjectLessonPreps", "workDocumentation", "schoolActivities"].map((collectionName) => rowsForSchools(params.orgId, collectionName, params.actor.schoolIds)));
  const presentation = await loadEvaluationPresentation(params.orgId, evaluations.filter((item) => currentYear(item, params.academicYearId)));
  for (const item of evaluations) { if (!currentYear(item, params.academicYearId)) continue; const targetName = presentation.targetName(item); const title = presentation.title(item); const submittedAt = num(item.submittedAt) ?? num(item.updatedAt); if (["SUBMITTED", "APPROVED"].includes(text(item.status)) && params.staffIds.has(text(item.evaluatorPersonId)) && inPeriod(submittedAt, startAt)) add(activities, { type: "EVALUATION_SUBMITTED", metricKey: "evaluations", personId: text(item.evaluatorPersonId), schoolId: text(item.schoolId), activityAt: submittedAt!, title, description: "", status: text(item.status), targetName, classLabel: "", sourceEntityId: text(item.id), details: params.details ? evaluationDetails(item, "SUBMITTED", targetName, title) : undefined, href: "/staff/evaluations" }); const approvedAt = num(item.approvedAt); if (params.staffIds.has(text(item.approvedByPersonId)) && inPeriod(approvedAt, startAt)) add(activities, { type: "EVALUATION_APPROVED", metricKey: "evaluations", personId: text(item.approvedByPersonId), schoolId: text(item.schoolId), activityAt: approvedAt!, title, description: "", status: text(item.status), targetName, classLabel: "", sourceEntityId: text(item.id), details: params.details ? evaluationDetails(item, "APPROVED", targetName, title) : undefined, href: "/staff/evaluations" }); }
  for (const item of plans) { if (!currentYear(item, params.academicYearId)) continue; const targetName = human(item.targetDisplayName) || "موظف غير محدد"; const create = (type: string, personId: string, at: number | null, title: string, sourceEntityId: string, description = "") => { if (params.staffIds.has(personId) && inPeriod(at, startAt)) add(activities, { type, metricKey: "performanceImprovement", personId, schoolId: text(item.schoolId), activityAt: at!, title, description, status: text(item.status), targetName, classLabel: "", sourceEntityId, details: params.details ? planDetails(item, targetName) : undefined, href: "/staff/performance-improvement" }); }; create("PERFORMANCE_PLAN_CREATED", text(item.createdByPersonId), num(item.createdAt), "إنشاء خطة تحسين أداء", text(item.id), text(item.objective)); for (const action of rows(item.actions)) create("PERFORMANCE_ACTION_COMPLETED", text(action.completedByPersonId), num(action.completedAt), "إكمال إجراء في خطة التحسين", `${text(item.id)}:${text(action.id)}`, text(action.title)); for (const followUp of rows(item.followUps)) create("PERFORMANCE_FOLLOW_UP_RECORDED", text(followUp.recordedByPersonId), num(followUp.recordedAt), "تسجيل متابعة لخطة التحسين", `${text(item.id)}:${text(followUp.id)}`, text(followUp.note)); create("PERFORMANCE_PLAN_CLOSED", text(item.closedByPersonId), num(item.closedAt), "إغلاق خطة تحسين أداء", text(item.id)); create("PERFORMANCE_PLAN_ESCALATED", text(item.escalatedByPersonId), num(item.escalatedAt), "تصعيد خطة تحسين أداء", text(item.id)); }
  const eventSnapshots = await Promise.all(params.actor.schoolIds.map((schoolId) => getFirestore().collectionGroup("events").where("orgId", "==", params.orgId).where("schoolId", "==", schoolId).get())); const caseById = new Map(cases.map((item) => [text(item.id), item])); const created = new Set<string>();
  for (const snapshot of eventSnapshots) for (const document of snapshot.docs) { const event = { id: document.id, ...document.data() } as Row; const eventType = text(event.eventType); const actorId = text(event.createdByPersonId); const at = num(event.createdAt); if (!caseLabels[eventType] || !params.staffIds.has(actorId) || !currentYear(event, params.academicYearId) || !inPeriod(at, startAt)) continue; if (eventType === "CREATED") created.add(`${text(event.caseId)}:${actorId}`); const studentCase = caseById.get(text(event.caseId)); add(activities, { type: `STUDENT_CASE_${eventType}`, metricKey: "studentCases", personId: actorId, schoolId: text(event.schoolId), activityAt: at!, title: caseLabels[eventType], description: "", status: text(event.statusAfter), targetName: text(studentCase?.studentDisplayName), classLabel: text(studentCase?.classTitle), sourceEntityId: text(event.caseId) || text(event.id), details: params.details ? { kind: "STUDENT_CASE", studentDisplayName: text(studentCase?.studentDisplayName), classLabel: text(studentCase?.classTitle), eventType, status: text(event.statusAfter), statusBefore: text(event.statusBefore), statusAfter: text(event.statusAfter), occurredAt: at } : undefined, href: text(event.caseId) ? `/staff/cases/${encodeURIComponent(text(event.caseId))}` : undefined }); }
  for (const item of cases) { const actorId = text(item.createdByPersonId); const at = num(item.createdAt); if (currentYear(item, params.academicYearId) && params.staffIds.has(actorId) && !created.has(`${text(item.id)}:${actorId}`) && inPeriod(at, startAt)) add(activities, { type: "STUDENT_CASE_CREATED", metricKey: "studentCases", personId: actorId, schoolId: text(item.schoolId), activityAt: at!, title: caseLabels.CREATED, description: "", status: text(item.status), targetName: text(item.studentDisplayName), classLabel: text(item.classTitle), sourceEntityId: text(item.id), details: params.details ? { kind: "STUDENT_CASE", studentDisplayName: text(item.studentDisplayName), classLabel: text(item.classTitle), eventType: "CREATED", status: text(item.status), statusBefore: "", statusAfter: text(item.status), occurredAt: at } : undefined, href: `/staff/cases/${encodeURIComponent(text(item.id))}` }); }
  for (const item of attendance) { const at = num(item.recordedAt) ?? num(item.submittedAt) ?? num(item.createdAt); const actorId = text(item.createdByPersonId); if (currentYear(item, params.academicYearId) && params.staffIds.has(actorId) && inPeriod(at, startAt)) add(activities, { type: "ATTENDANCE_BATCH_RECORDED", metricKey: "attendance", personId: actorId, schoolId: text(item.schoolId), activityAt: at!, title: "تسجيل دفعة حضور", description: text(item.schoolDayId), status: text(item.status), targetName: "", classLabel: text(item.classTitle) || text(item.classId), sourceEntityId: text(item.id), details: params.details ? attendanceDetails(item) : undefined, href: `/staff/attendance/batches/${encodeURIComponent(text(item.id))}` }); }
  for (const item of preps) { if (!currentYear(item, params.academicYearId)) continue; const addPrep = (action: "APPROVED" | "RETURNED", personId: string, at: number | null) => { if (params.staffIds.has(personId) && inPeriod(at, startAt)) add(activities, { type: action === "APPROVED" ? "LESSON_PREP_APPROVED" : "LESSON_PREP_RETURNED", metricKey: "lessonPrepReview", personId, schoolId: text(item.schoolId), activityAt: at!, title: action === "APPROVED" ? "اعتماد تحضير درس" : "إعادة تحضير للتعديل", description: text(item.lessonTitle), status: text(item.status), targetName: text(item.teacherDisplayName), classLabel: text(item.classTitle) || text(item.classId), sourceEntityId: text(item.id), details: params.details ? { kind: "LESSON_PREP_REVIEW", action, teacherName: text(item.teacherDisplayName) || text(item.teacherName), lessonTitle: text(item.lessonTitle), subjectLabel: text(item.subjectTitle) || text(item.subjectKey), classLabel: text(item.classTitle) || text(item.classId), lessonDate: text(item.lessonDate), status: text(item.status), approvedAt: num(item.approvedAt), returnedAt: num(item.returnedAt), reviewNote: text(action === "APPROVED" ? item.approvalNote : item.returnReason) } : undefined }); }; addPrep("APPROVED", text(item.approvedByPersonId), num(item.approvedAt)); addPrep("RETURNED", text(item.returnedByPersonId), num(item.returnedAt)); }
  for (const item of documentation) { const at = num(item.updatedAt) ?? num(item.createdAt); const actorId = text(item.personId); if (currentYear(item, params.academicYearId) && params.staffIds.has(actorId) && inPeriod(at, startAt)) add(activities, { type: "WORK_DOCUMENTATION", metricKey: "workDocumentation", personId: actorId, schoolId: text(item.schoolId), activityAt: at!, title: "توثيق عمل", description: human(item.templateTitle) || text(item.templateKey), status: "", targetName: "", classLabel: "", sourceEntityId: text(item.id), details: params.details ? { kind: "WORK_DOCUMENTATION", templateTitle: human(item.templateTitle), templateKey: text(item.templateKey), instanceMode: text(item.instanceMode) || "SINGLE", createdAt: num(item.createdAt), updatedAt: num(item.updatedAt) } : undefined }); }
  for (const item of schoolActivities) { const at = num(item.createdAt); const actorId = text(item.createdByPersonId); if (currentYear(item, params.academicYearId) && params.staffIds.has(actorId) && inPeriod(at, startAt)) add(activities, { type: "SCHOOL_ACTIVITY_CREATED", metricKey: "schoolActivities", personId: actorId, schoolId: text(item.schoolId), activityAt: at!, title: "إنشاء نشاط مدرسي", description: human(item.title) || "نشاط مدرسي", status: text(item.status), targetName: "", classLabel: "", sourceEntityId: text(item.id), details: params.details ? { kind: "SCHOOL_ACTIVITY", activityTitle: human(item.title) || "نشاط مدرسي", activityKind: text(item.activityKind), status: text(item.status), startsAt: num(item.startsAt), endsAt: num(item.endsAt), locationTitle: human(item.locationTitle), organizerDisplayName: human(item.organizerDisplayName) } : undefined, href: `/staff/activities/${encodeURIComponent(text(item.id))}` }); }
  return activities.sort((a, b) => b.activityAt - a.activityAt);
}

async function adminWork(uid: string, input: Row, details: boolean) { const orgId = id(input.orgId, "orgId"); const academicYearId = text(input.academicYearId); const selectedPeriod = period(input.period); const actor = await resolveActor(uid, orgId); const admins = await listEligibleAdmins(orgId, actor, academicYearId); const activities = await collectActivities({ orgId, actor, staffIds: new Set(admins.map((item) => item.personId)), academicYearId, period: selectedPeriod, details }); const summaries = admins.map<Summary>((admin) => { const current = activities.filter((activity) => activity.personId === admin.personId && admin.schoolIds.includes(activity.schoolId)); const metric = metrics(); for (const activity of current) { metric[activity.metricKey].count += 1; metric[activity.metricKey].latestActivityAt = Math.max(metric[activity.metricKey].latestActivityAt ?? 0, activity.activityAt); } return { ...admin, totalActivityCount: current.length, latestActivityAt: current[0]?.activityAt ?? null, metrics: metric }; }).sort((a, b) => a.displayName.localeCompare(b.displayName, "ar")); return { orgId, academicYearId, period: selectedPeriod, actor, summaries, activities }; }

export const getAdminWorkOverview = onCall({ region: REGION, cors: true, invoker: "public", memory: "512MiB" }, async (request) => { if (!request.auth?.uid) throw new HttpsError("unauthenticated", "Authentication is required."); const result = await adminWork(request.auth.uid, row(request.data), false); return { academicYearId: result.academicYearId, period: result.period, allowedSchoolIds: result.actor.schoolIds, staff: result.summaries }; });
export const getAdminWorkDetail = onCall({ region: REGION, cors: true, invoker: "public", memory: "512MiB" }, async (request) => { if (!request.auth?.uid) throw new HttpsError("unauthenticated", "Authentication is required."); const input = row(request.data); const personId = id(input.personId, "personId"); const result = await adminWork(request.auth.uid, input, true); const staff = result.summaries.find((item) => item.personId === personId); if (!staff) throw new HttpsError("not-found", "Administrative staff member is not available in your admin-work scope."); return { academicYearId: result.academicYearId, period: result.period, staff, activities: result.activities.filter((activity) => activity.personId === personId && staff.schoolIds.includes(activity.schoolId)) }; });

function safeDocumentationValues(value: unknown) {
  type DocumentationValue =
    | { kind: "SCALAR"; key: string; value: string | number }
    | {
        kind: "TABLE";
        key: string;
        rows: Array<Array<{ key: string; value: string | number }>>;
      };

  const values: DocumentationValue[] = [];
  for (const [key, entry] of Object.entries(row(value))) {
    if (
      typeof entry === "string" ||
      (typeof entry === "number" && Number.isFinite(entry))
    ) {
      values.push({ kind: "SCALAR", key, value: entry });
      continue;
    }
    if (!Array.isArray(entry)) continue;
    values.push({
      kind: "TABLE",
      key,
      rows: entry.map(row).map((tableRow) =>
        Object.entries(tableRow).flatMap(([cellKey, cell]) =>
          typeof cell === "string" ||
          (typeof cell === "number" && Number.isFinite(cell))
            ? [{ key: cellKey, value: cell }]
            : [],
        ),
      ),
    });
  }
  return values;
}
export const getAdminWorkDocumentationRecord = onCall({ region: REGION, cors: true, invoker: "public", memory: "512MiB" }, async (request) => { if (!request.auth?.uid) throw new HttpsError("unauthenticated", "Authentication is required."); const input = row(request.data); const orgId = id(input.orgId, "orgId"); const staffPersonId = id(input.staffPersonId, "staffPersonId"); const sourceEntityId = id(input.sourceEntityId, "sourceEntityId"); const actor = await resolveActor(request.auth.uid, orgId); const admins = await listEligibleAdmins(orgId, actor, ""); const admin = admins.find((item) => item.personId === staffPersonId); if (!admin) throw new HttpsError("permission-denied", "Administrative staff member is not available in your admin-work scope."); const snapshot = await getFirestore().doc(`orgs/${orgId}/workDocumentation/${sourceEntityId}`).get(); if (!snapshot.exists) throw new HttpsError("not-found", "Work-documentation record was not found."); const record = row(snapshot.data()); if (text(record.personId) !== staffPersonId || !admin.schoolIds.includes(text(record.schoolId)) || !actor.schoolIds.includes(text(record.schoolId))) throw new HttpsError("permission-denied", "Work-documentation access denied."); const templateKey = text(record.templateKey); const isSecret = SECRET_TEMPLATE_KEYS.has(templateKey); const base = { id: snapshot.id, templateKey, templateTitle: human(record.templateTitle) || templateKey, instanceMode: text(record.instanceMode) === "MULTIPLE" ? "MULTIPLE" : "SINGLE", instanceId: text(record.instanceId) || undefined, schoolId: text(record.schoolId), academicYearId: text(record.academicYearId), termId: text(record.termId), createdAt: num(record.createdAt), updatedAt: num(record.updatedAt), isSecret, canViewRecord: !isSecret }; return isSecret ? base : { ...base, values: safeDocumentationValues(record.data) }; });
