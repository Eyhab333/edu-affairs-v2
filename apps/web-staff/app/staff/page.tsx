"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { useStaffActor } from "@/components/staff/staff-actor-provider";
import { getStaffActorDisplayName } from "@/lib/staff-actor";
import {
  getStaffNavigationAccess,
  getVisibleStaffNavItems,
} from "@/lib/staff-navigation";

export default function StaffHomePage() {
  const { actor } = useStaffActor();
  const actorName = getStaffActorDisplayName(actor);
  const navigationItems = getVisibleStaffNavItems(
    getStaffNavigationAccess(actor),
  ).filter((item) => item.href !== "/staff" && item.href !== "/staff/tasks");

  return (
    <main dir="rtl" className="space-y-6">
      <section className="space-y-2">
        <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
          أهلاً، {actorName}
        </h1>
        <p className="text-sm leading-6 text-muted-foreground">
          اختر القسم الذي ترغب في الوصول إليه.
        </p>
      </section>

      <section aria-labelledby="staff-navigation-heading" className="space-y-3">
        <h2
          id="staff-navigation-heading"
          className="text-lg font-semibold text-foreground"
        >
          مساحة العمل
        </h2>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
          {navigationItems.map((item) => {
            const Icon = item.icon;

            return (
              <Link key={item.href} href={item.href} className="group block">
                <Card className="h-full transition-colors group-hover:border-primary/60 group-hover:bg-accent/40">
                  <CardContent className="flex min-h-28 items-center gap-4 p-5">
                    <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                      <Icon className="size-6" />
                    </div>

                    <p className="min-w-0 flex-1 font-semibold text-foreground">
                      {item.label}
                    </p>

                    <ArrowLeft className="size-5 shrink-0 text-muted-foreground transition-transform group-hover:-translate-x-1 group-hover:text-foreground" />
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      </section>
    </main>
  );
}
