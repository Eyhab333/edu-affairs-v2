const admin = require("firebase-admin");
const path = require("path");

const serviceAccount = require(path.join(__dirname, "./service-account.json"));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

const ORG_ID = process.env.ORG_ID || "takween";
const DRY_RUN = process.env.DRY_RUN === "1";

function nowMs() {
  return Date.now();
}

function cleanIdPart(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u0600-\u06FF_-]+/gi, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function buildOfferingId(classId, subjectKey, subjectId) {
  const subjectPart = cleanIdPart(subjectKey || subjectId || "subject");
  return `${classId}-${subjectPart}`;
}

function getSubjectKey(subject) {
  return subject.key || subject.code || subject.id || "";
}

function getSubjectTitle(subject) {
  return subject.title || subject.name || subject.key || subject.code || subject.id;
}

function isArchived(data) {
  return data?.isArchived === true || data?.status === "archived";
}

function subjectAppliesToClass(subject, classRow) {
  const subjectStreamId = subject.streamId || "";
  const classStreamId = classRow.streamId || "";

  if (subject.appliesToAllStreams === true) {
    return true;
  }

  if (!subjectStreamId) {
    return true;
  }

  return subjectStreamId === classStreamId;
}

function getDefaultModulesForSubject(subject, school) {
  const schoolType = school?.profile?.schoolType || "";
  const subjectKey = getSubjectKey(subject).toUpperCase();
  const category = String(subject.category || "").toUpperCase();

  if (schoolType === "KG") {
    if (
      subjectKey.includes("VALUES") ||
      category.includes("VALUES") ||
      subjectKey.includes("QIM") ||
      category.includes("QIM")
    ) {
      return ["ASSESSMENTS", "NOTES", "GAMIFICATION"];
    }

    if (
      subjectKey.includes("CORNERS") ||
      category.includes("CORNERS") ||
      subjectKey.includes("ARKAN") ||
      category.includes("ARKAN")
    ) {
      return ["ASSESSMENTS", "NOTES", "GAMIFICATION"];
    }

    if (subjectKey.includes("QURAN") || category.includes("QURAN")) {
      return ["ASSESSMENTS", "LEARNING_LOSS", "NOTES", "GAMIFICATION"];
    }

    return ["ASSESSMENTS", "NOTES", "GAMIFICATION"];
  }

  if (subjectKey.includes("QURAN") || category.includes("QURAN")) {
    return [
      "ASSESSMENTS",
      "LEARNING_LOSS",
      "HOMEWORK",
      "LESSON_PREP",
      "RESOURCES",
      "GAMIFICATION",
      "NOTES",
    ];
  }

  return [
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
}

function buildOfferingData({ orgId, school, year, classRow, subject }) {
  const subjectKey = getSubjectKey(subject);
  const subjectTitle = getSubjectTitle(subject);
  const ts = nowMs();

  return {
    id: buildOfferingId(classRow.id, subjectKey, subject.id),

    orgId,
    schoolId: school.id,
    academicYearId: year.id,

    classId: classRow.id,
    gradeId: classRow.gradeId || "",
    streamId: classRow.streamId || "",

    subjectId: subject.id || "",
    subjectKey,
    subjectTitleSnapshot: subjectTitle,

    displayName: subjectTitle,
    shortLabel: subject.shortLabel || subjectKey || subjectTitle,

    status: "ACTIVE",
    isArchived: false,

    order: Number(subject.order ?? 0),

    enabledModuleKeys: getDefaultModulesForSubject(subject, school),

    gradingPolicy: {
      gradingScaleKey: "",
      note: "",
    },

    assessmentPolicy: {
      assessmentTemplateIds: [],
      trackerTemplateIds: [],
      allowedAssessmentSlotKeys: [],
      allowLearningLoss: true,
      requiresReview: false,
      note: "",
    },

    curriculumPolicy: {
      curriculumPlanId: "",
      questionBankId: "",
      resourceFolderId: "",
      lessonPrepRequired: false,
      homeworkEnabled: true,
      resourcesEnabled: true,
      questionBankEnabled: true,
      note: "",
    },

    curriculumPlanId: "",
    questionBankId: "",
    resourceFolderId: "",

    note: "",
    metadata: {
      seededBy: "seed-class-subject-offerings",
      seededAt: ts,
    },

    createdAt: ts,
    updatedAt: ts,
  };
}

async function getCollectionDocs(collectionPath) {
  const snap = await db.collection(collectionPath).get();

  return snap.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  }));
}

async function seedClassSubjectOfferings() {
  const orgRef = db.doc(`orgs/${ORG_ID}`);
  const orgSnap = await orgRef.get();

  if (!orgSnap.exists) {
    throw new Error(`Org not found: ${ORG_ID}`);
  }

  const schools = await getCollectionDocs(`orgs/${ORG_ID}/schools`);
  const activeSchools = schools.filter((school) => !isArchived(school));

  let created = 0;
  let skipped = 0;
  let scanned = 0;

  let batch = db.batch();
  let batchWrites = 0;

  for (const school of activeSchools) {
    const years = await getCollectionDocs(
      `orgs/${ORG_ID}/schools/${school.id}/academicYears`
    );

    const activeYears = years.filter((year) => !isArchived(year));

    for (const year of activeYears) {
      const classes = await getCollectionDocs(
        `orgs/${ORG_ID}/schools/${school.id}/academicYears/${year.id}/classes`
      );

      const subjects = await getCollectionDocs(
        `orgs/${ORG_ID}/schools/${school.id}/academicYears/${year.id}/subjects`
      );

      const activeClasses = classes.filter((classRow) => !isArchived(classRow));
      const activeSubjects = subjects.filter((subject) => !isArchived(subject));

      for (const classRow of activeClasses) {
        for (const subject of activeSubjects) {
          if (!subjectAppliesToClass(subject, classRow)) {
            skipped += 1;
            continue;
          }

          const subjectKey = getSubjectKey(subject);
          const offeringId = buildOfferingId(classRow.id, subjectKey, subject.id);

          const offeringRef = db.doc(
            `orgs/${ORG_ID}/classSubjectOfferings/${offeringId}`
          );

          scanned += 1;

          const existingSnap = await offeringRef.get();

          if (existingSnap.exists) {
            skipped += 1;
            continue;
          }

          const data = buildOfferingData({
            orgId: ORG_ID,
            school,
            year,
            classRow,
            subject,
          });

          console.log(
            `[CREATE] ${school.id} / ${year.id} / ${classRow.id} / ${subjectKey}`
          );

          if (!DRY_RUN) {
            batch.set(offeringRef, data);
            batchWrites += 1;
          }

          created += 1;

          if (batchWrites >= 450) {
            await batch.commit();
            batch = db.batch();
            batchWrites = 0;
          }
        }
      }
    }
  }

  if (!DRY_RUN && batchWrites > 0) {
    await batch.commit();
  }

  console.log("");
  console.log("Done.");
  console.log({
    orgId: ORG_ID,
    dryRun: DRY_RUN,
    scanned,
    created,
    skipped,
  });
}

seedClassSubjectOfferings()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });