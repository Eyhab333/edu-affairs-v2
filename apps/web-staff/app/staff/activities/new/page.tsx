"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { collection, doc, setDoc } from "firebase/firestore";
import type { SchoolActivity, SchoolActivityKind } from "@takween/contracts";
import { ArrowRight, CalendarDays, Save } from "lucide-react";

import { useStaffActor } from "@/components/staff/staff-actor-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { db } from "@/lib/firebase";

const ACTIVITY_KIND_OPTIONS: Array<{
  value: SchoolActivityKind;
  label: string;
}> = [
  { value: "COMPETITION", label: "مسابقة" },
  { value: "EVENT", label: "فعالية" },
  { value: "TRIP", label: "رحلة" },
  { value: "CLUB", label: "نادي" },
  { value: "WORKSHOP", label: "ورشة" },
  { value: "CAMPAIGN", label: "حملة" },
  { value: "SPORTS", label: "رياضي" },
  { value: "CULTURAL", label: "ثقافي" },
  { value: "VOLUNTEERING", label: "تطوعي" },
  { value: "CEREMONY", label: "حفل" },
  { value: "OTHER", label: "أخرى" },
];

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "حدث خطأ غير متوقع";
}

function isOrgWideRole(role: string) {
  return ["platform_owner", "platform_admin", "org_owner", "org_admin"].includes(
    role,
  );
}

