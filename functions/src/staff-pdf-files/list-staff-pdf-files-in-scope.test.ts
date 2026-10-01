import assert from "node:assert/strict";

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
