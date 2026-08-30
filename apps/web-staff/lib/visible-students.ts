import { httpsCallable } from "firebase/functions";

import { functions } from "@/lib/firebase";

export type GetVisibleStudentsInput = {
  orgId: string;
};

export type VisibleStudentRosterRow = {
  studentId: string;
  enrollmentId: string;
  displayName: string;
  classId: string;
  schoolId: string;
  academicYearId: string;
  gradeId: string;
  streamId: string;
};

export type GetVisibleStudentsResult = {
  orgId: string;
  rows: VisibleStudentRosterRow[];
};

const getVisibleStudentsCallable = httpsCallable<
  GetVisibleStudentsInput,
  GetVisibleStudentsResult
>(functions, "getVisibleStudents");

export async function getVisibleStudents(
  input: GetVisibleStudentsInput,
): Promise<GetVisibleStudentsResult> {
  const response = await getVisibleStudentsCallable(input);

  return response.data;
}
