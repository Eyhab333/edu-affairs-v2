"use client";

import { useCallback } from "react";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  type QueryConstraint,
} from "firebase/firestore";

import { db } from "@/lib/firebase";
import { useDocumentLoader } from "@/hooks/use-document-loader";

import type { SchoolStudentDirectoryEntry } from "@takween/contracts";

export type ClassStudentEnrollmentRow = {
  id: string;
  orgId?: string;
  schoolId?: string;
  academicYearId?: string;
  studentId: string;
  gradeId?: string;
  streamId?: string;
  classId?: string;
  status?: string;
  startAt?: number;
  endAt?: number;
};

export type ClassStudentRecord = {
  id: string;
  personId?: string;
  orgId?: string;
  isArchived?: boolean;
};

export type ClassStudentPerson = {
  id: string;
  displayName?: string;
  nationalId?: string;
  phone?: string;
  email?: string;
};

export type ClassStudentRow = {
  id: string;
  studentId: string;
  enrollmentId: string;

  displayName: string;
  nationalId: string;
  phone: string;
  email: string;

  enrollment: ClassStudentEnrollmentRow;
  student: ClassStudentRecord | null;
  person: ClassStudentPerson | null;

  studentExists: boolean;
  personExists: boolean;
};

export type ClassStudentsData = {
  orgId: string;
  classId: string;
  schoolId: string;
  academicYearId: string;
  rows: ClassStudentRow[];
  totalCount: number;
  missingStudentCount: number;
  missingPersonCount: number;
};

type UseClassStudentsOptions = {
  orgId: string;
  classId: string;
  schoolId?: string | null;
  academicYearId?: string | null;
  enabled?: boolean;
};

function getDisplayName(params: {
  person: ClassStudentPerson | null;
  student: ClassStudentRecord | null;
  enrollment: ClassStudentEnrollmentRow;
}) {
  return (
    params.person?.displayName ||
    params.student?.id ||
    params.enrollment.studentId ||
    "طالب غير مكتمل البيانات"
  );
}

function normalizeText(value: string) {
  return value.trim().toLowerCase();
}

function sortRows(a: ClassStudentRow, b: ClassStudentRow) {
  return normalizeText(a.displayName).localeCompare(
    normalizeText(b.displayName),
    "ar",
  );
}

async function getStudentFromDirectory(params: {
  orgId: string;
  schoolId: string;
  enrollment: ClassStudentEnrollmentRow;
}): Promise<ClassStudentRow> {
  const { orgId, schoolId, enrollment } = params;

  const directoryRef = doc(
    db,
    "orgs",
    orgId,
    "schools",
    schoolId,
    "studentDirectory",
    enrollment.studentId,
  );

  const directorySnap = await getDoc(directoryRef);

  const directory = directorySnap.exists()
    ? (directorySnap.data() as SchoolStudentDirectoryEntry)
    : null;

  return {
    id: enrollment.studentId,
    studentId: enrollment.studentId,
    enrollmentId: enrollment.id,

    displayName:
      directory?.displayName ||
      // enrollment.studentDisplayName ||
      enrollment.studentId,

    nationalId: directory?.nationalId ?? "",
    phone: directory?.phone ?? "",
    email: directory?.email ?? "",

    enrollment,
    student: null,
    person: null,

    studentExists: directory !== null,
    personExists: Boolean(directory?.personId),
  };
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
      if (!canLoad) return null;

      const constraints: QueryConstraint[] = [
        where("classId", "==", classId),
        where("status", "==", "ACTIVE"),
      ];

      if (schoolId) {
        constraints.push(where("schoolId", "==", schoolId));
      }

      if (academicYearId) {
        constraints.push(where("academicYearId", "==", academicYearId));
      }

      const enrollmentsRef = collection(
        db,
        "orgs",
        orgId,
        "studentEnrollments",
      );

      const enrollmentsSnap = await getDocs(
        query(enrollmentsRef, ...constraints),
      );

      const enrollments = enrollmentsSnap.docs
        .map((item) => {
          const data = item.data() as Omit<ClassStudentEnrollmentRow, "id">;

          return {
            id: item.id,
            ...data,
          };
        })
        .filter((item) => item.studentId)
        .filter((item) => item.classId === classId)
        .filter((item) => item.status === "ACTIVE");

      const rows = await Promise.all(
        enrollments.map((enrollment) =>
          getStudentFromDirectory({
            orgId,
            schoolId: schoolId!,
            enrollment,
          }),
        ),
      );

      const sortedRows = rows.sort(sortRows);

      return {
        orgId,
        classId,
        schoolId: schoolId ?? "",
        academicYearId: academicYearId ?? "",
        rows: sortedRows,
        totalCount: sortedRows.length,
        missingStudentCount: sortedRows.filter((row) => !row.studentExists)
          .length,
        missingPersonCount: sortedRows.filter((row) => !row.personExists)
          .length,
      };
    }, [canLoad, orgId, classId, schoolId, academicYearId]);

  return useDocumentLoader<ClassStudentsData>({
    enabled: canLoad,
    loader: loadClassStudents,
    deps: [orgId, classId, schoolId, academicYearId],
  });
}
