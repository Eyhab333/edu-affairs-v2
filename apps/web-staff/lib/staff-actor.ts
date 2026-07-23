import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
} from "firebase/firestore";

import type {
  AcademicTerm,
  Class,
  ClassSubjectOffering,
  Membership,
  MembershipPermissions,
  MembershipRole,
  MembershipScopes,
  OperationalAssignment,
  Person,
  School,
  TeacherAssignment,
  TeacherAssignmentClassLink,
} from "@takween/contracts";

import { db } from "@/lib/firebase";
import type { OrgSummary } from "@/hooks/use-org-summary";

import {
  buildStaffHome,
  getVisibleClassesForActor,
  type StaffHomeVisibleModule,
} from "@takween/domain";

export type StaffUserProfile = {
  uid: string;
  displayName?: string;
  email?: string;
  photoUrl?: string;
  personId?: string;
  isDisabled?: boolean;
};

export type StaffActorCurrentTerm = {
  id: string;
  orgId: string;
  academicYearId: string;
  title: string;
  shortTitle: string;
  order: number;
  status: string;
  isCurrent: boolean;
  startsAt?: number;
  endsAt?: number;
};

export type StaffActorData = {
  uid: string;
  orgId: string;
  org: OrgSummary | null;

  userProfile: StaffUserProfile | null;
  personId: string;
  person: Person | null;

  memberships: Membership[];
  roles: MembershipRole[];

  schools: School[];
  classes: Class[];
  visibleClasses: Class[];
  classSubjectOfferings: ClassSubjectOffering[];

  currentTerm: StaffActorCurrentTerm | null;
  currentTermsByAcademicYear: Record<string, StaffActorCurrentTerm>;

  operationalAssignments: OperationalAssignment[];
  teacherAssignments: TeacherAssignment[];
  teacherAssignmentClassLinks: TeacherAssignmentClassLink[];

  visibleModules: StaffHomeVisibleModule[];
};

const emptyScopes: MembershipScopes = {
  schoolIds: [],
  gradeIds: [],
  classIds: [],
  subjectKeys: [],
  routeIds: [],
  canAccessAllSchools: false,
};

const emptyPermissions: MembershipPermissions = {
  manageOrg: false,
  manageSchools: false,
  manageAcademicYears: false,
  manageGrades: false,
  manageClasses: false,
  manageSubjects: false,
  manageUsers: false,
  manageDirectory: false,
  manageAssignments: false,
  manageCases: false,
  manageEvaluations: false,
  manageDisplay: false,
  sendNotifications: false,

  viewGuardianFinance: false,
  manageGuardianFinance: false,
  recordGuardianPayments: false,
  applyGuardianFinanceAdjustments: false,
  voidGuardianPayments: false,
  viewGuardianFinanceReports: false,
  manageGuardianFinanceSettings: false,
};

function resolveMembershipIsActive(data: {
  isActive?: boolean;
  active?: boolean;
}) {
  if (typeof data.isActive === "boolean") return data.isActive;
  if (typeof data.active === "boolean") return data.active;
  return true;
}

