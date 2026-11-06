"use strict";

const fs = require("node:fs");
const path = require("node:path");

const {
  applicationDefault,
  cert,
  getApps,
  initializeApp,
} = require("firebase-admin/app");
const { FieldValue, getFirestore } = require("firebase-admin/firestore");

const ORG_ID = "takween";
const VIRTUAL_CLASSES_MODULE = "VIRTUAL_CLASSES";
const APPLY_CONFIRMATION = "BACKFILL_KG_VIRTUAL_CLASSES";
const MAX_BATCH_WRITES = 400;
const MODES = new Set(["preview", "apply", "verify"]);
const REPORT_DIR = path.resolve(
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

function getSchoolType(data) {
  return upperString(data.profile?.schoolType || data.schoolType);
}

function getSubjectKey(data) {
  return upperString(data.subjectKey || data.key || data.subjectId);
}

function isActiveOffering(data, nowMs) {
  if (upperString(data.status) !== "ACTIVE") return false;
  if (data.isArchived === true) return false;
  if (data.isActive === false || data.active === false) return false;
  if (isFiniteNumber(data.startAt) && data.startAt > nowMs) return false;
  if (isFiniteNumber(data.endAt) && data.endAt < nowMs) return false;
  return true;
}

function isHomeroomOffering(data) {
  const subjectKey = getSubjectKey(data);
  return subjectKey === "CLASS" || subjectKey === "HOMEROOM";
}

function buildReportPath(mode) {
  const timestamp = new Date().toISOString().replace(/[.:]/g, "-");
  return path.join(
    REPORT_DIR,
    `backfill-kg-class-subject-offering-virtual-classes-${mode}-${timestamp}.json`,
  );
}

function writeReport(report, reportPath) {
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), "utf8");
}

async function loadKgSchoolIds(db) {
  const snapshot = await db.collection(`orgs/${ORG_ID}/schools`).get();
  const schoolIds = [];

  for (const schoolDoc of snapshot.docs) {
    const data = schoolDoc.data() || {};
    if (asString(data.orgId) !== ORG_ID) continue;
    if (getSchoolType(data) !== "KG") continue;
    schoolIds.push(schoolDoc.id);
  }

  return schoolIds.sort();
}

function createSchoolStats() {
  return {
    eligible: 0,
    alreadyEnabled: 0,
    requiringUpdate: 0,
    excludedHomeroom: 0,
    malformedModuleArrays: 0,
  };
}

function schoolStatsFor(perSchool, schoolId) {
  if (!perSchool[schoolId]) {
    perSchool[schoolId] = createSchoolStats();
  }
  return perSchool[schoolId];
}

async function inspectOfferings(db, kgSchoolIds, nowMs) {
  const kgSchoolIdSet = new Set(kgSchoolIds);
  const snapshot = await db
    .collection(`orgs/${ORG_ID}/classSubjectOfferings`)
    .get();

  const candidates = [];
  const alreadyEnabled = [];
  const malformed = [];
  const perSchool = {};
  let excludedHomeroom = 0;

  for (const offeringDoc of snapshot.docs) {
    const data = offeringDoc.data() || {};
    const schoolId = asString(data.schoolId);

    if (asString(data.orgId) !== ORG_ID) continue;
    if (!kgSchoolIdSet.has(schoolId)) continue;
    if (!isActiveOffering(data, nowMs)) continue;

    const stats = schoolStatsFor(perSchool, schoolId);

    if (isHomeroomOffering(data)) {
      excludedHomeroom += 1;
      stats.excludedHomeroom += 1;
      continue;
    }

    stats.eligible += 1;

    if (
      data.enabledModuleKeys !== undefined &&
      !Array.isArray(data.enabledModuleKeys)
    ) {
      const item = {
        offeringId: offeringDoc.id,
        path: offeringDoc.ref.path,
        schoolId,
        classId: asString(data.classId),
        subjectKey: getSubjectKey(data),
        enabledModuleKeysType: typeof data.enabledModuleKeys,
      };
      malformed.push(item);
      stats.malformedModuleArrays += 1;
      continue;
    }

    const enabledModuleKeys = Array.isArray(data.enabledModuleKeys)
      ? [...data.enabledModuleKeys]
      : [];
    const summary = {
      offeringId: offeringDoc.id,
      path: offeringDoc.ref.path,
      schoolId,
      academicYearId: asString(data.academicYearId),
      classId: asString(data.classId),
      subjectKey: getSubjectKey(data),
    };

    if (enabledModuleKeys.includes(VIRTUAL_CLASSES_MODULE)) {
      alreadyEnabled.push(summary);
      stats.alreadyEnabled += 1;
      continue;
    }

    candidates.push({
      ...summary,
      enabledModuleKeysBefore: enabledModuleKeys,
      enabledModuleKeysAfter: [
        ...enabledModuleKeys,
        VIRTUAL_CLASSES_MODULE,
      ],
    });
    stats.requiringUpdate += 1;
  }

  candidates.sort((a, b) => a.offeringId.localeCompare(b.offeringId));
  alreadyEnabled.sort((a, b) => a.offeringId.localeCompare(b.offeringId));

  return {
    totalOfferingDocuments: snapshot.size,
    candidates,
    alreadyEnabled,
    malformed,
    excludedHomeroom,
    perSchool,
  };
}

