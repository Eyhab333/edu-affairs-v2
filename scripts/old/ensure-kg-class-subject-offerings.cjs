const admin = require("firebase-admin");
const path = require("path");

const serviceAccount = require(path.join(__dirname, "./service-account.json"));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

const orgId = process.env.ORG_ID || "takween";
const dryRun = process.argv.includes("--dry-run");

const now = Date.now();

/**
 * المجالات المطلوبة لكل فصل روضة.
 *
 * ملاحظة:
 * CLASS لا ننشئه هنا؛ لأنه إسناد فصل عام وليس مجال قياس/متابعة.
 */
const KG_DOMAIN_OFFERINGS = [
  {
    suffix: "quran",
    subjectKey: "QURAN",
    subjectId: "quran",
    subjectTitle: "القرآن",
    displayName: "القرآن",
    order: 10,
  },
  {
    suffix: "learning-gardens",
    subjectKey: "LEARNING_GARDENS",
    subjectId: "learning-gardens",
    subjectTitle: "بساتين المعرفة",
    displayName: "بساتين المعرفة",
    order: 20,
  },
  {
    suffix: "numbers",
    subjectKey: "NUMBERS",
    subjectId: "numbers",
    subjectTitle: "الأرقام",
    displayName: "الأرقام",
    order: 30,
  },
  {
    suffix: "values",
    subjectKey: "VALUES",
    subjectId: "values",
    subjectTitle: "القيم / أسماء الله الحسنى",
    displayName: "القيم / أسماء الله الحسنى",
    order: 40,
  },
  {
    suffix: "corners",
    subjectKey: "CORNERS",
    subjectId: "corners",
    subjectTitle: "الأركان / الأنشطة",
    displayName: "الأركان / الأنشطة",
    order: 50,
  },
];

function isKgClass(classData) {
  const gradeId = String(classData.gradeId || "").toLowerCase();
  const classId = String(classData.id || "").toLowerCase();
  const schoolId = String(classData.schoolId || "").toLowerCase();

  return (
    gradeId.startsWith("kg") ||
    classId.startsWith("kg") ||
    schoolId.startsWith("kg")
  );
}

function normalizeClassDoc(docSnap) {
  const data = docSnap.data() || {};

  return {
    id: data.id || docSnap.id,
    orgId: data.orgId || orgId,
    schoolId: data.schoolId || "",
    academicYearId: data.academicYearId || "",
    gradeId: data.gradeId || "",
    streamId: data.streamId || "",
    title: data.title || data.code || docSnap.id,
    code: data.code || docSnap.id,
    order: typeof data.order === "number" ? data.order : 0,
    rawPath: docSnap.ref.path,
  };
}

async function loadKgClassesFromCollectionGroup() {
  const snap = await db.collectionGroup("classes").get();

  return snap.docs
    .map(normalizeClassDoc)
    .filter((item) => item.orgId === orgId)
    .filter(isKgClass)
    .filter((item) => item.schoolId && item.academicYearId && item.gradeId);
}

async function loadKgClassesFromRootCollectionFallback() {
  const ref = db.collection("orgs").doc(orgId).collection("classes");
  const snap = await ref.get();

  return snap.docs
    .map(normalizeClassDoc)
    .filter(isKgClass)
    .filter((item) => item.schoolId && item.academicYearId && item.gradeId);
}

function buildOfferingId(classId, suffix) {
  return `${classId}-${suffix}`;
}

function buildOfferingPayload(classInfo, domain) {
  const id = buildOfferingId(classInfo.id, domain.suffix);

  return {
    id,
    orgId,
    schoolId: classInfo.schoolId,
    academicYearId: classInfo.academicYearId,
    gradeId: classInfo.gradeId || "",
    streamId: classInfo.streamId || "",
    classId: classInfo.id,

    subjectId: domain.subjectId,
    subjectKey: domain.subjectKey,
    subjectTitle: domain.subjectTitle,
    displayName: domain.displayName,

    status: "ACTIVE",
    isActive: true,
    order: domain.order,

    /**
     * حقول مساعدة للواجهة والتشخيص، حتى لو لم تكن إلزامية في العقود.
     */
    offeringKind: "KG_DOMAIN",
    source: "ensure-kg-class-subject-offerings",
    note: "تم إنشاؤه/تحديثه لضبط مجالات الروضة داخل الفصل.",

    updatedAt: now,
  };
}

