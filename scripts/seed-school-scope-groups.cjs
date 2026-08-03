const admin = require("firebase-admin");
const path = require("node:path");

function parseArgs(argv) {
  const result = {};

  for (const arg of argv) {
    if (!arg.startsWith("--")) continue;

    const equalIndex = arg.indexOf("=");

    if (equalIndex === -1) {
      result[arg.slice(2)] = true;
      continue;
    }

    result[arg.slice(2, equalIndex)] =
      arg.slice(equalIndex + 1);
  }

  return result;
}

function toBoolean(value, fallback = false) {
  if (value === undefined) return fallback;
  if (typeof value === "boolean") return value;

  return String(value).trim().toLowerCase() === "true";
}

async function initializeAdmin(serviceAccountPath) {
  if (admin.apps.length > 0) return;

  if (serviceAccountPath) {
    const serviceAccount = require(serviceAccountPath);

    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });

    return;
  }

  admin.initializeApp({
    credential:
      admin.credential.applicationDefault(),
  });
}

function arraysEqual(left, right) {
  return (
    Array.isArray(left) &&
    Array.isArray(right) &&
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}

function groupNeedsUpdate(existing, expected) {
  if (!existing) return true;

  return (
    existing.id !== expected.id ||
    existing.orgId !== expected.orgId ||
    existing.title !== expected.title ||
    existing.description !== expected.description ||
    existing.isActive !== expected.isActive ||
    !arraysEqual(existing.schoolIds, expected.schoolIds)
  );
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  const orgId = String(
    args.orgId || "takween",
  ).trim();

  const apply = toBoolean(args.apply, false);

  const serviceAccountPath = args.serviceAccount
    ? path.resolve(String(args.serviceAccount))
    : null;

  await initializeAdmin(serviceAccountPath);

  const db = admin.firestore();

  const groups = [
    {
      id: "mrb-boys-schools",
      orgId,

      title: "مدارس منار الريادة بنين",
      description:
        "نطاق مدارس منار الريادة بنين في حي السيح وحي الفالح",

      schoolIds: [
        "mrb-boys-sayh",
        "mrb-boys-faleh",
      ],

      isActive: true,
    },

    {
      id: "mrb-girls-and-kindergartens",
      orgId,

      title: "منار البنات والروضات",
      description:
        "نطاق مدرسة منار الريادة بنات وجميع روضات واحة الرياحين",

      schoolIds: [
        "mrb-girls",
        "kg-01",
        "kg-02",
        "kg-03",
        "kg-04",
      ],

      isActive: true,
    },

    {
      id: "mrb-all-schools",
      orgId,

      title: "مدارس منار الريادة",
      description:
        "نطاق مدارس منار الريادة بنين وبنات دون الروضات",

      schoolIds: [
        "mrb-boys-sayh",
        "mrb-boys-faleh",
        "mrb-girls",
      ],

      isActive: true,
    },
  ];

  const orgSnapshot = await db
    .doc(`orgs/${orgId}`)
    .get();

  if (!orgSnapshot.exists) {
    throw new Error(
      `المؤسسة غير موجودة: ${orgId}`,
    );
  }

  const allSchoolIds = Array.from(
    new Set(
      groups.flatMap((group) => group.schoolIds),
    ),
  );

  const schoolSnapshots = await Promise.all(
    allSchoolIds.map((schoolId) =>
      db
        .doc(`orgs/${orgId}/schools/${schoolId}`)
        .get(),
    ),
  );

  const missingSchoolIds = schoolSnapshots
    .map((snapshot, index) => ({
      exists: snapshot.exists,
      schoolId: allSchoolIds[index],
    }))
    .filter((item) => !item.exists)
    .map((item) => item.schoolId);

  if (missingSchoolIds.length > 0) {
    throw new Error(
      `المدارس التالية غير موجودة: ${missingSchoolIds.join(
        ", ",
      )}`,
    );
  }

  const results = [];

  for (const group of groups) {
    const reference = db.doc(
      `orgs/${orgId}/schoolScopeGroups/${group.id}`,
    );

    const snapshot = await reference.get();
    const existing = snapshot.data();

    const action = !snapshot.exists
      ? "CREATE"
      : groupNeedsUpdate(existing, group)
        ? "UPDATE"
        : "NO_CHANGE";

    results.push({
      group,
      reference,
      snapshot,
      action,
    });
  }

  console.log("");
  console.log("==============================");
  console.log("School Scope Groups");
  console.log("==============================");
  console.log({
    orgId,
    mode: apply ? "APPLY" : "DRY_RUN",
  });

  for (const result of results) {
    console.log("");
    console.log({
      groupId: result.group.id,
      title: result.group.title,
      schoolIds: result.group.schoolIds,
      action: result.action,
    });
  }

  if (!apply) {
    console.log("");
    console.log(
      "DRY_RUN فقط — لم يتم تعديل Firestore.",
    );
    return;
  }

  const batch = db.batch();
  const now = Date.now();

  for (const result of results) {
    if (result.action === "NO_CHANGE") {
      continue;
    }

    const existingCreatedAt =
      result.snapshot.data()?.createdAt;

    batch.set(
      result.reference,
      {
        ...result.group,

        createdAt:
          typeof existingCreatedAt === "number"
            ? existingCreatedAt
            : now,

        updatedAt: now,
      },
      { merge: true },
    );
  }

  await batch.commit();

  console.log("");
  console.log("تم حفظ مجموعات نطاق المدارس بنجاح.");
}

main().catch((error) => {
  console.error("");
  console.error(
    "فشل Seed مجموعات نطاق المدارس:",
    error,
  );

  process.exit(1);
});