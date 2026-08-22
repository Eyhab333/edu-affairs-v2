const fs = require("node:fs");
const path = require("node:path");

const {
  applicationDefault,
  cert,
  getApps,
  initializeApp,
} = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");

const ORG_ID = "takween";
const APPLY_CONFIRMATION = "BACKFILL_VIRTUAL_CLASSES";
const VIRTUAL_CLASS_OPERATION = "VIRTUAL_CLASS";
const VIRTUAL_CLASSES_MODULE = "VIRTUAL_CLASSES";
const MAX_BATCH_WRITES = 400;

const OUTPUT_REPORT_DIR = path.resolve(
  process.cwd(),
  "scripts",
  "migrations",
  "reports",
);

function parseArgs() {
  const result = {};

  for (const arg of process.argv.slice(2)) {
    if (!arg.startsWith("--")) continue;

    const [key, ...valueParts] = arg.slice(2).split("=");
    result[key] = valueParts.join("=");
  }

  return result;
}

function initializeFirebase(args) {
  if (getApps().length > 0) return;

  const serviceAccountPath =
    args.serviceAccount ||
    process.env.SERVICE_ACCOUNT_PATH ||
    process.env.GOOGLE_APPLICATION_CREDENTIALS ||
    path.resolve(process.cwd(), "service-account.json");

  if (fs.existsSync(serviceAccountPath)) {
    const serviceAccount = require(path.resolve(serviceAccountPath));

    initializeApp({
      credential: cert(serviceAccount),
      projectId: serviceAccount.project_id,
    });

    return;
  }

  initializeApp({ credential: applicationDefault() });
}

function asString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function upperString(value) {
  return asString(value).toUpperCase();
}

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function isActiveTeacherAssignment(data, nowMs) {
  const status = upperString(data.status);

  if (status !== "ACTIVE") return false;
  if (data.isArchived === true) return false;
  if (data.isActive === false || data.active === false) return false;

  if (isFiniteNumber(data.startAt) && data.startAt > nowMs) {
    return false;
  }

  if (isFiniteNumber(data.endAt) && data.endAt <= nowMs) {
    return false;
  }

  return true;
}

function isArchivedOffering(data) {
  return (
    data.isArchived === true || upperString(data.status) === "ARCHIVED"
  );
}

function getOfferingSubjectKey(data) {
  return upperString(data.subjectKey || data.key || data.subjectId);
}

function isHomeroomOffering(data) {
  const subjectKey = getOfferingSubjectKey(data);
  return subjectKey === "CLASS" || subjectKey === "HOMEROOM";
}

function createSchoolStats() {
  return {
    activeVirtualClassAssignments: 0,
    invalidOfferingIdAssignments: 0,
    uniqueOfferingIds: 0,
    offeringsAlreadyContainingVirtualClasses: 0,
    offeringsRequiringUpdate: 0,
    missingOfferingDocuments: 0,
    invalidOfferingDocuments: 0,
    archivedOfferings: 0,
    homeroomOfferings: 0,
    malformedModuleArrays: 0,
  };
}

function incrementSchoolStat(schoolStats, schoolId, field) {
  const key = schoolId || "(missing-schoolId)";

  if (!schoolStats[key]) {
    schoolStats[key] = createSchoolStats();
  }

  schoolStats[key][field] += 1;
}

function addError(errors, error) {
  errors.push({
    ...error,
    message: asString(error.message) || "Unknown error",
  });
}

function buildReportPath() {
  const timestamp = new Date().toISOString().replace(/[.:]/g, "-");

  return path.join(
    OUTPUT_REPORT_DIR,
    `backfill-class-subject-offering-virtual-classes-${timestamp}.json`,
  );
}

function writeReport(report, reportPath) {
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), "utf8");
}

function addAssignmentReference(referenceMap, offeringId, assignment) {
  const existing = referenceMap.get(offeringId) || {
    offeringId,
    assignmentIds: [],
    schoolIds: [],
    classIds: [],
    subjectKeys: [],
  };

  if (assignment.id && !existing.assignmentIds.includes(assignment.id)) {
    existing.assignmentIds.push(assignment.id);
  }

  if (assignment.schoolId && !existing.schoolIds.includes(assignment.schoolId)) {
    existing.schoolIds.push(assignment.schoolId);
  }

  if (assignment.classId && !existing.classIds.includes(assignment.classId)) {
    existing.classIds.push(assignment.classId);
  }

  if (
    assignment.subjectKey &&
    !existing.subjectKeys.includes(assignment.subjectKey)
  ) {
    existing.subjectKeys.push(assignment.subjectKey);
  }

  referenceMap.set(offeringId, existing);
}

