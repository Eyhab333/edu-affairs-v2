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
import type { VisibleStudentClass } from "@/hooks/use-visible-students";
import type { SchoolStudentDirectoryEntry } from "@takween/contracts";
export type StaffStudentEnrollmentRow = {
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

export type StaffStudentRecord = {
  id: string;
  personId?: string;
  orgId?: string;
  isArchived?: boolean;
};

export type StaffStudentPerson = {
  id: string;
  displayName?: string;
  nationalId?: string;
  phone?: string;
  email?: string;
};

export type StaffStudentProfileData = {
  orgId: string;
  studentId: string;

  displayName: string;
  nationalId: string;
  phone: string;
  email: string;

  enrollment: StaffStudentEnrollmentRow;
  student: StaffStudentRecord | null;
  person: StaffStudentPerson | null;
  classInfo: VisibleStudentClass;

  classId: string;
  classTitle: string;
  schoolId: string;
  schoolName: string;
  academicYearId: string;
  academicYearTitle: string;
  gradeId: string;
  gradeTitle: string;
  streamId: string;

  studentExists: boolean;
  personExists: boolean;
};

type UseStaffStudentProfileOptions = {
  orgId: string;
  studentId: string;
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
  person: StaffStudentPerson | null;
  student: StaffStudentRecord | null;
  enrollment: StaffStudentEnrollmentRow;
}) {
  return (
    params.person?.displayName ||
    params.student?.id ||
    params.enrollment.studentId ||
    "طالب غير مكتمل البيانات"
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
  enrollment: StaffStudentEnrollmentRow;
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

function chooseBestVisibleEnrollment(params: {
  enrollments: StaffStudentEnrollmentRow[];
  classByExactKey: Map<string, VisibleStudentClass>;
  classById: Map<string, VisibleStudentClass>;
  classIdCounts: Map<string, number>;
}) {
  const { enrollments, classByExactKey, classById, classIdCounts } = params;

  for (const enrollment of enrollments) {
    const classInfo = resolveClassForEnrollment({
      enrollment,
      classByExactKey,
      classById,
      classIdCounts,
    });

    if (classInfo) {
      return {
        enrollment,
        classInfo,
      };
    }
  }

  return null;
}

async function buildStudentProfileFromDirectory(params: {
  orgId: string;
  enrollment: StaffStudentEnrollmentRow;
  classInfo: VisibleStudentClass;
}): Promise<StaffStudentProfileData> {
  const { orgId, enrollment, classInfo } = params;

  const schoolId = enrollment.schoolId || classInfo.schoolId;

  if (!schoolId) {
    throw new Error(`لا يمكن تحديد مدرسة الطالب ${enrollment.studentId}`);
  }

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
    orgId,
    studentId: enrollment.studentId,

    displayName: directory?.displayName || enrollment.studentId,

    nationalId: directory?.nationalId ?? "",
    phone: directory?.phone ?? "",
    email: directory?.email ?? "",

    enrollment,
    student: null,
    person: null,
    classInfo,

    classId,
    classTitle: getClassTitle(classInfo),

    schoolId,
    schoolName: classInfo.schoolName || schoolId,

    academicYearId,
    academicYearTitle: classInfo.academicYearTitle || academicYearId,

    gradeId,
    gradeTitle: classInfo.gradeTitle || gradeId,
    streamId,

    studentExists: directory !== null,
    personExists: Boolean(directory?.personId),
  };
}

export function useStaffStudentProfile({
  orgId,
  studentId,
  visibleClasses,
  enabled = true,
}: UseStaffStudentProfileOptions) {
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
    !!studentId &&
    visibleClasses.length > 0 &&
    visibleSchoolIds.length > 0;

  const loadStudentProfile =
    useCallback(async (): Promise<StaffStudentProfileData | null> => {
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
              where("studentId", "==", studentId),
              where("status", "==", "ACTIVE"),
            ),
          ),
        ),
      );

      const enrollmentDocuments = enrollmentSnapshots.flatMap(
        (snapshot) => snapshot.docs,
      );

      const activeEnrollments = enrollmentDocuments

        .map((item) => {
          const data = item.data() as Omit<StaffStudentEnrollmentRow, "id">;

          return {
            id: item.id,
            ...data,
          };
        })
        .filter((item) => item.studentId === studentId)
        .filter((item) => item.status === "ACTIVE");

      if (activeEnrollments.length === 0) {
        return null;
      }

      const selected = chooseBestVisibleEnrollment({
        enrollments: activeEnrollments,
        classByExactKey: classLookups.classByExactKey,
        classById: classLookups.classById,
        classIdCounts: classLookups.classIdCounts,
      });

      if (!selected) {
        return null;
      }

      return buildStudentProfileFromDirectory({
        orgId,
        enrollment: selected.enrollment,
        classInfo: selected.classInfo,
      });
    }, [canLoad, orgId, studentId, classLookups, visibleSchoolIds]);

  return useDocumentLoader<StaffStudentProfileData>({
    enabled: canLoad,
    loader: loadStudentProfile,
    deps: [orgId, studentId, visibleClassSignature],
  });
}
