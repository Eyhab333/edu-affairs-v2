/* eslint-disable no-console */

const admin = require("firebase-admin");
const path = require("path");

const CONFIG = {
  orgId: "takween",
  sourceSchoolId: "mrb-boys-sayh",
  targetSchoolId: "mrb-boys-faleh",
};

const ROLE_ALIASES = {
  ACTIVITY_LEADER: ["ACTIVITY_LEADER", "ACTIVITY_COORD"],
  SCHOOL_VICE_PRINCIPAL: ["SCHOOL_VICE_PRINCIPAL", "BOYS_VP"],
  STUDENT_COUNSELOR: ["STUDENT_COUNSELOR", "BOYS_STUDENT_GUIDE"],
};

function initAdmin() {
  if (admin.apps.length) return;

  const serviceAccountPath = path.resolve(
    process.cwd(),
    "service-account.json",
  );
  const serviceAccount = require(serviceAccountPath);

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    projectId: serviceAccount.project_id,
  });
}

function asString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function uniqueStrings(values) {
  return Array.from(
    new Set(values.map(asString).filter(Boolean)),
  );
}

function uniqueDocuments(documents) {
  return Array.from(
    new Map(
      documents.map((document) => [document.ref.path, document]),
    ).values(),
  );
}

function isActive(data) {
  const status = asString(data.status).toUpperCase();

  return (
    data.isActive !== false &&
    data.active !== false &&
    !["DISABLED", "ENDED", "INACTIVE", "REVOKED"].includes(status)
  );
}

function roleKey(data) {
  return asString(data.roleKey || data.role).toUpperCase();
}

function membershipCoversSchool(data, schoolId) {
  return (
    asString(data.schoolId) === schoolId ||
    asString(data.scopeId) === schoolId ||
    data.scopes?.schoolIds?.includes(schoolId) ||
    data.scopes?.canAccessAllSchools === true
  );
}

function membershipUid(document) {
  const dataUid = asString(document.data().uid);
  if (dataUid) return dataUid;

  if (document.ref.parent.id === "orgMemberships") {
    return document.ref.parent.parent?.id || "";
  }

  return document.id;
}

function assignmentPersonId(data) {
  return asString(data.actorPersonId || data.personId);
}

function assignmentRoleKey(data) {
  return asString(data.actorRoleKey || data.roleKey).toUpperCase();
}

async function loadSchoolMemberships(db, collectionPath, schoolId) {
  const [bySchoolId, byScopeId, bySchoolIds] = await Promise.all([
    db.collection(collectionPath).where("schoolId", "==", schoolId).get(),
    db.collection(collectionPath).where("scopeId", "==", schoolId).get(),
    db.collection(collectionPath)
      .where("scopes.schoolIds", "array-contains", schoolId)
      .get(),
  ]);

  return uniqueDocuments([
    ...bySchoolId.docs,
    ...byScopeId.docs,
    ...bySchoolIds.docs,
  ]);
}

async function loadSchoolOperationalAssignments(
  db,
  collectionPath,
  schoolId,
) {
  const [bySchoolId, byScopeId] = await Promise.all([
    db.collection(collectionPath).where("schoolId", "==", schoolId).get(),
    db.collection(collectionPath).where("scopeId", "==", schoolId).get(),
  ]);

  return uniqueDocuments([...bySchoolId.docs, ...byScopeId.docs]);
}

function matchesFrameworkRole(frameworkRoleKey, candidateRoleKey) {
  const aliases = ROLE_ALIASES[frameworkRoleKey] || [frameworkRoleKey];
  return aliases.includes(candidateRoleKey);
}

