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

const reportPath = path.join(
  __dirname,
  "inspect-activity-operational-assignments-report.json",
);

function writeReport(report) {
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), "utf8");
}

async function inspectOperationalAssignments() {
  const ref = db.collection(`orgs/${orgId}/operationalAssignments`);

  const snap = await ref.get();

  const allAssignments = snap.docs.map((doc) => ({
    id: doc.id,
    path: doc.ref.path,
    ...doc.data(),
  }));

  const activityAssignments = allAssignments.filter(
    (item) => item.operationKind === operationKind,
  );

  const activeActivityAssignments = activityAssignments.filter(
    (item) => item.isActive !== false,
  );

  return {
    totalOperationalAssignments: allAssignments.length,
    activityAssignmentsCount: activityAssignments.length,
    activeActivityAssignmentsCount: activeActivityAssignments.length,
    activityAssignments: activityAssignments.map((item) => ({
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
      targetSchoolIds: item.targetSchoolIds || [],
      targetClassIds: item.targetClassIds || [],
      targetStudentIds: item.targetStudentIds || [],
      isActive: item.isActive !== false,
      startAt: item.startAt || null,
      endAt: item.endAt || null,
    })),
  };
}

async function inspectOperationalMemberships() {
  const ref = db.collection(`orgs/${orgId}/operationalMemberships`);

  const snap = await ref.get();

  const allMemberships = snap.docs.map((doc) => ({
    id: doc.id,
    path: doc.ref.path,
    ...doc.data(),
  }));

  const possibleActivityMemberships = allMemberships.filter((item) => {
    const text = [
      item.id,
      item.role,
      item.roleKey,
      item.title,
      item.description,
      item.operationKind,
    ]
      .filter(Boolean)
      .join(" ")
      .toUpperCase();

    return (
      text.includes("ACTIVITY") ||
      text.includes("ACTIVITIES") ||
      text.includes("STUDENT_ACTIVITY_MANAGEMENT")
    );
  });

  return {
    totalOperationalMemberships: allMemberships.length,
    possibleActivityMembershipsCount: possibleActivityMemberships.length,
    possibleActivityMemberships: possibleActivityMemberships.map((item) => ({
      id: item.id,
      path: item.path,
      title: item.title || "",
      personId: item.personId || "",
      actorPersonId: item.actorPersonId || "",
      role: item.role || "",
      roleKey: item.roleKey || "",
      actorRoleKey: item.actorRoleKey || "",
      schoolId: item.schoolId || "",
      scopeType: item.scopeType || "",
      scopeId: item.scopeId || "",
      isActive: item.isActive !== false,
    })),
  };
}

async function main() {
  console.log(`Inspecting activity assignments for org: ${orgId}`);
  console.log(`Operation kind: ${operationKind}`);

  const assignments = await inspectOperationalAssignments();
  const memberships = await inspectOperationalMemberships();

  const report = {
    orgId,
    operationKind,
    inspectedAt: new Date().toISOString(),
    assignments,
    memberships,
    recommendation:
      assignments.activeActivityAssignmentsCount > 0
        ? "FOUND_ACTIVE_ACTIVITY_ASSIGNMENT"
        : "NO_ACTIVE_ACTIVITY_ASSIGNMENT_FOUND",
  };

  writeReport(report);

  console.log("");
  console.log("=== Activity Operational Assignments ===");
  console.log(
    `Total operationalAssignments: ${assignments.totalOperationalAssignments}`,
  );
  console.log(
    `Activity assignments: ${assignments.activityAssignmentsCount}`,
  );
  console.log(
    `Active activity assignments: ${assignments.activeActivityAssignmentsCount}`,
  );

  if (assignments.activityAssignments.length) {
    console.table(
      assignments.activityAssignments.map((item) => ({
        id: item.id,
        actorPersonId: item.actorPersonId,
        actorRoleKey: item.actorRoleKey,
        scopeType: item.scopeType,
        scopeId: item.scopeId,
        isActive: item.isActive,
      })),
    );
  }

  console.log("");
  console.log("=== Possible Activity Operational Memberships ===");
  console.log(
    `Possible activity memberships: ${memberships.possibleActivityMembershipsCount}`,
  );

  if (memberships.possibleActivityMemberships.length) {
    console.table(
      memberships.possibleActivityMemberships.map((item) => ({
        id: item.id,
        personId: item.personId || item.actorPersonId,
        role: item.role || item.roleKey || item.actorRoleKey,
        schoolId: item.schoolId || item.scopeId,
        isActive: item.isActive,
      })),
    );
  }

  console.log("");
  console.log(`Report written to: ${reportPath}`);

  if (report.recommendation === "NO_ACTIVE_ACTIVITY_ASSIGNMENT_FOUND") {
    console.log("");
    console.log(
      "No active STUDENT_ACTIVITY_MANAGEMENT assignment found. Seed is needed.",
    );
  } else {
    console.log("");
    console.log("Active STUDENT_ACTIVITY_MANAGEMENT assignment exists.");
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});