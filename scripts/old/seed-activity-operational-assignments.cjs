const admin = require("firebase-admin");
const path = require("path");
const fs = require("fs");

const serviceAccount = require(path.join(__dirname, "./service-account.json"));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

const orgId = process.env.ORG_ID || "takween";
const dryRun = process.argv.includes("--dry-run");

const operationKind = "STUDENT_ACTIVITY_MANAGEMENT";
const now = Date.now();

const reportPath = path.join(
  __dirname,
  "seed-activity-operational-assignments-report.json",
);

const targets = [
  {
    membershipId: "op-boys-activity",
    personId: "p-f-alqashami",
    roleKey: "ACTIVITY_COORD",
    schoolIds: ["mrb-boys-sayh", "mrb-boys-faleh"],
  },
  {
    membershipId: "op-girls-activity",
    personId: "p-m-alfrraj",
    roleKey: "ACTIVITY_COORD",
    schoolIds: ["mrb-girls"],
  },
];

function writeReport(report) {
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), "utf8");
}

async function readRequiredDoc(docPath) {
  const snap = await db.doc(docPath).get();

  if (!snap.exists) {
    throw new Error(`Missing required document: ${docPath}`);
  }

  return {
    id: snap.id,
    path: snap.ref.path,
    data: snap.data(),
  };
}

function buildAssignmentId(personId, schoolId) {
  return `activity-${personId}-${schoolId}`;
}

function buildAssignmentDoc(params) {
  const {
    assignmentId,
    membership,
    person,
    school,
    target,
    existingCreatedAt,
  } = params;

  const schoolName = school.data.name || school.id;
  const personName = person.data.displayName || person.id;

  return {
    id: assignmentId,
    orgId,

    title: `رائد النشاط - ${schoolName}`,
    description: `تكليف ${personName} بإدارة الأنشطة والمسابقات في ${schoolName}.`,

    isActive: true,
    startAt: membership.data.startAt || now,

    actorPersonId: target.personId,
    actorMembershipId: target.membershipId,
    actorRoleKey: target.roleKey,

    operationKind,

    scopeType: "SCHOOL",
    scopeId: school.id,
    coverageMode: "ALL_CLASSES_IN_SCOPE",

    targetKind: "STUDENT",
    targetSchoolIds: [school.id],
    targetGradeIds: [],
    targetClassIds: [],
    targetStudentIds: [],

    createdAt: existingCreatedAt || now,
    updatedAt: now,

    metadata: {
      seededBy: "seed-activity-operational-assignments.cjs",
      sourceMembershipPath: membership.path,
      sourcePersonPath: person.path,
      sourceSchoolPath: school.path,
    },
  };
}

async function seedOneAssignment(target, schoolId) {
  const membership = await readRequiredDoc(
    `orgs/${orgId}/operationalMemberships/${target.membershipId}`,
  );

  const person = await readRequiredDoc(`orgs/${orgId}/people/${target.personId}`);

  const school = await readRequiredDoc(`orgs/${orgId}/schools/${schoolId}`);

  if (membership.data.personId !== target.personId) {
    throw new Error(
      `Membership ${target.membershipId} person mismatch. Expected ${target.personId}, found ${membership.data.personId}`,
    );
  }

  if (membership.data.roleKey !== target.roleKey) {
    throw new Error(
      `Membership ${target.membershipId} role mismatch. Expected ${target.roleKey}, found ${membership.data.roleKey}`,
    );
  }

  const assignmentId = buildAssignmentId(target.personId, schoolId);
  const assignmentRef = db.doc(
    `orgs/${orgId}/operationalAssignments/${assignmentId}`,
  );

  const existingSnap = await assignmentRef.get();

  const assignmentDoc = buildAssignmentDoc({
    assignmentId,
    membership,
    person,
    school,
    target,
    existingCreatedAt: existingSnap.exists
      ? existingSnap.data().createdAt
      : undefined,
  });

  const action = existingSnap.exists ? "update" : "create";

  if (!dryRun) {
    await assignmentRef.set(assignmentDoc, { merge: true });
  }

  return {
    action,
    dryRun,
    assignmentId,
    assignmentPath: assignmentRef.path,
    actorPersonId: assignmentDoc.actorPersonId,
    actorRoleKey: assignmentDoc.actorRoleKey,
    operationKind: assignmentDoc.operationKind,
    scopeType: assignmentDoc.scopeType,
    scopeId: assignmentDoc.scopeId,
    coverageMode: assignmentDoc.coverageMode,
    targetKind: assignmentDoc.targetKind,
    title: assignmentDoc.title,
  };
}

async function main() {
  console.log(`Seeding activity operational assignments for org: ${orgId}`);
  console.log(`Dry run: ${dryRun ? "YES" : "NO"}`);

  const results = [];

  for (const target of targets) {
    for (const schoolId of target.schoolIds) {
      const result = await seedOneAssignment(target, schoolId);
      results.push(result);
    }
  }

  const report = {
    orgId,
    operationKind,
    dryRun,
    seededAt: new Date().toISOString(),
    count: results.length,
    results,
  };

  writeReport(report);

  console.log("");
  console.log("=== Activity Operational Assignments Seed ===");
  console.table(
    results.map((item) => ({
      action: item.action,
      assignmentId: item.assignmentId,
      actorPersonId: item.actorPersonId,
      scopeId: item.scopeId,
      dryRun: item.dryRun,
    })),
  );

  console.log("");
  console.log(`Report written to: ${reportPath}`);

  if (dryRun) {
    console.log("");
    console.log("Dry run only. No Firestore changes were written.");
    console.log("Run again without --dry-run to apply changes.");
  } else {
    console.log("");
    console.log("Seed completed. Firestore changes were written.");
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});