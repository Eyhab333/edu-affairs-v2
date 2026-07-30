"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { collection, getDocs, query, where } from "firebase/firestore";

import { db } from "@/lib/firebase";
import { useStaffActor } from "@/components/staff/staff-actor-provider";
import {
  ArrowRight,
  BookOpenCheck,
  CalendarDays,
  ClipboardList,
  FileText,
  GraduationCap,
  Layers3,
  Plus,
  School,
} from "lucide-react";

function getParamValue(value: string | string[] | undefined) {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

function getSafeText(value: string | null, fallback = "غير محدد") {
  const trimmed = String(value || "").trim();
  return trimmed || fallback;
}

function buildQueryString(searchParams: URLSearchParams) {
  const query = searchParams.toString();
  return query ? `?${query}` : "";
}

type StaffActorLike = {
  uid?: string;
  personId?: string;
  orgId?: string;
};

type SubjectLessonPrepStatus =
  | "DRAFT"
  | "SUBMITTED"
  | "APPROVED"
  | "RETURNED"
  | "LOCKED"
  | "CANCELLED";

type SubjectLessonPrepRow = {
  id: string;
  orgId: string;
  schoolId: string;
  academicYearId: string;
  termId: string;
  termTitle: string;
  termShortTitle: string;
  classId: string;
  gradeId: string;
  classSubjectOfferingId: string;
  subjectKey: string;
  teacherPersonId: string;
  teacherAssignmentId: string;
  lessonTitle: string;
  unitTitle: string;
  weekLabel: string;
  lessonDate: string;
  status: SubjectLessonPrepStatus;
  createdAt?: number;
  updatedAt?: number;
};

function getStatusLabel(status: SubjectLessonPrepStatus) {
  switch (status) {
    case "DRAFT":
      return "مسودة";
    case "SUBMITTED":
      return "مرسل";
    case "APPROVED":
      return "معتمد";
    case "RETURNED":
      return "معاد للتعديل";
    case "LOCKED":
      return "مقفل";
    case "CANCELLED":
      return "ملغي";
    default:
      return status;
  }
}

function getStatusClassName(status: SubjectLessonPrepStatus) {
  switch (status) {
    case "DRAFT":
      return "bg-slate-100 text-slate-700 ring-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:ring-slate-700";
    case "SUBMITTED":
      return "bg-sky-50 text-sky-700 ring-sky-100 dark:bg-sky-950/40 dark:text-sky-300 dark:ring-sky-900";
    case "APPROVED":
      return "bg-emerald-50 text-emerald-700 ring-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-900";
    case "RETURNED":
      return "bg-amber-50 text-amber-700 ring-amber-100 dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-900";
    case "LOCKED":
      return "bg-violet-50 text-violet-700 ring-violet-100 dark:bg-violet-950/40 dark:text-violet-300 dark:ring-violet-900";
    case "CANCELLED":
      return "bg-rose-50 text-rose-700 ring-rose-100 dark:bg-rose-950/40 dark:text-rose-300 dark:ring-rose-900";
    default:
      return "bg-slate-100 text-slate-700 ring-slate-200";
  }
}

function formatUpdatedAt(value?: number) {
  if (!value) return "غير محدد";

  try {
    return new Intl.DateTimeFormat("ar-SA", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "Asia/Riyadh",
    }).format(new Date(value));
  } catch {
    return "غير محدد";
  }
}

