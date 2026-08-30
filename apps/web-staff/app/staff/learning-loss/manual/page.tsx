"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  where,
} from "firebase/firestore";

import { db } from "@/lib/firebase";
import { getVisibleStudents } from "@/lib/visible-students";
import { useStaffActor } from "@/components/staff/staff-actor-provider";
import {
  getFriendlyClassTitle,
  isTechnicalIdentifier,
  normalizeText,
} from "@/lib/class-presentation";

type VisibleClass = {
  id: string;
  title?: string;
  code?: string;
  schoolId?: string;
  schoolName?: string;
  academicYearId?: string;
  gradeId?: string;
  gradeTitle?: string;
  streamId?: string;
  sectionLabel?: string;
};

type VisibleOffering = {
  id: string;
  classId?: string;
  displayName?: string;
  shortLabel?: string;
  subjectTitleSnapshot?: string;
  subjectKey?: string;
  subjectId?: string;
  status?: string;
  isArchived?: boolean;
};

type StaffLearningLossActor = {
  uid?: string;
  orgId: string;
  personId?: string;
  roles?: string[];
  roleKeys?: string[];
  visibleClasses?: VisibleClass[];
  classSubjectOfferings?: VisibleOffering[];
  currentTermsByAcademicYear: Record<
  string,
  {
    id: string;
    title: string;
    shortTitle: string;
  }
>;
};

type StudentOption = {
  id: string;
  personId?: string;
  displayName: string;
  enrollmentId?: string;
  schoolId?: string;
  academicYearId?: string;
  gradeId?: string;
  classId?: string;
};

type LoadingState = "idle" | "loading" | "success" | "error";

type LearningLossContextFilter = {
  classId: string;
  schoolId: string;
  academicYearId: string;
  subjectKey: string;
  classSubjectOfferingId: string;
};

type ManualForm = {
  classKey: string;
  studentId: string;
  subjectKey: string;
  classSubjectOfferingId: string;
  title: string;
  reason: string;
  skillTitle: string;
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  baselineScore: string;
  baselineMaxScore: string;
};

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "حدث خطأ غير متوقع";
}

function nowMs() {
  return Date.now();
}

function parseOptionalNumber(value: string) {
  if (value.trim() === "") return undefined;

  const numberValue = Number(value);

  if (!Number.isFinite(numberValue)) return undefined;

  return numberValue;
}

function resolveActorPersonId(actor: StaffLearningLossActor) {
  return actor.personId || actor.uid || "unknown";
}

function resolveActorRoleKey(actor: StaffLearningLossActor) {
  return actor.roles?.[0] || actor.roleKeys?.[0] || undefined;
}

function getVisibleClassKey(item: VisibleClass) {
  return [
    item.schoolId || "NO_SCHOOL",
    item.academicYearId || "NO_YEAR",
    item.id,
  ].join(":");
}

function getClassLabel(classInfo: VisibleClass, classes: VisibleClass[]) {
  return getFriendlyClassTitle(classInfo, classes) || "الفصل الحالي";
}

function getSchoolLabel(classInfo?: VisibleClass) {
  if (!classInfo) return "مدرسة أخرى";
  return classInfo.schoolName || "مدرسة أخرى";
}

function getSubjectLabel(
  subjectKey: string | undefined,
  offeringId: string | undefined,
  offerings: VisibleOffering[],
) {
  const offering = offerings.find(
    (item) =>
      (offeringId && item.id === offeringId) ||
      (subjectKey && item.subjectKey === subjectKey),
  );

  return (
    [offering?.displayName, offering?.shortLabel, offering?.subjectTitleSnapshot]
      .map((value) => normalizeText(value))
      .find(
        (value) =>
          Boolean(value) &&
          !isTechnicalIdentifier(value) &&
          ![
            subjectKey,
            offeringId,
            offering?.id,
            offering?.subjectId,
            offering?.subjectKey,
          ]
            .filter(Boolean)
            .some(
              (identifier) =>
                value.toLowerCase() === identifier!.toLowerCase(),
            ),
      ) || null
  );
}

function getSeverityLabel(value: ManualForm["severity"]) {
  switch (value) {
    case "LOW":
      return "منخفض";
    case "MEDIUM":
      return "متوسط";
    case "HIGH":
      return "مرتفع";
    case "CRITICAL":
      return "حرج";
  }
}

