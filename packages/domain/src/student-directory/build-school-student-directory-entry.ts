import {
  SchoolStudentDirectoryEntrySchema,
  type SchoolStudentDirectoryEntry,
} from "@takween/contracts";

export type BuildSchoolStudentDirectoryEntryInput = {
  orgId: string;
  schoolId: string;

  studentId: string;
  personId?: string;

  displayName: string;
  nationalId?: string;
  phone?: string;
  email?: string;

  isActive?: boolean;
  updatedAtIso: string;
};

export function buildSchoolStudentDirectoryEntry(
  input: BuildSchoolStudentDirectoryEntryInput,
): SchoolStudentDirectoryEntry {
  return SchoolStudentDirectoryEntrySchema.parse({
    orgId: input.orgId,
    schoolId: input.schoolId,

    studentId: input.studentId,
    personId: input.personId ?? "",

    displayName: input.displayName,
    nationalId: input.nationalId ?? "",
    phone: input.phone ?? "",
    email: input.email ?? "",

    isActive: input.isActive ?? true,

    version: 1,
    updatedAtIso: input.updatedAtIso,
  });
}