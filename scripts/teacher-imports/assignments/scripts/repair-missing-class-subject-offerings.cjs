const fs = require("node:fs");
const path = require("node:path");

const { cert, getApps, initializeApp } = require("firebase-admin/app");

const { FieldValue, getFirestore } = require("firebase-admin/firestore");

const ORG_ID = "takween";
const ACADEMIC_YEAR_ID = "ay-1448";
const EXPECTED_TARGET_COUNT = 111;

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

const SUBJECTS = {
  art: {
    subjectKey: "ART",
    subjectId: "subject-art",
    subjectTitle: "فنية",
    order: 40,
  },
  arabic: {
    subjectKey: "ARABIC",
    subjectId: "subject-arabic",
    subjectTitle: "لغتي",
    order: 60,
  },
  digital: {
    subjectKey: "DIGITAL",
    subjectId: "subject-digital",
    subjectTitle: "رقمية",
    order: 120,
  },
  english: {
    subjectKey: "ENGLISH",
    subjectId: "subject-english",
    subjectTitle: "إنجليزي",
    order: 10,
  },
  "life-skills": {
    subjectKey: "LIFE_SKILLS",
    subjectId: "subject-life-skills",
    subjectTitle: "حياتية",
    order: 70,
  },
  math: {
    subjectKey: "MATH",
    subjectId: "subject-math",
    subjectTitle: "رياضيات",
    order: 20,
  },
  pe: {
    subjectKey: "PE",
    subjectId: "subject-pe",
    subjectTitle: "بدنية",
    order: 100,
  },
  quran: {
    subjectKey: "QURAN",
    subjectId: "subject-quran",
    subjectTitle: "قرآن",
    order: 50,
  },
  science: {
    subjectKey: "SCIENCE",
    subjectId: "subject-science",
    subjectTitle: "علوم",
    order: 30,
  },
  "social-studies": {
    subjectKey: "SOCIAL_STUDIES",
    subjectId: "subject-social-studies",
    subjectTitle: "اجتماعيات",
    order: 110,
  },
  tajweed: {
    subjectKey: "TAJWEED",
    subjectId: "subject-tajweed",
    subjectTitle: "تجويد",
    order: 130,
  },
};

const SCHOOL_IDS = ["mrb-boys-faleh", "mrb-boys-sayh", "mrb-girls"];

