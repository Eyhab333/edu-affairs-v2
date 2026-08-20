const fs = require("node:fs");
const path = require("node:path");

const {
  cert,
  getApps,
  initializeApp,
} = require("firebase-admin/app");

const {
  FieldValue,
  getFirestore,
} = require("firebase-admin/firestore");

const APPLY_CONFIRMATION =
  "CREATE_G4_DIGITAL_OFFERINGS";

const ORG_ID = "takween";
const SCHOOL_ID = "mrb-boys-sayh";
const ACADEMIC_YEAR_ID = "ay-1448";

const ENABLED_MODULE_KEYS = [
  "ASSESSMENTS",
  "LEARNING_LOSS",
  "HOMEWORK",
  "LESSON_PREP",
  "QUESTION_BANK",
  "CURRICULUM_PLAN",
  "RESOURCES",
  "GAMIFICATION",
  "NOTES",
];

const TARGETS = [
  {
    classId: "g4-general-1",
    gradeId: "g4",
    streamId: "stream-general",
    offeringId:
      "mrb-boys-sayh-g4-general-1-digital",
  },
  {
    classId: "g4-quran-1",
    gradeId: "g4",
    streamId: "stream-quran",
    offeringId:
      "mrb-boys-sayh-g4-quran-1-digital",
  },
];

function parseArgs() {
  const args = {};

  for (const arg of process.argv.slice(2)) {
    if (!arg.startsWith("--")) continue;

    const [key, ...valueParts] = arg
      .slice(2)
      .split("=");

    args[key] = valueParts.join("=");
  }

  return args;
}

function initializeFirebase() {
  if (getApps().length > 0) return;

  const serviceAccountPath = path.resolve(
    process.cwd(),
    "service-account.json",
  );

  if (!fs.existsSync(serviceAccountPath)) {
    throw new Error(
      `Service account file not found: ${serviceAccountPath}`,
    );
  }

  const serviceAccount = require(
    serviceAccountPath,
  );

  initializeApp({
    credential: cert(serviceAccount),
  });
}

function classPath(target) {
  return [
    "orgs",
    ORG_ID,
    "schools",
    SCHOOL_ID,
    "academicYears",
    ACADEMIC_YEAR_ID,
    "classes",
    target.classId,
  ].join("/");
}

function offeringPath(target) {
  return [
    "orgs",
    ORG_ID,
    "classSubjectOfferings",
    target.offeringId,
  ].join("/");
}

function buildOfferingPayload(target) {
  return {
    id: target.offeringId,

    orgId: ORG_ID,
    schoolId: SCHOOL_ID,
    academicYearId: ACADEMIC_YEAR_ID,

    gradeId: target.gradeId,
    classId: target.classId,
    streamId: target.streamId,

    subjectKey: "DIGITAL",
    subjectId: "subject-digital",
    subjectTitle: "رقمية",
    subjectTitleSnapshot: "رقمية",
    displayName: "رقمية",
    shortLabel: "رقمية",

    enabledModuleKeys: ENABLED_MODULE_KEYS,

    status: "ACTIVE",
    isActive: true,
    order: 1,

    offeringKind: "PRIMARY_SUBJECT",
    source: "seed-primary-class-subject-offerings",

    createdAt: FieldValue.serverTimestamp(),
    schoolType: "PRIMARY",
    updatedAt: FieldValue.serverTimestamp(),
  };
}

function displayPayload(payload) {
  return {
    ...payload,
    createdAt: "FieldValue.serverTimestamp()",
    updatedAt: "FieldValue.serverTimestamp()",
  };
}

function assertClassMatches(target, classData) {
  const expected = {
    orgId: ORG_ID,
    schoolId: SCHOOL_ID,
    academicYearId: ACADEMIC_YEAR_ID,
    gradeId: target.gradeId,
    streamId: target.streamId,
  };

  for (const [field, value] of Object.entries(
    expected,
  )) {
    if (classData[field] !== value) {
      throw new Error(
        `Class ${target.classId} has unexpected ${field}: ` +
          `${JSON.stringify(classData[field])}; expected ${JSON.stringify(value)}.`,
      );
    }
  }
}

async function inspectTargets(db) {
  const inspections = [];

  for (const target of TARGETS) {
    const classRef = db.doc(classPath(target));
    const offeringRef = db.doc(
      offeringPath(target),
    );

    const [classSnap, offeringSnap] =
      await Promise.all([
        classRef.get(),
        offeringRef.get(),
      ]);

    if (!classSnap.exists) {
      throw new Error(
        `Required class document does not exist: ${classPath(target)}`,
      );
    }

    assertClassMatches(target, classSnap.data());

    inspections.push({
      target,
      classPath: classPath(target),
      offeringPath: offeringPath(target),
      classExists: true,
      offeringExists: offeringSnap.exists,
      offeringData: offeringSnap.exists
        ? offeringSnap.data()
        : null,
      payload: buildOfferingPayload(target),
    });
  }

  return inspections;
}

