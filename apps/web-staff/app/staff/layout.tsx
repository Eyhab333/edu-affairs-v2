"use client";

import { ReactNode, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Building2,
  LayoutDashboard,
  LogOut,
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
import {
  getRequiredModuleForStaffPath,
  getStaffNavigationAccess,
  getVisibleStaffNavItems,
} from "@/lib/staff-navigation";
import { getLessonPrepReviewSchoolIds } from "@/lib/lesson-prep-review-policy";
import { loadPersonSupervisionScopes } from "@/lib/person-supervision-scopes";
import type { PersonSupervisionScope } from "@takween/contracts";

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
  const [supervisionScopes, setSupervisionScopes] = useState<
    PersonSupervisionScope[]
  >([]);
  const [scopesLoading, setScopesLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function loadScopes() {
      if (!actor.orgId || !actor.personId) {
        if (!cancelled) {
          setSupervisionScopes([]);
          setScopesLoading(false);
        }
        return;
      }

      setScopesLoading(true);
      try {
        const nextScopes = await loadPersonSupervisionScopes({
          orgId: actor.orgId,
          personId: actor.personId,
        });
        if (!cancelled) setSupervisionScopes(nextScopes);
      } catch {
        if (!cancelled) setSupervisionScopes([]);
      } finally {
        if (!cancelled) setScopesLoading(false);
      }
    }

    void loadScopes();
    return () => {
      cancelled = true;
    };
  }, [actor.orgId, actor.personId]);

  const navigationAccess = getStaffNavigationAccess(actor);
  const {
    visibleModuleSet,
    canAccessDocumentation,
    canManageDocuments,
    canAccessTeachingResources,
    canAccessMyPortfolio,
    canAccessTeacherPortfolio,
    canAccessPerformanceImprovement: canAccessPerformanceImprovementRoute,
    canAccessLessonPrepApprovals: canAccessLegacyLessonPrepApprovals,
    canAccessTeacherWork: canAccessTeacherWorkRoute,
  } = navigationAccess;
  const canAccessLessonPrepApprovals = useMemo(
    () =>
      canAccessLegacyLessonPrepApprovals ||
      getLessonPrepReviewSchoolIds({
        orgId: actor.orgId,
        personId: actor.personId,
        scopes: supervisionScopes,
      }).length > 0,
    [
      actor.orgId,
      actor.personId,
      canAccessLegacyLessonPrepApprovals,
      supervisionScopes,
    ],
  );

  const requiredModule = getRequiredModuleForStaffPath(pathname);
  const isWorkDocumentationRoute =
    pathname === "/staff/work-documentation" ||
    pathname.startsWith("/staff/work-documentation/");
  const isPdfManagementRoute =
    pathname === "/staff/documents/manage" ||
    pathname.startsWith("/staff/documents/manage/");
  const isTeachingResourcesRoute =
    pathname === "/staff/teaching-resources" ||
    pathname.startsWith("/staff/teaching-resources/");
  const isMyPortfolioRoute = pathname === "/staff/my-portfolio" || pathname.startsWith("/staff/my-portfolio/");
  const isTeacherPortfolioRoute = pathname === "/staff/teacher-portfolio" || pathname.startsWith("/staff/teacher-portfolio/");
  const isPerformanceImprovementRoute =
    pathname === "/staff/performance-improvement" ||
    pathname.startsWith("/staff/performance-improvement/");
  const isTeacherWorkRoute =
    pathname === "/staff/teacher-work" || pathname.startsWith("/staff/teacher-work/");
  const isLessonPrepApprovalsRoute =
    pathname === "/staff/lesson-prep/approvals" ||
    pathname.startsWith("/staff/lesson-prep/approvals/");
  const canAccessCurrentRoute =
    isTeacherWorkRoute
      ? canAccessTeacherWorkRoute
      : isLessonPrepApprovalsRoute
      ? scopesLoading || canAccessLessonPrepApprovals
      : isPerformanceImprovementRoute
      ? canAccessPerformanceImprovementRoute
      : isWorkDocumentationRoute
      ? canAccessDocumentation
      : isPdfManagementRoute
        ? canManageDocuments
      : isTeachingResourcesRoute
        ? canAccessTeachingResources
      : isMyPortfolioRoute
        ? canAccessMyPortfolio
      : isTeacherPortfolioRoute
        ? canAccessTeacherPortfolio
      : !requiredModule || visibleModuleSet.has(requiredModule);

  useEffect(() => {
    if (!canAccessCurrentRoute) {
      router.replace("/staff");
    }
  }, [canAccessCurrentRoute, router]);

  const visibleNavItems = getVisibleStaffNavItems({
    ...navigationAccess,
    canAccessLessonPrepApprovals,
  });

  async function handleLogout() {
    await signOut(auth);
    router.replace("/login");
  }

  function handleChangeOrg() {
    router.push("/select-org");
  }

  if (!canAccessCurrentRoute) {
    return null;
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
                مدار
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

      <div className="mx-auto grid max-w-7xl grid-cols-1 gap-4 px-4 py-4 md:grid-cols-[210px_1fr]">
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
