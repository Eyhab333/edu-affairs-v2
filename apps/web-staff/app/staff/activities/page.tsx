"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { collection, getDocs } from "firebase/firestore";
import type {
  SchoolActivity,
  SchoolActivityKind,
  SchoolActivityStatus,
} from "@takween/contracts";
import { CalendarDays, Plus } from "lucide-react";

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

export default function StaffActivitiesPage() {
  const { actor } = useStaffActor();

  const [activities, setActivities] = useState<SchoolActivity[]>([]);
  const [loading, setLoading] = useState(true);
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

    async function loadActivities() {
      setLoading(true);
      setError("");

      try {
        const snap = await getDocs(
          collection(db, "orgs", actor.orgId, "schoolActivities"),
        );

        if (!active) return;

        const rows = snap.docs
          .map((item) => ({
            id: item.id,
            ...(item.data() as Omit<SchoolActivity, "id">),
          }))
          .filter((activity) => activity.orgId === actor.orgId)
          .filter((activity) => {
            if (activitySchoolIds.size === 0) return false;
            return activitySchoolIds.has(activity.schoolId);
          })
          .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));

        setActivities(rows);
      } catch (error) {
        if (!active) return;
        setError(getErrorMessage(error));
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void loadActivities();

    return () => {
      active = false;
    };
  }, [actor.orgId, activitySchoolIds]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex size-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <CalendarDays className="size-6" />
          </div>

          <div>
            <h1 className="text-2xl font-bold">الأنشطة</h1>
            <p className="text-sm text-muted-foreground">
              إدارة الأنشطة والمسابقات والفعاليات المدرسية.
            </p>
          </div>
        </div>

        <Button asChild>
          <Link href="/staff/activities/new">
            <Plus className="size-4" />
            نشاط جديد
          </Link>
        </Button>
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">
              الأنشطة
            </CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-bold">
            {activities.length}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">
              التسجيل مفتوح
            </CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-bold">
            {
              activities.filter(
                (activity) => activity.status === "REGISTRATION_OPEN",
              ).length
            }
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">
              مسودات
            </CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-bold">
            {activities.filter((activity) => activity.status === "DRAFT").length}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">
              مكتملة
            </CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-bold">
            {
              activities.filter((activity) => activity.status === "COMPLETED")
                .length
            }
          </CardContent>
        </Card>
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
            جاري تحميل الأنشطة...
          </CardContent>
        </Card>
      ) : null}

      {!loading && !error && activities.length === 0 ? (
        <Card>
          <CardContent className="pt-6 text-sm text-muted-foreground">
            لا توجد أنشطة حتى الآن.
          </CardContent>
        </Card>
      ) : null}

      {!loading && !error && activities.length > 0 ? (
        <div className="grid gap-3">
          {activities.map((activity) => {
            const schoolName =
              schoolNameById.get(activity.schoolId) ?? activity.schoolId;

            return (
              <Card key={activity.id}>
                <CardContent className="flex flex-col gap-4 pt-6 md:flex-row md:items-center md:justify-between">
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-lg font-semibold">
                        {activity.title}
                      </h2>

                      <span className="rounded-full bg-muted px-2 py-1 text-xs text-muted-foreground">
                        {KIND_LABELS[activity.activityKind] ??
                          activity.activityKind}
                      </span>

                      <span className="rounded-full bg-primary/10 px-2 py-1 text-xs text-primary">
                        {STATUS_LABELS[activity.status] ?? activity.status}
                      </span>
                    </div>

                    <p className="text-sm text-muted-foreground">
                      {schoolName}
                    </p>

                    <div className="grid gap-1 text-xs text-muted-foreground md:grid-cols-2">
                      <p>بداية التسجيل: {formatDate(activity.registrationOpensAt)}</p>
                      <p>نهاية التسجيل: {formatDate(activity.registrationClosesAt)}</p>
                      <p>بداية النشاط: {formatDate(activity.startsAt)}</p>
                      <p>
                        المسجلون: {activity.registeredCount ?? 0}
                        {activity.capacity ? ` / ${activity.capacity}` : ""}
                      </p>
                    </div>
                  </div>

                  <Button variant="outline" asChild>
                    <Link href={`/staff/activities/${activity.id}`}>
                      عرض التفاصيل
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}