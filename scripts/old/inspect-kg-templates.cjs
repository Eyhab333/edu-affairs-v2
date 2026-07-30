const admin = require("firebase-admin");
const path = require("path");
const fs = require("fs");

const serviceAccount = require(path.join(__dirname, "./service-account.json"));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

const orgId = process.env.ORG_ID || "takween";

const KG_KEYWORDS_AR = [
  "روضة",
  "رياض",
  "قرآن",
  "القرآن",
  "بساتين",
  "المعرفة",
  "أرقام",
  "ارقام",
  "القيم",
  "قيم",
  "أسماء الله",
  "اسماء الله",
  "الأركان",
  "اركان",
  "أنشطة",
  "انشطة",
];

const KG_KIND_PARTS = [
  "KG",
  "QURAN",
  "LEARNING_GARDENS",
  "NUMBERS",
  "VALUES",
  "CORNERS",
];

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

function hasArabicKeyword(value) {
  const text = String(value || "");

  return KG_KEYWORDS_AR.some((keyword) => text.includes(keyword));
}

function isKgLikeTemplate(item) {
  const id = normalize(item.id);
  const code = normalize(item.code);
  const kind = normalize(item.kind);
  const schoolType = normalize(item.schoolType);
  const gradeId = normalize(item.gradeId);
  const subjectKey = normalize(item.subjectKey);
  const title = String(item.title || "");

  if (schoolType === "KG") return true;
  if (gradeId.startsWith("KG")) return true;
  if (id.startsWith("KG") || id.includes("-KG")) return true;
  if (code.startsWith("KG") || code.includes("-KG")) return true;

  if (KG_KIND_PARTS.some((part) => kind.includes(part))) return true;
  if (KG_KIND_PARTS.some((part) => subjectKey.includes(part))) return true;

  if (hasArabicKeyword(title)) return true;

  return false;
}

function isQuranLike(item) {
  const id = normalize(item.id);
  const code = normalize(item.code);
  const kind = normalize(item.kind);
  const subjectKey = normalize(item.subjectKey);
  const title = String(item.title || "");

  return (
    id.includes("QURAN") ||
    code.includes("QURAN") ||
    kind.includes("QURAN") ||
    subjectKey.includes("QURAN") ||
    title.includes("قرآن") ||
    title.includes("القرآن")
  );
}

function getTemplateItemsSummary(item) {
  const items = Array.isArray(item.templateItems) ? item.templateItems : [];

  return items.map((templateItem, index) => {
    return {
      index,
      itemKey:
        templateItem.itemKey ||
        templateItem.key ||
        templateItem.id ||
        `item-${index + 1}`,
      title:
        templateItem.itemTitle ||
        templateItem.title ||
        templateItem.label ||
        "",
      maxScore: templateItem.maxScore,
      affectsTotal: templateItem.affectsTotal,
      order: templateItem.order,
    };
  });
}

function pickTemplateFields(item) {
  const items = getTemplateItemsSummary(item);

  return {
    id: item.id,
    path: item.path,
    collectionName: item.collectionName,

    title: item.title || "",
    code: item.code || "",
    schoolType: item.schoolType || "",
    schoolId: item.schoolId || "",
    academicYearId: item.academicYearId || "",
    gradeId: item.gradeId || "",

    kind: item.kind || "",
    subjectKey: item.subjectKey || "",
    subjectId: item.subjectId || "",

    assessmentSlot: item.assessmentSlot || "",
    evaluatorRoleKey: item.evaluatorRoleKey || "",

    maxScore: item.maxScore,
    passingScore: item.passingScore,

    requiresLearningLossFollowUp: item.requiresLearningLossFollowUp,
    learningLossThresholdScore: item.learningLossThresholdScore,
    learningLossThresholdPercentage: item.learningLossThresholdPercentage,

    isActive: item.isActive,
    status: item.status,

    templateItemsCount: items.length,
    templateItemsTotalMaxScore: items.reduce((sum, templateItem) => {
      if (templateItem.affectsTotal === false) return sum;

      return (
        sum +
        (typeof templateItem.maxScore === "number"
          ? templateItem.maxScore
          : 0)
      );
    }, 0),
    templateItems: items,

    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}

async function getCollection(collectionName) {
  const snap = await db
    .collection("orgs")
    .doc(orgId)
    .collection(collectionName)
    .get();

  return snap.docs.map((docSnap) => compactDoc(docSnap, collectionName));
}

async function main() {
  console.log("Inspecting KG templates...");
  console.log({ orgId });

  const [assessmentTemplates, trackerTemplates] = await Promise.all([
    getCollection("studentAssessmentTemplates"),
    getCollection("studentTrackerTemplates"),
  ]);

  const allTemplates = [...assessmentTemplates, ...trackerTemplates];

  const kgCandidates = allTemplates
    .filter(isKgLikeTemplate)
    .map(pickTemplateFields)
    .sort((a, b) => {
      const collectionCompare = a.collectionName.localeCompare(
        b.collectionName,
      );

      if (collectionCompare !== 0) return collectionCompare;

      return String(a.id).localeCompare(String(b.id));
    });

  const quranCandidates = allTemplates
    .filter(isQuranLike)
    .map(pickTemplateFields)
    .sort((a, b) => {
      const collectionCompare = a.collectionName.localeCompare(
        b.collectionName,
      );

      if (collectionCompare !== 0) return collectionCompare;

      return String(a.id).localeCompare(String(b.id));
    });

  const report = {
    context: {
      orgId,
    },

    counts: {
      assessmentTemplates: assessmentTemplates.length,
      trackerTemplates: trackerTemplates.length,
      allTemplates: allTemplates.length,
      kgCandidates: kgCandidates.length,
      quranCandidates: quranCandidates.length,
    },

    kgCandidates,
    quranCandidates,
  };

  console.log("\n=== COUNTS ===");
  console.dir(report.counts, { depth: null });

  console.log("\n=== KG CANDIDATES SUMMARY ===");
  console.table(
    kgCandidates.map((item) => ({
      collection: item.collectionName,
      id: item.id,
      title: item.title,
      kind: item.kind,
      subjectKey: item.subjectKey || "—",
      gradeId: item.gradeId || "—",
      maxScore: item.maxScore ?? "—",
      items: item.templateItemsCount,
      opensLoss: item.requiresLearningLossFollowUp === true ? "YES" : "NO",
      threshold: item.learningLossThresholdPercentage ?? "—",
    })),
  );

  console.log("\n=== QURAN CANDIDATES SUMMARY ===");
  console.table(
    quranCandidates.map((item) => ({
      collection: item.collectionName,
      id: item.id,
      title: item.title,
      kind: item.kind,
      subjectKey: item.subjectKey || "—",
      gradeId: item.gradeId || "—",
      maxScore: item.maxScore ?? "—",
      items: item.templateItemsCount,
      opensLoss: item.requiresLearningLossFollowUp === true ? "YES" : "NO",
      threshold: item.learningLossThresholdPercentage ?? "—",
    })),
  );

  const outputPath = path.join(
    __dirname,
    "inspect-kg-templates-report.json",
  );

  fs.writeFileSync(outputPath, JSON.stringify(report, null, 2), "utf8");

  console.log("\nReport written to:");
  console.log(outputPath);
}

main().catch((error) => {
  console.error("Failed to inspect KG templates.");
  console.error(error);
  process.exit(1);
});