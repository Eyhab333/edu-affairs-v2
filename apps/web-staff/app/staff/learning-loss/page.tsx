"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  writeBatch,
} from "firebase/firestore";
import type {
  StudentAssessmentRecord,
  StudentLearningLossPlan,
  StudentTrackerEntry,
} from "@takween/contracts";

import { db } from "@/lib/firebase";
import { useStaffActor } from "@/components/staff/staff-actor-provider";

type VisibleClass = {
  id: string;
  title?: string;
  code?: string;
  schoolId?: string;
  schoolName?: string;
  academicYearId?: string;
  gradeId?: string;
  gradeTitle?: string;
};

type StaffLearningLossActor = {
  uid?: string;
  orgId: string;
  personId?: string;
  roles?: string[];
  roleKeys?: string[];
  visibleClasses?: VisibleClass[];
};

type CandidateSourceType = "ASSESSMENT_RECORD" | "TRACKER_ENTRY";

type CandidateAssessmentRecord = StudentAssessmentRecord & {
  id: string;
  sourceType: "ASSESSMENT_RECORD";
  classSubjectOfferingId?: string;
  batchId?: string;
};

type CandidateTrackerEntry = StudentTrackerEntry & {
  id: string;
  sourceType: "TRACKER_ENTRY";
  subjectKey?: string;
  classSubjectOfferingId?: string;
  needsLearningLossFollowUp?: boolean;
  learningLossPlanId?: string;
  learningLossTriggerReason?: string;
};

type CandidateRecord = CandidateAssessmentRecord | CandidateTrackerEntry;

type LearningLossPlanDoc = StudentLearningLossPlan & {
  id: string;
  classSubjectOfferingId?: string;
  sourceBatchId?: string;
};

type StudentSummary = {
  id: string;
  personId?: string;
  displayName: string;
};

type LearningLossCandidate = {
  record: CandidateRecord;
  student: StudentSummary;
  classInfo: VisibleClass | null;
};

type LearningLossPlanRow = {
  plan: LearningLossPlanDoc;
  student: StudentSummary;
  classInfo: VisibleClass | null;
};

type LoadingState = "idle" | "loading" | "success" | "error";

type LearningLossContextFilter = {
  classId: string;
  schoolId: string;
  academicYearId: string;
  subjectKey: string;
  classSubjectOfferingId: string;
};

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "حدث خطأ غير متوقع";
}

function nowMs() {
  return Date.now();
}

function isMissingPlanId(value: unknown) {
  return typeof value !== "string" || value.trim().length === 0;
}

function formatDate(value?: number) {
  if (!value) return "غير محدد";

  try {
    return new Intl.DateTimeFormat("ar-SA", {
      dateStyle: "medium",
    }).format(new Date(value));
  } catch {
    return "غير محدد";
  }
}

function calculatePercentage(record: CandidateRecord) {
  if (
    typeof record.score !== "number" ||
    typeof record.maxScore !== "number" ||
    record.maxScore <= 0
  ) {
    return null;
  }

  return (record.score / record.maxScore) * 100;
}

function formatScore(record: CandidateRecord) {
  const score =
    typeof record.score === "number"
      ? record.score.toLocaleString("ar-SA")
      : "—";

  const maxScore =
    typeof record.maxScore === "number"
      ? record.maxScore.toLocaleString("ar-SA")
      : "—";

  return `${score} / ${maxScore}`;
}

function formatPercentage(record: CandidateRecord) {
  const percentage = calculatePercentage(record);

  if (percentage === null) return "—";

  return `${percentage.toFixed(1)}%`;
}

function getVisibleClassKey(item: VisibleClass) {
  return [
    item.schoolId || "NO_SCHOOL",
    item.academicYearId || "NO_YEAR",
    item.id,
  ].join(":");
}

function getRecordClassKey(item: {
  schoolId?: string;
  academicYearId?: string;
  classId?: string;
}) {
  return [
    item.schoolId || "NO_SCHOOL",
    item.academicYearId || "NO_YEAR",
    item.classId || "NO_CLASS",
  ].join(":");
}

function getClassLabel(classInfo: VisibleClass | null, classId?: string) {
  if (!classInfo) return classId || "غير محدد";
  return classInfo.title || classInfo.code || classInfo.id;
}

function getSchoolLabel(classInfo: VisibleClass | null, schoolId?: string) {
  if (!classInfo) return schoolId || "غير محدد";
  return classInfo.schoolName || classInfo.schoolId || schoolId || "غير محدد";
}

function resolveActorPersonId(actor: StaffLearningLossActor) {
  return actor.personId || actor.uid || "unknown";
}

function resolveActorRoleKey(actor: StaffLearningLossActor) {
  return actor.roles?.[0] || actor.roleKeys?.[0] || undefined;
}

function getContextFilter(
  searchParams: URLSearchParams,
): LearningLossContextFilter {
  return {
    classId: searchParams.get("classId") || "",
    schoolId: searchParams.get("schoolId") || "",
    academicYearId: searchParams.get("academicYearId") || "",
    subjectKey: searchParams.get("subjectKey") || "",
    classSubjectOfferingId: searchParams.get("classSubjectOfferingId") || "",
  };
}

function hasContextFilter(context: LearningLossContextFilter) {
  return Boolean(
    context.classId ||
    context.schoolId ||
    context.academicYearId ||
    context.subjectKey ||
    context.classSubjectOfferingId,
  );
}

