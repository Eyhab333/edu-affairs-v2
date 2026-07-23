"use client";

import { useCallback, useMemo } from "react";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
} from "firebase/firestore";

import { db } from "@/lib/firebase";
import { useDocumentLoader } from "@/hooks/use-document-loader";

import type { SchoolStudentDirectoryEntry } from "@takween/contracts";

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

export type VisibleStudentRecord = {
  id: string;
  personId?: string;
  orgId?: string;
  isArchived?: boolean;
};

export type VisibleStudentPerson = {
  id: string;
  displayName?: string;
  nationalId?: string;
  phone?: string;
  email?: string;
};

export type VisibleStudentRow = {
  id: string;
  studentId: string;
  enrollmentId: string;

  displayName: string;
  nationalId: string;
  phone: string;
  email: string;

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
  student: VisibleStudentRecord | null;
  person: VisibleStudentPerson | null;
  classInfo: VisibleStudentClass;

  studentExists: boolean;
  personExists: boolean;
};

export type VisibleStudentsData = {
  orgId: string;
  rows: VisibleStudentRow[];
  totalCount: number;
  classCount: number;
  schoolCount: number;
  missingStudentCount: number;
  missingPersonCount: number;
};

type UseVisibleStudentsOptions = {
  orgId: string;
  visibleClasses: VisibleStudentClass[];
  enabled?: boolean;
};