function dedupeVisibleClasses(classes: VisibleClass[]) {
  const byKey = new Map<string, VisibleClass>();

  for (const item of classes) {
    const key = getVisibleClassKey(item);

    if (!byKey.has(key)) {
      byKey.set(key, item);
    }
  }

  return Array.from(byKey.values()).sort((a, b) => {
    const aSchool = a.schoolName || a.schoolId || "";
    const bSchool = b.schoolName || b.schoolId || "";

    const schoolCompare = aSchool.localeCompare(bSchool, "ar");
    if (schoolCompare !== 0) return schoolCompare;

    const aTitle = getClassLabel(a, classes);
    const bTitle = getClassLabel(b, classes);

    return aTitle.localeCompare(bTitle, "ar");
  });
}

function enrollmentMatchesClass(
  enrollment: {
    schoolId?: string;
    academicYearId?: string;
    classId?: string;
  },
  classInfo: VisibleClass,
) {
  if (enrollment.classId !== classInfo.id) return false;

  if (
    classInfo.schoolId &&
    enrollment.schoolId &&
    enrollment.schoolId !== classInfo.schoolId
  ) {
    return false;
  }

  if (
    classInfo.academicYearId &&
    enrollment.academicYearId &&
    enrollment.academicYearId !== classInfo.academicYearId
  ) {
    return false;
  }

  return true;
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

function classMatchesContext(
  classInfo: VisibleClass,
  context: LearningLossContextFilter,
) {
  if (context.classId && classInfo.id !== context.classId) return false;

  if (context.schoolId && classInfo.schoolId !== context.schoolId) {
    return false;
  }

  if (
    context.academicYearId &&
    classInfo.academicYearId !== context.academicYearId
  ) {
    return false;
  }

  return true;
}

function buildLearningLossHref(context: LearningLossContextFilter) {
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

  return `/staff/learning-loss${queryString ? `?${queryString}` : ""}`;
}

function buildPlanText(params: {
  reason: string;
  subjectKey: string;
  classSubjectOfferingId: string;
  baselineScore?: number;
  baselineMaxScore?: number;
}) {
  const lines = [
    "خطة فاقد تعليمية تم فتحها يدويًا من بوابة الموظفين.",
    `سبب فتح الخطة: ${params.reason}`,
  ];

  if (params.subjectKey) {
    lines.push(`المادة: ${params.subjectKey}.`);
  }

  if (params.classSubjectOfferingId) {
    lines.push(`سياق المادة: ${params.classSubjectOfferingId}.`);
  }

  if (
    typeof params.baselineScore === "number" &&
    typeof params.baselineMaxScore === "number"
  ) {
    lines.push(
      `القياس الأساسي المدخل يدويًا: ${params.baselineScore} / ${params.baselineMaxScore}.`,
    );
  }

  lines.push(
    "يتم استكمال تفاصيل المعالجة وتسجيل القياس الأول والثاني داخل صفحة خطة الفاقد.",
  );

  return lines.join("\n");
}

async function loadStudentName(
  orgId: string,
  studentId: string,
): Promise<Pick<StudentOption, "id" | "personId" | "displayName">> {
  const roster = await getVisibleStudents({ orgId });
  const displayName = roster.rows.find(
    (row) => row.studentId === studentId,
  )?.displayName;

  return { id: studentId, displayName: displayName || studentId };
}

async function loadStudentsByClass(params: {
  orgId: string;
  classInfo: VisibleClass;
}): Promise<StudentOption[]> {
  const possibleEnrollmentCollections = ["studentEnrollments", "enrollments"];
  const byStudentId = new Map<string, StudentOption>();

  for (const collectionName of possibleEnrollmentCollections) {
    try {
      const enrollmentsRef = collection(
        db,
        "orgs",
        params.orgId,
        collectionName,
      );

      const enrollmentsQuery = query(
        enrollmentsRef,
        where("classId", "==", params.classInfo.id),
      );

      const enrollmentsSnap = await getDocs(enrollmentsQuery);

      for (const item of enrollmentsSnap.docs) {
        const data = item.data() as {
          studentId?: string;
          schoolId?: string;
          academicYearId?: string;
          gradeId?: string;
          classId?: string;
          status?: string;
        };

        if (!data.studentId) continue;
        if (!enrollmentMatchesClass(data, params.classInfo)) continue;

        if (
          data.status &&
          !["ACTIVE", "PENDING"].includes(String(data.status))
        ) {
          continue;
        }

        if (byStudentId.has(data.studentId)) continue;

        const student = await loadStudentName(params.orgId, data.studentId);

        byStudentId.set(data.studentId, {
          ...student,
          enrollmentId: item.id,
          schoolId: data.schoolId || params.classInfo.schoolId || "",
          academicYearId:
            data.academicYearId || params.classInfo.academicYearId || "",
          gradeId: data.gradeId || params.classInfo.gradeId || "",
          classId: data.classId || params.classInfo.id,
        });
      }
    } catch {
      // تجاهل هذا المسار وجرب المسار التالي
    }
  }

  const students = Array.from(byStudentId.values());

  students.sort((a, b) => a.displayName.localeCompare(b.displayName, "ar"));

  return students;
}

function buildTermContext(
  term?: {
    id?: string;
    title?: string;
    shortTitle?: string;
  } | null,
) {
  return {
    termId: term?.id ?? "",
    termTitle: term?.title ?? "",
    termShortTitle: term?.shortTitle ?? "",
  };
}

export default function ManualLearningLossPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { actor } = useStaffActor();

  const currentActor = actor as StaffLearningLossActor | null;

  const contextFilter = useMemo(() => {
    return getContextFilter(searchParams);
  }, [searchParams]);

  const [studentsStatus, setStudentsStatus] = useState<LoadingState>("idle");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [students, setStudents] = useState<StudentOption[]>([]);

  const [form, setForm] = useState<ManualForm>({
    classKey: "",
    studentId: "",
    subjectKey: "",
    classSubjectOfferingId: "",
    title: "",
    reason: "",
    skillTitle: "",
    severity: "MEDIUM",
    baselineScore: "",
    baselineMaxScore: "",
  });

  const visibleClasses = useMemo(() => {
    return dedupeVisibleClasses(currentActor?.visibleClasses ?? []);
  }, [currentActor]);

  const visibleOfferings = useMemo(() => {
    return currentActor?.classSubjectOfferings ?? [];
  }, [currentActor]);

  const hasMultipleSchools = useMemo(() => {
    return (
      new Set(
        visibleClasses
          .map((item) => item.schoolId)
          .filter((value): value is string => Boolean(value)),
      ).size > 1
    );
  }, [visibleClasses]);

  const hasSubjectContext = Boolean(
    contextFilter.subjectKey || contextFilter.classSubjectOfferingId,
  );

  const contextOffering = useMemo(
    () =>
      visibleOfferings.find(
        (item) => item.id === contextFilter.classSubjectOfferingId,
      ),
    [contextFilter.classSubjectOfferingId, visibleOfferings],
  );

  const contextSubjectKey =
    contextFilter.subjectKey || contextOffering?.subjectKey || "";

  const visibleClassMap = useMemo(() => {
    return new Map(
      visibleClasses.map((item) => [getVisibleClassKey(item), item]),
    );
  }, [visibleClasses]);

  const classKeyFromContext = useMemo(() => {
    if (!hasContextFilter(contextFilter)) return "";

    const match = visibleClasses.find((item) =>
      classMatchesContext(item, contextFilter),
    );

    return match ? getVisibleClassKey(match) : "";
  }, [contextFilter, visibleClasses]);

  const selectedClass = useMemo(() => {
    if (!form.classKey) return null;
    return visibleClassMap.get(form.classKey) ?? null;
  }, [form.classKey, visibleClassMap]);

  const subjectOptions = useMemo(() => {
    if (!selectedClass) return [];

    const byKey = new Map<string, VisibleOffering>();

    for (const offering of visibleOfferings) {
      if (offering.classId !== selectedClass.id) continue;
      if (
        offering.isArchived ||
        (offering.status && offering.status !== "ACTIVE")
      ) {
        continue;
      }

      const label = getSubjectLabel(
        offering.subjectKey,
        offering.id,
        [offering],
      );

      if (!label || !offering.subjectKey) continue;

      const key = offering.subjectKey + ":" + offering.id;
      byKey.set(key, offering);
    }

    return Array.from(byKey.values()).sort((a, b) => {
      const aLabel =
        getSubjectLabel(a.subjectKey, a.id, [a]) || "مادة غير محددة";
      const bLabel =
        getSubjectLabel(b.subjectKey, b.id, [b]) || "مادة غير محددة";

      return aLabel.localeCompare(bLabel, "ar");
    });
  }, [selectedClass, visibleOfferings]);

  const selectedStudent = useMemo(() => {
    return students.find((item) => item.id === form.studentId) ?? null;
  }, [form.studentId, students]);

  const selectedSubjectLabel = useMemo(
    () =>
      getSubjectLabel(
        form.subjectKey || contextSubjectKey,
        form.classSubjectOfferingId || contextFilter.classSubjectOfferingId,
        visibleOfferings,
      ),
    [
      contextFilter.classSubjectOfferingId,
      contextSubjectKey,
      form.classSubjectOfferingId,
      form.subjectKey,
      visibleOfferings,
    ],
  );

  const contextSummary = useMemo(() => {
    const contextClass = classKeyFromContext
      ? visibleClassMap.get(classKeyFromContext) || null
      : null;
    const labels = [
      contextClass ? getClassLabel(contextClass, visibleClasses) : null,
      selectedSubjectLabel,
    ].filter((value): value is string => Boolean(value));

    return labels.join(" · ");
  }, [
    classKeyFromContext,
    selectedSubjectLabel,
    visibleClasses,
    visibleClassMap,
  ]);

  useEffect(() => {
    if (!classKeyFromContext && !contextSubjectKey) return;

    setForm((current) => ({
      ...current,
      classKey: current.classKey || classKeyFromContext,
      subjectKey: current.subjectKey || contextSubjectKey,
      classSubjectOfferingId:
        current.classSubjectOfferingId ||
        contextFilter.classSubjectOfferingId ||
        "",
    }));
  }, [
    classKeyFromContext,
    contextFilter.classSubjectOfferingId,
    contextSubjectKey,
  ]);

  const loadStudents = useCallback(async () => {
    if (!currentActor?.orgId || !selectedClass) {
      setStudents([]);
      setStudentsStatus("idle");
      return;
    }

    setStudentsStatus("loading");
    setError(null);

    try {
      const loadedStudents = await loadStudentsByClass({
        orgId: currentActor.orgId,
        classInfo: selectedClass,
      });

      setStudents(loadedStudents);
      setStudentsStatus("success");
    } catch (error: unknown) {
      setStudents([]);
      setError(getErrorMessage(error));
      setStudentsStatus("error");
    }
  }, [currentActor?.orgId, selectedClass]);

  useEffect(() => {
    setForm((current) => ({
      ...current,
      studentId: "",
    }));

    void loadStudents();
  }, [loadStudents]);

  const createManualPlan = useCallback(async () => {
    if (!currentActor?.orgId) return;

    if (!form.classKey) {
      setError("اختر الفصل أولًا.");
      return;
    }

    if (!selectedClass) {
      setError("الفصل المحدد غير موجود ضمن فصولك الحالية.");
      return;
    }

    if (!form.studentId || !selectedStudent) {
      setError("اختر الطالب.");
      return;
    }

    if (!form.reason.trim()) {
      setError("اكتب سبب فتح خطة الفاقد.");
      return;
    }

    const baselineScore = parseOptionalNumber(form.baselineScore);
    const baselineMaxScore = parseOptionalNumber(form.baselineMaxScore);

    if (
      typeof baselineScore === "number" &&
      typeof baselineMaxScore !== "number"
    ) {
      setError("إذا أدخلت الدرجة الأساسية، أدخل الدرجة الكبرى أيضًا.");
      return;
    }

    if (
      typeof baselineMaxScore === "number" &&
      typeof baselineScore !== "number"
    ) {
      setError("إذا أدخلت الدرجة الكبرى، أدخل الدرجة الأساسية أيضًا.");
      return;
    }

    if (
      typeof baselineScore === "number" &&
      typeof baselineMaxScore === "number"
    ) {
      if (baselineMaxScore <= 0) {
        setError("الدرجة الكبرى يجب أن تكون أكبر من صفر.");
        return;
      }

      if (baselineScore < 0) {
        setError("الدرجة الأساسية لا يمكن أن تكون أقل من صفر.");
        return;
      }

      if (baselineScore > baselineMaxScore) {
        setError("الدرجة الأساسية لا يمكن أن تكون أكبر من الدرجة الكبرى.");
        return;
      }
    }

    setSaving(true);
    setError(null);

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

      const resolvedSubjectKey =
        form.subjectKey.trim() || contextFilter.subjectKey || "";

      const resolvedClassSubjectOfferingId =
        form.classSubjectOfferingId || contextFilter.classSubjectOfferingId || "";

      const planTitle =
        form.title.trim() ||
        `خطة فاقد يدوية - ${selectedStudent.displayName}${
          resolvedSubjectKey ? ` - ${resolvedSubjectKey}` : ""
        }`;

      const skillTitle =
        form.skillTitle.trim() || resolvedSubjectKey || "مهارة تحتاج معالجة";

      const resolvedAcademicYearId =
        selectedStudent.academicYearId || selectedClass.academicYearId || "";

      const currentTerm =
        currentActor.currentTermsByAcademicYear[resolvedAcademicYearId];

      const termContext = buildTermContext(currentTerm);
      ///////////////// بناء كائن بيانات خطة الفاقد اليدوية
      const planData = {
        id: planRef.id,

        orgId: currentActor.orgId,
        schoolId: selectedStudent.schoolId || selectedClass.schoolId || "",
        academicYearId: resolvedAcademicYearId,
        ...termContext,

        studentId: selectedStudent.id,
        enrollmentId: selectedStudent.enrollmentId || "",
        gradeId: selectedStudent.gradeId || selectedClass.gradeId || "",
        classId: selectedClass.id,
        classSubjectOfferingId: resolvedClassSubjectOfferingId,

        sourceType: "MANUAL",
        sourceAssessmentRecordId: "",
        sourceTrackerEntryId: "",
        sourceTemplateId: "",
        sourceKind: "MANUAL",
        sourceTitle: "فتح يدوي",
        sourceBatchId: "",

        subjectKey: resolvedSubjectKey,

        lostSkills: [
          {
            id: "skill-1",
            title: skillTitle,
            description: form.reason.trim(),
            domain: resolvedSubjectKey,
            severity: form.severity,
          },
        ],

        planTitle,
        planText: buildPlanText({
          reason: form.reason.trim(),
          subjectKey: resolvedSubjectKey,
          classSubjectOfferingId: resolvedClassSubjectOfferingId,
          baselineScore,
          baselineMaxScore,
        }),

        remediationActions: [
          {
            id: "action-1",
            title: "تنفيذ معالجة تعليمية مناسبة",
            description:
              "تحديد نشاط علاجي مناسب ثم تسجيل القياس الأول والثاني داخل خطة الفاقد.",
            status: "PLANNED",
            note: "",
          },
        ],

        planStartAt: createdAt,

        ownerPersonId: actorPersonId,
        ...(actorRoleKey ? { ownerRoleKey: actorRoleKey } : {}),

        ...(typeof baselineScore === "number" &&
        typeof baselineMaxScore === "number"
          ? {
              baselineScore,
              baselineMaxScore,
              baselineMeasuredAt: createdAt,
            }
          : {}),

        improvementIndicator: "UNKNOWN",
        status: "ACTIVE",

        createdByPersonId: actorPersonId,
        ...(actorRoleKey ? { createdByRoleKey: actorRoleKey } : {}),

        tags: ["MANUAL"],
        note: form.reason.trim(),

        createdAt,
        updatedAt: createdAt,
      };

      await setDoc(planRef, planData);

      router.push(`/staff/learning-loss/plans/${planRef.id}`);
    } catch (error: unknown) {
      setError(getErrorMessage(error));
    } finally {
      setSaving(false);
    }
  }, [
    contextFilter,
    currentActor,
    form,
    router,
    selectedClass,
    selectedStudent,
  ]);

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
            <h1 className="text-2xl font-bold tracking-tight">
              فتح خطة فاقد يدويًا
            </h1>
          </div>

          <button
            type="button"
            onClick={() => router.push(buildLearningLossHref(contextFilter))}
            className="inline-flex h-10 items-center justify-center rounded-xl border px-4 text-sm font-medium transition hover:bg-muted"
          >
            الرجوع للفاقد
          </button>
        </div>
      </section>

      {hasContextFilter(contextFilter) ? (
        <section className="rounded-2xl border bg-card px-4 py-3 text-sm text-muted-foreground shadow-sm">
          {contextSummary || "السياق المحدد"}
        </section>
      ) : null}

      {error ? (
        <section className="rounded-2xl border border-destructive/30 bg-destructive/5 p-5 text-sm text-destructive">
          {error}
        </section>
      ) : null}

      <section className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <section className="rounded-2xl border bg-card p-5 shadow-sm">
            <h2 className="text-lg font-semibold">بيانات الطالب</h2>

            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <label className="space-y-2">
                <span className="text-sm font-medium">الفصل</span>
                <select
                  value={form.classKey}
                  disabled={
                    saving ||
                    (hasSubjectContext && Boolean(classKeyFromContext))
                  }
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      classKey: event.target.value,
                      ...(hasSubjectContext
                        ? {}
                        : {
                            subjectKey: "",
                            classSubjectOfferingId: "",
                          }),
                    }))
                  }
                  className="h-10 w-full rounded-xl border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <option value="">اختر الفصل</option>

                  {visibleClasses.map((item) => {
                    const classKey = getVisibleClassKey(item);

                    return (
                      <option key={classKey} value={classKey}>
                        {getClassLabel(item, visibleClasses)}
                        {hasMultipleSchools
                          ? " — " + getSchoolLabel(item)
                          : ""}
                      </option>
                    );
                  })}
                </select>
              </label>

              <label className="space-y-2">
                <span className="text-sm font-medium">الطالب</span>
                <select
                  value={form.studentId}
                  disabled={
                    saving || !form.classKey || studentsStatus === "loading"
                  }
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      studentId: event.target.value,
                    }))
                  }
                  className="h-10 w-full rounded-xl border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <option value="">
                    {studentsStatus === "loading"
                      ? "جاري تحميل الطلاب..."
                      : "اختر الطالب"}
                  </option>

                  {students.map((item) => (
                    <option
                      key={`${item.schoolId || "NO_SCHOOL"}:${
                        item.academicYearId || "NO_YEAR"
                      }:${item.classId || "NO_CLASS"}:${item.id}`}
                      value={item.id}
                    >
                      {item.displayName}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {form.classKey && selectedClass ? (
              <p className="mt-3 text-sm text-muted-foreground">
                الفصل المحدد:{" "}
                <span className="font-medium text-foreground">
                  {getClassLabel(selectedClass, visibleClasses)}
                </span>
              </p>
            ) : null}

            {form.classKey &&
            studentsStatus === "success" &&
            students.length === 0 ? (
              <p className="mt-4 rounded-xl border bg-muted/40 p-4 text-sm text-muted-foreground">
                لا يوجد طلاب مسجلون في هذا الفصل حاليًا.
              </p>
            ) : null}
          </section>

          <section className="rounded-2xl border bg-card p-5 shadow-sm">
            <h2 className="text-lg font-semibold">سبب الفاقد والخطة</h2>

            <div className="mt-4 space-y-4">
              <label className="space-y-2">
                <span className="text-sm font-medium">عنوان الخطة</span>
                <input
                  type="text"
                  value={form.title}
                  disabled={saving}
                  placeholder="مثال: خطة فاقد في الحروف"
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      title: event.target.value,
                    }))
                  }
                  className="h-10 w-full rounded-xl border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
                />
              </label>

              <label className="space-y-2">
                <span className="text-sm font-medium">المجال / المادة</span>
                {hasSubjectContext ? (
                  <div className="flex h-10 items-center rounded-xl border bg-muted/30 px-3 text-sm">
                    {selectedSubjectLabel || "المادة المحددة"}
                  </div>
                ) : (
                  <select
                    value={form.classSubjectOfferingId}
                    disabled={saving || !selectedClass}
                    onChange={(event) => {
                      const offering = subjectOptions.find(
                        (item) => item.id === event.target.value,
                      );

                      setForm((current) => ({
                        ...current,
                        subjectKey: offering?.subjectKey || "",
                        classSubjectOfferingId: offering?.id || "",
                      }));
                    }}
                    className="h-10 w-full rounded-xl border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <option value="">
                      {!selectedClass
                        ? "اختر الفصل أولًا"
                        : subjectOptions.length > 0
                          ? "اختر المادة أو المجال"
                          : "لا توجد مواد متاحة لهذا الفصل"}
                    </option>
                    {subjectOptions.map((offering) => (
                      <option key={offering.id} value={offering.id}>
                        {getSubjectLabel(
                          offering.subjectKey,
                          offering.id,
                          [offering],
                        ) || "مادة غير محددة"}
                      </option>
                    ))}
                  </select>
                )}
              </label>

              <label className="space-y-2">
                <span className="text-sm font-medium">المهارة المفقودة</span>
                <input
                  type="text"
                  value={form.skillTitle}
                  disabled={saving}
                  placeholder="مثال: تمييز حرف أ، قراءة كلمات قصيرة"
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      skillTitle: event.target.value,
                    }))
                  }
                  className="h-10 w-full rounded-xl border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
                />
              </label>

              <label className="space-y-2">
                <span className="text-sm font-medium">شدة الفاقد</span>
                <select
                  value={form.severity}
                  disabled={saving}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      severity: event.target.value as ManualForm["severity"],
                    }))
                  }
                  className="h-10 w-full rounded-xl border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <option value="LOW">منخفض</option>
                  <option value="MEDIUM">متوسط</option>
                  <option value="HIGH">مرتفع</option>
                  <option value="CRITICAL">حرج</option>
                </select>
              </label>

              <label className="space-y-2">
                <span className="text-sm font-medium">سبب فتح الخطة</span>
                <textarea
                  value={form.reason}
                  disabled={saving}
                  rows={5}
                  placeholder="اكتب سبب فتح الخطة يدويًا..."
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      reason: event.target.value,
                    }))
                  }
                  className="w-full rounded-xl border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
                />
              </label>
            </div>
          </section>
        </div>

        <div className="space-y-6">
          <section className="rounded-2xl border bg-card p-5 shadow-sm">
            <h2 className="text-lg font-semibold">قياس أساسي اختياري</h2>

            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              يمكن تركه فارغًا، وتسجيل القياس الأول والثاني لاحقًا داخل صفحة
              الخطة.
            </p>

            <div className="mt-4 grid gap-3">
              <label className="space-y-2">
                <span className="text-sm font-medium">الدرجة الأساسية</span>
                <input
                  type="number"
                  min="0"
                  value={form.baselineScore}
                  disabled={saving}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      baselineScore: event.target.value,
                    }))
                  }
                  className="h-10 w-full rounded-xl border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
                />
              </label>

              <label className="space-y-2">
                <span className="text-sm font-medium">الدرجة الكبرى</span>
                <input
                  type="number"
                  min="1"
                  value={form.baselineMaxScore}
                  disabled={saving}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      baselineMaxScore: event.target.value,
                    }))
                  }
                  className="h-10 w-full rounded-xl border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
                />
              </label>
            </div>
          </section>

          <section className="rounded-2xl border bg-card p-5 shadow-sm">
            <h2 className="text-lg font-semibold">ملخص قبل الحفظ</h2>

            <div className="mt-4 space-y-3 text-sm">
              <SummaryRow
                label="الفصل"
                value={
                  selectedClass
                    ? getClassLabel(selectedClass, visibleClasses)
                    : "لم يحدد"
                }
              />
              <SummaryRow
                label="الطالب"
                value={selectedStudent?.displayName || "لم يحدد"}
              />
              <SummaryRow
                label="المادة / المجال"
                value={selectedSubjectLabel || "لم تحدد"}
              />
              <SummaryRow
                label="المهارة المفقودة"
                value={form.skillTitle || "غير محددة"}
              />
              <SummaryRow
                label="شدة الفاقد"
                value={getSeverityLabel(form.severity)}
              />
              {form.baselineScore.trim() && form.baselineMaxScore.trim() ? (
                <SummaryRow
                  label="القياس الأساسي"
                  value={form.baselineScore + " / " + form.baselineMaxScore}
                />
              ) : null}
            </div>

            <button
              type="button"
              onClick={() => void createManualPlan()}
              disabled={saving}
              className="mt-5 inline-flex h-10 w-full items-center justify-center rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? "جاري إنشاء الخطة..." : "إنشاء الخطة"}
            </button>
          </section>
        </div>
      </section>
    </main>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-xl border p-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="break-words text-left font-medium">{value}</span>
    </div>
  );
}
