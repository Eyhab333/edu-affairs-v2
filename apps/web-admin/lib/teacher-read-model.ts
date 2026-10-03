import { httpsCallable } from "firebase/functions";

import { functions } from "@/lib/firebase";

export type TeacherMembership = {
  uid: string;
  role: string;
  roleKey: string;
  title: string;
  isActive: boolean;
  schoolIds: string[];
  schoolNames: string[];
};

export type TeacherDirectoryRow = {
  personId: string;
  displayName: string;
  email: string;
  employeeNumber: string;
  membership: TeacherMembership;
  membershipCount: number;
  hasIdentityMismatch: boolean;
  schoolIds: string[];
  schoolNames: string[];
  activeAssignmentCount: number;
};

export type TeacherDirectoryData = {
  orgName: string;
  schools: Array<{ id: string; name: string }>;
  rows: TeacherDirectoryRow[];
};

export type ResolvedTeacherAssignment = {
  id: string;
  schoolId: string;
  academicYearId: string;
  termId: string;
  classId: string;
  classSubjectOfferingId: string;
  subjectKey: string;
  subjectTitle: string;
  status: string;
  active: boolean | null;
  startAt: number;
  endAt: number;
  endedAt: number;
  createdAt: number;
  updatedAt: number;
  labels: {
    school: string;
    academicYear: string;
    term: string;
    className: string;
    subject: string;
  };
};

export type TeacherProfileData = {
  identity: {
    personId: string;
    displayName: string;
    nationalId: string;
    phone: string;
    email: string;
  };
  account: {
    uid: string;
    userProfileEmail: string;
    userProfileExists: boolean;
    membership: TeacherMembership;
    membershipCount: number;
    mirror: {
      exists: boolean;
      roleKey: string;
      isActive: boolean | null;
      schoolIds: string[];
      differs: boolean;
    };
    diagnostics: string[];
  };
  currentAssignments: ResolvedTeacherAssignment[];
  assignmentHistory: ResolvedTeacherAssignment[];
};

export async function loadTeacherDirectory(params: {
  orgId: string;
}): Promise<TeacherDirectoryData | null> {
  const call = httpsCallable<{ orgId: string }, TeacherDirectoryData | null>(
    functions,
    "getTeacherDirectory",
  );
  return (await call(params)).data;
}

export async function loadTeacherProfile(params: {
  orgId: string;
  personId: string;
}): Promise<TeacherProfileData | null> {
  const call = httpsCallable<
    { orgId: string; personId: string },
    TeacherProfileData | null
  >(functions, "getTeacherProfile");
  return (await call(params)).data;
}
