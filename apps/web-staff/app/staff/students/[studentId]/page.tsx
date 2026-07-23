"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import {
  AlertTriangle,
  ArrowRight,
  BookOpen,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ClipboardCheck,
  FileText,
  GraduationCap,
  HeartHandshake,
  IdCard,
  Mail,
  MessageSquareText,
  Phone,
  School,
  Sparkles,
  UserRound,
} from "lucide-react";

import { useStaffActor } from "@/components/staff/staff-actor-provider";
import { useStaffStudentProfile } from "@/hooks/use-staff-student-profile";
import type { VisibleStudentClass } from "@/hooks/use-visible-students";

type StaffActorLike = {
  orgId?: string;
  visibleClasses?: VisibleStudentClass[];
};

type OperationCard = {
  title: string;
  description: string;
  status: "READY_SOON" | "FUTURE";
  icon: React.ComponentType<{ className?: string }>;
};

const operationCards: OperationCard[] = [
  {
    title: "الحضور",
    description: "عرض حضور الطالب وتسجيلات الحضور سيأتي في مرحلة الحضور.",
    status: "FUTURE",
    icon: ClipboardCheck,
  },
  {
    title: "القياسات والمتابعات",
    description: "عرض قياسات الطالب ومتابعاته سيرتبط بمرحلة القياسات.",
    status: "READY_SOON",
    icon: BookOpen,
  },
  {
    title: "الملاحظات",
    description: "إضافة أو عرض ملاحظات الطالب ستأتي في مرحلة الملاحظات.",
    status: "FUTURE",
    icon: MessageSquareText,
  },
  {
    title: "القضايا والإحالات",
    description: "عرض أو إحالة قضية للطالب ستأتي في مرحلة القضايا.",
    status: "FUTURE",
    icon: FileText,
  },
  {
    title: "التحفيز",
    description: "عرض أو إضافة أحداث تحفيز للطالب ستأتي لاحقًا.",
    status: "FUTURE",
    icon: Sparkles,
  },
];

function getParamValue(value: string | string[] | undefined) {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

function buildClassHref(item: VisibleStudentClass) {
  const params = new URLSearchParams();

  if (item.schoolId) params.set("schoolId", item.schoolId);
  if (item.academicYearId) params.set("academicYearId", item.academicYearId);

  const query = params.toString();

  return `/staff/classes/${encodeURIComponent(item.id)}${
    query ? `?${query}` : ""
  }`;
}

export default function StaffStudentProfilePage() {
  const params = useParams();

  const { actor } = useStaffActor();
  const staffActor = actor as StaffActorLike | null;

  const studentId = decodeURIComponent(getParamValue(params.studentId));
  const visibleClasses = staffActor?.visibleClasses ?? [];

  const studentProfile = useStaffStudentProfile({
    orgId: staffActor?.orgId ?? "",
    studentId,
    visibleClasses,
    enabled: !!staffActor?.orgId && !!studentId,
  });

  if (!staffActor) {
    return (
      <main
        dir="rtl"
        className="min-h-screen bg-slate-50 p-4 text-slate-950 dark:bg-slate-950 dark:text-slate-50 sm:p-6"
      >
        <section className="mx-auto max-w-7xl">
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <p className="text-sm text-slate-500 dark:text-slate-400">
              جاري تحميل بيانات المستخدم...
            </p>
          </div>
        </section>
      </main>
    );
  }

  if (studentProfile.loading) {
    return (
      <main
        dir="rtl"
        className="min-h-screen bg-slate-50 p-4 text-slate-950 dark:bg-slate-950 dark:text-slate-50 sm:p-6"
      >
        <section className="mx-auto flex max-w-7xl flex-col gap-6">
          <Link
            href="/staff/students"
            className="inline-flex w-fit items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            <ArrowRight className="h-4 w-4" />
            الرجوع إلى طلابي
          </Link>

          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <p className="text-sm text-slate-500 dark:text-slate-400">
              جاري قراءة بيانات الطالب...
            </p>
          </div>
        </section>
      </main>
    );
  }

  if (studentProfile.error) {
    return (
      <main
        dir="rtl"
        className="min-h-screen bg-slate-50 p-4 text-slate-950 dark:bg-slate-950 dark:text-slate-50 sm:p-6"
      >
        <section className="mx-auto flex max-w-7xl flex-col gap-6">
          <Link
            href="/staff/students"
            className="inline-flex w-fit items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            <ArrowRight className="h-4 w-4" />
            الرجوع إلى طلابي
          </Link>

          <div className="rounded-3xl border border-red-200 bg-red-50 p-6 text-sm leading-7 text-red-800 shadow-sm dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-100">
            حدث خطأ أثناء قراءة بيانات الطالب: {studentProfile.error}
          </div>
        </section>
      </main>
    );
  }

  if (!studentProfile.data) {
    return (
      <main
        dir="rtl"
        className="min-h-screen bg-slate-50 p-4 text-slate-950 dark:bg-slate-950 dark:text-slate-50 sm:p-6"
      >
        <section className="mx-auto flex max-w-7xl flex-col gap-6">
          <Link
            href="/staff/students"
            className="inline-flex w-fit items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            <ArrowRight className="h-4 w-4" />
            الرجوع إلى طلابي
          </Link>

          <div className="rounded-3xl border border-amber-200 bg-amber-50 p-8 text-center shadow-sm dark:border-amber-900/60 dark:bg-amber-950/30">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-3xl bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300">
              <AlertTriangle className="h-6 w-6" />
            </div>

            <h1 className="mt-4 text-xl font-bold">الطالب غير ظاهر لك</h1>

            <p className="mx-auto mt-2 max-w-2xl text-sm leading-7 text-amber-900 dark:text-amber-100">
              لم يتم العثور على تسجيل نشط لهذا الطالب داخل الفصول المرئية
              للمستخدم الحالي.
            </p>

            <div className="mt-5 rounded-2xl bg-white/70 p-4 text-sm text-amber-900 dark:bg-slate-950/40 dark:text-amber-100">
              <span className="font-semibold">studentId:</span>{" "}
              <span className="font-mono">{studentId}</span>
            </div>
          </div>
        </section>
      </main>
    );
  }

  const profile = studentProfile.data;

  return (
    <main
      dir="rtl"
      className="min-h-screen bg-slate-50 p-4 text-slate-950 dark:bg-slate-950 dark:text-slate-50 sm:p-6"
    >
      <section className="mx-auto flex max-w-7xl flex-col gap-6">
        <div className="flex flex-wrap gap-2">
          <Link
            href="/staff/students"
            className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            <ArrowRight className="h-4 w-4" />
            الرجوع إلى طلابي
          </Link>

          <Link
            href={buildClassHref(profile.classInfo)}
            className="inline-flex items-center gap-2 rounded-2xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700"
          >
            <BookOpen className="h-4 w-4" />
            فتح الفصل
          </Link>
        </div>

        <div className="overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="border-b border-slate-100 bg-gradient-to-l from-emerald-50 via-white to-white p-6 dark:border-slate-800 dark:from-emerald-950/40 dark:via-slate-900 dark:to-slate-900 sm:p-8">
            <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
              <div className="space-y-3">
                <div className="inline-flex items-center gap-2 rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">
                  <UserRound className="h-3.5 w-3.5" />
                  Milestone 6E — بطاقة الطالب المختصرة
                </div>

                <div className="space-y-2">
                  <h1 className="text-2xl font-bold tracking-tight sm:text-4xl">
                    {profile.displayName}
                  </h1>

                  <p className="max-w-3xl text-sm leading-7 text-slate-600 dark:text-slate-400">
                    بطاقة تشغيلية مختصرة للطالب داخل بوابة الموظف. هذه الصفحة
                    ليست بديلًا عن ملف الطالب الكامل في لوحة الإدارة.
                  </p>
                </div>
              </div>

              <div className="w-fit rounded-3xl bg-slate-950 px-5 py-3 text-white dark:bg-slate-50 dark:text-slate-950">
                <p className="text-xs opacity-70">رقم الطالب</p>
                <p className="text-sm font-bold">{profile.studentId}</p>
              </div>
            </div>
          </div>

          <div className="grid gap-4 p-6 sm:grid-cols-2 lg:grid-cols-4">
            <SummaryCard
              icon={School}
              label="المدرسة"
              value={profile.schoolName || "غير محدد"}
            />

            <SummaryCard
              icon={GraduationCap}
              label="الصف / المستوى"
              value={profile.gradeTitle || "غير محدد"}
            />

            <SummaryCard
              icon={BookOpen}
              label="الفصل"
              value={profile.classTitle || "غير محدد"}
            />

            <SummaryCard
              icon={CalendarDays}
              label="السنة الدراسية"
              value={profile.academicYearTitle || "غير محدد"}
            />
          </div>
        </div>

        {!profile.studentExists || !profile.personExists ? (
          <div className="flex gap-3 rounded-3xl border border-amber-200 bg-amber-50 p-5 text-sm leading-7 text-amber-900 shadow-sm dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-100">
            <AlertTriangle className="mt-1 h-5 w-5 shrink-0" />

            <div>
              <p className="font-bold">توجد بيانات تحتاج مراجعة</p>

              <p className="mt-1">
                {!profile.studentExists ? (
                  <span>لا يوجد سجل طالب مطابق. </span>
                ) : null}

                {!profile.personExists ? (
                  <span>لا توجد بيانات شخص مرتبطة بالطالب.</span>
                ) : null}
              </p>
            </div>
          </div>
        ) : null}

        <div className="grid gap-4 lg:grid-cols-3">
          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 lg:col-span-1">
            <div className="flex items-center gap-3">
              <div className="rounded-2xl bg-emerald-50 p-3 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                <IdCard className="h-5 w-5" />
              </div>

              <div>
                <h2 className="font-bold">بيانات الطالب</h2>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  بيانات أساسية مختصرة
                </p>
              </div>
            </div>

            <div className="mt-5 grid gap-2 text-sm">
              <InfoRow label="الاسم" value={profile.displayName} />
              <InfoRow
                label="السجل المدني"
                value={profile.nationalId || "غير محدد"}
              />
              <InfoRow
                label="رقم الجوال"
                value={profile.phone || "غير محدد"}
                icon={Phone}
              />
              <InfoRow
                label="البريد"
                value={profile.email || "غير محدد"}
                icon={Mail}
              />
              <InfoRow label="معرّف الطالب" value={profile.studentId} />
              <InfoRow
                label="معرّف الشخص"
                value={profile.person?.id || profile.student?.personId || "غير محدد"}
              />
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 lg:col-span-1">
            <div className="flex items-center gap-3">
              <div className="rounded-2xl bg-sky-50 p-3 text-sky-700 dark:bg-sky-950 dark:text-sky-300">
                <BookOpen className="h-5 w-5" />
              </div>

              <div>
                <h2 className="font-bold">التسجيل الحالي</h2>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  مصدره studentEnrollments
                </p>
              </div>
            </div>

            <div className="mt-5 grid gap-2 text-sm">
              <InfoRow label="الفصل" value={profile.classTitle} />
              <InfoRow label="المدرسة" value={profile.schoolName} />
              <InfoRow label="السنة" value={profile.academicYearTitle} />
              <InfoRow label="الصف" value={profile.gradeTitle || "غير محدد"} />
              <InfoRow label="المسار" value={profile.streamId || "غير محدد"} />
              <InfoRow
                label="حالة التسجيل"
                value={profile.enrollment.status || "ACTIVE"}
              />
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 lg:col-span-1">
            <div className="flex items-center gap-3">
              <div className="rounded-2xl bg-violet-50 p-3 text-violet-700 dark:bg-violet-950 dark:text-violet-300">
                <HeartHandshake className="h-5 w-5" />
              </div>

              <div>
                <h2 className="font-bold">إجراءات سريعة</h2>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  تجهيز للعمليات القادمة
                </p>
              </div>
            </div>

            <div className="mt-5 grid gap-2">
              <Link
                href={buildClassHref(profile.classInfo)}
                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-emerald-700"
              >
                فتح فصل الطالب
                <ChevronLeft className="h-4 w-4" />
              </Link>

              <button
                type="button"
                disabled
                className="inline-flex cursor-not-allowed items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-400 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-500"
              >
                ملف الطالب الكامل في الإدارة
              </button>
            </div>
          </div>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center gap-3">
            <div className="rounded-2xl bg-slate-50 p-3 text-slate-700 dark:bg-slate-950 dark:text-slate-300">
              <CheckCircle2 className="h-5 w-5" />
            </div>

            <div>
              <h2 className="font-bold">مساحات تشغيل الطالب</h2>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                هذه البطاقات ستُفعل مع المراحل التشغيلية التالية.
              </p>
            </div>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            {operationCards.map((item) => (
              <OperationPlaceholderCard key={item.title} item={item} />
            ))}
          </div>
        </div>

        {/* <div className="rounded-3xl border border-emerald-100 bg-emerald-50 p-5 text-sm leading-7 text-emerald-900 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-100">
          <span className="font-semibold">الخطوة التالية:</span>{" "}
          بعد تثبيت هذه الصفحة، نفعّل زر بطاقة الطالب في صفحة طلابي، ثم نغلق
          Milestone 6 رسميًا.
        </div> */}
      </section>
    </main>
  );
}

function SummaryCard({
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

function InfoRow({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string;
  icon?: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-2xl border border-slate-100 px-3 py-2 dark:border-slate-800">
      <span className="flex items-center gap-2 text-slate-500 dark:text-slate-400">
        {Icon ? <Icon className="h-3.5 w-3.5" /> : null}
        {label}
      </span>

      <span className="truncate text-left font-medium text-slate-800 dark:text-slate-100">
        {value}
      </span>
    </div>
  );
}

function OperationPlaceholderCard({ item }: { item: OperationCard }) {
  const Icon = item.icon;

  return (
    <div className="rounded-3xl border border-slate-100 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950">
      <div className="rounded-2xl bg-white p-3 text-slate-700 shadow-sm dark:bg-slate-900 dark:text-slate-200">
        <Icon className="h-5 w-5" />
      </div>

      <h3 className="mt-4 font-bold">{item.title}</h3>

      <p className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">
        {item.description}
      </p>

      <div className="mt-4">
        <span className="inline-flex rounded-full bg-white px-3 py-1 text-xs font-medium text-slate-600 ring-1 ring-slate-200 dark:bg-slate-900 dark:text-slate-300 dark:ring-slate-800">
          {item.status === "READY_SOON" ? "قادم قريبًا" : "مرحلة لاحقة"}
        </span>
      </div>
    </div>
  );
}