async function main() {
  initAdmin();

  const db = admin.firestore();
  const orgRoot = `orgs/${CONFIG.orgId}`;
  const [
    frameworkSnapshot,
    sectionSnapshot,
    itemSnapshot,
    sourcePlanSnapshot,
    targetPlanSnapshot,
    sourceCycleSnapshot,
    targetCycleSnapshot,
    sourceTargetSnapshot,
    targetTargetSnapshot,
    targetOrgMemberships,
    targetUsersSnapshot,
    targetOperationalAssignmentsSnapshot,
  ] = await Promise.all([
    db.collection(`${orgRoot}/evaluationFrameworks`).get(),
    db.collection(`${orgRoot}/evaluationRubricSections`).get(),
    db.collection(`${orgRoot}/evaluationRubricItems`).get(),
    db.collection(`${orgRoot}/evaluationPlans`)
      .where("schoolId", "==", CONFIG.sourceSchoolId)
      .get(),
    db.collection(`${orgRoot}/evaluationPlans`)
      .where("schoolId", "==", CONFIG.targetSchoolId)
      .get(),
    db.collection(`${orgRoot}/evaluationCycles`)
      .where("schoolId", "==", CONFIG.sourceSchoolId)
      .get(),
    db.collection(`${orgRoot}/evaluationCycles`)
      .where("schoolId", "==", CONFIG.targetSchoolId)
      .get(),
    db.collection(`${orgRoot}/evaluationTargetAssignments`)
      .where("schoolId", "==", CONFIG.sourceSchoolId)
      .get(),
    db.collection(`${orgRoot}/evaluationTargetAssignments`)
      .where("schoolId", "==", CONFIG.targetSchoolId)
      .get(),
    loadSchoolMemberships(
      db,
      `${orgRoot}/memberships`,
      CONFIG.targetSchoolId,
    ),
    db.collection("users")
      .where("schoolIds", "array-contains", CONFIG.targetSchoolId)
      .get(),
    loadSchoolOperationalAssignments(
      db,
      `${orgRoot}/operationalAssignments`,
      CONFIG.targetSchoolId,
    ),
  ]);

  const adminFrameworks = frameworkSnapshot.docs
    .filter((document) => {
      const data = document.data();
      return (
        document.id.startsWith("director-admin-") ||
        asString(data.frameworkKind) === "ADMIN_EVALUATION" ||
        asString(data.targetKind) === "ADMIN_STAFF"
      );
    })
    .sort((left, right) => left.id.localeCompare(right.id));
  const frameworkIds = new Set(
    adminFrameworks.map((document) => document.id),
  );
  const sourcePlans = sourcePlanSnapshot.docs.filter((document) =>
    frameworkIds.has(asString(document.data().frameworkId)),
  );
  const targetPlans = targetPlanSnapshot.docs.filter((document) =>
    frameworkIds.has(asString(document.data().frameworkId)),
  );

  const targetUserMemberships = targetUsersSnapshot.empty
    ? []
    : (
        await db.getAll(
          ...targetUsersSnapshot.docs.map((user) =>
            db.doc(`users/${user.id}/orgMemberships/${CONFIG.orgId}`),
          ),
        )
      ).filter((membership) => membership.exists);

  let activeTargetMemberships = uniqueDocuments([
    ...targetOrgMemberships,
    ...targetUserMemberships.filter((document) =>
      membershipCoversSchool(document.data(), CONFIG.targetSchoolId),
    ),
  ]).filter((document) => isActive(document.data()));
  const activeOperationalAssignments =
    targetOperationalAssignmentsSnapshot.filter((document) =>
      isActive(document.data()),
    );
  const initiallyDiscoveredPersonIds = uniqueStrings(
    [
      ...activeTargetMemberships.map(
        (document) => document.data().personId,
      ),
      ...activeOperationalAssignments.map((document) =>
        assignmentPersonId(document.data()),
      ),
      ...targetTargetSnapshot.docs.map(
        (document) => document.data().targetPersonId,
      ),
    ],
  );
  const usersByPersonId = initiallyDiscoveredPersonIds.length
    ? await Promise.all(
        initiallyDiscoveredPersonIds.map((personId) =>
          db.collection("users")
            .where("personId", "==", personId)
            .get(),
        ),
      )
    : [];
  const discoveredUsers = uniqueDocuments(
    usersByPersonId.flatMap((snapshot) => snapshot.docs),
  );
  const discoveredUserMemberships = discoveredUsers.length
    ? (
        await db.getAll(
          ...discoveredUsers.map((user) =>
            db.doc(`users/${user.id}/orgMemberships/${CONFIG.orgId}`),
          ),
        )
      ).filter(
        (membership) =>
          membership.exists &&
          membershipCoversSchool(
            membership.data(),
            CONFIG.targetSchoolId,
          ),
      )
    : [];

  activeTargetMemberships = uniqueDocuments([
    ...activeTargetMemberships,
    ...discoveredUserMemberships,
  ]).filter((document) => isActive(document.data()));

  const personIds = uniqueStrings([
    ...initiallyDiscoveredPersonIds,
    ...activeTargetMemberships.map(
      (document) => document.data().personId,
    ),
  ]);
  const people = personIds.length
    ? await db.getAll(
        ...personIds.map((personId) =>
          db.doc(`${orgRoot}/people/${personId}`),
        ),
      )
    : [];
  const peopleById = new Map(
    people.map((person) => [person.id, person]),
  );

  const falehStaffByPersonAndRole = new Map();

  for (const membership of activeTargetMemberships) {
    const data = membership.data();
    const personId = asString(data.personId);
    const person = peopleById.get(personId);
    const personData = person?.exists ? person.data() : {};
    const item = {
      uid: membershipUid(membership),
      personId,
      displayName: asString(personData.displayName || data.displayName),
      email: asString(personData.email || data.email).toLowerCase(),
      roleKey: roleKey(data),
      title: asString(data.title),
      scopeType: asString(data.scopeType),
      scopeId: asString(data.scopeId),
      schoolIds: uniqueStrings(data.scopes?.schoolIds || []),
      provisioningStatus: asString(
        personData.provisioningStatus || data.provisioningStatus,
      ),
    };
    const key = `${item.personId}|${item.roleKey}`;
    const existing = falehStaffByPersonAndRole.get(key);

    if (!existing || (!existing.uid && item.uid)) {
      falehStaffByPersonAndRole.set(key, item);
    }
  }

  for (const assignment of activeOperationalAssignments) {
    const data = assignment.data();
    const personId = assignmentPersonId(data);
    const resolvedRoleKey = assignmentRoleKey(data);

    if (!personId || !resolvedRoleKey) continue;

    const person = peopleById.get(personId);
    const personData = person?.exists ? person.data() : {};
    const key = `${personId}|${resolvedRoleKey}`;

    if (!falehStaffByPersonAndRole.has(key)) {
      falehStaffByPersonAndRole.set(key, {
        uid: "",
        personId,
        displayName: asString(personData.displayName),
        email: asString(personData.email).toLowerCase(),
        roleKey: resolvedRoleKey,
        title: "",
        scopeType: "OPERATIONAL_ASSIGNMENT_ONLY",
        scopeId: CONFIG.targetSchoolId,
        schoolIds: [CONFIG.targetSchoolId],
        provisioningStatus: asString(personData.provisioningStatus),
      });
    }
  }

  const falehStaff = Array.from(falehStaffByPersonAndRole.values());
  const directFalehStaff = falehStaff.filter(
    (person) => person.scopeId === CONFIG.targetSchoolId,
  );

  const frameworks = adminFrameworks.map((framework) => {
    const data = framework.data();
    const sections = sectionSnapshot.docs.filter(
      (section) => asString(section.data().frameworkId) === framework.id,
    );
    const items = itemSnapshot.docs.filter(
      (item) => asString(item.data().frameworkId) === framework.id,
    );
    const plans = sourcePlans.filter(
      (plan) => asString(plan.data().frameworkId) === framework.id,
    );
    const sourceRoleKeys = uniqueStrings(
      plans.map((plan) => plan.data().targetRoleKey),
    );
    const frameworkRoleKey =
      asString(data.targetRoleKeyHint).toUpperCase() ||
      sourceRoleKeys[0] ||
      "";
    const matchingPeople = directFalehStaff.filter((person) =>
      matchesFrameworkRole(frameworkRoleKey, person.roleKey),
    );

    return {
      frameworkId: framework.id,
      title: asString(data.title),
      targetRoleKeyHint: frameworkRoleKey,
      version: data.version,
      isActive: data.isActive,
      isLocked: data.isLocked,
      sections: sections.length,
      items: items.length,
      sectionWeightTotal: sections.reduce(
        (total, section) => total + Number(section.data().weight || 0),
        0,
      ),
      sourcePlans: plans.map((plan) => {
        const planData = plan.data();
        const cycles = sourceCycleSnapshot.docs.filter(
          (cycle) => asString(cycle.data().planId) === plan.id,
        );
        const targets = sourceTargetSnapshot.docs.filter(
          (target) => asString(target.data().planId) === plan.id,
        );

        return {
          planId: plan.id,
          targetRoleKey: asString(planData.targetRoleKey),
          cycles: cycles.length,
          targets: targets.map((target) => ({
            personId: asString(target.data().targetPersonId),
            displayName: asString(target.data().targetDisplayName),
            email: asString(target.data().targetEmail),
          })),
        };
      }),
      matchingFalehPeople: matchingPeople,
    };
  });

  const mappedPersonIds = new Set(
    frameworks.flatMap((framework) =>
      framework.matchingFalehPeople.map((person) => person.personId),
    ),
  );
  const excludedRoles = new Set(["BOYS_PRINCIPAL", "BOYS_TEACHER"]);
  const unmappedFalehAdminStaff = directFalehStaff.filter(
    (person) =>
      !excludedRoles.has(person.roleKey) &&
      !mappedPersonIds.has(person.personId),
  );
  const targetAdminPlans = targetPlans.map((plan) => {
    const cycles = targetCycleSnapshot.docs.filter(
      (cycle) => asString(cycle.data().planId) === plan.id,
    );
    const targets = targetTargetSnapshot.docs.filter(
      (target) => asString(target.data().planId) === plan.id,
    );

    return {
      planId: plan.id,
      frameworkId: asString(plan.data().frameworkId),
      cycles: cycles.length,
      targets: targets.length,
    };
  });

  const report = {
    mode: "INSPECT_ONLY_NO_WRITES",
    summary: {
      adminFrameworks: frameworks.length,
      sourceAdminPlans: sourcePlans.length,
      existingFalehAdminPlans: targetAdminPlans.length,
      mappedFalehPeople: mappedPersonIds.size,
      unmappedFalehAdminStaff: unmappedFalehAdminStaff.length,
    },
    frameworks,
    existingFalehAdminPlans: targetAdminPlans,
    unmappedFalehAdminStaff,
  };

  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error("Faleh admin evaluation readiness inspection failed:");
  console.error(error);
  process.exitCode = 1;
});
