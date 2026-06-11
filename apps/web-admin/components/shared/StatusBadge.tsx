import * as React from "react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type StatusBadgeProps = {
  archived?: boolean;
  activeText?: string;
  archivedText?: string;
  className?: string;
};

export default function StatusBadge({
  archived = false,
  activeText = "نشط",
  archivedText = "مؤرشف",
  className,
}: StatusBadgeProps) {
  if (archived) {
    return (
      <Badge
        variant="secondary"
        className={cn("rounded-full px-3 py-1", className)}
      >
        {archivedText}
      </Badge>
    );
  }

  return (
    <Badge
      className={cn(
        "rounded-full bg-emerald-600 px-3 py-1 text-white hover:bg-emerald-600",
        className
      )}
    >
      {activeText}
    </Badge>
  );
}