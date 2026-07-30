const admin = require("firebase-admin");
const path = require("path");
const fs = require("fs");

const serviceAccount = require(path.join(__dirname, "./service-account.json"));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

const orgId = process.env.ORG_ID || "takween";
const operationKind = "STUDENT_ACTIVITY_MANAGEMENT";

const targets = [
  {
    membershipId: "op-boys-activity",
    personId: "p-f-alqashami",
    expectedRoleKey: "ACTIVITY_COORD",
    expectedSchoolIds: ["mrb-boys-sayh", "mrb-boys-faleh"],
  },
  {
    membershipId: "op-girls-activity",
    personId: "p-m-alfrraj",
    expectedRoleKey: "ACTIVITY_COORD",
    expectedSchoolIds: ["mrb-girls"],
  },
];

const reportPath = path.join(
  __dirname,
  "inspect-activity-coordinators-report.json",
);

function writeReport(report) {
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), "utf8");
}

async function readDoc(pathValue) {
  const snap = await db.doc(pathValue).get();

  if (!snap.exists) {
    return {
      exists: false,
      path: pathValue,
      id: snap.id,
      data: null,
    };
  }

  return {
    exists: true,
    path: snap.ref.path,
    id: snap.id,
    data: snap.data(),
  };
}

async function findAssignmentsForPerson(personId) {
  const snap = await db
    .collection(`orgs/${orgId}/operationalAssignments`)
    .where("actorPersonId", "==", personId)
    .get();

  return snap.docs.map((doc) => ({
    id: doc.id,
    path: doc.ref.path,
    ...doc.data(),
  }));
}

async function inspectTarget(target) {
  const membership = await readDoc(
    `orgs/${orgId}/operationalMemberships/${target.membershipId}`,
  );

  const person = await readDoc(`orgs/${orgId}/people/${target.personId}`);

  const schools = await Promise.all(
    target.expectedSchoolIds.map((schoolId) =>
      readDoc(`orgs/${orgId}/schools/${schoolId}`),
    ),
  );

  const assignments = await findAssignmentsForPerson(target.personId);

  const activityAssignments = assignments.filter(
    (item) => item.operationKind === operationKind,
  );

  return {
    target,
    membership,
    person,
    expectedSchools: schools,
    existingAssignmentsCount: assignments.length,
    existingActivityAssignmentsCount: activityAssignments.length,
    existingActivityAssignments: activityAssignments.map((item) => ({
      id: item.id,
      path: item.path,
      title: item.title || "",
      actorPersonId: item.actorPersonId || "",
      actorMembershipId: item.actorMembershipId || "",
      actorRoleKey: item.actorRoleKey || "",
      operationKind: item.operationKind || "",
      scopeType: item.scopeType || "",
      scopeId: item.scopeId || "",
      coverageMode: item.coverageMode || "",
      targetKind: item.targetKind || "",
      isActive: item.isActive !== false,
    })),
    checks: {
      membershipExists: membership.exists,
      personExists: person.exists,
      allExpectedSchoolsExist: schools.every((item) => item.exists),
      membershipPersonMatches:
        membership.exists &&
        membership.data &&
        membership.data.personId === target.personId,
      membershipRoleMatches:
        membership.exists &&
        membership.data &&
        membership.data.roleKey === target.expectedRoleKey,
    },
  };
}

async function main() {
  console.log(`Inspecting activity coordinators for org: ${orgId}`);

  const inspectedTargets = [];

  for (const target of targets) {
    inspectedTargets.push(await inspectTarget(target));
  }

  const report = {
    orgId,
    operationKind,
    inspectedAt: new Date().toISOString(),
    targets: inspectedTargets,
    recommendation: inspectedTargets.every(
      (item) =>
        item.checks.membershipExists &&
        item.checks.personExists &&
        item.checks.allExpectedSchoolsExist &&
        item.checks.membershipPersonMatches &&
        item.checks.membershipRoleMatches,
    )
      ? "READY_FOR_ACTIVITY_ASSIGNMENT_SEED"
      : "FIX_DATA_BEFORE_SEED",
  };

  writeReport(report);

  console.log("");
  console.log("=== Activity Coordinator Inspect ===");

  console.table(
    inspectedTargets.map((item) => ({
      membershipId: item.target.membershipId,
      personId: item.target.personId,
      membershipExists: item.checks.membershipExists,
      personExists: item.checks.personExists,
      schoolsOk: item.checks.allExpectedSchoolsExist,
      personMatches: item.checks.membershipPersonMatches,
      roleMatches: item.checks.membershipRoleMatches,
      existingActivityAssignments: item.existingActivityAssignmentsCount,
    })),
  );

  console.log("");
  console.log("Expected scope:");
  inspectedTargets.forEach((item) => {
    console.log(
      `- ${item.target.personId}: ${item.target.expectedSchoolIds.join(", ")}`,
    );
  });

  console.log("");
  console.log(`Recommendation: ${report.recommendation}`);
  console.log(`Report written to: ${reportPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});