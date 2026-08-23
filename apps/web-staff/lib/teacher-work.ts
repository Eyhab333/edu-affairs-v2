import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
} from "firebase/firestore";
import type {
  ClassSubjectOffering,
  TeacherAssignment,
  TeacherAssignmentClassLink,
} from "@takween/contracts";

import { db } from "@/lib/firebase";
import type { StaffActorData } from "@/lib/staff-actor";

export type TeacherWorkPeriod = "WEEK" | "MONTH" | "ALL";

export type TeacherWorkMetricKey =
  | "measurements"
  | "learningLoss"
  | "notes"
  | "gamification"
  | "homework"
  | "lessonPrep";

export type TeacherWorkMetric = {
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
  studentIds?: Set<string>;
};

export type TeacherWorkSummary = {
  teacherPersonId: string;
  displayName: string;
  schoolIds: string[];
  schoolNames: string[];
  classLabels: string[];
  subjectLabels: string[];
  metrics: Record<TeacherWorkMetricKey, TeacherWorkMetric>;
};

type FirestoreRow = {
  id: string;
  [key: string]: unknown;

  academicYearId?: unknown;
  schoolId?: unknown;
  status?: unknown;
  startAt?: unknown;
  endAt?: unknown;
  teacherPersonId?: unknown;
  targetScopeType?: unknown;
  targetScopeId?: unknown;
  assignmentId?: unknown;
  classSubjectOfferingId?: unknown;
  classId?: unknown;
  createdByPersonId?: unknown;
  measuredAt?: unknown;
  submittedAt?: unknown;
  createdAt?: unknown;
  updatedAt?: unknown;
  recordedAt?: unknown;
  studentId?: unknown;
  occurredAt?: unknown;
  sourcePath?: unknown;
  publishedAt?: unknown;
  approvedAt?: unknown;
  returnedAt?: unknown;
};

