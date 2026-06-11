"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";
import {
  CalendarRange,
  ChevronLeft,
  ClipboardCheck,
  GraduationCap,
  LayoutDashboard,
  Loader2,
  Menu,
  Moon,
  School,
  Sun,
   PersonStandingIcon as Person,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { getOrgDisplayName, useOrgSummary } from "@/hooks/use-org-summary";

type OrgShellProps = {
  children: React.ReactNode;
  orgId: string;
  breadcrumbs?: React.ReactNode;
  topbarActions?: React.ReactNode;
};

function buildNavItems(orgId: string) {
  return [
    {
      title: "الرئيسية",
      href: `/orgs/${orgId}`,
      icon: LayoutDashboard,
    },
    {
      title: "المدارس",
      href: `/orgs/${orgId}/schools`,
      icon: School,
    },
    {
      title: "الأشخاص",
      href: `/orgs/${orgId}/people`,
      icon: Person,
    },
    {
      title: "تقييمات المعلمين",
      href: `/orgs/${orgId}/evaluations`,
      icon: ClipboardCheck,
    },
    {
      title: "الطلاب",
      href: `/orgs/${orgId}/students`,
      icon: GraduationCap,
    },
    {
      title: "أولياء الأمور",
      href: `/orgs/${orgId}/guardians`,
      icon: GraduationCap,
    },
    
  ];
}

function isItemActive(pathname: string, href: string) {
  const cleanPathname = pathname.replace(/\/$/, "");
  const cleanHref = href.replace(/\/$/, "");

  // حتى لا تظل "الرئيسية" مفعّلة داخل كل صفحات المنظمة
  if (/^\/orgs\/[^/]+$/.test(cleanHref)) {
    return cleanPathname === cleanHref;
  }

  return cleanPathname === cleanHref || cleanPathname.startsWith(`${cleanHref}/`);
}

function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <Button
        variant="outline"
        size="icon"
        aria-label="تبديل المظهر"
        disabled
      >
        <span className="block h-5 w-5" />
      </Button>
    );
  }

  const isDark = resolvedTheme === "dark";

  return (
    <Button
      variant="outline"
      size="icon"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      aria-label="تبديل المظهر"
    >
      {isDark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
    </Button>
  );
}

function SidebarNav({
  orgId,
  onNavigate,
}: {
  orgId: string;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const navItems = buildNavItems(orgId);

  return (
    <nav className="grid gap-1">
      {navItems.map((item) => {
        const Icon = item.icon;
        const active = isItemActive(pathname, item.href);

        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={cn(
              "flex items-center justify-between rounded-xl px-3 py-2.5 text-sm transition-colors",
              active
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
          >
            <span className="flex items-center gap-2">
              <Icon className="h-4 w-4 shrink-0" />
              <span>{item.title}</span>
            </span>

            <ChevronLeft className="h-4 w-4 opacity-70" />
          </Link>
        );
      })}
    </nav>
  );
}

export default function OrgShell({
  children,
  orgId,
  breadcrumbs,
  topbarActions,
}: OrgShellProps) {
  const pathname = usePathname();
  const navItems = buildNavItems(orgId);

  const currentItem =
    navItems.find((item) => isItemActive(pathname, item.href)) ?? navItems[0];

  const { data: org, loading } = useOrgSummary(orgId, true);
  const orgDisplayName = getOrgDisplayName(org, orgId);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="grid min-h-screen lg:grid-cols-[280px_1fr]">
        <aside className="hidden border-l bg-card lg:block">
          <div className="sticky top-0 flex h-screen flex-col">
            <div className="flex items-center justify-between px-5 py-4">
              <div className="min-w-0">
                <p className="truncate text-lg font-bold">الشؤون التعليمية</p>
                <p className="truncate text-xs text-muted-foreground">
                  {loading ? "جاري تحميل المؤسسة..." : orgDisplayName}
                </p>
              </div>
              {/* <ThemeToggle /> */}
            </div>

            <Separator />

            <div className="flex-1 px-3 py-4">
              <SidebarNav orgId={orgId} />
            </div>
          </div>
        </aside>

        <div className="min-w-0">
          <header className="sticky top-0 z-30 border-b bg-background/90 backdrop-blur">
            <div className="flex min-h-16 items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:px-8">
              <div className="flex min-w-0 items-center gap-3">
                <Sheet>
                  <SheetTrigger asChild>
                    <Button
                      variant="outline"
                      size="icon"
                      className="lg:hidden"
                      aria-label="فتح القائمة"
                    >
                      <Menu className="h-5 w-5" />
                    </Button>
                  </SheetTrigger>

                  <SheetContent side="right" className="w-[300px] p-0">
                    <SheetHeader className="px-4 py-4 text-right">
                      <SheetTitle>
                        {loading ? "جاري التحميل..." : orgDisplayName}
                      </SheetTitle>
                    </SheetHeader>

                    <Separator />

                    <div className="px-3 py-4">
                      <SidebarNav orgId={orgId} />
                    </div>
                  </SheetContent>
                </Sheet>

                <div className="min-w-0">
                  <h1 className="truncate text-lg font-semibold">
                    {currentItem.title}
                  </h1>

                  {breadcrumbs ? (
                    <div className="mt-1">{breadcrumbs}</div>
                  ) : (
                    <div className="mt-1 flex min-h-5 items-center gap-2 text-xs text-muted-foreground">
                      {loading ? (
                        <>
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          <span>جاري تحميل المؤسسة...</span>
                        </>
                      ) : (
                        <span className="truncate">داخل المؤسسة: {orgDisplayName}</span>
                      )}
                    </div>
                  )}
                </div>
              </div>

              <div className="flex shrink-0 items-center gap-2">
                {topbarActions}
                <ThemeToggle />
              </div>
            </div>
          </header>

          <main className="p-4 sm:p-6 lg:p-8">{children}</main>
        </div>
      </div>
    </div>
  );
}