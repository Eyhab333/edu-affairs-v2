"use client";

import type { FormEvent } from "react";
import {
  LoaderCircle,
  Search,
  UserRound,
  UsersRound,
} from "lucide-react";

import type { GuardianFinanceSearchResult } from "@/lib/guardian-finance";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

type FinanceSearchProps = {
  query: string;
  loading: boolean;
  hasSearched: boolean;
  results: GuardianFinanceSearchResult[];

  onQueryChange: (value: string) => void;
  onSearch: () => void;
  onSelect: (result: GuardianFinanceSearchResult) => void;
};

export function FinanceSearch({
  query,
  loading,
  hasSearched,
  results,
  onQueryChange,
  onSearch,
  onSelect,
}: FinanceSearchProps) {
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSearch();
  }

  return (
    <Card>
      <CardContent className="space-y-4 pt-6">
        <form
          onSubmit={handleSubmit}
          className="flex flex-col gap-3 md:flex-row"
        >
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />

            <input
              value={query}
              onChange={(event) => onQueryChange(event.target.value)}
              placeholder="ابحث باسم الطالب أو ولي الأمر أو السجل المدني أو الجوال..."
              className="h-10 w-full rounded-xl border border-input bg-background pr-10 pl-3 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
          </div>

          <Button
            type="submit"
            disabled={loading || query.trim().length < 2}
            className="md:min-w-32"
          >
            {loading ? (
              <LoaderCircle className="size-4 animate-spin" />
            ) : (
              <Search className="size-4" />
            )}

            بحث
          </Button>
        </form>

        {hasSearched && !loading && results.length === 0 ? (
          <div className="rounded-xl border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
            لم يتم العثور على طالب أو ولي أمر مطابق.
          </div>
        ) : null}

        {results.length > 0 ? (
          <div className="grid gap-2">
            {results.map((result) => {
              const isGuardian = result.kind === "GUARDIAN";

              return (
                <button
                  key={`${result.kind}-${result.id}`}
                  type="button"
                  onClick={() => onSelect(result)}
                  className="flex w-full items-center justify-between gap-4 rounded-xl border bg-card px-4 py-3 text-right transition hover:border-primary/50 hover:bg-muted/40"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                      {isGuardian ? (
                        <UsersRound className="size-5" />
                      ) : (
                        <UserRound className="size-5" />
                      )}
                    </div>

                    <div className="min-w-0">
                      <p className="truncate font-medium">
                        {result.displayName}
                      </p>

                      <p className="mt-1 text-xs text-muted-foreground">
                        {isGuardian ? "ولي أمر" : "طالب"}

                        {result.nationalId
                          ? ` • ${result.nationalId}`
                          : ""}

                        {result.phone ? ` • ${result.phone}` : ""}
                      </p>
                    </div>
                  </div>

                  <span className="shrink-0 text-xs text-primary">
                    فتح الملف
                  </span>
                </button>
              );
            })}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}