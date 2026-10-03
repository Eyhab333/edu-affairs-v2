"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Loader2 } from "lucide-react";
import { collection, getDocs } from "firebase/firestore";
import { toast } from "sonner";

import { db } from "@/lib/firebase";
import {
  reEnrollStudent,
  reEnrollStudentErrorMessage,
} from "@/lib/student-management";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type FirestoreRecord = Record<string, unknown>;
type SchoolOption = { id: string; label: string };
type AcademicYearOption = { id: string; label: string };
type ClassOption = { id: string; label: string; gradeLabel: string };

type ReEnrollStudentDialogProps = {
  open: boolean;
  orgId: string;
  studentId: string;
  onOpenChange: (open: boolean) => void;
  onSucceeded: () => Promise<void> | void;
};

function readString(data: FirestoreRecord, field: string) {
  const value = data[field];
  return typeof value === "string" ? value.trim() : "";
}

function labelFor(data: FirestoreRecord, fallback: string) {
  return (
    readString(data, "title") ||
    readString(data, "name") ||
    readString(data, "code") ||
    fallback
  );
}

function isSelectableClass(data: FirestoreRecord) {
  return (
    data.isArchived !== true &&
    data.isActive !== false &&
    (!readString(data, "status") || readString(data, "status") === "ACTIVE")
  );
}

