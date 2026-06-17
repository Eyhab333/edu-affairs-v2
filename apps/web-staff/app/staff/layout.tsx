"use client";

import { ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { StaffHomeVisibleModule } from "@takween/domain";
import {
  Building2,
  Bus,
  ClipboardList,
  FileText,
  GraduationCap,
  LayoutDashboard,
  LogOut,
  School,
  Star,
  Users,
  MessageSquare,
} from "lucide-react";
import { signOut } from "firebase/auth";

import {
  StaffActorProvider,
  useStaffActor,
} from "@/components/staff/staff-actor-provider";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { auth } from "@/lib/firebase";
import {
  getStaffActorDisplayName,
  getStaffActorPrimaryRole,
} from "@/lib/staff-actor";

import {
  getStaffActorStats,
  getStaffOrgDisplayName,
} from "@/lib/staff-actor-helpers";
import { WebStaffNotificationBootstrap } from "@/components/notifications/web-staff-notification-bootstrap";
import { WebStaffNotificationButton } from "@/components/notifications/web-staff-notification-button";

const navItems: Array<{
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  moduleKey: StaffHomeVisibleModule | "TASKS";
}> = [
  {
    href: "/staff",
    label: "الرئيسية",
    icon: LayoutDashboard,
    moduleKey: "HOME",
  },
  {
    href: "/staff/classes",
    label: "فصولي",
    icon: School,
    moduleKey: "CLASSES",
  },
  {
    href: "/staff/tasks",
    label: "مهامي",
    icon: ClipboardList,
    moduleKey: "TASKS",
  },

  {
    href: "/staff/students",
    label: "طلابي",
    icon: Users,
    moduleKey: "STUDENTS",
  },

  {
    href: "/staff/measurements",
    label: "القياسات",
    icon: Users,
    moduleKey: "MEASUREMENTS",
  },
  {
    href: "/staff/learning-loss",
    label: "الفاقد التعليمي",
    icon: Users,
    moduleKey: "LEARNING_LOSS",
  },

  {
    href: "/staff/attendance",
    label: "الحضور",
    icon: Users,
    moduleKey: "ATTENDANCE",
  },
  {
    href: "/staff/cases",
    label: "القضايا",
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
    label: "تقييماتي",
    icon: GraduationCap,
    moduleKey: "EVALUATIONS",
  },
  {
    href: "/staff/my-evaluations",
    label: "التقييمات",
    icon: GraduationCap,
    moduleKey: "MY_EVALUATIONS",
  },
  {
    href: "/staff/messages",
    label: "رسائل",
    icon: MessageSquare,
    moduleKey: "MESSAGES",
  },
];

function isActiveHref(pathname: string, href: string) {
  if (href === "/staff") return pathname === "/staff";
  return pathname === href || pathname.startsWith(`${href}/`);
}

function StaffShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { actor } = useStaffActor();

  const orgName = getStaffOrgDisplayName(actor);
  const actorName = getStaffActorDisplayName(actor);
  const actorRole = getStaffActorPrimaryRole(actor);
  const stats = getStaffActorStats(actor);

  const visibleModuleSet = new Set<StaffHomeVisibleModule | "TASKS">([
    ...actor.visibleModules,
    "TASKS",
  ]);

  const visibleNavItems = navItems.filter((item) =>
    visibleModuleSet.has(item.moduleKey),
  );

  async function handleLogout() {
    await signOut(auth);
    router.replace("/login");
  }

  function handleChangeOrg() {
    router.push("/select-org");
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <WebStaffNotificationBootstrap />

      <header className="sticky top-0 z-20 border-b border-border bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
              <LayoutDashboard className="size-5" />
            </div>

            <div>
              <p className="text-sm font-semibold text-foreground">
                بوابة الموظفين
              </p>
              <p className="text-xs text-muted-foreground">
                {actorName}
                {actorRole ? ` · ${actorRole}` : ""}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={handleChangeOrg}
              className="hidden md:inline-flex"
            >
              <Building2 className="size-4 text-primary" />
              <span>{orgName}</span>
            </Button>

            <WebStaffNotificationButton />

            <ThemeToggle />

            <Button type="button" variant="outline" onClick={handleLogout}>
              <LogOut className="size-4" />
              <span className="hidden sm:inline">خروج</span>
            </Button>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-7xl grid-cols-1 gap-4 px-4 py-4 md:grid-cols-[240px_1fr]">
        <aside className="hidden rounded-2xl border border-border bg-card p-3 shadow-sm md:block">
          <div className="px-3 py-2">
            <p className="text-xs font-medium text-muted-foreground">
              المؤسسة الحالية
            </p>
            <p className="mt-1 line-clamp-2 text-sm font-semibold">{orgName}</p>

            <div className="mt-2 space-y-1 text-xs text-muted-foreground">
              <p>المدارس: {stats.schoolsCount}</p>
              <p>الفصول المرئية: {stats.visibleClassesCount}</p>
              <p>الوحدات: {stats.visibleModulesCount}</p>
            </div>

            {process.env.NODE_ENV === "development" ? (
              <p className="mt-2 break-all text-[11px] text-muted-foreground/70">
                personId: {actor.personId || "غير مربوط"}
              </p>
            ) : null}
          </div>

          <Separator className="my-3" />

          <nav className="space-y-1">
            {visibleNavItems.map((item) => {
              const Icon = item.icon;
              const active = isActiveHref(pathname, item.href);

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-2 rounded-xl px-3 py-2 text-sm transition",
                    active
                      ? "bg-accent font-medium text-accent-foreground"
                      : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                  )}
                >
                  <Icon className="size-4" />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </aside>

        <main>{children}</main>
      </div>
    </div>
  );
}

export default function StaffLayout({ children }: { children: ReactNode }) {
  return (
    <StaffActorProvider>
      <StaffShell>{children}</StaffShell>
    </StaffActorProvider>
  );
}
