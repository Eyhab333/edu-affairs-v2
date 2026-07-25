"use client";

import Link from "next/link";
import {
  AlertTriangle,
  Home,
  RefreshCw,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  getUserFacingError,
  type UserFacingError,
} from "@/lib/get-user-facing-error";

type StaffPageErrorProps = {
  error: unknown | UserFacingError;
  onRetry?: () => void;
  backHref?: string;
  backLabel?: string;
};

function isUserFacingError(
  value: unknown,
): value is UserFacingError {
  if (!value || typeof value !== "object") {
    return false;
  }

  const data = value as {
    title?: unknown;
    message?: unknown;
  };

  return (
    typeof data.title === "string" &&
    typeof data.message === "string"
  );
}

export function StaffPageError({
  error,
  onRetry,
  backHref = "/staff",
  backLabel = "العودة للرئيسية",
}: StaffPageErrorProps) {
  const resolvedError = isUserFacingError(error)
    ? error
    : getUserFacingError(error);

  return (
    <main className="mx-auto max-w-3xl p-6">
      <section className="rounded-3xl border border-destructive/30 bg-card p-6 shadow-sm">
        <div className="flex items-start gap-4">
          <div className="rounded-2xl bg-destructive/10 p-3 text-destructive">
            <AlertTriangle className="size-6" />
          </div>

          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-bold">
              {resolvedError.title}
            </h1>

            <p className="mt-2 text-sm leading-7 text-muted-foreground">
              {resolvedError.message}
            </p>

            {resolvedError.technicalDetails ? (
              <details className="mt-4 rounded-xl border bg-muted/30 p-3">
                <summary className="cursor-pointer text-xs font-medium">
                  التفاصيل التقنية
                </summary>

                <p className="mt-2 break-words text-xs text-muted-foreground">
                  {resolvedError.technicalDetails}
                </p>
              </details>
            ) : null}

            <div className="mt-5 flex flex-wrap gap-2">
              {onRetry ? (
                <Button onClick={onRetry}>
                  <RefreshCw className="size-4" />
                  إعادة المحاولة
                </Button>
              ) : null}

              <Button
                asChild
                variant="outline"
              >
                <Link href={backHref}>
                  <Home className="size-4" />
                  {backLabel}
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}