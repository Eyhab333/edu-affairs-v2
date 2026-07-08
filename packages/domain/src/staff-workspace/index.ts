import {
  resolveTermContext,
  type TermContextInput,
} from "../term-context";
import type {
  Class,
  Membership,
  OperationalAssignment,
  StaffTask,
  TeacherAssignment,
} from "@takween/contracts";

import { ActorAccessContext, getVisibleClassesForActor } from "../access";
import { buildStaffTaskFromAssignment } from "../operations";

export type StaffHomeVisibleModule =
  | "HOME"
  | "CLASSES"
  | "STUDENTS"
  | "ATTENDANCE"
  | "MEASUREMENTS"
  | "LEARNING_LOSS"
  | "NOTES"
  | "CASES"
  | "GAMIFICATION"
  | "TRANSPORT"
  | "EVALUATIONS"
  | "MY_EVALUATIONS"
  | "MESSAGES"
  | "ACTIVITIES";

export type StaffHomeSummaryCard = {
  key: string;
  title: string;
  value: number;
  href?: string;
  description?: string;
};

export type StaffHomeQuickAction = {
  key: string;
  title: string;
  description?: string;
  href: string;
  moduleKey: StaffHomeVisibleModule;
};

export type StaffHomeWorkScope = {
  id: string;
  type: "CLASS" | "ROUTE" | "STAFF" | "CUSTOM";
  title: string;
  subtitle?: string;
  href?: string;
};

export type StaffHomeAlert = {
  key: string;
  title: string;
  description: string;
  severity: "INFO" | "WARNING" | "CRITICAL";
  href?: string;
};

export type StaffHomeResult = {
  visibleModules: StaffHomeVisibleModule[];
  summaryCards: StaffHomeSummaryCard[];
  quickActions: StaffHomeQuickAction[];
  todayTasks: StaffTask[];
  draftTasks: StaffTask[];
  overdueTasks: StaffTask[];
  workScopes: StaffHomeWorkScope[];
  alerts: StaffHomeAlert[];
};

function uniqueStrings(items: string[]): string[] {
  return Array.from(new Set(items));
}

function uniqueTasks(tasks: StaffTask[]): StaffTask[] {
  const map = new Map<string, StaffTask>();

  for (const task of tasks) {
    map.set(task.id, task);
  }

  return Array.from(map.values());
}

function resolveModulesFromAssignments(
  assignments: OperationalAssignment[],
): StaffHomeVisibleModule[] {
  const modules: StaffHomeVisibleModule[] = ["HOME"];

  for (const assignment of assignments) {
    switch (assignment.operationKind) {
      case "STUDENT_ATTENDANCE":
        modules.push("ATTENDANCE", "CLASSES", "STUDENTS");
        break;

      case "STUDENT_MEASUREMENT":
      case "STUDENT_TRACKER":
      case "KG_VALUES_EVALUATION":
      case "KG_CORNERS_EVALUATION":
      case "KG_QURAN_TRACKER":
        modules.push("MEASUREMENTS", "CLASSES", "STUDENTS");
        break;

      case "LEARNING_LOSS_FOLLOWUP":
        modules.push("LEARNING_LOSS", "STUDENTS");
        break;

      case "STUDENT_NOTES":
        modules.push("NOTES", "STUDENTS");
        break;

      case "STUDENT_CASE_REFERRAL":
      case "STUDENT_CASE_HANDLING":
        modules.push("CASES", "STUDENTS");
        break;

      case "STUDENT_GAMIFICATION":
        modules.push("GAMIFICATION", "STUDENTS");
        break;

      case "STUDENT_ACTIVITY_MANAGEMENT":
        modules.push("ACTIVITIES", "STUDENTS");
        break;

      case "TRANSPORT_ATTENDANCE":
        modules.push("TRANSPORT");
        break;

      case "STAFF_EVALUATION":
      case "STAFF_OBSERVATION":
        modules.push("EVALUATIONS");
        break;

      default:
        break;
    }
  }

  return uniqueStrings(modules) as StaffHomeVisibleModule[];
}

