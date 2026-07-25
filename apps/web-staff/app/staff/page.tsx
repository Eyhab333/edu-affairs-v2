"use client";

import Link from "next/link";
import {
  AlertCircle,
  ArrowLeft,
  Bell,
  ClipboardList,
  Layers3,
  School,
  Sparkles,
  Zap,
} from "lucide-react";

import { useStaffHome } from "@/hooks/use-staff-home";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  getStaffActorDisplayName,
  getStaffActorPrimaryRole,
} from "@/lib/staff-actor";
import { getStaffActorStats } from "@/lib/staff-actor-helpers";

export default function StaffHomePage() {
  const { actor, home } = useStaffHome();

  const actorName = getStaffActorDisplayName(actor);
  const actorRole = getStaffActorPrimaryRole(actor);
  const stats = getStaffActorStats(actor);

  return (
    <div className="space-y-4">
      <Card className="overflow-hidden">
        <CardContent className="p-5">
          <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
            <div className="space-y-2">
              <Badge variant="secondary" className="w-fit">
                الرئيسية
              </Badge>

              <h1 className="text-2xl font-bold text-foreground">
                أهلاً، {actorName}
              </h1>

              <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
                هذه الصفحة تعرض ملخص التشغيل اليومي حسب الدور والصلاحيات
                والإسنادات، وتجمع المهام ونطاقات العمل والتنبيهات في مكان واحد.
              </p>

              <div className="flex flex-wrap gap-2 pt-2">
                <Button asChild>
                  <Link href="/staff/tasks">
                    فتح مهامي
                    <ArrowLeft className="size-4" />
                  </Link>
                </Button>

                {/* <Button asChild variant="outline">
                  <Link href="/staff/classes">فتح فصولي</Link>
                </Button> */}
              </div>
            </div>

            <div className="flex size-16 items-center justify-center rounded-2xl bg-accent text-accent-foreground">
              <Sparkles className="size-8" />
            </div>
          </div>
        </CardContent>
      </Card>

      <section className="grid gap-3 md:grid-cols-6">
        <InfoCard title="المؤسسة" value={actor.org?.shortName ?? actor.orgId} />
        <InfoCard title="الدور" value={actorRole || "غير محدد"} />
        <InfoCard title="العضويات" value={stats.membershipsCount} />
        <InfoCard title="المدارس" value={stats.schoolsCount} />
        <InfoCard title="الفصول المقروءة" value={stats.classesCount} />
        <InfoCard title="الفصول المرئية" value={stats.visibleClassesCount} />
      </section>

      <section className="grid gap-3 md:grid-cols-5">
        {home.summaryCards.map((card) => (
          <Card key={card.key}>
            <CardHeader className="pb-2">
              <CardDescription>{card.title}</CardDescription>
              <CardTitle className="text-3xl">{card.value}</CardTitle>
              {card.description ? (
                <CardDescription>{card.description}</CardDescription>
              ) : null}
            </CardHeader>
          </Card>
        ))}
      </section>

      {home.quickActions.length ? (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Zap className="size-5 text-primary" />
              <CardTitle>ابدأ من هنا</CardTitle>
            </div>
            <CardDescription>
              إجراءات سريعة مبنية على الوحدات المتاحة لهذا المستخدم.
            </CardDescription>
          </CardHeader>

          <CardContent>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {home.quickActions.map((action) => (
                <Link
                  key={action.key}
                  href={action.href}
                  className="rounded-2xl border border-border bg-background p-4 transition hover:bg-accent hover:text-accent-foreground"
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-semibold">{action.title}</p>
                    <ArrowLeft className="size-4" />
                  </div>

                  {action.description ? (
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">
                      {action.description}
                    </p>
                  ) : null}
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : null}

      {home.alerts.length ? (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Bell className="size-5 text-primary" />
              <CardTitle>تنبيهات التشغيل</CardTitle>
            </div>
            <CardDescription>
              ملاحظات أولية تساعد على تجهيز التشغيل اليومي.
            </CardDescription>
          </CardHeader>

          <CardContent>
            <div className="space-y-2">
              {home.alerts.map((alert) => (
                <div
                  key={alert.key}
                  className="rounded-2xl border border-border bg-background px-4 py-3"
                >
                  <div className="flex flex-col justify-between gap-2 md:flex-row md:items-center">
                    <div>
                      <div className="flex items-center gap-2">
                        <Badge
                          variant={
                            alert.severity === "CRITICAL"
                              ? "destructive"
                              : alert.severity === "WARNING"
                                ? "outline"
                                : "secondary"
                          }
                        >
                          {alert.severity}
                        </Badge>

                        <p className="font-semibold">{alert.title}</p>
                      </div>

                      <p className="mt-2 text-sm leading-6 text-muted-foreground">
                        {alert.description}
                      </p>
                    </div>

                    {alert.href ? (
                      <Button asChild variant="outline" size="sm">
                        <Link href={alert.href}>فتح</Link>
                      </Button>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>الوحدات المتاحة</CardTitle>
          <CardDescription>
            هذه الوحدات محسوبة حسب الدور والصلاحيات والإسنادات.
          </CardDescription>
        </CardHeader>

        <CardContent>
          <div className="flex flex-wrap gap-2">
            {actor.visibleModules.map((moduleKey) => (
              <Badge key={moduleKey} variant="outline">
                {moduleKey}
              </Badge>
            ))}
          </div>
        </CardContent>
      </Card>

      <section className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <ClipboardList className="size-5 text-primary" />
              <CardTitle>مهامي المفتوحة</CardTitle>
            </div>
            <CardDescription>
              المهام المتولدة مبدئيًا من الإسنادات التشغيلية.
            </CardDescription>
          </CardHeader>

          <CardContent>
            {home.todayTasks.length ? (
              <div className="space-y-2">
                {home.todayTasks.slice(0, 5).map((task) => (
                  <div
                    key={task.id}
                    className="rounded-xl border border-border bg-background px-3 py-2"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-medium text-foreground">
                        {task.taskTitle}
                      </p>

                      <Badge variant="outline">{task.status}</Badge>
                    </div>

                    <p className="mt-1 text-xs leading-5 text-muted-foreground">
                      {task.taskDescription || task.scopeLabel || "مهمة تشغيلية"}
                    </p>
                  </div>
                ))}

                <Button asChild variant="outline" className="mt-2 w-full">
                  <Link href="/staff/tasks">عرض كل المهام</Link>
                </Button>
              </div>
            ) : (
              <EmptyState
                icon={<AlertCircle className="size-5" />}
                title="لا توجد مهام بعد"
                description="إذا لم تظهر مهام، فهذا يعني غالبًا عدم وجود operationalAssignments لهذا الشخص حتى الآن."
              />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <School className="size-5 text-primary" />
              <CardTitle>نطاقات العمل</CardTitle>
            </div>
            <CardDescription>
              الفصول والنطاقات التي يمكنك العمل عليها حسب الدور والصلاحيات
              والإسنادات.
            </CardDescription>
          </CardHeader>

          <CardContent>
            {home.workScopes.length ? (
              <div className="space-y-2">
                {home.workScopes.slice(0, 8).map((scope) => (
                  <div
                    key={scope.id}
                    className="rounded-xl border border-border bg-background px-3 py-2"
                  >
                    <p className="text-sm font-medium text-foreground">
                      {scope.title}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {scope.subtitle || scope.type}
                    </p>
                  </div>
                ))}

                <Button asChild variant="outline" className="mt-2 w-full">
                  <Link href="/staff/classes">عرض كل الفصول</Link>
                </Button>
              </div>
            ) : (
              <EmptyState
                icon={<Layers3 className="size-5" />}
                title="لا توجد نطاقات عمل"
                description="لم يتم العثور على فصول أو نطاقات متاحة لهذا المستخدم."
              />
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

function InfoCard({
  title,
  value,
}: {
  title: string;
  value: string | number;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription>{title}</CardDescription>
        <CardTitle className="text-xl">{value}</CardTitle>
      </CardHeader>
    </Card>
  );
}

function EmptyState({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-2xl border border-dashed border-border bg-muted/40 p-4 text-center">
      <div className="mx-auto mb-2 flex size-10 items-center justify-center rounded-full bg-background text-muted-foreground">
        {icon}
      </div>

      <p className="text-sm font-semibold text-foreground">{title}</p>

      <p className="mt-1 text-xs leading-5 text-muted-foreground">
        {description}
      </p>
    </div>
  );
}