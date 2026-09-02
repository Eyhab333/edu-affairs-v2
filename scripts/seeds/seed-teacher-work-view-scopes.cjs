/* eslint-disable no-console */

const admin = require("firebase-admin");
const path = require("path");

const APPLY = process.argv.includes("--apply");

const ORG_ID = "takween";
const CAPABILITY = "TEACHER_WORK_VIEW";

const TARGETS = [
  {
    label: "الوكيل التعليمي - السيح",
    email: "m.alateeq@qz.org.sa",
    personId: "p-m-alateeq",
    schoolId: "mrb-boys-sayh",
  },
  {
    label: "الوكيل التعليمي - الفالح",
    email: "educational-agent-faleh@qz.org.sa",
    personId: "staff-8DVZ68FaCoWqiC3jkSBNIqs4T203",
    schoolId: "mrb-boys-faleh",
  },
  {
    label: "المشرفة التعليمية - منار بنات",
    email: "edu-supervisor-mrb@qz.org.sa",
    personId: "staff-ZKSVVOeoJOhUhIu4HDFapMwApo83",
    schoolId: "mrb-girls",
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

function buildScopeId(target) {
  return `${target.personId}__${CAPABILITY}__${target.schoolId}`;
}

async function main() {
  initAdmin();

  const db = admin.firestore();
  const orgRoot = `orgs/${ORG_ID}`;

  console.log(
    APPLY
      ? "Teacher work scopes - APPLY mode"
      : "Teacher work scopes - PREVIEW mode (read-only)",
  );

  console.log("");

  const results = [];

  for (const target of TARGETS) {
    const scopeId = buildScopeId(target);

    const personRef = db.doc(
      `${orgRoot}/people/${target.personId}`,
    );

    const schoolRef = db.doc(
      `${orgRoot}/schools/${target.schoolId}`,
    );

    const scopeRef = db.doc(
      `${orgRoot}/personSupervisionScopes/${scopeId}`,
    );

    const [personSnap, schoolSnap, scopeSnap] =
      await Promise.all([
        personRef.get(),
        schoolRef.get(),
        scopeRef.get(),
      ]);

    assert(
      personSnap.exists,
      `Person not found: ${target.personId} (${target.email})`,
    );

    assert(
      schoolSnap.exists,
      `School not found: ${target.schoolId}`,
    );

    const personData = personSnap.data() || {};
    const schoolData = schoolSnap.data() || {};
    const existingScope = scopeSnap.exists
      ? scopeSnap.data()
      : null;

    console.log("========================================");
    console.log(target.label);
    console.log("----------------------------------------");
    console.log("Email:", target.email);
    console.log("Person ID:", target.personId);
    console.log(
      "Person:",
      personData.displayName || target.personId,
    );
    console.log("School ID:", target.schoolId);
    console.log(
      "School:",
      schoolData.name || target.schoolId,
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

    const now = Date.now();

    const desiredScope = {
      id: scopeId,
      orgId: ORG_ID,
      personId: target.personId,
      capability: CAPABILITY,
      schoolId: target.schoolId,
      subjectScope: "ALL_SUBJECTS",
      subjectKeys: [],
      isActive: true,
      createdAt:
        typeof existingScope?.createdAt === "number"
          ? existingScope.createdAt
          : now,
      updatedAt: now,
    };

    console.log("Desired scope:");
    console.dir(desiredScope, {
      depth: null,
    });

    results.push({
      target,
      scopeId,
      scopeRef,
      desiredScope,
      existedBefore: scopeSnap.exists,
    });

    console.log("");
  }

  if (!APPLY) {
    console.log("========================================");
    console.log("PREVIEW COMPLETE");
    console.log("No writes performed.");
    console.log("");
    console.log(
      "Run again with --apply to create/update the scopes.",
    );
    return;
  }

  console.log("========================================");
  console.log("Writing scopes...");
  console.log("");

  const batch = db.batch();

  for (const result of results) {
    batch.set(
      result.scopeRef,
      result.desiredScope,
      { merge: true },
    );
  }

  await batch.commit();

  console.log("Writes completed.");
  console.log("");
  console.log("Verifying...");
  console.log("");

  for (const result of results) {
    const verifiedSnap = await result.scopeRef.get();

    assert(
      verifiedSnap.exists,
      `Scope was not created: ${result.scopeId}`,
    );

    const data = verifiedSnap.data() || {};

    assert(
      data.id === result.scopeId,
      `Invalid id for ${result.scopeId}`,
    );

    assert(
      data.orgId === ORG_ID,
      `Invalid orgId for ${result.scopeId}`,
    );

    assert(
      data.personId === result.target.personId,
      `Invalid personId for ${result.scopeId}`,
    );

    assert(
      data.schoolId === result.target.schoolId,
      `Invalid schoolId for ${result.scopeId}`,
    );

    assert(
      data.capability === CAPABILITY,
      `Invalid capability for ${result.scopeId}`,
    );

    assert(
      data.subjectScope === "ALL_SUBJECTS",
      `Invalid subjectScope for ${result.scopeId}`,
    );

    assert(
      Array.isArray(data.subjectKeys) &&
        data.subjectKeys.length === 0,
      `Invalid subjectKeys for ${result.scopeId}`,
    );

    assert(
      data.isActive === true,
      `Scope is not active: ${result.scopeId}`,
    );

    console.log(
      `OK: ${result.target.label}`,
    );
    console.log(`    ${result.scopeId}`);
  }

  console.log("");
  console.log("========================================");
  console.log(
    "Teacher work supervision scopes provisioned successfully.",
  );
}

main().catch((error) => {
  console.error("");
  console.error(
    "Teacher work supervision scope provisioning failed:",
  );
  console.error(error);
  process.exitCode = 1;
});