function isActiveAssignment(assignment: OperationalAssignment, nowMs: number) {
  if (assignment.isActive === false) return false;
  if (assignment.status === "ENDED") return false;
  if (assignment.status === "SUSPENDED") return false;

  if (typeof assignment.startAt === "number" && assignment.startAt > nowMs) {
    return false;
  }

  if (typeof assignment.endAt === "number" && assignment.endAt < nowMs) {
    return false;
  }

  return true;
}

function resolveActionHrefFromAssignment(
  assignment: OperationalAssignment,
): string {

  if (assignment.operationKind === "STUDENT_ACTIVITY_MANAGEMENT") {
    return "/staff/activities";
  }

  if (assignment.operationKind === "TRANSPORT_ATTENDANCE") {
    return assignment.scopeId
      ? `/staff/transport/routes/${assignment.scopeId}`
      : "/staff/transport";
  }

  if (assignment.operationKind === "STAFF_EVALUATION") {
    return "/staff/evaluations";
  }

  if (assignment.scopeType === "CLASS" && assignment.scopeId) {
    return `/staff/classes/${assignment.scopeId}`;
  }

  if (assignment.operationKind === "STUDENT_ATTENDANCE") {
    return "/staff/tasks";
  }

  if (
    assignment.operationKind === "STUDENT_MEASUREMENT" ||
    assignment.operationKind === "STUDENT_TRACKER" ||
    assignment.operationKind === "KG_VALUES_EVALUATION" ||
    assignment.operationKind === "KG_CORNERS_EVALUATION" ||
    assignment.operationKind === "KG_QURAN_TRACKER"
  ) {
    return "/staff/classes";
  }

  if (
    assignment.operationKind === "STUDENT_CASE_REFERRAL" ||
    assignment.operationKind === "STUDENT_CASE_HANDLING"
  ) {
    return "/staff/cases";
  }

  if (assignment.operationKind === "STUDENT_GAMIFICATION") {
    return "/staff/gamification";
  }

  return "/staff/tasks";
}

function buildTasksFromAssignments(params: {
  assignments: OperationalAssignment[];
  nowMs: number;
}): StaffTask[] {
  return params.assignments.map((assignment) => {
    return buildStaffTaskFromAssignment({
      id: `assignment-task-${assignment.id}`,
      assignment,
      taskTitle: assignment.title,
      taskDescription: assignment.description,
      status: "PENDING",
      priority:
        assignment.operationKind === "STUDENT_ATTENDANCE" ||
        assignment.operationKind === "TRANSPORT_ATTENDANCE" ||
        assignment.operationKind === "STUDENT_CASE_HANDLING"
          ? "HIGH"
          : "NORMAL",
      actionLabel: "فتح",
      actionHref: resolveActionHrefFromAssignment(assignment),
      createdAt: params.nowMs,
      updatedAt: params.nowMs,
    });
  });
}

function buildClassTask(params: {
  id: string;
  orgId: string;
  actorPersonId: string;
  classItem: Class;
  taskKind: StaffTask["taskKind"];
  taskTitle: string;
  taskDescription: string;
  termContext?: TermContextInput;
  priority?: StaffTask["priority"];
  actionLabel: string;
  actionHref: string;
  nowMs: number;
}): StaffTask {
  return {
    id: params.id,
    orgId: params.orgId,
    ...resolveTermContext(params.termContext),
    actorPersonId: params.actorPersonId,
    actorRoleKey: undefined,

    taskKind: params.taskKind,
    taskTitle: params.taskTitle,
    taskDescription: params.taskDescription,

    scopeType: "CLASS",
    scopeId: params.classItem.id,
    scopeLabel: params.classItem.title,

    targetKind: "CLASS",
    targetId: params.classItem.id,
    targetLabel: params.classItem.title,

    status: "PENDING",
    priority: params.priority ?? "NORMAL",

    dueAt: undefined,
    availableFrom: undefined,
    availableUntil: undefined,

    sourceType: "CUSTOM",
    sourceId: params.classItem.id,
    sourcePath: "",

    actionLabel: params.actionLabel,
    actionHref: params.actionHref,

    isArchived: false,

    createdAt: params.nowMs,
    updatedAt: params.nowMs,
  };
}

