import assert from "node:assert/strict";

import type {
  OperationalAssignment,
  PersonSupervisionScope,
} from "@takween/contracts";
import {
  resolveStaffAuthority,
  type StaffAuthorityTarget,
  type StaffAuthorityViewer,
} from "@takween/domain";

const kg01Principal: StaffAuthorityViewer = {
  orgId: "org-1",
  personId: "kg-01-principal",
  roles: ["KG_PRINCIPAL"],
  homeSchoolIds: ["kg-01"],
  operationalAssignments: [],
  supervisionScopes: [],
};

// Regression: historical PDF snapshots may still reference kg-01, but the
// callable passes only this current live membership context to the resolver.
const alHumaidanCurrentTarget: StaffAuthorityTarget = {
  personId: "p-s-alhumaidan",
  roles: ["GIRLS_TEACHER"],
  homeSchoolIds: ["mrb-girls"],
  authorityPersonIds: [],
};

assert.deepEqual(
  resolveStaffAuthority({
    viewer: kg01Principal,
    target: alHumaidanCurrentTarget,
    nowMs: 1,
  }),
  { allowed: false, source: "NONE" },
);

const kg01Teacher: StaffAuthorityTarget = {
  ...alHumaidanCurrentTarget,
  personId: "kg-01-teacher",
  roles: ["KG_TEACHER"],
  homeSchoolIds: ["kg-01"],
};
assert.equal(
  resolveStaffAuthority({
    viewer: kg01Principal,
    target: kg01Teacher,
    nowMs: 1,
  }).allowed,
  true,
);

console.log("Staff PDF scope live-membership regression tests passed.");

function supervisionScope(params: {
  capability: "STAFF_WORK_VIEW" | "TEACHER_WORK_VIEW";
  subjectScope: "ALL_SUBJECTS" | "SUBJECT_KEYS";
  subjectKeys?: string[];
  schoolId?: string;
  isActive?: boolean;
}): PersonSupervisionScope {
  return {
    id: "scope-1",
    orgId: "org-1",
    personId: "math-science-supervisor",
    capability: params.capability,
    schoolId: params.schoolId ?? "mrb-boys-sayh",
    subjectScope: params.subjectScope,
    subjectKeys: params.subjectKeys ?? [],
    isActive: params.isActive ?? true,
  } as PersonSupervisionScope;
}

const mathScienceSupervisor: StaffAuthorityViewer = {
  orgId: "org-1",
  personId: "math-science-supervisor",
  roles: ["EDU_SUPERVISOR"],
  homeSchoolIds: [],
  operationalAssignments: [],
  supervisionScopes: [
    supervisionScope({
      capability: "TEACHER_WORK_VIEW",
      subjectScope: "SUBJECT_KEYS",
      subjectKeys: ["MATH", "SCIENCE"],
    }),
  ],
};

function boysTeacher(subjectKeys: string[]): StaffAuthorityTarget {
  return {
    personId: `teacher-${subjectKeys.join("-").toLowerCase() || "none"}`,
    roles: ["BOYS_TEACHER"],
    homeSchoolIds: ["mrb-boys-sayh"],
    subjectKeys,
  };
}

assert.equal(
  resolveStaffAuthority({ viewer: mathScienceSupervisor, target: boysTeacher(["MATH"]), nowMs: 1 }).allowed,
  true,
);
assert.equal(
  resolveStaffAuthority({ viewer: mathScienceSupervisor, target: boysTeacher(["SCIENCE"]), nowMs: 1 }).allowed,
  true,
);
assert.equal(
  resolveStaffAuthority({ viewer: mathScienceSupervisor, target: boysTeacher(["ENGLISH"]), nowMs: 1 }).allowed,
  false,
);