const TARGET_OFFERING_IDS = [
  "mrb-boys-faleh-g1-general-1-art",
  "mrb-boys-faleh-g1-general-1-pe",
  "mrb-boys-faleh-g1-quran-1-life-skills",
  "mrb-boys-faleh-g1-quran-1-pe",
  "mrb-boys-faleh-g1-quran-1-quran",
  "mrb-boys-faleh-g1-quran-1-science",
  "mrb-boys-faleh-g2-general-1-art",
  "mrb-boys-faleh-g2-general-1-life-skills",
  "mrb-boys-faleh-g2-general-1-pe",
  "mrb-boys-faleh-g2-general-1-quran",
  "mrb-boys-faleh-g2-quran-1-pe",
  "mrb-boys-faleh-g3-general-1-pe",
  "mrb-boys-faleh-g4-general-1-digital",
  "mrb-boys-faleh-g4-general-1-quran",
  "mrb-boys-faleh-g4-general-1-tajweed",
  "mrb-boys-faleh-g5-general-1-art",
  "mrb-boys-faleh-g5-general-1-life-skills",
  "mrb-boys-faleh-g5-general-1-quran",
  "mrb-boys-faleh-g5-general-1-tajweed",
  "mrb-boys-faleh-g6-general-1-art",
  "mrb-boys-faleh-g6-general-1-life-skills",
  "mrb-boys-faleh-g6-general-1-quran",
  "mrb-boys-faleh-g6-general-1-tajweed",
  "mrb-boys-sayh-g1-general-1-art",
  "mrb-boys-sayh-g1-general-1-pe",
  "mrb-boys-sayh-g1-general-2-pe",
  "mrb-boys-sayh-g1-quran-1-life-skills",
  "mrb-boys-sayh-g1-quran-1-pe",
  "mrb-boys-sayh-g1-quran-1-quran",
  "mrb-boys-sayh-g1-quran-1-science",
  "mrb-boys-sayh-g2-general-1-art",
  "mrb-boys-sayh-g2-general-1-life-skills",
  "mrb-boys-sayh-g2-general-1-pe",
  "mrb-boys-sayh-g2-general-1-quran",
  "mrb-boys-sayh-g2-general-2-art",
  "mrb-boys-sayh-g2-general-2-pe",
  "mrb-boys-sayh-g2-quran-1-pe",
  "mrb-boys-sayh-g3-general-1-pe",
  "mrb-boys-sayh-g3-quran-1-art",
  "mrb-boys-sayh-g3-quran-1-quran",
  "mrb-boys-sayh-g4-general-1-quran",
  "mrb-boys-sayh-g4-general-1-tajweed",
  "mrb-boys-sayh-g4-quran-1-quran",
  "mrb-boys-sayh-g4-quran-1-tajweed",
  "mrb-boys-sayh-g5-general-1-art",
  "mrb-boys-sayh-g5-general-1-life-skills",
  "mrb-boys-sayh-g5-general-1-quran",
  "mrb-boys-sayh-g5-general-1-tajweed",
  "mrb-boys-sayh-g6-general-1-art",
  "mrb-boys-sayh-g6-general-1-life-skills",
  "mrb-boys-sayh-g6-general-1-quran",
  "mrb-boys-sayh-g6-general-1-tajweed",
  "mrb-girls-g1-general-1-art",
  "mrb-girls-g1-general-1-pe",
  "mrb-girls-g1-quran-1-life-skills",
  "mrb-girls-g1-quran-1-pe",
  "mrb-girls-g1-quran-1-quran",
  "mrb-girls-g1-quran-1-science",
  "mrb-girls-g2-general-1-art",
  "mrb-girls-g2-general-1-life-skills",
  "mrb-girls-g2-general-1-pe",
  "mrb-girls-g2-general-1-quran",
  "mrb-girls-g2-general-2-art",
  "mrb-girls-g2-general-2-pe",
  "mrb-girls-g2-quran-1-pe",
  "mrb-girls-g3-general-1-pe",
  "mrb-girls-g3-quran-1-art",
  "mrb-girls-g3-quran-1-quran",
  "mrb-girls-g3-quran-2-arabic",
  "mrb-girls-g3-quran-2-art",
  "mrb-girls-g3-quran-2-english",
  "mrb-girls-g3-quran-2-life-skills",
  "mrb-girls-g3-quran-2-math",
  "mrb-girls-g3-quran-2-pe",
  "mrb-girls-g3-quran-2-quran",
  "mrb-girls-g3-quran-2-science",
  "mrb-girls-g4-general-1-quran",
  "mrb-girls-g4-quran-1-quran",
  "mrb-girls-g4-quran-1-tajweed",
  "mrb-girls-g4-quran-2-arabic",
  "mrb-girls-g4-quran-2-art",
  "mrb-girls-g4-quran-2-english",
  "mrb-girls-g4-quran-2-life-skills",
  "mrb-girls-g4-quran-2-math",
  "mrb-girls-g4-quran-2-pe",
  "mrb-girls-g4-quran-2-quran",
  "mrb-girls-g4-quran-2-social-studies",
  "mrb-girls-g4-quran-2-tajweed",
  "mrb-girls-g4-quran-2-science",
  "mrb-girls-g4-quran-2-digital",
  "mrb-girls-g5-general-1-art",
  "mrb-girls-g5-general-1-life-skills",
  "mrb-girls-g5-general-1-quran",
  "mrb-girls-g5-quran-1-life-skills",
  "mrb-girls-g5-quran-1-pe",
  "mrb-girls-g5-quran-1-quran",
  "mrb-girls-g5-quran-2-arabic",
  "mrb-girls-g5-quran-2-art",
  "mrb-girls-g5-quran-2-english",
  "mrb-girls-g5-quran-2-life-skills",
  "mrb-girls-g5-quran-2-math",
  "mrb-girls-g5-quran-2-pe",
  "mrb-girls-g5-quran-2-quran",
  "mrb-girls-g5-quran-2-science",
  "mrb-girls-g5-quran-2-social-studies",
  "mrb-girls-g5-quran-2-tajweed",
  "mrb-girls-g5-quran-2-digital",
  "mrb-girls-g6-general-1-art",
  "mrb-girls-g6-general-1-life-skills",
  "mrb-girls-g6-quran-1-life-skills",
  "mrb-girls-g6-quran-1-pe",
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

function parseTarget(offeringId) {
  const schoolId = SCHOOL_IDS.find((candidate) =>
    offeringId.startsWith(`${candidate}-`),
  );

  if (!schoolId) {
    throw new Error(`Unsupported target school in offering ID: ${offeringId}`);
  }

  const remainder = offeringId.slice(schoolId.length + 1);
  const subjectSlug = Object.keys(SUBJECTS).find((candidate) =>
    remainder.endsWith(`-${candidate}`),
  );

  if (!subjectSlug) {
    throw new Error(`Unsupported target subject in offering ID: ${offeringId}`);
  }

  const classId = remainder.slice(0, -(subjectSlug.length + 1));
  const subject = SUBJECTS[subjectSlug];

  return {
    offeringId,
    schoolId,
    classId,
    subjectSlug,
    subject,
  };
}

const TARGETS = TARGET_OFFERING_IDS.map(parseTarget);

if (
  TARGET_OFFERING_IDS.length !== EXPECTED_TARGET_COUNT ||
  new Set(TARGET_OFFERING_IDS).size !== EXPECTED_TARGET_COUNT
) {
  throw new Error(`Expected ${EXPECTED_TARGET_COUNT} unique target offerings.`);
}

function classPath(target) {
  return `orgs/${ORG_ID}/schools/${target.schoolId}/academicYears/${ACADEMIC_YEAR_ID}/classes/${target.classId}`;
}

function offeringPath(target) {
  return `orgs/${ORG_ID}/classSubjectOfferings/${target.offeringId}`;
}

function buildOfferingPayload(target, classData) {
  return {
    id: target.offeringId,
    orgId: ORG_ID,
    schoolType: "PRIMARY",
    schoolId: target.schoolId,
    academicYearId: ACADEMIC_YEAR_ID,
    gradeId: classData.gradeId,
    classId: target.classId,
    streamId: classData.streamId,
    subjectKey: target.subject.subjectKey,
    subjectId: target.subject.subjectId,
    subjectTitle: target.subject.subjectTitle,
    subjectTitleSnapshot: target.subject.subjectTitle,
    displayName: target.subject.subjectTitle,
    shortLabel: target.subject.subjectTitle,
    enabledModuleKeys: ENABLED_MODULE_KEYS,
    status: "ACTIVE",
    isActive: true,
    order: target.subject.order,
    offeringKind: "PRIMARY_SUBJECT",
    source: "seed-primary-class-subject-offerings",
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  };
}

function assertClass(target, classData) {
  const expected = {
    orgId: ORG_ID,
    schoolId: target.schoolId,
    academicYearId: ACADEMIC_YEAR_ID,
    gradeId: target.classId.split("-")[0],
    streamId: target.classId.includes("-quran-")
      ? "stream-quran"
      : "stream-general",
  };

  for (const [field, value] of Object.entries(expected)) {
    if (classData[field] !== value) {
      throw new Error(
        `Class ${classPath(target)} has unexpected ${field}: ` +
          `${JSON.stringify(classData[field])}; expected ${JSON.stringify(value)}.`,
      );
    }
  }
}

async function inspectTargets(db) {
  const inspections = [];

  for (const target of TARGETS) {
    const classRef = db.doc(classPath(target));
    const offeringRef = db.doc(offeringPath(target));
    const [classSnap, offeringSnap] = await Promise.all([
      classRef.get(),
      offeringRef.get(),
    ]);

    if (!classSnap.exists) {
      throw new Error(
        `Required class document does not exist: ${classPath(target)}`,
      );
    }

    assertClass(target, classSnap.data());

    inspections.push({
      target,
      classPath: classPath(target),
      offeringPath: offeringPath(target),
      offeringExists: offeringSnap.exists,
      payload: buildOfferingPayload(target, classSnap.data()),
    });
  }

  return inspections;
}

function displayPayload(payload) {
  return {
    ...payload,
    createdAt: "FieldValue.serverTimestamp()",
    updatedAt: "FieldValue.serverTimestamp()",
  };
}

function printPlan(inspections, applyMode) {
  console.log("Missing classSubjectOfferings targeted repair");
  console.log({
    orgId: ORG_ID,
    academicYearId: ACADEMIC_YEAR_ID,
    schools: SCHOOL_IDS,
    targetCount: TARGETS.length,
    mode: applyMode ? "APPLY" : "DRY_RUN",
  });

  console.table(
    inspections.map((item) => ({
      schoolId: item.target.schoolId,
      classId: item.target.classId,
      subjectKey: item.target.subject.subjectKey,
      offeringId: item.target.offeringId,
      action: item.offeringExists ? "KEEP_EXISTING" : "CREATE",
    })),
  );

  for (const item of inspections) {
    if (item.offeringExists) continue;

    console.log(`\nPayload for ${item.offeringPath}`);
    console.dir(displayPayload(item.payload), {
      depth: null,
      colors: false,
    });
  }
}

async function createMissing(db, inspections) {
  const missing = inspections.filter((item) => !item.offeringExists);

  if (missing.length === 0) {
    console.log("No writes required. All 106 target offerings already exist.");
    return;
  }

  await db.runTransaction(async (transaction) => {
    const snapshots = [];

    for (const item of missing) {
      snapshots.push(await transaction.get(db.doc(item.offeringPath)));
    }

    for (let index = 0; index < snapshots.length; index += 1) {
      if (snapshots[index].exists) continue;

      transaction.create(
        db.doc(missing[index].offeringPath),
        missing[index].payload,
      );
    }
  });

  console.log(`Created ${missing.length} missing offering document(s).`);
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
  console.error("Missing classSubjectOfferings repair failed:");
  console.error(error);
  process.exitCode = 1;
});