function buildTasksFromVisibleClasses(params: {
  orgId: string;
  actorPersonId: string;
  visibleClasses: Class[];
  visibleModules: StaffHomeVisibleModule[];
  nowMs: number;
}): StaffTask[] {
  const modules = new Set(params.visibleModules);
  const tasks: StaffTask[] = [];

  for (const classItem of params.visibleClasses) {
    const classTitle = classItem.title;

    if (modules.has("ATTENDANCE")) {
      tasks.push(
        buildClassTask({
          id: `class-attendance-${classItem.id}`,
          orgId: params.orgId,
          actorPersonId: params.actorPersonId,
          classItem,
          taskKind: "STUDENT_ATTENDANCE",
          taskTitle: `تسجيل حضور ${classTitle}`,
          taskDescription: "مهمة حضور مبدئية للفصل حسب الصلاحيات المتاحة.",
          priority: "HIGH",
          actionLabel: "فتح الحضور",
          actionHref: "/staff/classes",
          nowMs: params.nowMs,
        }),
      );
    }

    if (modules.has("MEASUREMENTS")) {
      tasks.push(
        buildClassTask({
          id: `class-measurements-${classItem.id}`,
          orgId: params.orgId,
          actorPersonId: params.actorPersonId,
          classItem,
          taskKind: "STUDENT_MEASUREMENT",
          taskTitle: `قياسات ومتابعات ${classTitle}`,
          taskDescription: "مهمة قياسات ومتابعات مبدئية للفصل.",
          priority: "NORMAL",
          actionLabel: "فتح القياسات",
          actionHref: "/staff/classes",
          nowMs: params.nowMs,
        }),
      );
    }

    if (modules.has("LEARNING_LOSS")) {
      tasks.push(
        buildClassTask({
          id: `class-learning-loss-${classItem.id}`,
          orgId: params.orgId,
          actorPersonId: params.actorPersonId,
          classItem,
          taskKind: "LEARNING_LOSS_FOLLOWUP",
          taskTitle: `متابعة فاقد ${classTitle}`,
          taskDescription: "متابعة خطط الفاقد التعليمي المرتبطة بالفصل.",
          priority: "NORMAL",
          actionLabel: "فتح الفاقد",
          actionHref: "/staff/classes",
          nowMs: params.nowMs,
        }),
      );
    }

    if (modules.has("NOTES")) {
      tasks.push(
        buildClassTask({
          id: `class-notes-${classItem.id}`,
          orgId: params.orgId,
          actorPersonId: params.actorPersonId,
          classItem,
          taskKind: "STUDENT_NOTES",
          taskTitle: `ملاحظات ${classTitle}`,
          taskDescription: "إضافة أو مراجعة ملاحظات الطلاب داخل الفصل.",
          priority: "LOW",
          actionLabel: "فتح الملاحظات",
          actionHref: "/staff/classes",
          nowMs: params.nowMs,
        }),
      );
    }

    if (modules.has("CASES")) {
      tasks.push(
        buildClassTask({
          id: `class-cases-${classItem.id}`,
          orgId: params.orgId,
          actorPersonId: params.actorPersonId,
          classItem,
          taskKind: "STUDENT_CASE_REFERRAL",
          taskTitle: `قضايا وإحالات ${classTitle}`,
          taskDescription: "إنشاء أو متابعة إحالات الطلاب حسب الصلاحية.",
          priority: "NORMAL",
          actionLabel: "فتح القضايا",
          actionHref: "/staff/classes",
          nowMs: params.nowMs,
        }),
      );
    }

    if (modules.has("GAMIFICATION")) {
      tasks.push(
        buildClassTask({
          id: `class-gamification-${classItem.id}`,
          orgId: params.orgId,
          actorPersonId: params.actorPersonId,
          classItem,
          taskKind: "STUDENT_GAMIFICATION",
          taskTitle: `تحفيز طلاب ${classTitle}`,
          taskDescription: "إضافة نقاط أو شارات أو ملاحظات إيجابية للطلاب.",
          priority: "LOW",
          actionLabel: "فتح التحفيز",
          actionHref: "/staff/classes",
          nowMs: params.nowMs,
        }),
      );
    }
  }

  return tasks;
}

