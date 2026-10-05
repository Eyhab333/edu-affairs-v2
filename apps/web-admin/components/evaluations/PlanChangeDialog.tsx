"use client";

import { type ReactNode, useMemo, useState } from "react";
import type {
  EvaluationAdminPlanChangeAction,
  EvaluationAdminPlanChangeInput,
  EvaluationAdminPlanChangePreview,
} from "@takween/contracts";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import {
  applyEvaluationPlanChange,
  previewEvaluationPlanChange,
} from "@/lib/evaluation-plan-admin";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export type EvaluationPersonOption = {
  id: string;
  displayName: string;
  email?: string;
  roleKey?: string;
};

export type EvaluationTargetOption = EvaluationPersonOption & {
  roleKey?: string;
};

type Props = {
  orgId: string;
  planId: string;
  action: EvaluationAdminPlanChangeAction;
  people: EvaluationPersonOption[];
  activeTargets: EvaluationTargetOption[];
  onApplied: () => void;
  trigger: ReactNode;
};

const ACTION_LABELS: Record<EvaluationAdminPlanChangeAction, string> = {
  ADD_TARGET: "إضافة مستهدف",
  REMOVE_TARGET: "إزالة من الخطة",
  REPLACE_TARGET: "استبدال مستهدف",
  SET_CYCLE_COUNT: "تعديل عدد الدورات",
};

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "تعذر تنفيذ العملية.";
}

function PersonSelect({
  id,
  label,
  value,
  people,
  onChange,
  placeholder = "اختر شخصًا",
}: {
  id: string;
  label: string;
  value: string;
  people: EvaluationPersonOption[];
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <select
        id={id}
        className="h-10 rounded-md border bg-background px-3 text-sm"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">{placeholder}</option>
        {people.map((person) => (
          <option key={person.id} value={person.id}>
            {person.displayName} — {person.email || person.id}
          </option>
        ))}
      </select>
    </div>
  );
}

function ChangeList({
  title,
  items,
}: {
  title: string;
  items: EvaluationAdminPlanChangePreview["cycles"];
}) {
  if (items.length === 0) return null;

  return (
    <div className="rounded-lg border p-3">
      <div className="mb-2 font-medium">{title}: {items.length}</div>
      <ul className="max-h-28 space-y-1 overflow-y-auto text-xs text-muted-foreground">
        {items.slice(0, 40).map((item) => (
          <li key={`${item.action}-${item.id}`}>
            <span className="font-mono text-foreground">{item.action}</span>
            {" — "}{item.label}
            {item.cycleId ? ` (${item.cycleId})` : ""}
          </li>
        ))}
        {items.length > 40 ? <li>… و{items.length - 40} عناصر أخرى</li> : null}
      </ul>
    </div>
  );
}

