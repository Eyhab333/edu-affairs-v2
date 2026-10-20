/* eslint-disable no-console */

const fs = require("node:fs");
const path = require("node:path");
const admin = require("firebase-admin");

const APPLY = process.argv.includes("--apply");

const CONFIRM_TOKEN = "DEEM_KG_TEACHER_ROLE_REPAIR";

const confirmArg = process.argv.find((arg) =>
  arg.startsWith("--confirm="),
);

const confirmed =
  confirmArg?.slice("--confirm=".length) === CONFIRM_TOKEN;

const CONFIG = {
  orgId: "takween",
  schoolId: "kg-01",
  academicYearId: "ay-1448",
  termId: "term-1",

  personId: "p-d-a-athunian",
  email: "d-a-athunian@qz.org.sa",

  fromRoleKey: "KG_PRINCIPAL",
  toRoleKey: "KG_TEACHER",

  targetAssignmentIds: [
    "kg-01-ay-1448-term-1-class-teacher-diagnostic-evaluation-target-p-d-a-athunian",

    "kg-01-ay-1448-term-1-class-teacher-weekly-evaluation-target-p-d-a-athunian",

    "kg-01-ay-1448-term-1-educational-supervisor-class-teacher-diagnostic-evaluation-target-p-d-a-athunian",

    "kg-01-ay-1448-term-1-educational-supervisor-class-teacher-periodic-evaluation-target-p-d-a-athunian",

    "kg-01-ay-1448-term-1-kg-vp-supervisory-visit-target-p-d-a-athunian",

    "kg-01-ay-1448-term-1-vp-class-teacher-biweekly-evaluation-target-p-d-a-athunian",
  ],
};

function asString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeEmail(value) {
  return asString(value).toLowerCase();
}

function statusOf(data) {
  return asString(data?.status).toUpperCase();
}

