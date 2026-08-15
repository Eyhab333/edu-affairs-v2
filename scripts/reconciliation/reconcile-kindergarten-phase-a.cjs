/*
 * Kindergarten normalization — Phase A
 *
 * Scope: subject catalogs and classSubjectOfferings only.
 * This script never reads or writes identities except that it reads assignment
 * collections solely to protect forbidden KG1 offerings from unsafe archival.
 *
 * Default: DRY_RUN (no Firestore writes)
 * Apply:   node scripts/reconciliation/reconcile-kindergarten-phase-a.cjs --apply --confirm=KG_PHASE_A_NORMALIZATION
 */

const admin = require("firebase-admin");
const fs = require("node:fs");
const path = require("node:path");

const ORG_ID = "takween";
const ACADEMIC_YEAR_ID = "ay-1448";
const KG_SCHOOL_IDS = ["kg-01", "kg-02", "kg-03", "kg-04"];
const KG_CLASSES = [
  { gradeId: "kg1", classId: "kg1-a" },
  { gradeId: "kg2", classId: "kg2-a" },
  { gradeId: "kg3", classId: "kg3-a" },
];
const APPLY_CONFIRMATION = "KG_PHASE_A_NORMALIZATION";
const APPLY_REQUESTED = process.argv.includes("--apply");
const APPLY_CONFIRMED = process.argv.includes(`--confirm=${APPLY_CONFIRMATION}`);
const APPLY = APPLY_REQUESTED && APPLY_CONFIRMED;
const SOURCE_REPORT_PATH = path.resolve(
  process.cwd(),
  "scripts",
  "inspections",
  "inspect-kindergarten-setup-report.json",
);
const OUTPUT_REPORT_PATH = path.resolve(
  process.cwd(),
  "scripts",
  "reconciliation",
  "reconcile-kindergarten-phase-a-report.json",
);

const SUBJECTS = [
  { key: "QURAN", id: "subject-quran", suffix: "quran", title: "القرآن الكريم", order: 10 },
  { key: "ADHKAR_IDENTITY_ANTHEMS", id: "subject-adhkar-identity-anthems", suffix: "adhkar-identity-anthems", title: "الأذكار والهوية الوطنية والأناشيد", order: 20 },
  { key: "LEARNING_GARDENS", id: "subject-learning-gardens", suffix: "learning-gardens", title: "بساتين المعرفة", order: 30 },
  { key: "COUNT_AND_CALCULATE", id: "subject-count-and-calculate", suffix: "count-and-calculate", title: "نعد ونحسب", order: 40 },
  { key: "VALUES", id: "subject-values", suffix: "values", title: "القيم", order: 50 },
  { key: "CORNERS", id: "subject-corners", suffix: "corners", title: "الأركان", order: 60 },
];
const SUBJECTS_BY_KEY = new Map(SUBJECTS.map((subject) => [subject.key, subject]));
const KG1_SUBJECT_KEYS = new Set(SUBJECTS.slice(0, 4).map((subject) => subject.key));
const KG2_KG3_SUBJECT_KEYS = new Set(SUBJECTS.map((subject) => subject.key));
const FORBIDDEN_KG1_SUBJECT_KEYS = new Set(["VALUES", "CORNERS"]);
const LEGACY_SUBJECT_KEYS = new Set(["CLASS", "NUMBERS"]);

function initAdmin() {
  if (admin.apps.length > 0) return;
  const serviceAccountPath = path.resolve(
    process.env.SERVICE_ACCOUNT_PATH || path.join(process.cwd(), "service-account.json"),
  );
  const serviceAccount = require(serviceAccountPath);
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    projectId: serviceAccount.project_id,
  });
}

function asString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function subjectKeyOf(data) {
  return asString(data.key || data.subjectKey || data.code).toUpperCase();
}

function offeringSubjectKeyOf(data) {
  return asString(data.subjectKey || data.key || data.code).toUpperCase();
}

function isArchived(data) {
  return data.isArchived === true || asString(data.status).toUpperCase() === "ARCHIVED";
}

