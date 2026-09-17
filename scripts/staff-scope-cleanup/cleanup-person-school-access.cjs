const fs = require("node:fs");
const path = require("node:path");
const admin = require("firebase-admin");

const ORG_ID = "takween";

const PERSON_ID = "p-f-alhamaad";
const UID = "H9nDRWMOqsfOUE27cJBbJn2RESE3";

const TARGET_SCHOOL_ID = "mrb-girls";
const TARGET_SCOPE_GROUP_ID = "mrb-girls-and-kindergartens";

const MEMBERSHIP_PATH =
  `users/${UID}/orgMemberships/${ORG_ID}`;

const OPERATIONAL_ASSIGNMENT_ID =
  "staff-provisioning__p-f-alhamaad__mrb-girls__STAFF_EVALUATION";

const SUPERVISION_SCOPE_ID =
  "p-f-alhamaad__TEACHER_WORK_VIEW__mrb-girls";

const APPLY = process.argv.includes("--apply");

const serviceAccountPath = path.resolve(
  __dirname,
  "../service-account.json",
);

if (!fs.existsSync(serviceAccountPath)) {
  throw new Error(
    `Service account not found: ${serviceAccountPath}`,
  );
}

const serviceAccount = JSON.parse(
  fs.readFileSync(serviceAccountPath, "utf8"),
);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId: serviceAccount.project_id,
});

const db = admin.firestore();

function uniqueStrings(values) {
  return Array.from(
    new Set(
      values.filter(
        (value) =>
          typeof value === "string" &&
          value.trim().length > 0,
      ),
    ),
  );
}

function printJson(label, value) {
  console.log("");
  console.log(label);
  console.dir(value, {
    depth: null,
    colors: true,
  });
}

async function loadCurrentState() {
  const membershipRef = db.doc(MEMBERSHIP_PATH);

  const operationalAssignmentRef = db.doc(
    `orgs/${ORG_ID}/operationalAssignments/${OPERATIONAL_ASSIGNMENT_ID}`,
  );

  const supervisionScopeRef = db.doc(
    `orgs/${ORG_ID}/personSupervisionScopes/${SUPERVISION_SCOPE_ID}`,
  );

  const [
    membershipSnap,
    operationalAssignmentSnap,
    supervisionScopeSnap,
  ] = await Promise.all([
    membershipRef.get(),
    operationalAssignmentRef.get(),
    supervisionScopeRef.get(),
  ]);

  if (!membershipSnap.exists) {
    throw new Error(
      `Membership not found: ${MEMBERSHIP_PATH}`,
    );
  }

  const membership = membershipSnap.data();

  if (membership.personId !== PERSON_ID) {
    throw new Error(
      `Membership personId mismatch. Expected ${PERSON_ID}, got ${membership.personId}`,
    );
  }

  if (
    membership.orgId &&
    membership.orgId !== ORG_ID
  ) {
    throw new Error(
      `Membership orgId mismatch. Expected ${ORG_ID}, got ${membership.orgId}`,
    );
  }

  const currentSchoolIds = uniqueStrings(
    Array.isArray(membership?.scopes?.schoolIds)
      ? membership.scopes.schoolIds
      : [],
  );

  const nextSchoolIds = currentSchoolIds.filter(
    (schoolId) =>
      schoolId !== TARGET_SCHOOL_ID,
  );

  if (!nextSchoolIds.length) {
    throw new Error(
      "Cleanup refused: removing the target school would leave the membership with no schools.",
    );
  }

  const currentScopeGroupIds = uniqueStrings(
    Array.isArray(
      membership?.scopes?.scopeGroupIds,
    )
      ? membership.scopes.scopeGroupIds
      : [],
  );

  const nextScopeGroupIds =
    currentScopeGroupIds.filter(
      (scopeGroupId) =>
        scopeGroupId !== TARGET_SCOPE_GROUP_ID,
    );

  const nextScopeId =
    membership.scopeId === TARGET_SCHOOL_ID
      ? nextSchoolIds[0]
      : membership.scopeId;

  if (!nextScopeId) {
    throw new Error(
      "Cleanup refused: unable to resolve a replacement membership scopeId.",
    );
  }

  let operationalAssignment = null;

  if (operationalAssignmentSnap.exists) {
    operationalAssignment =
      operationalAssignmentSnap.data();

    if (
      operationalAssignment.actorPersonId !==
      PERSON_ID
    ) {
      throw new Error(
        "Operational assignment actorPersonId does not match the expected person.",
      );
    }

    if (
      operationalAssignment.schoolId !==
      TARGET_SCHOOL_ID
    ) {
      throw new Error(
        "Operational assignment schoolId does not match the target school.",
      );
    }
  }

  let supervisionScope = null;

  if (supervisionScopeSnap.exists) {
    supervisionScope =
      supervisionScopeSnap.data();

    if (
      supervisionScope.personId !== PERSON_ID
    ) {
      throw new Error(
        "Supervision scope personId does not match the expected person.",
      );
    }

    if (
      supervisionScope.schoolId !==
      TARGET_SCHOOL_ID
    ) {
      throw new Error(
        "Supervision scope schoolId does not match the target school.",
      );
    }

    if (
      supervisionScope.capability !==
      "TEACHER_WORK_VIEW"
    ) {
      throw new Error(
        `Unexpected supervision capability: ${supervisionScope.capability}`,
      );
    }
  }

  return {
    refs: {
      membershipRef,
      operationalAssignmentRef,
      supervisionScopeRef,
    },

    current: {
      membership,
      operationalAssignment,
      supervisionScope,
    },

    desired: {
      membership: {
        scopeType: membership.scopeType,
        scopeId: nextScopeId,
        schoolIds: nextSchoolIds,
        scopeGroupIds: nextScopeGroupIds,
        canAccessAllSchools:
          membership?.scopes
            ?.canAccessAllSchools ?? false,
      },

      operationalAssignment:
        operationalAssignmentSnap.exists
          ? {
              isActive: false,
              status: "ENDED",
            }
          : null,

      supervisionScope:
        supervisionScopeSnap.exists
          ? {
              isActive: false,
            }
          : null,
    },
  };
}

