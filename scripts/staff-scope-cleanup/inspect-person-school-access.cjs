const fs = require("node:fs");
const path = require("node:path");
const admin = require("firebase-admin");

const ORG_ID = "takween";
const PERSON_ID = "p-f-alhamaad";
const TARGET_SCHOOL_ID = "mrb-girls";

const serviceAccountPath = path.resolve(
  __dirname,
  "../service-account.json",
);

if (!fs.existsSync(serviceAccountPath)) {
  throw new Error(
    `Service account not found: ${serviceAccountPath}`,
  );
}

const serviceAccount = JSON.parse(
  fs.readFileSync(serviceAccountPath, "utf8"),
);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId: serviceAccount.project_id,
});

const db = admin.firestore();

function valueIncludesSchool(value) {
  if (value === TARGET_SCHOOL_ID) return true;

  if (Array.isArray(value)) {
    return value.some((item) => item === TARGET_SCHOOL_ID);
  }

  if (value && typeof value === "object") {
    return Object.values(value).some((item) =>
      valueIncludesSchool(item),
    );
  }

  return false;
}

function printDocument(label, doc) {
  console.log("");
  console.log(`--- ${label} ---`);
  console.log(`Path: ${doc.ref.path}`);
  console.dir(doc.data(), {
    depth: null,
    colors: true,
  });
}

async function inspectMemberships() {
  console.log("");
  console.log("========================================");
  console.log("1. ORG MEMBERSHIPS");
  console.log("========================================");

  const snapshot = await db
    .collectionGroup("orgMemberships")
    .where("personId", "==", PERSON_ID)
    .get();

  const orgMemberships = snapshot.docs.filter((doc) => {
    const data = doc.data();
    return data.orgId === ORG_ID || doc.id === ORG_ID;
  });

  if (!orgMemberships.length) {
    console.log("No orgMembership documents found.");
    return;
  }

  for (const doc of orgMemberships) {
    const data = doc.data();

    const scopeSchoolIds = Array.isArray(
      data?.scopes?.schoolIds,
    )
      ? data.scopes.schoolIds
      : [];

    const matches =
      data.scopeId === TARGET_SCHOOL_ID ||
      scopeSchoolIds.includes(TARGET_SCHOOL_ID) ||
      valueIncludesSchool(data);

    console.log("");
    console.log(
      matches
        ? ">>> TARGET SCHOOL RELATION FOUND"
        : "Membership found, but no target-school relation detected.",
    );

    printDocument("ORG MEMBERSHIP", doc);

    console.log("");
    console.log("Important school fields:");
    console.log({
      scopeType: data.scopeType ?? null,
      scopeId: data.scopeId ?? null,
      schoolIds: scopeSchoolIds,
      canAccessAllSchools:
        data?.scopes?.canAccessAllSchools ?? null,
      roleKey: data.roleKey ?? data.role ?? null,
      isActive:
        data.isActive ?? data.active ?? null,
    });
  }
}

async function inspectOperationalAssignments() {
  console.log("");
  console.log("========================================");
  console.log("2. OPERATIONAL ASSIGNMENTS");
  console.log("========================================");

  const snapshot = await db
    .collection(
      `orgs/${ORG_ID}/operationalAssignments`,
    )
    .where("actorPersonId", "==", PERSON_ID)
    .get();

  const matching = snapshot.docs.filter((doc) =>
    valueIncludesSchool(doc.data()),
  );

  if (!matching.length) {
    console.log(
      `No operational assignments related to ${TARGET_SCHOOL_ID}.`,
    );
    return;
  }

  for (const doc of matching) {
    printDocument(
      "OPERATIONAL ASSIGNMENT",
      doc,
    );
  }
}

async function inspectTeacherAssignments() {
  console.log("");
  console.log("========================================");
  console.log("3. TEACHER ASSIGNMENTS");
  console.log("========================================");

  const snapshot = await db
    .collection(
      `orgs/${ORG_ID}/teacherAssignments`,
    )
    .where("teacherPersonId", "==", PERSON_ID)
    .get();

  const matching = snapshot.docs.filter((doc) =>
    valueIncludesSchool(doc.data()),
  );

  if (!matching.length) {
    console.log(
      `No teacher assignments related to ${TARGET_SCHOOL_ID}.`,
    );
    return;
  }

  for (const doc of matching) {
    printDocument("TEACHER ASSIGNMENT", doc);

    const assignmentId = doc.id;

    const linksSnapshot = await db
      .collection(
        `orgs/${ORG_ID}/teacherAssignmentClassLinks`,
      )
      .where("assignmentId", "==", assignmentId)
      .get();

    const links = linksSnapshot.docs.filter(
      (linkDoc) =>
        valueIncludesSchool(linkDoc.data()),
    );

    if (links.length) {
      console.log("");
      console.log(
        `Class links for assignment ${assignmentId}:`,
      );

      for (const linkDoc of links) {
        printDocument(
          "TEACHER ASSIGNMENT CLASS LINK",
          linkDoc,
        );
      }
    }
  }
}

async function inspectSupervisionScopes() {
  console.log("");
  console.log("========================================");
  console.log("4. PERSON SUPERVISION SCOPES");
  console.log("========================================");

  const snapshot = await db
    .collection(
      `orgs/${ORG_ID}/personSupervisionScopes`,
    )
    .where("personId", "==", PERSON_ID)
    .get();

  const matching = snapshot.docs.filter((doc) =>
    valueIncludesSchool(doc.data()),
  );

  if (!matching.length) {
    console.log(
      `No personSupervisionScopes related to ${TARGET_SCHOOL_ID}.`,
    );
    return;
  }

  for (const doc of matching) {
    printDocument(
      "PERSON SUPERVISION SCOPE",
      doc,
    );
  }
}

async function main() {
  console.log("");
  console.log(
    "PERSON / SCHOOL ACCESS INSPECTION — READ ONLY",
  );
  console.log("========================================");
  console.log(`Org: ${ORG_ID}`);
  console.log(`Person: ${PERSON_ID}`);
  console.log(
    `Target school to remove: ${TARGET_SCHOOL_ID}`,
  );

  const personSnap = await db
    .doc(
      `orgs/${ORG_ID}/people/${PERSON_ID}`,
    )
    .get();

  if (!personSnap.exists) {
    throw new Error(
      `Person not found: ${PERSON_ID}`,
    );
  }

  console.log(
    `Name: ${
      personSnap.data()?.displayName ||
      PERSON_ID
    }`,
  );

  await inspectMemberships();
  await inspectOperationalAssignments();
  await inspectTeacherAssignments();
  await inspectSupervisionScopes();

  console.log("");
  console.log("========================================");
  console.log("INSPECTION COMPLETE");
  console.log("No writes were performed.");
  console.log("========================================");
}

main()
  .catch((error) => {
    console.error("");
    console.error("Inspection failed:");
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await admin.app().delete();
  });