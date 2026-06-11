import * as React from "react";

import { cn } from "@/lib/utils";

type InfoCardProps = {
  label: string;
  value: React.ReactNode;
  hint?: string;
  className?: string;
  valueClassName?: string;
};

export default function InfoCard({
  label,
  value,
  hint,
  className,
  valueClassName,
}: InfoCardProps) {
  return (
    <div className={cn("rounded-xl border bg-muted/30 p-4", className)}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <div className={cn("mt-1 font-medium", valueClassName)}>{value}</div>
      {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}