async function preview() {
  const state = await loadCurrentState();

  console.log("");
  console.log(
    APPLY
      ? "PERSON / SCHOOL ACCESS CLEANUP — APPLY MODE"
      : "PERSON / SCHOOL ACCESS CLEANUP — PREVIEW MODE",
  );
  console.log(
    "========================================",
  );

  console.log(`Org: ${ORG_ID}`);
  console.log(`Person: ${PERSON_ID}`);
  console.log(
    `Target school to remove: ${TARGET_SCHOOL_ID}`,
  );

  console.log("");
  console.log(
    "1. MEMBERSHIP",
  );
  console.log(
    "----------------------------------------",
  );
  console.log(`Path: ${MEMBERSHIP_PATH}`);

  printJson("Current membership access:", {
    scopeType:
      state.current.membership.scopeType ??
      null,

    scopeId:
      state.current.membership.scopeId ??
      null,

    schoolIds:
      state.current.membership?.scopes
        ?.schoolIds ?? [],

    scopeGroupIds:
      state.current.membership?.scopes
        ?.scopeGroupIds ?? [],

    canAccessAllSchools:
      state.current.membership?.scopes
        ?.canAccessAllSchools ?? false,
  });

  printJson("Desired membership access:", {
    scopeType:
      state.desired.membership.scopeType,

    scopeId:
      state.desired.membership.scopeId,

    schoolIds:
      state.desired.membership.schoolIds,

    scopeGroupIds:
      state.desired.membership
        .scopeGroupIds,

    canAccessAllSchools:
      state.desired.membership
        .canAccessAllSchools,
  });

  console.log("");
  console.log(
    "2. OPERATIONAL ASSIGNMENT",
  );
  console.log(
    "----------------------------------------",
  );

  if (
    state.current.operationalAssignment
  ) {
    console.log(
      `Path: orgs/${ORG_ID}/operationalAssignments/${OPERATIONAL_ASSIGNMENT_ID}`,
    );

    printJson("Current:", {
      operationKind:
        state.current
          .operationalAssignment
          .operationKind,

      schoolId:
        state.current
          .operationalAssignment.schoolId,

      scopeId:
        state.current
          .operationalAssignment.scopeId,

      isActive:
        state.current
          .operationalAssignment.isActive,

      status:
        state.current
          .operationalAssignment.status,
    });

    printJson(
      "Desired:",
      state.desired.operationalAssignment,
    );
  } else {
    console.log(
      "Operational assignment not found. Nothing to change.",
    );
  }

  console.log("");
  console.log(
    "3. PERSON SUPERVISION SCOPE",
  );
  console.log(
    "----------------------------------------",
  );

  if (state.current.supervisionScope) {
    console.log(
      `Path: orgs/${ORG_ID}/personSupervisionScopes/${SUPERVISION_SCOPE_ID}`,
    );

    printJson("Current:", {
      capability:
        state.current.supervisionScope
          .capability,

      schoolId:
        state.current.supervisionScope
          .schoolId,

      isActive:
        state.current.supervisionScope
          .isActive,
    });

    printJson(
      "Desired:",
      state.desired.supervisionScope,
    );
  } else {
    console.log(
      "Supervision scope not found. Nothing to change.",
    );
  }

  return state;
}