function isActive(data) {
  const status = asString(data.status).toUpperCase();
  return data.isArchived !== true && data.isActive !== false && data.active !== false && !["ARCHIVED", "ENDED", "INACTIVE", "DISABLED"].includes(status);
}

function docData(snapshot) {
  return { id: snapshot.id, path: snapshot.ref.path, ...(snapshot.data() || {}) };
}

function uniqueStrings(values) {
  return Array.from(new Set(values.map(asString).filter(Boolean)));
}

function canonicalOfferingId(schoolId, classId, subject) {
  return `${schoolId}-${classId}-${subject.suffix}`;
}

function expectedSubjectKeysForGrade(gradeId) {
  return gradeId === "kg1" ? KG1_SUBJECT_KEYS : KG2_KG3_SUBJECT_KEYS;
}

function scopedToTarget(data) {
  return KG_SCHOOL_IDS.includes(asString(data.schoolId)) && asString(data.academicYearId) === ACADEMIC_YEAR_ID;
}

function sameOfferingContext(offering, target) {
  return (
    asString(offering.schoolId) === target.schoolId &&
    asString(offering.academicYearId) === ACADEMIC_YEAR_ID &&
    asString(offering.gradeId) === target.gradeId &&
    asString(offering.classId) === target.classId &&
    offeringSubjectKeyOf(offering) === target.subject.key
  );
}

function getSourceReportSummary() {
  if (!fs.existsSync(SOURCE_REPORT_PATH)) {
    return { exists: false, path: SOURCE_REPORT_PATH, warnings: ["Read-only KG inspection report not found."] };
  }
  const report = JSON.parse(fs.readFileSync(SOURCE_REPORT_PATH, "utf8"));
  const reportSchoolIds = new Set((report.schools || []).map((item) => asString(item.id)));
  const reportClassContexts = new Set(
    (report.classes || []).map((item) => [item.schoolId, item.academicYearId, item.gradeId, item.id].map(asString).join("|")),
  );
  const expectedClassContexts = KG_SCHOOL_IDS.flatMap((schoolId) =>
    KG_CLASSES.map((item) => [schoolId, ACADEMIC_YEAR_ID, item.gradeId, item.classId].join("|")),
  );
  const warnings = [];
  if (report.metadata?.orgId !== ORG_ID) warnings.push(`Source report org is ${report.metadata?.orgId || "missing"}, expected ${ORG_ID}.`);
  if (KG_SCHOOL_IDS.some((schoolId) => !reportSchoolIds.has(schoolId))) warnings.push("Source report does not list every target KG school.");
  if (expectedClassContexts.some((context) => !reportClassContexts.has(context))) warnings.push("Source report does not list every target KG class context.");
  return {
    exists: true,
    path: SOURCE_REPORT_PATH,
    generatedAt: report.metadata?.generatedAt || "",
    warnings,
  };
}

function buildCatalogPayload({ schoolId, subject, now }) {
  return {
    id: subject.id,
    orgId: ORG_ID,
    schoolId,
    academicYearId: ACADEMIC_YEAR_ID,
    code: subject.key,
    key: subject.key,
    title: subject.title,
    streamId: "",
    appliesToAllStreams: true,
    category: "KG",
    order: subject.order,
    isArchived: false,
    metadata: { normalizedBy: "reconcile-kindergarten-phase-a", normalizedAt: now },
    createdAt: now,
    updatedAt: now,
  };
}

function buildOfferingPayload({ schoolId, classInfo, subject, now }) {
  return {
    id: canonicalOfferingId(schoolId, classInfo.classId, subject),
    orgId: ORG_ID,
    schoolId,
    academicYearId: ACADEMIC_YEAR_ID,
    classId: classInfo.classId,
    gradeId: classInfo.gradeId,
    streamId: "",
    subjectId: subject.id,
    subjectKey: subject.key,
    subjectTitleSnapshot: subject.title,
    displayName: subject.title,
    shortLabel: subject.key,
    status: "ACTIVE",
    isActive: true,
    isArchived: false,
    order: subject.order,
    offeringKind: "KG_SUBJECT",
    enabledModuleKeys: ["ASSESSMENTS", "NOTES", "GAMIFICATION"],
    gradingPolicy: { gradingScaleKey: "", note: "" },
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
      homeworkEnabled: false,
      resourcesEnabled: false,
      questionBankEnabled: false,
      lessonPrepReviewMode: "APPROVAL_REQUIRED",
      note: "",
    },
    curriculumPlanId: "",
    questionBankId: "",
    resourceFolderId: "",
    note: "Phase A KG canonical subject offering.",
    metadata: { normalizedBy: "reconcile-kindergarten-phase-a", normalizedAt: now },
    createdAt: now,
    updatedAt: now,
  };
}

