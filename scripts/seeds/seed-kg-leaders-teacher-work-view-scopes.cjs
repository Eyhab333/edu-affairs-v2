/* eslint-disable no-console */

const admin = require("firebase-admin");
const path = require("path");

const APPLY = process.argv.includes("--apply");

const ORG_ID = "takween";
const CAPABILITY = "TEACHER_WORK_VIEW";

const TARGETS = [
  {
    name: "أشواق الحميدي الحميدي",
    email: "a.alhomidi@qz.org.sa",
    schoolId: "kg-01",
    expectedRoles: ["KG_PRINCIPAL"],
  },
  {
    name: "تماضر صالح محمد العامر",
    email: "t.alamer@qz.org.sa",
    schoolId: "kg-01",
    expectedRoles: ["KG_VP"],
  },
  {
    name: "سارة عبدالرحمن الطريقي",
    email: "s.alturiqe@qz.org.sa",
    schoolId: "kg-02",
    expectedRoles: ["KG_PRINCIPAL"],
  },
  {
    name: "هاجر أحمد فهد الجوير",
    email: "h.aljower@qz.org.sa",
    schoolId: "kg-02",
    expectedRoles: ["KG_VP"],
  },
  {
    name: "سمية أحمد راشد النافع",
    email: "s.alnafea@qz.org.sa",
    schoolId: "kg-03",
    expectedRoles: ["KG_PRINCIPAL"],
  },
  {
    name: "ساره سعد أحمد السلمان",
    email: "s.alslman@qz.org.sa",
    schoolId: "kg-03",
    expectedRoles: ["KG_VP"],
  },
  {
    name: "نورة علي عبدالعزيز الحمين",
    email: "n.alhamiyn@qz.org.sa",
    schoolId: "kg-04",
    expectedRoles: ["KG_PRINCIPAL"],
  },
  {
    name: "حصه عبدالرزاق احمد الشايع",
    email: "h.alshaya@qz.org.sa",
    schoolId: "kg-04",
    expectedRoles: ["KG_VP"],
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

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function buildScopeId(personId, schoolId) {
  return `${personId}__${CAPABILITY}__${schoolId}`;
}

function getMembershipSchoolIds(membership) {
  const directSchoolId =
    membership.scopeType === "SCHOOL"
      ? text(membership.scopeId)
      : "";

  const scopedSchoolIds = Array.isArray(
    membership?.scopes?.schoolIds,
  )
    ? membership.scopes.schoolIds
        .map(text)
        .filter(Boolean)
    : [];

  return unique([
    directSchoolId,
    ...scopedSchoolIds,
  ]);
}

async function main() {
  initAdmin();

  const db = admin.firestore();
  const auth = admin.auth();

  console.log(
    APPLY
      ? "KG leaders TEACHER_WORK_VIEW - APPLY mode"
      : "KG leaders TEACHER_WORK_VIEW - PREVIEW mode (read-only)",
  );

  console.log("");

  const plannedWrites = [];

  for (const target of TARGETS) {
    console.log("========================================");
    console.log(target.name);
    console.log("----------------------------------------");
    console.log("Email:", target.email);
    console.log("Expected school:", target.schoolId);

    // 1. Resolve Firebase Auth user by email
    const authUser = await auth.getUserByEmail(target.email);

    assert(
      authUser?.uid,
      `Firebase Auth user not found: ${target.email}`,
    );

    console.log("UID:", authUser.uid);

    // 2. Load Takween membership
    const membershipRef = db.doc(
      `users/${authUser.uid}/orgMemberships/${ORG_ID}`,
    );

    const membershipSnap = await membershipRef.get();

    assert(
      membershipSnap.exists,
      `Takween membership not found for ${target.email}`,
    );

    const membership = membershipSnap.data() || {};

    assert(
      membership.isActive !== false &&
        membership.status !== "INACTIVE",
      `Membership is inactive for ${target.email}`,
    );

    const personId = text(membership.personId);

    assert(
      personId,
      `personId missing from membership for ${target.email}`,
    );

    const roleKey =
      text(membership.roleKey) ||
      text(membership.role);

    assert(
      target.expectedRoles.includes(roleKey),
      `Unexpected role for ${target.email}: ${roleKey || "(missing)"}. Expected: ${target.expectedRoles.join(", ")}`,
    );

    const membershipSchoolIds =
      getMembershipSchoolIds(membership);

    assert(
      membershipSchoolIds.includes(target.schoolId),
      [
        `School mismatch for ${target.email}.`,
        `Expected: ${target.schoolId}`,
        `Membership schools: ${membershipSchoolIds.join(", ") || "(none)"}`,
      ].join(" "),
    );

    console.log("Person ID:", personId);
    console.log("Role:", roleKey);
    console.log(
      "Membership schools:",
      membershipSchoolIds.join(", "),
    );

    // 3. Verify person exists
    const personRef = db.doc(
      `orgs/${ORG_ID}/people/${personId}`,
    );

    const personSnap = await personRef.get();

    assert(
      personSnap.exists,
      `Person document not found: ${personId}`,
    );

    const personData = personSnap.data() || {};

    console.log(
      "Firestore name:",
      text(personData.displayName) || target.name,
    );

    // 4. Verify school exists
    const schoolRef = db.doc(
      `orgs/${ORG_ID}/schools/${target.schoolId}`,
    );

    const schoolSnap = await schoolRef.get();

    assert(
      schoolSnap.exists,
      `School not found: ${target.schoolId}`,
    );

    console.log(
      "School:",
      text(schoolSnap.data()?.name) ||
        target.schoolId,
    );

    // 5. Build scope
    const scopeId = buildScopeId(
      personId,
      target.schoolId,
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
      personId,
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

    console.log("Scope ID:", scopeId);
    console.log(
      "Existing scope:",
      scopeSnap.exists ? "YES" : "NO",
    );

    console.log("Desired scope:");
    console.dir(desiredScope, {
      depth: null,
    });

    console.log("");

    plannedWrites.push({
      target,
      personId,
      scopeId,
      scopeRef,
      desiredScope,
    });
  }

  console.log("========================================");
  console.log(
    "Total TEACHER_WORK_VIEW scopes:",
    plannedWrites.length,
  );
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

  for (const item of plannedWrites) {
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

  for (const item of plannedWrites) {
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
      data.schoolId === item.target.schoolId,
      `Invalid schoolId for ${item.scopeId}`,
    );

    assert(
      data.capability === CAPABILITY,
      `Invalid capability for ${item.scopeId}`,
    );

    assert(
      data.isActive === true,
      `Scope is inactive: ${item.scopeId}`,
    );

    console.log(
      `OK: ${item.target.name} -> ${item.target.schoolId}`,
    );
  }

  console.log("");
  console.log("========================================");
  console.log(
    "All KG TEACHER_WORK_VIEW scopes provisioned successfully.",
  );
}

main().catch((error) => {
  console.error("");
  console.error(
    "KG TEACHER_WORK_VIEW provisioning failed:",
  );
  console.error(error);
  process.exitCode = 1;
});