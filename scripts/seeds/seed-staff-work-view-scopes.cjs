/* eslint-disable no-console */

const admin = require("firebase-admin");
const path = require("path");

const APPLY = process.argv.includes("--apply");

const ORG_ID = "takween";
const CAPABILITY = "STAFF_WORK_VIEW";

const TARGETS = [
  {
    label: "رئيس الإشراف",
    personId: "p-h-alnasser",
    schoolIds: [
      "mrb-boys-sayh",
      "mrb-boys-faleh",
    ],
  },
  {
    label: "منصور الرميح",
    email: "malrameh@qz.org.sa",
    personId: "p-malrameh",
    schoolIds: [
      "kg-01",
      "kg-02",
      "kg-03",
      "kg-04",
    ],
  },
  {
    label: "فاطمة الحماد",
    email: "f-alhamaad@qz.org.sa",
    personId: "p-f-alhamaad",
    schoolIds: [
      "kg-01",
      "kg-02",
      "kg-03",
      "kg-04",
    ],
  },
];

function initAdmin() {
  if (admin.apps.length) return;

  const serviceAccountPath = path.resolve(
    __dirname,
    "../service-account.json",
  );

  const serviceAccount = require(serviceAccountPath);

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    projectId: serviceAccount.project_id,
  });
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function buildScopeId(personId, schoolId) {
  return `${personId}__${CAPABILITY}__${schoolId}`;
}

async function main() {
  initAdmin();

  const db = admin.firestore();
  const orgRoot = `orgs/${ORG_ID}`;

  console.log(
    APPLY
      ? "Staff work scopes - APPLY mode"
      : "Staff work scopes - PREVIEW mode (read-only)",
  );

  console.log("");

  const writes = [];

  for (const target of TARGETS) {
    const personRef = db.doc(
      `${orgRoot}/people/${target.personId}`,
    );

    const personSnap = await personRef.get();

    assert(
      personSnap.exists,
      `Person not found: ${target.personId}`,
    );

    const personData = personSnap.data() || {};

    console.log("========================================");
    console.log(target.label);
    console.log("----------------------------------------");
    console.log("Person ID:", target.personId);
    console.log(
      "Person:",
      personData.displayName || target.personId,
    );

    if (target.email) {
      console.log("Email:", target.email);
    }

    console.log("");

    for (const schoolId of target.schoolIds) {
      const schoolRef = db.doc(
        `${orgRoot}/schools/${schoolId}`,
      );

      const schoolSnap = await schoolRef.get();

      assert(
        schoolSnap.exists,
        `School not found: ${schoolId}`,
      );

      const schoolData = schoolSnap.data() || {};
      const scopeId = buildScopeId(
        target.personId,
        schoolId,
      );

      const scopeRef = db.doc(
        `${orgRoot}/personSupervisionScopes/${scopeId}`,
      );

      const scopeSnap = await scopeRef.get();
      const existingScope = scopeSnap.exists
        ? scopeSnap.data()
        : null;

      const now = Date.now();

      const desiredScope = {
        id: scopeId,
        orgId: ORG_ID,
        personId: target.personId,
        capability: CAPABILITY,
        schoolId,
        subjectScope: "ALL_SUBJECTS",
        subjectKeys: [],
        isActive: true,
        createdAt:
          typeof existingScope?.createdAt === "number"
            ? existingScope.createdAt
            : now,
        updatedAt: now,
      };

      console.log("School ID:", schoolId);
      console.log(
        "School:",
        schoolData.name || schoolId,
      );
      console.log("Scope ID:", scopeId);
      console.log(
        "Existing:",
        scopeSnap.exists ? "YES" : "NO",
      );

      if (existingScope) {
        console.log("Current scope:");
        console.dir(existingScope, {
          depth: null,
        });
      }

      console.log("Desired scope:");
      console.dir(desiredScope, {
        depth: null,
      });

      console.log("");

      writes.push({
        label: target.label,
        personId: target.personId,
        schoolId,
        scopeId,
        scopeRef,
        desiredScope,
      });
    }
  }

  console.log("========================================");
  console.log("Total scopes:", writes.length);
  console.log("");

  if (!APPLY) {
    console.log("PREVIEW COMPLETE");
    console.log("No writes performed.");
    console.log("");
    console.log(
      "Run again with --apply to create/update the scopes.",
    );
    return;
  }

  console.log("Writing scopes...");
  console.log("");

  const batch = db.batch();

  for (const item of writes) {
    batch.set(
      item.scopeRef,
      item.desiredScope,
      { merge: true },
    );
  }

  await batch.commit();

  console.log("Writes completed.");
  console.log("");
  console.log("Verifying...");
  console.log("");

  for (const item of writes) {
    const snap = await item.scopeRef.get();

    assert(
      snap.exists,
      `Scope was not created: ${item.scopeId}`,
    );

    const data = snap.data() || {};

    assert(
      data.id === item.scopeId,
      `Invalid id for ${item.scopeId}`,
    );

    assert(
      data.orgId === ORG_ID,
      `Invalid orgId for ${item.scopeId}`,
    );

    assert(
      data.personId === item.personId,
      `Invalid personId for ${item.scopeId}`,
    );

    assert(
      data.schoolId === item.schoolId,
      `Invalid schoolId for ${item.scopeId}`,
    );

    assert(
      data.capability === CAPABILITY,
      `Invalid capability for ${item.scopeId}`,
    );

    assert(
      data.isActive === true,
      `Scope is not active: ${item.scopeId}`,
    );

    console.log(
      `OK: ${item.label} -> ${item.schoolId}`,
    );
  }

  console.log("");
  console.log("========================================");
  console.log(
    "STAFF_WORK_VIEW scopes provisioned successfully.",
  );
}

main().catch((error) => {
  console.error("");
  console.error(
    "STAFF_WORK_VIEW scope provisioning failed:",
  );
  console.error(error);
  process.exitCode = 1;
});