function rowMatchesContext(
  row: {
    classId?: string;
    schoolId?: string;
    academicYearId?: string;
    subjectKey?: string;
    classSubjectOfferingId?: string;
  },
  context: LearningLossContextFilter,
) {
  if (context.classId && row.classId !== context.classId) return false;
  if (context.schoolId && row.schoolId !== context.schoolId) return false;

  if (context.academicYearId && row.academicYearId !== context.academicYearId) {
    return false;
  }

  if (context.subjectKey && row.subjectKey !== context.subjectKey) {
    return false;
  }

  if (
    context.classSubjectOfferingId &&
    row.classSubjectOfferingId !== context.classSubjectOfferingId
  ) {
    return false;
  }

  return true;
}

function buildManualLearningLossHref(context: LearningLossContextFilter) {
  const params = new URLSearchParams();

  if (context.classId) params.set("classId", context.classId);
  if (context.schoolId) params.set("schoolId", context.schoolId);
  if (context.academicYearId) {
    params.set("academicYearId", context.academicYearId);
  }
  if (context.subjectKey) params.set("subjectKey", context.subjectKey);
  if (context.classSubjectOfferingId) {
    params.set("classSubjectOfferingId", context.classSubjectOfferingId);
  }

  const queryString = params.toString();

  return `/staff/learning-loss/manual${queryString ? `?${queryString}` : ""}`;
}

function getCandidateDate(record: CandidateRecord) {
  if (record.sourceType === "ASSESSMENT_RECORD") {
    return record.measuredAt ?? 0;
  }

  return record.recordedAt ?? 0;
}

function getCandidateSourceLabel(record: CandidateRecord) {
  if (record.sourceType === "ASSESSMENT_RECORD") return "قياس رسمي";
  return "متابعة";
}

function getCandidateTitle(record: CandidateRecord) {
  if (record.sourceType === "ASSESSMENT_RECORD") {
    return record.assessmentSlot || record.kind || "قياس طالب";
  }

  return (
    record.topicTitle || record.lessonTitle || record.kind || "متابعة طالب"
  );
}

function getCandidateSourceId(record: CandidateRecord) {
  if (record.sourceType === "ASSESSMENT_RECORD") {
    return record.batchId || "";
  }

  return record.batchId || "";
}

function buildLostSkillTitle(record: CandidateRecord) {
  if (record.subjectKey) {
    return `فاقد في ${record.subjectKey}`;
  }

  if (record.sourceType === "ASSESSMENT_RECORD" && record.assessmentSlot) {
    return `فاقد مرتبط بـ ${record.assessmentSlot}`;
  }

  if (record.sourceType === "TRACKER_ENTRY" && record.topicTitle) {
    return `فاقد مرتبط بـ ${record.topicTitle}`;
  }

  return "مهارة تحتاج معالجة";
}

function buildPlanTitle(record: CandidateRecord, studentName: string) {
  const subjectPart = record.subjectKey ? ` - ${record.subjectKey}` : "";
  const sourcePart = getCandidateTitle(record);

  return `خطة فاقد - ${studentName}${subjectPart} - ${sourcePart}`;
}

function buildPlanText(record: CandidateRecord) {
  const sourceLabel = getCandidateSourceLabel(record);
  const sourceTitle = getCandidateTitle(record);
  const scoreText = formatScore(record);
  const percentageText = formatPercentage(record);
  const sourceDate = formatDate(getCandidateDate(record));

  return [
    `خطة معالجة أولية ناتجة عن ${sourceLabel}.`,
    `المصدر: ${sourceTitle}.`,
    `درجة المصدر: ${scoreText}.`,
    `النسبة: ${percentageText}.`,
    `تاريخ المصدر: ${sourceDate}.`,
    record.subjectKey ? `المادة: ${record.subjectKey}.` : "",
    record.classSubjectOfferingId
      ? `سياق المادة: ${record.classSubjectOfferingId}.`
      : "",
    record.batchId ? `دفعة الإدخال: ${record.batchId}.` : "",
    record.learningLossTriggerReason
      ? `سبب الفتح: ${record.learningLossTriggerReason}.`
      : "سبب الفتح: الدرجة أو النسبة أقل من حد الفاقد المحدد في القالب.",
    "يتم استكمال تفاصيل الخطة والقياس الأول والثاني في صفحة خطة الفاقد.",
  ]
    .filter(Boolean)
    .join("\n");
}

function getStatusLabel(value?: string) {
  switch (value) {
    case "DRAFT":
      return "مسودة";
    case "ACTIVE":
      return "نشطة";
    case "IN_PROGRESS":
      return "قيد المتابعة";
    case "IMPROVED":
      return "تحسن";
    case "PARTIALLY_IMPROVED":
      return "تحسن جزئي";
    case "NOT_IMPROVED":
      return "لم يتحسن";
    case "CLOSED":
      return "مغلقة";
    case "CANCELLED":
      return "ملغاة";
    default:
      return value || "غير محدد";
  }
}

function getIndicatorLabel(value?: string) {
  switch (value) {
    case "IMPROVED":
      return "تحسن واضح";
    case "PARTIAL_IMPROVEMENT":
      return "تحسن جزئي";
    case "NO_IMPROVEMENT":
      return "لا يوجد تحسن";
    case "REGRESSED":
      return "تراجع";
    default:
      return "غير محسوب";
  }
}