function buildQuickActions(params: {
  visibleModules: StaffHomeVisibleModule[];
  visibleClassesCount: number;
  todayTasksCount: number;
}): StaffHomeQuickAction[] {
  const modules = new Set(params.visibleModules);
  const actions: StaffHomeQuickAction[] = [];

  if (modules.has("CLASSES")) {
    actions.push({
      key: "classes",
      title: "فتح فصولي",
      description: `${params.visibleClassesCount} فصل متاح`,
      href: "/staff/classes",
      moduleKey: "CLASSES",
    });
  }

  actions.push({
    key: "tasks",
    title: "فتح مهامي",
    description: `${params.todayTasksCount} مهمة مفتوحة`,
    href: "/staff/tasks",
    moduleKey: "HOME",
  });

  if (modules.has("ATTENDANCE")) {
    actions.push({
      key: "attendance",
      title: "تسجيل الحضور",
      description: "فتح مهام الحضور اليومي",
      href: "/staff/tasks",
      moduleKey: "ATTENDANCE",
    });
  }

  if (modules.has("MEASUREMENTS")) {
    actions.push({
      key: "measurements",
      title: "القياسات والمتابعات",
      description: "فتح الفصول لإدخال القياسات",
      href: "/staff/classes",
      moduleKey: "MEASUREMENTS",
    });
  }

  if (modules.has("EVALUATIONS")) {
    actions.push({
      key: "evaluations",
      title: "فتح تقييماتي",
      description: "التقييمات والزيارات المطلوبة",
      href: "/staff/evaluations",
      moduleKey: "EVALUATIONS",
    });
  }

  if (modules.has("CASES")) {
    actions.push({
      key: "cases",
      title: "القضايا والإحالات",
      description: "متابعة القضايا أو إنشاء إحالات",
      href: "/staff/cases",
      moduleKey: "CASES",
    });
  }


  if (modules.has("ACTIVITIES")) {
    actions.push({
      key: "activities",
      title: "الأنشطة",
      description: "إدارة الأنشطة والمسابقات",
      href: "/staff/activities",
      moduleKey: "ACTIVITIES",
    });
  }

  if (modules.has("TRANSPORT")) {
    actions.push({
      key: "transport",
      title: "النقل والباص",
      description: "فتح خطوط النقل",
      href: "/staff/transport",
      moduleKey: "TRANSPORT",
    });
  }

  return actions.slice(0, 6);
}

function buildAlerts(params: {
  activeAssignmentsCount: number;
  visibleClassesCount: number;
  visibleModules: StaffHomeVisibleModule[];
  todayTasksCount: number;
}): StaffHomeAlert[] {
  const alerts: StaffHomeAlert[] = [];

  if (params.activeAssignmentsCount === 0) {
    alerts.push({
      key: "no-operational-assignments",
      title: "لا توجد إسنادات تشغيلية مباشرة",
      description:
        "يتم عرض الوحدات الحالية بناءً على الدور والصلاحيات العامة. لاحقًا يمكن إضافة OperationalAssignment لتوليد مهام دقيقة.",
      severity: "INFO",
      href: "/staff/tasks",
    });
  }

  if (
    params.visibleClassesCount === 0 &&
    params.visibleModules.includes("CLASSES")
  ) {
    alerts.push({
      key: "no-visible-classes",
      title: "لا توجد فصول مرئية",
      description:
        "الوحدة ظاهرة، لكن لا توجد فصول متاحة لهذا المستخدم حسب الصلاحيات والإسنادات.",
      severity: "WARNING",
      href: "/staff/classes",
    });
  }

  if (params.todayTasksCount === 0) {
    alerts.push({
      key: "no-tasks",
      title: "لا توجد مهام مفتوحة",
      description:
        "ستظهر المهام عند إنشاء إسنادات تشغيلية أو دفعات أو تقييمات مرتبطة بالمستخدم.",
      severity: "INFO",
      href: "/staff/tasks",
    });
  }

  return alerts;
}

