/* eslint-disable no-console */

const admin = require("firebase-admin");
const path = require("path");

const APPLY = process.argv.includes("--apply");

const ORG_ID = "takween";
const CAPABILITY = "TEACHER_WORK_VIEW";

const TARGET = {
  label: "نادية عثمان ناصر البدر",
  email: "n.albader@qz.org.sa",
  uid: "okMSrTs9InbKydR0XGo90ZaBqJC2",
  personId: "p-n-albader",
  schoolId: "mrb-girls",
};

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

  console.log(
    APPLY
      ? "Nadia teacher-work scope - APPLY mode"
      : "Nadia teacher-work scope - PREVIEW mode (read-only)",
  );

  console.log("");

  const personRef = db.doc(
    `orgs/${ORG_ID}/people/${TARGET.personId}`,
  );

  const personSnap = await personRef.get();

  assert(
    personSnap.exists,
    `Person not found: ${TARGET.personId}`,
  );

  const personData = personSnap.data() || {};

  console.log("========================================");
  console.log("Person");
  console.log("----------------------------------------");
  console.log("Name:", personData.displayName || TARGET.label);
  console.log("Person ID:", TARGET.personId);
  console.log("Email:", TARGET.email);
  console.log("UID:", TARGET.uid);
  console.log("");

  const schoolRef = db.doc(
    `orgs/${ORG_ID}/schools/${TARGET.schoolId}`,
  );

  const schoolSnap = await schoolRef.get();

  assert(
    schoolSnap.exists,
    `School not found: ${TARGET.schoolId}`,
  );

  const schoolData = schoolSnap.data() || {};

  const scopeId = buildScopeId(
    TARGET.personId,
    TARGET.schoolId,
  );

  const scopeRef = db.doc(
    `orgs/${ORG_ID}/personSupervisionScopes/${scopeId}`,
  );

  const scopeSnap = await scopeRef.get();

  const existingScope = scopeSnap.exists
    ? scopeSnap.data()
    : null;

  const now = Date.now();

  const desiredScope = {
    id: scopeId,
    orgId: ORG_ID,
    personId: TARGET.personId,
    capability: CAPABILITY,
    schoolId: TARGET.schoolId,
    subjectScope: "ALL_SUBJECTS",
    subjectKeys: [],
    isActive: true,
    createdAt:
      typeof existingScope?.createdAt === "number"
        ? existingScope.createdAt
        : now,
    updatedAt: now,
  };

  console.log("========================================");
  console.log("School");
  console.log("----------------------------------------");
  console.log("School ID:", TARGET.schoolId);
  console.log("School:", schoolData.name || TARGET.schoolId);
  console.log("");

  console.log("========================================");
  console.log("Scope");
  console.log("----------------------------------------");
  console.log("Scope ID:", scopeId);
  console.log(
    "Existing:",
    scopeSnap.exists ? "YES" : "NO",
  );
  console.log("");

  if (existingScope) {
    console.log("Current scope:");
    console.dir(existingScope, {
      depth: null,
    });
    console.log("");
  }

  console.log("Desired scope:");
  console.dir(desiredScope, {
    depth: null,
  });

  console.log("");

  if (!APPLY) {
    console.log("========================================");
    console.log("PREVIEW COMPLETE");
    console.log("No writes performed.");
    console.log("");
    console.log(
      "Run again with --apply to create/update the scope.",
    );
    return;
  }

  await scopeRef.set(desiredScope, {
    merge: true,
  });

  console.log("Scope written.");
  console.log("");
  console.log("Verifying...");
  console.log("");

  const verifySnap = await scopeRef.get();

  assert(
    verifySnap.exists,
    `Scope was not created: ${scopeId}`,
  );

  const data = verifySnap.data() || {};

  assert(
    data.id === scopeId,
    `Invalid id for ${scopeId}`,
  );

  assert(
    data.orgId === ORG_ID,
    `Invalid orgId for ${scopeId}`,
  );

  assert(
    data.personId === TARGET.personId,
    `Invalid personId for ${scopeId}`,
  );

  assert(
    data.schoolId === TARGET.schoolId,
    `Invalid schoolId for ${scopeId}`,
  );

  assert(
    data.capability === CAPABILITY,
    `Invalid capability for ${scopeId}`,
  );

  assert(
    data.isActive === true,
    `Scope is not active: ${scopeId}`,
  );

  console.log(
    `OK: ${TARGET.label} -> ${TARGET.schoolId}`,
  );

  console.log("");
  console.log("========================================");
  console.log(
    "TEACHER_WORK_VIEW scope provisioned successfully.",
  );
}

main().catch((error) => {
  console.error("");
  console.error(
    "TEACHER_WORK_VIEW scope provisioning failed:",
  );
  console.error(error);
  process.exitCode = 1;
});