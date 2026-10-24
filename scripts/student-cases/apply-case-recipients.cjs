#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");

const {
  CASE_HANDLING_ROLES,
  ORG_ID,
  OPERATION_KIND,
  assignmentId,
  explicitSchoolIds,
  initAdmin,
  isActive,
  makeAssignmentData,
  parseFlagValue,
  record,
  relativeReportPath,
  resolveReportPath,
  roleFromMembership,
  text,
  validatePreviewReport,
  writeReport,
} = require("./_case-recipient-core.cjs");

function validateRecordShape(item) {
  const personId = text(item.personId);
  const schoolId = text(item.schoolId);
  const roleKey = text(item.roleKey);
  const membershipPath = text(item.membershipPath);
  const membershipId = text(item.membershipId);
  const uid = text(item.uid);

  if (!personId || !schoolId || !roleKey || !membershipPath || !membershipId || !uid) {
    throw new Error("CREATE record is missing a required identity or scope value.");
  }
  if (
    membershipPath !==
    ["users", uid, "orgMemberships", ORG_ID].join("/")
  ) {
    throw new Error("CREATE record has an unexpected membership path.");
  }
  if (membershipId !== ORG_ID) {
    throw new Error("CREATE record membership id is not the organization id.");
  }
  if (assignmentId(personId, schoolId) !== text(item.deterministicAssignmentId)) {
    throw new Error("CREATE record has an unexpected deterministic assignment id.");
  }

  return { personId, schoolId, roleKey, membershipPath, membershipId, uid };
}

function transactionError(message) {
  const error = new Error(message);
  error.code = "case-recipient-review";
  return error;
}

async function createAfterRevalidation(db, item) {
  const target = validateRecordShape(item);
  const membershipRef = db.doc(target.membershipPath);
  const userRef = db.doc("users/" + target.uid);
  const personRef = db.doc("orgs/" + ORG_ID + "/people/" + target.personId);
  const schoolRef = db.doc("orgs/" + ORG_ID + "/schools/" + target.schoolId);
  const assignmentRef = db.doc(
    "orgs/" +
      ORG_ID +
      "/operationalAssignments/" +
      assignmentId(target.personId, target.schoolId),
  );
  const schoolAssignmentsQuery = db
    .collection("orgs/" + ORG_ID + "/operationalAssignments")
    .where("schoolId", "==", target.schoolId);

  await db.runTransaction(async (transaction) => {
    const snapshots = await Promise.all([
      transaction.get(membershipRef),
      transaction.get(userRef),
      transaction.get(personRef),
      transaction.get(schoolRef),
      transaction.get(assignmentRef),
      transaction.get(schoolAssignmentsQuery),
    ]);
    const membershipSnapshot = snapshots[0];
    const userSnapshot = snapshots[1];
    const personSnapshot = snapshots[2];
    const schoolSnapshot = snapshots[3];
    const assignmentSnapshot = snapshots[4];
    const schoolAssignmentsSnapshot = snapshots[5];
    const now = Date.now();

    if (!membershipSnapshot.exists) {
      throw transactionError("membership no longer exists");
    }
    if (!userSnapshot.exists || userSnapshot.data()?.isDisabled === true) {
      throw transactionError("employee user profile is missing or disabled");
    }
    if (!personSnapshot.exists) {
      throw transactionError("employee person document no longer exists");
    }
    if (!text(personSnapshot.data()?.displayName) && !text(userSnapshot.data()?.displayName)) {
      throw transactionError("employee display name is missing");
    }
    if (!schoolSnapshot.exists || schoolSnapshot.data()?.isArchived === true) {
      throw transactionError("school is missing or archived");
    }

    const membership = membershipSnapshot.data() || {};
    const role = roleFromMembership(membership);
    if (!isActive(membership, now)) {
      throw transactionError("membership is no longer active");
    }
    if (text(membership.uid) !== target.uid) {
      throw transactionError("membership uid no longer matches the reviewed record");
    }
    if (text(membership.personId) !== target.personId) {
      throw transactionError(
        "membership personId no longer matches the reviewed record",
      );
    }
    if (text(userSnapshot.data()?.personId) !== target.personId) {
      throw transactionError("user personId no longer matches the membership");
    }
    if (!role.roleKey || role.roleKey !== target.roleKey) {
      throw transactionError("membership role no longer matches the reviewed record");
    }
    if (!explicitSchoolIds(membership).includes(target.schoolId)) {
      throw transactionError("school is no longer an explicit membership scope");
    }
    if (!CASE_HANDLING_ROLES.has(target.roleKey)) {
      throw transactionError("membership role is not approved for auto-provisioning");
    }
    if (assignmentSnapshot.exists) {
      throw transactionError(
        "deterministic assignment document already exists; it will not be overwritten",
      );
    }

    const activeHandlingAssignments = schoolAssignmentsSnapshot.docs.filter(
      (snapshot) => {
        const data = snapshot.data() || {};
        return (
          isActive(data, now) &&
          text(data.operationKind) === OPERATION_KIND &&
          text(data.actorPersonId) === target.personId
        );
      },
    );
    if (activeHandlingAssignments.length) {
      throw transactionError(
        "an active case-handling assignment already exists for this employee and school",
      );
    }

    transaction.create(
      assignmentRef,
      makeAssignmentData({
        personId: target.personId,
        schoolId: target.schoolId,
        roleKey: target.roleKey,
        membershipId: target.membershipId,
        now,
      }),
    );
  });

  return {
    status: "CREATED",
    schoolId: target.schoolId,
    personId: target.personId,
    roleKey: target.roleKey,
    membershipPath: target.membershipPath,
    assignmentId: assignmentId(target.personId, target.schoolId),
  };
}