function normalizeMembership(params: {
  id: string;
  uid: string;
  orgId: string;
  data: Record<string, unknown>;
}): Membership {
  const roleValue = params.data.roleKey ?? params.data.role;
  const role =
    typeof roleValue === "string" ? (roleValue as MembershipRole) : undefined;

  return {
    id: params.id,
    uid: params.uid,
    personId:
      typeof params.data.personId === "string" ? params.data.personId : "",
    orgId:
      typeof params.data.orgId === "string" ? params.data.orgId : params.orgId,

    role,
    roleKey: role,

    title: typeof params.data.title === "string" ? params.data.title : "",
    department:
      typeof params.data.department === "string" ? params.data.department : "",

    scopes: {
      ...emptyScopes,
      ...((params.data.scopes as Partial<MembershipScopes> | undefined) ?? {}),
    },

    permissions: {
      ...emptyPermissions,
      ...((params.data.permissions as
        | Partial<MembershipPermissions>
        | undefined) ?? {}),
    },

    scopeType: params.data.scopeType as Membership["scopeType"],
    scopeId: typeof params.data.scopeId === "string" ? params.data.scopeId : "",

    directEvaluatorPersonId:
      typeof params.data.directEvaluatorPersonId === "string"
        ? params.data.directEvaluatorPersonId
        : "",
    supervisorPersonId:
      typeof params.data.supervisorPersonId === "string"
        ? params.data.supervisorPersonId
        : "",
    managerPersonId:
      typeof params.data.managerPersonId === "string"
        ? params.data.managerPersonId
        : "",
    principalPersonId:
      typeof params.data.principalPersonId === "string"
        ? params.data.principalPersonId
        : "",
    vicePrincipalPersonId:
      typeof params.data.vicePrincipalPersonId === "string"
        ? params.data.vicePrincipalPersonId
        : "",

    startAt:
      typeof params.data.startAt === "number" ? params.data.startAt : undefined,
    endAt:
      typeof params.data.endAt === "number" ? params.data.endAt : undefined,

    isActive: resolveMembershipIsActive(params.data),

    createdAt:
      typeof params.data.createdAt === "number"
        ? params.data.createdAt
        : undefined,
    updatedAt:
      typeof params.data.updatedAt === "number"
        ? params.data.updatedAt
        : undefined,
  };
}

function chunkArray<T>(items: T[], chunkSize: number): T[][] {
  const chunks: T[][] = [];

  for (let index = 0; index < items.length; index += chunkSize) {
    chunks.push(items.slice(index, index + chunkSize));
  }

  return chunks;
}

function uniqueItems<T>(items: T[]): T[] {
  return Array.from(new Set(items));
}

function normalizeCurrentTerm(params: {
  id: string;
  orgId: string;
  academicYearId: string;
  data: Partial<AcademicTerm> & Record<string, unknown>;
}): StaffActorCurrentTerm {
  return {
    id: params.id,
    orgId:
      typeof params.data.orgId === "string" ? params.data.orgId : params.orgId,
    academicYearId:
      typeof params.data.academicYearId === "string"
        ? params.data.academicYearId
        : params.academicYearId,

    title: typeof params.data.title === "string" ? params.data.title : "",
    shortTitle:
      typeof params.data.shortTitle === "string" ? params.data.shortTitle : "",

    order: typeof params.data.order === "number" ? params.data.order : 1,

    status:
      typeof params.data.status === "string" ? params.data.status : "PLANNED",
    isCurrent:
      typeof params.data.isCurrent === "boolean"
        ? params.data.isCurrent
        : false,

    startsAt:
      typeof params.data.startsAt === "number"
        ? params.data.startsAt
        : undefined,
    endsAt:
      typeof params.data.endsAt === "number" ? params.data.endsAt : undefined,
  };
}

async function getOrgSummary(orgId: string): Promise<OrgSummary | null> {
  const orgRef = doc(db, "orgs", orgId);
  const orgSnap = await getDoc(orgRef);

  if (!orgSnap.exists()) return null;

  return {
    id: orgSnap.id,
    ...(orgSnap.data() as Omit<OrgSummary, "id">),
  };
}

async function getUserProfile(uid: string): Promise<StaffUserProfile | null> {
  const userRef = doc(db, "users", uid);
  const userSnap = await getDoc(userRef);

  if (!userSnap.exists()) {
    return {
      uid,
    };
  }

  return {
    uid,
    ...(userSnap.data() as Omit<StaffUserProfile, "uid">),
  };
}

async function getUserOrgMembership(params: {
  uid: string;
  orgId: string;
}): Promise<Membership | null> {
  const membershipRef = doc(
    db,
    "users",
    params.uid,
    "orgMemberships",
    params.orgId,
  );

  const membershipSnap = await getDoc(membershipRef);

  if (!membershipSnap.exists()) return null;

  return normalizeMembership({
    id: membershipSnap.id,
    uid: params.uid,
    orgId: params.orgId,
    data: membershipSnap.data(),
  });
}

