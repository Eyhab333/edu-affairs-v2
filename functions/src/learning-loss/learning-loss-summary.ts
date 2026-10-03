import { getFirestore } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import type {
  Class,
  ClassSubjectOffering,
  Membership,
  OperationalAssignment,
  TeacherAssignment,
  TeacherAssignmentClassLink,
} from "@takween/contracts";
import {
  buildStaffHome,
  getVisibleClassesForActor,
  hasOrgWideAccess,
} from "@takween/domain";

import {
  loadMeasurementStudentNames,
  loadTeacherNames,
} from "../shared/directory-names";

const REGION = "me-central2";
const FIRESTORE_IN_QUERY_LIMIT = 10;

type Row = Record<string, unknown>;

type LearningLossSkill = {
  id: string;
  title: string;
  description: string;
  domain: string;
  severity: string;
};

type LearningLossRemediationAction = {
  id: string;
  title: string;
  description: string;
  status: string;
  dueAt: number | null;
  completedAt: number | null;
  note: string;
};

type LearningLossSummaryRow = {
  id: string;
  teacherPersonId: string;
  teacherDisplayName: string;
  studentId: string;
  studentDisplayName: string;
  schoolId: string;
  schoolName: string;
  academicYearId: string;
  termId: string;
  gradeId: string;
  classId: string;
  classTitle: string;
  subjectKey: string;
  subjectTitle: string;
  classSubjectOfferingId: string;
  status: string;
  sourceType: string;
  sourceTitle: string;
  sourceKind: string;
  planTitle: string;
  planText: string;
  planStartAt: number | null;
  planEndAt: number | null;
  lostSkills: LearningLossSkill[];
  remediationActions: LearningLossRemediationAction[];
  baselineScore: number | null;
  baselineMaxScore: number | null;
  baselineMeasuredAt: number | null;
  firstCheckScore: number | null;
  firstCheckMaxScore: number | null;
  firstCheckMeasuredAt: number | null;
  firstCheckNote: string;
  secondCheckScore: number | null;
  secondCheckMaxScore: number | null;
  secondCheckMeasuredAt: number | null;
  secondCheckNote: string;
  improvementIndicator: string;
  improvementDelta: number | null;
  improvementPercentage: number | null;
  createdAt: number | null;
  updatedAt: number | null;
  lastFollowUpAt: number | null;
};

type LearningLossSummaryResponse = {
  rows: LearningLossSummaryRow[];
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

function stringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && !!item.trim())
    : [];
}

