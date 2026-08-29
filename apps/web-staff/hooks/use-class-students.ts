"use client";

import { useCallback } from "react";

import { useDocumentLoader } from "@/hooks/use-document-loader";
import { getClassRoster } from "@/lib/class-roster";

export type ClassStudentRow = {
  id: string;
  studentId: string;
  enrollmentId: string;
  displayName: string;
};

export type ClassStudentsData = {
  orgId: string;
  classId: string;
  schoolId: string;
  academicYearId: string;
  rows: ClassStudentRow[];
  totalCount: number;
};

type UseClassStudentsOptions = {
  orgId: string;
  classId: string;
  schoolId?: string | null;
  academicYearId?: string | null;
  enabled?: boolean;
};

function normalizeText(value: string) {
  return value.trim().toLowerCase();
}

function sortRows(a: ClassStudentRow, b: ClassStudentRow) {
  return normalizeText(a.displayName).localeCompare(
    normalizeText(b.displayName),
    "ar",
  );
}

export function useClassStudents({
  orgId,
  classId,
  schoolId,
  academicYearId,
  enabled = true,
}: UseClassStudentsOptions) {
  const canLoad =
    enabled &&
    !!orgId &&
    !!classId &&
    !!schoolId &&
    !!academicYearId;

  const loadClassStudents =
    useCallback(async (): Promise<ClassStudentsData | null> => {
      if (!canLoad || !schoolId || !academicYearId) return null;

      const roster = await getClassRoster({
        orgId,
        schoolId,
        academicYearId,
        classId,
      });

      const rows = roster.rows
        .map((row) => ({
          id: row.studentId,
          studentId: row.studentId,
          enrollmentId: row.enrollmentId,
          displayName: row.displayName || row.studentId,
        }))
        .sort(sortRows);

      return {
        orgId,
        classId,
        schoolId,
        academicYearId,
        rows,
        totalCount: rows.length,
      };
    }, [canLoad, orgId, schoolId, academicYearId, classId]);

  return useDocumentLoader<ClassStudentsData>({
    enabled: canLoad,
    loader: loadClassStudents,
    deps: [orgId, classId, schoolId, academicYearId],
  });
}