async function main() {
  const args = process.argv.slice(2);
  if (!args.includes("--apply")) {
    throw new Error(
      "Refusing to write. Re-run with --apply and --report <reviewed-preview-report>.",
    );
  }

  const reportPath = resolveReportPath(parseFlagValue(args, "--report"));
  if (!reportPath || !fs.existsSync(reportPath)) {
    throw new Error(
      "A readable reviewed preview report is required: --report <path>.",
    );
  }

  const preview = JSON.parse(fs.readFileSync(reportPath, "utf8"));
  validatePreviewReport(preview);
  const createRecords = preview.records.filter(
    (item) => item && item.action === "CREATE",
  );

  const context = initAdmin();
  const executions = [];
  for (const item of createRecords) {
    try {
      executions.push(await createAfterRevalidation(context.db, record(item)));
    } catch (error) {
      executions.push({
        status: "REVIEW",
        schoolId: text(item.schoolId),
        personId: text(item.personId),
        roleKey: text(item.roleKey),
        membershipPath: text(item.membershipPath),
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const summary = executions.reduce(
    (result, item) => {
      result[item.status] = (result[item.status] || 0) + 1;
      return result;
    },
    { CREATED: 0, REVIEW: 0 },
  );
  const executionReport = {
    reportType: "STUDENT_CASE_RECIPIENT_APPLY",
    executedAt: new Date().toISOString(),
    orgId: ORG_ID,
    projectId: context.projectId,
    reviewedPreviewReport: path.resolve(reportPath),
    reviewedPreviewReportRelative: relativeReportPath(path.resolve(reportPath)),
    requestedCreateCount: createRecords.length,
    summary,
    executions,
  };
  const executionReportPath = writeReport(
    "case-recipients-apply",
    executionReport,
  );

  console.log("");
  console.log("Student case recipient apply completed.");
  console.table(executions);
  console.log("Summary: " + JSON.stringify(summary));
  console.log("Execution report: " + relativeReportPath(executionReportPath));
}

main().catch((error) => {
  console.error("Apply failed:", error);
  process.exitCode = 1;
});