function getSourceLabel(value?: string) {
  switch (value) {
    case "ASSESSMENT_RECORD":
      return "من قياس";
    case "TRACKER_ENTRY":
      return "من متابعة";
    case "MANUAL":
      return "فتح يدوي";
    default:
      return value || "غير محدد";
  }
}

function isOpenPlan(plan: LearningLossPlanDoc) {
  return !["CLOSED", "CANCELLED"].includes(String(plan.status || ""));
}

async function loadStudentName(
  orgId: string,
  studentId: string,
): Promise<StudentSummary> {
  try {
    const studentRef = doc(db, "orgs", orgId, "students", studentId);
    const studentSnap = await getDoc(studentRef);

    if (!studentSnap.exists()) {
      return {
        id: studentId,
        displayName: studentId,
      };
    }

    const studentData = studentSnap.data() as {
      personId?: string;
      displayName?: string;
      name?: string;
    };

    const directName = studentData.displayName || studentData.name;

    if (directName) {
      return {
        id: studentId,
        personId: studentData.personId,
        displayName: directName,
      };
    }

    if (!studentData.personId) {
      return {
        id: studentId,
        displayName: studentId,
      };
    }

    const personRef = doc(db, "orgs", orgId, "people", studentData.personId);
    const personSnap = await getDoc(personRef);

    if (!personSnap.exists()) {
      return {
        id: studentId,
        personId: studentData.personId,
        displayName: studentId,
      };
    }

    const personData = personSnap.data() as {
      displayName?: string;
      name?: string;
    };

    return {
      id: studentId,
      personId: studentData.personId,
      displayName: personData.displayName || personData.name || studentId,
    };
  } catch {
    return {
      id: studentId,
      displayName: studentId,
    };
  }
}

async function loadSchoolStudentName(params: {
  orgId: string;
  schoolId: string;
  studentId: string;
}) {
  const directoryRef = doc(
    db,
    "orgs",
    params.orgId,
    "schools",
    params.schoolId,
    "studentDirectory",
    params.studentId,
  );

  const directorySnap = await getDoc(directoryRef);

  const displayName = directorySnap.exists()
    ? String(directorySnap.data().displayName || "").trim()
    : "";

  return {
    id: params.studentId,
    displayName: displayName || params.studentId,
  };
}