// async function getOrgMembershipsForUser(params: {
//   uid: string;
//   orgId: string;
//   personId?: string;
// }): Promise<Membership[]> {
//   const memberships: Membership[] = [];

//   const userMembership = await getUserOrgMembership({
//     uid: params.uid,
//     orgId: params.orgId,
//   });

//   if (userMembership) {
//     memberships.push(userMembership);
//   }

//   try {
//     const orgMembershipsRef = collection(
//       db,
//       "orgs",
//       params.orgId,
//       "memberships",
//     );

//     const byUidSnap = await getDocs(
//       query(orgMembershipsRef, where("uid", "==", params.uid)),
//     );

//     byUidSnap.docs.forEach((item) => {
//       memberships.push(
//         normalizeMembership({
//           id: item.id,
//           uid: params.uid,
//           orgId: params.orgId,
//           data: item.data(),
//         }),
//       );
//     });

//     if (params.personId) {
//       const byPersonSnap = await getDocs(
//         query(orgMembershipsRef, where("personId", "==", params.personId)),
//       );

//       byPersonSnap.docs.forEach((item) => {
//         memberships.push(
//           normalizeMembership({
//             id: item.id,
//             uid: params.uid,
//             orgId: params.orgId,
//             data: item.data(),
//           }),
//         );
//       });
//     }
//   } catch (error) {
//     console.warn("Failed to load org memberships", error);
//   }

//   const unique = new Map<string, Membership>();

//   for (const membership of memberships) {
//     unique.set(
//       membership.id || `${membership.orgId}-${membership.role}`,
//       membership,
//     );
//   }

//   return Array.from(unique.values()).filter(
//     (membership) => membership.isActive !== false,
//   );
// }

async function getPerson(params: {
  orgId: string;
  personId: string;
}): Promise<Person | null> {
  if (!params.personId) return null;

  const personRef = doc(db, "orgs", params.orgId, "people", params.personId);
  const personSnap = await getDoc(personRef);

  if (!personSnap.exists()) return null;

  return {
    id: personSnap.id,
    ...(personSnap.data() as Omit<Person, "id">),
  };
}

async function getOperationalAssignments(params: {
  orgId: string;
  personId: string;
}): Promise<OperationalAssignment[]> {
  if (!params.personId) return [];

  const assignmentsRef = collection(
    db,
    "orgs",
    params.orgId,
    "operationalAssignments",
  );

  const snap = await getDocs(
    query(assignmentsRef, where("actorPersonId", "==", params.personId)),
  );

  return snap.docs.map((item) => ({
    id: item.id,
    ...(item.data() as Omit<OperationalAssignment, "id">),
  }));
}

async function getTeacherAssignments(params: {
  orgId: string;
  personId: string;
}): Promise<TeacherAssignment[]> {
  if (!params.personId) return [];

  const assignmentsRef = collection(
    db,
    "orgs",
    params.orgId,
    "teacherAssignments",
  );

  const snap = await getDocs(
    query(assignmentsRef, where("teacherPersonId", "==", params.personId)),
  );

  return snap.docs.map((item) => ({
    id: item.id,
    ...(item.data() as Omit<TeacherAssignment, "id">),
  }));
}

async function getTeacherAssignmentClassLinks(params: {
  orgId: string;
  assignmentIds: string[];
}): Promise<TeacherAssignmentClassLink[]> {
  if (!params.assignmentIds.length) return [];

  const linksRef = collection(
    db,
    "orgs",
    params.orgId,
    "teacherAssignmentClassLinks",
  );

  const chunks = chunkArray(params.assignmentIds, 10);
  const links: TeacherAssignmentClassLink[] = [];

  for (const chunk of chunks) {
    const snap = await getDocs(
      query(linksRef, where("assignmentId", "in", chunk)),
    );

    snap.docs.forEach((item) => {
      links.push({
        id: item.id,
        ...(item.data() as Omit<TeacherAssignmentClassLink, "id">),
      });
    });
  }

  return links;
}