function createOperationId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `student-reenroll-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export default function ReEnrollStudentDialog({
  open,
  orgId,
  studentId,
  onOpenChange,
  onSucceeded,
}: ReEnrollStudentDialogProps) {
  const [schoolId, setSchoolId] = useState("");
  const [academicYearId, setAcademicYearId] = useState("");
  const [classId, setClassId] = useState("");
  const [reason, setReason] = useState("");
  const [operationId, setOperationId] = useState<string | null>(null);
  const [schools, setSchools] = useState<SchoolOption[]>([]);
  const [academicYears, setAcademicYears] = useState<AcademicYearOption[]>([]);
  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [loadingSchools, setLoadingSchools] = useState(false);
  const [loadingAcademicYears, setLoadingAcademicYears] = useState(false);
  const [loadingClasses, setLoadingClasses] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;

    setSchoolId("");
    setAcademicYearId("");
    setClassId("");
    setReason("");
    setOperationId(createOperationId());
    setLoadError(null);
    setSaveError(null);
  }, [open]);

  useEffect(() => {
    if (!open) return;

    let active = true;
    setLoadingSchools(true);
    setLoadError(null);
    void getDocs(collection(db, `orgs/${orgId}/schools`))
      .then((snapshot) => {
        if (!active) return;
        setSchools(
          snapshot.docs
            .filter((item) => (item.data() as FirestoreRecord).isArchived !== true)
            .map((item) => ({
              id: item.id,
              label: labelFor(item.data() as FirestoreRecord, item.id),
            }))
            .sort((left, right) => left.label.localeCompare(right.label, "ar")),
        );
      })
      .catch(() => {
        if (active) setLoadError("تعذر تحميل المدارس المتاحة.");
      })
      .finally(() => {
        if (active) setLoadingSchools(false);
      });

    return () => {
      active = false;
    };
  }, [open, orgId]);

  useEffect(() => {
    setAcademicYears([]);
    setAcademicYearId("");
    setClasses([]);
    setClassId("");
    if (!open || !schoolId) return;

    let active = true;
    setLoadingAcademicYears(true);
    setLoadError(null);
    void getDocs(collection(db, `orgs/${orgId}/schools/${schoolId}/academicYears`))
      .then((snapshot) => {
        if (!active) return;
        setAcademicYears(
          snapshot.docs
            .filter((item) => (item.data() as FirestoreRecord).isActive !== false)
            .map((item) => ({
              id: item.id,
              label: labelFor(item.data() as FirestoreRecord, item.id),
            }))
            .sort((left, right) => left.label.localeCompare(right.label, "ar")),
        );
      })
      .catch(() => {
        if (active) setLoadError("تعذر تحميل الأعوام الدراسية المتاحة.");
      })
      .finally(() => {
        if (active) setLoadingAcademicYears(false);
      });

    return () => {
      active = false;
    };
  }, [open, orgId, schoolId]);

  useEffect(() => {
    setClasses([]);
    setClassId("");
    if (!open || !schoolId || !academicYearId) return;

    let active = true;
    setLoadingClasses(true);
    setLoadError(null);
    const yearPath = `orgs/${orgId}/schools/${schoolId}/academicYears/${academicYearId}`;
    void Promise.all([
      getDocs(collection(db, `${yearPath}/classes`)),
      getDocs(collection(db, `${yearPath}/grades`)),
    ])
      .then(([classesSnapshot, gradesSnapshot]) => {
        if (!active) return;
        const gradeLabels = new Map(
          gradesSnapshot.docs.map((item) => [
            item.id,
            labelFor(item.data() as FirestoreRecord, item.id),
          ]),
        );
        setClasses(
          classesSnapshot.docs
            .filter((item) => isSelectableClass(item.data() as FirestoreRecord))
            .map((item) => {
              const data = item.data() as FirestoreRecord;
              const title = labelFor(data, item.id);
              const sectionLabel = readString(data, "sectionLabel");
              const gradeId = readString(data, "gradeId");
              return {
                id: item.id,
                label:
                  sectionLabel && sectionLabel !== title
                    ? `${title} - ${sectionLabel}`
                    : title,
                gradeLabel: gradeId ? gradeLabels.get(gradeId) || gradeId : "",
              };
            })
            .sort((left, right) => left.label.localeCompare(right.label, "ar")),
        );
      })
      .catch(() => {
        if (active) setLoadError("تعذر تحميل الفصول المتاحة.");
      })
      .finally(() => {
        if (active) setLoadingClasses(false);
      });

    return () => {
      active = false;
    };
  }, [academicYearId, open, orgId, schoolId]);

  const selectedClass = useMemo(
    () => classes.find((item) => item.id === classId) ?? null,
    [classId, classes],
  );

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen && saving) return;
    onOpenChange(nextOpen);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (saving) return;

    const normalizedReason = reason.trim();
    if (!schoolId || !academicYearId || !classId || !normalizedReason) {
      setSaveError("أكمل بيانات إعادة القيد المطلوبة.");
      return;
    }

    setSaving(true);
    setSaveError(null);
    try {
      const currentOperationId = operationId ?? createOperationId();
      if (!operationId) setOperationId(currentOperationId);
      await reEnrollStudent({
        orgId,
        studentId,
        target: { schoolId, academicYearId, classId },
        reason: normalizedReason,
        operationId: currentOperationId,
      });
      await onSucceeded();
      onOpenChange(false);
      toast.success("تمت إعادة قيد الطالب بنجاح.");
    } catch (error) {
      const message = reEnrollStudentErrorMessage(error);
      setSaveError(message);
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-xl" showCloseButton={!saving}>
        <DialogHeader>
          <DialogTitle>إعادة قيد الطالب</DialogTitle>
          <DialogDescription>
            يُنشأ قيد نشط جديد مع الحفاظ على جميع القيود التاريخية دون تعديل.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="reenroll-school">المدرسة</Label>
              <select
                id="reenroll-school"
                value={schoolId}
                onChange={(event) => setSchoolId(event.target.value)}
                disabled={loadingSchools || saving}
                required
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="">
                  {loadingSchools ? "جارٍ تحميل المدارس..." : "اختر المدرسة"}
                </option>
                {schools.map((school) => (
                  <option key={school.id} value={school.id}>
                    {school.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="reenroll-academic-year">العام الدراسي</Label>
              <select
                id="reenroll-academic-year"
                value={academicYearId}
                onChange={(event) => setAcademicYearId(event.target.value)}
                disabled={!schoolId || loadingAcademicYears || saving}
                required
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="">
                  {loadingAcademicYears ? "جارٍ تحميل الأعوام..." : "اختر العام الدراسي"}
                </option>
                {academicYears.map((year) => (
                  <option key={year.id} value={year.id}>
                    {year.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="reenroll-class">الفصل</Label>
              <select
                id="reenroll-class"
                value={classId}
                onChange={(event) => setClassId(event.target.value)}
                disabled={!academicYearId || loadingClasses || saving}
                required
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="">
                  {loadingClasses ? "جارٍ تحميل الفصول..." : "اختر الفصل"}
                </option>
                {classes.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {selectedClass?.gradeLabel ? (
            <div className="rounded-xl bg-muted/50 px-4 py-3 text-sm">
              المستوى: <span className="font-medium">{selectedClass.gradeLabel}</span>
            </div>
          ) : null}

          <div className="space-y-2">
            <Label htmlFor="reenroll-reason">سبب إعادة القيد</Label>
            <Input
              id="reenroll-reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              disabled={saving}
              maxLength={1000}
              required
            />
          </div>

          {loadError ? (
            <p className="rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {loadError}
            </p>
          ) : null}
          {saveError ? (
            <p className="rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {saveError}
            </p>
          ) : null}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
              disabled={saving}
            >
              إلغاء
            </Button>
            <Button type="submit" disabled={saving || !!loadError}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              تأكيد إعادة القيد
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