async function inspectAssignments(db, nowMs) {
  const snapshot = await db
    .collection(`orgs/${ORG_ID}/teacherAssignments`)
    .get();

  const referenceMap = new Map();
  const errors = [];
  const schoolStats = {};
  let activeAssignmentsContainingVirtualClass = 0;
  let invalidOfferingIdAssignments = 0;

  for (const assignmentDoc of snapshot.docs) {
    const data = assignmentDoc.data() || {};

    if (!isActiveTeacherAssignment(data, nowMs)) continue;

    const operationKinds = Array.isArray(data.operationKinds)
      ? data.operationKinds
      : [];

    if (!operationKinds.includes(VIRTUAL_CLASS_OPERATION)) continue;

    activeAssignmentsContainingVirtualClass += 1;
    incrementSchoolStat(
      schoolStats,
      asString(data.schoolId),
      "activeVirtualClassAssignments",
    );

    const offeringId = asString(data.classSubjectOfferingId);

    if (!offeringId) {
      invalidOfferingIdAssignments += 1;
      incrementSchoolStat(
        schoolStats,
        asString(data.schoolId),
        "invalidOfferingIdAssignments",
      );
      addError(errors, {
        type: "INVALID_ASSIGNMENT_OFFERING_ID",
        assignmentId: assignmentDoc.id,
        schoolId: asString(data.schoolId),
        message:
          "Active assignment contains VIRTUAL_CLASS but has no valid classSubjectOfferingId.",
      });
      continue;
    }

    addAssignmentReference(referenceMap, offeringId, {
      id: assignmentDoc.id,
      schoolId: asString(data.schoolId),
      classId: asString(data.classId),
      subjectKey: upperString(data.subjectKey),
    });
  }

  for (const reference of referenceMap.values()) {
    for (const schoolId of reference.schoolIds) {
      incrementSchoolStat(schoolStats, schoolId, "uniqueOfferingIds");
    }
  }

  return {
    teacherAssignmentsInspected: snapshot.size,
    activeAssignmentsContainingVirtualClass,
    invalidOfferingIdAssignments,
    referenceMap,
    schoolStats,
    errors,
  };
}