function buildArchivePayload({ offering, now }) {
  return {
    status: "ARCHIVED",
    isActive: false,
    isArchived: true,
    endAt: now,
    archivedAt: now,
    note: "Archived by Phase A KG normalization: VALUES/CORNERS are not part of KG1.",
    metadata: {
      ...(offering.metadata && typeof offering.metadata === "object" ? offering.metadata : {}),
      normalizedBy: "reconcile-kindergarten-phase-a",
      normalizedAt: now,
      archivalReason: "KG1_FORBIDDEN_CANONICAL_SUBJECT",
    },
    updatedAt: now,
  };
}

function directOfferingReferences(documents, offeringId) {
  const scalarFields = ["classSubjectOfferingId", "offeringId", "subjectOfferingId", "scopeId"];
  const arrayFields = ["classSubjectOfferingIds", "offeringIds", "subjectOfferingIds"];
  return documents
    .filter((item) => {
      const scalarMatch = scalarFields.some((field) => asString(item[field]) === offeringId);
      const arrayMatch = arrayFields.some((field) => Array.isArray(item[field]) && item[field].map(asString).includes(offeringId));
      return scalarMatch || arrayMatch;
    })
    .map((item) => ({ id: item.id, path: item.path }));
}

function planWrite(operation, pathValue, payload, extra = {}) {
  return { operation, path: pathValue, payload, ...extra };
}

async function getCollection(db, collectionPath) {
  const snapshot = await db.collection(collectionPath).get();
  return snapshot.docs.map(docData);
}

