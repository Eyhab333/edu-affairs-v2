import * as React from "react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type PageMessageStateProps = {
  title: string;
  description?: string;
  action?: React.ReactNode;
};

export function DetailPageSkeleton() {
  return (
    <div className="space-y-6">
      <div className="h-24 animate-pulse rounded-3xl bg-muted" />
      <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="h-[520px] animate-pulse rounded-2xl bg-muted" />
        <div className="h-[520px] animate-pulse rounded-2xl bg-muted" />
      </div>
    </div>
  );
}

export function PageMessageState({
  title,
  description,
  action,
}: PageMessageStateProps) {
  return (
    <Card className="rounded-2xl">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description ? <CardDescription>{description}</CardDescription> : null}
      </CardHeader>

      {action ? <CardContent>{action}</CardContent> : null}
    </Card>
  );
}