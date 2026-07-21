"use client";

import {
  FormEvent,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  collection,
  getDocs,
  query,
  where,
} from "firebase/firestore";
import {
  LoaderCircle,
  Plus,
  X,
} from "lucide-react";

import { useStaffActor } from "@/components/staff/staff-actor-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  createStudentFeeCharge,
  type GuardianFinanceStudent,
} from "@/lib/guardian-finance";
import { db } from "@/lib/firebase";

type EnrollmentOption = {
  id: string;
  studentId: string;
  schoolId: string;
  academicYearId: string;
  gradeId?: string;
  classId?: string;
  status: string;
};

type FeeDefinitionOption = {
  id: string;
  title: string;
  status: string;

  academicYearId?: string;
  schoolIds?: string[];
  gradeIds?: string[];
  classIds?: string[];

  defaultInstallmentCount?: number;
  isArchived?: boolean;
};

type AddStudentFeeChargeDialogProps = {
  open: boolean;
  guardianId: string;
  students: GuardianFinanceStudent[];

  onOpenChange: (open: boolean) => void;
  onCreated: () => Promise<void> | void;
};

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "حدث خطأ غير متوقع";
}

function formatEnrollmentLabel(params: {
  enrollment: EnrollmentOption;
  schoolName: string;
  className: string;
  termTitle?: string;
}): string {
  return [
    params.schoolName,
    params.className,
    params.termTitle,
  ]
    .filter(Boolean)
    .join(" — ");
}