function getMembershipSchoolIds(membership: Membership | null): string[] {
  if (!membership) return [];

  return uniqueItems([
    ...(membership.scopes?.schoolIds ?? []),
    ...(membership.scopeType === "SCHOOL" && membership.scopeId
      ? [membership.scopeId]
      : []),
  ]);
}

async function getOrgSchools(params: {
  orgId: string;
  allowedSchoolIds: string[] | null;
}): Promise<School[]> {
  try {
    const documents =
      params.allowedSchoolIds === null
        ? (await getDocs(collection(db, "orgs", params.orgId, "schools"))).docs
        : (
            await Promise.all(
              params.allowedSchoolIds.map((schoolId) =>
                getDoc(doc(db, "orgs", params.orgId, "schools", schoolId)),
              ),
            )
          ).filter((item) => item.exists());

    return documents
      .map((item) => ({
        id: item.id,
        ...(item.data() as Omit<School, "id">),
      }))
      .filter((school) => school.isArchived !== true)
      .sort((a, b) => (a.name ?? a.id).localeCompare(b.name ?? b.id, "ar"));
  } catch (error) {
    console.warn("Failed to load org schools", error);
    return [];
  }
}

async function getOrgClasses(params: {
  orgId: string;
  allowedSchoolIds: string[] | null;
}): Promise<Class[]> {
  try {
    const schoolIds =
      params.allowedSchoolIds ??
      (await getDocs(collection(db, "orgs", params.orgId, "schools"))).docs.map(
        (item) => item.id,
      );

    const allClasses: Class[] = [];

    for (const schoolId of schoolIds) {
      const academicYearsRef = collection(
        db,
        "orgs",
        params.orgId,
        "schools",
        schoolId,
        "academicYears",
      );

      const academicYearsSnap = await getDocs(academicYearsRef);

      for (const academicYearDoc of academicYearsSnap.docs) {
        const classesRef = collection(
          db,
          "orgs",
          params.orgId,
          "schools",
          schoolId,
          "academicYears",
          academicYearDoc.id,
          "classes",
        );

        const classesSnap = await getDocs(classesRef);

        classesSnap.docs.forEach((item) => {
          const data = item.data() as Omit<Class, "id">;

          allClasses.push({
            id: item.id,
            ...data,
          });
        });
      }
    }

    return allClasses
      .filter((classItem) => classItem.orgId === params.orgId)
      .filter((classItem) => classItem.isArchived !== true)
      .sort((a, b) => {
        if (a.schoolId !== b.schoolId) {
          return a.schoolId.localeCompare(b.schoolId);
        }

        if (a.academicYearId !== b.academicYearId) {
          return a.academicYearId.localeCompare(b.academicYearId);
        }

        return a.order - b.order;
      });
  } catch (error) {
    console.warn("Failed to load org classes", error);
    return [];
  }
}

async function getClassSubjectOfferings(params: {
  orgId: string;
  allowedSchoolIds: string[] | null;
}): Promise<ClassSubjectOffering[]> {
  try {
    const offeringsRef = collection(
      db,
      "orgs",
      params.orgId,
      "classSubjectOfferings",
    );

    const documents =
      params.allowedSchoolIds === null
        ? (await getDocs(offeringsRef)).docs
        : (
            await Promise.all(
              chunkArray(params.allowedSchoolIds, 10).map((schoolIds) =>
                getDocs(
                  query(offeringsRef, where("schoolId", "in", schoolIds)),
                ),
              ),
            )
          ).flatMap((snapshot) => snapshot.docs);

    return documents
      .map((item) => ({
        id: item.id,
        ...(item.data() as Omit<ClassSubjectOffering, "id">),
      }))
      .filter((offering) => offering.orgId === params.orgId)
      .filter((offering) => offering.isArchived !== true)
      .sort((a, b) => {
        if (a.schoolId !== b.schoolId) {
          return a.schoolId.localeCompare(b.schoolId);
        }

        if (a.academicYearId !== b.academicYearId) {
          return a.academicYearId.localeCompare(b.academicYearId);
        }

        if (a.classId !== b.classId) {
          return a.classId.localeCompare(b.classId);
        }

        return a.order - b.order;
      });
  } catch (error) {
    console.warn("Failed to load class subject offerings", error);
    return [];
  }
}

