"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { StaffTask } from "@takween/contracts";
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  ClipboardList,
  Clock,
  FilePenLine,
  ListChecks,
  TimerOff,
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

type TaskFilter = "ALL" | "OPEN" | "DRAFT" | "OVERDUE" | "COMPLETED";
type TaskKindFilter = "ALL" | StaffTask["taskKind"];

const statusFilters: Array<{
  key: TaskFilter;
  label: string;
}> = [
  { key: "ALL", label: "الكل" },
  { key: "OPEN", label: "مفتوحة" },
  { key: "DRAFT", label: "مسودات" },
  { key: "OVERDUE", label: "متأخرة" },
  { key: "COMPLETED", label: "مكتملة" },
];

const TASK_KIND_LABELS: Record<StaffTask["taskKind"], string> = {
  STUDENT_ATTENDANCE: "الحضور",
  STUDENT_MEASUREMENT: "القياسات",
  STUDENT_HOMEWORK: "الواجبات",
    LESSON_PREP: "تحضير الدروس",
  STUDENT_TRACKER: "المتابعات",
  KG_VALUES_EVALUATION: "القيم",
  KG_CORNERS_EVALUATION: "الأركان",
  KG_QURAN_TRACKER: "القرآن",
  LEARNING_LOSS_FOLLOWUP: "الفاقد",
  STUDENT_NOTES: "الملاحظات",
  STUDENT_CASE_REFERRAL: "الإحالات",
  STUDENT_CASE_HANDLING: "القضايا",
  STUDENT_GAMIFICATION: "التحفيز",
  STUDENT_ACTIVITY_MANAGEMENT: "الأنشطة",
  VIRTUAL_CLASS: "حصص افتراضية",
  TRANSPORT_ATTENDANCE: "النقل",
  STAFF_EVALUATION: "تقييم الموظفين",
  STAFF_OBSERVATION: "الزيارات",
  CUSTOM: "مخصص",
};

const TASK_KIND_ORDER: StaffTask["taskKind"][] = [
  "STUDENT_ATTENDANCE",
  "STUDENT_MEASUREMENT",
  "STUDENT_TRACKER",
  "KG_VALUES_EVALUATION",
  "KG_CORNERS_EVALUATION",
  "KG_QURAN_TRACKER",
  "LEARNING_LOSS_FOLLOWUP",
  "STUDENT_NOTES",
  "STUDENT_CASE_REFERRAL",
  "STUDENT_CASE_HANDLING",
  "STUDENT_GAMIFICATION",
  "VIRTUAL_CLASS",
  "TRANSPORT_ATTENDANCE",
  "STAFF_EVALUATION",
  "STAFF_OBSERVATION",
  "CUSTOM",
];

function normalizeStatusFilter(value: string | null): TaskFilter {
  if (
    value === "OPEN" ||
    value === "DRAFT" ||
    value === "OVERDUE" ||
    value === "COMPLETED"
  ) {
    return value;
  }

  return "ALL";
}

function normalizeKindFilter(value: string | null): TaskKindFilter {
  if (!value || value === "ALL") return "ALL";

  const allowedKinds = new Set<string>(TASK_KIND_ORDER);

  if (allowedKinds.has(value)) {
    return value as StaffTask["taskKind"];
  }

  return "ALL";
}

function buildFilterHref(params: {
  status: TaskFilter;
  kind: TaskKindFilter;
}) {
  const search = new URLSearchParams();

  if (params.status !== "ALL") {
    search.set("status", params.status);
  }

  if (params.kind !== "ALL") {
    search.set("kind", params.kind);
  }

  const query = search.toString();

  return query ? `/staff/tasks?${query}` : "/staff/tasks";
}

function getTaskStatusLabel(status: StaffTask["status"]) {
  const labels: Record<StaffTask["status"], string> = {
    PENDING: "لم تبدأ",
    IN_PROGRESS: "قيد التنفيذ",
    DRAFT: "مسودة",
    SUBMITTED: "مرسلة",
    NEEDS_REVIEW: "تحتاج مراجعة",
    RETURNED: "معادة",
    COMPLETED: "مكتملة",
    OVERDUE: "متأخرة",
    CANCELLED: "ملغاة",
  };

  return labels[status] ?? status;
}

function getTaskKindLabel(kind: StaffTask["taskKind"]) {
  return TASK_KIND_LABELS[kind] ?? kind;
}

function getPriorityLabel(priority: StaffTask["priority"]) {
  const labels: Record<StaffTask["priority"], string> = {
    LOW: "منخفضة",
    NORMAL: "عادية",
    HIGH: "مهمة",
    URGENT: "عاجلة",
  };

  return labels[priority] ?? priority;
}