const METRIC_KEYS: TeacherWorkMetricKey[] = [
  "measurements",
  "learningLoss",
  "notes",
  "gamification",
  "homework",
  "lessonPrep",
];

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function numberValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function unique(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

function emptyMetric(): TeacherWorkMetric {
  return {
    count: 0,
    latestActivityAt: null,
    classLabels: [],
    subjectLabels: [],
  };
}

function emptyMetrics(): Record<TeacherWorkMetricKey, TeacherWorkMetric> {
  return {
    measurements: emptyMetric(),
    learningLoss: emptyMetric(),
    notes: emptyMetric(),
    gamification: emptyMetric(),
    homework: emptyMetric(),
    lessonPrep: emptyMetric(),
  };
}

function getPeriodStart(period: TeacherWorkPeriod) {
  if (period === "ALL") return null;

  const now = new Date();
  if (period === "WEEK") {
    const start = new Date(now);
    start.setDate(now.getDate() - 6);
    start.setHours(0, 0, 0, 0);
    return start.getTime();
  }

  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  return start.getTime();
}

function isInPeriod(activityAt: number | null, periodStart: number | null) {
  return !periodStart || (activityAt !== null && activityAt >= periodStart);
}

function isInCurrentAcademicYear(row: FirestoreRow, academicYearId?: string) {
  return !academicYearId || text(row.academicYearId) === academicYearId;
}

function metricLatest(...values: Array<number | null>) {
  const dates = values.filter((value): value is number => value !== null);
  return dates.length ? Math.max(...dates) : null;
}

function displaySubjectLabel(params: { offering?: ClassSubjectOffering }) {
  return (
    text(params.offering?.displayName) ||
    text(params.offering?.subjectTitleSnapshot) ||
    text(params.offering?.shortLabel)
  );
}

function buildLabelResolvers(actor: StaffActorData) {
  const classById = new Map(actor.classes.map((item) => [item.id, item]));
  const offeringById = new Map(
    actor.classSubjectOfferings.map((item) => [item.id, item]),
  );

  return {
    classLabel(classId: unknown) {
      const classItem = classById.get(text(classId));
      return text(classItem?.title);
    },
    subjectLabel(row: FirestoreRow) {
      return displaySubjectLabel({
        offering: offeringById.get(text(row.classSubjectOfferingId)),
      });
    },
  };
}

async function listRowsForSchools(params: {
  orgId: string;
  collectionName: string;
  schoolIds: string[];
}): Promise<FirestoreRow[]> {
  const rows = await Promise.all(
    params.schoolIds.map(async (schoolId) => {
      const ref = collection(db, "orgs", params.orgId, params.collectionName);
      const snap = await getDocs(query(ref, where("schoolId", "==", schoolId)));
      return snap.docs.map(
        (item) =>
          ({
            id: item.id,
            ...(item.data() as Record<string, unknown>),
          }) as FirestoreRow,
      );
    }),
  );

  return rows.flat();
}

async function loadTeacherNames(params: {
  orgId: string;
  teacherPersonIds: string[];
}) {
  const entries = await Promise.all(
    params.teacherPersonIds.map(async (personId) => {
      try {
        const snap = await getDoc(doc(db, "orgs", params.orgId, "people", personId));
        return [personId, text(snap.data()?.displayName)] as const;
      } catch {
        return [personId, ""] as const;
      }
    }),
  );

  return new Map(entries);
}

function getActiveAssignments(params: {
  rows: FirestoreRow[];
  currentAcademicYearId?: string;
}) {
  const now = Date.now();
  return params.rows.filter((row) => {
    if (text(row.status) !== "ACTIVE") return false;
    if (
      params.currentAcademicYearId &&
      text(row.academicYearId) !== params.currentAcademicYearId
    ) {
      return false;
    }

    const startAt = numberValue(row.startAt);
    const endAt = numberValue(row.endAt);
    return (!startAt || startAt <= now) && (!endAt || endAt >= now);
  }) as Array<TeacherAssignment & FirestoreRow>;
}

function addMetricRow(params: {
  metric: TeacherWorkMetric;
  row: FirestoreRow;
  latestAt: number | null;
  classLabel: string;
  subjectLabel: string;
}) {
  params.metric.count += 1;
  params.metric.latestActivityAt = metricLatest(
    params.metric.latestActivityAt,
    params.latestAt,
  );
  params.metric.classLabels = unique([
    ...params.metric.classLabels,
    params.classLabel,
  ]);
  params.metric.subjectLabels = unique([
    ...params.metric.subjectLabels,
    params.subjectLabel,
  ]);
}

function latestLessonPrepActivity(row: FirestoreRow) {
  return metricLatest(
    numberValue(row.updatedAt),
    numberValue(row.submittedAt),
    numberValue(row.approvedAt),
    numberValue(row.returnedAt),
    numberValue(row.createdAt),
  );
}

function isManualTeacherGamification(row: FirestoreRow) {
  return !text(row.sourcePath).includes("/gamificationAchievementRules/");
}

export async function loadTeacherWorkSummaries(params: {
  actor: StaffActorData;
  period?: TeacherWorkPeriod;
}) {
  const schoolIds = unique(params.actor.schools.map((school) => school.id));
  const period = params.period ?? "ALL";
  const periodStart = getPeriodStart(period);
  const schoolNameById = new Map(
    params.actor.schools.map((school) => [school.id, school.name]),
  );

  const [assignmentRows, linkRows, measurementRows, learningLossRows, noteRows, gamificationRows, homeworkRows, lessonPrepRows] =
    await Promise.all([
      listRowsForSchools({ orgId: params.actor.orgId, collectionName: "teacherAssignments", schoolIds }),
      listRowsForSchools({ orgId: params.actor.orgId, collectionName: "teacherAssignmentClassLinks", schoolIds }),
      listRowsForSchools({ orgId: params.actor.orgId, collectionName: "studentMeasurementBatches", schoolIds }),
      listRowsForSchools({ orgId: params.actor.orgId, collectionName: "studentLearningLossPlans", schoolIds }),
      listRowsForSchools({ orgId: params.actor.orgId, collectionName: "studentNotes", schoolIds }),
      listRowsForSchools({ orgId: params.actor.orgId, collectionName: "studentGamificationEvents", schoolIds }),
      listRowsForSchools({ orgId: params.actor.orgId, collectionName: "studentHomeworkAssignments", schoolIds }),
      listRowsForSchools({ orgId: params.actor.orgId, collectionName: "subjectLessonPreps", schoolIds }),
    ]);

  const assignments = getActiveAssignments({
    rows: assignmentRows,
    currentAcademicYearId: params.actor.currentTerm?.academicYearId,
  });
  const links = linkRows as Array<TeacherAssignmentClassLink & FirestoreRow>;
  const teacherIds = unique(assignments.map((item) => item.teacherPersonId));
  const teacherNames = await loadTeacherNames({
    orgId: params.actor.orgId,
    teacherPersonIds: teacherIds,
  });
  const labels = buildLabelResolvers(params.actor);

  const summaries = new Map<string, TeacherWorkSummary>();
  for (const teacherPersonId of teacherIds) {
    const teacherAssignments = assignments.filter(
      (assignment) => assignment.teacherPersonId === teacherPersonId,
    );
    const assignmentIds = new Set(teacherAssignments.map((item) => item.id));
    const classIds = unique([
      ...teacherAssignments.map((item) =>
        item.targetScopeType === "CLASS" ? item.targetScopeId : "",
      ),
      ...teacherAssignments.map((assignment) => {
        const offering = params.actor.classSubjectOfferings.find(
          (offeringItem) => offeringItem.id === assignment.classSubjectOfferingId,
        );
        return offering?.classId ?? "";
      }),
      ...links
        .filter((link) => assignmentIds.has(link.assignmentId))
        .map((link) => link.classId),
    ]);
    const subjectLabels = unique(
      teacherAssignments.map((assignment) =>
        displaySubjectLabel({
          offering: params.actor.classSubjectOfferings.find(
            (item) => item.id === assignment.classSubjectOfferingId,
          ),
        }),
      ),
    );
    const teacherSchoolIds = unique(teacherAssignments.map((item) => item.schoolId));

    summaries.set(teacherPersonId, {
      teacherPersonId,
      displayName: teacherNames.get(teacherPersonId) || "معلم غير محدد",
      schoolIds: teacherSchoolIds,
      schoolNames: teacherSchoolIds.map((id) => schoolNameById.get(id) || "").filter(Boolean),
      classLabels: unique(classIds.map((id) => labels.classLabel(id))),
      subjectLabels,
      metrics: emptyMetrics(),
    });
  }

  function withTeacher(ownerId: string, apply: (summary: TeacherWorkSummary) => void) {
    const summary = summaries.get(ownerId);
    if (summary) apply(summary);
  }

  for (const row of measurementRows) {
    if (!isInCurrentAcademicYear(row, params.actor.currentTerm?.academicYearId)) continue;
    const activityAt = metricLatest(numberValue(row.measuredAt), numberValue(row.submittedAt), numberValue(row.createdAt));
    if (!isInPeriod(activityAt, periodStart)) continue;
    withTeacher(text(row.createdByPersonId), (summary) => {
      addMetricRow({ metric: summary.metrics.measurements, row, latestAt: activityAt, classLabel: labels.classLabel(row.classId), subjectLabel: labels.subjectLabel(row) });
      if (text(row.status) === "SUBMITTED") summary.metrics.measurements.submittedCount = (summary.metrics.measurements.submittedCount ?? 0) + 1;
    });
  }

  for (const row of learningLossRows) {
    if (!isInCurrentAcademicYear(row, params.actor.currentTerm?.academicYearId)) continue;
    const activityAt = numberValue(row.createdAt);
    if (!isInPeriod(activityAt, periodStart)) continue;
    withTeacher(text(row.createdByPersonId), (summary) => {
      addMetricRow({ metric: summary.metrics.learningLoss, row, latestAt: metricLatest(numberValue(row.updatedAt), activityAt), classLabel: labels.classLabel(row.classId), subjectLabel: labels.subjectLabel(row) });
      if (["ACTIVE", "IN_PROGRESS"].includes(text(row.status))) summary.metrics.learningLoss.activeCount = (summary.metrics.learningLoss.activeCount ?? 0) + 1;
      if (text(row.status) === "CLOSED") summary.metrics.learningLoss.closedCount = (summary.metrics.learningLoss.closedCount ?? 0) + 1;
    });
  }

  for (const row of noteRows) {
    if (!isInCurrentAcademicYear(row, params.actor.currentTerm?.academicYearId)) continue;
    const activityAt = metricLatest(numberValue(row.recordedAt), numberValue(row.createdAt));
    if (!isInPeriod(activityAt, periodStart)) continue;
    withTeacher(text(row.recordedByPersonId), (summary) => {
      addMetricRow({ metric: summary.metrics.notes, row, latestAt: activityAt, classLabel: labels.classLabel(row.classId), subjectLabel: "" });
      const students = new Set<string>(summary.metrics.notes.studentIds ?? []);
      if (text(row.studentId)) students.add(text(row.studentId));
      summary.metrics.notes.studentIds = students;
      summary.metrics.notes.uniqueStudents = students.size;
    });
  }

  for (const row of gamificationRows) {
    if (!isInCurrentAcademicYear(row, params.actor.currentTerm?.academicYearId)) continue;
    const activityAt = metricLatest(numberValue(row.occurredAt), numberValue(row.createdAt));
    if (!isManualTeacherGamification(row) || !isInPeriod(activityAt, periodStart)) continue;
    withTeacher(text(row.createdByPersonId), (summary) => {
      addMetricRow({ metric: summary.metrics.gamification, row, latestAt: activityAt, classLabel: labels.classLabel(row.classId), subjectLabel: labels.subjectLabel(row) });
      const students = new Set<string>(summary.metrics.gamification.studentIds ?? []);
      if (text(row.studentId)) students.add(text(row.studentId));
      summary.metrics.gamification.studentIds = students;
      summary.metrics.gamification.uniqueStudents = students.size;
    });
  }

  for (const row of homeworkRows) {
    if (!isInCurrentAcademicYear(row, params.actor.currentTerm?.academicYearId)) continue;
    const activityAt = metricLatest(numberValue(row.publishedAt), numberValue(row.createdAt));
    if (!isInPeriod(activityAt, periodStart)) continue;
    withTeacher(text(row.createdByPersonId), (summary) => {
      addMetricRow({ metric: summary.metrics.homework, row, latestAt: metricLatest(numberValue(row.updatedAt), activityAt), classLabel: labels.classLabel(row.classId), subjectLabel: labels.subjectLabel(row) });
      const status = text(row.status);
      if (status === "DRAFT") summary.metrics.homework.draftCount = (summary.metrics.homework.draftCount ?? 0) + 1;
      if (status === "PUBLISHED") summary.metrics.homework.publishedCount = (summary.metrics.homework.publishedCount ?? 0) + 1;
      if (status === "CLOSED") summary.metrics.homework.closedCount = (summary.metrics.homework.closedCount ?? 0) + 1;
    });
  }

  for (const row of lessonPrepRows) {
    if (!isInCurrentAcademicYear(row, params.actor.currentTerm?.academicYearId)) continue;
    const activityAt = numberValue(row.createdAt);
    if (!isInPeriod(activityAt, periodStart)) continue;
    withTeacher(text(row.teacherPersonId), (summary) => {
      addMetricRow({ metric: summary.metrics.lessonPrep, row, latestAt: latestLessonPrepActivity(row), classLabel: labels.classLabel(row.classId), subjectLabel: labels.subjectLabel(row) });
      const status = text(row.status);
      if (status === "DRAFT") summary.metrics.lessonPrep.draftCount = (summary.metrics.lessonPrep.draftCount ?? 0) + 1;
      if (status === "SUBMITTED") summary.metrics.lessonPrep.submittedCount = (summary.metrics.lessonPrep.submittedCount ?? 0) + 1;
      if (status === "APPROVED") summary.metrics.lessonPrep.approvedCount = (summary.metrics.lessonPrep.approvedCount ?? 0) + 1;
      if (status === "RETURNED") summary.metrics.lessonPrep.returnedCount = (summary.metrics.lessonPrep.returnedCount ?? 0) + 1;
    });
  }

  return Array.from(summaries.values()).sort((a, b) =>
    a.displayName.localeCompare(b.displayName, "ar"),
  );
}

export async function loadTeacherWorkSummary(params: {
  actor: StaffActorData;
  teacherPersonId: string;
  period: TeacherWorkPeriod;
}) {
  const summaries = await loadTeacherWorkSummaries(params);
  return summaries.find((item) => item.teacherPersonId === params.teacherPersonId) ?? null;
}

export const teacherWorkMetricLabels: Record<TeacherWorkMetricKey, string> = {
  measurements: "القياسات",
  learningLoss: "الفاقد التعليمي",
  notes: "الملاحظات",
  gamification: "التحفيز",
  homework: "الواجبات",
  lessonPrep: "التحضير",
};

export const teacherWorkMetricOrder = METRIC_KEYS;