async function getCurrentTermsForAcademicYears(params: {
  orgId: string;
  academicYearIds: string[];
}): Promise<Record<string, StaffActorCurrentTerm>> {
  const result: Record<string, StaffActorCurrentTerm> = {};

  const academicYearIds = uniqueItems(
    params.academicYearIds.filter((item) => !!item),
  );

  for (const academicYearId of academicYearIds) {
    try {
      const termsRef = collection(
        db,
        "orgs",
        params.orgId,
        "academicYears",
        academicYearId,
        "terms",
      );

      const currentSnap = await getDocs(
        query(termsRef, where("isCurrent", "==", true)),
      );

      const currentTermDoc =
        currentSnap.docs[0] ??
        (await getDocs(query(termsRef, where("status", "==", "ACTIVE"))))
          .docs[0];

      if (!currentTermDoc) continue;

      result[academicYearId] = normalizeCurrentTerm({
        id: currentTermDoc.id,
        orgId: params.orgId,
        academicYearId,
        data: currentTermDoc.data(),
      });
    } catch (error) {
      console.warn(
        `Failed to load current academic term for ${academicYearId}`,
        error,
      );
    }
  }

  return result;
}

function getMembershipRole(membership: Membership): MembershipRole | undefined {
  return membership.roleKey ?? membership.role;
}

function getMembershipRoles(memberships: Membership[]): MembershipRole[] {
  return uniqueItems(
    memberships
      .map((membership) => getMembershipRole(membership))
      .filter((role): role is MembershipRole => !!role),
  );
}

function isOrgWideRole(role: MembershipRole) {
  return [
    "platform_owner",
    "platform_admin",
    "org_owner",
    "org_admin",
  ].includes(role);
}

function hasOrgWideAccess(roles: MembershipRole[]) {
  return roles.some((role) => isOrgWideRole(role));
}

function resolveVisibleModules(params: {
  roles: MembershipRole[];
  visibleClasses: Class[];
  operationalAssignments: OperationalAssignment[];
  teacherAssignments: TeacherAssignment[];
  memberships: Membership[];
  actorPersonId: string;
  orgId: string;
}): StaffHomeVisibleModule[] {
  const modules = new Set<StaffHomeVisibleModule>();

  const hasOrgWideRole = hasOrgWideAccess(params.roles);

  if (hasOrgWideRole) {
    return [
      "HOME",
      "CLASSES",
      "STUDENTS",
      "ATTENDANCE",
      "MEASUREMENTS",
      "LEARNING_LOSS",
      "NOTES",
      "CASES",
      "GAMIFICATION",
      "ACTIVITIES",
      "TRANSPORT",
      "EVALUATIONS",
      "MY_EVALUATIONS",
      "MESSAGES",
      "GUARDIAN_SERVICES",
    ];
  }

  const home = buildStaffHome({
    context: {
      actorPersonId: params.actorPersonId,
      orgId: params.orgId,
      memberships: params.memberships,
      operationalAssignments: params.operationalAssignments,
      teacherAssignments: params.teacherAssignments,
    },
    classes: params.visibleClasses,
    existingTasks: [],
  });

  home.visibleModules.forEach((moduleKey) => modules.add(moduleKey));

  modules.add("HOME");
  modules.add("MESSAGES");

  if (params.visibleClasses.length > 0) {
    modules.add("CLASSES");
    modules.add("STUDENTS");
  }

  return Array.from(modules);
}