async function main() {
  initAdmin();
  const db = admin.firestore();
  const now = Date.now();
  const sourceReport = getSourceReportSummary();
  const orgSnapshot = await db.doc(`orgs/${ORG_ID}`).get();
  if (!orgSnapshot.exists) throw new Error(`Organization not found: orgs/${ORG_ID}`);

  const [allOfferings, teacherAssignments, teacherAssignmentClassLinks, operationalAssignments] = await Promise.all([
    getCollection(db, `orgs/${ORG_ID}/classSubjectOfferings`),
    getCollection(db, `orgs/${ORG_ID}/teacherAssignments`),
    getCollection(db, `orgs/${ORG_ID}/teacherAssignmentClassLinks`),
    getCollection(db, `orgs/${ORG_ID}/operationalAssignments`),
  ]);

  const subjectsBySchool = new Map();
  const classesBySchool = new Map();
  for (const schoolId of KG_SCHOOL_IDS) {
    const [subjects, classes] = await Promise.all([
      getCollection(db, `orgs/${ORG_ID}/schools/${schoolId}/academicYears/${ACADEMIC_YEAR_ID}/subjects`),
      getCollection(db, `orgs/${ORG_ID}/schools/${schoolId}/academicYears/${ACADEMIC_YEAR_ID}/classes`),
    ]);
    subjectsBySchool.set(schoolId, subjects);
    classesBySchool.set(schoolId, classes);
  }

  const blockers = [];
  const catalogToCreate = [];
  const catalogToReuse = [];
  const catalogToNormalize = [];
  const offeringsToCreate = [];
  const offeringsToReuse = [];
  const offeringsToNormalize = [];
  const forbiddenKg1Offerings = [];
  const legacyOfferings = [];
  const writes = [];

  const targetClasses = [];
  for (const schoolId of KG_SCHOOL_IDS) {
    const foundClasses = classesBySchool.get(schoolId) || [];
    for (const expected of KG_CLASSES) {
      const matches = foundClasses.filter((item) => asString(item.id) === expected.classId && asString(item.gradeId) === expected.gradeId && !isArchived(item));
      if (matches.length !== 1) {
        blockers.push({ type: "CLASS_CONTEXT", schoolId, gradeId: expected.gradeId, classId: expected.classId, message: `Expected one active class, found ${matches.length}.` });
      } else {
        targetClasses.push({ schoolId, ...expected, path: matches[0].path });
      }
    }
  }

  const catalogBySchoolAndKey = new Map();
  for (const schoolId of KG_SCHOOL_IDS) {
    for (const catalog of subjectsBySchool.get(schoolId) || []) {
      const key = subjectKeyOf(catalog);
      if (!key) continue;
      const mapKey = `${schoolId}|${key}`;
      const list = catalogBySchoolAndKey.get(mapKey) || [];
      list.push(catalog);
      catalogBySchoolAndKey.set(mapKey, list);
    }
  }

  for (const schoolId of KG_SCHOOL_IDS) {
    for (const subject of SUBJECTS) {
      const pathValue = `orgs/${ORG_ID}/schools/${schoolId}/academicYears/${ACADEMIC_YEAR_ID}/subjects/${subject.id}`;
      const candidates = (catalogBySchoolAndKey.get(`${schoolId}|${subject.key}`) || []).filter((item) => !isArchived(item));
      if (candidates.length > 1) {
        blockers.push({ type: "DUPLICATE_CATALOG_KEY", schoolId, subjectKey: subject.key, paths: candidates.map((item) => item.path) });
        continue;
      }
      if (candidates.length === 1) {
        const existing = candidates[0];
        const compatible = asString(existing.id) === subject.id && asString(existing.title) === subject.title;
        if (compatible) {
          catalogToReuse.push({ schoolId, subjectKey: subject.key, path: existing.path, id: existing.id });
        } else if (asString(existing.id) === subject.id) {
          const payload = buildCatalogPayload({ schoolId, subject, now });
          catalogToNormalize.push({ schoolId, subjectKey: subject.key, path: existing.path, id: existing.id });
          writes.push(planWrite("set-merge", existing.path, payload, { category: "subjectCatalog", reason: "normalizeCanonicalCatalog" }));
        } else {
          blockers.push({ type: "CATALOG_ID_CONFLICT", schoolId, subjectKey: subject.key, existingId: existing.id, existingPath: existing.path, expectedId: subject.id });
        }
        continue;
      }

      const idCollision = (subjectsBySchool.get(schoolId) || []).find((item) => asString(item.id) === subject.id);
      if (idCollision) {
        blockers.push({ type: "CATALOG_DOCUMENT_ID_COLLISION", schoolId, subjectKey: subject.key, path: idCollision.path });
        continue;
      }
      const payload = buildCatalogPayload({ schoolId, subject, now });
      catalogToCreate.push({ schoolId, subjectKey: subject.key, path: pathValue, id: subject.id });
      writes.push(planWrite("create", pathValue, payload, { category: "subjectCatalog", reason: "missingCanonicalCatalog" }));
    }
  }

  const scopedOfferings = allOfferings.filter(scopedToTarget);
  const allOfferingIds = new Map(allOfferings.map((item) => [asString(item.id), item]));

  for (const offering of scopedOfferings) {
    const key = offeringSubjectKeyOf(offering);
    if (LEGACY_SUBJECT_KEYS.has(key)) {
      legacyOfferings.push({ id: offering.id, path: offering.path, schoolId: offering.schoolId, gradeId: offering.gradeId, classId: offering.classId, subjectKey: key, status: offering.status || "" });
    }
  }

  for (const targetClass of targetClasses.filter((item) => item.gradeId === "kg1")) {
    for (const subjectKey of FORBIDDEN_KG1_SUBJECT_KEYS) {
      const matches = scopedOfferings.filter((offering) =>
        asString(offering.schoolId) === targetClass.schoolId &&
        asString(offering.academicYearId) === ACADEMIC_YEAR_ID &&
        asString(offering.gradeId) === targetClass.gradeId &&
        asString(offering.classId) === targetClass.classId &&
        offeringSubjectKeyOf(offering) === subjectKey &&
        !isArchived(offering),
      );
      for (const offering of matches) {
        const references = {
          teacherAssignments: directOfferingReferences(teacherAssignments, offering.id),
          teacherAssignmentClassLinks: directOfferingReferences(teacherAssignmentClassLinks, offering.id),
          operationalAssignments: directOfferingReferences(operationalAssignments, offering.id),
        };
        const referenceCount = Object.values(references).reduce((count, items) => count + items.length, 0);
        const item = {
          id: offering.id,
          path: offering.path,
          schoolId: offering.schoolId,
          academicYearId: offering.academicYearId,
          gradeId: offering.gradeId,
          classId: offering.classId,
          subjectKey,
          references,
          referenceCount,
          action: referenceCount === 0 ? "archive" : "report-only",
        };
        forbiddenKg1Offerings.push(item);
        if (referenceCount === 0) {
          writes.push(planWrite("set-merge", offering.path, buildArchivePayload({ offering, now }), { category: "classSubjectOffering", reason: "archiveForbiddenKg1Subject" }));
        } else {
          blockers.push({ type: "FORBIDDEN_KG1_OFFERING_REFERENCED", ...item });
        }
      }
    }
  }

  for (const targetClass of targetClasses) {
    for (const subjectKey of expectedSubjectKeysForGrade(targetClass.gradeId)) {
      const subject = SUBJECTS_BY_KEY.get(subjectKey);
      const candidates = scopedOfferings.filter((offering) => sameOfferingContext(offering, { ...targetClass, subject }));
      if (candidates.length > 1) {
        blockers.push({ type: "DUPLICATE_CANONICAL_OFFERING", schoolId: targetClass.schoolId, gradeId: targetClass.gradeId, classId: targetClass.classId, subjectKey, paths: candidates.map((item) => item.path) });
        continue;
      }
      if (candidates.length === 1) {
        const existing = candidates[0];
        const payload = buildOfferingPayload({ schoolId: targetClass.schoolId, classInfo: targetClass, subject, now });
        const compatible =
          isActive(existing) &&
          asString(existing.subjectId) === subject.id &&
          asString(existing.subjectTitleSnapshot || existing.subjectTitle) === subject.title &&
          asString(existing.displayName) === subject.title &&
          asString(existing.status).toUpperCase() === "ACTIVE" &&
          existing.isArchived !== true;
        const reused = {
          schoolId: targetClass.schoolId,
          gradeId: targetClass.gradeId,
          classId: targetClass.classId,
          subjectKey,
          id: existing.id,
          path: existing.path,
          requiresNormalization: !compatible,
        };
        offeringsToReuse.push(reused);
        if (compatible) {
        } else {
          offeringsToNormalize.push(reused);
          writes.push(planWrite("set-merge", existing.path, { ...payload, id: existing.id, createdAt: existing.createdAt || now }, { category: "classSubjectOffering", reason: "normalizeReusableCanonicalOffering" }));
        }
        continue;
      }

      const offeringId = canonicalOfferingId(targetClass.schoolId, targetClass.classId, subject);
      const collision = allOfferingIds.get(offeringId);
      if (collision) {
        blockers.push({ type: "OFFERING_DOCUMENT_ID_COLLISION", schoolId: targetClass.schoolId, gradeId: targetClass.gradeId, classId: targetClass.classId, subjectKey, expectedId: offeringId, existingPath: collision.path });
        continue;
      }
      const offeringPath = `orgs/${ORG_ID}/classSubjectOfferings/${offeringId}`;
      offeringsToCreate.push({ schoolId: targetClass.schoolId, gradeId: targetClass.gradeId, classId: targetClass.classId, subjectKey, id: offeringId, path: offeringPath });
      writes.push(planWrite("create", offeringPath, buildOfferingPayload({ schoolId: targetClass.schoolId, classInfo: targetClass, subject, now }), { category: "classSubjectOffering", reason: "missingCanonicalOffering" }));
    }
  }

  const expectedCanonicalOfferingCount = KG_SCHOOL_IDS.length * (KG1_SUBJECT_KEYS.size + KG2_KG3_SUBJECT_KEYS.size * 2);
  const canonicalPlanCount = offeringsToReuse.length + offeringsToCreate.length;
  if (canonicalPlanCount !== expectedCanonicalOfferingCount) {
    blockers.push({ type: "CANONICAL_OFFERING_COUNT", expected: expectedCanonicalOfferingCount, planned: canonicalPlanCount });
  }

  const report = {
    metadata: {
      generatedAt: new Date().toISOString(),
      orgId: ORG_ID,
      academicYearId: ACADEMIC_YEAR_ID,
      mode: APPLY ? "APPLY" : "DRY_RUN",
      applyRequested: APPLY_REQUESTED,
      applyConfirmed: APPLY_CONFIRMED,
      applyConfirmationRequired: APPLY_CONFIRMATION,
      firestoreWritesPerformed: false,
      allowedFirestoreWriteCollections: ["schools/*/academicYears/*/subjects", "classSubjectOfferings"],
      protectedCollectionsNotWritten: ["teacherAssignments", "teacherAssignmentClassLinks", "operationalAssignments", "memberships", "users", "people"],
    },
    sourceReport,
    target: { schools: KG_SCHOOL_IDS, classes: KG_CLASSES, canonicalSubjects: SUBJECTS },
    catalogEntriesToCreate: catalogToCreate,
    catalogEntriesReused: catalogToReuse,
    catalogEntriesToNormalize: catalogToNormalize,
    offeringsReused: offeringsToReuse,
    offeringsToNormalize,
    offeringsToCreate,
    forbiddenKg1Offerings,
    legacyClassOrNumbersOfferings: legacyOfferings,
    expectedCanonicalOfferingCount,
    plannedCanonicalOfferingCount: canonicalPlanCount,
    summary: {
      catalogCreates: catalogToCreate.length,
      catalogReused: catalogToReuse.length,
      catalogNormalized: catalogToNormalize.length,
      offeringsReused: offeringsToReuse.length,
      offeringsNormalized: offeringsToNormalize.length,
      offeringsCreated: offeringsToCreate.length,
      forbiddenKg1OfferingsFound: forbiddenKg1Offerings.length,
      forbiddenKg1OfferingsSafeToArchive: forbiddenKg1Offerings.filter((item) => item.action === "archive").length,
      forbiddenKg1OfferingsProtectedByReferences: forbiddenKg1Offerings.filter((item) => item.action === "report-only").length,
      legacyClassOrNumbersOfferingsFound: legacyOfferings.length,
      firestoreWritesPlanned: writes.length,
    },
    exactFirestoreWritesPlanned: writes,
    blockers,
  };

  if (APPLY && blockers.length === 0) {
    let batch = db.batch();
    let batchSize = 0;
    for (const write of writes) {
      const ref = db.doc(write.path);
      batch.set(ref, write.payload, { merge: true });
      batchSize += 1;
      if (batchSize === 400) {
        await batch.commit();
        batch = db.batch();
        batchSize = 0;
      }
    }
    if (batchSize > 0) await batch.commit();
    report.metadata.firestoreWritesPerformed = true;
  }

  fs.mkdirSync(path.dirname(OUTPUT_REPORT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_REPORT_PATH, JSON.stringify(report, null, 2), "utf8");

  console.log(`KG Phase A reconciliation: ${report.metadata.mode}`);
  console.log(`Firestore writes performed: ${report.metadata.firestoreWritesPerformed ? writes.length : 0}`);
  console.log(`Report: ${OUTPUT_REPORT_PATH}`);
  console.log("Summary:");
  console.table([report.summary]);
  console.log("Blockers:");
  console.dir(blockers, { depth: null });

  if (APPLY_REQUESTED && !APPLY_CONFIRMED) {
    process.exitCode = 1;
    console.error(`APPLY was not performed. Re-run with --apply --confirm=${APPLY_CONFIRMATION} only after reviewing the DRY_RUN report.`);
  }
  if (APPLY && blockers.length > 0) {
    process.exitCode = 1;
    console.error("APPLY was not performed because blockers were found.");
  }
}

main().catch((error) => {
  console.error("KG Phase A reconciliation failed:");
  console.error(error.stack || error);
  process.exitCode = 1;
});
