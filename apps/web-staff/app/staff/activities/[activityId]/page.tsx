"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { doc, getDoc, updateDoc } from "firebase/firestore";
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

function isOrgWideRole(role: string) {
  return ["platform_owner", "platform_admin", "org_owner", "org_admin"].includes(
    role,
  );
}

export default function StaffActivityDetailsPage() {
  const router = useRouter();
  const params = useParams<{ activityId: string }>();
  const activityId = params.activityId;

  const { actor } = useStaffActor();

  const [activity, setActivity] = useState<SchoolActivity | null>(null);
  const [loading, setLoading] = useState(true);
  const [publishing, setPublishing] = useState(false);
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

  async function publishActivity() {
    if (!activity) return;

    setError("");
    setPublishing(true);

    try {
      const now = Date.now();
      const nextStatus: SchoolActivityStatus = "REGISTRATION_OPEN";

      const ref = doc(
        db,
        "orgs",
        actor.orgId,
        "schoolActivities",
        activity.id,
      );

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

  const schoolName = activity
    ? schoolNameById.get(activity.schoolId) ?? activity.schoolId
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

              {activity.status === "DRAFT" ? (
                <Button
                  type="button"
                  onClick={() => void publishActivity()}
                  disabled={publishing}
                >
                  <Send className="size-4" />
                  {publishing ? "جاري النشر..." : "نشر النشاط"}
                </Button>
              ) : null}
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