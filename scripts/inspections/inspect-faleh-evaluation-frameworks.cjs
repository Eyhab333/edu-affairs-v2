const admin = require("firebase-admin");
const path = require("path");

const serviceAccount = require(path.resolve("service-account.json"));

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    projectId: serviceAccount.project_id,
  });
}

const db = admin.firestore();

function getArg(name) {
  const prefix = `--${name}=`;
  const arg = process.argv.find((x) => x.startsWith(prefix));
  return arg ? arg.slice(prefix.length).trim() : "";
}

const ORG_ID = getArg("org") || "takween";
const SCHOOL_ID = getArg("school") || "mrb-boys-faleh";

async function main() {
  console.log("Inspect mode only - no writes");

  const orgRef = db.collection("orgs").doc(ORG_ID);

  const plansSnap = await orgRef.collection("evaluationPlans").get();

  const plans = plansSnap.docs
    .map((doc) => ({ id: doc.id, ...doc.data() }))
    .filter((plan) => plan.schoolId === SCHOOL_ID);

  const frameworkIds = [...new Set(plans.map((p) => p.frameworkId).filter(Boolean))];

  const frameworks = [];
  for (const frameworkId of frameworkIds) {
    const frameworkDoc = await orgRef.collection("evaluationFrameworks").doc(frameworkId).get();

    const sectionsSnap = await orgRef
      .collection("evaluationRubricSections")
      .where("frameworkId", "==", frameworkId)
      .get();

    const itemsSnap = await orgRef
      .collection("evaluationRubricItems")
      .where("frameworkId", "==", frameworkId)
      .get();

    const sections = sectionsSnap.docs
      .map((doc) => ({ id: doc.id, ...doc.data() }))
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

    const items = itemsSnap.docs
      .map((doc) => ({ id: doc.id, ...doc.data() }))
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

    frameworks.push({
      frameworkId,
      exists: frameworkDoc.exists,
      framework: frameworkDoc.exists
        ? {
            id: frameworkDoc.id,
            title: frameworkDoc.data().title,
            shortTitle: frameworkDoc.data().shortTitle,
            targetKind: frameworkDoc.data().targetKind,
            evaluatorRoleKey: frameworkDoc.data().evaluatorRoleKey,
            status: frameworkDoc.data().status,
            version: frameworkDoc.data().version,
          }
        : null,
      usedByPlans: plans
        .filter((p) => p.frameworkId === frameworkId)
        .map((p) => ({
          planId: p.id,
          title: p.title,
          shortTitle: p.shortTitle,
          planKind: p.planKind,
          targetKind: p.targetKind,
          status: p.status,
          academicYearId: p.academicYearId,
          termId: p.termId,
        })),
      sections: sections.map((s) => ({
        sectionId: s.id,
        title: s.title,
        order: s.order,
        weight: s.weight,
      })),
      items: items.map((item) => ({
        itemId: item.id,
        title: item.title,
        sectionId: item.sectionId,
        order: item.order,
        weight: item.weight,
        maxScore: item.maxScore,
        status: item.status,
      })),
    });
  }

  console.dir(
    {
      scope: {
        orgId: ORG_ID,
        schoolId: SCHOOL_ID,
      },
      plansCount: plans.length,
      frameworkIdsCount: frameworkIds.length,
      plans: plans.map((p) => ({
        planId: p.id,
        title: p.title,
        shortTitle: p.shortTitle,
        frameworkId: p.frameworkId,
        planKind: p.planKind,
        targetKind: p.targetKind,
        status: p.status,
        academicYearId: p.academicYearId,
        termId: p.termId,
      })),
      frameworks,
      writesPerformed: false,
    },
    { depth: 20 }
  );

  console.log("Done. Read-only inspection complete. No writes performed.");
}

main().catch((err) => {
  console.error("Inspection failed:", err.message || err);
  process.exit(1);
});