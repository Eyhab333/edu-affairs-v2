/* eslint-disable no-console */

const admin = require("firebase-admin");
const path = require("path");

const APPLY = process.argv.includes("--apply");

const ORG_ID = "takween";

const TARGETS = [
  {
    label: "أسماء محمد المنصور",
    viewerPersonId: "p-a-almansur",

    includedPeople: [
      {
        label: "ساره ناصر محمد الحمد",
        personId: "staff-Ivr7RIb0AoWIuKAgQTcK0LzKRCz1",
      },
      {
        label: "أريج عبدالله عبدالرحمن المنصور",
        personId: "p-aa-almansor",
      },
      {
        label: "هناء فراج سليمان الزنيدي",
        personId: "p-hanaz",
      },
      {
        label: "نوره يوسف علي المسعود",
        personId: "p-ny-almasoud",
      },
    ],

    excludedPeople: [
      {
        label: "السيد القاضي",
        personId: "p-s-sayed",
      },
      {
        label: "منصور الرميح",
        personId: "p-malrameh",
      },
      {
        label: "مشرف الرياضيات والعلوم",
        personId: "staff-NOFByrx0XLVovqxuFjfwRWSokgs1",
      },
    ],
  },
];

function initAdmin() {
  if (admin.apps.length) return;

  const serviceAccountPath = path.resolve(__dirname, "../service-account.json");

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

async function main() {
  initAdmin();

  const db = admin.firestore();
  const orgRoot = `orgs/${ORG_ID}`;

  console.log(
    APPLY
      ? "Staff work viewer configs - APPLY mode"
      : "Staff work viewer configs - PREVIEW mode (read-only)",
  );

  console.log("");

  const writes = [];

  for (const target of TARGETS) {
    const viewerRef = db.doc(`${orgRoot}/people/${target.viewerPersonId}`);

    const viewerSnap = await viewerRef.get();

    assert(
      viewerSnap.exists,
      `Viewer person not found: ${target.viewerPersonId}`,
    );

    const viewerData = viewerSnap.data() || {};

    console.log("========================================");
    console.log(target.label);
    console.log("----------------------------------------");
    console.log("Viewer:", viewerData.displayName || target.viewerPersonId);
    console.log("Viewer personId:", target.viewerPersonId);

    console.log("");
    console.log("Excluded people:");

    const excludedPersonIds = [];

    console.log("");
    console.log("Included people:");

    const includedPersonIds = [];

    for (const includedPerson of target.includedPeople || []) {
      const personRef = db.doc(`${orgRoot}/people/${includedPerson.personId}`);

      const personSnap = await personRef.get();

      assert(
        personSnap.exists,
        `Included person not found: ${includedPerson.personId}`,
      );

      const personData = personSnap.data() || {};

      console.log(
        `- ${
          personData.displayName || includedPerson.label
        } (${includedPerson.personId})`,
      );

      includedPersonIds.push(includedPerson.personId);
    }

    for (const excludedPerson of target.excludedPeople) {
      const personRef = db.doc(`${orgRoot}/people/${excludedPerson.personId}`);

      const personSnap = await personRef.get();

      assert(
        personSnap.exists,
        `Excluded person not found: ${excludedPerson.personId}`,
      );

      const personData = personSnap.data() || {};

      console.log(
        `- ${
          personData.displayName || excludedPerson.label
        } (${excludedPerson.personId})`,
      );

      excludedPersonIds.push(excludedPerson.personId);
    }

    const configRef = db.doc(
      `${orgRoot}/staffWorkViewerConfigs/${target.viewerPersonId}`,
    );

    const configSnap = await configRef.get();

    const existingConfig = configSnap.exists ? configSnap.data() : null;

    const now = Date.now();

    const desiredConfig = {
      viewerPersonId: target.viewerPersonId,
      includedPersonIds: [...new Set(includedPersonIds)],
      excludedPersonIds: [...new Set(excludedPersonIds)],
      isActive: true,
      createdAt:
        typeof existingConfig?.createdAt === "number"
          ? existingConfig.createdAt
          : now,
      updatedAt: now,
    };

    console.log("");
    console.log(
      "Config path:",
      `${orgRoot}/staffWorkViewerConfigs/${target.viewerPersonId}`,
    );

    console.log("Existing:", configSnap.exists ? "YES" : "NO");

    if (existingConfig) {
      console.log("");
      console.log("Current config:");
      console.dir(existingConfig, {
        depth: null,
      });
    }

    console.log("");
    console.log("Desired config:");
    console.dir(desiredConfig, {
      depth: null,
    });

    writes.push({
      label: target.label,
      viewerPersonId: target.viewerPersonId,
      configRef,
      desiredConfig,
    });

    console.log("");
  }

  console.log("========================================");
  console.log("Total configs:", writes.length);
  console.log("");

  if (!APPLY) {
    console.log("PREVIEW COMPLETE");
    console.log("No writes performed.");
    console.log("");
    console.log("Run again with --apply to write the configs.");
    return;
  }

  const batch = db.batch();

  for (const item of writes) {
    batch.set(item.configRef, item.desiredConfig, { merge: true });
  }

  await batch.commit();

  console.log("Writes completed.");
  console.log("");
  console.log("Verifying...");
  console.log("");

  for (const item of writes) {
    const snapshot = await item.configRef.get();

    assert(
      snapshot.exists,
      `Config was not created for ${item.viewerPersonId}`,
    );

    const data = snapshot.data() || {};

    assert(
      data.viewerPersonId === item.viewerPersonId,
      `Invalid viewerPersonId for ${item.viewerPersonId}`,
    );

    assert(
      data.isActive === true,
      `Config is not active for ${item.viewerPersonId}`,
    );

    assert(
      Array.isArray(data.includedPersonIds),
      `Invalid includedPersonIds for ${item.viewerPersonId}`,
    );

    assert(
      Array.isArray(data.excludedPersonIds),
      `Invalid excludedPersonIds for ${item.viewerPersonId}`,
    );

    for (const includedPersonId of item.desiredConfig.includedPersonIds) {
      assert(
        data.includedPersonIds.includes(includedPersonId),
        `Missing included person ${includedPersonId}`,
      );
    }

    for (const excludedPersonId of item.desiredConfig.excludedPersonIds) {
      assert(
        data.excludedPersonIds.includes(excludedPersonId),
        `Missing excluded person ${excludedPersonId}`,
      );
    }

    console.log(`OK: ${item.label}`);
    console.log(`    included: ${data.includedPersonIds.length}`);
    console.log(`    excluded: ${data.excludedPersonIds.length}`);
  }

  console.log("");
  console.log("========================================");
  console.log("Staff work viewer configs provisioned successfully.");
}

main().catch((error) => {
  console.error("");
  console.error("Staff work viewer config provisioning failed:");
  console.error(error);
  process.exitCode = 1;
});
