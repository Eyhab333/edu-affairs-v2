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

function getArg(name, fallback = "") {
  const index = process.argv.indexOf(`--${name}`);
  if (index === -1) return fallback;
  return process.argv[index + 1] || fallback;
}

const ORG_ID = getArg("org", "takween");
const SCHOOL_ID = getArg("school", "mrb-girls");
const YEAR_ID = getArg("year", "ay-1448");
const TERM_ID = getArg("term", "term-1");

async function main() {
  const orgRef = db.collection("orgs").doc(ORG_ID);

  const snap = await orgRef
    .collection("evaluationPlans")
    .where("schoolId", "==", SCHOOL_ID)
    .where("academicYearId", "==", YEAR_ID)
    .where("termId", "==", TERM_ID)
    .get();

  const rows = snap.docs
    .map((doc) => {
      const data = doc.data();

      return {
        id: doc.id,
        title: data.title || "",
        frameworkId: data.frameworkId || "",
        targetKind: data.targetKind || "",
        evaluatorRoleKey: data.evaluatorRoleKey || "",
        evaluatorRoleLabel: data.evaluatorRoleLabel || "",
        status: data.status || "",
        cycleCount: data.cycleCount ?? "",
      };
    })
    .sort((a, b) => a.id.localeCompare(b.id));

  console.table(rows);

  console.log({
    orgId: ORG_ID,
    schoolId: SCHOOL_ID,
    count: rows.length,
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});