async function applyChanges(state) {
  const now = Date.now();

  const batch = db.batch();

  batch.update(
    state.refs.membershipRef,
    {
      scopeId:
        state.desired.membership.scopeId,

      "scopes.schoolIds":
        state.desired.membership.schoolIds,

      "scopes.scopeGroupIds":
        state.desired.membership
          .scopeGroupIds,

      updatedAt: now,
    },
  );

  if (
    state.current.operationalAssignment
  ) {
    batch.update(
      state.refs.operationalAssignmentRef,
      {
        isActive: false,
        status: "ENDED",
        endAt: now,
        updatedAt: now,
      },
    );
  }

  if (state.current.supervisionScope) {
    batch.update(
      state.refs.supervisionScopeRef,
      {
        isActive: false,
        updatedAt: now,
      },
    );
  }

  await batch.commit();

  console.log("");
  console.log(
    "APPLY COMPLETE",
  );
  console.log(
    "Changes written successfully.",
  );
}

async function verify() {
  console.log("");
  console.log(
    "========================================",
  );
  console.log("VERIFICATION");
  console.log(
    "========================================",
  );

  const membershipSnap = await db
    .doc(MEMBERSHIP_PATH)
    .get();

  const operationalAssignmentSnap =
    await db
      .doc(
        `orgs/${ORG_ID}/operationalAssignments/${OPERATIONAL_ASSIGNMENT_ID}`,
      )
      .get();

  const supervisionScopeSnap =
    await db
      .doc(
        `orgs/${ORG_ID}/personSupervisionScopes/${SUPERVISION_SCOPE_ID}`,
      )
      .get();

  const membership =
    membershipSnap.data() ?? {};

  const schoolIds =
    membership?.scopes?.schoolIds ?? [];

  const scopeGroupIds =
    membership?.scopes?.scopeGroupIds ??
    [];

  const membershipStillHasTarget =
    membership.scopeId ===
      TARGET_SCHOOL_ID ||
    schoolIds.includes(
      TARGET_SCHOOL_ID,
    ) ||
    scopeGroupIds.includes(
      TARGET_SCOPE_GROUP_ID,
    );

  const operationalAssignment =
    operationalAssignmentSnap.exists
      ? operationalAssignmentSnap.data()
      : null;

  const operationalAssignmentActive =
    operationalAssignment &&
    operationalAssignment.isActive !==
      false &&
    operationalAssignment.status !==
      "ENDED";

  const supervisionScope =
    supervisionScopeSnap.exists
      ? supervisionScopeSnap.data()
      : null;

  const supervisionScopeActive =
    supervisionScope &&
    supervisionScope.isActive !== false;

  printJson(
    "Membership after cleanup:",
    {
      scopeType:
        membership.scopeType ?? null,

      scopeId:
        membership.scopeId ?? null,

      schoolIds,

      scopeGroupIds,

      canAccessAllSchools:
        membership?.scopes
          ?.canAccessAllSchools ?? false,
    },
  );

  printJson(
    "Operational assignment after cleanup:",
    operationalAssignment
      ? {
          isActive:
            operationalAssignment.isActive,
          status:
            operationalAssignment.status,
          schoolId:
            operationalAssignment.schoolId,
          endAt:
            operationalAssignment.endAt ??
            null,
        }
      : "NOT FOUND",
  );

  printJson(
    "Supervision scope after cleanup:",
    supervisionScope
      ? {
          capability:
            supervisionScope.capability,
          schoolId:
            supervisionScope.schoolId,
          isActive:
            supervisionScope.isActive,
        }
      : "NOT FOUND",
  );

  console.log("");
  console.log(
    "Verification results:",
  );

  console.log({
    membershipTargetRemoved:
      !membershipStillHasTarget,

    operationalAssignmentDisabled:
      !operationalAssignmentActive,

    supervisionScopeDisabled:
      !supervisionScopeActive,
  });

  if (
    membershipStillHasTarget ||
    operationalAssignmentActive ||
    supervisionScopeActive
  ) {
    throw new Error(
      "Verification failed: an active mrb-girls relation still exists in the inspected records.",
    );
  }

  console.log("");
  console.log(
    "VERIFICATION PASSED",
  );
  console.log(
    `${TARGET_SCHOOL_ID} was removed from the inspected access sources for ${PERSON_ID}.`,
  );
}

async function main() {
  const state = await preview();

  if (!APPLY) {
    console.log("");
    console.log(
      "========================================",
    );
    console.log(
      "PREVIEW COMPLETE",
    );
    console.log(
      "No writes performed.",
    );
    console.log("");
    console.log(
      "Run again with --apply to perform the cleanup:",
    );
    console.log(
      "node scripts\\staff-scope-cleanup\\cleanup-person-school-access.cjs --apply",
    );
    return;
  }

  await applyChanges(state);
  await verify();
}

main()
  .catch((error) => {
    console.error("");
    console.error(
      "Cleanup failed:",
    );
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await admin.app().delete();
  });