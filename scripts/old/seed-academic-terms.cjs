const admin = require("firebase-admin");
const path = require("path");

const serviceAccount = require(path.join(__dirname, "./service-account.json"));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

const orgId = process.env.ORG_ID || "takween";
const academicYearId = process.env.ACADEMIC_YEAR_ID || "ay-1448";
const currentTermId = process.env.CURRENT_TERM_ID || "term-1";
const dryRun = process.argv.includes("--dry-run");

const now = Date.now();

const TERMS = [
  {
    id: "term-1",
    title: "الفصل الدراسي الأول",
    shortTitle: "ف1",
    order: 1,
  },
  {
    id: "term-2",
    title: "الفصل الدراسي الثاني",
    shortTitle: "ف2",
    order: 2,
  },
];

function buildTermPayload(term) {
  const isCurrent = term.id === currentTermId;

  return {
    id: term.id,
    orgId,
    academicYearId,

    title: term.title,
    shortTitle: term.shortTitle,
    order: term.order,

    status: isCurrent ? "ACTIVE" : "PLANNED",
    isCurrent,

    source: "seed-academic-terms",
    createdAt: now,
    updatedAt: now,
  };
}

async function main() {
  const result = {
    orgId,
    academicYearId,
    currentTermId,
    dryRun,
    created: 0,
    updated: 0,
  };

  console.log("Seeding academic terms...");
  console.log({
    orgId,
    academicYearId,
    currentTermId,
    dryRun,
    path: `orgs/${orgId}/academicYears/${academicYearId}/terms/{termId}`,
  });

  for (const term of TERMS) {
    const payload = buildTermPayload(term);

    const ref = db
      .collection("orgs")
      .doc(orgId)
      .collection("academicYears")
      .doc(academicYearId)
      .collection("terms")
      .doc(payload.id);

    const snap = await ref.get();

    if (!dryRun) {
      await ref.set(
        {
          ...payload,
          createdAt: snap.exists ? snap.data()?.createdAt ?? now : now,
          updatedAt: now,
        },
        { merge: false },
      );
    }

    if (snap.exists) {
      result.updated += 1;
      console.log(`${dryRun ? "DRY RUN update" : "UPDATED"} ${payload.id}`);
    } else {
      result.created += 1;
      console.log(`${dryRun ? "DRY RUN create" : "CREATED"} ${payload.id}`);
    }

    console.log({
      id: payload.id,
      title: payload.title,
      shortTitle: payload.shortTitle,
      academicYearId: payload.academicYearId,
      status: payload.status,
      isCurrent: payload.isCurrent,
      firestorePath: `orgs/${orgId}/academicYears/${academicYearId}/terms/${payload.id}`,
    });
  }

  console.log("Done.");
  console.log(result);
}

main().catch((error) => {
  console.error("Failed to seed academic terms.");
  console.error(error);
  process.exit(1);
});