function uniqueTasks(tasks: StaffTask[]) {
  const map = new Map<string, StaffTask>();

  for (const task of tasks) {
    map.set(task.id, task);
  }

  return Array.from(map.values());
}

function groupTasksByKind(tasks: StaffTask[]) {
  const groups = new Map<StaffTask["taskKind"], StaffTask[]>();

  for (const task of tasks) {
    const current = groups.get(task.taskKind) ?? [];
    current.push(task);
    groups.set(task.taskKind, current);
  }

  return TASK_KIND_ORDER.map((kind) => ({
    kind,
    label: getTaskKindLabel(kind),
    tasks: groups.get(kind) ?? [],
  })).filter((group) => group.tasks.length > 0);
}

function filterTasksByStatus(params: {
  tasks: StaffTask[];
  activeFilter: TaskFilter;
  overdueTasks: StaffTask[];
}) {
  if (params.activeFilter === "ALL") return params.tasks;

  if (params.activeFilter === "OPEN") {
    return params.tasks.filter(
      (task) => task.status !== "COMPLETED" && task.status !== "CANCELLED",
    );
  }

  if (params.activeFilter === "DRAFT") {
    return params.tasks.filter((task) => task.status === "DRAFT");
  }

  if (params.activeFilter === "OVERDUE") {
    const overdueIds = new Set(params.overdueTasks.map((task) => task.id));
    return params.tasks.filter((task) => overdueIds.has(task.id));
  }

  return params.tasks.filter((task) => task.status === "COMPLETED");
}

function filterTasksByKind(params: {
  tasks: StaffTask[];
  activeKind: TaskKindFilter;
}) {
  if (params.activeKind === "ALL") return params.tasks;

  return params.tasks.filter((task) => task.taskKind === params.activeKind);
}