function printInspection(inspections, mode) {
  console.log("G4 DIGITAL offerings repair");
  console.log({
    orgId: ORG_ID,
    schoolId: SCHOOL_ID,
    academicYearId: ACADEMIC_YEAR_ID,
    mode,
    targetCount: TARGETS.length,
  });

  console.log("\nTarget status");

  console.table(
    inspections.map((item) => ({
      classId: item.target.classId,
      classExists: item.classExists,
      offeringId: item.target.offeringId,
      offeringExists: item.offeringExists,
      action: item.offeringExists
        ? "KEEP_EXISTING"
        : mode === "APPLY"
          ? "CREATE"
          : "WOULD_CREATE",
    })),
  );

  for (const item of inspections) {
    if (item.offeringExists) continue;

    console.log(
      `\nPayload for ${item.offeringPath}`,
    );
    console.dir(
      displayPayload(item.payload),
      { depth: null, colors: false },
    );
  }
}

async function applyCreates(db, inspections) {
  const missing = inspections.filter(
    (item) => !item.offeringExists,
  );

  if (missing.length === 0) {
    console.log(
      "\nNo writes required. All target offerings already exist.",
    );
    return;
  }

  await db.runTransaction(async (transaction) => {
    const offeringRefs = missing.map((item) =>
      db.doc(item.offeringPath),
    );

    const currentOfferingSnaps = await Promise.all(
      offeringRefs.map((ref) => transaction.get(ref)),
    );

    for (
      let index = 0;
      index < currentOfferingSnaps.length;
      index += 1
    ) {
      const snap = currentOfferingSnaps[index];
      const item = missing[index];

      if (snap.exists) continue;

      transaction.create(
        offeringRefs[index],
        item.payload,
      );
    }
  });

  console.log(
    `\nCreated ${missing.length} missing offering document(s).`,
  );

  for (const item of missing) {
    console.log(`CREATED ${item.offeringPath}`);
  }
}

function verifyExistingOffering(target, data) {
  const expected = buildOfferingPayload(target);
  const fieldsToVerify = [
    "id",
    "orgId",
    "schoolId",
    "academicYearId",
    "gradeId",
    "classId",
    "streamId",
    "subjectKey",
    "subjectId",
    "subjectTitle",
    "subjectTitleSnapshot",
    "displayName",
    "shortLabel",
    "status",
    "isActive",
    "order",
    "offeringKind",
    "source",
    "schoolType",
  ];

  for (const field of fieldsToVerify) {
    if (data[field] !== expected[field]) {
      return `unexpected ${field}: ${JSON.stringify(data[field])}`;
    }
  }

  if (
    JSON.stringify(data.enabledModuleKeys) !==
    JSON.stringify(expected.enabledModuleKeys)
  ) {
    return "unexpected enabledModuleKeys";
  }

  return null;
}

async function verifyTargets(db) {
  const inspections = await inspectTargets(db);
  const failures = [];

  for (const item of inspections) {
    if (!item.offeringExists) {
      failures.push(
        `${item.offeringPath} does not exist`,
      );
      continue;
    }

    const mismatch = verifyExistingOffering(
      item.target,
      item.offeringData,
    );

    if (mismatch) {
      failures.push(
        `${item.offeringPath}: ${mismatch}`,
      );
    }
  }

  console.log("G4 DIGITAL offerings verification");
  console.table(
    inspections.map((item) => ({
      classId: item.target.classId,
      classExists: item.classExists,
      offeringId: item.target.offeringId,
      offeringExists: item.offeringExists,
      payloadMatches: item.offeringExists
        ? !failures.some((failure) =>
            failure.startsWith(item.offeringPath),
          )
        : false,
    })),
  );

  if (failures.length > 0) {
    throw new Error(
      `Verification failed:\n- ${failures.join("\n- ")}`,
    );
  }

  console.log(
    "Verification passed. Both target classes and offerings match the expected shape.",
  );
}

async function main() {
  const args = parseArgs();
  const applyMode =
    args.apply === APPLY_CONFIRMATION;
  const verifyMode = args.verify === undefined
    ? false
    : args.verify === "" || args.verify === "true";

  if (
    args.apply &&
    args.apply !== APPLY_CONFIRMATION
  ) {
    throw new Error(
      `Invalid apply confirmation. Expected --apply=${APPLY_CONFIRMATION}.`,
    );
  }

  if (applyMode && verifyMode) {
    throw new Error(
      "Use either apply mode or verify mode, not both.",
    );
  }

  initializeFirebase();

  const db = getFirestore();

  if (verifyMode) {
    await verifyTargets(db);
    return;
  }

  const inspections = await inspectTargets(db);

  printInspection(
    inspections,
    applyMode ? "APPLY" : "DRY_RUN_READ_ONLY",
  );

  if (!applyMode) {
    console.log(
      "\nDRY RUN completed. No Firestore writes were performed.",
    );
    console.log(
      `To apply explicitly, use --apply=${APPLY_CONFIRMATION}`,
    );
    return;
  }

  await applyCreates(db, inspections);
}

main().catch((error) => {
  console.error(
    "\nG4 DIGITAL offerings repair failed:",
  );
  console.error(error);
  process.exitCode = 1;
});
