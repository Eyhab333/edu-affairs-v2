"use client";

import Link from "next/link";
import { ChevronLeft } from "lucide-react";

import type { OperationCard } from "./class-page-types";

export function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-2xl border border-slate-100 px-3 py-2 dark:border-slate-800">
      <span className="text-slate-500 dark:text-slate-400">{label}</span>
      <span className="truncate text-left font-medium text-slate-800 dark:text-slate-100">
        {value}
      </span>
    </div>
  );
}

export function OperationWorkspaceCard({ item }: { item: OperationCard }) {
  const Icon = item.icon;

  const content = (
    <div className="group rounded-3xl border border-slate-100 bg-slate-50 p-4 transition hover:border-emerald-200 hover:bg-white dark:border-slate-800 dark:bg-slate-950 dark:hover:border-emerald-900 dark:hover:bg-slate-900">
      <div className="flex items-start justify-between gap-3">
        <div className="flex gap-3">
          <div className="rounded-2xl bg-white p-3 text-slate-700 shadow-sm dark:bg-slate-900 dark:text-slate-200">
            <Icon className="h-5 w-5" />
          </div>

          <div>
            <h3 className="font-bold">{item.title}</h3>
            <p className="mt-1 text-sm leading-6 text-slate-500 dark:text-slate-400">
              {item.description}
            </p>
          </div>
        </div>

        <ChevronLeft className="mt-1 h-4 w-4 text-slate-300 transition group-hover:text-emerald-500" />
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <span className="inline-flex rounded-full bg-white px-3 py-1 text-xs font-medium text-slate-600 ring-1 ring-slate-200 dark:bg-slate-900 dark:text-slate-300 dark:ring-slate-800">
          {item.status === "ACTIVE"
            ? "مفعل الآن"
            : item.status === "READY_SOON"
              ? "قادم في Milestone 9"
              : "مرحلة لاحقة"}
        </span>

        {item.actionLabel ? (
          <span className="inline-flex rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-900">
            {item.actionLabel}
          </span>
        ) : null}
      </div>
    </div>
  );

  if (!item.href) {
    return <div className="opacity-80">{content}</div>;
  }

  if (item.href.startsWith("#")) {
    return <a href={item.href}>{content}</a>;
  }

  return <Link href={item.href}>{content}</Link>;
}
