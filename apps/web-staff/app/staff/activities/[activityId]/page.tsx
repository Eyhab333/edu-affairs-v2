"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  updateDoc,
  where,
  increment,
  runTransaction,
  setDoc,
} from "firebase/firestore";
import type {
  SchoolActivity,
  SchoolActivityKind,
  SchoolActivityStatus,
} from "@takween/contracts";
import { ArrowRight, CalendarDays, Send } from "lucide-react";

import { useStaffActor } from "@/components/staff/staff-actor-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { db } from "@/lib/firebase";

const STATUS_LABELS: Record<SchoolActivityStatus, string> = {
  DRAFT: "مسودة",
  PENDING_APPROVAL: "بانتظار الاعتماد",
  PUBLISHED: "منشور",
  REGISTRATION_OPEN: "التسجيل مفتوح",
  REGISTRATION_CLOSED: "التسجيل مغلق",
  IN_PROGRESS: "قيد التنفيذ",
  COMPLETED: "مكتمل",
  CANCELLED: "ملغي",
  ARCHIVED: "مؤرشف",
};

const KIND_LABELS: Record<SchoolActivityKind, string> = {
  COMPETITION: "مسابقة",
  EVENT: "فعالية",
  TRIP: "رحلة",
  CLUB: "نادي",
  WORKSHOP: "ورشة",
  CAMPAIGN: "حملة",
  SPORTS: "رياضي",
  CULTURAL: "ثقافي",
  VOLUNTEERING: "تطوعي",
  CEREMONY: "حفل",
  OTHER: "أخرى",
};

const REGISTRATION_STATUS_LABELS: Record<string, string> = {
  CONFIRMED: "مؤكد",
  WAITLISTED: "قائمة انتظار",
  REQUESTED: "طلب تسجيل",
  PENDING: "بانتظار المراجعة",
  CANCELLED: "ملغي",
  REJECTED: "مرفوض",
};

const ATTENDANCE_STATUS_LABELS: Record<string, string> = {
  PRESENT: "حاضر",
  ABSENT: "غائب",
};

type ActivityAttendanceRow = {
  id: string;
  orgId: string;
  activityId: string;
  registrationId: string;
  studentId: string;
  status: "PRESENT" | "ABSENT";
  markedAt?: number;
  markedByPersonId?: string;
  markedByRoleKey?: string;
};

const RESULT_TYPE_LABELS: Record<string, string> = {
  WINNER: "فائز",
  RANKED: "مركز",
  PARTICIPATION: "مشاركة",
  HONORABLE_MENTION: "تميز",
  NOTE: "ملاحظة",
};

type ActivityResultRow = {
  id: string;
  orgId: string;
  activityId: string;
  registrationId: string;
  studentId: string;
  resultType: string;
  rank?: number;
  title: string;
  note?: string;
  recordedAt?: number;
  recordedByPersonId?: string;
  recordedByRoleKey?: string;
  metadata?: {
    studentName?: string;
    activityTitle?: string;
    schoolId?: string;
    gradeId?: string;
    classId?: string;
  };
};

type ActivityRegistrationRow = {
  id: string;
  orgId: string;
  activityId: string;
  studentId: string;
  guardianId?: string;
  status: string;
  registeredAt?: number;
  guardianConsentAccepted?: boolean;
  metadata?: {
    activityTitle?: string;
    enrollmentId?: string;
    schoolId?: string;
    gradeId?: string;
    classId?: string;
    studentName?: string;
  };
  studentDisplayName?: string;
};

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "حدث خطأ غير متوقع";
}

function formatDate(value?: number) {
  if (!value) return "غير محدد";

  return new Intl.DateTimeFormat("ar-SA", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function readStudentDisplayName(data: Record<string, unknown> | undefined) {
  if (!data) return "";

  const keys = ["displayName", "fullName", "name", "studentName", "arabicName"];

  for (const key of keys) {
    const value = data[key];

    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return "";
}

function stripUndefined<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => stripUndefined(item)) as T;
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, itemValue]) => itemValue !== undefined)
        .map(([key, itemValue]) => [key, stripUndefined(itemValue)]),
    ) as T;
  }

  return value;
}

function isOrgWideRole(role: string) {
  return [
    "platform_owner",
    "platform_admin",
    "org_owner",
    "org_admin",
  ].includes(role);
}

