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
  "KG_VP",
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
  KG_VP: "وكيلة الروضة",
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
  | "lessonPrepReview"
  | "workDocumentation";

type EvaluationActivityDetails = {
  kind: "EVALUATION";
  action: "SUBMITTED" | "APPROVED";
  evaluationTitle: string;
  targetName: string;
  status: string;
  submittedAt: number | null;
  approvedAt: number | null;
  totalScore: number | null;
  maxScore: number | null;
  percentage: number | null;
  criteria: Array<{
    itemId: string;
    sectionId: string;
    itemTitle: string;
    sectionTitle: string;
    score: number | null;
    maxScore: number | null;
    valueText: string;
    level: string;
    order: number;
  }>;
};
type PerformanceImprovementActivityDetails = {
  kind: "PERFORMANCE_IMPROVEMENT";
  targetName: string;
  objective: string;
  status: string;
  createdAt: number | null;
  startsAt: number | null;
  endsAt: number | null;
  actions: Array<{ title: string; status: string; dueAt: number | null; completedAt: number | null }>;
  followUps: Array<{ score: number | null; recordedAt: number | null; note: string }>;
  closedAt: number | null;
  closureNote: string;
  escalatedAt: number | null;
  escalationReason: string;
};
type StudentCaseActivityDetails = {
  kind: "STUDENT_CASE";
  studentDisplayName: string;
  classLabel: string;
  eventType: string;
  status: string;
  statusBefore: string;
  statusAfter: string;
  occurredAt: number | null;
};
type AttendanceActivityDetails = {
  kind: "ATTENDANCE";
  classLabel: string;
  schoolDayId: string;
  status: string;
  recordedAt: number | null;
  submittedAt: number | null;
  counts: { target: number | null; completed: number | null; missing: number | null; present: number | null; absent: number | null; late: number | null; excusedLate: number | null; excusedAbsent: number | null; leftEarly: number | null; studySuspended: number | null; notRecorded: number | null };
};
type LessonPrepReviewActivityDetails = {
  kind: "LESSON_PREP_REVIEW";
  action: "APPROVED" | "RETURNED";
  teacherName: string;
  lessonTitle: string;
  subjectLabel: string;
  classLabel: string;
  lessonDate: string;
  status: string;
  approvedAt: number | null;
  returnedAt: number | null;
  reviewNote: string;
};
type WorkDocumentationActivityDetails = {
  kind: "WORK_DOCUMENTATION";
  templateTitle: string;
  templateKey: string;
  instanceMode: string;
  createdAt: number | null;
  updatedAt: number | null;
};

type WorkDocumentationReadOnlyValue =
  | { kind: "SCALAR"; key: string; value: string | number }
  | {
      kind: "TABLE";
      key: string;
      rows: Array<Array<{ key: string; value: string | number }>>;
    };
type StaffWorkActivityDetails =
  | EvaluationActivityDetails
  | PerformanceImprovementActivityDetails
  | StudentCaseActivityDetails
  | AttendanceActivityDetails
  | LessonPrepReviewActivityDetails
  | WorkDocumentationActivityDetails;

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
  details: StaffWorkActivityDetails;
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

type StaffRecord = Omit<
  StaffWorkSummary,
  "totalActivityCount" | "latestActivityAt" | "metrics"
>;
type Actor = {
  personId: string;
  schoolIds: string[];
  schools: Array<{ id: string; name: string }>;
};

type StaffWorkViewerConfig = {
  includedPersonIds: string[];
  excludedPersonIds: string[];
};

const metricKeys: StaffWorkMetricKey[] = [
  "evaluations",
  "performanceImprovement",
  "studentCases",
  "attendance",
  "lessonPrepReview",
  "workDocumentation",
];