export default function SubjectLessonPrepListPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const { actor } = useStaffActor();

  const staffActor = actor as StaffActorLike | null;

  const [rows, setRows] = useState<SubjectLessonPrepRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const classId = decodeURIComponent(getParamValue(params.classId));
  const offeringId = decodeURIComponent(getParamValue(params.offeringId));

  const schoolId = searchParams.get("schoolId");
  const academicYearId = searchParams.get("academicYearId");
  const gradeId = searchParams.get("gradeId");
  const termId = searchParams.get("termId");
  const termTitle = searchParams.get("termTitle");
  const termShortTitle = searchParams.get("termShortTitle");
  const subjectKey = searchParams.get("subjectKey");
  const teacherAssignmentId = searchParams.get("teacherAssignmentId");
  const orgId = staffActor?.orgId || "";

  const teacherPersonId = staffActor?.personId || staffActor?.uid || "";

  const preservedQuery = useMemo(() => {
    const next = new URLSearchParams(searchParams.toString());

    if (subjectKey) {
      next.set("subjectKey", subjectKey);
    }

    if (teacherAssignmentId) {
      next.set("teacherAssignmentId", teacherAssignmentId);
    }

    return next;
  }, [searchParams, subjectKey, teacherAssignmentId]);

  const newLessonPrepHref = `/staff/classes/${encodeURIComponent(
    classId,
  )}/subjects/${encodeURIComponent(offeringId)}/lesson-prep/new${buildQueryString(
    preservedQuery,
  )}`;

  const subjectHref = `/staff/classes/${encodeURIComponent(
    classId,
  )}${schoolId || academicYearId ? `?${buildQueryString(preservedQuery).slice(1)}` : ""}`;

  const loadRows = useCallback(async () => {
    if (
      !orgId ||
      !teacherPersonId ||
      !schoolId ||
      !academicYearId ||
      !termId ||
      !subjectKey
    ) {
      setRows([]);
      setLoadError("لم يتم تحديد orgId من بيانات المستخدم.");
      setLoading(false);
      return;
    }

    setLoading(true);
    setLoadError("");

    try {
      const ref = collection(db, "orgs", orgId, "subjectLessonPreps");

      const snap = await getDocs(
        query(
          ref,
          where("teacherPersonId", "==", teacherPersonId),
          where("schoolId", "==", schoolId),
          where("academicYearId", "==", academicYearId),
          where("termId", "==", termId),
          where("classId", "==", classId),
          where("subjectKey", "==", subjectKey),
          where("classSubjectOfferingId", "==", offeringId),
        ),
      );

      const nextRows = snap.docs
        .map((docSnap) => {
          return {
            id: docSnap.id,
            ...docSnap.data(),
          } as SubjectLessonPrepRow;
        })
        .filter((row) => row.classId === classId)
        .filter((row) => {
          if (!schoolId) return true;
          return row.schoolId === schoolId;
        })
        .filter((row) => {
          if (!academicYearId) return true;
          return row.academicYearId === academicYearId;
        })
        .filter((row) => {
          if (!termId) return true;
          return row.termId === termId;
        })
        .sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));

      setRows(nextRows);
    } catch (error) {
      setRows([]);
      setLoadError(
        error instanceof Error ? error.message : "فشل تحميل تحضيرات المادة.",
      );
    } finally {
      setLoading(false);
    }
  }, [
    orgId,
    teacherPersonId,
    offeringId,
    classId,
    schoolId,
    academicYearId,
    termId,
    subjectKey,
  ]);

  useEffect(() => {
    void loadRows();
  }, [loadRows]);

  return (
    <main
      dir="rtl"
      className="min-h-screen bg-slate-50 p-4 text-slate-950 dark:bg-slate-950 dark:text-slate-50 sm:p-6"
    >
      <section className="mx-auto flex max-w-7xl flex-col gap-6">
        <div className="flex flex-col gap-4">
          <Link
            href={subjectHref}
            className="inline-flex w-fit items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            <ArrowRight className="h-4 w-4" />
            الرجوع إلى الفصل
          </Link>

          <div className="overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="border-b border-slate-100 bg-gradient-to-l from-emerald-50 via-white to-white p-6 dark:border-slate-800 dark:from-emerald-950/40 dark:via-slate-900 dark:to-slate-900 sm:p-8">
              <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
                <div className="space-y-3">
                  <div className="inline-flex items-center gap-2 rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">
                    <BookOpenCheck className="h-3.5 w-3.5" />
                    Milestone 15B
                  </div>

                  <div className="space-y-2">
                    <h1 className="text-2xl font-bold tracking-tight sm:text-4xl">
                      تحضير الدروس
                    </h1>

                    <p className="max-w-3xl text-sm leading-7 text-slate-600 dark:text-slate-400">
                      هذه صفحة تحضيرات الدروس الخاصة بالمادة داخل الفصل. في هذه
                      الخطوة نثبت المسار وسياق المادة والفصل الدراسي، ثم نضيف
                      إنشاء التحضير في الخطوة التالية.
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-2 pt-2">
                    <Link
                      href={newLessonPrepHref}
                      className="inline-flex h-10 items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700"
                    >
                      <Plus className="h-4 w-4" />
                      تحضير درس جديد
                    </Link>
                  </div>
                </div>

                <div className="w-fit rounded-3xl bg-slate-950 px-5 py-3 text-white dark:bg-slate-50 dark:text-slate-950">
                  <p className="text-xs opacity-70">الفصل الدراسي</p>
                  <p className="text-2xl font-bold">
                    {getSafeText(termShortTitle || termTitle || termId)}
                  </p>
                </div>
              </div>
            </div>

            <div className="grid gap-4 p-6 sm:grid-cols-2 lg:grid-cols-4">
              <ContextCard
                icon={School}
                label="المدرسة"
                value={getSafeText(schoolId)}
              />

              <ContextCard
                icon={CalendarDays}
                label="السنة الدراسية"
                value={getSafeText(academicYearId)}
              />

              <ContextCard
                icon={GraduationCap}
                label="الصف"
                value={getSafeText(gradeId)}
              />

              <ContextCard
                icon={Layers3}
                label="المادة"
                value={getSafeText(subjectKey)}
              />
            </div>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center gap-3">
              <div className="rounded-2xl bg-emerald-50 p-3 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                <ClipboardList className="h-5 w-5" />
              </div>

              <div>
                <h2 className="font-bold">قائمة تحضيرات المادة</h2>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  ستظهر هنا التحضيرات المحفوظة لهذه المادة بعد تنفيذ الحفظ.
                </p>
              </div>
            </div>

            {loading ? (
              <div className="mt-5 rounded-3xl border border-dashed border-slate-300 p-10 text-center dark:border-slate-700">
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  جاري تحميل التحضيرات...
                </p>
              </div>
            ) : loadError ? (
              <div className="mt-5 rounded-3xl border border-rose-200 bg-rose-50 p-5 text-sm leading-7 text-rose-900 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-100">
                {loadError}
              </div>
            ) : rows.length === 0 ? (
              <div className="mt-5 rounded-3xl border border-dashed border-slate-300 p-10 text-center dark:border-slate-700">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-3xl bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                  <FileText className="h-6 w-6" />
                </div>

                <h3 className="mt-4 text-lg font-bold">لا توجد تحضيرات بعد</h3>

                <p className="mx-auto mt-2 max-w-xl text-sm leading-7 text-slate-500 dark:text-slate-400">
                  ابدأ بإنشاء تحضير جديد، ثم احفظه كمسودة ليظهر هنا.
                </p>

                <div className="mt-5">
                  <Link
                    href={newLessonPrepHref}
                    className="inline-flex h-10 items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700"
                  >
                    <Plus className="h-4 w-4" />
                    تحضير درس جديد
                  </Link>
                </div>
              </div>
            ) : (
              <div className="mt-5 overflow-hidden rounded-3xl border border-slate-100 dark:border-slate-800">
                <div className="hidden grid-cols-[1.5fr_1fr_1fr_1fr_1fr_auto] gap-3 bg-slate-50 px-4 py-3 text-xs font-semibold text-slate-500 dark:bg-slate-950 dark:text-slate-400 md:grid">
                  <span>الدرس</span>
                  <span>الوحدة / الأسبوع</span>
                  <span>تاريخ الدرس</span>
                  <span>الحالة</span>
                  <span>آخر تحديث</span>
                  <span>الإجراء</span>
                </div>

                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                  {rows.map((row) => (
                    <div
                      key={row.id}
                      className="grid gap-3 px-4 py-4 text-sm md:grid-cols-[1.5fr_1fr_1fr_1fr_1fr_auto]"
                    >
                      <div className="min-w-0">
                        <p className="truncate font-bold text-slate-950 dark:text-slate-50">
                          {row.lessonTitle || "تحضير بدون عنوان"}
                        </p>
                        <p className="mt-1 truncate text-xs text-slate-500 dark:text-slate-400">
                          {row.id}
                        </p>
                      </div>

                      <div className="text-slate-600 dark:text-slate-300">
                        <p>{row.unitTitle || "غير محدد"}</p>
                        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                          {row.weekLabel || "غير محدد"}
                        </p>
                      </div>

                      <div className="text-slate-600 dark:text-slate-300">
                        {row.lessonDate || "غير محدد"}
                      </div>

                      <div>
                        <span
                          className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ring-1 ${getStatusClassName(
                            row.status,
                          )}`}
                        >
                          {getStatusLabel(row.status)}
                        </span>
                      </div>

                      <div className="text-xs text-slate-500 dark:text-slate-400">
                        {formatUpdatedAt(row.updatedAt)}
                      </div>

                      <div>
                        <Link
                          href={`/staff/classes/${encodeURIComponent(
                            classId,
                          )}/subjects/${encodeURIComponent(
                            offeringId,
                          )}/lesson-prep/${encodeURIComponent(row.id)}${buildQueryString(
                            preservedQuery,
                          )}`}
                          className="inline-flex h-9 items-center justify-center rounded-2xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                        >
                          فتح
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <aside className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center gap-3">
              <div className="rounded-2xl bg-sky-50 p-3 text-sky-700 dark:bg-sky-950 dark:text-sky-300">
                <BookOpenCheck className="h-5 w-5" />
              </div>

              <div>
                <h2 className="font-bold">سياق التحضير</h2>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  للتأكد أن الرابط يحمل البيانات الصحيحة.
                </p>
              </div>
            </div>

            <div className="mt-5 grid gap-2 text-sm">
              <InfoRow label="classId" value={classId} />
              <InfoRow label="offeringId" value={offeringId} />
              <InfoRow label="schoolId" value={getSafeText(schoolId)} />
              <InfoRow
                label="academicYearId"
                value={getSafeText(academicYearId)}
              />
              <InfoRow label="termId" value={getSafeText(termId)} />
              <InfoRow label="termTitle" value={getSafeText(termTitle)} />
              <InfoRow
                label="termShortTitle"
                value={getSafeText(termShortTitle)}
              />
              <InfoRow label="subjectKey" value={getSafeText(subjectKey)} />
              <InfoRow
                label="teacherAssignmentId"
                value={getSafeText(teacherAssignmentId)}
              />
            </div>
          </aside>
        </div>
      </section>
    </main>
  );
}

function ContextCard({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-3xl border border-slate-100 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950">
      <div className="flex items-start gap-3">
        <div className="rounded-2xl bg-white p-3 text-slate-700 shadow-sm dark:bg-slate-900 dark:text-slate-200">
          <Icon className="h-5 w-5" />
        </div>

        <div className="min-w-0">
          <p className="text-xs text-slate-500 dark:text-slate-400">{label}</p>
          <p className="mt-1 truncate font-bold text-slate-950 dark:text-slate-50">
            {value}
          </p>
        </div>
      </div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-2xl border border-slate-100 px-3 py-2 dark:border-slate-800">
      <span className="text-slate-500 dark:text-slate-400">{label}</span>
      <span className="max-w-[12rem] truncate text-left font-mono text-xs font-medium text-slate-800 dark:text-slate-100">
        {value}
      </span>
    </div>
  );
}
