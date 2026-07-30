const fs = require("node:fs");
const path = require("node:path");

const {
  cert,
  getApps,
  initializeApp,
  applicationDefault,
} = require("firebase-admin/app");

const {
  getFirestore,
} = require("firebase-admin/firestore");

const ORG_ID = "takween";
const APPLY_CONFIRMATION =
  "FIX_GIRLS_TEACHER_TITLES";

function parseArgs() {
  const result = {};

  for (const arg of process.argv.slice(2)) {
    if (!arg.startsWith("--")) continue;

    const [key, ...valueParts] = arg
      .slice(2)
      .split("=");

    result[key] = valueParts.join("=");
  }

  return result;
}

async function initializeFirebase() {
  if (getApps().length > 0) return;

  const args = parseArgs();

  const serviceAccountPath =
    args.serviceAccount ||
    process.env.GOOGLE_APPLICATION_CREDENTIALS ||
    path.resolve(
      process.cwd(),
      "service-account.json",
    );

  if (fs.existsSync(serviceAccountPath)) {
    const serviceAccount = require(
      path.resolve(serviceAccountPath),
    );

    initializeApp({
      credential: cert(serviceAccount),
    });

    return;
  }

  initializeApp({
    credential: applicationDefault(),
  });
}

async function main() {
  const args = parseArgs();

  const applyMode =
    args.apply === APPLY_CONFIRMATION;

  await initializeFirebase();

  const db = getFirestore();

  console.log({
    orgId: ORG_ID,
    roleKey: "GIRLS_TEACHER",
    newTitle: "معلمة",
    mode: applyMode
      ? "APPLY"
      : "DRY_RUN_NO_WRITES",
  });

  const membershipsSnapshot = await db
    .collection(
      `orgs/${ORG_ID}/memberships`,
    )
    .where(
      "roleKey",
      "==",
      "GIRLS_TEACHER",
    )
    .get();

  const results = [];

  for (const membershipDoc of
    membershipsSnapshot.docs) {
    const uid = membershipDoc.id;
    const membership =
      membershipDoc.data();

    const userMembershipRef = db.doc(
      `users/${uid}/orgMemberships/${ORG_ID}`,
    );

    const userMembershipSnapshot =
      await userMembershipRef.get();

    results.push({
      uid,
      personId:
        membership.personId || "",
      email:
        membership.email || "",
      currentOrgTitle:
        membership.title || "",
      userMembershipExists:
        userMembershipSnapshot.exists,
      currentUserTitle:
        userMembershipSnapshot.exists
          ? userMembershipSnapshot.data()
              .title || ""
          : "",
      needsUpdate:
        membership.title !== "معلمة" ||
        (userMembershipSnapshot.exists &&
          userMembershipSnapshot.data()
            .title !== "معلمة"),
    });
  }

  console.table(
    results.map((item) => ({
      uid: item.uid,
      personId: item.personId,
      orgTitle:
        item.currentOrgTitle,
      userTitle:
        item.currentUserTitle,
      userMembership:
        item.userMembershipExists
          ? "EXISTS"
          : "MISSING",
      action: item.needsUpdate
        ? "UPDATE"
        : "SKIP",
    })),
  );

  const rowsToUpdate = results.filter(
    (item) => item.needsUpdate,
  );

  console.log("\nSummary");

  console.log({
    girlsTeachersFound:
      results.length,
    needUpdate:
      rowsToUpdate.length,
    alreadyCorrect:
      results.length -
      rowsToUpdate.length,
  });

  if (!applyMode) {
    console.log(
      "\nDRY_RUN completed successfully.",
    );

    console.log(
      "No Firestore documents were updated.",
    );

    console.log(
      `Run with --apply=${APPLY_CONFIRMATION} to apply.`,
    );

    return;
  }

  const batch = db.batch();
  const now = Date.now();

  for (const item of rowsToUpdate) {
    const orgMembershipRef = db.doc(
      `orgs/${ORG_ID}/memberships/${item.uid}`,
    );

    batch.set(
      orgMembershipRef,
      {
        title: "معلمة",
        updatedAt: now,
      },
      {
        merge: true,
      },
    );

    if (item.userMembershipExists) {
      const userMembershipRef = db.doc(
        `users/${item.uid}/orgMemberships/${ORG_ID}`,
      );

      batch.set(
        userMembershipRef,
        {
          title: "معلمة",
          updatedAt: now,
        },
        {
          merge: true,
        },
      );
    }
  }

  await batch.commit();

  console.log("\nMigration completed.");

  console.log({
    teachersUpdated:
      rowsToUpdate.length,
  });
}

main().catch((error) => {
  console.error(
    "\nMigration failed:",
  );

  console.error(error);

  process.exitCode = 1;
});