export async function getStaffActorData(params: {
  uid: string;
  orgId: string;
}): Promise<StaffActorData> {
  const [org, userProfile] = await Promise.all([
    getOrgSummary(params.orgId),
    getUserProfile(params.uid),
  ]);

  const userMembership = await getUserOrgMembership({
    uid: params.uid,
    orgId: params.orgId,
  });

  const personId = userMembership?.personId || userProfile?.personId || "";
  const memberships: Membership[] =
    userMembership && userMembership.isActive !== false ? [userMembership] : [];

  const role = userMembership ? getMembershipRole(userMembership) : undefined;

  const orgWideSchoolAccess =
    !!role &&
    (isOrgWideRole(role) ||
      userMembership?.scopes?.canAccessAllSchools === true);

  const allowedSchoolIds = orgWideSchoolAccess
    ? null
    : getMembershipSchoolIds(userMembership);

  const [
    person,
    operationalAssignments,
    teacherAssignments,
    schools,
    classes,
    classSubjectOfferings,
  ] = await Promise.all([
    getPerson({
      orgId: params.orgId,
      personId,
    }),
    getOperationalAssignments({
      orgId: params.orgId,
      personId,
    }),
    getTeacherAssignments({
      orgId: params.orgId,
      personId,
    }),

    getOrgSchools({
      orgId: params.orgId,
      allowedSchoolIds,
    }),
    getOrgClasses({
      orgId: params.orgId,
      allowedSchoolIds,
    }),
    getClassSubjectOfferings({
      orgId: params.orgId,
      allowedSchoolIds,
    }),
  ]);

  const teacherAssignmentClassLinks = await getTeacherAssignmentClassLinks({
    orgId: params.orgId,
    assignmentIds: teacherAssignments.map((assignment) => assignment.id),
  });

  const roles = getMembershipRoles(memberships);

  const actorPersonId = personId || params.uid;

  const visibleClasses = hasOrgWideAccess(roles)
    ? classes
    : getVisibleClassesForActor({
        context: {
          actorPersonId,
          orgId: params.orgId,
          memberships,
          operationalAssignments,
          teacherAssignments,
          teacherAssignmentClassLinks,
        },
        classes,
        teacherAssignmentClassLinks,
      });

  const visibleModules = resolveVisibleModules({
    roles,
    visibleClasses,
    operationalAssignments,
    teacherAssignments,
    memberships,
    actorPersonId,
    orgId: params.orgId,
  });

  const academicYearIds = uniqueItems([
    ...classes.map((item) => item.academicYearId).filter(Boolean),
    ...classSubjectOfferings.map((item) => item.academicYearId).filter(Boolean),
  ]);

  const currentTermsByAcademicYear = await getCurrentTermsForAcademicYears({
    orgId: params.orgId,
    academicYearIds,
  });

  const currentTerm =
    Object.values(currentTermsByAcademicYear).sort(
      (a, b) => a.order - b.order,
    )[0] ?? null;

  return {
    uid: params.uid,
    orgId: params.orgId,
    org,

    userProfile,
    personId,
    person,

    memberships,
    roles,

    schools,
    classes,
    visibleClasses,
    classSubjectOfferings,

    currentTerm,
    currentTermsByAcademicYear,

    operationalAssignments,
    teacherAssignments,
    teacherAssignmentClassLinks,

    visibleModules,
  };
}

export function getStaffActorDisplayName(actor: StaffActorData | null) {
  return (
    actor?.person?.displayName ||
    actor?.userProfile?.displayName ||
    actor?.userProfile?.email ||
    actor?.uid ||
    "الموظف"
  );
}

export function getStaffActorPrimaryRole(actor: StaffActorData | null) {
  const membership = actor?.memberships.find(
    (item) => item.roleKey || item.role,
  );

  return membership?.roleKey ?? membership?.role ?? "";
}