function row(value: unknown): Row {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Row)
    : {};
}
function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}
function timestamp(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
function rows(value: unknown) {
  return Array.isArray(value) ? value.map(row) : [];
}
function unique(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}
function humanText(value: unknown) {
  const result = text(value);
  // Firestore document IDs in this domain are normally ASCII slug values. Do
  // not let one become a user-facing title or person name.
  return /^[a-z0-9]+(?:[-_][a-z0-9]+)+$/i.test(result) || /^[a-z0-9]{16,}$/i.test(result)
    ? ""
    : result;
}

// These are the templates whose definitions deliberately mark their content as
// secret. Keep this server-side deny-list explicit: the client must never be
// the authority that decides whether record content can be returned.
const SECRET_WORK_DOCUMENTATION_TEMPLATE_KEYS = new Set([
  "confidential-case-study",
  "confidential-family-circumstances",
]);

function safeDocumentationValues(value: unknown): WorkDocumentationReadOnlyValue[] {
  const data = row(value);
  const values: WorkDocumentationReadOnlyValue[] = [];
  for (const [key, entry] of Object.entries(data)) {
    if (typeof entry === "string" || (typeof entry === "number" && Number.isFinite(entry))) {
      values.push({ kind: "SCALAR", key, value: entry });
      continue;
    }
    if (!Array.isArray(entry)) continue;
    const sanitizedRows = entry.map(row).map((item) =>
      Object.entries(item).flatMap(([cellKey, cellValue]) =>
        typeof cellValue === "string" || (typeof cellValue === "number" && Number.isFinite(cellValue))
          ? [{ key: cellKey, value: cellValue }]
          : [],
      ),
    );
    values.push({ kind: "TABLE", key, rows: sanitizedRows });
  }
  return values;
}
function id(value: unknown, name: string) {
  const result = text(value);
  if (!result || result.includes("/"))
    throw new HttpsError("invalid-argument", `${name} is required.`);
  return result;
}
function period(value: unknown): StaffWorkPeriod {
  return value === "WEEK" || value === "MONTH" || value === "ALL"
    ? value
    : "ALL";
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
  if (
    item.isActive === false ||
    item.active === false ||
    text(item.status) === "INACTIVE"
  )
    return false;
  const startAt = timestamp(item.startAt);
  const endAt = timestamp(item.endAt);
  return (
    !(startAt !== null && startAt > now) && !(endAt !== null && endAt < now)
  );
}
function emptyMetrics(): Record<StaffWorkMetricKey, StaffWorkMetric> {
  return Object.fromEntries(
    metricKeys.map((key) => [key, { count: 0, latestActivityAt: null }]),
  ) as Record<StaffWorkMetricKey, StaffWorkMetric>;
}

async function loadStaffWorkViewerConfig(params: {
  orgId: string;
  viewerPersonId: string;
}): Promise<StaffWorkViewerConfig> {
  const db = getFirestore();

  const snapshot = await db
    .doc(`orgs/${params.orgId}/staffWorkViewerConfigs/${params.viewerPersonId}`)
    .get();

  const emptyConfig: StaffWorkViewerConfig = {
    includedPersonIds: [],
    excludedPersonIds: [],
  };

  if (!snapshot.exists) {
    return emptyConfig;
  }

  const config = row(snapshot.data());

  if (config.isActive === false) {
    return emptyConfig;
  }

  const configuredViewerPersonId = text(config.viewerPersonId);

  if (
    configuredViewerPersonId &&
    configuredViewerPersonId !== params.viewerPersonId
  ) {
    return emptyConfig;
  }

  const includedPersonIds = Array.isArray(config.includedPersonIds)
    ? config.includedPersonIds.filter(
        (item): item is string =>
          typeof item === "string" && Boolean(item.trim()),
      )
    : [];

  const excludedPersonIds = Array.isArray(config.excludedPersonIds)
    ? config.excludedPersonIds.filter(
        (item): item is string =>
          typeof item === "string" && Boolean(item.trim()),
      )
    : [];

  return {
    includedPersonIds: unique(includedPersonIds),
    excludedPersonIds: unique(excludedPersonIds),
  };
}

async function resolveActor(params: {
  uid: string;
  orgId: string;
}): Promise<Actor> {
  const db = getFirestore();
  const membership = await db
    .doc(`users/${params.uid}/orgMemberships/${params.orgId}`)
    .get();
  if (!membership.exists)
    throw new HttpsError(
      "permission-denied",
      "Organization membership was not found.",
    );
  const member = row(membership.data());
  const personId = text(member.personId);
  if (!personId || !active(member, Date.now()))
    throw new HttpsError(
      "permission-denied",
      "An active staff membership is required.",
    );

  const scopeSnapshot = await db
    .collection(`orgs/${params.orgId}/personSupervisionScopes`)
    .where("personId", "==", personId)
    .get();
  const scopes: PersonSupervisionScope[] = scopeSnapshot.docs.flatMap(
    (item) => {
      const parsed = PersonSupervisionScopeSchema.safeParse({
        id: item.id,
        ...item.data(),
      });
      return parsed.success ? [parsed.data] : [];
    },
  );
  const schoolIds = getPersonSupervisionSchoolIds({
    scopes,
    orgId: params.orgId,
    personId,
    capability: "STAFF_WORK_VIEW",
  });
  if (!schoolIds.length)
    throw new HttpsError(
      "permission-denied",
      "Staff work monitoring access is required.",
    );
  const schoolSnapshots = await Promise.all(
    schoolIds.map((schoolId) =>
      db.doc(`orgs/${params.orgId}/schools/${schoolId}`).get(),
    ),
  );
  const schools = schoolSnapshots
    .filter((item) => item.exists)
    .map((item) => ({ id: item.id, name: text(item.data()?.name) || item.id }));
  if (!schools.length)
    throw new HttpsError(
      "permission-denied",
      "No active staff-work school scope is available.",
    );
  return { personId, schoolIds: schools.map((item) => item.id), schools };
}

async function rowsForSchools(params: {
  orgId: string;
  collectionName: string;
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
    snapshot.docs.map(
      (document) => ({ id: document.id, ...document.data() }) as Row,
    ),
  );
}

async function listEligibleStaff(params: {
  orgId: string;
  actor: Actor;
  academicYearId: string;
  includedPersonIds: ReadonlySet<string>;
  excludedPersonIds: ReadonlySet<string>;
}) {
  const db = getFirestore();
  const now = Date.now();
  const records = new Map<
    string,
    {
      personId: string;
      roleKey: string;
      schoolIds: string[];
    }
  >();

  const add = (personId: string, rawRoleKey: unknown, schoolId: string) => {
    if (!personId || !schoolId || !params.actor.schoolIds.includes(schoolId)) {
      return;
    }

    // Exclusion always wins.
    if (params.excludedPersonIds.has(personId)) {
      return;
    }

    const parsedRole = role(rawRoleKey);
    const roleKey = parsedRole || text(rawRoleKey);

    if (!roleKey) {
      return;
    }

    const explicitlyIncluded = params.includedPersonIds.has(personId);

    const normallyEligible =
      parsedRole !== null && STAFF_ROLE_KEYS.has(parsedRole);

    if (!normallyEligible && !explicitlyIncluded) {
      return;
    }

    const existing = records.get(personId);

    if (existing) {
      existing.schoolIds = unique([...existing.schoolIds, schoolId]);
      return;
    }

    records.set(personId, {
      personId,
      roleKey,
      schoolIds: [schoolId],
    });
  };

  const assignmentRows = await rowsForSchools({
    orgId: params.orgId,
    collectionName: "operationalAssignments",
    schoolIds: params.actor.schoolIds,
  });
  for (const assignment of assignmentRows) {
    if (
      !active(assignment, now) ||
      !currentYear(assignment, params.academicYearId)
    )
      continue;
    add(
      text(assignment.actorPersonId),
      assignment.actorRoleKey,
      text(assignment.schoolId),
    );
  }
  const membershipSnapshots = await Promise.all(
    params.actor.schoolIds.flatMap((schoolId) => [
      db
        .collectionGroup("orgMemberships")
        .where("orgId", "==", params.orgId)
        .where("scopeType", "==", "SCHOOL")
        .where("scopeId", "==", schoolId)
        .get(),
      db
        .collectionGroup("orgMemberships")
        .where("orgId", "==", params.orgId)
        .where("scopes.schoolIds", "array-contains", schoolId)
        .get(),
    ]),
  );
  for (const snapshot of membershipSnapshots)
    for (const document of snapshot.docs) {
      const membership = row(document.data());
      if (!active(membership, now)) continue;
      const schoolId =
        text(membership.scopeType) === "SCHOOL" ? text(membership.scopeId) : "";
      const membershipScopes = row(membership.scopes);
      const scopedSchoolIds = Array.isArray(membershipScopes.schoolIds)
        ? membershipScopes.schoolIds.filter(
            (item: unknown): item is string => typeof item === "string",
          )
        : [];
      const membershipSchoolIds = unique([schoolId, ...scopedSchoolIds]);
      for (const scopedSchoolId of membershipSchoolIds) {
        add(
          text(membership.personId),
          text(membership.roleKey) || text(membership.role),
          scopedSchoolId,
        );
      }
    }
  const people = [...records.values()];
  const personSnapshots = people.length
    ? await db.getAll(
        ...people.map((item) =>
          db.doc(`orgs/${params.orgId}/people/${item.personId}`),
        ),
      )
    : [];
  const names = new Map(
    personSnapshots.map((snapshot) => [
      snapshot.id,
      text(snapshot.data()?.displayName),
    ]),
  );
  const schoolNameById = new Map(
    params.actor.schools.map((school) => [school.id, school.name]),
  );
  return people.map<StaffRecord>((item) => ({
    personId: item.personId,
    displayName: names.get(item.personId) || "موظف غير محدد",
    roleKey: item.roleKey,
    roleLabel: ROLE_LABELS[item.roleKey as MembershipRoleType] || item.roleKey,
    schoolIds: item.schoolIds,
    schoolNames: item.schoolIds.map(
      (schoolId) => schoolNameById.get(schoolId) || schoolId,
    ),
  }));
}

function addActivity(
  result: StaffWorkActivity[],
  item: Omit<StaffWorkActivity, "id">,
) {
  if (!item.personId || !item.schoolId || !item.activityAt) return;
  result.push({
    ...item,
    id: `${item.type}:${item.sourceEntityId}:${item.personId}:${item.activityAt}`,
  });
}

function evaluationDetails(params: {
  item: Row;
  action: "SUBMITTED" | "APPROVED";
  targetName: string;
  evaluationTitle: string;
}): EvaluationActivityDetails {
  const { item, action, targetName, evaluationTitle } = params;
  return {
    kind: "EVALUATION",
    action,
    evaluationTitle,
    targetName,
    status: text(item.status),
    submittedAt: timestamp(item.submittedAt),
    approvedAt: timestamp(item.approvedAt),
    totalScore: timestamp(item.rawScore) ?? timestamp(item.totalScore),
    maxScore: timestamp(item.maxScore),
    percentage: timestamp(item.normalizedScore) ?? timestamp(item.weightedScore),
    criteria: rows(item.itemScores).map((score) => ({
      itemId: text(score.itemId),
      sectionId: text(score.sectionId),
      itemTitle: text(score.itemTitle) || text(score.title),
      sectionTitle: text(score.sectionTitle) || text(score.category),
      score: timestamp(score.score),
      maxScore: timestamp(score.maxScore),
      valueText: text(score.valueText),
      level: text(score.level),
      order: timestamp(score.order) ?? Number.MAX_SAFE_INTEGER,
    }))
      .filter((score) => Boolean(score.itemId || score.itemTitle || score.sectionId || score.sectionTitle))
      .sort((left, right) => left.order - right.order),
  };
}

async function loadEvaluationPresentation(params: {
  orgId: string;
  evaluations: Row[];
}) {
  const db = getFirestore();
  const loadRows = async (collectionName: string, ids: string[]) => {
    const records = new Map<string, Row>();
    for (let start = 0; start < ids.length; start += 100) {
      const snapshots = await db.getAll(
        ...ids.slice(start, start + 100).map((itemId) =>
          db.doc(`orgs/${params.orgId}/${collectionName}/${itemId}`),
        ),
      );
      for (const snapshot of snapshots) {
        if (snapshot.exists) records.set(snapshot.id, row(snapshot.data()));
      }
    }
    return records;
  };
  const targetPersonIds = unique(params.evaluations.map((item) => text(item.targetPersonId)));
  const cycleIds = unique(params.evaluations.map((item) => text(item.cycleId)));
  const planIds = unique(params.evaluations.map((item) => text(item.planId)));
  const frameworkIds = unique(params.evaluations.map((item) => text(item.frameworkId)));
  const [peopleById, cyclesById, plansById] = await Promise.all([
    loadRows("people", targetPersonIds),
    loadRows("evaluationCycles", cycleIds),
    loadRows("evaluationPlans", planIds),
  ]);
  const cyclePlanIds = unique(
    [...cyclesById.values()].map((cycle) => text(cycle.planId)),
  ).filter((planId) => !plansById.has(planId));
  const cyclePlansById = await loadRows("evaluationPlans", cyclePlanIds);
  for (const [planId, plan] of cyclePlansById) plansById.set(planId, plan);
  const frameworkIdsFromPlans = [...plansById.values()].map((plan) => text(plan.frameworkId));
  const frameworksById = await loadRows(
    "evaluationFrameworks",
    unique([...frameworkIds, ...frameworkIdsFromPlans]),
  );

  const titleFor = (item: Row) => {
    const cycle = cyclesById.get(text(item.cycleId));
    const plan = plansById.get(text(item.planId)) ||
      (cycle ? plansById.get(text(cycle.planId)) : undefined);
    const framework = frameworksById.get(
      text(item.frameworkId) || text(plan?.frameworkId),
    );
    const cycleTitle = humanText(cycle?.title) || humanText(cycle?.label) || humanText(item.cycleTitle);
    const planTitle = humanText(plan?.title) || humanText(item.planTitle);
    const frameworkTitle = humanText(framework?.title) || humanText(item.frameworkTitle);
    const genericCycle = /^(?:الأسبوع|الاسبوع|week|زيارة|الدورة|cycle)(?:\s|\d|$)/i.test(cycleTitle);
    if (cycleTitle && planTitle && genericCycle) return `${planTitle} — ${cycleTitle}`;
    return cycleTitle || planTitle || frameworkTitle || "تقييم موظف";
  };

  return {
    targetNameFor: (item: Row) =>
      humanText(peopleById.get(text(item.targetPersonId))?.displayName) ||
      humanText(item.targetDisplayName) ||
      "موظف غير محدد",
    titleFor,
  };
}

function performanceImprovementDetails(item: Row, targetName: string): PerformanceImprovementActivityDetails {
  return {
    kind: "PERFORMANCE_IMPROVEMENT",
    targetName,
    objective: text(item.objective),
    status: text(item.status),
    createdAt: timestamp(item.createdAt),
    startsAt: timestamp(item.startsAt),
    endsAt: timestamp(item.endsAt),
    actions: rows(item.actions).map((action) => ({ title: text(action.title), status: text(action.status), dueAt: timestamp(action.dueAt), completedAt: timestamp(action.completedAt) })),
    followUps: rows(item.followUps).map((followUp) => ({ score: timestamp(followUp.score), recordedAt: timestamp(followUp.recordedAt), note: text(followUp.note) })),
    closedAt: timestamp(item.closedAt),
    closureNote: text(item.closureNote),
    escalatedAt: timestamp(item.escalatedAt),
    escalationReason: text(item.escalationReason),
  };
}

function attendanceDetails(item: Row): AttendanceActivityDetails {
  return {
    kind: "ATTENDANCE",
    classLabel: text(item.classTitle) || text(item.classId),
    schoolDayId: text(item.schoolDayId),
    status: text(item.status),
    recordedAt: timestamp(item.recordedAt),
    submittedAt: timestamp(item.submittedAt),
    counts: {
      target: timestamp(item.targetCount), completed: timestamp(item.completedCount), missing: timestamp(item.missingCount),
      present: timestamp(item.presentCount), absent: timestamp(item.absentCount), late: timestamp(item.lateCount),
      excusedLate: timestamp(item.excusedLateCount), excusedAbsent: timestamp(item.excusedAbsentCount),
      leftEarly: timestamp(item.leftEarlyCount), studySuspended: timestamp(item.studySuspendedCount), notRecorded: timestamp(item.notRecordedCount),
    },
  };
}

async function collectActivities(params: {
  orgId: string;
  actor: Actor;
  staffIds: Set<string>;
  academicYearId: string;
  period: StaffWorkPeriod;
}) {
  const startAt = periodStart(params.period);
  const activities: StaffWorkActivity[] = [];
  const [
    evaluations,
    plans,
    cases,
    attendance,
    lessonPreps,
    workDocumentation,
  ] = await Promise.all([
    rowsForSchools({
      orgId: params.orgId,
      collectionName: "evaluationSubmissions",
      schoolIds: params.actor.schoolIds,
    }),
    rowsForSchools({
      orgId: params.orgId,
      collectionName: "performanceImprovementPlans",
      schoolIds: params.actor.schoolIds,
    }),
    rowsForSchools({
      orgId: params.orgId,
      collectionName: "studentCases",
      schoolIds: params.actor.schoolIds,
    }),
    rowsForSchools({
      orgId: params.orgId,
      collectionName: "studentAttendanceBatches",
      schoolIds: params.actor.schoolIds,
    }),
    rowsForSchools({
      orgId: params.orgId,
      collectionName: "subjectLessonPreps",
      schoolIds: params.actor.schoolIds,
    }),
    rowsForSchools({
      orgId: params.orgId,
      collectionName: "workDocumentation",
      schoolIds: params.actor.schoolIds,
    }),
  ]);
  const evaluationPresentation = await loadEvaluationPresentation({
    orgId: params.orgId,
    evaluations: evaluations.filter((item) => currentYear(item, params.academicYearId)),
  });
  for (const item of evaluations) {
    if (!currentYear(item, params.academicYearId)) continue;
    const targetName = evaluationPresentation.targetNameFor(item);
    const evaluationTitle = evaluationPresentation.titleFor(item);
    const submittedAt =
      timestamp(item.submittedAt) ?? timestamp(item.updatedAt);
    if (
      ["SUBMITTED", "APPROVED"].includes(text(item.status)) &&
      params.staffIds.has(text(item.evaluatorPersonId)) &&
      inPeriod(submittedAt, startAt)
    )
      addActivity(activities, {
        type: "EVALUATION_SUBMITTED",
        metricKey: "evaluations",
        personId: text(item.evaluatorPersonId),
        schoolId: text(item.schoolId),
        activityAt: submittedAt!,
        title: evaluationTitle,
        description: "",
        status: text(item.status),
        targetName,
        classLabel: "",
        sourceEntityId: text(item.id),
        details: evaluationDetails({ item, action: "SUBMITTED", targetName, evaluationTitle }),
        href: "/staff/evaluations",
      });
    const approvedAt = timestamp(item.approvedAt);
    if (
      params.staffIds.has(text(item.approvedByPersonId)) &&
      inPeriod(approvedAt, startAt)
    )
      addActivity(activities, {
        type: "EVALUATION_APPROVED",
        metricKey: "evaluations",
        personId: text(item.approvedByPersonId),
        schoolId: text(item.schoolId),
        activityAt: approvedAt!,
        title: evaluationTitle,
        description: "",
        status: text(item.status),
        targetName,
        classLabel: "",
        sourceEntityId: text(item.id),
        details: evaluationDetails({ item, action: "APPROVED", targetName, evaluationTitle }),
        href: "/staff/evaluations",
      });
  }
  for (const item of plans) {
    if (!currentYear(item, params.academicYearId)) continue;
    const targetName =
      text(item.targetDisplayName) || text(item.targetPersonId);
    const addPlan = (
      type: string,
      personId: string,
      at: number | null,
      title: string,
      sourceEntityId: string,
      description = "",
    ) => {
      if (params.staffIds.has(personId) && inPeriod(at, startAt))
        addActivity(activities, {
          type,
          metricKey: "performanceImprovement",
          personId,
          schoolId: text(item.schoolId),
          activityAt: at!,
          title,
          description,
          status: text(item.status),
          targetName,
          classLabel: "",
          sourceEntityId,
          details: performanceImprovementDetails(item, targetName),
          href: "/staff/performance-improvement",
        });
    };
    addPlan(
      "PERFORMANCE_PLAN_CREATED",
      text(item.createdByPersonId),
      timestamp(item.createdAt),
      "إنشاء خطة تحسين أداء",
      text(item.id),
      text(item.objective),
    );
    for (const action of Array.isArray(item.actions)
      ? item.actions.map(row)
      : [])
      addPlan(
        "PERFORMANCE_ACTION_COMPLETED",
        text(action.completedByPersonId),
        timestamp(action.completedAt),
        "إكمال إجراء في خطة التحسين",
        `${text(item.id)}:${text(action.id)}`,
        text(action.title),
      );
    for (const followUp of Array.isArray(item.followUps)
      ? item.followUps.map(row)
      : [])
      addPlan(
        "PERFORMANCE_FOLLOW_UP_RECORDED",
        text(followUp.recordedByPersonId),
        timestamp(followUp.recordedAt),
        "تسجيل متابعة لخطة التحسين",
        `${text(item.id)}:${text(followUp.id)}`,
        text(followUp.note),
      );
    addPlan(
      "PERFORMANCE_PLAN_CLOSED",
      text(item.closedByPersonId),
      timestamp(item.closedAt),
      "إغلاق خطة تحسين أداء",
      text(item.id),
      text(item.closureNote),
    );
    addPlan(
      "PERFORMANCE_PLAN_ESCALATED",
      text(item.escalatedByPersonId),
      timestamp(item.escalatedAt),
      "تصعيد خطة تحسين أداء",
      text(item.id),
      text(item.escalationReason),
    );
  }
  const caseEvents = await Promise.all(
    params.actor.schoolIds.map((schoolId) =>
      getFirestore()
        .collectionGroup("events")
        .where("orgId", "==", params.orgId)
        .where("schoolId", "==", schoolId)
        .get(),
    ),
  );
  const createdEvents = new Set<string>();
  const caseById = new Map(cases.map((item) => [text(item.id), item]));
  const caseLabels: Record<string, string> = {
    CREATED: "إنشاء حالة طلابية",
    REFERRED: "إحالة حالة طلابية",
    ACTION_ADDED: "إضافة إجراء لحالة",
    PARENT_CONTACTED: "تسجيل تواصل مع ولي الأمر",
    TRANSFERRED: "تحويل حالة طلابية",
    ESCALATED: "تصعيد حالة طلابية",
    RETURNED: "إعادة حالة طلابية",
    RESOLVED: "حل حالة طلابية",
    CLOSED: "إغلاق حالة طلابية",
    REOPENED: "إعادة فتح حالة طلابية",
    CANCELLED: "إلغاء حالة طلابية",
  };
  for (const snapshot of caseEvents)
    for (const document of snapshot.docs) {
      const pathParts = document.ref.path.split("/");
      if (pathParts[2] !== "studentCases" || pathParts[4] !== "events")
        continue;
      const event = { id: document.id, ...document.data() } as Row;
      if (
        !currentYear(event, params.academicYearId) ||
        !caseLabels[text(event.eventType)] ||
        !params.staffIds.has(text(event.createdByPersonId))
      )
        continue;
      const at = timestamp(event.createdAt);
      if (!inPeriod(at, startAt)) continue;
      if (text(event.eventType) === "CREATED")
        createdEvents.add(
          `${text(event.caseId)}:${text(event.createdByPersonId)}`,
        );
      const studentCase = caseById.get(text(event.caseId));
      addActivity(activities, {
        type: `STUDENT_CASE_${text(event.eventType)}`,
        metricKey: "studentCases",
        personId: text(event.createdByPersonId),
        schoolId: text(event.schoolId),
        activityAt: at!,
        title: caseLabels[text(event.eventType)],
        description: "",
        status: text(event.statusAfter),
        targetName: text(studentCase?.studentDisplayName),
        classLabel: text(studentCase?.classTitle),
        sourceEntityId: text(event.caseId) || text(event.id),
        details: {
          kind: "STUDENT_CASE",
          studentDisplayName: text(studentCase?.studentDisplayName),
          classLabel: text(studentCase?.classTitle),
          eventType: text(event.eventType),
          status: text(event.statusAfter),
          statusBefore: text(event.statusBefore),
          statusAfter: text(event.statusAfter),
          occurredAt: timestamp(event.createdAt),
        },
        href: text(event.caseId)
          ? `/staff/cases/${encodeURIComponent(text(event.caseId))}`
          : undefined,
      });
    }
  for (const item of cases) {
    const personId = text(item.createdByPersonId);
    const at = timestamp(item.createdAt);
    if (
      currentYear(item, params.academicYearId) &&
      params.staffIds.has(personId) &&
      !createdEvents.has(`${text(item.id)}:${personId}`) &&
      inPeriod(at, startAt)
    )
      addActivity(activities, {
        type: "STUDENT_CASE_CREATED",
        metricKey: "studentCases",
        personId,
        schoolId: text(item.schoolId),
        activityAt: at!,
        title: "إنشاء حالة طلابية",
        description: "",
        status: text(item.status),
        targetName: text(item.studentDisplayName),
        classLabel: text(item.classTitle),
        sourceEntityId: text(item.id),
        details: {
          kind: "STUDENT_CASE",
          studentDisplayName: text(item.studentDisplayName),
          classLabel: text(item.classTitle),
          eventType: "CREATED",
          status: text(item.status),
          statusBefore: "",
          statusAfter: text(item.status),
          occurredAt: timestamp(item.createdAt),
        },
        href: `/staff/cases/${encodeURIComponent(text(item.id))}`,
      });
  }
  for (const item of attendance) {
    const at =
      timestamp(item.recordedAt) ??
      timestamp(item.submittedAt) ??
      timestamp(item.createdAt);
    const personId = text(item.createdByPersonId);
    if (
      currentYear(item, params.academicYearId) &&
      params.staffIds.has(personId) &&
      inPeriod(at, startAt)
    )
      addActivity(activities, {
        type: "ATTENDANCE_BATCH_RECORDED",
        metricKey: "attendance",
        personId,
        schoolId: text(item.schoolId),
        activityAt: at!,
        title: "تسجيل دفعة حضور",
        description: text(item.schoolDayId),
        status: text(item.status),
        targetName: "",
        classLabel: text(item.classTitle) || text(item.classId),
        sourceEntityId: text(item.id),
        details: attendanceDetails(item),
        href: `/staff/attendance/batches/${encodeURIComponent(text(item.id))}`,
      });
  }
  for (const item of lessonPreps) {
    if (!currentYear(item, params.academicYearId)) continue;
    const approvedAt = timestamp(item.approvedAt);
    const returnedAt = timestamp(item.returnedAt);
    if (
      params.staffIds.has(text(item.approvedByPersonId)) &&
      inPeriod(approvedAt, startAt)
    )
      addActivity(activities, {
        type: "LESSON_PREP_APPROVED",
        metricKey: "lessonPrepReview",
        personId: text(item.approvedByPersonId),
        schoolId: text(item.schoolId),
        activityAt: approvedAt!,
        title: "اعتماد تحضير درس",
        description: text(item.lessonTitle),
        status: text(item.status),
        targetName: text(item.teacherDisplayName),
        classLabel: text(item.classTitle) || text(item.classId),
        sourceEntityId: text(item.id),
        details: {
          kind: "LESSON_PREP_REVIEW",
          action: "APPROVED",
          teacherName: text(item.teacherDisplayName) || text(item.teacherName),
          lessonTitle: text(item.lessonTitle),
          subjectLabel: text(item.subjectTitle) || text(item.subjectKey),
          classLabel: text(item.classTitle) || text(item.classId),
          lessonDate: text(item.lessonDate),
          status: text(item.status),
          approvedAt: timestamp(item.approvedAt),
          returnedAt: timestamp(item.returnedAt),
          reviewNote: text(item.approvalNote),
        },
      });
    if (
      params.staffIds.has(text(item.returnedByPersonId)) &&
      inPeriod(returnedAt, startAt)
    )
      addActivity(activities, {
        type: "LESSON_PREP_RETURNED",
        metricKey: "lessonPrepReview",
        personId: text(item.returnedByPersonId),
        schoolId: text(item.schoolId),
        activityAt: returnedAt!,
        title: "إعادة تحضير للتعديل",
        description: text(item.lessonTitle),
        status: text(item.status),
        targetName: text(item.teacherDisplayName),
        classLabel: text(item.classTitle) || text(item.classId),
        sourceEntityId: text(item.id),
        details: {
          kind: "LESSON_PREP_REVIEW",
          action: "RETURNED",
          teacherName: text(item.teacherDisplayName) || text(item.teacherName),
          lessonTitle: text(item.lessonTitle),
          subjectLabel: text(item.subjectTitle) || text(item.subjectKey),
          classLabel: text(item.classTitle) || text(item.classId),
          lessonDate: text(item.lessonDate),
          status: text(item.status),
          approvedAt: timestamp(item.approvedAt),
          returnedAt: timestamp(item.returnedAt),
          reviewNote: text(item.returnReason),
        },
      });
  }
  for (const item of workDocumentation) {
    const activityAt = timestamp(item.updatedAt) ?? timestamp(item.createdAt);
    const personId = text(item.personId);
    if (
      currentYear(item, params.academicYearId) &&
      params.staffIds.has(personId) &&
      inPeriod(activityAt, startAt)
    )
      addActivity(activities, {
        type: "WORK_DOCUMENTATION",
        metricKey: "workDocumentation",
        personId,
        schoolId: text(item.schoolId),
        activityAt: activityAt!,
        title: "توثيق عمل",
        description: text(item.templateTitle) || text(item.templateKey),
        status: "",
        targetName: "",
        classLabel: "",
        sourceEntityId: text(item.id),
        details: {
          kind: "WORK_DOCUMENTATION",
          templateTitle: text(item.templateTitle),
          templateKey: text(item.templateKey),
          instanceMode: text(item.instanceMode) || "SINGLE",
          createdAt: timestamp(item.createdAt),
          updatedAt: timestamp(item.updatedAt),
        },
      });
  }
  return activities.sort((a, b) => b.activityAt - a.activityAt);
}

async function staffWork(params: { uid: string; input: Row }) {
  const orgId = id(params.input.orgId, "orgId");
  const academicYearId = text(params.input.academicYearId);
  const selectedPeriod = period(params.input.period);
  const actor = await resolveActor({
    uid: params.uid,
    orgId,
  });

  const viewerConfig = await loadStaffWorkViewerConfig({
    orgId,
    viewerPersonId: actor.personId,
  });

  const staff = await listEligibleStaff({
    orgId,
    actor,
    academicYearId,
    includedPersonIds: new Set(viewerConfig.includedPersonIds),
    excludedPersonIds: new Set(viewerConfig.excludedPersonIds),
  });

  const activities = await collectActivities({
    orgId,
    actor,
    staffIds: new Set(staff.map((item) => item.personId)),
    academicYearId,
    period: selectedPeriod,
  });
  const summaries = staff
    .map<StaffWorkSummary>((item) => {
      const personActivities = activities.filter(
        (activity) => activity.personId === item.personId,
      );
      const metrics = emptyMetrics();
      for (const activity of personActivities) {
        metrics[activity.metricKey].count += 1;
        metrics[activity.metricKey].latestActivityAt = Math.max(
          metrics[activity.metricKey].latestActivityAt ?? 0,
          activity.activityAt,
        );
      }
      return {
        ...item,
        totalActivityCount: personActivities.length,
        latestActivityAt: personActivities[0]?.activityAt ?? null,
        metrics,
      };
    })
    .sort((left, right) =>
      left.displayName.localeCompare(right.displayName, "ar"),
    );
  return {
    academicYearId,
    period: selectedPeriod,
    allowedSchoolIds: actor.schoolIds,
    summaries,
    activities,
  };
}

export const getStaffWorkOverview = onCall(
  { region: REGION, cors: true, invoker: "public", memory: "512MiB" },
  async (request) => {
    if (!request.auth?.uid)
      throw new HttpsError("unauthenticated", "Authentication is required.");
    const result = await staffWork({
      uid: request.auth.uid,
      input: row(request.data),
    });
    return {
      academicYearId: result.academicYearId,
      period: result.period,
      allowedSchoolIds: result.allowedSchoolIds,
      staff: result.summaries,
    };
  },
);

export const getStaffWorkDetail = onCall(
  { region: REGION, cors: true, invoker: "public", memory: "512MiB" },
  async (request) => {
    if (!request.auth?.uid)
      throw new HttpsError("unauthenticated", "Authentication is required.");
    const input = row(request.data);
    const personId = id(input.personId, "personId");
    const result = await staffWork({ uid: request.auth.uid, input });
    const staff = result.summaries.find((item) => item.personId === personId);
    if (!staff)
      throw new HttpsError(
        "not-found",
        "Staff member is not available in your staff-work scope.",
      );
    return {
      academicYearId: result.academicYearId,
      period: result.period,
      staff,
      activities: result.activities.filter(
        (activity) => activity.personId === personId,
      ),
    };
  },
);

/** Lazily returns a single non-secret work-documentation record for Staff Work. */
export const getStaffWorkDocumentationRecord = onCall(
  { region: REGION, cors: true, invoker: "public", memory: "512MiB" },
  async (request) => {
    if (!request.auth?.uid)
      throw new HttpsError("unauthenticated", "Authentication is required.");

    const input = row(request.data);
    const orgId = id(input.orgId, "orgId");
    const staffPersonId = id(input.staffPersonId, "staffPersonId");
    const sourceEntityId = id(input.sourceEntityId, "sourceEntityId");
    const actor = await resolveActor({ uid: request.auth.uid, orgId });
    const viewerConfig = await loadStaffWorkViewerConfig({
      orgId,
      viewerPersonId: actor.personId,
    });
    const eligibleStaff = await listEligibleStaff({
      orgId,
      actor,
      academicYearId: "",
      includedPersonIds: new Set(viewerConfig.includedPersonIds),
      excludedPersonIds: new Set(viewerConfig.excludedPersonIds),
    });
    if (!eligibleStaff.some((staff) => staff.personId === staffPersonId)) {
      throw new HttpsError(
        "permission-denied",
        "Staff member is not available in your staff-work scope.",
      );
    }

    const snapshot = await getFirestore()
      .doc(`orgs/${orgId}/workDocumentation/${sourceEntityId}`)
      .get();
    if (!snapshot.exists)
      throw new HttpsError("not-found", "Work-documentation record was not found.");

    const record = row(snapshot.data());
    if (
      text(record.personId) !== staffPersonId ||
      !actor.schoolIds.includes(text(record.schoolId))
    ) {
      throw new HttpsError("permission-denied", "Work-documentation access denied.");
    }

    const templateKey = text(record.templateKey);
    const isSecret = SECRET_WORK_DOCUMENTATION_TEMPLATE_KEYS.has(templateKey);
    const base = {
      id: snapshot.id,
      templateKey,
      templateTitle: text(record.templateTitle) || templateKey,
      instanceMode: text(record.instanceMode) === "MULTIPLE" ? "MULTIPLE" : "SINGLE",
      instanceId: text(record.instanceId) || undefined,
      schoolId: text(record.schoolId),
      academicYearId: text(record.academicYearId),
      termId: text(record.termId),
      createdAt: timestamp(record.createdAt),
      updatedAt: timestamp(record.updatedAt),
      isSecret,
      canViewRecord: !isSecret,
    };
    if (isSecret) return base;

    return {
      ...base,
      values: safeDocumentationValues(record.data),
    };
  },
);
