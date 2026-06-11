"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";
import {
  Building2,
  ChevronLeft,
  LayoutDashboard,
  Menu,
  Moon,
  Sun,
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

type PlatformShellProps = {
  children: React.ReactNode;
  breadcrumbs?: React.ReactNode;
  topbarActions?: React.ReactNode;
};

const navItems = [
  {
    title: "المؤسسات",
    href: "/orgs",
    icon: LayoutDashboard,
  },
];

function isItemActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const isDark = theme === "dark";

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

function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();

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

export default function PlatformShell({
  children,
  breadcrumbs,
  topbarActions,
}: PlatformShellProps) {
  const pathname = usePathname();
  const currentItem =
    navItems.find((item) => isItemActive(pathname, item.href)) ?? navItems[0];

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="grid min-h-screen lg:grid-cols-[280px_1fr]">
        <aside className="hidden border-l bg-card lg:block">
          <div className="sticky top-0 flex h-screen flex-col">
            <div className="flex items-center justify-between px-5 py-4">
              <div>
                <p className="text-lg font-bold">منصة تكوين</p>
                <p className="text-xs text-muted-foreground">إدارة المؤسسات</p>
              </div>
              <ThemeToggle />
            </div>

            <Separator />

            <div className="flex-1 px-3 py-4">
              <SidebarNav />
            </div>

            <Separator />

            <div className="px-4 py-4">
              <div className="rounded-2xl border bg-muted/30 p-4">
                <div className="flex items-center gap-2">
                  <div className="rounded-xl bg-primary/10 p-2 text-primary">
                    <Building2 className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold">مستوى المنصة</p>
                    <p className="text-xs text-muted-foreground">
                      إنشاء المؤسسات وإدارتها
                    </p>
                  </div>
                </div>
              </div>
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
                      <SheetTitle>منصة تكوين</SheetTitle>
                    </SheetHeader>

                    <Separator />

                    <div className="px-3 py-4">
                      <SidebarNav />
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
                    <p className="text-xs text-muted-foreground">
                      إدارة المؤسسات على مستوى المنصة
                    </p>
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