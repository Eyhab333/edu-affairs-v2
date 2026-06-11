import * as React from "react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type SectionCardProps = {
  title?: string;
  description?: string;
  children: React.ReactNode;
  contentClassName?: string;
};

export default function SectionCard({
  title,
  description,
  children,
  contentClassName,
}: SectionCardProps) {
  return (
    <Card className="rounded-2xl shadow-sm">
      {title || description ? (
        <CardHeader>
          {title ? <CardTitle>{title}</CardTitle> : null}
          {description ? <CardDescription>{description}</CardDescription> : null}
        </CardHeader>
      ) : null}

      <CardContent className={contentClassName}>{children}</CardContent>
    </Card>
  );
}