function makeExactClassKey(params: {
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

function getDisplayName(params: {
  person: VisibleStudentPerson | null;
  student: VisibleStudentRecord | null;
  enrollment: VisibleStudentEnrollmentRow;
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

function sortRows(a: VisibleStudentRow, b: VisibleStudentRow) {
  const classCompare = normalizeText(a.classTitle).localeCompare(
    normalizeText(b.classTitle),
    "ar",
  );

  if (classCompare !== 0) return classCompare;

  return normalizeText(a.displayName).localeCompare(
    normalizeText(b.displayName),
    "ar",
  );
}

function createClassLookups(visibleClasses: VisibleStudentClass[]) {
  const classByExactKey = new Map<string, VisibleStudentClass>();
  const classById = new Map<string, VisibleStudentClass>();
  const classIdCounts = new Map<string, number>();

  for (const item of visibleClasses) {
    const exactKey = makeExactClassKey({
      schoolId: item.schoolId,
      academicYearId: item.academicYearId,
      classId: item.id,
    });

    classByExactKey.set(exactKey, item);
    classById.set(item.id, item);
    classIdCounts.set(item.id, (classIdCounts.get(item.id) ?? 0) + 1);
  }

  return {
    classByExactKey,
    classById,
    classIdCounts,
  };
}

function resolveClassForEnrollment(params: {
  enrollment: VisibleStudentEnrollmentRow;
  classByExactKey: Map<string, VisibleStudentClass>;
  classById: Map<string, VisibleStudentClass>;
  classIdCounts: Map<string, number>;
}) {
  const { enrollment, classByExactKey, classById, classIdCounts } = params;

  if (!enrollment.classId) return null;

  const exactKey = makeExactClassKey({
    schoolId: enrollment.schoolId,
    academicYearId: enrollment.academicYearId,
    classId: enrollment.classId,
  });

  const exactMatch = classByExactKey.get(exactKey);

  if (exactMatch) return exactMatch;

  const classIdCount = classIdCounts.get(enrollment.classId) ?? 0;

  if (classIdCount === 1) {
    return classById.get(enrollment.classId) ?? null;
  }

  return null;
}

async function getStudentFromDirectory(params: {
  orgId: string;
  schoolId: string;
  enrollment: VisibleStudentEnrollmentRow;
  classInfo: VisibleStudentClass;
}): Promise<VisibleStudentRow> {
  const { orgId, schoolId, enrollment, classInfo } = params;

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

  const classId = enrollment.classId || classInfo.id;
  const academicYearId =
    enrollment.academicYearId || classInfo.academicYearId || "";
  const gradeId = enrollment.gradeId || classInfo.gradeId || "";
  const streamId = enrollment.streamId || classInfo.streamId || "";

  return {
    id: `${enrollment.id}:${enrollment.studentId}`,
    studentId: enrollment.studentId,
    enrollmentId: enrollment.id,

    displayName: directory?.displayName || enrollment.studentId,

    nationalId: directory?.nationalId ?? "",
    phone: directory?.phone ?? "",
    email: directory?.email ?? "",

    classId,
    classTitle: getClassTitle(classInfo),

    schoolId,
    schoolName: classInfo.schoolName || schoolId,

    academicYearId,
    academicYearTitle: classInfo.academicYearTitle || academicYearId,

    gradeId,
    gradeTitle: classInfo.gradeTitle || gradeId,
    streamId,

    enrollment,
    student: null,
    person: null,
    classInfo,

    studentExists: directory !== null,
    personExists: Boolean(directory?.personId),
  };
}

export function useVisibleStudents({
  orgId,
  visibleClasses,
  enabled = true,
}: UseVisibleStudentsOptions) {
  const visibleClassSignature = useMemo(() => {
    return visibleClasses
      .map((item) =>
        makeExactClassKey({
          schoolId: item.schoolId,
          academicYearId: item.academicYearId,
          classId: item.id,
        }),
      )
      .sort()
      .join("|");
  }, [visibleClasses]);

  const classLookups = useMemo(() => {
    return createClassLookups(visibleClasses);
  }, [visibleClasses]);

  const visibleSchoolIds = useMemo(() => {
    return Array.from(
      new Set(
        visibleClasses
          .map((item) => item.schoolId)
          .filter((schoolId): schoolId is string => Boolean(schoolId)),
      ),
    );
  }, [visibleClasses]);

  const canLoad =
    enabled &&
    !!orgId &&
    visibleClasses.length > 0 &&
    visibleSchoolIds.length > 0;

  const loadVisibleStudents =
    useCallback(async (): Promise<VisibleStudentsData | null> => {
      if (!canLoad) return null;

      const enrollmentsRef = collection(
        db,
        "orgs",
        orgId,
        "studentEnrollments",
      );

      const enrollmentSnapshots = await Promise.all(
        visibleSchoolIds.map((schoolId) =>
          getDocs(
            query(
              enrollmentsRef,
              where("schoolId", "==", schoolId),
              where("status", "==", "ACTIVE"),
            ),
          ),
        ),
      );

      const enrollmentDocuments = enrollmentSnapshots.flatMap(
        (snapshot) => snapshot.docs,
      );

      const visibleEnrollments = enrollmentDocuments

        .map((item) => {
          const data = item.data() as Omit<VisibleStudentEnrollmentRow, "id">;

          return {
            id: item.id,
            ...data,
          };
        })
        .filter((item) => item.studentId)
        .map((enrollment) => {
          const classInfo = resolveClassForEnrollment({
            enrollment,
            classByExactKey: classLookups.classByExactKey,
            classById: classLookups.classById,
            classIdCounts: classLookups.classIdCounts,
          });

          return {
            enrollment,
            classInfo,
          };
        })
        .filter(
          (
            item,
          ): item is {
            enrollment: VisibleStudentEnrollmentRow;
            classInfo: VisibleStudentClass;
          } => item.classInfo !== null,
        );

      const rows = await Promise.all(
        visibleEnrollments.map(({ enrollment, classInfo }) => {
          const resolvedSchoolId = enrollment.schoolId || classInfo.schoolId;

          if (!resolvedSchoolId) {
            throw new Error(
              `لا يمكن تحديد المدرسة للطالب ${enrollment.studentId}`,
            );
          }

          return getStudentFromDirectory({
            orgId,
            schoolId: resolvedSchoolId,
            enrollment,
            classInfo,
          });
        }),
      );

      const sortedRows = rows.sort(sortRows);

      return {
        orgId,
        rows: sortedRows,
        totalCount: sortedRows.length,
        classCount: new Set(sortedRows.map((row) => row.classId)).size,
        schoolCount: new Set(sortedRows.map((row) => row.schoolId)).size,
        missingStudentCount: sortedRows.filter((row) => !row.studentExists)
          .length,
        missingPersonCount: sortedRows.filter((row) => !row.personExists)
          .length,
      };
    }, [canLoad, orgId, classLookups, visibleSchoolIds]);

  return useDocumentLoader<VisibleStudentsData>({
    enabled: canLoad,
    loader: loadVisibleStudents,
    deps: [orgId, visibleClassSignature],
  });
}