const englishSupervisor: StaffAuthorityViewer = {
  ...mathScienceSupervisor,
  personId: "english-supervisor",
  supervisionScopes: [
    {
      ...supervisionScope({
        capability: "TEACHER_WORK_VIEW",
        subjectScope: "SUBJECT_KEYS",
        subjectKeys: ["ENGLISH"],
      }),
      personId: "english-supervisor",
    },
  ],
};
assert.equal(
  resolveStaffAuthority({ viewer: englishSupervisor, target: boysTeacher(["ENGLISH"]), nowMs: 1 }).allowed,
  true,
);
assert.equal(
  resolveStaffAuthority({ viewer: englishSupervisor, target: boysTeacher(["MATH"]), nowMs: 1 }).allowed,
  false,
);

const allSubjectsSupervisor: StaffAuthorityViewer = {
  ...mathScienceSupervisor,
  personId: "all-subjects-supervisor",
  supervisionScopes: [
    {
      ...supervisionScope({
        capability: "TEACHER_WORK_VIEW",
        subjectScope: "ALL_SUBJECTS",
      }),
      personId: "all-subjects-supervisor",
    },
  ],
};
assert.equal(
  resolveStaffAuthority({ viewer: allSubjectsSupervisor, target: boysTeacher(["ENGLISH"]), nowMs: 1 }).allowed,
  true,
);
assert.equal(
  resolveStaffAuthority({
    viewer: mathScienceSupervisor,
    target: { ...boysTeacher(["MATH"]), homeSchoolIds: ["mrb-boys-faleh"] },
    nowMs: 1,
  }).allowed,
  false,
);
assert.equal(
  resolveStaffAuthority({
    viewer: mathScienceSupervisor,
    target: { personId: "local-staff", roles: ["staff"], homeSchoolIds: ["mrb-boys-sayh"] },
    nowMs: 1,
  }).allowed,
  false,
);

const staffScopeSupervisor: StaffAuthorityViewer = {
  ...mathScienceSupervisor,
  personId: "staff-scope-supervisor",
  supervisionScopes: [
    {
      ...supervisionScope({
        capability: "STAFF_WORK_VIEW",
        subjectScope: "ALL_SUBJECTS",
      }),
      personId: "staff-scope-supervisor",
    },
  ],
};
assert.equal(
  resolveStaffAuthority({
    viewer: staffScopeSupervisor,
    target: { personId: "local-staff", roles: ["staff"], homeSchoolIds: ["mrb-boys-sayh"] },
    nowMs: 1,
  }).allowed,
  true,
);
assert.equal(
  resolveStaffAuthority({ viewer: staffScopeSupervisor, target: boysTeacher(["MATH"]), nowMs: 1 }).allowed,
  false,
);

const ordinaryTeacher: StaffAuthorityViewer = {
  ...mathScienceSupervisor,
  personId: "teacher-viewer",
  roles: ["BOYS_TEACHER"],
  homeSchoolIds: ["mrb-boys-sayh"],
  supervisionScopes: [],
};
assert.equal(
  resolveStaffAuthority({ viewer: ordinaryTeacher, target: boysTeacher(["MATH"]), nowMs: 1 }).allowed,
  false,
);

const explicitViewer: StaffAuthorityViewer = {
  ...mathScienceSupervisor,
  operationalAssignments: [
    {
      actorPersonId: "math-science-supervisor",
      status: "ACTIVE",
      permissions: ["VIEW"],
      targetPersonIds: ["teacher-english"],
    } as OperationalAssignment,
  ],
};
assert.equal(
  resolveStaffAuthority({
    viewer: explicitViewer,
    target: { ...boysTeacher(["ENGLISH"]), personId: "teacher-english" },
    nowMs: 1,
  }).source,
  "EXPLICIT_OPERATIONAL_ASSIGNMENT",
);

const inactiveScopeViewer: StaffAuthorityViewer = {
  ...mathScienceSupervisor,
  supervisionScopes: [
    supervisionScope({
      capability: "TEACHER_WORK_VIEW",
      subjectScope: "SUBJECT_KEYS",
      subjectKeys: ["MATH"],
      isActive: false,
    }),
  ],
};
assert.equal(
  resolveStaffAuthority({ viewer: inactiveScopeViewer, target: boysTeacher(["MATH"]), nowMs: 1 }).allowed,
  false,
);

console.log("Staff PDF subject-supervision regression tests passed.");