async function inspectOfferings(db, referenceMap, schoolStats, errors) {
  const offeringIds = Array.from(referenceMap.keys()).sort();
  const offeringRefs = offeringIds.map((offeringId) =>
    db.doc(`orgs/${ORG_ID}/classSubjectOfferings/${offeringId}`),
  );
  const snapshots = offeringRefs.length
    ? await db.getAll(...offeringRefs)
    : [];

  const alreadyContainingVirtualClasses = [];
  const updates = [];
  const missingOfferings = [];
  const invalidOfferings = [];
  const archivedOfferings = [];
  const homeroomOfferings = [];
  const malformedModuleArrays = [];

  for (let index = 0; index < offeringIds.length; index += 1) {
    const offeringId = offeringIds[index];
    const reference = referenceMap.get(offeringId);
    const snapshot = snapshots[index];

    if (!snapshot.exists) {
      missingOfferings.push({
        offeringId,
        assignmentIds: reference.assignmentIds,
        schoolIds: reference.schoolIds,
        classIds: reference.classIds,
        subjectKeys: reference.subjectKeys,
      });

      for (const schoolId of reference.schoolIds) {
        incrementSchoolStat(schoolStats, schoolId, "missingOfferingDocuments");
      }

      addError(errors, {
        type: "MISSING_OFFERING_DOCUMENT",
        offeringId,
        assignmentIds: reference.assignmentIds,
        message: "Referenced ClassSubjectOffering document does not exist.",
      });
      continue;
    }

    const data = snapshot.data() || {};
    const offeringSchoolId = asString(data.schoolId);
    const subjectKey = getOfferingSubjectKey(data);
    const summary = {
      offeringId,
      path: snapshot.ref.path,
      orgId: asString(data.orgId),
      schoolId: offeringSchoolId,
      academicYearId: asString(data.academicYearId),
      classId: asString(data.classId),
      subjectKey,
      assignmentIds: reference.assignmentIds,
      schoolIdsFromAssignments: reference.schoolIds,
      classIdsFromAssignments: reference.classIds,
      subjectKeysFromAssignments: reference.subjectKeys,
    };

    if (asString(data.orgId) !== ORG_ID) {
      invalidOfferings.push({
        ...summary,
        reason: "ORG_MISMATCH",
      });
      incrementSchoolStat(
        schoolStats,
        offeringSchoolId || reference.schoolIds[0],
        "invalidOfferingDocuments",
      );
      addError(errors, {
        type: "INVALID_OFFERING_ORG",
        offeringId,
        expectedOrgId: ORG_ID,
        actualOrgId: asString(data.orgId),
        message: "Offering belongs to a different organization.",
      });
      continue;
    }

    if (isArchivedOffering(data)) {
      archivedOfferings.push(summary);
      incrementSchoolStat(
        schoolStats,
        offeringSchoolId || reference.schoolIds[0],
        "archivedOfferings",
      );
      continue;
    }

    if (!subjectKey) {
      invalidOfferings.push({
        ...summary,
        reason: "MISSING_SUBJECT_KEY",
      });
      incrementSchoolStat(
        schoolStats,
        offeringSchoolId || reference.schoolIds[0],
        "invalidOfferingDocuments",
      );
      addError(errors, {
        type: "INVALID_OFFERING_SUBJECT",
        offeringId,
        message: "Offering has no subjectKey, key, or subjectId.",
      });
      continue;
    }

    if (isHomeroomOffering(data)) {
      homeroomOfferings.push({
        ...summary,
        reason: subjectKey,
      });
      incrementSchoolStat(
        schoolStats,
        offeringSchoolId || reference.schoolIds[0],
        "homeroomOfferings",
      );
      continue;
    }

    if (
      data.enabledModuleKeys !== undefined &&
      !Array.isArray(data.enabledModuleKeys)
    ) {
      malformedModuleArrays.push({
        ...summary,
        enabledModuleKeysType: typeof data.enabledModuleKeys,
      });
      incrementSchoolStat(
        schoolStats,
        offeringSchoolId || reference.schoolIds[0],
        "malformedModuleArrays",
      );
      addError(errors, {
        type: "MALFORMED_ENABLED_MODULE_KEYS",
        offeringId,
        message: "enabledModuleKeys is present but is not an array.",
      });
      continue;
    }

    const before = Array.isArray(data.enabledModuleKeys)
      ? [...data.enabledModuleKeys]
      : [];

    if (before.includes(VIRTUAL_CLASSES_MODULE)) {
      alreadyContainingVirtualClasses.push({
        ...summary,
        enabledModuleKeys: before,
      });
      incrementSchoolStat(
        schoolStats,
        offeringSchoolId || reference.schoolIds[0],
        "offeringsAlreadyContainingVirtualClasses",
      );
      continue;
    }

    const after = [...before, VIRTUAL_CLASSES_MODULE];
    const update = {
      ...summary,
      enabledModuleKeysBefore: before,
      enabledModuleKeysAfter: after,
      update: {
        enabledModuleKeys: after,
      },
    };

    updates.push(update);
    incrementSchoolStat(
      schoolStats,
      offeringSchoolId || reference.schoolIds[0],
      "offeringsRequiringUpdate",
    );
  }

  return {
    uniqueClassSubjectOfferingIds: offeringIds.length,
    alreadyContainingVirtualClasses,
    updates,
    missingOfferings,
    invalidOfferings,
    archivedOfferings,
    homeroomOfferings,
    malformedModuleArrays,
  };
}