export default function StaffLearningLossPage() {
  const { actor } = useStaffActor();
  const router = useRouter();
  const searchParams = useSearchParams();

  const currentActor = actor as StaffLearningLossActor | null;

  const contextFilter = useMemo(() => {
    return getContextFilter(searchParams);
  }, [searchParams]);

  const [candidatesStatus, setCandidatesStatus] =
    useState<LoadingState>("idle");
  const [plansStatus, setPlansStatus] = useState<LoadingState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<LearningLossCandidate[]>([]);
  const [openPlans, setOpenPlans] = useState<LearningLossPlanRow[]>([]);
  const [creatingPlanRecordId, setCreatingPlanRecordId] = useState<
    string | null
  >(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const visibleClasses = useMemo(() => {
    return currentActor?.visibleClasses ?? [];
  }, [currentActor]);

  const visibleSchoolIds = useMemo(() => {
    return Array.from(
      new Set(
        visibleClasses
          .map((item) => item.schoolId)
          .filter(
            (schoolId): schoolId is string =>
              typeof schoolId === "string" && schoolId.trim().length > 0,
          ),
      ),
    );
  }, [visibleClasses]);

  const visibleClassMap = useMemo(() => {
    return new Map(
      visibleClasses.map((item) => [getVisibleClassKey(item), item]),
    );
  }, [visibleClasses]);

  const visibleClassKeys = useMemo(() => {
    return new Set(visibleClasses.map((item) => getVisibleClassKey(item)));
  }, [visibleClasses]);

  const visibleClassIds = useMemo(() => {
    return new Set(visibleClasses.map((item) => item.id));
  }, [visibleClasses]);

  const isRowInVisibleClasses = useCallback(
    (row: { schoolId?: string; academicYearId?: string; classId?: string }) => {
      if (!row.classId) return false;

      const rowHasContext = Boolean(row.schoolId || row.academicYearId);

      if (rowHasContext) {
        return visibleClassKeys.has(getRecordClassKey(row));
      }

      return visibleClassIds.has(row.classId);
    },
    [visibleClassIds, visibleClassKeys],
  );

  const getClassInfoForRow = useCallback(
    (row: { schoolId?: string; academicYearId?: string; classId?: string }) => {
      if (!row.classId) return null;

      const exact = visibleClassMap.get(getRecordClassKey(row));
      if (exact) return exact;

      const matches = visibleClasses.filter((item) => item.id === row.classId);
      if (matches.length === 1) return matches[0];

      return null;
    },
    [visibleClassMap, visibleClasses],
  );

  const loadAssessmentCandidates = useCallback(async () => {
    if (!currentActor?.orgId) return [];

    if (visibleSchoolIds.length === 0) {
      return [];
    }

    const recordsRef = collection(
      db,
      "orgs",
      currentActor.orgId,
      "studentAssessmentRecords",
    );

    const recordSnapshots = await Promise.all(
      visibleSchoolIds.map((schoolId) =>
        getDocs(
          query(
            recordsRef,
            where("schoolId", "==", schoolId),
            where("needsLearningLossFollowUp", "==", true),
          ),
        ),
      ),
    );

    const recordDocuments = recordSnapshots.flatMap(
      (snapshot) => snapshot.docs,
    );

    return recordDocuments
      .map((item) => {
        return {
          id: item.id,
          sourceType: "ASSESSMENT_RECORD" as const,
          ...(item.data() as Omit<
            CandidateAssessmentRecord,
            "id" | "sourceType"
          >),
        };
      })
      .filter((record) => {
        if (!isMissingPlanId(record.learningLossPlanId)) {
          return false;
        }

        if (!isRowInVisibleClasses(record)) {
          return false;
        }

        return rowMatchesContext(record, contextFilter);
      });
  }, [
    contextFilter,
    currentActor?.orgId,
    isRowInVisibleClasses,
    visibleSchoolIds,
  ]);

  const loadTrackerCandidates = useCallback(async () => {
    if (!currentActor?.orgId) return [];

    if (visibleSchoolIds.length === 0) {
      return [];
    }

    const trackersRef = collection(
      db,
      "orgs",
      currentActor.orgId,
      "studentTrackerEntries",
    );

    const trackerSnapshots = await Promise.all(
      visibleSchoolIds.map((schoolId) =>
        getDocs(
          query(
            trackersRef,
            where("schoolId", "==", schoolId),
            where("needsLearningLossFollowUp", "==", true),
          ),
        ),
      ),
    );

    const trackerDocuments = trackerSnapshots.flatMap(
      (snapshot) => snapshot.docs,
    );

    return trackerDocuments
      .map((item) => {
        return {
          id: item.id,
          sourceType: "TRACKER_ENTRY" as const,
          ...(item.data() as Omit<CandidateTrackerEntry, "id" | "sourceType">),
        };
      })
      .filter((record) => {
        if (!isMissingPlanId(record.learningLossPlanId)) {
          return false;
        }

        if (!isRowInVisibleClasses(record)) {
          return false;
        }

        return rowMatchesContext(record, contextFilter);
      });
  }, [
    contextFilter,
    currentActor?.orgId,
    isRowInVisibleClasses,
    visibleSchoolIds,
  ]);

  const loadCandidates = useCallback(async () => {
    if (!currentActor?.orgId) return;

    setCandidatesStatus("loading");
    setError(null);
    setSuccessMessage(null);

    try {
      const [assessmentRecords, trackerEntries] = await Promise.all([
        loadAssessmentCandidates(),
        loadTrackerCandidates(),
      ]);

      const records: CandidateRecord[] = [
        ...assessmentRecords,
        ...trackerEntries,
      ];

      const loadedCandidates = await Promise.all(
        records.map(async (record) => {
          const classInfo = getClassInfoForRow(record);

          const schoolId = record.schoolId || classInfo?.schoolId || "";

          if (!schoolId) {
            throw new Error(
              `السجل الخاص بالطالب ${record.studentId} غير مرتبط بمدرسة.`,
            );
          }

          const student = await loadSchoolStudentName({
            orgId: currentActor.orgId,
            schoolId,
            studentId: record.studentId,
          });

          return {
            record,
            student,
            classInfo,
          };
        }),
      );

      loadedCandidates.sort((a, b) => {
        return getCandidateDate(b.record) - getCandidateDate(a.record);
      });

      setCandidates(loadedCandidates);
      setCandidatesStatus("success");
    } catch (error: unknown) {
      setCandidates([]);
      setError(getErrorMessage(error));
      setCandidatesStatus("error");
    }
  }, [
    currentActor?.orgId,
    getClassInfoForRow,
    loadAssessmentCandidates,
    loadTrackerCandidates,
  ]);

  const loadOpenPlans = useCallback(async () => {
    if (!currentActor?.orgId) return;

    setPlansStatus("loading");
    setError(null);

    try {
      if (visibleSchoolIds.length === 0) {
        setOpenPlans([]);
        setPlansStatus("success");
        return;
      }

      const plansRef = collection(
        db,
        "orgs",
        currentActor.orgId,
        "studentLearningLossPlans",
      );

      const planSnapshots = await Promise.all(
        visibleSchoolIds.map((schoolId) =>
          getDocs(query(plansRef, where("schoolId", "==", schoolId))),
        ),
      );

      const planDocuments = planSnapshots.flatMap((snapshot) => snapshot.docs);

      const plans = planDocuments
        .map((item) => {
          return {
            id: item.id,
            ...(item.data() as Omit<LearningLossPlanDoc, "id">),
          };
        })
        .filter((plan) => {
          if (!isOpenPlan(plan)) {
            return false;
          }

          if (!isRowInVisibleClasses(plan)) {
            return false;
          }

          return rowMatchesContext(plan, contextFilter);
        });

      const rows = await Promise.all(
        plans.map(async (plan) => {
          const classInfo = getClassInfoForRow(plan);

          const schoolId = plan.schoolId || classInfo?.schoolId || "";

          if (!schoolId) {
            throw new Error(`خطة الطالب ${plan.studentId} غير مرتبطة بمدرسة.`);
          }

          const student = await loadSchoolStudentName({
            orgId: currentActor.orgId,
            schoolId,
            studentId: plan.studentId,
          });

          return {
            plan,
            student,
            classInfo,
          };
        }),
      );

      rows.sort((a, b) => {
        const aDate = a.plan.updatedAt ?? a.plan.planStartAt ?? 0;

        const bDate = b.plan.updatedAt ?? b.plan.planStartAt ?? 0;

        return bDate - aDate;
      });

      setOpenPlans(rows);
      setPlansStatus("success");
    } catch (error: unknown) {
      setOpenPlans([]);
      setError(getErrorMessage(error));
      setPlansStatus("error");
    }
  }, [
    contextFilter,
    currentActor?.orgId,
    getClassInfoForRow,
    isRowInVisibleClasses,
    visibleSchoolIds,
  ]);

  const loadAll = useCallback(async () => {
    await Promise.all([loadCandidates(), loadOpenPlans()]);
  }, [loadCandidates, loadOpenPlans]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const createLearningLossPlan = useCallback(
    async (candidate: LearningLossCandidate) => {
      if (!currentActor?.orgId) return;

      const record = candidate.record;

      if (!isMissingPlanId(record.learningLossPlanId)) {
        setError("توجد خطة فاقد مرتبطة بهذا السجل بالفعل.");
        return;
      }

      setCreatingPlanRecordId(record.id);
      setError(null);
      setSuccessMessage(null);

      try {
        const createdAt = nowMs();
        const actorPersonId = resolveActorPersonId(currentActor);
        const actorRoleKey = resolveActorRoleKey(currentActor);

        const plansRef = collection(
          db,
          "orgs",
          currentActor.orgId,
          "studentLearningLossPlans",
        );

        const planRef = doc(plansRef);

        const sourceCollection =
          record.sourceType === "ASSESSMENT_RECORD"
            ? "studentAssessmentRecords"
            : "studentTrackerEntries";

        const sourceRef = doc(
          db,
          "orgs",
          currentActor.orgId,
          sourceCollection,
          record.id,
        );

        const hasBaseline =
          typeof record.score === "number" &&
          typeof record.maxScore === "number";

        const sourceType: CandidateSourceType = record.sourceType;

        const planData = {
          id: planRef.id,

          orgId: currentActor.orgId,
          schoolId: record.schoolId,
          academicYearId: record.academicYearId,

          studentId: record.studentId,
          enrollmentId: record.enrollmentId || "",
          gradeId: record.gradeId || "",
          classId: record.classId || "",
          classSubjectOfferingId: record.classSubjectOfferingId || "",

          sourceType,
          sourceAssessmentRecordId:
            record.sourceType === "ASSESSMENT_RECORD" ? record.id : "",
          sourceTrackerEntryId:
            record.sourceType === "TRACKER_ENTRY" ? record.id : "",
          sourceTemplateId: record.templateId || "",
          sourceKind: record.kind || "",
          sourceTitle: getCandidateTitle(record),
          sourceBatchId: getCandidateSourceId(record),

          subjectKey: record.subjectKey || "",

          lostSkills: [
            {
              id: "skill-1",
              title: buildLostSkillTitle(record),
              description:
                record.learningLossTriggerReason ||
                "تم تحديد الطالب كمرشح للفاقد بناءً على نتيجة القياس أو المتابعة.",
              domain: record.subjectKey || getCandidateTitle(record),
              severity: "MEDIUM",
            },
          ],

          planTitle: buildPlanTitle(record, candidate.student.displayName),
          planText: buildPlanText(record),

          remediationActions: [
            {
              id: "action-1",
              title: "تنفيذ معالجة تعليمية أولية",
              description:
                "تحديد نشاط علاجي مناسب ثم تسجيل القياس الأول والثاني داخل خطة الفاقد.",
              status: "PLANNED",
              note: "",
            },
          ],

          planStartAt: createdAt,

          ownerPersonId: actorPersonId,
          ...(actorRoleKey ? { ownerRoleKey: actorRoleKey } : {}),

          ...(hasBaseline
            ? {
                baselineScore: record.score,
                baselineMaxScore: record.maxScore,
                baselineMeasuredAt: getCandidateDate(record),
              }
            : {}),

          improvementIndicator: "UNKNOWN",
          status: "ACTIVE",

          createdByPersonId: actorPersonId,
          ...(actorRoleKey ? { createdByRoleKey: actorRoleKey } : {}),

          tags:
            record.sourceType === "ASSESSMENT_RECORD"
              ? ["AUTO_FROM_ASSESSMENT"]
              : ["AUTO_FROM_TRACKER"],

          note: "",

          createdAt,
          updatedAt: createdAt,
        };

        const batch = writeBatch(db);

        batch.set(planRef, planData);

        batch.update(sourceRef, {
          learningLossPlanId: planRef.id,
          updatedAt: createdAt,
        });

        await batch.commit();

        setCandidates((current) =>
          current.filter((item) => {
            return !(
              item.record.id === record.id &&
              item.record.sourceType === record.sourceType
            );
          }),
        );

        setSuccessMessage(
          `تم فتح خطة فاقد للطالب ${candidate.student.displayName} بنجاح.`,
        );

        router.push(`/staff/learning-loss/plans/${planRef.id}`);
      } catch (error: unknown) {
        setError(getErrorMessage(error));
      } finally {
        setCreatingPlanRecordId(null);
      }
    },
    [currentActor, router],
  );

  const candidatesSummary = useMemo(() => {
    const total = candidates.length;

    const classesCount = new Set(
      candidates.map((item) => getRecordClassKey(item.record)).filter(Boolean),
    ).size;

    const studentsCount = new Set(candidates.map((item) => item.student.id))
      .size;

    const subjectsCount = new Set(
      candidates.map((item) => item.record.subjectKey).filter(Boolean),
    ).size;

    const assessmentCount = candidates.filter((item) => {
      return item.record.sourceType === "ASSESSMENT_RECORD";
    }).length;

    const trackerCount = candidates.filter((item) => {
      return item.record.sourceType === "TRACKER_ENTRY";
    }).length;

    return {
      total,
      classesCount,
      studentsCount,
      subjectsCount,
      assessmentCount,
      trackerCount,
    };
  }, [candidates]);

  const plansSummary = useMemo(() => {
    const total = openPlans.length;

    const studentsCount = new Set(openPlans.map((item) => item.student.id))
      .size;

    const needsFirstCheck = openPlans.filter(
      (item) => typeof item.plan.firstCheckScore !== "number",
    ).length;

    const needsSecondCheck = openPlans.filter(
      (item) =>
        typeof item.plan.firstCheckScore === "number" &&
        typeof item.plan.secondCheckScore !== "number",
    ).length;

    const subjectsCount = new Set(
      openPlans.map((item) => item.plan.subjectKey).filter(Boolean),
    ).size;

    const trackerPlans = openPlans.filter((item) => {
      return item.plan.sourceType === "TRACKER_ENTRY";
    }).length;

    return {
      total,
      studentsCount,
      needsFirstCheck,
      needsSecondCheck,
      subjectsCount,
      trackerPlans,
    };
  }, [openPlans]);

  const isLoading = candidatesStatus === "loading" || plansStatus === "loading";

  if (!currentActor) {
    return (
      <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 p-4 md:p-6">
        <section className="rounded-2xl border bg-card p-6 text-card-foreground shadow-sm">
          <p className="text-sm text-muted-foreground">
            جاري تحميل بيانات المستخدم...
          </p>
        </section>
      </main>
    );
  }

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 p-4 md:p-6">
      <section className="rounded-2xl border bg-card p-5 text-card-foreground shadow-sm md:p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="space-y-2">
            <p className="text-sm font-medium text-muted-foreground">
              10.5M-3 — الفاقد من القياسات والمتابعات
            </p>

            <h1 className="text-2xl font-bold tracking-tight">
              إدارة الفاقد التعليمي
            </h1>

            <p className="max-w-3xl text-sm leading-7 text-muted-foreground">
              تعرض هذه الصفحة الطلاب المرشحين لفتح خطة فاقد من القياسات الرسمية
              أو من متابعات الروضة، وكذلك خطط الفاقد المفتوحة مع سياق المادة
              ودفعة الإدخال المصدر.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() =>
                router.push(buildManualLearningLossHref(contextFilter))
              }
              disabled={isLoading || creatingPlanRecordId !== null}
              className="inline-flex h-10 items-center justify-center rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              فتح فاقد يدوي
            </button>

            <button
              type="button"
              onClick={() => void loadAll()}
              disabled={isLoading || creatingPlanRecordId !== null}
              className="inline-flex h-10 items-center justify-center rounded-xl border px-4 text-sm font-medium transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isLoading ? "جاري التحديث..." : "تحديث القائمة"}
            </button>
          </div>
        </div>
      </section>

      {hasContextFilter(contextFilter) ? (
        <section className="rounded-2xl border border-violet-500/30 bg-violet-500/10 p-5 text-sm leading-7 text-violet-800 dark:text-violet-200">
          <div className="font-semibold">فلترة حسب سياق محدد</div>

          <div className="mt-3 grid gap-3 md:grid-cols-5">
            <ContextItem label="الفصل" value={contextFilter.classId || "—"} />
            <ContextItem
              label="المدرسة"
              value={contextFilter.schoolId || "—"}
            />
            <ContextItem
              label="السنة"
              value={contextFilter.academicYearId || "—"}
            />
            <ContextItem
              label="المادة"
              value={contextFilter.subjectKey || "—"}
            />
            <ContextItem
              label="ClassSubjectOffering"
              value={contextFilter.classSubjectOfferingId || "—"}
            />
          </div>
        </section>
      ) : null}

      <section className="grid gap-4 md:grid-cols-4">
        <div className="rounded-2xl border bg-card p-5 shadow-sm">
          <p className="text-sm text-muted-foreground">مرشحون لفتح خطة</p>
          <p className="mt-2 text-3xl font-bold">
            {candidatesSummary.total.toLocaleString("ar-SA")}
          </p>
        </div>

        <div className="rounded-2xl border bg-card p-5 shadow-sm">
          <p className="text-sm text-muted-foreground">خطط مفتوحة</p>
          <p className="mt-2 text-3xl font-bold">
            {plansSummary.total.toLocaleString("ar-SA")}
          </p>
        </div>

        <div className="rounded-2xl border bg-card p-5 shadow-sm">
          <p className="text-sm text-muted-foreground">تحتاج القياس الأول</p>
          <p className="mt-2 text-3xl font-bold">
            {plansSummary.needsFirstCheck.toLocaleString("ar-SA")}
          </p>
        </div>

        <div className="rounded-2xl border bg-card p-5 shadow-sm">
          <p className="text-sm text-muted-foreground">تحتاج القياس الثاني</p>
          <p className="mt-2 text-3xl font-bold">
            {plansSummary.needsSecondCheck.toLocaleString("ar-SA")}
          </p>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-6">
        <MiniStat label="من قياسات" value={candidatesSummary.assessmentCount} />
        <MiniStat label="من متابعات" value={candidatesSummary.trackerCount} />
        <MiniStat label="طلاب مرشحون" value={candidatesSummary.studentsCount} />
        <MiniStat
          label="فصول بها فاقد"
          value={candidatesSummary.classesCount}
        />
        <MiniStat
          label="مواد في المرشحين"
          value={candidatesSummary.subjectsCount}
        />
        <MiniStat label="خطط من متابعات" value={plansSummary.trackerPlans} />
      </section>

      {successMessage ? (
        <section className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-5 text-sm text-emerald-700 dark:text-emerald-300">
          {successMessage}
        </section>
      ) : null}

      {error ? (
        <section className="rounded-2xl border border-destructive/30 bg-destructive/5 p-5 text-sm text-destructive">
          {error}
        </section>
      ) : null}

      <section className="overflow-hidden rounded-2xl border bg-card shadow-sm">
        <div className="border-b p-5">
          <h2 className="text-lg font-semibold">خطط الفاقد المفتوحة</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            الخطط النشطة أو قيد المتابعة، سواء فُتحت تلقائيًا من قياس أو متابعة،
            أو فُتحت يدويًا.
          </p>
        </div>

        {plansStatus === "loading" ? (
          <div className="p-6 text-sm text-muted-foreground">
            جاري تحميل الخطط المفتوحة...
          </div>
        ) : openPlans.length === 0 ? (
          <div className="p-6 text-sm text-muted-foreground">
            لا توجد خطط فاقد مفتوحة ضمن السياق الحالي.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1240px] text-right text-sm">
              <thead className="bg-muted/50 text-muted-foreground">
                <tr>
                  <th className="whitespace-nowrap px-4 py-3 font-medium">
                    الطالب
                  </th>
                  <th className="whitespace-nowrap px-4 py-3 font-medium">
                    الفصل
                  </th>
                  <th className="whitespace-nowrap px-4 py-3 font-medium">
                    المدرسة
                  </th>
                  <th className="whitespace-nowrap px-4 py-3 font-medium">
                    المادة
                  </th>
                  <th className="whitespace-nowrap px-4 py-3 font-medium">
                    Offering
                  </th>
                  <th className="whitespace-nowrap px-4 py-3 font-medium">
                    المصدر
                  </th>
                  <th className="whitespace-nowrap px-4 py-3 font-medium">
                    Batch
                  </th>
                  <th className="whitespace-nowrap px-4 py-3 font-medium">
                    الحالة
                  </th>
                  <th className="whitespace-nowrap px-4 py-3 font-medium">
                    مؤشر التحسن
                  </th>
                  <th className="whitespace-nowrap px-4 py-3 font-medium">
                    المتابعة
                  </th>
                  <th className="whitespace-nowrap px-4 py-3 font-medium">
                    الإجراء
                  </th>
                </tr>
              </thead>

              <tbody>
                {openPlans.map((item) => {
                  const plan = item.plan;
                  const needsFirstCheck =
                    typeof plan.firstCheckScore !== "number";
                  const needsSecondCheck =
                    typeof plan.firstCheckScore === "number" &&
                    typeof plan.secondCheckScore !== "number";

                  return (
                    <tr key={plan.id} className="border-t">
                      <td className="whitespace-nowrap px-4 py-3 font-medium">
                        {item.student.displayName}
                      </td>

                      <td className="whitespace-nowrap px-4 py-3">
                        {getClassLabel(item.classInfo, plan.classId)}
                      </td>

                      <td className="whitespace-nowrap px-4 py-3">
                        {getSchoolLabel(item.classInfo, plan.schoolId)}
                      </td>

                      <td className="whitespace-nowrap px-4 py-3">
                        {plan.subjectKey || "—"}
                      </td>

                      <td className="whitespace-nowrap px-4 py-3 font-mono text-xs">
                        {plan.classSubjectOfferingId || "—"}
                      </td>

                      <td className="whitespace-nowrap px-4 py-3">
                        {getSourceLabel(plan.sourceType)}
                      </td>

                      <td className="whitespace-nowrap px-4 py-3 font-mono text-xs">
                        {plan.sourceBatchId || "—"}
                      </td>

                      <td className="whitespace-nowrap px-4 py-3">
                        {getStatusLabel(plan.status)}
                      </td>

                      <td className="whitespace-nowrap px-4 py-3">
                        {getIndicatorLabel(plan.improvementIndicator)}
                      </td>

                      <td className="whitespace-nowrap px-4 py-3">
                        {needsFirstCheck
                          ? "تحتاج القياس الأول"
                          : needsSecondCheck
                            ? "تحتاج القياس الثاني"
                            : "القياسان مسجلان"}
                      </td>

                      <td className="whitespace-nowrap px-4 py-3">
                        <button
                          type="button"
                          onClick={() =>
                            router.push(`/staff/learning-loss/plans/${plan.id}`)
                          }
                          className="inline-flex h-9 items-center justify-center rounded-xl border px-3 text-xs font-medium transition hover:bg-muted"
                        >
                          فتح الخطة
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="overflow-x-auto rounded-2xl border bg-card shadow-sm">
        <div className="border-b p-5">
          <h2 className="text-lg font-semibold">الطلاب المرشحون لخطة فاقد</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            يظهر هنا أي سجل قياس أو متابعة يحمل: يحتاج فاقدًا + لا توجد خطة فاقد
            مرتبطة به.
          </p>
        </div>

        {candidatesStatus === "loading" ? (
          <div className="p-6 text-sm text-muted-foreground">
            جاري تحميل المرشحين...
          </div>
        ) : candidates.length === 0 ? (
          <div className="p-6 text-sm text-muted-foreground">
            لا توجد سجلات تحتاج فتح خطة فاقد ضمن السياق الحالي.
          </div>
        ) : (
          <div className=" bg-red-50 w-full overflow-x-auto">
            <table className="w-full min-w-[1920px] text-right text-sm">
              <thead className="bg-muted/50 text-muted-foreground">
                <tr>
                  <th className="whitespace-nowrap px-4 py-3 font-medium">
                    الطالب
                  </th>
                  <th className="whitespace-nowrap px-4 py-3 font-medium">
                    الفصل
                  </th>
                  <th className="whitespace-nowrap px-4 py-3 font-medium">
                    المدرسة
                  </th>
                  <th className="whitespace-nowrap px-4 py-3 font-medium">
                    المصدر
                  </th>
                  <th className="whitespace-nowrap px-4 py-3 font-medium">
                    المادة
                  </th>
                  <th className="whitespace-nowrap px-4 py-3 font-medium">
                    Offering
                  </th>
                  <th className="whitespace-nowrap px-4 py-3 font-medium">
                    Batch
                  </th>
                  <th className="whitespace-nowrap px-4 py-3 font-medium">
                    القالب / العنوان
                  </th>
                  <th className="whitespace-nowrap px-4 py-3 font-medium">
                    الدرجة
                  </th>
                  <th className="whitespace-nowrap px-4 py-3 font-medium">
                    النسبة
                  </th>
                  <th className="whitespace-nowrap px-4 py-3 font-medium">
                    تاريخ المصدر
                  </th>
                  <th className="whitespace-nowrap px-4 py-3 font-medium">
                    سبب الفاقد
                  </th>
                  <th className="whitespace-nowrap px-4 py-3 font-medium">
                    الإجراء
                  </th>
                </tr>
              </thead>

              <tbody>
                {candidates.map((item) => {
                  const record = item.record;
                  const isCreating = creatingPlanRecordId === record.id;

                  return (
                    <tr
                      key={`${record.sourceType}:${record.id}`}
                      className="border-t"
                    >
                      <td className="whitespace-nowrap px-4 py-3 font-medium">
                        {item.student.displayName}
                      </td>

                      <td className="whitespace-nowrap px-4 py-3">
                        {getClassLabel(item.classInfo, record.classId)}
                      </td>

                      <td className="whitespace-nowrap px-4 py-3">
                        {getSchoolLabel(item.classInfo, record.schoolId)}
                      </td>

                      <td className="whitespace-nowrap px-4 py-3">
                        {getCandidateSourceLabel(record)}
                      </td>

                      <td className="whitespace-nowrap px-4 py-3">
                        {record.subjectKey || "—"}
                      </td>

                      <td className="whitespace-nowrap px-4 py-3 font-mono text-xs">
                        {record.classSubjectOfferingId || "—"}
                      </td>

                      <td className="whitespace-nowrap px-4 py-3 font-mono text-xs">
                        {record.batchId || "—"}
                      </td>

                      <td className="whitespace-nowrap px-4 py-3">
                        <div className="space-y-1">
                          <p>{getCandidateTitle(record)}</p>
                          <p className="text-xs text-muted-foreground">
                            {record.templateId}
                          </p>
                        </div>
                      </td>

                      <td className="whitespace-nowrap px-4 py-3">
                        {formatScore(record)}
                      </td>

                      <td className="whitespace-nowrap px-4 py-3">
                        {formatPercentage(record)}
                      </td>

                      <td className="whitespace-nowrap px-4 py-3">
                        {formatDate(getCandidateDate(record))}
                      </td>

                      <td className="min-w-[240px] px-4 py-3 text-muted-foreground">
                        {record.learningLossTriggerReason ||
                          "الدرجة أو النسبة أقل من حد الفاقد المحدد في القالب"}
                      </td>

                      <td className="whitespace-nowrap px-4 py-3">
                        <button
                          type="button"
                          onClick={() => void createLearningLossPlan(item)}
                          disabled={creatingPlanRecordId !== null}
                          className="inline-flex h-9 items-center justify-center rounded-xl bg-primary px-3 text-xs font-medium text-primary-foreground transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {isCreating ? "جاري الفتح..." : "فتح خطة فاقد"}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}

function MiniStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border bg-card p-5 shadow-sm">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-2 text-3xl font-bold">{value.toLocaleString("ar-SA")}</p>
    </div>
  );
}

function ContextItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-white/70 p-3 dark:bg-slate-950/40">
      <p className="text-xs text-violet-700 dark:text-violet-300">{label}</p>
      <p className="mt-1 break-words font-mono text-sm font-semibold">
        {value}
      </p>
    </div>
  );
}