async function applyUpdates(db, candidates) {
  let batch = db.batch();
  let batchSize = 0;
  let writesPerformed = 0;

  for (const item of candidates) {
    batch.update(db.doc(item.path), {
      enabledModuleKeys: FieldValue.arrayUnion(VIRTUAL_CLASSES_MODULE),
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

function buildReport({ mode, reportPath, kgSchoolIds, inspection }) {
  return {
    metadata: {
      generatedAt: new Date().toISOString(),
      mode: mode.toUpperCase(),
      orgId: ORG_ID,
      firestoreWritesPerformed: false,
      writeCollection: `orgs/${ORG_ID}/classSubjectOfferings`,
      fieldsWritten: ["enabledModuleKeys"],
      reportPath,
    },
    selectionCriteria: {
      schoolCollection: `orgs/${ORG_ID}/schools`,
      schoolOrgId: ORG_ID,
      schoolType: "KG",
      offeringOrgId: ORG_ID,
      offeringStatus: "ACTIVE",
      offeringMustNotBeArchived: true,
      offeringSubjectMustNotBe: ["CLASS", "HOMEROOM"],
    },
    summary: {
      kgSchools: kgSchoolIds.length,
      offeringDocumentsInspected: inspection.totalOfferingDocuments,
      eligibleKgOfferings:
        inspection.candidates.length +
        inspection.alreadyEnabled.length +
        inspection.malformed.length,
      alreadyEnabled: inspection.alreadyEnabled.length,
      requiringUpdate: inspection.candidates.length,
      excludedHomeroom: inspection.excludedHomeroom,
      malformedModuleArrays: inspection.malformed.length,
    },
    kgSchoolIds,
    perSchool: inspection.perSchool,
    offeringIdsRequiringUpdate: inspection.candidates.map(
      (item) => item.offeringId,
    ),
    sampleUpdates: inspection.candidates.slice(0, 25),
    malformedModuleArrays: inspection.malformed,
  };
}

async function main() {
  const args = parseArgs();
  const mode = asString(args.mode || "preview").toLowerCase();

  if (!MODES.has(mode)) {
    throw new Error("--mode must be one of: preview, apply, verify");
  }

  if (mode === "apply" && args.confirm !== APPLY_CONFIRMATION) {
    throw new Error(
      `Apply requires --confirm=${APPLY_CONFIRMATION}. No writes were performed.`,
    );
  }

  if (mode !== "apply" && args.confirm) {
    throw new Error("--confirm is accepted only with --mode=apply");
  }

  initializeFirebase(args);

  const db = getFirestore();
  const kgSchoolIds = await loadKgSchoolIds(db);

  if (kgSchoolIds.length === 0) {
    throw new Error(
      "No KG schools were found. Refusing to inspect or update offerings.",
    );
  }

  const inspection = await inspectOfferings(db, kgSchoolIds, Date.now());
  const reportPath = buildReportPath(mode);
  const report = buildReport({
    mode,
    reportPath,
    kgSchoolIds,
    inspection,
  });

  if (mode === "apply") {
    if (inspection.malformed.length > 0) {
      report.metadata.applyBlocked = true;
      report.metadata.blockReason = "MALFORMED_ENABLED_MODULE_KEYS";
      writeReport(report, reportPath);
      throw new Error(
        `Apply blocked: ${inspection.malformed.length} eligible offering(s) have malformed enabledModuleKeys. Report: ${reportPath}`,
      );
    }

    const writesPerformed = await applyUpdates(db, inspection.candidates);
    report.metadata.firestoreWritesPerformed = writesPerformed > 0;
    report.metadata.firestoreWriteCount = writesPerformed;
    report.metadata.appliedAt = new Date().toISOString();
  }

  if (mode === "verify") {
    report.metadata.verificationPassed =
      inspection.candidates.length === 0 && inspection.malformed.length === 0;
  }

  writeReport(report, reportPath);

  console.log(`KG Virtual Classes backfill: ${mode.toUpperCase()}`);
  console.log(`Report: ${reportPath}`);
  console.table([report.summary]);
  console.log("Per-school counts:");
  console.table(report.perSchool);

  if (mode === "preview") {
    console.log("Preview completed. No Firestore writes were performed.");
  }

  if (mode === "apply") {
    console.log(
      `Firestore writes performed: ${report.metadata.firestoreWriteCount}`,
    );
  }

  if (mode === "verify" && !report.metadata.verificationPassed) {
    console.error(
      "Verification failed: eligible KG offerings still require updates or contain malformed module arrays.",
    );
    process.exitCode = 1;
  }

  if (mode === "verify" && report.metadata.verificationPassed) {
    console.log("Verification passed. No eligible KG offerings require updates.");
  }
}

main().catch((error) => {
  console.error("KG ClassSubjectOffering Virtual Classes backfill failed:");
  console.error(error);
  process.exitCode = 1;
});