function buildReport({
  args,
  assignmentInspection,
  offeringInspection,
  reportPath,
}) {
  const applyRequested = Object.prototype.hasOwnProperty.call(args, "apply");
  const applyConfirmed = args.apply === APPLY_CONFIRMATION;

  return {
    metadata: {
      generatedAt: new Date().toISOString(),
      orgId: ORG_ID,
      mode: applyConfirmed ? "APPLY" : "INSPECT",
      applyRequested,
      applyConfirmed,
      applyConfirmationRequired: APPLY_CONFIRMATION,
      firestoreWritesPerformed: false,
      writeCollection: `orgs/${ORG_ID}/classSubjectOfferings`,
      fieldsWritten: ["enabledModuleKeys"],
      reportPath,
    },
    selectionCriteria: {
      teacherAssignmentCollection: `orgs/${ORG_ID}/teacherAssignments`,
      assignmentStatus: "ACTIVE",
      assignmentMustNotBeEnded: true,
      assignmentMustContainOperationKind: VIRTUAL_CLASS_OPERATION,
      assignmentMustHaveClassSubjectOfferingId: true,
      offeringMustExist: true,
      offeringOrgId: ORG_ID,
      offeringMustNotBeArchived: true,
      offeringSubjectMustNotBe: ["CLASS", "HOMEROOM"],
    },
    summary: {
      teacherAssignmentsInspected:
        assignmentInspection.teacherAssignmentsInspected,
      activeAssignmentsContainingVirtualClass:
        assignmentInspection.activeAssignmentsContainingVirtualClass,
      invalidOfferingIdAssignments:
        assignmentInspection.invalidOfferingIdAssignments,
      uniqueClassSubjectOfferingIds:
        offeringInspection.uniqueClassSubjectOfferingIds,
      offeringsAlreadyContainingVirtualClasses:
        offeringInspection.alreadyContainingVirtualClasses.length,
      offeringsRequiringUpdate: offeringInspection.updates.length,
      missingOfferingDocuments: offeringInspection.missingOfferings.length,
      invalidOfferingDocuments: offeringInspection.invalidOfferings.length,
      archivedOfferings: offeringInspection.archivedOfferings.length,
      homeroomOfferings: offeringInspection.homeroomOfferings.length,
      malformedModuleArrays: offeringInspection.malformedModuleArrays.length,
      errors: assignmentInspection.errors.length,
    },
    perSchool: assignmentInspection.schoolStats,
    plannedUpdates: offeringInspection.updates,
    sampleOfferingIdsRequiringUpdate: offeringInspection.updates
      .slice(0, 25)
      .map((item) => item.offeringId),
    alreadyContainingVirtualClasses:
      offeringInspection.alreadyContainingVirtualClasses,
    missingOfferingDocuments: offeringInspection.missingOfferings,
    invalidOfferingDocuments: offeringInspection.invalidOfferings,
    archivedOfferings: offeringInspection.archivedOfferings,
    homeroomOfferings: offeringInspection.homeroomOfferings,
    malformedModuleArrays: offeringInspection.malformedModuleArrays,
    errors: assignmentInspection.errors,
  };
}

async function applyUpdates(db, updates) {
  let batch = db.batch();
  let batchSize = 0;
  let writesPerformed = 0;

  for (const item of updates) {
    batch.update(db.doc(item.path), {
      enabledModuleKeys: item.enabledModuleKeysAfter,
    });
    batchSize += 1;

    if (batchSize === MAX_BATCH_WRITES) {
      await batch.commit();
      writesPerformed += batchSize;
      batch = db.batch();
      batchSize = 0;
    }
  }

  if (batchSize > 0) {
    await batch.commit();
    writesPerformed += batchSize;
  }

  return writesPerformed;
}

async function main() {
  const args = parseArgs();
  const applyRequested = Object.prototype.hasOwnProperty.call(args, "apply");
  const applyConfirmed = args.apply === APPLY_CONFIRMATION;
  const reportPath = buildReportPath();

  initializeFirebase(args);

  const db = getFirestore();
  const nowMs = Date.now();
  const assignmentInspection = await inspectAssignments(db, nowMs);
  const offeringInspection = await inspectOfferings(
    db,
    assignmentInspection.referenceMap,
    assignmentInspection.schoolStats,
    assignmentInspection.errors,
  );

  const report = buildReport({
    args,
    assignmentInspection,
    offeringInspection,
    reportPath,
  });

  writeReport(report, reportPath);

  console.log(
    `ClassSubjectOffering Virtual Classes backfill: ${report.metadata.mode}`,
  );
  console.log(`Report: ${reportPath}`);
  console.log("Summary:");
  console.table([report.summary]);
  console.log("Per-school counts:");
  console.table(report.perSchool);
  console.log("Sample offering IDs requiring update:");
  console.log(report.sampleOfferingIdsRequiringUpdate);

  if (applyRequested && !applyConfirmed) {
    process.exitCode = 1;
    console.error(
      `APPLY was not performed. Re-run with --apply=${APPLY_CONFIRMATION} only after reviewing the report.`,
    );
    return;
  }

  if (!applyConfirmed) {
    console.log("INSPECT completed. No Firestore writes were performed.");
    return;
  }

  const writesPerformed = await applyUpdates(db, offeringInspection.updates);
  report.metadata.firestoreWritesPerformed = writesPerformed > 0;
  report.metadata.firestoreWriteCount = writesPerformed;
  report.metadata.appliedAt = new Date().toISOString();
  writeReport(report, reportPath);

  console.log(`Firestore writes performed: ${writesPerformed}`);
  console.log(`Final report: ${reportPath}`);
}

main().catch((error) => {
  console.error("ClassSubjectOffering Virtual Classes backfill failed:");
  console.error(error);
  process.exitCode = 1;
});
