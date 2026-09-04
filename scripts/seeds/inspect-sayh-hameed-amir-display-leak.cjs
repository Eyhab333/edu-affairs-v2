const admin = require("firebase-admin");
const fs = require("fs");
const path = require("path");

const serviceAccount = require(path.resolve("service-account.json"));

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    projectId: serviceAccount.project_id,
  });
}

const db = admin.firestore();

const ORG_ID = "takween";
const SCHOOL_ID = "mrb-boys-sayh";

const PEOPLE = [
  { label: "HAMEED", email: "hameed-s@qz.org.sa" },
  { label: "AMIR", email: "a.aljidawii@qz.org.sa" },
];

function pickDisplayFields(row) {
  const out = {};

  for (const [key, value] of Object.entries(row)) {
    const k = key.toLowerCase();
    if (
      k.includes("name") ||
      k.includes("email") ||
      k.includes("display") ||
      k.includes("target") ||
      k.includes("teacher") ||
      k.includes("person")
    ) {
      out[key] = value;
    }
  }

  return out;
}

async function resolveByEmail(email) {
  const snap = await db.collection("users").where("email", "==", email).limit(5).get();
  const users = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));

  if (users.length !== 1) {
    throw new Error(`Expected one user for ${email}, found ${users.length}`);
  }

  return {
    uid: users[0].uid || users[0].id,
    email: users[0].email,
    personId: users[0].personId,
    displayName: users[0].displayName || "",
  };
}

async function main() {
  const orgRef = db.collection("orgs").doc(ORG_ID);

  const resolved = {};
  for (const p of PEOPLE) {
    resolved[p.label] = await resolveByEmail(p.email);
  }

  const report = {
    scope: {
      orgId: ORG_ID,
      schoolId: SCHOOL_ID,
    },
    people: resolved,
    results: {},
    suspicion: [],
    writesPerformed: false,
    generatedAt: new Date().toISOString(),
  };

  for (const [label, person] of Object.entries(resolved)) {
    const targetSnap = await orgRef
      .collection("evaluationTargetAssignments")
      .where("targetPersonId", "==", person.personId)
      .get();

    const evaluatorSnap = await orgRef
      .collection("evaluationEvaluatorAssignments")
      .where("targetPersonId", "==", person.personId)
      .get();

    const targetRows = targetSnap.docs
      .map((doc) => ({ id: doc.id, ...doc.data() }))
      .filter((row) => row.schoolId === SCHOOL_ID);

    const evaluatorRows = evaluatorSnap.docs
      .map((doc) => ({ id: doc.id, ...doc.data() }))
      .filter((row) => row.schoolId === SCHOOL_ID);

    report.results[label] = {
      person,
      targetAssignments: {
        total: targetRows.length,
        active: targetRows.filter((x) => x.status === "ACTIVE").length,
        removed: targetRows.filter((x) => x.status === "REMOVED").length,
        rows: targetRows.map((row) => ({
          id: row.id,
          status: row.status,
          planId: row.planId,
          displayFields: pickDisplayFields(row),
        })),
      },
      evaluatorAssignments: {
        total: evaluatorRows.length,
        active: evaluatorRows.filter((x) => x.status === "ACTIVE").length,
        removed: evaluatorRows.filter((x) => x.status === "REMOVED").length,
        rows: evaluatorRows.slice(0, 30).map((row) => ({
          id: row.id,
          status: row.status,
          planId: row.planId,
          cycleId: row.cycleId,
          evaluatorPersonId: row.evaluatorPersonId,
          evaluatorRoleKey: row.evaluatorRoleKey,
          displayFields: pickDisplayFields(row),
        })),
      },
    };
  }

  const amir = resolved.AMIR;
  const hameedRows = [
    ...report.results.HAMEED.targetAssignments.rows,
    ...report.results.HAMEED.evaluatorAssignments.rows,
  ];

  for (const row of hameedRows) {
    const text = JSON.stringify(row);
    if (
      text.includes(amir.personId) ||
      text.includes(amir.email) ||
      text.includes("أمير") ||
      text.includes("الجداوي") ||
      text.includes("aljidawii")
    ) {
      report.suspicion.push({
        reason: "HAMEED_ASSIGNMENT_CONTAINS_AMIR_DISPLAY_DATA",
        row,
      });
    }
  }

  const reportsDir = path.resolve("reports");
  fs.mkdirSync(reportsDir, { recursive: true });

  const filePath = path.join(
    reportsDir,
    "sayh_hameed_amir_display_leak_report.json"
  );

  fs.writeFileSync(filePath, JSON.stringify(report, null, 2), "utf8");

  console.dir(
    {
      people: report.people,
      counts: {
        hameedTargetActive: report.results.HAMEED.targetAssignments.active,
        hameedEvaluatorActive: report.results.HAMEED.evaluatorAssignments.active,
        amirTargetActive: report.results.AMIR.targetAssignments.active,
        amirEvaluatorActive: report.results.AMIR.evaluatorAssignments.active,
        suspicionCount: report.suspicion.length,
      },
      reportFile: filePath,
      writesPerformed: false,
    },
    { depth: 10 }
  );
}

main().catch((err) => {
  console.error("Inspection failed:", err);
  process.exit(1);
});