export function AddStudentFeeChargeDialog({
  open,
  guardianId,
  students,
  onOpenChange,
  onCreated,
}: AddStudentFeeChargeDialogProps) {
  const { actor } = useStaffActor();

  const [studentId, setStudentId] = useState("");
  const [enrollmentId, setEnrollmentId] = useState("");
  const [feeDefinitionId, setFeeDefinitionId] =
    useState("");

  const [enrollments, setEnrollments] = useState<
    EnrollmentOption[]
  >([]);

  const [feeDefinitions, setFeeDefinitions] = useState<
    FeeDefinitionOption[]
  >([]);

  const [amount, setAmount] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [installmentCount, setInstallmentCount] =
    useState("0");

  const [isGuardianVisible, setIsGuardianVisible] =
    useState(true);

  const [loadingDefinitions, setLoadingDefinitions] =
    useState(false);

  const [loadingEnrollments, setLoadingEnrollments] =
    useState(false);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const schoolNameById = useMemo(() => {
    return new Map(
      actor.schools.map((school) => [
        school.id,
        school.name ?? school.id,
      ]),
    );
  }, [actor.schools]);

  const classNameById = useMemo(() => {
    return new Map(
      actor.classes.map((classItem) => [
        classItem.id,
        classItem.title ?? classItem.code ?? classItem.id
      ]),
    );
  }, [actor.classes]);

  const selectedEnrollment = useMemo(() => {
    return enrollments.find(
      (enrollment) => enrollment.id === enrollmentId,
    );
  }, [enrollmentId, enrollments]);

  const applicableFeeDefinitions = useMemo(() => {
    if (!selectedEnrollment) return [];

    return feeDefinitions.filter((definition) => {
      if (
        definition.academicYearId &&
        definition.academicYearId !==
          selectedEnrollment.academicYearId
      ) {
        return false;
      }

      if (
        definition.schoolIds?.length &&
        !definition.schoolIds.includes(
          selectedEnrollment.schoolId,
        )
      ) {
        return false;
      }

      if (
        definition.gradeIds?.length &&
        (!selectedEnrollment.gradeId ||
          !definition.gradeIds.includes(
            selectedEnrollment.gradeId,
          ))
      ) {
        return false;
      }

      if (
        definition.classIds?.length &&
        (!selectedEnrollment.classId ||
          !definition.classIds.includes(
            selectedEnrollment.classId,
          ))
      ) {
        return false;
      }

      return true;
    });
  }, [feeDefinitions, selectedEnrollment]);

  useEffect(() => {
    if (!open) return;

    setStudentId(students[0]?.id ?? "");
    setEnrollmentId("");
    setFeeDefinitionId("");
    setEnrollments([]);
    setAmount("");
    setDueDate("");
    setInstallmentCount("0");
    setIsGuardianVisible(true);
    setError("");

    let active = true;

    async function loadFeeDefinitions() {
      setLoadingDefinitions(true);

      try {
        const snapshot = await getDocs(
          collection(
            db,
            "orgs",
            actor.orgId,
            "feeDefinitions",
          ),
        );

        if (!active) return;

        const rows = snapshot.docs
          .map((document) => ({
            id: document.id,
            ...(document.data() as Omit<
              FeeDefinitionOption,
              "id"
            >),
          }))
          .filter(
            (definition) =>
              definition.status === "ACTIVE" &&
              definition.isArchived !== true,
          )
          .sort((a, b) =>
            a.title.localeCompare(b.title, "ar"),
          );

        setFeeDefinitions(rows);
      } catch (error) {
        if (!active) return;
        setError(getErrorMessage(error));
      } finally {
        if (active) {
          setLoadingDefinitions(false);
        }
      }
    }

    void loadFeeDefinitions();

    return () => {
      active = false;
    };
  }, [actor.orgId, open, students]);

  useEffect(() => {
    if (!open || !studentId) {
      setEnrollments([]);
      setEnrollmentId("");
      return;
    }

    let active = true;

    async function loadStudentEnrollments() {
      setLoadingEnrollments(true);
      setError("");
      setEnrollmentId("");
      setFeeDefinitionId("");

      try {
        const snapshot = await getDocs(
          query(
            collection(
              db,
              "orgs",
              actor.orgId,
              "studentEnrollments",
            ),
            where("studentId", "==", studentId),
          ),
        );

        if (!active) return;

        const rows = snapshot.docs
          .map((document) => ({
            id: document.id,
            ...(document.data() as Omit<
              EnrollmentOption,
              "id"
            >),
          }))
          .filter(
            (enrollment) =>
              enrollment.status === "ACTIVE",
          )
          .sort((a, b) =>
            a.schoolId.localeCompare(b.schoolId),
          );

        setEnrollments(rows);
        setEnrollmentId(rows[0]?.id ?? "");
      } catch (error) {
        if (!active) return;
        setError(getErrorMessage(error));
      } finally {
        if (active) {
          setLoadingEnrollments(false);
        }
      }
    }

    void loadStudentEnrollments();

    return () => {
      active = false;
    };
  }, [actor.orgId, open, studentId]);

  useEffect(() => {
    setFeeDefinitionId("");
    setInstallmentCount("0");
  }, [enrollmentId]);

  function handleFeeDefinitionChange(value: string) {
    setFeeDefinitionId(value);

    const definition = feeDefinitions.find(
      (item) => item.id === value,
    );

    setInstallmentCount(
      String(definition?.defaultInstallmentCount ?? 0),
    );
  }

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    if (!selectedEnrollment) {
      setError("اختر التسجيل الدراسي.");
      return;
    }

    if (!feeDefinitionId) {
      setError("اختر تعريف الرسم.");
      return;
    }

    let originalAmountMinor: number | undefined;

    if (amount.trim()) {
      const parsedAmount = Number(
        amount.trim().replace(",", "."),
      );

      if (
        !Number.isFinite(parsedAmount) ||
        parsedAmount <= 0
      ) {
        setError("قيمة المستحق غير صحيحة.");
        return;
      }

      originalAmountMinor = Math.round(
        parsedAmount * 100,
      );
    }

    const parsedInstallmentCount = Number(
      installmentCount,
    );

    if (
      !Number.isInteger(parsedInstallmentCount) ||
      parsedInstallmentCount < 0 ||
      parsedInstallmentCount > 60
    ) {
      setError("عدد الأقساط غير صحيح.");
      return;
    }

    const currentTerm =
      actor.currentTermsByAcademicYear[
        selectedEnrollment.academicYearId
      ];

    setSaving(true);
    setError("");

    try {
      await createStudentFeeCharge({
        orgId: actor.orgId,

        schoolId: selectedEnrollment.schoolId,
        academicYearId:
          selectedEnrollment.academicYearId,

        termId: currentTerm?.id,
        termTitle: currentTerm?.title,
        termShortTitle: currentTerm?.shortTitle,

        studentId,
        guardianId,

        feeDefinitionId,

        originalAmountMinor,

        dueAt: dueDate
          ? new Date(
              `${dueDate}T12:00:00`,
            ).getTime()
          : undefined,

        installmentCount: parsedInstallmentCount,

        activateImmediately: true,
        isGuardianVisible,
      });

      onOpenChange(false);
      await onCreated();
    } catch (error) {
      setError(getErrorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <Card className="max-h-[90vh] w-full max-w-2xl overflow-y-auto">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>إضافة مستحق جديد</CardTitle>

            <p className="mt-1 text-sm text-muted-foreground">
              اختر الطالب والتسجيل وتعريف الرسم.
            </p>
          </div>

          <Button
            type="button"
            variant="ghost"
            size="icon"
            disabled={saving}
            onClick={() => onOpenChange(false)}
          >
            <X className="size-5" />
          </Button>
        </CardHeader>

        <CardContent>
          <form
            onSubmit={handleSubmit}
            className="space-y-5"
          >
            <div className="grid gap-2">
              <label className="text-sm font-medium">
                الطالب
              </label>

              <select
                value={studentId}
                onChange={(event) =>
                  setStudentId(event.target.value)
                }
                disabled={saving}
                className="h-10 rounded-xl border border-input bg-background px-3 text-sm"
              >
                {students.map((student) => (
                  <option
                    key={student.id}
                    value={student.id}
                  >
                    {student.displayName}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid gap-2">
              <label className="text-sm font-medium">
                التسجيل الدراسي
              </label>

              <select
                value={enrollmentId}
                onChange={(event) =>
                  setEnrollmentId(event.target.value)
                }
                disabled={
                  saving || loadingEnrollments
                }
                className="h-10 rounded-xl border border-input bg-background px-3 text-sm"
              >
                <option value="">
                  {loadingEnrollments
                    ? "جاري تحميل التسجيلات..."
                    : "اختر التسجيل"}
                </option>

                {enrollments.map((enrollment) => {
                  const currentTerm =
                    actor.currentTermsByAcademicYear[
                      enrollment.academicYearId
                    ];

                  return (
                    <option
                      key={enrollment.id}
                      value={enrollment.id}
                    >
                      {formatEnrollmentLabel({
                        enrollment,
                        schoolName:
                          schoolNameById.get(
                            enrollment.schoolId,
                          ) ?? enrollment.schoolId,

                        className:
                          classNameById.get(
                            enrollment.classId ?? "",
                          ) ??
                          enrollment.classId ??
                          enrollment.gradeId ??
                          "بدون فصل",

                        termTitle: currentTerm?.title,
                      })}
                    </option>
                  );
                })}
              </select>

              {!loadingEnrollments &&
              studentId &&
              enrollments.length === 0 ? (
                <p className="text-xs text-destructive">
                  لا يوجد تسجيل دراسي فعّال للطالب.
                </p>
              ) : null}
            </div>

            <div className="grid gap-2">
              <label className="text-sm font-medium">
                تعريف الرسم
              </label>

              <select
                value={feeDefinitionId}
                onChange={(event) =>
                  handleFeeDefinitionChange(
                    event.target.value,
                  )
                }
                disabled={
                  saving ||
                  loadingDefinitions ||
                  !selectedEnrollment
                }
                className="h-10 rounded-xl border border-input bg-background px-3 text-sm"
              >
                <option value="">
                  {loadingDefinitions
                    ? "جاري تحميل تعريفات الرسوم..."
                    : "اختر تعريف الرسم"}
                </option>

                {applicableFeeDefinitions.map(
                  (definition) => (
                    <option
                      key={definition.id}
                      value={definition.id}
                    >
                      {definition.title}
                    </option>
                  ),
                )}
              </select>

              {selectedEnrollment &&
              !loadingDefinitions &&
              applicableFeeDefinitions.length === 0 ? (
                <p className="text-xs text-destructive">
                  لا يوجد تعريف رسم نشط ينطبق على هذا التسجيل.
                </p>
              ) : null}
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <div className="grid gap-2">
                <label className="text-sm font-medium">
                  مبلغ مخصص
                </label>

                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={amount}
                  onChange={(event) =>
                    setAmount(event.target.value)
                  }
                  placeholder="اتركه فارغًا للقيمة الافتراضية"
                  disabled={saving}
                  className="h-10 rounded-xl border border-input bg-background px-3 text-sm"
                />
              </div>

              <div className="grid gap-2">
                <label className="text-sm font-medium">
                  تاريخ الاستحقاق
                </label>

                <input
                  type="date"
                  value={dueDate}
                  onChange={(event) =>
                    setDueDate(event.target.value)
                  }
                  disabled={saving}
                  className="h-10 rounded-xl border border-input bg-background px-3 text-sm"
                />
              </div>

              <div className="grid gap-2">
                <label className="text-sm font-medium">
                  عدد الأقساط
                </label>

                <input
                  type="number"
                  min="0"
                  max="60"
                  value={installmentCount}
                  onChange={(event) =>
                    setInstallmentCount(
                      event.target.value,
                    )
                  }
                  disabled={saving}
                  className="h-10 rounded-xl border border-input bg-background px-3 text-sm"
                />
              </div>
            </div>

            <label className="flex cursor-pointer items-center gap-3 rounded-xl border p-3">
              <input
                type="checkbox"
                checked={isGuardianVisible}
                onChange={(event) =>
                  setIsGuardianVisible(
                    event.target.checked,
                  )
                }
                disabled={saving}
                className="size-4"
              />

              <span className="text-sm">
                إظهار المستحق لولي الأمر
              </span>
            </label>

            {error ? (
              <div className="rounded-xl border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                {error}
              </div>
            ) : null}

            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={saving}
                onClick={() => onOpenChange(false)}
              >
                إلغاء
              </Button>

              <Button
                type="submit"
                disabled={
                  saving ||
                  !studentId ||
                  !selectedEnrollment ||
                  !feeDefinitionId
                }
              >
                {saving ? (
                  <LoaderCircle className="size-4 animate-spin" />
                ) : (
                  <Plus className="size-4" />
                )}

                حفظ المستحق
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}