function getActivityStatusActions(status: SchoolActivityStatus) {
  switch (status) {
    case "REGISTRATION_OPEN":
      return [
        {
          label: "إغلاق التسجيل",
          status: "REGISTRATION_CLOSED" as SchoolActivityStatus,
        },
        {
          label: "إلغاء النشاط",
          status: "CANCELLED" as SchoolActivityStatus,
          variant: "destructive" as const,
        },
      ];

    case "REGISTRATION_CLOSED":
      return [
        {
          label: "بدء النشاط",
          status: "IN_PROGRESS" as SchoolActivityStatus,
        },
        {
          label: "إلغاء النشاط",
          status: "CANCELLED" as SchoolActivityStatus,
          variant: "destructive" as const,
        },
      ];

    case "IN_PROGRESS":
      return [
        {
          label: "إنهاء النشاط",
          status: "COMPLETED" as SchoolActivityStatus,
        },
        {
          label: "إلغاء النشاط",
          status: "CANCELLED" as SchoolActivityStatus,
          variant: "destructive" as const,
        },
      ];

    case "COMPLETED":
    case "CANCELLED":
      return [
        {
          label: "أرشفة النشاط",
          status: "ARCHIVED" as SchoolActivityStatus,
        },
      ];

    default:
      return [];
  }
}

