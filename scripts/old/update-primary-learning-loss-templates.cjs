const admin = require("firebase-admin");

const serviceAccount = require("./service-account.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

const CONFIG = {
  orgId: "takween",

  /**
   * true = يعرض ما سيتم تعديله بدون كتابة في Firestore
   * false = ينفذ التحديث فعليًا
   */
  dryRun: false,

  maxScore: 20,
  learningLossThresholdScore: 11,
};

const TARGET_PRIMARY_KINDS = new Set([
  "PRIMARY_PERIODIC_TEST_1",
  "PRIMARY_PERIODIC_TEST_2",
  "PRIMARY_CENTRAL_MEASUREMENT_1",
  "PRIMARY_CENTRAL_MEASUREMENT_2",
]);

async function main() {
  const { orgId, dryRun, maxScore, learningLossThresholdScore } = CONFIG;

  console.log("بدء تحديث قوالب فاقد الابتدائي...");
  console.log("CONFIG:", CONFIG);

  const templatesRef = db
    .collection("orgs")
    .doc(orgId)
    .collection("studentAssessmentTemplates");

  const snap = await templatesRef.where("schoolType", "==", "PRIMARY").get();

  if (snap.empty) {
    console.log("لا توجد قوالب ابتدائي.");
    return;
  }

  const targetDocs = snap.docs.filter((docSnap) => {
    const data = docSnap.data();
    return TARGET_PRIMARY_KINDS.has(data.kind);
  });

  if (targetDocs.length === 0) {
    console.log("لم يتم العثور على قوالب فتري/مركزي مستهدفة.");
    return;
  }

  const batch = db.batch();
  const now = Date.now();

  for (const docSnap of targetDocs) {
    const data = docSnap.data();

    const updateData = {
      maxScore,
      requiresLearningLossFollowUp: true,
      learningLossThresholdScore,
      learningLossThresholdPercentage: admin.firestore.FieldValue.delete(),
      updatedAt: now,
    };

    console.log("----------------------------------------");
    console.log("القالب:", docSnap.id);
    console.log("العنوان:", data.title);
    console.log("النوع:", data.kind);
    console.log("سيتم التحديث إلى:", updateData);

    if (!dryRun) {
      batch.update(docSnap.ref, updateData);
    }
  }

  if (dryRun) {
    console.log("----------------------------------------");
    console.log("DRY RUN فقط — لم يتم تعديل Firestore.");
    console.log(`عدد القوالب التي كانت ستُحدّث: ${targetDocs.length}`);
    return;
  }

  await batch.commit();

  console.log("----------------------------------------");
  console.log("تم تحديث قوالب فاقد الابتدائي بنجاح.");
  console.log(`عدد القوالب المحدّثة: ${targetDocs.length}`);
}

main().catch((error) => {
  console.error("حدث خطأ:", error);
  process.exit(1);
});