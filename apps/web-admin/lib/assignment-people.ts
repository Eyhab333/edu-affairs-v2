export type SchoolTypeValue = "PRIMARY" | "KG";
export type SchoolTrackValue = "BOYS" | "GIRLS" | "MIXED";

export type AssignmentPersonRow = {
  id: string;
  displayName: string;
};

export type OperationalMembershipRow = {
  id: string;
  personId?: string;
  role?: string;
  roleKey?: string;
  title?: string;
  isActive?: boolean;
  scopeType?: string;
  scopeId?: string;
  scopes?: {
    schoolIds?: string[];
    canAccessAllSchools?: boolean;
  };
};

export type AssignmentPersonOption = {
  id: string;
  displayName: string;
  roleKey: string;
  title?: string;
};

function normalizeRoleKey(row: OperationalMembershipRow): string {
  return String(row.roleKey || row.role || "").trim();
}

function membershipMatchesSchool(
  row: OperationalMembershipRow,
  schoolId: string
): boolean {
  const scopeType = String(row.scopeType || "").trim();
  const scopeId = String(row.scopeId || "").trim();
  const schoolIds = Array.isArray(row.scopes?.schoolIds)
    ? row.scopes?.schoolIds
    : [];

  if (row.scopes?.canAccessAllSchools) return true;
  if (scopeType === "ORG") return true;
  if (scopeType === "SCHOOL" && scopeId === schoolId) return true;
  if (schoolIds.includes(schoolId)) return true;

  return false;
}

function getTeacherRoleKeys(
  schoolType: SchoolTypeValue,
  schoolTrack?: SchoolTrackValue
): Set<string> {
  if (schoolType === "KG") {
    return new Set(["KG_TEACHER", "KG_VALUES_COORD"]);
  }

  if (schoolTrack === "BOYS") {
    return new Set(["BOYS_TEACHER"]);
  }

  if (schoolTrack === "GIRLS") {
    return new Set(["GIRLS_TEACHER"]);
  }

  return new Set(["BOYS_TEACHER", "GIRLS_TEACHER", "teacher"]);
}

function getSupervisorRoleKeys(
  schoolType: SchoolTypeValue,
  schoolTrack?: SchoolTrackValue
): Set<string> {
  if (schoolType === "KG") {
    return new Set([
      "ORG_SUPERVISION_HEAD",
      "ADMIN_SUPERVISOR",
      "KG_PRINCIPAL",
      "KG_VP",
      "KG_EDU_SUPERVISOR",
      "KG_VALUES_COORD",
    ]);
  }

  if (schoolTrack === "BOYS") {
    return new Set([
      "ORG_SUPERVISION_HEAD",
      "ADMIN_SUPERVISOR",
      "BOYS_PRINCIPAL",
      "BOYS_EDU_VP",
      "BOYS_TEACHERS_VP",
      "BOYS_EDU_SUPERVISOR",
      "BOYS_STUDENT_GUIDE",
      "BOYS_STUDENTS_VP",
    ]);
  }

  if (schoolTrack === "GIRLS") {
    return new Set([
      "ORG_SUPERVISION_HEAD",
      "ADMIN_SUPERVISOR",
      "GIRLS_PRINCIPAL",
      "GIRLS_VP",
      "GIRLS_EDU_SUPERVISOR",
      "GIRLS_STUDENT_COUNSELOR",
    ]);
  }

  return new Set([
    "ORG_SUPERVISION_HEAD",
    "ADMIN_SUPERVISOR",
    "BOYS_PRINCIPAL",
    "GIRLS_PRINCIPAL",
    "KG_PRINCIPAL",
  ]);
}

function sortOptions(options: AssignmentPersonOption[]) {
  return [...options].sort((a, b) =>
    a.displayName.localeCompare(b.displayName, "ar")
  );
}

export function buildAssignmentPersonOptions(args: {
  people: AssignmentPersonRow[];
  memberships: OperationalMembershipRow[];
  schoolType: SchoolTypeValue;
  schoolTrack?: SchoolTrackValue;
  schoolId: string;
}) {
  const peopleMap = new Map(args.people.map((item) => [item.id, item]));
  const teacherRoleKeys = getTeacherRoleKeys(args.schoolType, args.schoolTrack);
  const supervisorRoleKeys = getSupervisorRoleKeys(
    args.schoolType,
    args.schoolTrack
  );

  const teacherMap = new Map<string, AssignmentPersonOption>();
  const supervisorMap = new Map<string, AssignmentPersonOption>();

  for (const membership of args.memberships) {
    if (membership.isActive === false) continue;
    if (!membership.personId) continue;
    if (!membershipMatchesSchool(membership, args.schoolId)) continue;

    const person = peopleMap.get(membership.personId);
    if (!person) continue;

    const roleKey = normalizeRoleKey(membership);
    if (!roleKey) continue;

    const option: AssignmentPersonOption = {
      id: person.id,
      displayName: person.displayName,
      roleKey,
      title: membership.title || "",
    };

    if (teacherRoleKeys.has(roleKey) && !teacherMap.has(person.id)) {
      teacherMap.set(person.id, option);
    }

    if (supervisorRoleKeys.has(roleKey) && !supervisorMap.has(person.id)) {
      supervisorMap.set(person.id, option);
    }
  }

  return {
    teacherOptions: sortOptions(Array.from(teacherMap.values())),
    supervisorOptions: sortOptions(Array.from(supervisorMap.values())),
  };
}