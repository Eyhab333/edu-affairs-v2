import * as React from "react";

import { cn } from "@/lib/utils";

type PageHeroProps = {
  badge?: string;
  badgeIcon?: React.ReactNode;
  title: string;
  description?: string;
  actions?: React.ReactNode;
  className?: string;
};

export default function PageHero({
  badge,
  badgeIcon,
  title,
  description,
  actions,
  className,
}: PageHeroProps) {
  return (
    <div className={cn("rounded-3xl border bg-card p-6 shadow-sm", className)}>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="space-y-2">
          {badge ? (
            <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
              {badgeIcon}
              <span>{badge}</span>
            </div>
          ) : null}

          <div>
            <h1 className="text-2xl font-extrabold tracking-tight md:text-3xl">
              {title}
            </h1>

            {description ? (
              <p className="mt-1 text-sm text-muted-foreground">{description}</p>
            ) : null}
          </div>
        </div>

        {actions ? <div className="flex flex-wrap gap-3">{actions}</div> : null}
      </div>
    </div>
  );
}