async function main() {
  const startedAt = Date.now();

  const result = {
    orgId,
    dryRun,
    scannedClasses: 0,
    kgClasses: 0,
    created: 0,
    updated: 0,
    skippedExistingNoChange: 0,
    skippedMissingContext: 0,
    classes: [],
  };

  console.log("Starting KG ClassSubjectOfferings ensure script...");
  console.log({ orgId, dryRun });

  let classes = [];

  try {
    classes = await loadKgClassesFromCollectionGroup();
  } catch (error) {
    console.log("collectionGroup('classes') failed. Trying fallback...");
    console.log(error.message || error);
  }

  if (classes.length === 0) {
    try {
      classes = await loadKgClassesFromRootCollectionFallback();
    } catch (error) {
      console.log("Root org classes fallback failed.");
      console.log(error.message || error);
    }
  }

  result.scannedClasses = classes.length;
  result.kgClasses = classes.length;

  const offeringsRef = db
    .collection("orgs")
    .doc(orgId)
    .collection("classSubjectOfferings");

  for (const classInfo of classes) {
    if (!classInfo.schoolId || !classInfo.academicYearId || !classInfo.gradeId) {
      result.skippedMissingContext += 1;
      console.log("SKIP class missing context", classInfo);
      continue;
    }

    const classResult = {
      classId: classInfo.id,
      schoolId: classInfo.schoolId,
      academicYearId: classInfo.academicYearId,
      gradeId: classInfo.gradeId,
      rawPath: classInfo.rawPath,
      offerings: [],
    };

    for (const domain of KG_DOMAIN_OFFERINGS) {
      const offeringId = buildOfferingId(classInfo.id, domain.suffix);
      const ref = offeringsRef.doc(offeringId);

      const payload = buildOfferingPayload(classInfo, domain);

      const snap = await ref.get();

      const existing = snap.exists ? snap.data() || {} : null;

      const createdAtPatch = snap.exists ? {} : { createdAt: now };

      const patch = {
        ...payload,
        ...createdAtPatch,
      };

      let changed = !snap.exists;

      if (snap.exists) {
        const fieldsToCompare = [
          "schoolId",
          "academicYearId",
          "gradeId",
          "streamId",
          "classId",
          "subjectId",
          "subjectKey",
          "subjectTitle",
          "displayName",
          "status",
          "isActive",
          "order",
        ];

        changed = fieldsToCompare.some((field) => existing[field] !== patch[field]);
      }

      if (!changed) {
        result.skippedExistingNoChange += 1;
        classResult.offerings.push({
          id: offeringId,
          action: "SKIPPED_NO_CHANGE",
        });
        continue;
      }

      if (!dryRun) {
        await ref.set(patch, { merge: true });
      }

      if (snap.exists) {
        result.updated += 1;
        classResult.offerings.push({
          id: offeringId,
          action: dryRun ? "DRY_RUN_UPDATE" : "UPDATED",
        });
      } else {
        result.created += 1;
        classResult.offerings.push({
          id: offeringId,
          action: dryRun ? "DRY_RUN_CREATE" : "CREATED",
        });
      }

      console.log(
        `${dryRun ? "DRY RUN" : "OK"} ${snap.exists ? "update" : "create"} ${offeringId}`,
      );
    }

    result.classes.push(classResult);
  }

  const finishedAt = Date.now();

  console.log("Done.");
  console.log({
    orgId: result.orgId,
    dryRun: result.dryRun,
    scannedClasses: result.scannedClasses,
    kgClasses: result.kgClasses,
    created: result.created,
    updated: result.updated,
    skippedExistingNoChange: result.skippedExistingNoChange,
    skippedMissingContext: result.skippedMissingContext,
    durationMs: finishedAt - startedAt,
  });

  console.log("Details:");
  console.dir(result.classes, { depth: null });
}

main().catch((error) => {
  console.error("Failed to ensure KG class subject offerings.");
  console.error(error);
  process.exit(1);
});