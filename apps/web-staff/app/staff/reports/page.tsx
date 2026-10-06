"use client";

import Link from "next/link";
import { ArrowLeft, BarChart3, ClipboardCheck, ListChecks, UsersRound } from "lucide-react";

import { useStaffActor } from "@/components/staff/staff-actor-provider";
import { hasOrgWideAccess } from "@takween/domain";

const reportAreas = [
  {
    href: "/staff/reports/teacher-work",
    title: "متابعة أعمال المعلمين",
    description: "متابعة القياسات والتحاضير والأنشطة التعليمية المنسوبة للمعلمين.",
    icon: BarChart3,
    tone: "bg-sky-500/10 text-sky-700 dark:text-sky-300",
  },
  {
    href: "/staff/reports/staff-work",
    title: "متابعة أعمال القيادات",
    description: "عرض أعمال القيادات والإداريين المسجلة فعلياً في المدرسة.",
    icon: UsersRound,
    tone: "bg-violet-500/10 text-violet-700 dark:text-violet-300",
  },
  {
    href: "/staff/reports/admin-work",
    title: "متابعة أعمال الإداريين",
    description: "متابعة الحضور والحالات والأنشطة ووثائق العمل حسب الدور والمدرسة.",
    icon: ClipboardCheck,
    tone: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  },
  {
    href: "/staff/reports/evaluations",
    title: "تقرير تقييمات الموظفين",
    description: "تحليل نتائج تقييمات المعلمين والقيادات والإداريين على مستوى الموظف والمدرسة.",
    icon: ListChecks,
    tone: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
  },
] as const;

export default function ReportsPage() {
  const { actor } = useStaffActor();
  const canAccessReports =
    hasOrgWideAccess(actor.roles)
    //  ||
    // actor.roles.includes("ORG_SUPERVISION_HEAD") ||
    // actor.roles.includes("BOYS_EDU_SUPERVISOR") ||
    // actor.roles.includes("EDU_SUPERVISOR") ||
    // actor.roles.includes("BOYS_PRINCIPAL") ||
    // actor.roles.includes("GIRLS_PRINCIPAL") ||
    // actor.roles.includes("KG_PRINCIPAL")
    ;

  if (!canAccessReports) return null;

  return (
    <main dir="rtl" className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6">
      <section className="overflow-hidden rounded-3xl border bg-card p-6 shadow-sm sm:p-8">
        <p className="text-sm font-medium text-primary">مركز التقارير</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight">التقارير</h1>
        <p className="mt-3 max-w-3xl text-sm leading-7 text-muted-foreground">
          نقطة وصول موحدة للوحات متابعة الأعمال. تبقى صلاحيات كل لوحة ونطاقها المدرسي مطبقة كما هي عند فتحها.
        </p>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {reportAreas.map((area) => {
          const Icon = area.icon;
          return (
            <Link
              key={area.href}
              href={area.href}
              className="group rounded-2xl border bg-card p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-md"
            >
              <div className={`flex size-12 items-center justify-center rounded-2xl ${area.tone}`}>
                <Icon className="size-6" />
              </div>
              <h2 className="mt-5 font-bold text-foreground">{area.title}</h2>
              <p className="mt-2 min-h-12 text-sm leading-6 text-muted-foreground">{area.description}</p>
              <span className="mt-5 inline-flex items-center gap-1 text-sm font-semibold text-primary">
                فتح لوحة المتابعة <ArrowLeft className="size-4 transition-transform group-hover:-translate-x-1" />
              </span>
            </Link>
          );
        })}
      </section>

      <p className="rounded-2xl border border-dashed p-4 text-sm leading-6 text-muted-foreground">
        إذا لم تكن صلاحية إحدى لوحات المتابعة مفعلة، ستبقى قواعد الصلاحيات الحالية هي المرجع ولن تعرض بيانات خارج النطاق المخول.
      </p>
    </main>
  );
}