export function buildStaffHome(params: {
  context: ActorAccessContext;
  classes?: Class[];
  memberships?: Membership[];
  operationalAssignments?: OperationalAssignment[];
  teacherAssignments?: TeacherAssignment[];
  existingTasks?: StaffTask[];
  visibleModulesOverride?: StaffHomeVisibleModule[];
  nowMs?: number;
}): StaffHomeResult {
  const nowMs = params.nowMs ?? Date.now();

  const operationalAssignments =
    params.operationalAssignments ??
    params.context.operationalAssignments ??
    [];

  const activeAssignments = operationalAssignments.filter((assignment) => {
    return (
      assignment.actorPersonId === params.context.actorPersonId &&
      isActiveAssignment(assignment, nowMs)
    );
  });

  const visibleClasses = getVisibleClassesForActor({
    context: {
      ...params.context,
      memberships: params.memberships ?? params.context.memberships,
      operationalAssignments,
      teacherAssignments:
        params.teacherAssignments ?? params.context.teacherAssignments,
    },
    classes: params.classes ?? [],
    nowMs,
  });

  const modulesFromAssignments =
    resolveModulesFromAssignments(activeAssignments);

  const rawVisibleModules: StaffHomeVisibleModule[] = [
  "MY_EVALUATIONS",
  ...modulesFromAssignments,
  ...(params.visibleModulesOverride ?? []),
];

  if (visibleClasses.length > 0) {
    rawVisibleModules.push("CLASSES", "STUDENTS");
  }

  const normalizedVisibleModules = uniqueStrings(
    rawVisibleModules,
  ) as StaffHomeVisibleModule[];

  const assignmentTasks = buildTasksFromAssignments({
    assignments: activeAssignments,
    nowMs,
  });

  const classTasks = buildTasksFromVisibleClasses({
    orgId: params.context.orgId,
    actorPersonId: params.context.actorPersonId,
    visibleClasses,
    visibleModules: normalizedVisibleModules,
    nowMs,
  });

  const allTasks = uniqueTasks([
    ...assignmentTasks,
    ...classTasks,
    ...(params.existingTasks ?? []),
  ]);

  const todayTasks = allTasks.filter((task) => {
    return task.status !== "COMPLETED" && task.status !== "CANCELLED";
  });

  const draftTasks = allTasks.filter((task) => task.status === "DRAFT");

  const overdueTasks = allTasks.filter((task) => {
    if (task.status === "COMPLETED" || task.status === "CANCELLED") {
      return false;
    }

    return typeof task.dueAt === "number" && task.dueAt < nowMs;
  });

  const workScopes: StaffHomeWorkScope[] = visibleClasses.map((classItem) => ({
    id: classItem.id,
    type: "CLASS",
    title: classItem.title,
    subtitle: classItem.gradeId ?? "",
    href: `/staff/classes/${classItem.id}`,
  }));

  const summaryCards: StaffHomeSummaryCard[] = [
    {
      key: "todayTasks",
      title: "مهام مفتوحة",
      value: todayTasks.length,
      href: "/staff/tasks",
      description: "المهام غير المكتملة",
    },
    {
      key: "draftTasks",
      title: "المسودات",
      value: draftTasks.length,
      href: "/staff/tasks?status=DRAFT",
      description: "مهام محفوظة كمسودة",
    },
    {
      key: "overdueTasks",
      title: "المتأخر",
      value: overdueTasks.length,
      href: "/staff/tasks?status=OVERDUE",
      description: "مهام تجاوزت موعدها",
    },
    {
      key: "classes",
      title: "فصولي",
      value: visibleClasses.length,
      href: "/staff/classes",
      description: "الفصول المتاحة",
    },
    {
      key: "modules",
      title: "الوحدات",
      value: normalizedVisibleModules.length,
      href: "/staff",
      description: "وحدات ظاهرة للمستخدم",
    },
  ];

  const quickActions = buildQuickActions({
    visibleModules: normalizedVisibleModules,
    visibleClassesCount: visibleClasses.length,
    todayTasksCount: todayTasks.length,
  });

  const alerts = buildAlerts({
    activeAssignmentsCount: activeAssignments.length,
    visibleClassesCount: visibleClasses.length,
    visibleModules: normalizedVisibleModules,
    todayTasksCount: todayTasks.length,
  });

  return {
    visibleModules: normalizedVisibleModules,
    summaryCards,
    quickActions,
    todayTasks,
    draftTasks,
    overdueTasks,
    workScopes,
    alerts,
  };
}