function unique(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function chunk<T>(items: T[], size: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function requireOrgId(value: unknown) {
  const orgId = text(value);
  if (!orgId || orgId.includes("/")) {
    throw new HttpsError("invalid-argument", "orgId is required.");
  }
  return orgId;
}

function classKey(value: { schoolId?: string; academicYearId?: string; classId?: string }) {
  return `${value.schoolId || ""}::${value.academicYearId || ""}::${value.classId || ""}`;
}

function isTechnicalIdentifier(value: string) {
  return /^[a-z0-9]+(?:[-_][a-z0-9]+)+$/i.test(value);
}

function readableValue(value: unknown) {
  const result = text(value);
  return result && !isTechnicalIdentifier(result) ? result : "";
}

function titleParts(classItem: Class) {
  return readableValue(row(classItem).title)
    .split(/\s*(?:\/|\||•)\s*/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function classDisplayContext(classItem: Class) {
  const data = row(classItem);
  const parts = titleParts(classItem);
  const gradeTitle = readableValue(data.gradeTitle) || parts[0] || "";
  const streamId = text(data.streamId).toLowerCase();
  const streamName =
    streamId === "stream-general" || streamId === "general"
      ? "عام"
      : streamId === "stream-quran" || streamId === "quran"
        ? "تحفيظ"
        : (parts[1] || "").replace(/^المسار\s*/, "");

  return {
    gradeKey: text(data.gradeId) || gradeTitle,
    gradeTitle,
    streamKey: streamName || streamId || "general",
    streamName,
    sectionLabel: readableValue(data.sectionLabel) || parts[2] || "",
  };
}

function classTitle(classItem: Class, visibleClasses: Class[]) {
  const context = classDisplayContext(classItem);
  const contexts = visibleClasses.map(classDisplayContext);
  const sameGrade = contexts.filter((item) => item.gradeKey === context.gradeKey);
  const streamCount = new Set(sameGrade.map((item) => item.streamKey)).size;
  const sameGradeAndStream = sameGrade.filter(
    (item) => item.streamKey === context.streamKey,
  );
  const sectionCount = new Set(
    sameGradeAndStream.map((item) => item.sectionLabel).filter(Boolean),
  ).size;
  const gradeAlreadyIncludesSection =
    Boolean(context.sectionLabel) &&
    (context.gradeTitle === context.sectionLabel ||
      context.gradeTitle.startsWith(`${context.sectionLabel} `) ||
      context.gradeTitle.endsWith(` ${context.sectionLabel}`) ||
      context.gradeTitle.includes(` ${context.sectionLabel} `));
  const friendly = [
    context.gradeTitle,
    streamCount > 1 ? context.streamName : "",
    sectionCount > 1 && !gradeAlreadyIncludesSection
      ? context.sectionLabel
      : "",
  ]
    .filter(Boolean)
    .join(" ");

  return friendly || readableValue(row(classItem).title) || "فصل غير محدد";
}

function subjectTitle(params: {
  plan: Row;
  offeringById: Map<string, Row>;
  offeringByClassSubject: Map<string, Row>;
}) {
  const schoolId = text(params.plan.schoolId);
  const academicYearId = text(params.plan.academicYearId);
  const classId = text(params.plan.classId);
  const subjectKey = text(params.plan.subjectKey);
  const offering =
    params.offeringById.get(text(params.plan.classSubjectOfferingId)) ||
    params.offeringByClassSubject.get(
      `${schoolId}::${academicYearId}::${classId}::${subjectKey}`,
    );

  return (
    readableValue(offering?.displayName) ||
    readableValue(offering?.shortLabel) ||
    readableValue(offering?.subjectTitleSnapshot) ||
    subjectKey ||
    "مادة غير محددة"
  );
}

function skills(value: unknown): LearningLossSkill[] {
  return (Array.isArray(value) ? value : []).map((item) => {
    const data = row(item);
    return {
      id: text(data.id),
      title: text(data.title),
      description: text(data.description),
      domain: text(data.domain),
      severity: text(data.severity),
    };
  });
}

function remediationActions(value: unknown): LearningLossRemediationAction[] {
  return (Array.isArray(value) ? value : []).map((item) => {
    const data = row(item);
    return {
      id: text(data.id),
      title: text(data.title),
      description: text(data.description),
      status: text(data.status),
      dueAt: numberValue(data.dueAt),
      completedAt: numberValue(data.completedAt),
      note: text(data.note),
    };
  });
}

function lastFollowUpAt(params: {
  actions: LearningLossRemediationAction[];
  firstCheckMeasuredAt: number | null;
  secondCheckMeasuredAt: number | null;
}) {
  const values = [
    ...params.actions.map((action) => action.completedAt),
    params.firstCheckMeasuredAt,
    params.secondCheckMeasuredAt,
  ].filter((value): value is number => value !== null);

  return values.length ? Math.max(...values) : null;
}

function normalizeMembership(params: {
  uid: string;
  orgId: string;
  id: string;
  data: Row;
}): Membership {
  const scopes = row(params.data.scopes);
  const permissions = row(params.data.permissions);
  const role = text(params.data.roleKey) || text(params.data.role);

  return {
    id: params.id,
    uid: params.uid,
    personId: text(params.data.personId),
    orgId: text(params.data.orgId) || params.orgId,
    role: role as Membership["role"],
    roleKey: role as Membership["roleKey"],
    scopes: {
      schoolIds: stringArray(scopes.schoolIds),
      gradeIds: stringArray(scopes.gradeIds),
      classIds: stringArray(scopes.classIds),
      scopeGroupIds: stringArray(scopes.scopeGroupIds),
      subjectKeys: stringArray(scopes.subjectKeys),
      routeIds: stringArray(scopes.routeIds),
      canAccessAllSchools: scopes.canAccessAllSchools === true,
    },
    permissions: {
      manageOrg: permissions.manageOrg === true,
      manageSchools: permissions.manageSchools === true,
      manageDirectory: permissions.manageDirectory === true,
    },
    scopeType: text(params.data.scopeType) as Membership["scopeType"],
    scopeId: text(params.data.scopeId),
    isActive: params.data.isActive !== false && params.data.active !== false,
  } as Membership;
}

async function resolveActorScope(params: { uid: string; orgId: string }) {
  const db = getFirestore();
  const membershipSnapshot = await db
    .doc(`users/${params.uid}/orgMemberships/${params.orgId}`)
    .get();

  if (!membershipSnapshot.exists) {
    throw new HttpsError("permission-denied", "Organization membership was not found.");
  }

  const membershipData = row(membershipSnapshot.data());
  const membership = normalizeMembership({
    uid: params.uid,
    orgId: params.orgId,
    id: membershipSnapshot.id,
    data: membershipData,
  });

  if (membership.isActive === false) {
    throw new HttpsError("permission-denied", "An active staff membership is required.");
  }

  const userSnapshot = await db.doc(`users/${params.uid}`).get();
  const actorPersonId =
    membership.personId || text(userSnapshot.data()?.personId) || params.uid;
  const roles = membership.roleKey || membership.role ? [
    (membership.roleKey || membership.role) as NonNullable<Membership["roleKey"]>,
  ] : [];
  const hasOrgWideRole = hasOrgWideAccess(roles);
  const allowedSchoolIds =
    hasOrgWideRole || membership.scopes?.canAccessAllSchools === true
      ? null
      : unique([
          ...(membership.scopes?.schoolIds ?? []),
          ...(membership.scopeType === "SCHOOL" && membership.scopeId
            ? [membership.scopeId]
            : []),
        ]);

  const [schoolSnapshots, operationalAssignmentsSnapshot, teacherAssignmentsSnapshot] =
    await Promise.all([
      allowedSchoolIds === null
        ? db.collection(`orgs/${params.orgId}/schools`).get()
        : db.getAll(
            ...allowedSchoolIds.map((schoolId) =>
              db.doc(`orgs/${params.orgId}/schools/${schoolId}`),
            ),
          ),
      db
        .collection(`orgs/${params.orgId}/operationalAssignments`)
        .where("actorPersonId", "==", actorPersonId)
        .get(),
      db
        .collection(`orgs/${params.orgId}/teacherAssignments`)
        .where("teacherPersonId", "==", actorPersonId)
        .get(),
    ]);

  const schoolDocuments = Array.isArray(schoolSnapshots)
    ? schoolSnapshots
    : schoolSnapshots.docs;
  const classSchoolIds =
    allowedSchoolIds ?? schoolDocuments.map((document) => document.id);
  const schools = schoolDocuments
    .filter((document) => document.exists)
    .filter((document) => row(document.data()).isArchived !== true)
    .map((document) => ({ id: document.id, ...row(document.data()) }));
  const operationalAssignments = operationalAssignmentsSnapshot.docs.map(
    (document) => ({
      id: document.id,
      ...document.data(),
      targetClassIds: stringArray(document.data().targetClassIds),
      targetGradeIds: stringArray(document.data().targetGradeIds),
    }) as OperationalAssignment,
  );
  const teacherAssignments = teacherAssignmentsSnapshot.docs.map(
    (document) => ({ id: document.id, ...document.data() }) as TeacherAssignment,
  );
  const assignmentLinkSnapshots = await Promise.all(
    chunk(teacherAssignments.map((assignment) => assignment.id), FIRESTORE_IN_QUERY_LIMIT).map(
      (assignmentIds) =>
        db
          .collection(`orgs/${params.orgId}/teacherAssignmentClassLinks`)
          .where("assignmentId", "in", assignmentIds)
          .get(),
    ),
  );
  const teacherAssignmentClassLinks = assignmentLinkSnapshots.flatMap((snapshot) =>
    snapshot.docs.map(
      (document) =>
        ({ id: document.id, ...document.data() }) as TeacherAssignmentClassLink,
    ),
  );

  const academicYearSnapshots = await Promise.all(
    classSchoolIds.map((schoolId) =>
      db.collection(`orgs/${params.orgId}/schools/${schoolId}/academicYears`).get(),
    ),
  );
  const classSnapshots = await Promise.all(
    academicYearSnapshots.flatMap((academicYears) =>
      academicYears.docs.map((academicYear) =>
        academicYear.ref.collection("classes").get(),
      ),
    ),
  );
  const classes = classSnapshots
    .flatMap((snapshot) =>
      snapshot.docs.map(
        (document) => ({ id: document.id, ...document.data() }) as Class,
      ),
    )
    .filter((classItem) => classItem.orgId === params.orgId)
    .filter((classItem) => classItem.isArchived !== true);
  const context = {
    actorPersonId,
    orgId: params.orgId,
    memberships: [membership],
    operationalAssignments,
    teacherAssignments,
    teacherAssignmentClassLinks,
  };
  const visibleClasses = hasOrgWideRole
    ? classes
    : getVisibleClassesForActor({
        context,
        classes,
        teacherAssignmentClassLinks,
      });
  const visibleModules = hasOrgWideRole
    ? ["LEARNING_LOSS"]
    : buildStaffHome({ context, classes: visibleClasses, existingTasks: [] })
        .visibleModules;

  if (!visibleModules.includes("LEARNING_LOSS")) {
    throw new HttpsError("permission-denied", "Learning Loss access is required.");
  }

  return {
    visibleClasses,
    schoolNameById: new Map(
      schools.map((school) => [school.id, readableValue(row(school).name)]),
    ),
  };
}

async function loadLearningLossSummary(params: {
  uid: string;
  input: Row;
}): Promise<LearningLossSummaryResponse> {
  const orgId = requireOrgId(params.input.orgId);
  const actor = await resolveActorScope({ uid: params.uid, orgId });
  const visibleClassByKey = new Map(
    actor.visibleClasses.map((classItem) => [
      classKey(classItem),
      classItem,
    ]),
  );
  const visibleSchoolIds = unique(
    actor.visibleClasses.map((classItem) => classItem.schoolId),
  );

  if (!visibleSchoolIds.length) return { rows: [] };

  const db = getFirestore();
  const [planSnapshots, offeringSnapshots] = await Promise.all([
    Promise.all(
      chunk(visibleSchoolIds, FIRESTORE_IN_QUERY_LIMIT).map((schoolIds) =>
        db
          .collection(`orgs/${orgId}/studentLearningLossPlans`)
          .where("schoolId", "in", schoolIds)
          .get(),
      ),
    ),
    Promise.all(
      chunk(visibleSchoolIds, FIRESTORE_IN_QUERY_LIMIT).map((schoolIds) =>
        db
          .collection(`orgs/${orgId}/classSubjectOfferings`)
          .where("schoolId", "in", schoolIds)
          .get(),
      ),
    ),
  ]);
  const plans = planSnapshots
    .flatMap((snapshot) => snapshot.docs)
    .map((document) => ({ id: document.id, data: row(document.data()) }))
    .filter(({ data }) => visibleClassByKey.has(classKey({
      schoolId: text(data.schoolId),
      academicYearId: text(data.academicYearId),
      classId: text(data.classId),
    })));
  const offerings = offeringSnapshots
    .flatMap((snapshot) => snapshot.docs)
    .map((document) => ({ id: document.id, data: row(document.data()) }))
    .filter(({ data }) => data.isArchived !== true);
  const offeringById = new Map(
    offerings.map(({ id, data }) => [id, data]),
  );
  const offeringByClassSubject = new Map(
    offerings.map(({ data }) => [
      `${text(data.schoolId)}::${text(data.academicYearId)}::${text(data.classId)}::${text(data.subjectKey)}`,
      data,
    ]),
  );
  const [teacherNames, studentNames] = await Promise.all([
    loadTeacherNames(
      orgId,
      plans.map(({ data }) => text(data.createdByPersonId)),
    ),
    loadMeasurementStudentNames({
      orgId,
      lookups: plans.map(({ data }) => ({
        schoolId: text(data.schoolId),
        studentId: text(data.studentId),
      })),
    }),
  ]);

  const rows = plans
    .map(({ id, data }): LearningLossSummaryRow => {
      const schoolId = text(data.schoolId);
      const academicYearId = text(data.academicYearId);
      const classId = text(data.classId);
      const studentId = text(data.studentId);
      const teacherPersonId = text(data.createdByPersonId);
      const actions = remediationActions(data.remediationActions);
      const firstCheckMeasuredAt = numberValue(data.firstCheckMeasuredAt);
      const secondCheckMeasuredAt = numberValue(data.secondCheckMeasuredAt);
      const classItem = visibleClassByKey.get(
        classKey({ schoolId, academicYearId, classId }),
      );

      return {
        id,
        teacherPersonId,
        teacherDisplayName: teacherNames.get(teacherPersonId) || "غير محدد",
        studentId,
        studentDisplayName:
          studentNames.get(`${schoolId}:${studentId}`) || "طالب غير محدد",
        schoolId,
        schoolName: actor.schoolNameById.get(schoolId) || "مدرسة غير محددة",
        academicYearId,
        termId: text(data.termId),
        gradeId: text(data.gradeId),
        classId,
        classTitle: classItem
          ? classTitle(classItem, actor.visibleClasses)
          : "فصل غير محدد",
        subjectKey: text(data.subjectKey),
        subjectTitle: subjectTitle({
          plan: data,
          offeringById,
          offeringByClassSubject,
        }),
        classSubjectOfferingId: text(data.classSubjectOfferingId),
        status: text(data.status) || "ACTIVE",
        sourceType: text(data.sourceType),
        sourceTitle: text(data.sourceTitle),
        sourceKind: text(data.sourceKind),
        planTitle: text(data.planTitle),
        planText: text(data.planText),
        planStartAt: numberValue(data.planStartAt),
        planEndAt: numberValue(data.planEndAt),
        lostSkills: skills(data.lostSkills),
        remediationActions: actions,
        baselineScore: numberValue(data.baselineScore),
        baselineMaxScore: numberValue(data.baselineMaxScore),
        baselineMeasuredAt: numberValue(data.baselineMeasuredAt),
        firstCheckScore: numberValue(data.firstCheckScore),
        firstCheckMaxScore: numberValue(data.firstCheckMaxScore),
        firstCheckMeasuredAt,
        firstCheckNote: text(data.firstCheckNote),
        secondCheckScore: numberValue(data.secondCheckScore),
        secondCheckMaxScore: numberValue(data.secondCheckMaxScore),
        secondCheckMeasuredAt,
        secondCheckNote: text(data.secondCheckNote),
        improvementIndicator: text(data.improvementIndicator) || "UNKNOWN",
        improvementDelta: numberValue(data.improvementDelta),
        improvementPercentage: numberValue(data.improvementPercentage),
        createdAt: numberValue(data.createdAt),
        updatedAt: numberValue(data.updatedAt),
        lastFollowUpAt: lastFollowUpAt({
          actions,
          firstCheckMeasuredAt,
          secondCheckMeasuredAt,
        }),
      };
    })
    .sort((left, right) => {
      const leftDate = left.lastFollowUpAt ?? left.planStartAt ?? 0;
      const rightDate = right.lastFollowUpAt ?? right.planStartAt ?? 0;
      return rightDate - leftDate;
    });

  return { rows };
}

export const getLearningLossSummary = onCall(
  { region: REGION, cors: true, invoker: "public", memory: "512MiB" },
  async (request): Promise<LearningLossSummaryResponse> => {
    if (!request.auth?.uid) {
      throw new HttpsError("unauthenticated", "Authentication is required.");
    }

    return loadLearningLossSummary({
      uid: request.auth.uid,
      input: row(request.data),
    });
  },
);
