/* eslint-disable no-console */

const admin = require("firebase-admin");
const path = require("path");

const APPLY = process.argv.includes("--apply");

const ORG_ID = "takween";
const CAPABILITY = "TEACHER_WORK_VIEW";

const TARGETS = [
  {
    label: "طيبة سليمان الطوالة",
    email: "t.altwala@qz.org.sa",
    personId: "p-t-altwala",
    schoolIds: [
      "kg-01",
      "kg-02",
      "kg-03",
      "kg-04",
    ],
    subjectScope: "SUBJECT_KEYS",
    subjectKeys: ["VALUES"],
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

function validateTargetScope(target) {
  assert(
    target.subjectScope === "ALL_SUBJECTS" ||
      target.subjectScope === "SUBJECT_KEYS",
    `Invalid subjectScope for ${target.personId}`,
  );

  assert(
    Array.isArray(target.subjectKeys),
    `subjectKeys must be an array for ${target.personId}`,
  );

  const subjectKeys = Array.from(
    new Set(
      target.subjectKeys
        .filter((subjectKey) => typeof subjectKey === "string")
        .map((subjectKey) => subjectKey.trim())
        .filter(Boolean),
    ),
  );

  assert(
    subjectKeys.length === target.subjectKeys.length,
    `subjectKeys must contain only non-empty unique values for ${target.personId}`,
  );

  if (target.subjectScope === "ALL_SUBJECTS") {
    assert(
      subjectKeys.length === 0,
      `subjectKeys must be empty for ALL_SUBJECTS (${target.personId})`,
    );
  }

  if (target.subjectScope === "SUBJECT_KEYS") {
    assert(
      subjectKeys.length > 0,
      `subjectKeys must contain at least one value for SUBJECT_KEYS (${target.personId})`,
    );
  }

  return {
    subjectScope: target.subjectScope,
    subjectKeys,
  };
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
    const targetScope = validateTargetScope(target);

    const personRef = db.doc(
      `${orgRoot}/people/${target.personId}`,
    );

    const personSnap = await personRef.get();

    assert(
      personSnap.exists,
      `Person not found: ${target.personId} (${target.email})`,
    );

    const personData = personSnap.data() || {};

    console.log("========================================");
    console.log(target.label);
    console.log("----------------------------------------");
    console.log("Email:", target.email);
    console.log("Person ID:", target.personId);
    console.log(
      "Person:",
      personData.displayName || target.personId,
    );
    console.log("");

    assert(
      Array.isArray(target.schoolIds) &&
        target.schoolIds.length > 0,
      `No schoolIds configured for ${target.personId}`,
    );

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
        subjectScope: targetScope.subjectScope,
        subjectKeys: targetScope.subjectKeys,
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

      results.push({
        label: target.label,
        personId: target.personId,
        schoolId,
        scopeId,
        scopeRef,
        desiredScope,
        targetScope,
      });
    }
  }

  console.log("========================================");
  console.log("Total scopes:", results.length);
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
    const verifiedSnap =
      await result.scopeRef.get();

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
      data.personId === result.personId,
      `Invalid personId for ${result.scopeId}`,
    );

    assert(
      data.schoolId === result.schoolId,
      `Invalid schoolId for ${result.scopeId}`,
    );

    assert(
      data.capability === CAPABILITY,
      `Invalid capability for ${result.scopeId}`,
    );

    assert(
      data.subjectScope === result.targetScope.subjectScope,
      `Invalid subjectScope for ${result.scopeId}`,
    );

    assert(
      Array.isArray(data.subjectKeys) &&
        data.subjectKeys.length === result.targetScope.subjectKeys.length &&
        data.subjectKeys.every(
          (subjectKey, index) =>
            subjectKey === result.targetScope.subjectKeys[index],
        ),
      `Invalid subjectKeys for ${result.scopeId}`,
    );

    assert(
      data.isActive === true,
      `Scope is not active: ${result.scopeId}`,
    );

    console.log(
      `OK: ${result.label} -> ${result.schoolId}`,
    );
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