export default function PlanChangeDialog({
  orgId,
  planId,
  action,
  people,
  activeTargets,
  onApplied,
  trigger,
}: Props) {
  const [open, setOpen] = useState(false);
  const [targetPersonId, setTargetPersonId] = useState("");
  const [evaluatorPersonId, setEvaluatorPersonId] = useState("");
  const [replacementTargetPersonId, setReplacementTargetPersonId] = useState("");
  const [cycleCount, setCycleCount] = useState("");
  const [reason, setReason] = useState("");
  const [preview, setPreview] = useState<EvaluationAdminPlanChangePreview | null>(null);
  const [previewInput, setPreviewInput] = useState<EvaluationAdminPlanChangeInput | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState<"preview" | "apply" | null>(null);

  const availableReplacementPeople = useMemo(
    () => people.filter((person) => person.id !== targetPersonId),
    [people, targetPersonId],
  );

  function resetPreview() {
    setPreview(null);
    setPreviewInput(null);
    setConfirmed(false);
  }

  function createInput(): EvaluationAdminPlanChangeInput {
    const base = {
      orgId,
      planId,
      action,
      ...(reason.trim() ? { reason: reason.trim() } : {}),
    };

    if (action === "ADD_TARGET") {
      if (!targetPersonId || !evaluatorPersonId) {
        throw new Error("اختر المستهدف والمقيّم أولًا.");
      }
      return { ...base, targetPersonId, evaluatorPersonId };
    }
    if (action === "REMOVE_TARGET") {
      if (!targetPersonId) throw new Error("اختر المستهدف أولًا.");
      return { ...base, targetPersonId };
    }
    if (action === "REPLACE_TARGET") {
      if (!targetPersonId || !replacementTargetPersonId) {
        throw new Error("اختر المستهدف الحالي والمستهدف البديل أولًا.");
      }
      return { ...base, targetPersonId, replacementTargetPersonId };
    }

    const parsedCount = Number(cycleCount);
    if (!Number.isInteger(parsedCount) || parsedCount < 0) {
      throw new Error("أدخل عدد دورات صحيحًا يساوي صفرًا أو أكبر.");
    }
    return { ...base, cycleCount: parsedCount };
  }

  async function handlePreview() {
    try {
      const input = createInput();
      setBusy("preview");
      const nextPreview = await previewEvaluationPlanChange(input);
      setPreviewInput(input);
      setPreview(nextPreview);
      setConfirmed(false);
      if (nextPreview.canApply) {
        toast.success("تمت المعاينة. راجع التغييرات قبل التنفيذ.");
      } else {
        toast.error("المعاينة تحتوي على تعارضات تمنع التنفيذ.");
      }
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(null);
    }
  }

  async function handleApply() {
    if (!preview || !previewInput || !confirmed) return;
    try {
      setBusy("apply");
      const result = await applyEvaluationPlanChange({
        ...previewInput,
        previewFingerprint: preview.fingerprint,
      });
      toast.success(`تم تنفيذ ${result.appliedWrites} كتابة آمنة.`);
      setOpen(false);
      resetPreview();
      onApplied();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(null);
    }
  }

  const targetOptions = activeTargets.map((target) => ({
    ...target,
    displayName: `${target.displayName}${target.roleKey ? ` — ${target.roleKey}` : ""}`,
  }));

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (!nextOpen) resetPreview();
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{ACTION_LABELS[action]}</DialogTitle>
          <DialogDescription>
            لا تُكتب أي بيانات أثناء المعاينة. ينفذ الخادم المعاينة مرة أخرى قبل التطبيق.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          {action === "ADD_TARGET" ? (
            <>
              <PersonSelect
                id={`target-${action}`}
                label="المستهدف"
                value={targetPersonId}
                people={people}
                onChange={(value) => {
                  setTargetPersonId(value);
                  resetPreview();
                }}
              />
              <PersonSelect
                id={`evaluator-${action}`}
                label="المقيّم"
                value={evaluatorPersonId}
                people={people}
                onChange={(value) => {
                  setEvaluatorPersonId(value);
                  resetPreview();
                }}
              />
            </>
          ) : null}

          {action === "REMOVE_TARGET" ? (
            <PersonSelect
              id={`target-${action}`}
              label="المستهدف المراد إزالته"
              value={targetPersonId}
              people={targetOptions}
              onChange={(value) => {
                setTargetPersonId(value);
                resetPreview();
              }}
            />
          ) : null}

          {action === "REPLACE_TARGET" ? (
            <>
              <PersonSelect
                id={`old-target-${action}`}
                label="المستهدف الحالي"
                value={targetPersonId}
                people={targetOptions}
                onChange={(value) => {
                  setTargetPersonId(value);
                  resetPreview();
                }}
              />
              <PersonSelect
                id={`new-target-${action}`}
                label="المستهدف البديل"
                value={replacementTargetPersonId}
                people={availableReplacementPeople}
                onChange={(value) => {
                  setReplacementTargetPersonId(value);
                  resetPreview();
                }}
              />
            </>
          ) : null}

          {action === "SET_CYCLE_COUNT" ? (
            <div className="grid gap-1.5">
              <Label htmlFor={`cycle-count-${action}`}>عدد الدورات المطلوب</Label>
              <Input
                id={`cycle-count-${action}`}
                type="number"
                min={0}
                max={100}
                value={cycleCount}
                onChange={(event) => {
                  setCycleCount(event.target.value);
                  resetPreview();
                }}
              />
            </div>
          ) : null}

          <div className="grid gap-1.5">
            <Label htmlFor={`reason-${action}`}>سبب التغيير (اختياري)</Label>
            <Input
              id={`reason-${action}`}
              value={reason}
              maxLength={1000}
              onChange={(event) => {
                setReason(event.target.value);
                resetPreview();
              }}
            />
          </div>

          {preview ? (
            <div className="space-y-3 rounded-xl border bg-muted/20 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="font-semibold">نتيجة المعاينة</div>
                <div className="text-sm text-muted-foreground">
                  إجمالي الكتابات: {preview.totalWrites}
                </div>
              </div>
              <div className="grid gap-2 text-sm sm:grid-cols-2">
                <div>الخطة: {preview.plan.title}</div>
                <div>الإرسالات التاريخية المحفوظة: {preview.historicalSubmissionCount}</div>
              </div>
              <ChangeList title="المستهدفون" items={preview.targetAssignments} />
              <ChangeList title="إسنادات المقيمين" items={preview.evaluatorAssignments} />
              <ChangeList title="الدورات" items={preview.cycles} />
              <ChangeList title="تحديثات الخطة" items={preview.planUpdates} />

              {preview.warnings.length > 0 ? (
                <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm">
                  <div className="font-medium">تحذيرات</div>
                  <ul className="mt-1 list-disc space-y-1 pr-5 text-xs">
                    {preview.warnings.map((warning) => <li key={warning}>{warning}</li>)}
                  </ul>
                </div>
              ) : null}
              {preview.conflicts.length > 0 ? (
                <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                  <div className="font-medium">تعارضات تمنع التنفيذ</div>
                  <ul className="mt-1 list-disc space-y-1 pr-5 text-xs">
                    {preview.conflicts.map((conflict) => <li key={conflict}>{conflict}</li>)}
                  </ul>
                </div>
              ) : null}
              {preview.canApply ? (
                <label className="flex items-start gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={confirmed}
                    onChange={(event) => setConfirmed(event.target.checked)}
                  />
                  <span>أؤكد تنفيذ هذه التغييرات بعد حفظ الإرسالات التاريخية دون حذف.</span>
                </label>
              ) : null}
            </div>
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => void handlePreview()} disabled={busy !== null}>
            {busy === "preview" ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            معاينة التغييرات
          </Button>
          <Button
            variant="destructive"
            onClick={() => void handleApply()}
            disabled={!preview?.canApply || !confirmed || busy !== null}
          >
            {busy === "apply" ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            تنفيذ التغييرات
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