function toTimestamp(value: string) {
  if (!value) return undefined;

  const timestamp = new Date(value).getTime();

  if (Number.isNaN(timestamp)) return undefined;

  return timestamp;
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

function getFirstItem<T>(items: T[]) {
  return items.length > 0 ? items[0] : undefined;
}

export default function NewStaffActivityPage() {
  const router = useRouter();
  const { actor } = useStaffActor();

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

  const schoolOptions = useMemo(() => {
    return actor.schools
      .filter((school) => activitySchoolIds.has(school.id))
      .sort((a, b) => {
        const aName = a.name ?? a.id;
        const bName = b.name ?? b.id;
        return aName.localeCompare(bName, "ar");
      });
  }, [actor.schools, activitySchoolIds]);

  const [schoolId, setSchoolId] = useState(
    () => getFirstItem(schoolOptions)?.id ?? "",
  );

  const selectedSchool = schoolOptions.find((school) => school.id === schoolId);

  const academicYearId = useMemo(() => {
    const classInSchool = actor.classes.find(
      (classItem) => classItem.schoolId === schoolId,
    );

    return classInSchool?.academicYearId ?? "";
  }, [actor.classes, schoolId]);

  const currentTerm = academicYearId
    ? actor.currentTermsByAcademicYear[academicYearId]
    : undefined;

  const [title, setTitle] = useState("");
  const [shortDescription, setShortDescription] = useState("");
  const [description, setDescription] = useState("");
  const [activityKind, setActivityKind] =
    useState<SchoolActivityKind>("COMPETITION");

  const [registrationOpensAt, setRegistrationOpensAt] = useState("");
  const [registrationClosesAt, setRegistrationClosesAt] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");

  const [capacity, setCapacity] = useState("");
  const [requiresGuardianConsent, setRequiresGuardianConsent] = useState(true);
  const [consentText, setConsentText] = useState(
    "أوافق على مشاركة ابني/ابنتي في هذا النشاط حسب التعليمات المعلنة.",
  );

  const [locationTitle, setLocationTitle] = useState("");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setError("");

    const cleanTitle = title.trim();

    if (!cleanTitle) {
      setError("اكتب عنوان النشاط.");
      return;
    }

    if (!schoolId) {
      setError("اختر المدرسة.");
      return;
    }

    if (!academicYearId) {
      setError("لم يتم تحديد السنة الدراسية للمدرسة المختارة.");
      return;
    }

    const registrationOpensAtMs = toTimestamp(registrationOpensAt);
    const registrationClosesAtMs = toTimestamp(registrationClosesAt);
    const startsAtMs = toTimestamp(startsAt);
    const endsAtMs = toTimestamp(endsAt);

    if (
      registrationOpensAtMs &&
      registrationClosesAtMs &&
      registrationClosesAtMs < registrationOpensAtMs
    ) {
      setError("نهاية التسجيل يجب أن تكون بعد بداية التسجيل.");
      return;
    }

    if (startsAtMs && endsAtMs && endsAtMs < startsAtMs) {
      setError("نهاية النشاط يجب أن تكون بعد بداية النشاط.");
      return;
    }

    const capacityNumber = capacity.trim() ? Number(capacity) : undefined;

    if (
      typeof capacityNumber === "number" &&
      (!Number.isFinite(capacityNumber) || capacityNumber <= 0)
    ) {
      setError("السعة يجب أن تكون رقمًا أكبر من صفر.");
      return;
    }

    setSaving(true);

    try {
      const now = Date.now();
      const ref = doc(collection(db, "orgs", actor.orgId, "schoolActivities"));

      const activity: SchoolActivity = {
        id: ref.id,

        orgId: actor.orgId,
        schoolId,
        academicYearId,

        termId: currentTerm?.id,
        termTitle: currentTerm?.title,
        termShortTitle: currentTerm?.shortTitle,

        title: cleanTitle,
        shortDescription: shortDescription.trim(),
        description: description.trim(),

        activityKind,
        status: "DRAFT",
        visibility: "PARENT_VISIBLE",
        registrationMode: "GUARDIAN_REGISTRATION",

        organizerPersonId: actor.personId || undefined,
        organizerRoleKey: actor.roles[0],
        organizerDisplayName:
          actor.person?.displayName ??
          actor.userProfile?.displayName ??
          actor.userProfile?.email,

        targetAudience: {
          schoolIds: [schoolId],
          gradeIds: [],
          streamIds: [],
          classIds: [],
          studentIds: [],
        },

        startsAt: startsAtMs,
        endsAt: endsAtMs,

        registrationOpensAt: registrationOpensAtMs,
        registrationClosesAt: registrationClosesAtMs,

        locationTitle: locationTitle.trim(),
        locationUrl: undefined,

        capacity: capacityNumber,
        allowWaitlist: true,

        registeredCount: 0,
        confirmedCount: 0,
        waitlistedCount: 0,
        attendedCount: 0,

        requiresGuardianConsent,
        consentText: requiresGuardianConsent ? consentText.trim() : undefined,

        requiresApproval: false,
        approvedByPersonId: undefined,
        approvedAt: undefined,

        imageUrl: undefined,
        attachments: [],
        questions: [],
        tags: [],

        cancellationReason: undefined,
        completionNote: undefined,

        createdByPersonId: actor.personId || undefined,
        createdByRoleKey: actor.roles[0],

        createdAt: now,
        updatedAt: now,

        publishedAt: undefined,
        cancelledAt: undefined,
        completedAt: undefined,
        archivedAt: undefined,

        metadata: {
          createdFrom: "web-staff",
          selectedSchoolName: selectedSchool?.name ?? schoolId,
        },
      };

      await setDoc(ref, stripUndefined(activity));

      router.replace(`/staff/activities/${ref.id}`);
    } catch (error) {
      setError(getErrorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex size-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <CalendarDays className="size-6" />
          </div>

          <div>
            <h1 className="text-2xl font-bold">نشاط جديد</h1>
            <p className="text-sm text-muted-foreground">
              إنشاء نشاط أو مسابقة أو فعالية مدرسية كمسودة.
            </p>
          </div>
        </div>

        <Button
          type="button"
          variant="outline"
          onClick={() => router.push("/staff/activities")}
        >
          <ArrowRight className="size-4" />
          رجوع للأنشطة
        </Button>
      </div>

      {schoolOptions.length === 0 ? (
        <Card>
          <CardContent className="pt-6 text-sm text-muted-foreground">
            لا توجد مدارس متاحة لك لإدارة الأنشطة.
          </CardContent>
        </Card>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-6">
          {error ? (
            <Card className="border-destructive/40">
              <CardContent className="pt-6 text-sm text-destructive">
                {error}
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle>بيانات النشاط</CardTitle>
            </CardHeader>

            <CardContent className="grid gap-4">
              <div className="grid gap-2">
                <label className="text-sm font-medium">عنوان النشاط</label>
                <input
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder="مثال: مسابقة أجمل تلاوة"
                  className="rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                />
              </div>

              <div className="grid gap-2">
                <label className="text-sm font-medium">وصف مختصر</label>
                <input
                  value={shortDescription}
                  onChange={(event) =>
                    setShortDescription(event.target.value)
                  }
                  placeholder="وصف قصير يظهر في القائمة"
                  className="rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                />
              </div>

              <div className="grid gap-2">
                <label className="text-sm font-medium">الوصف التفصيلي</label>
                <textarea
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  rows={5}
                  placeholder="اكتب تفاصيل النشاط وشروط المشاركة."
                  className="rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                />
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="grid gap-2">
                  <label className="text-sm font-medium">نوع النشاط</label>
                  <select
                    value={activityKind}
                    onChange={(event) =>
                      setActivityKind(event.target.value as SchoolActivityKind)
                    }
                    className="rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                  >
                    {ACTIVITY_KIND_OPTIONS.map((item) => (
                      <option key={item.value} value={item.value}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid gap-2">
                  <label className="text-sm font-medium">المدرسة</label>
                  <select
                    value={schoolId}
                    onChange={(event) => setSchoolId(event.target.value)}
                    className="rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                  >
                    {schoolOptions.map((school) => (
                      <option key={school.id} value={school.id}>
                        {school.name ?? school.id}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="grid gap-2">
                  <label className="text-sm font-medium">السنة الدراسية</label>
                  <input
                    value={academicYearId || "غير محددة"}
                    disabled
                    className="rounded-xl border border-input bg-muted px-3 py-2 text-sm text-muted-foreground"
                  />
                </div>

                <div className="grid gap-2">
                  <label className="text-sm font-medium">الفصل الدراسي</label>
                  <input
                    value={currentTerm?.title ?? "غير محدد"}
                    disabled
                    className="rounded-xl border border-input bg-muted px-3 py-2 text-sm text-muted-foreground"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>المواعيد والسعة</CardTitle>
            </CardHeader>

            <CardContent className="grid gap-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="grid gap-2">
                  <label className="text-sm font-medium">بداية التسجيل</label>
                  <input
                    type="datetime-local"
                    value={registrationOpensAt}
                    onChange={(event) =>
                      setRegistrationOpensAt(event.target.value)
                    }
                    className="rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>

                <div className="grid gap-2">
                  <label className="text-sm font-medium">نهاية التسجيل</label>
                  <input
                    type="datetime-local"
                    value={registrationClosesAt}
                    onChange={(event) =>
                      setRegistrationClosesAt(event.target.value)
                    }
                    className="rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="grid gap-2">
                  <label className="text-sm font-medium">بداية النشاط</label>
                  <input
                    type="datetime-local"
                    value={startsAt}
                    onChange={(event) => setStartsAt(event.target.value)}
                    className="rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>

                <div className="grid gap-2">
                  <label className="text-sm font-medium">نهاية النشاط</label>
                  <input
                    type="datetime-local"
                    value={endsAt}
                    onChange={(event) => setEndsAt(event.target.value)}
                    className="rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="grid gap-2">
                  <label className="text-sm font-medium">مكان النشاط</label>
                  <input
                    value={locationTitle}
                    onChange={(event) => setLocationTitle(event.target.value)}
                    placeholder="مثال: مسرح المدرسة"
                    className="rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>

                <div className="grid gap-2">
                  <label className="text-sm font-medium">السعة</label>
                  <input
                    type="number"
                    min={1}
                    value={capacity}
                    onChange={(event) => setCapacity(event.target.value)}
                    placeholder="اتركها فارغة إذا لا توجد سعة محددة"
                    className="rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>موافقة ولي الأمر</CardTitle>
            </CardHeader>

            <CardContent className="grid gap-4">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={requiresGuardianConsent}
                  onChange={(event) =>
                    setRequiresGuardianConsent(event.target.checked)
                  }
                  className="size-4"
                />
                يحتاج موافقة ولي الأمر عند التسجيل
              </label>

              {requiresGuardianConsent ? (
                <div className="grid gap-2">
                  <label className="text-sm font-medium">نص الموافقة</label>
                  <textarea
                    value={consentText}
                    onChange={(event) => setConsentText(event.target.value)}
                    rows={3}
                    className="rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
              ) : null}
            </CardContent>
          </Card>

          <div className="flex justify-end">
            <Button type="submit" disabled={saving}>
              <Save className="size-4" />
              {saving ? "جاري الحفظ..." : "حفظ كمسودة"}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}