/* eslint-disable no-console */

const admin = require("firebase-admin");
const path = require("path");

const APPLY = process.argv.includes("--apply");

const CONFIG = {
  orgId: "takween",
  schoolId: "mrb-boys-faleh",
  personId: "p-f-alqashami",
  email: "f.alqashami@qz.org.sa",
  roleKey: "ACTIVITY_COORD",
  membershipId: "op-boys-activity",
  assignmentId: "activity-p-f-alqashami-mrb-boys-faleh",
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

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function asString(value) {
  return typeof value === "string" ? value.trim() : "";
}

async function main() {
  initAdmin();

  const db = admin.firestore();
  const orgRoot = `orgs/${CONFIG.orgId}`;
  const assignmentRef = db.doc(
    `${orgRoot}/operationalAssignments/${CONFIG.assignmentId}`,
  );
  const [person, membership, assignment] = await Promise.all([
    db.doc(`${orgRoot}/people/${CONFIG.personId}`).get(),
    db.doc(
      `${orgRoot}/operationalMemberships/${CONFIG.membershipId}`,
    ).get(),
    assignmentRef.get(),
  ]);

  assert(person.exists, `Person not found: ${CONFIG.personId}`);
  assert(membership.exists, `Membership not found: ${CONFIG.membershipId}`);
  assert(assignment.exists, `Assignment not found: ${CONFIG.assignmentId}`);

  const personData = person.data();
  const membershipData = membership.data();
  const assignmentData = assignment.data();

  assert(
    asString(personData.email).toLowerCase() === CONFIG.email,
    "Person email does not match.",
  );
  assert(
    asString(membershipData.personId) === CONFIG.personId &&
      asString(membershipData.roleKey).toUpperCase() === CONFIG.roleKey &&
      membershipData.isActive !== false,
    "Operational membership does not match the active activity leader.",
  );
  assert(
    asString(assignmentData.actorPersonId) === CONFIG.personId &&
      asString(assignmentData.actorMembershipId) === CONFIG.membershipId &&
      asString(assignmentData.actorRoleKey).toUpperCase() === CONFIG.roleKey &&
      asString(assignmentData.operationKind) ===
        "STUDENT_ACTIVITY_MANAGEMENT" &&
      asString(assignmentData.scopeType) === "SCHOOL" &&
      asString(assignmentData.scopeId) === CONFIG.schoolId,
    "Operational assignment identity/scope does not match Faleh.",
  );

  console.log(APPLY ? "Apply mode" : "Preview mode (read-only)");
  console.dir({
    person: {
      personId: person.id,
      displayName: personData.displayName,
      email: personData.email,
    },
    assignment: {
      id: assignment.id,
      roleKey: assignmentData.actorRoleKey,
      scopeId: assignmentData.scopeId,
      currentIsActive: assignmentData.isActive,
      currentEndAt: assignmentData.endAt ?? null,
      desiredIsActive: true,
      desiredEndAt: null,
    },
  });

  if (!APPLY) {
    console.log("No writes performed. Re-run with --apply to reactivate.");
    return;
  }

  if (assignmentData.isActive !== true || assignmentData.endAt != null) {
    await assignmentRef.update({
      isActive: true,
      endAt: null,
      updatedAt: Date.now(),
    });
  }

  const verified = await assignmentRef.get();
  const verifiedData = verified.data();

  assert(verifiedData.isActive === true, "Assignment was not reactivated.");
  assert(verifiedData.endAt == null, "Assignment endAt was not cleared.");

  console.log("Faleh activity-leader assignment reactivated and verified.");
}

main().catch((error) => {
  console.error("Faleh activity-leader reactivation failed:");
  console.error(error);
  process.exitCode = 1;
});
