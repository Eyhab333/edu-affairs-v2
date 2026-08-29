import { httpsCallable } from "firebase/functions";

import { functions } from "@/lib/firebase";

export type GetClassRosterInput = {
  orgId: string;
  schoolId: string;
  academicYearId: string;
  classId: string;
};

export type ClassRosterRow = {
  studentId: string;
  enrollmentId: string;
  displayName: string;
};

export type GetClassRosterResult = GetClassRosterInput & {
  rows: ClassRosterRow[];
};

const getClassRosterCallable = httpsCallable<
  GetClassRosterInput,
  GetClassRosterResult
>(functions, "getClassRoster");

export async function getClassRoster(
  input: GetClassRosterInput,
): Promise<GetClassRosterResult> {
  const response = await getClassRosterCallable(input);

  return response.data;
}
