import type { ComponentType } from "react";
import type { StaffHomeVisibleModule } from "@takween/domain";
import {
  Bus,
  CalendarDays,
  ClipboardList,
  FileText,
  GraduationCap,
  LayoutDashboard,
  MessageSquare,
  NotebookPen,
  Ruler,
  School,
  Star,
  TrendingDown,
  TrendingUp,
  UserCheck,
  Users,
  UsersRound,
} from "lucide-react";

import type { StaffActorData } from "@/lib/staff-actor";
import { canAccessWorkDocumentation } from "@/lib/work-documentation";
import {
  canManagePdfResources,
  isTeacherPdfResourceActor,
} from "@/lib/pdf-resources";
import {
  canReviewTeacherPortfolios,
  canUseMyStaffPortfolio,
} from "@/lib/staff-portfolio";
import { canAccessPerformanceImprovement } from "@/lib/performance-improvement-access";
import { getLessonPrepReviewSchoolIds } from "@/lib/lesson-prep-review-policy";
import { canAccessTeacherWork } from "@/lib/teacher-work-access";

export type StaffNavItem = {
  href: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  moduleKey?: StaffHomeVisibleModule | "TASKS";
  documentationOnly?: boolean;
  pdfDocuments?: "MY_DOCUMENTS" | "MANAGE";
  teachingResources?: boolean;
  staffPortfolio?: "MY" | "REVIEW";
  performanceImprovement?: boolean;
  lessonPrepApprovals?: boolean;
  teacherWork?: boolean;
};

export const staffNavItems: StaffNavItem[] = [
  {
    href: "/staff",
    label: "الرئيسية",
    icon: LayoutDashboard,
    moduleKey: "HOME",
  },
  {
    href: "/staff/classes",
    label: "الفصول",
    icon: School,
    moduleKey: "CLASSES",
  },
  {
    href: "/staff/my-documents",
    label: "مهام وظيفتي",
    icon: FileText,
    pdfDocuments: "MY_DOCUMENTS",
  },
  {
    href: "/staff/tasks",
    label: "مهامي",
    icon: ClipboardList,
    moduleKey: "TASKS",
  },
  {
    href: "/staff/lesson-prep/approvals",
    label: "اعتماد التحاضير",
    icon: ClipboardList,
    lessonPrepApprovals: true,
  },
  {
    href: "/staff/teaching-resources",
    label: "المصادر التعليمية",
    icon: FileText,
    teachingResources: true,
  },
  {
    href: "/staff/my-portfolio",
    label: "ملف إنجازي",
    icon: FileText,
    staffPortfolio: "MY",
  },
  {
    href: "/staff/teacher-portfolio",
    label: "إنجازات المعلمين",
    icon: FileText,
    staffPortfolio: "REVIEW",
  },
  {
    href: "/staff/teacher-work",
    label: "متابعة أعمال المعلمين",
    icon: UsersRound,
    teacherWork: true,
  },
  {
    href: "/staff/documents/manage",
    label: "إدارة المستندات",
    icon: FileText,
    pdfDocuments: "MANAGE",
  },
  {
    href: "/staff/work-documentation",
    label: "توثيق العمل",
    icon: NotebookPen,
    documentationOnly: true,
  },
  {
    href: "/staff/students",
    label: "الطلاب",
    icon: Users,
    moduleKey: "STUDENTS",
  },
  {
    href: "/staff/measurements",
    label: "القياسات",
    icon: Ruler,
    moduleKey: "MEASUREMENTS",
  },
  {
    href: "/staff/learning-loss",
    label: "الفاقد التعليمي",
    icon: TrendingDown,
    moduleKey: "LEARNING_LOSS",
  },
  {
    href: "/staff/attendance",
    label: "الحضور",
    icon: UserCheck,
    moduleKey: "ATTENDANCE",
  },
  {
    href: "/staff/cases",
    label: "إحالات الطلاب",
    icon: FileText,
    moduleKey: "CASES",
  },
  {
    href: "/staff/gamification",
    label: "التحفيز",
    icon: Star,
    moduleKey: "GAMIFICATION",
  },
  {
    href: "/staff/transport",
    label: "النقل",
    icon: Bus,
    moduleKey: "TRANSPORT",
  },
  {
    href: "/staff/evaluations",
    label: "تقييم الموظفين",
    icon: GraduationCap,
    moduleKey: "EVALUATIONS",
  },
  {
    href: "/staff/my-evaluations",
    label: "تقييماتي",
    icon: GraduationCap,
    moduleKey: "MY_EVALUATIONS",
  },
  {
    href: "/staff/performance-improvement",
    label: "خطط تحسين الأداء",
    icon: TrendingUp,
    moduleKey: "MY_EVALUATIONS",
    performanceImprovement: true,
  },
  {
    href: "/staff/messages",
    label: "المحادثات",
    icon: MessageSquare,
    moduleKey: "MESSAGES",
  },
  {
    href: "/staff/activities",
    label: "الأنشطة",
    icon: CalendarDays,
    moduleKey: "ACTIVITIES",
  },
  {
    href: "/staff/guardian-services",
    label: "خدمات ولي الأمر",
    icon: UsersRound,
    moduleKey: "GUARDIAN_SERVICES",
  },
];