export default function StaffActivityDetailsPage() {
  const router = useRouter();
  const params = useParams<{ activityId: string }>();
  const activityId = params.activityId;

  const { actor } = useStaffActor();

  const [activity, setActivity] = useState<SchoolActivity | null>(null);

  const [registrations, setRegistrations] = useState<ActivityRegistrationRow[]>(
    [],
  );

  const [attendanceByStudentId, setAttendanceByStudentId] = useState<
    Record<string, ActivityAttendanceRow>
  >({});
  const [markingStudentId, setMarkingStudentId] = useState("");

  const [resultsByStudentId, setResultsByStudentId] = useState<
    Record<string, ActivityResultRow>
  >({});
  const [savingResultStudentId, setSavingResultStudentId] = useState("");

  const [loading, setLoading] = useState(true);
  const [publishing, setPublishing] = useState(false);

  const [changingStatus, setChangingStatus] = useState(false);

  const [error, setError] = useState("");

  const schoolNameById = useMemo(() => {
    return new Map(actor.schools.map((school) => [school.id, school.name]));
  }, [actor.schools]);

  const canSeeAllSchools = actor.roles.some((role) => isOrgWideRole(role));

  const activitySchoolIds = useMemo(() => {
    if (canSeeAllSchools) {
      return new Set(actor.schools.map((school) => school.id));
    }

    return new Set(
      actor.operationalAssignments
        .filter((assignment) => assignment.isActive !== false)
        .filter(
          (assignment) =>
            assignment.operationKind === "STUDENT_ACTIVITY_MANAGEMENT",
        )
        .filter((assignment) => assignment.scopeType === "SCHOOL")
        .map((assignment) => assignment.scopeId)
        .filter(Boolean),
    );
  }, [actor.operationalAssignments, actor.schools, canSeeAllSchools]);

  useEffect(() => {
    let active = true;

    async function loadActivity() {
      setLoading(true);
      setError("");

      try {
        const ref = doc(
          db,
          "orgs",
          actor.orgId,
          "schoolActivities",
          activityId,
        );

        const snap = await getDoc(ref);

        if (!active) return;

        if (!snap.exists()) {
          setError("لم يتم العثور على النشاط.");
          setActivity(null);
          return;
        }

        const row = {
          id: snap.id,
          ...(snap.data() as Omit<SchoolActivity, "id">),
        };

        if (row.orgId !== actor.orgId) {
          setError("هذا النشاط لا يتبع نفس المؤسسة.");
          setActivity(null);
          return;
        }

        if (!activitySchoolIds.has(row.schoolId)) {
          setError("ليس لديك صلاحية عرض هذا النشاط.");
          setActivity(null);
          return;
        }

        setActivity(row);

        const registrationsSnap = await getDocs(
          query(
            collection(db, "orgs", actor.orgId, "schoolActivityRegistrations"),
            where("activityId", "==", activityId),
          ),
        );

        const registrationRows = await Promise.all(
          registrationsSnap.docs.map(async (item) => {
            const data = item.data() as Omit<ActivityRegistrationRow, "id">;
            const studentId = data.studentId;

            let studentDisplayName = data.metadata?.studentName ?? "";

            if (studentId) {
              const studentSnap = await getDoc(
                doc(db, "orgs", actor.orgId, "students", studentId),
              );

              studentDisplayName =
                readStudentDisplayName(studentSnap.data()) ||
                studentDisplayName ||
                studentId;
            }

            return {
              id: item.id,
              ...data,
              studentDisplayName,
            };
          }),
        );

        registrationRows.sort(
          (a, b) => (b.registeredAt ?? 0) - (a.registeredAt ?? 0),
        );

        setRegistrations(registrationRows);

        const attendanceSnap = await getDocs(
          query(
            collection(
              db,
              "orgs",
              actor.orgId,
              "schoolActivityAttendanceRecords",
            ),
            where("activityId", "==", activityId),
          ),
        );

        const attendanceMap: Record<string, ActivityAttendanceRow> = {};

        attendanceSnap.docs.forEach((item) => {
          const data = item.data() as Omit<ActivityAttendanceRow, "id">;

          if (!data.studentId) return;

          attendanceMap[data.studentId] = {
            id: item.id,
            ...data,
          };
        });

        setAttendanceByStudentId(attendanceMap);

        const resultsSnap = await getDocs(
          query(
            collection(db, "orgs", actor.orgId, "schoolActivityResults"),
            where("activityId", "==", activityId),
          ),
        );

        const resultsMap: Record<string, ActivityResultRow> = {};

        resultsSnap.docs.forEach((item) => {
          const data = item.data() as Omit<ActivityResultRow, "id">;

          if (!data.studentId) return;

          resultsMap[data.studentId] = {
            id: item.id,
            ...data,
          };
        });

        setResultsByStudentId(resultsMap);
      } catch (error) {
        if (!active) return;
        setError(getErrorMessage(error));
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void loadActivity();

    return () => {
      active = false;
    };
  }, [actor.orgId, activityId, activitySchoolIds]);

  async function markAttendance(
    registration: ActivityRegistrationRow,
    status: "PRESENT" | "ABSENT",
  ) {
    if (!activity) return;

    setError("");
    setMarkingStudentId(registration.studentId);

    try {
      const now = Date.now();

      const activityRef = doc(
        db,
        "orgs",
        actor.orgId,
        "schoolActivities",
        activity.id,
      );

      const attendanceId = `${activity.id}_${registration.studentId}`;

      const attendanceRef = doc(
        db,
        "orgs",
        actor.orgId,
        "schoolActivityAttendanceRecords",
        attendanceId,
      );

      await runTransaction(db, async (transaction) => {
        const attendanceSnap = await transaction.get(attendanceRef);
        const previousStatus = attendanceSnap.exists()
          ? attendanceSnap.data().status
          : "";

        let attendedDelta = 0;

        if (previousStatus !== "PRESENT" && status === "PRESENT") {
          attendedDelta = 1;
        }

        if (previousStatus === "PRESENT" && status === "ABSENT") {
          attendedDelta = -1;
        }

        transaction.set(
          attendanceRef,
          {
            id: attendanceId,
            orgId: actor.orgId,
            activityId: activity.id,
            registrationId: registration.id,
            studentId: registration.studentId,
            status,

            markedAt: now,
            markedByPersonId: actor.personId || "",
            markedByRoleKey: actor.roles[0] || "",

            createdAt: attendanceSnap.exists()
              ? attendanceSnap.data().createdAt
              : now,
            updatedAt: now,

            metadata: {
              studentName:
                registration.studentDisplayName || registration.studentId,
              activityTitle: activity.title,
              schoolId: registration.metadata?.schoolId || activity.schoolId,
              gradeId: registration.metadata?.gradeId || "",
              classId: registration.metadata?.classId || "",
            },
          },
          { merge: true },
        );

        transaction.update(activityRef, {
          attendedCount: increment(attendedDelta),
          updatedAt: now,
        });
      });

      setAttendanceByStudentId((current) => ({
        ...current,
        [registration.studentId]: {
          id: attendanceId,
          orgId: actor.orgId,
          activityId: activity.id,
          registrationId: registration.id,
          studentId: registration.studentId,
          status,
          markedAt: now,
          markedByPersonId: actor.personId || "",
          markedByRoleKey: actor.roles[0] || "",
        },
      }));

      setActivity((current) => {
        if (!current) return current;

        const previousStatus =
          attendanceByStudentId[registration.studentId]?.status;

        let attendedDelta = 0;

        if (previousStatus !== "PRESENT" && status === "PRESENT") {
          attendedDelta = 1;
        }

        if (previousStatus === "PRESENT" && status === "ABSENT") {
          attendedDelta = -1;
        }

        return {
          ...current,
          attendedCount: Math.max(
            0,
            (current.attendedCount ?? 0) + attendedDelta,
          ),
          updatedAt: now,
        };
      });
    } catch (error) {
      setError(getErrorMessage(error));
    } finally {
      setMarkingStudentId("");
    }
  }

  async function saveResult(
    registration: ActivityRegistrationRow,
    resultType: string,
    rank?: number,
  ) {
    if (!activity) return;

    setError("");
    setSavingResultStudentId(registration.studentId);

    try {
      const now = Date.now();
      const resultId = `${activity.id}_${registration.studentId}`;

      const resultRef = doc(
        db,
        "orgs",
        actor.orgId,
        "schoolActivityResults",
        resultId,
      );

      const title =
        resultType === "RANKED" && rank
          ? `المركز ${rank}`
          : (RESULT_TYPE_LABELS[resultType] ?? resultType);

      const row: ActivityResultRow = {
        id: resultId,
        orgId: actor.orgId,
        activityId: activity.id,
        registrationId: registration.id,
        studentId: registration.studentId,

        resultType,
        rank,
        title,

        note: "",

        recordedAt: now,
        recordedByPersonId: actor.personId || "",
        recordedByRoleKey: actor.roles[0] || "",

        metadata: {
          studentName:
            registration.studentDisplayName || registration.studentId,
          activityTitle: activity.title,
          schoolId: registration.metadata?.schoolId || activity.schoolId,
          gradeId: registration.metadata?.gradeId || "",
          classId: registration.metadata?.classId || "",
        },
      };

      await setDoc(resultRef, stripUndefined(row), { merge: true });

      setResultsByStudentId((current) => ({
        ...current,
        [registration.studentId]: row,
      }));
    } catch (error) {
      setError(getErrorMessage(error));
    } finally {
      setSavingResultStudentId("");
    }
  }

  async function publishActivity() {
    if (!activity) return;

    setError("");
    setPublishing(true);

    try {
      const now = Date.now();
      const nextStatus: SchoolActivityStatus = "REGISTRATION_OPEN";

      const ref = doc(db, "orgs", actor.orgId, "schoolActivities", activity.id);

      await updateDoc(ref, {
        status: nextStatus,
        publishedAt: now,
        updatedAt: now,
      });

      setActivity({
        ...activity,
        status: nextStatus,
        publishedAt: now,
        updatedAt: now,
      });
    } catch (error) {
      setError(getErrorMessage(error));
    } finally {
      setPublishing(false);
    }
  }

  async function changeActivityStatus(nextStatus: SchoolActivityStatus) {
    if (!activity) return;

    setError("");
    setChangingStatus(true);

    try {
      const now = Date.now();

      const patch: Record<string, unknown> = {
        status: nextStatus,
        updatedAt: now,
      };

      if (nextStatus === "CANCELLED") {
        const reason = window.prompt("اكتب سبب إلغاء النشاط:");

        if (reason === null) {
          return;
        }

        patch.cancelledAt = now;
        patch.cancellationReason = reason.trim();
      }

      if (nextStatus === "COMPLETED") {
        patch.completedAt = now;
      }

      if (nextStatus === "ARCHIVED") {
        patch.archivedAt = now;
      }

      const ref = doc(db, "orgs", actor.orgId, "schoolActivities", activity.id);

      await updateDoc(ref, patch);

      setActivity((current) => {
        if (!current) return current;

        return {
          ...current,
          ...patch,
        } as SchoolActivity;
      });
    } catch (error) {
      setError(getErrorMessage(error));
    } finally {
      setChangingStatus(false);
    }
  }

  const schoolName = activity
    ? (schoolNameById.get(activity.schoolId) ?? activity.schoolId)
    : "";

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex size-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <CalendarDays className="size-6" />
          </div>

          <div>
            <h1 className="text-2xl font-bold">تفاصيل النشاط</h1>
            <p className="text-sm text-muted-foreground">
              عرض بيانات النشاط والتسجيلات والحالة الحالية.
            </p>
          </div>
        </div>

        <Button type="button" variant="outline" asChild>
          <Link href="/staff/activities">
            <ArrowRight className="size-4" />
            رجوع للأنشطة
          </Link>
        </Button>
      </div>

      {error ? (
        <Card className="border-destructive/40">
          <CardContent className="pt-6 text-sm text-destructive">
            {error}
          </CardContent>
        </Card>
      ) : null}

      {loading ? (
        <Card>
          <CardContent className="pt-6 text-sm text-muted-foreground">
            جاري تحميل النشاط...
          </CardContent>
        </Card>
      ) : null}

      {!loading && activity ? (
        <>
          <Card>
            <CardContent className="flex flex-col gap-4 pt-6 md:flex-row md:items-start md:justify-between">
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-2xl font-bold">{activity.title}</h2>

                  <span className="rounded-full bg-muted px-2 py-1 text-xs text-muted-foreground">
                    {KIND_LABELS[activity.activityKind] ??
                      activity.activityKind}
                  </span>

                  <span className="rounded-full bg-primary/10 px-2 py-1 text-xs text-primary">
                    {STATUS_LABELS[activity.status] ?? activity.status}
                  </span>
                </div>

                <p className="text-sm text-muted-foreground">{schoolName}</p>

                {activity.shortDescription ? (
                  <p className="text-sm">{activity.shortDescription}</p>
                ) : null}
              </div>

              <div className="flex flex-wrap gap-2">
                {activity.status === "DRAFT" ? (
                  <Button
                    type="button"
                    onClick={() => void publishActivity()}
                    disabled={publishing || changingStatus}
                  >
                    <Send className="size-4" />
                    {publishing ? "جاري النشر..." : "نشر النشاط"}
                  </Button>
                ) : null}

                {getActivityStatusActions(activity.status).map((action) => (
                  <Button
                    key={action.status}
                    type="button"
                    variant={action.variant ?? "outline"}
                    disabled={changingStatus || publishing}
                    onClick={() => void changeActivityStatus(action.status)}
                  >
                    {changingStatus ? "جاري التحديث..." : action.label}
                  </Button>
                ))}
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-4 md:grid-cols-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground">
                  المسجلون
                </CardTitle>
              </CardHeader>
              <CardContent className="text-2xl font-bold">
                {activity.registeredCount ?? 0}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground">
                  المؤكدون
                </CardTitle>
              </CardHeader>
              <CardContent className="text-2xl font-bold">
                {activity.confirmedCount ?? 0}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground">
                  قائمة الانتظار
                </CardTitle>
              </CardHeader>
              <CardContent className="text-2xl font-bold">
                {activity.waitlistedCount ?? 0}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground">
                  الحضور
                </CardTitle>
              </CardHeader>
              <CardContent className="text-2xl font-bold">
                {activity.attendedCount ?? 0}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>المسجلون في النشاط</CardTitle>
            </CardHeader>

            <CardContent>
              {registrations.length === 0 ? (
                <div className="text-sm text-muted-foreground">
                  لا توجد تسجيلات حتى الآن.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[760px] text-sm">
                    <thead>
                      <tr className="border-b text-muted-foreground">
                        <th className="py-3 text-right font-medium">الطالب</th>
                        <th className="py-3 text-right font-medium">الحالة</th>
                        <th className="py-3 text-right font-medium">
                          وقت التسجيل
                        </th>
                        <th className="py-3 text-right font-medium">
                          موافقة ولي الأمر
                        </th>
                        <th className="py-3 text-right font-medium">الحضور</th>
                        <th className="py-3 text-right font-medium">النتيجة</th>
                        <th className="py-3 text-right font-medium">الصف</th>
                        <th className="py-3 text-right font-medium">الفصل</th>
                      </tr>
                    </thead>

                    <tbody>
                      {registrations.map((registration) => (
                        <tr
                          key={registration.id}
                          className="border-b last:border-b-0"
                        >
                          <td className="py-3 font-medium">
                            {registration.studentDisplayName ||
                              registration.studentId}
                          </td>

                          <td className="py-3">
                            <span className="rounded-full bg-primary/10 px-2 py-1 text-xs text-primary">
                              {REGISTRATION_STATUS_LABELS[
                                registration.status
                              ] ?? registration.status}
                            </span>
                          </td>

                          <td className="py-3 text-muted-foreground">
                            {formatDate(registration.registeredAt)}
                          </td>

                          <td className="py-3 text-muted-foreground">
                            {registration.guardianConsentAccepted
                              ? "نعم"
                              : "لا"}
                          </td>

                          <td className="py-3">
                            <div className="flex flex-wrap gap-2">
                              <span className="rounded-full bg-muted px-2 py-1 text-xs text-muted-foreground">
                                {ATTENDANCE_STATUS_LABELS[
                                  attendanceByStudentId[registration.studentId]
                                    ?.status ?? ""
                                ] ?? "لم يحضر بعد"}
                              </span>

                              <button
                                type="button"
                                disabled={
                                  markingStudentId === registration.studentId
                                }
                                onClick={() =>
                                  void markAttendance(registration, "PRESENT")
                                }
                                className="rounded-full border px-2 py-1 text-xs hover:bg-muted disabled:opacity-50"
                              >
                                حاضر
                              </button>

                              <button
                                type="button"
                                disabled={
                                  markingStudentId === registration.studentId
                                }
                                onClick={() =>
                                  void markAttendance(registration, "ABSENT")
                                }
                                className="rounded-full border px-2 py-1 text-xs hover:bg-muted disabled:opacity-50"
                              >
                                غائب
                              </button>
                            </div>
                          </td>

                          <td className="py-3">
                            <div className="space-y-2">
                              <div className="text-xs text-muted-foreground">
                                {resultsByStudentId[registration.studentId]
                                  ?.title || "لا توجد نتيجة"}
                              </div>

                              <div className="flex flex-wrap gap-2">
                                <button
                                  type="button"
                                  disabled={
                                    savingResultStudentId ===
                                    registration.studentId
                                  }
                                  onClick={() =>
                                    void saveResult(registration, "WINNER")
                                  }
                                  className="rounded-full border px-2 py-1 text-xs hover:bg-muted disabled:opacity-50"
                                >
                                  فائز
                                </button>

                                <button
                                  type="button"
                                  disabled={
                                    savingResultStudentId ===
                                    registration.studentId
                                  }
                                  onClick={() =>
                                    void saveResult(registration, "RANKED", 1)
                                  }
                                  className="rounded-full border px-2 py-1 text-xs hover:bg-muted disabled:opacity-50"
                                >
                                  الأول
                                </button>

                                <button
                                  type="button"
                                  disabled={
                                    savingResultStudentId ===
                                    registration.studentId
                                  }
                                  onClick={() =>
                                    void saveResult(registration, "RANKED", 2)
                                  }
                                  className="rounded-full border px-2 py-1 text-xs hover:bg-muted disabled:opacity-50"
                                >
                                  الثاني
                                </button>

                                <button
                                  type="button"
                                  disabled={
                                    savingResultStudentId ===
                                    registration.studentId
                                  }
                                  onClick={() =>
                                    void saveResult(registration, "RANKED", 3)
                                  }
                                  className="rounded-full border px-2 py-1 text-xs hover:bg-muted disabled:opacity-50"
                                >
                                  الثالث
                                </button>

                                <button
                                  type="button"
                                  disabled={
                                    savingResultStudentId ===
                                    registration.studentId
                                  }
                                  onClick={() =>
                                    void saveResult(
                                      registration,
                                      "PARTICIPATION",
                                    )
                                  }
                                  className="rounded-full border px-2 py-1 text-xs hover:bg-muted disabled:opacity-50"
                                >
                                  مشاركة
                                </button>
                              </div>
                            </div>
                          </td>

                          <td className="py-3 text-muted-foreground">
                            {registration.metadata?.gradeId || "غير محدد"}
                          </td>

                          <td className="py-3 text-muted-foreground">
                            {registration.metadata?.classId || "غير محدد"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>النتائج والفائزون</CardTitle>
            </CardHeader>

            <CardContent>
              {Object.keys(resultsByStudentId).length === 0 ? (
                <div className="text-sm text-muted-foreground">
                  لا توجد نتائج مسجلة حتى الآن.
                </div>
              ) : (
                <div className="grid gap-3 md:grid-cols-2">
                  {Object.values(resultsByStudentId).map((result) => (
                    <div
                      key={result.id}
                      className="rounded-xl border p-3 text-sm"
                    >
                      <div className="font-semibold">
                        {result.metadata?.studentName || result.studentId}
                      </div>

                      <div className="mt-1 text-muted-foreground">
                        {result.title}
                      </div>

                      <div className="mt-1 text-xs text-muted-foreground">
                        {RESULT_TYPE_LABELS[result.resultType] ??
                          result.resultType}
                        {result.rank ? ` — المركز ${result.rank}` : ""}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>بيانات النشاط</CardTitle>
              </CardHeader>

              <CardContent className="grid gap-3 text-sm">
                <div className="flex justify-between gap-4">
                  <span className="text-muted-foreground">نوع النشاط</span>
                  <span>{KIND_LABELS[activity.activityKind]}</span>
                </div>

                <div className="flex justify-between gap-4">
                  <span className="text-muted-foreground">الحالة</span>
                  <span>{STATUS_LABELS[activity.status]}</span>
                </div>

                <div className="flex justify-between gap-4">
                  <span className="text-muted-foreground">المدرسة</span>
                  <span>{schoolName}</span>
                </div>

                <div className="flex justify-between gap-4">
                  <span className="text-muted-foreground">السنة الدراسية</span>
                  <span>{activity.academicYearId}</span>
                </div>

                <div className="flex justify-between gap-4">
                  <span className="text-muted-foreground">الفصل الدراسي</span>
                  <span>{activity.termTitle ?? "غير محدد"}</span>
                </div>

                <div className="flex justify-between gap-4">
                  <span className="text-muted-foreground">مكان النشاط</span>
                  <span>{activity.locationTitle || "غير محدد"}</span>
                </div>

                <div className="flex justify-between gap-4">
                  <span className="text-muted-foreground">السعة</span>
                  <span>{activity.capacity ?? "غير محددة"}</span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>المواعيد</CardTitle>
              </CardHeader>

              <CardContent className="grid gap-3 text-sm">
                <div className="flex justify-between gap-4">
                  <span className="text-muted-foreground">بداية التسجيل</span>
                  <span>{formatDate(activity.registrationOpensAt)}</span>
                </div>

                <div className="flex justify-between gap-4">
                  <span className="text-muted-foreground">نهاية التسجيل</span>
                  <span>{formatDate(activity.registrationClosesAt)}</span>
                </div>

                <div className="flex justify-between gap-4">
                  <span className="text-muted-foreground">بداية النشاط</span>
                  <span>{formatDate(activity.startsAt)}</span>
                </div>

                <div className="flex justify-between gap-4">
                  <span className="text-muted-foreground">نهاية النشاط</span>
                  <span>{formatDate(activity.endsAt)}</span>
                </div>

                <div className="flex justify-between gap-4">
                  <span className="text-muted-foreground">تاريخ النشر</span>
                  <span>{formatDate(activity.publishedAt)}</span>
                </div>

                <div className="flex justify-between gap-4">
                  <span className="text-muted-foreground">آخر تحديث</span>
                  <span>{formatDate(activity.updatedAt)}</span>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>الوصف التفصيلي</CardTitle>
            </CardHeader>

            <CardContent className="whitespace-pre-wrap text-sm leading-7 text-muted-foreground">
              {activity.description || "لا يوجد وصف تفصيلي."}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>موافقة ولي الأمر</CardTitle>
            </CardHeader>

            <CardContent className="space-y-3 text-sm">
              <div className="flex justify-between gap-4">
                <span className="text-muted-foreground">
                  يحتاج موافقة ولي الأمر
                </span>
                <span>{activity.requiresGuardianConsent ? "نعم" : "لا"}</span>
              </div>

              {activity.requiresGuardianConsent ? (
                <div className="rounded-xl bg-muted p-3 text-muted-foreground">
                  {activity.consentText || "لا يوجد نص موافقة."}
                </div>
              ) : null}
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  );
}
