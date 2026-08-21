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

const ORG_ID = "takween";
const SCHOOL_ID = "mrb-girls";
const ACADEMIC_YEAR_ID = "ay-1448";

const TARGETS = [
  {
    classId: "g3-quran-2",
    sourceClassId: "g3-quran-1",
    title: "ثالث ابتدائي / التحفيظ / ب",
  },
  {
    classId: "g4-quran-2",
    sourceClassId: "g4-quran-1",
    title: "رابع ابتدائي / التحفيظ / ب",
  },
  {
    classId: "g5-quran-2",
    sourceClassId: "g5-quran-1",
    title: "خامس ابتدائي / التحفيظ / ب",
  },
];

function parseArgs() {
  const args = {};

  for (const arg of process.argv.slice(2)) {
    if (!arg.startsWith("--")) continue;

    const [key, ...valueParts] = arg.slice(2).split("=");
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
    throw new Error(`Service account file not found: ${serviceAccountPath}`);
  }

  initializeApp({
    credential: cert(require(serviceAccountPath)),
  });
}

function classPath(classId) {
  return `orgs/${ORG_ID}/schools/${SCHOOL_ID}/academicYears/${ACADEMIC_YEAR_ID}/classes/${classId}`;
}

function buildTargetPayload(target, sourceData) {
  const sourceOrder = Number(sourceData.order);

  return {
    ...sourceData,
    id: target.classId,
    orgId: ORG_ID,
    schoolId: SCHOOL_ID,
    academicYearId: ACADEMIC_YEAR_ID,
    gradeId: target.classId.split("-")[0],
    streamId: "stream-quran",
    title: target.title,
    code: target.classId.toUpperCase(),
    sectionLabel: "ب",
    order: Number.isFinite(sourceOrder) ? sourceOrder + 1 : 11,
    schoolType: "PRIMARY",
    status: "ACTIVE",
    isActive: true,
    createdAt: FieldValue.serverTimestamp(),
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

function assertSourceClass(target, sourceData) {
  const expected = {
    orgId: ORG_ID,
    schoolId: SCHOOL_ID,
    academicYearId: ACADEMIC_YEAR_ID,
    gradeId: target.classId.split("-")[0],
    streamId: "stream-quran",
    sectionLabel: "أ",
  };

  for (const [field, value] of Object.entries(expected)) {
    if (sourceData[field] !== value) {
      throw new Error(
        `Source class ${classPath(target.sourceClassId)} has unexpected ${field}: ` +
          `${JSON.stringify(sourceData[field])}; expected ${JSON.stringify(value)}.`,
      );
    }
  }
}

async function inspectTargets(db) {
  const inspections = [];

  for (const target of TARGETS) {
    const sourceRef = db.doc(classPath(target.sourceClassId));
    const targetRef = db.doc(classPath(target.classId));
    const [sourceSnap, targetSnap] = await Promise.all([
      sourceRef.get(),
      targetRef.get(),
    ]);

    if (!sourceSnap.exists) {
      throw new Error(
        `Required source class does not exist: ${classPath(target.sourceClassId)}`,
      );
    }

    const sourceData = sourceSnap.data();
    assertSourceClass(target, sourceData);

    inspections.push({
      target,
      sourcePath: classPath(target.sourceClassId),
      targetPath: classPath(target.classId),
      targetExists: targetSnap.exists,
      payload: buildTargetPayload(target, sourceData),
    });
  }

  return inspections;
}

function printPlan(inspections, applyMode) {
  console.log("Missing girls Quran section-B classes repair");
  console.log({
    orgId: ORG_ID,
    schoolId: SCHOOL_ID,
    academicYearId: ACADEMIC_YEAR_ID,
    mode: applyMode ? "APPLY" : "DRY_RUN",
  });

  console.table(
    inspections.map((item) => ({
      classId: item.target.classId,
      sourceClassId: item.target.sourceClassId,
      title: item.target.title,
      exists: item.targetExists,
      action: item.targetExists ? "KEEP_EXISTING" : "CREATE",
    })),
  );

  for (const item of inspections) {
    if (item.targetExists) continue;

    console.log(`\nPayload for ${item.targetPath}`);
    console.dir(displayPayload(item.payload), {
      depth: null,
      colors: false,
    });
  }
}

async function createMissing(db, inspections) {
  const missing = inspections.filter((item) => !item.targetExists);

  if (missing.length === 0) {
    console.log("No writes required. All target class documents already exist.");
    return;
  }

  await db.runTransaction(async (transaction) => {
    const snapshots = [];

    for (const item of missing) {
      snapshots.push(
        await transaction.get(db.doc(item.targetPath)),
      );
    }

    for (let index = 0; index < snapshots.length; index += 1) {
      if (snapshots[index].exists) continue;

      transaction.create(
        db.doc(missing[index].targetPath),
        missing[index].payload,
      );
    }
  });

  console.log(`Created ${missing.length} missing class document(s).`);
}

async function main() {
  const args = parseArgs();
  const applyMode = Object.prototype.hasOwnProperty.call(args, "apply");

  if (args.apply && args.apply !== "true") {
    throw new Error("Use --apply without a value to enable writes.");
  }

  initializeFirebase();
  const db = getFirestore();
  const inspections = await inspectTargets(db);

  printPlan(inspections, applyMode);

  if (!applyMode) {
    console.log("DRY RUN completed. No Firestore writes were performed.");
    return;
  }

  await createMissing(db, inspections);
}

main().catch((error) => {
  console.error("Missing girls Quran classes repair failed:");
  console.error(error);
  process.exitCode = 1;
});