export type StaffNavigationAccess = {
  visibleModuleSet: Set<StaffHomeVisibleModule | "TASKS">;
  canAccessDocumentation: boolean;
  canManageDocuments: boolean;
  canAccessTeachingResources: boolean;
  canAccessMyPortfolio: boolean;
  canAccessTeacherPortfolio: boolean;
  canAccessPerformanceImprovement: boolean;
  canAccessLessonPrepApprovals: boolean;
  canAccessTeacherWork: boolean;
};

export function getStaffNavigationAccess(
  actor: StaffActorData,
): StaffNavigationAccess {
  return {
    visibleModuleSet: new Set(actor.visibleModules),
    canAccessDocumentation: canAccessWorkDocumentation(actor.roles),
    canManageDocuments: canManagePdfResources(actor.roles),
    canAccessTeachingResources: isTeacherPdfResourceActor(actor),
    canAccessMyPortfolio: canUseMyStaffPortfolio(actor),
    canAccessTeacherPortfolio: canReviewTeacherPortfolios(actor),
    canAccessPerformanceImprovement: canAccessPerformanceImprovement(actor),
    canAccessLessonPrepApprovals:
      getLessonPrepReviewSchoolIds({ personId: actor.personId }).length > 0,
    canAccessTeacherWork: canAccessTeacherWork(actor),
  };
}

export function getRequiredModuleForStaffPath(
  pathname: string,
): StaffHomeVisibleModule | "TASKS" | null {
  const matchedItem = staffNavItems
    .filter((item) => item.href !== "/staff")
    .sort((a, b) => b.href.length - a.href.length)
    .find(
      (item) => pathname === item.href || pathname.startsWith(`${item.href}/`),
    );

  return matchedItem?.moduleKey ?? null;
}

export function getVisibleStaffNavItems(
  access: StaffNavigationAccess,
): StaffNavItem[] {
  const hiddenFromAsideModuleKeys = new Set<StaffHomeVisibleModule | "TASKS">([
    "GAMIFICATION",
  ]);

  return staffNavItems.filter((item) => {
    if (item.teacherWork) return access.canAccessTeacherWork;

    if (item.lessonPrepApprovals) return access.canAccessLessonPrepApprovals;

    if (item.performanceImprovement) {
      return access.canAccessPerformanceImprovement;
    }

    if (item.documentationOnly) return access.canAccessDocumentation;

    if (item.pdfDocuments === "MY_DOCUMENTS") return true;
    if (item.pdfDocuments === "MANAGE") return access.canManageDocuments;
    if (item.teachingResources) return access.canAccessTeachingResources;
    if (item.staffPortfolio === "MY") return access.canAccessMyPortfolio;
    if (item.staffPortfolio === "REVIEW") {
      return access.canAccessTeacherPortfolio;
    }

    return (
      !!item.moduleKey &&
      access.visibleModuleSet.has(item.moduleKey) &&
      !hiddenFromAsideModuleKeys.has(item.moduleKey)
    );
  });
}