function findServiceAccountPath() {
  const candidates = [
    process.env.SERVICE_ACCOUNT_PATH
      ? path.resolve(process.env.SERVICE_ACCOUNT_PATH)
      : null,

    path.resolve(process.cwd(), "service-account.json"),

    path.resolve(
      process.cwd(),
      "scripts",
      "service-account.json",
    ),

    path.resolve(
      __dirname,
      "..",
      "service-account.json",
    ),
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  throw new Error(
    [
      "Service account file was not found.",
      "Checked:",
      ...candidates.map(
        (candidate) => `- ${candidate}`,
      ),
    ].join("\n"),
  );
}

function initAdmin() {
  if (admin.apps.length) return;

  const serviceAccountPath =
    findServiceAccountPath();

  const serviceAccount =
    require(serviceAccountPath);

  admin.initializeApp({
    credential:
      admin.credential.cert(serviceAccount),
    projectId:
      serviceAccount.project_id,
  });

  console.log("Firebase Admin initialized.");
  console.log(
    `Project: ${serviceAccount.project_id}`,
  );
  console.log(
    `Service account: ${serviceAccountPath}`,
  );
}

async function verifyPerson(db, orgRoot) {
  const snapshot = await db
    .doc(
      `${orgRoot}/people/${CONFIG.personId}`,
    )
    .get();

  if (!snapshot.exists) {
    throw new Error(
      `Person not found: ${CONFIG.personId}`,
    );
  }

  const data = snapshot.data();

  if (
    normalizeEmail(data.email) !==
    normalizeEmail(CONFIG.email)
  ) {
    throw new Error(
      [
        "Person email mismatch.",
        `Expected: ${CONFIG.email}`,
        `Found: ${asString(data.email)}`,
      ].join("\n"),
    );
  }

  return snapshot;
}

async function verifyTeacherMembership(
  db,
  orgRoot,
) {
  const snapshot = await db
    .collection(`${orgRoot}/memberships`)
    .where(
      "personId",
      "==",
      CONFIG.personId,
    )
    .get();

  const teacherMemberships =
    snapshot.docs.filter((document) => {
      const data = document.data();

      const roleKey = asString(
        data.roleKey || data.role,
      ).toUpperCase();

      const status =
        statusOf(data);

      const active =
        data.isActive !== false &&
        data.active !== false &&
        ![
          "DISABLED",
          "ENDED",
          "INACTIVE",
          "REVOKED",
          "REMOVED",
          "ARCHIVED",
        ].includes(status);

      const coversSchool =
        asString(data.schoolId) ===
          CONFIG.schoolId ||
        asString(data.scopeId) ===
          CONFIG.schoolId ||
        data.scopes?.schoolIds?.includes(
          CONFIG.schoolId,
        );

      return (
        active &&
        coversSchool &&
        roleKey === CONFIG.toRoleKey
      );
    });

  if (!teacherMemberships.length) {
    throw new Error(
      [
        "Active KG_TEACHER membership was not found.",
        `personId: ${CONFIG.personId}`,
        `schoolId: ${CONFIG.schoolId}`,
      ].join("\n"),
    );
  }

  return teacherMemberships;
}

async function loadTargetAssignments(
  db,
  orgRoot,
) {
  return db.getAll(
    ...CONFIG.targetAssignmentIds.map(
      (id) =>
        db.doc(
          `${orgRoot}/evaluationTargetAssignments/${id}`,
        ),
    ),
  );
}

function inspectAssignments(snapshots) {
  const rows = [];

  for (const snapshot of snapshots) {
    if (!snapshot.exists) {
      rows.push({
        id: snapshot.id,
        status: "MISSING",
        planId: "-",
        targetPersonId: "-",
        targetRoleKey: "-",
        schoolId: "-",
        academicYearId: "-",
        termId: "-",
        action: "BLOCK",
      });

      continue;
    }

    const data = snapshot.data();

    const valid =
      asString(data.targetPersonId) ===
        CONFIG.personId &&
      asString(data.schoolId) ===
        CONFIG.schoolId &&
      asString(data.academicYearId) ===
        CONFIG.academicYearId &&
      asString(data.termId) ===
        CONFIG.termId &&
      asString(
        data.targetRoleKey,
      ).toUpperCase() ===
        CONFIG.fromRoleKey;

    rows.push({
      id: snapshot.id,
      status:
        statusOf(data) || "-",
      planId:
        asString(data.planId) || "-",
      targetPersonId:
        asString(data.targetPersonId) ||
        "-",
      targetRoleKey:
        asString(data.targetRoleKey) ||
        "-",
      schoolId:
        asString(data.schoolId) || "-",
      academicYearId:
        asString(data.academicYearId) ||
        "-",
      termId:
        asString(data.termId) || "-",
      action: valid
        ? `${CONFIG.fromRoleKey} -> ${CONFIG.toRoleKey}`
        : "BLOCK",
    });
  }

  return rows;
}

function assertSafeToApply(
  snapshots,
  rows,
) {
  if (
    snapshots.length !==
    CONFIG.targetAssignmentIds.length
  ) {
    throw new Error(
      "Unexpected assignment count.",
    );
  }

  const blocked = rows.filter(
    (row) => row.action === "BLOCK",
  );

  if (blocked.length) {
    console.table(blocked);

    throw new Error(
      "Repair blocked because one or more target assignments do not match the expected state.",
    );
  }
}

async function applyRepair(
  db,
  snapshots,
) {
  const now = Date.now();

  const batch = db.batch();

  for (const snapshot of snapshots) {
    batch.update(snapshot.ref, {
      targetRoleKey:
        CONFIG.toRoleKey,
      updatedAt: now,
    });
  }

  await batch.commit();

  return now;
}

async function verifyRepair(
  db,
  orgRoot,
) {
  const snapshots =
    await loadTargetAssignments(
      db,
      orgRoot,
    );

  const rows = snapshots.map(
    (snapshot) => {
      if (!snapshot.exists) {
        return {
          id: snapshot.id,
          targetRoleKey: "MISSING",
          verified: "NO",
        };
      }

      const data = snapshot.data();

      const roleKey = asString(
        data.targetRoleKey,
      ).toUpperCase();

      return {
        id: snapshot.id,
        targetRoleKey:
          roleKey || "-",
        verified:
          roleKey ===
          CONFIG.toRoleKey
            ? "YES"
            : "NO",
      };
    },
  );

  console.log("\nVerification:");
  console.table(rows);

  const allVerified =
    rows.every(
      (row) =>
        row.verified === "YES",
    );

  if (!allVerified) {
    throw new Error(
      "Post-write verification failed.",
    );
  }
}

async function main() {
  console.log(
    "========================================",
  );

  console.log(
    "DEEM EVALUATION ROLE REPAIR",
  );

  console.log(
    "========================================",
  );

  console.log(
    APPLY
      ? "Mode: APPLY"
      : "Mode: PREVIEW / READ ONLY",
  );

  initAdmin();

  const db = admin.firestore();

  const orgRoot =
    `orgs/${CONFIG.orgId}`;

  const person =
    await verifyPerson(
      db,
      orgRoot,
    );

  const memberships =
    await verifyTeacherMembership(
      db,
      orgRoot,
    );

  console.log(
    "\nPerson verified:",
  );

  console.table([
    {
      personId:
        person.id,
      displayName:
        asString(
          person.data().displayName,
        ),
      email:
        asString(
          person.data().email,
        ),
      expectedRole:
        CONFIG.toRoleKey,
      teacherMemberships:
        memberships.length,
    },
  ]);

  const snapshots =
    await loadTargetAssignments(
      db,
      orgRoot,
    );

  const rows =
    inspectAssignments(
      snapshots,
    );

  console.log(
    "\nTarget assignments:",
  );

  console.table(rows);

  assertSafeToApply(
    snapshots,
    rows,
  );

  console.log(
    "\nPlanned change:",
  );

  console.log(
    `${CONFIG.fromRoleKey} -> ${CONFIG.toRoleKey}`,
  );

  console.log(
    `Documents: ${rows.length}`,
  );

  if (!APPLY) {
    console.log(
      "\nPREVIEW COMPLETE.",
    );

    console.log(
      "No Firestore writes were performed.",
    );

    console.log(
      "\nTo apply:",
    );

    console.log(
      `node .\\scripts\\evaluation-reports\\repair-deem-evaluation-role.cjs --apply --confirm=${CONFIRM_TOKEN}`,
    );

    return;
  }

  if (!confirmed) {
    throw new Error(
      [
        "Apply mode requires explicit confirmation.",
        "",
        `Required: --confirm=${CONFIRM_TOKEN}`,
      ].join("\n"),
    );
  }

  const updatedAt =
    await applyRepair(
      db,
      snapshots,
    );

  console.log(
    "\nRepair applied.",
  );

  console.log({
    personId: CONFIG.personId,
    fromRoleKey:
      CONFIG.fromRoleKey,
    toRoleKey:
      CONFIG.toRoleKey,
    updatedDocuments:
      snapshots.length,
    updatedAt,
  });

  await verifyRepair(
    db,
    orgRoot,
  );

  console.log(
    "\n========================================",
  );

  console.log(
    "REPAIR COMPLETED AND VERIFIED",
  );

  console.log(
    "========================================",
  );
}

main().catch((error) => {
  console.error(
    "\nRepair failed:",
  );

  console.error(error);

  process.exitCode = 1;
});