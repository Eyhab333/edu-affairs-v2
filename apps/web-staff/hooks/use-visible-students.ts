"use client";

import { useCallback, useMemo } from "react";

import { useDocumentLoader } from "@/hooks/use-document-loader";
import {
  getVisibleStudents,
  type VisibleStudentRosterRow,
} from "@/lib/visible-students";

export type VisibleStudentClass = {
  id: string;
  orgId?: string;
  schoolId?: string;
  academicYearId?: string;
  gradeId?: string;
  streamId?: string;
  code?: string;
  title?: string;
  sectionLabel?: string;
  order?: number;
  capacity?: number;
  studentCount?: number;
  studentsCount?: number;
  enrolledStudentCount?: number;
  schoolName?: string;
  gradeTitle?: string;
  academicYearTitle?: string;
};

export type VisibleStudentEnrollmentRow = {
  id: string;
  orgId: string;
  schoolId: string;
  academicYearId: string;
  studentId: string;
  gradeId: string;
  streamId: string;
  classId: string;
  status: "ACTIVE";
};

export type VisibleStudentRow = {
  id: string;
  studentId: string;
  enrollmentId: string;
  displayName: string;
  classId: string;
  classTitle: string;
  schoolId: string;
  schoolName: string;
  academicYearId: string;
  academicYearTitle: string;
  gradeId: string;
  gradeTitle: string;
  streamId: string;
  enrollment: VisibleStudentEnrollmentRow;
  classInfo: VisibleStudentClass;
};

export type VisibleStudentsData = {
  orgId: string;
  rows: VisibleStudentRow[];
  totalCount: number;
  classCount: number;
  schoolCount: number;
};

type UseVisibleStudentsOptions = {
  orgId: string;
  visibleClasses: VisibleStudentClass[];
  enabled?: boolean;
};

function makeClassKey(params: {
  schoolId?: string;
  academicYearId?: string;
  classId?: string;
}) {
  return [
    params.schoolId ?? "",
    params.academicYearId ?? "",
    params.classId ?? "",
  ].join("::");
}

function getClassTitle(item: VisibleStudentClass) {
  return item.title || item.code || item.id;
}

function toVisibleStudentRow(params: {
  orgId: string;
  rosterRow: VisibleStudentRosterRow;
  classByKey: Map<string, VisibleStudentClass>;
}): VisibleStudentRow {
  const { orgId, rosterRow, classByKey } = params;
  const classInfo =
    classByKey.get(
      makeClassKey({
        schoolId: rosterRow.schoolId,
        academicYearId: rosterRow.academicYearId,
        classId: rosterRow.classId,
      }),
    ) ?? {
      id: rosterRow.classId,
      orgId,
      schoolId: rosterRow.schoolId,
      academicYearId: rosterRow.academicYearId,
      gradeId: rosterRow.gradeId,
      streamId: rosterRow.streamId,
      title: rosterRow.classId,
    };

  return {
    id: `${rosterRow.enrollmentId}:${rosterRow.studentId}`,
    studentId: rosterRow.studentId,
    enrollmentId: rosterRow.enrollmentId,
    displayName: rosterRow.displayName || rosterRow.studentId,
    classId: rosterRow.classId,
    classTitle: getClassTitle(classInfo),
    schoolId: rosterRow.schoolId,
    schoolName: classInfo.schoolName || rosterRow.schoolId,
    academicYearId: rosterRow.academicYearId,
    academicYearTitle: classInfo.academicYearTitle || rosterRow.academicYearId,
    gradeId: rosterRow.gradeId || classInfo.gradeId || "",
    gradeTitle: classInfo.gradeTitle || rosterRow.gradeId || "",
    streamId: rosterRow.streamId || classInfo.streamId || "",
    enrollment: {
      id: rosterRow.enrollmentId,
      orgId,
      schoolId: rosterRow.schoolId,
      academicYearId: rosterRow.academicYearId,
      studentId: rosterRow.studentId,
      gradeId: rosterRow.gradeId || classInfo.gradeId || "",
      streamId: rosterRow.streamId || classInfo.streamId || "",
      classId: rosterRow.classId,
      status: "ACTIVE",
    },
    classInfo,
  };
}

export function useVisibleStudents({
  orgId,
  visibleClasses,
  enabled = true,
}: UseVisibleStudentsOptions) {
  const visibleClassSignature = useMemo(
    () =>
      visibleClasses
        .map((item) =>
          makeClassKey({
            schoolId: item.schoolId,
            academicYearId: item.academicYearId,
            classId: item.id,
          }),
        )
        .sort()
        .join("|"),
    [visibleClasses],
  );
  const classByKey = useMemo(
    () =>
      new Map(
        visibleClasses.map((item) => [
          makeClassKey({
            schoolId: item.schoolId,
            academicYearId: item.academicYearId,
            classId: item.id,
          }),
          item,
        ]),
      ),
    [visibleClasses],
  );
  const canLoad = enabled && !!orgId;

  const loadVisibleStudents = useCallback(async (): Promise<VisibleStudentsData | null> => {
    if (!canLoad) return null;

    const roster = await getVisibleStudents({ orgId });
    const rows = roster.rows
      .map((rosterRow) => toVisibleStudentRow({ orgId, rosterRow, classByKey }))
      .sort((a, b) => a.displayName.localeCompare(b.displayName, "ar"));

    return {
      orgId,
      rows,
      totalCount: rows.length,
      classCount: new Set(
        rows.map((row) =>
          makeClassKey({
            schoolId: row.schoolId,
            academicYearId: row.academicYearId,
            classId: row.classId,
          }),
        ),
      ).size,
      schoolCount: new Set(rows.map((row) => row.schoolId)).size,
    };
  }, [canLoad, orgId, classByKey]);

  return useDocumentLoader<VisibleStudentsData>({
    enabled: canLoad,
    loader: loadVisibleStudents,
    deps: [orgId, visibleClassSignature],
  });
}
