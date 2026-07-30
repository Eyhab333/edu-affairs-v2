const admin = require("firebase-admin");
const path = require("path");
const fs = require("fs");

const serviceAccount = require(path.join(__dirname, "./service-account.json"));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

const orgId = process.env.ORG_ID || "takween";
const dryRun = process.argv.includes("--dry-run");

const startedAt = Date.now();

function normalize(value) {
  return String(value || "").trim().toUpperCase();
}

function compactDoc(docSnap, collectionName) {
  const data = docSnap.data() || {};

  return {
    id: data.id || docSnap.id,
    path: docSnap.ref.path,
    collectionName,
    ...data,
  };
}

function isPrimaryGradeId(value) {
  const gradeId = normalize(value);
  return /^G[1-6]$/.test(gradeId);
}

function isPrimaryClassId(value) {
  const classId = normalize(value);
  return /^G[1-6]-/.test(classId);
}

function isPrimarySchoolType(value) {
  return normalize(value) === "PRIMARY";
}

function isPrimaryOffering(item) {
  if (isPrimarySchoolType(item.schoolType)) return true;
  if (isPrimaryGradeId(item.gradeId)) return true;
  if (isPrimaryClassId(item.classId)) return true;

  const id = normalize(item.id);
  if (/^G[1-6]-/.test(id)) return true;

  return false;
}

function isPrimaryTemplate(item) {
  if (isPrimarySchoolType(item.schoolType)) return true;
  if (isPrimaryGradeId(item.gradeId)) return true;

  const id = normalize(item.id);
  const kind = normalize(item.kind);
  const code = normalize(item.code);
  const subjectKey = normalize(item.subjectKey);
  const title = String(item.title || "");

  if (id.startsWith("PRIMARY-")) return true;
  if (kind.startsWith("PRIMARY_")) return true;
  if (code.startsWith("PR-") || code.startsWith("PRIMARY_")) return true;
  if (subjectKey.startsWith("PRIMARY")) return true;
  if (title.includes("ابتدائي")) return true;

  return false;
}

async function getCollection(collectionName) {
  const snap = await db
    .collection("orgs")
    .doc(orgId)
    .collection(collectionName)
    .get();

  return snap.docs.map((docSnap) => compactDoc(docSnap, collectionName));
}

async function deleteDocs(targets, result) {
  for (const item of targets) {
    const ref = db
      .collection("orgs")
      .doc(orgId)
      .collection(item.collectionName)
      .doc(item.id);

    const snap = await ref.get();

    if (!snap.exists) {
      result.skippedMissing.push({
        collectionName: item.collectionName,
        id: item.id,
      });

      console.log(`SKIP missing ${item.collectionName}/${item.id}`);
      continue;
    }

    if (!dryRun) {
      await ref.delete();
    }

    result.deleted.push({
      collectionName: item.collectionName,
      id: item.id,
      title: item.title || item.subjectTitle || item.displayName || "",
      subjectKey: item.subjectKey || "",
      gradeId: item.gradeId || "",
      classId: item.classId || "",
      kind: item.kind || "",
    });

    console.log(
      `${dryRun ? "DRY RUN delete" : "DELETED"} ${item.collectionName}/${item.id}`,
    );
  }
}

async function main() {
  console.log("Deleting PRIMARY offerings and templates...");
  console.log({
    orgId,
    dryRun,
  });

  const [
    classSubjectOfferings,
    studentAssessmentTemplates,
    studentTrackerTemplates,
  ] = await Promise.all([
    getCollection("classSubjectOfferings"),
    getCollection("studentAssessmentTemplates"),
    getCollection("studentTrackerTemplates"),
  ]);

  const primaryOfferings = classSubjectOfferings.filter(isPrimaryOffering);
  const primaryAssessmentTemplates =
    studentAssessmentTemplates.filter(isPrimaryTemplate);
  const primaryTrackerTemplates =
    studentTrackerTemplates.filter(isPrimaryTemplate);

  const targets = [
    ...primaryOfferings,
    ...primaryAssessmentTemplates,
    ...primaryTrackerTemplates,
  ];

  const result = {
    orgId,
    dryRun,

    scanned: {
      classSubjectOfferings: classSubjectOfferings.length,
      studentAssessmentTemplates: studentAssessmentTemplates.length,
      studentTrackerTemplates: studentTrackerTemplates.length,
    },

    targets: {
      classSubjectOfferings: primaryOfferings.length,
      studentAssessmentTemplates: primaryAssessmentTemplates.length,
      studentTrackerTemplates: primaryTrackerTemplates.length,
      total: targets.length,
    },

    deleted: [],
    skippedMissing: [],
  };

  console.log("\n=== TARGETS SUMMARY ===");
  console.log(result.targets);

  console.log("\n=== OFFERINGS TO DELETE ===");
  console.table(
    primaryOfferings.map((item) => ({
      id: item.id,
      schoolId: item.schoolId || "",
      academicYearId: item.academicYearId || "",
      gradeId: item.gradeId || "",
      classId: item.classId || "",
      subjectKey: item.subjectKey || "",
      title: item.subjectTitle || item.displayName || "",
    })),
  );

  console.log("\n=== ASSESSMENT TEMPLATES TO DELETE ===");
  console.table(
    primaryAssessmentTemplates.map((item) => ({
      id: item.id,
      title: item.title || "",
      schoolType: item.schoolType || "",
      gradeId: item.gradeId || "",
      subjectKey: item.subjectKey || "",
      kind: item.kind || "",
      maxScore: item.maxScore ?? "",
    })),
  );

  console.log("\n=== TRACKER TEMPLATES TO DELETE ===");
  console.table(
    primaryTrackerTemplates.map((item) => ({
      id: item.id,
      title: item.title || "",
      schoolType: item.schoolType || "",
      gradeId: item.gradeId || "",
      subjectKey: item.subjectKey || "",
      kind: item.kind || "",
      maxScore: item.maxScore ?? "",
    })),
  );

  await deleteDocs(targets, result);

  const finishedAt = Date.now();

  const outputPath = path.join(
    __dirname,
    "delete-primary-offerings-and-templates-result.json",
  );

  fs.writeFileSync(outputPath, JSON.stringify(result, null, 2), "utf8");

  console.log("\nDone.");
  console.log({
    orgId,
    dryRun,
    deleted: result.deleted.length,
    skippedMissing: result.skippedMissing.length,
    durationMs: finishedAt - startedAt,
  });

  console.log("\nResult written to:");
  console.log(outputPath);
}

main().catch((error) => {
  console.error("Failed to delete PRIMARY offerings and templates.");
  console.error(error);
  process.exit(1);
});