export default function StaffTasksPage() {
  const searchParams = useSearchParams();

  const activeStatusFilter = normalizeStatusFilter(searchParams.get("status"));
  const activeKindFilter = normalizeKindFilter(searchParams.get("kind"));

  const { home } = useStaffHome();

  const openTasks = home.todayTasks;
  const draftTasks = home.draftTasks;
  const overdueTasks = home.overdueTasks;
  const completedTasks = home.todayTasks.filter(
    (task) => task.status === "COMPLETED",
  );

  const allTasks = uniqueTasks([
    ...openTasks,
    ...draftTasks,
    ...overdueTasks,
    ...completedTasks,
  ]);

  const statusFilteredTasks = filterTasksByStatus({
    tasks: allTasks,
    activeFilter: activeStatusFilter,
    overdueTasks,
  });

  const filteredTasks = filterTasksByKind({
    tasks: statusFilteredTasks,
    activeKind: activeKindFilter,
  });

  const taskGroups = groupTasksByKind(filteredTasks);
  const allTaskGroups = groupTasksByKind(allTasks);

  const availableKindFilters: Array<{
    key: TaskKindFilter;
    label: string;
    count: number;
  }> = [
    {
      key: "ALL",
      label: "كل الأنواع",
      count: allTasks.length,
    },
    ...allTaskGroups.map((group) => ({
      key: group.kind,
      label: group.label,
      count: group.tasks.length,
    })),
  ];

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-2">
              <Badge variant="secondary" className="w-fit">
                مهامي
              </Badge>

              <CardTitle className="text-2xl">مهامي اليومية</CardTitle>

              <CardDescription>
                تجمع هذه الصفحة مهام التشغيل اليومية، ويمكن تصفيتها حسب الحالة
                أو نوع المهمة.
              </CardDescription>
            </div>

            <div className="flex size-14 items-center justify-center rounded-2xl bg-accent text-accent-foreground">
              <ClipboardList className="size-7" />
            </div>
          </div>
        </CardHeader>

        <CardContent>
          <div className="grid gap-3 md:grid-cols-5">
            <SummaryCard
              title="كل المهام"
              value={allTasks.length}
              icon={<ListChecks className="size-5" />}
            />
            <SummaryCard
              title="مفتوحة"
              value={openTasks.length}
              icon={<Clock className="size-5" />}
            />
            <SummaryCard
              title="مسودات"
              value={draftTasks.length}
              icon={<FilePenLine className="size-5" />}
            />
            <SummaryCard
              title="متأخرة"
              value={overdueTasks.length}
              icon={<TimerOff className="size-5" />}
            />
            <SummaryCard
              title="مكتملة"
              value={completedTasks.length}
              icon={<CheckCircle2 className="size-5" />}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>تصفية المهام</CardTitle>
          <CardDescription>
            اختر الحالة ونوع المهمة لتقليل الزحام.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          <div>
            <p className="mb-2 text-sm font-medium text-foreground">
              حسب الحالة
            </p>

            <div className="flex flex-wrap gap-2">
              {statusFilters.map((filter) => (
                <Button
                  key={filter.key}
                  asChild
                  variant={
                    activeStatusFilter === filter.key ? "default" : "outline"
                  }
                  size="sm"
                >
                  <Link
                    href={buildFilterHref({
                      status: filter.key,
                      kind: activeKindFilter,
                    })}
                  >
                    {filter.label}
                  </Link>
                </Button>
              ))}
            </div>
          </div>

          <div>
            <p className="mb-2 text-sm font-medium text-foreground">
              حسب نوع المهمة
            </p>

            <div className="flex flex-wrap gap-2">
              {availableKindFilters.map((filter) => (
                <Button
                  key={filter.key}
                  asChild
                  variant={
                    activeKindFilter === filter.key ? "default" : "outline"
                  }
                  size="sm"
                >
                  <Link
                    href={buildFilterHref({
                      status: activeStatusFilter,
                      kind: filter.key,
                    })}
                  >
                    {filter.label}
                    <Badge
                      variant="secondary"
                      className="mr-1 rounded-full px-1.5"
                    >
                      {filter.count}
                    </Badge>
                  </Link>
                </Button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {taskGroups.length ? (
        <section className="space-y-4">
          {taskGroups.map((group) => (
            <Card key={group.kind}>
              <CardHeader>
                <div className="flex flex-col justify-between gap-3 md:flex-row md:items-center">
                  <div>
                    <CardTitle>{group.label}</CardTitle>
                    <CardDescription>
                      {group.tasks.length} مهمة في هذا التصنيف
                    </CardDescription>
                  </div>

                  <Badge variant="outline">{group.kind}</Badge>
                </div>
              </CardHeader>

              <CardContent className="space-y-3">
                {group.tasks.map((task) => (
                  <TaskCard key={task.id} task={task} />
                ))}
              </CardContent>
            </Card>
          ))}
        </section>
      ) : (
        <Card className="border-dashed">
          <CardContent className="p-8">
            <div className="mx-auto max-w-md text-center">
              <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
                <AlertCircle className="size-6" />
              </div>

              <p className="font-semibold text-foreground">
                لا توجد مهام في هذا التصنيف
              </p>

              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                غيّر التصفية أو ارجع إلى عرض كل المهام.
              </p>

              {activeStatusFilter !== "ALL" || activeKindFilter !== "ALL" ? (
                <Button asChild variant="outline" className="mt-4">
                  <Link href="/staff/tasks">عرض كل المهام</Link>
                </Button>
              ) : null}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function TaskCard({ task }: { task: StaffTask }) {
  return (
    <div className="rounded-2xl border border-border bg-background px-4 py-3">
      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-start">
        <div>
          <p className="font-semibold text-foreground">{task.taskTitle}</p>

          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            {task.taskDescription || task.scopeLabel || "مهمة تشغيلية"}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Badge variant="outline">{getTaskStatusLabel(task.status)}</Badge>
          <Badge variant="secondary">{getPriorityLabel(task.priority)}</Badge>
        </div>
      </div>

      <div className="mt-4 grid gap-2 text-sm text-muted-foreground md:grid-cols-3">
        <TaskMeta label="النوع" value={getTaskKindLabel(task.taskKind)} />
        <TaskMeta
          label="النطاق"
          value={task.scopeLabel || task.scopeId || task.scopeType}
        />
        <TaskMeta
          label="المستهدف"
          value={task.targetLabel || task.targetId || task.targetKind}
        />
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Badge variant="outline">{task.taskKind}</Badge>
        <Badge variant="outline">{task.scopeType}</Badge>
        {task.sourceType ? (
          <Badge variant="outline">{task.sourceType}</Badge>
        ) : null}
      </div>

      {task.actionHref ? (
        <Button asChild variant="outline" className="mt-4">
          <Link href={task.actionHref}>
            {task.actionLabel || "فتح المهمة"}
            <ArrowLeft className="size-4" />
          </Link>
        </Button>
      ) : null}
    </div>
  );
}

function SummaryCard({
  title,
  value,
  icon,
}: {
  title: string;
  value: number;
  icon: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-border bg-background p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">{title}</p>
        <div className="text-primary">{icon}</div>
      </div>

      <p className="mt-2 text-2xl font-bold">{value}</p>
    </div>
  );
}

function TaskMeta({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-muted/30 px-3 py-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 truncate font-medium text-foreground">{value}</p>
    </div>
  );
}