/* eslint-disable no-console */

const fs = require("fs");
const path = require("path");
const admin = require("firebase-admin");

function getArg(name, fallback = "") {
  const prefix = `--${name}=`;
  const match = process.argv.find((arg) => arg.startsWith(prefix));

  return match ? match.slice(prefix.length).trim() : fallback;
}

const ORG_ID = getArg("org", process.env.ORG_ID || "takween");
const INPUT_EMAIL = getArg("email", process.env.USER_EMAIL || "");
const INPUT_UID = getArg("uid", process.env.USER_UID || "");

const EMAIL = INPUT_EMAIL.trim().toLowerCase();
const UID = INPUT_UID.trim();

function resolveServiceAccountPath() {
  const candidates = [
    process.env.GOOGLE_APPLICATION_CREDENTIALS,
    path.resolve(process.cwd(), "service-account.json"),
    path.resolve(process.cwd(), "scripts", "service-account.json"),
    path.resolve(__dirname, "service-account.json"),
  ].filter(Boolean);

  const found = candidates.find((candidate) => fs.existsSync(candidate));

  if (!found) {
    throw new Error(
      [
        "service-account.json not found.",
        "Checked:",
        ...candidates.map((candidate) => `- ${candidate}`),
      ].join("\n"),
    );
  }

  return found;
}

function initAdmin() {
  if (admin.apps.length > 0) return;

  const serviceAccountPath = resolveServiceAccountPath();

  const serviceAccount = JSON.parse(
    fs.readFileSync(serviceAccountPath, "utf8"),
  );

  if (
    serviceAccount.type !== "service_account" ||
    !serviceAccount.project_id ||
    !serviceAccount.client_email ||
    !serviceAccount.private_key
  ) {
    throw new Error(`Invalid service account file: ${serviceAccountPath}`);
  }

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    projectId: serviceAccount.project_id,
  });

  console.log("Firebase Admin initialized:", {
    projectId: serviceAccount.project_id,
    serviceAccountPath,
  });
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function dataWithId(doc) {
  return {
    id: doc.id,
    path: doc.ref.path,
    ...doc.data(),
  };
}

function serialize(value) {
  if (value === null || value === undefined) {
    return value;
  }

  if (typeof value?.toDate === "function") {
    return value.toDate().toISOString();
  }

  if (value?.path && value?.firestore) {
    return value.path;
  }

  if (Array.isArray(value)) {
    return value.map(serialize);
  }

  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, serialize(item)]),
    );
  }

  return value;
}

function compact(value) {
  return JSON.stringify(serialize(value), null, 2);
}

function uniqueByPath(rows) {
  return Array.from(
    new Map(
      rows
        .filter(Boolean)
        .map((row) => [row.path, row]),
    ).values(),
  );
}

async function safeGetDoc(ref) {
  const snap = await ref.get();

  return snap.exists ? dataWithId(snap) : null;
}

async function queryRows(collectionRef, field, operator, value) {
  if (value === undefined || value === null || value === "") {
    return [];
  }

  const snap = await collectionRef
    .where(field, operator, value)
    .get();

  return snap.docs.map(dataWithId);
}

async function findAuthUser() {
  try {
    if (UID) {
      return await admin.auth().getUser(UID);
    }

    if (EMAIL) {
      return await admin.auth().getUserByEmail(EMAIL);
    }

    return null;
  } catch (error) {
    if (error?.code === "auth/user-not-found") {
      return null;
    }

    throw error;
  }
}

function summarizeAuthUser(user) {
  if (!user) return null;

  return {
    uid: user.uid,
    email: user.email,
    displayName: user.displayName,
    disabled: user.disabled,
    emailVerified: user.emailVerified,
    phoneNumber: user.phoneNumber,
    customClaims: user.customClaims || {},
    providerData: user.providerData.map((provider) => ({
      providerId: provider.providerId,
      uid: provider.uid,
      email: provider.email,
      displayName: provider.displayName,
      phoneNumber: provider.phoneNumber,
    })),
    metadata: {
      creationTime: user.metadata.creationTime,
      lastSignInTime: user.metadata.lastSignInTime,
      lastRefreshTime: user.metadata.lastRefreshTime,
    },
  };
}

async function findUsers(db, authUser) {
  const usersRef = db.collection("users");
  const matches = [];

  const uid = authUser?.uid || UID;
  const email = EMAIL || normalizeEmail(authUser?.email);

  if (uid) {
    matches.push(await safeGetDoc(usersRef.doc(uid)));
  }

  if (email) {
    matches.push(
      ...(await queryRows(usersRef, "email", "==", email)),
    );

    if (!matches.filter(Boolean).length) {
      const allUsersSnap = await usersRef.get();

      matches.push(
        ...allUsersSnap.docs
          .map(dataWithId)
          .filter(
            (user) => normalizeEmail(user.email) === email,
          ),
      );
    }
  }

  return uniqueByPath(matches);
}

async function loadUserOrgMemberships(db, userId) {
  const membershipsRef = db
    .collection("users")
    .doc(userId)
    .collection("orgMemberships");

  const allSnap = await membershipsRef.get();
  const selectedOrg = await safeGetDoc(
    membershipsRef.doc(ORG_ID),
  );

  return uniqueByPath([
    selectedOrg,
    ...allSnap.docs.map(dataWithId),
  ]);
}

async function findPeople(
  db,
  users,
  userMemberships,
  authUser,
) {
  const peopleRef = db.collection(
    `orgs/${ORG_ID}/people`,
  );

  const matches = [];
  const personIds = new Set();

  for (const user of users) {
    if (user.personId) {
      personIds.add(user.personId);
    }
  }

  for (const membership of userMemberships) {
    if (membership.personId) {
      personIds.add(membership.personId);
    }
  }

  for (const personId of personIds) {
    matches.push(
      await safeGetDoc(peopleRef.doc(personId)),
    );
  }

  const email = EMAIL || normalizeEmail(authUser?.email);

  if (email) {
    matches.push(
      ...(await queryRows(peopleRef, "email", "==", email)),
    );

    if (!matches.filter(Boolean).length) {
      const allPeopleSnap = await peopleRef.get();

      matches.push(
        ...allPeopleSnap.docs
          .map(dataWithId)
          .filter(
            (person) =>
              normalizeEmail(person.email) === email,
          ),
      );
    }
  }

  return uniqueByPath(matches);
}

async function loadOrgMemberships(db, uid, personIds) {
  const membershipsRef = db.collection(
    `orgs/${ORG_ID}/memberships`,
  );

  const matches = [];

  if (uid) {
    matches.push(
      await safeGetDoc(membershipsRef.doc(uid)),
    );

    matches.push(
      ...(await queryRows(
        membershipsRef,
        "uid",
        "==",
        uid,
      )),
    );
  }

  for (const personId of personIds) {
    matches.push(
      await safeGetDoc(membershipsRef.doc(personId)),
    );

    matches.push(
      ...(await queryRows(
        membershipsRef,
        "personId",
        "==",
        personId,
      )),
    );
  }

  return uniqueByPath(matches);
}

async function loadOperationalMemberships(
  db,
  personIds,
) {
  const ref = db.collection(
    `orgs/${ORG_ID}/operationalMemberships`,
  );

  const matches = [];

  for (const personId of personIds) {
    matches.push(
      ...(await queryRows(
        ref,
        "personId",
        "==",
        personId,
      )),
    );
  }

  return uniqueByPath(matches);
}

async function loadOperationalAssignments(
  db,
  personIds,
) {
  const ref = db.collection(
    `orgs/${ORG_ID}/operationalAssignments`,
  );

  const asActor = [];
  const asTarget = [];

  for (const personId of personIds) {
    asActor.push(
      ...(await queryRows(
        ref,
        "actorPersonId",
        "==",
        personId,
      )),
    );

    asActor.push(
      ...(await queryRows(
        ref,
        "personId",
        "==",
        personId,
      )),
    );

    asTarget.push(
      ...(await queryRows(
        ref,
        "targetPersonIds",
        "array-contains",
        personId,
      )),
    );
  }

  return {
    asActor: uniqueByPath(asActor),
    asTarget: uniqueByPath(asTarget),
  };
}

async function loadTeacherAssignments(db, personIds) {
  const ref = db.collection(
    `orgs/${ORG_ID}/teacherAssignments`,
  );

  const asTeacher = [];
  const asSupervisor = [];

  for (const personId of personIds) {
    asTeacher.push(
      ...(await queryRows(
        ref,
        "teacherPersonId",
        "==",
        personId,
      )),
    );

    asSupervisor.push(
      ...(await queryRows(
        ref,
        "supervisorPersonId",
        "==",
        personId,
      )),
    );
  }

  return {
    asTeacher: uniqueByPath(asTeacher),
    asSupervisor: uniqueByPath(asSupervisor),
  };
}

async function loadTeacherAssignmentClassLinks(
  db,
  assignments,
) {
  const ref = db.collection(
    `orgs/${ORG_ID}/teacherAssignmentClassLinks`,
  );

  const matches = [];

  for (const assignment of assignments) {
    matches.push(
      ...(await queryRows(
        ref,
        "teacherAssignmentId",
        "==",
        assignment.id,
      )),
    );
  }

  return uniqueByPath(matches);
}

async function loadGuardianLinks(db, personIds) {
  const ref = db.collection(
    `orgs/${ORG_ID}/guardianLinks`,
  );

  const matches = [];

  for (const personId of personIds) {
    matches.push(
      ...(await queryRows(
        ref,
        "guardianPersonId",
        "==",
        personId,
      )),
    );

    matches.push(
      ...(await queryRows(
        ref,
        "guardianId",
        "==",
        personId,
      )),
    );
  }

  return uniqueByPath(matches);
}

function printSection(title, value) {
  console.log(
    "\n==================================================",
  );
  console.log(title);
  console.log(
    "==================================================",
  );
  console.log(compact(value));
}

function printRows(title, rows) {
  printSection(
    `${title} (${rows.length})`,
    rows.length ? rows : "لا توجد نتائج",
  );
}

function buildDiagnostics({
  authUser,
  users,
  userOrgMemberships,
  people,
  orgMemberships,
}) {
  const diagnostics = [];

  const expectedEmail =
    EMAIL || normalizeEmail(authUser?.email);

  if (!authUser) {
    diagnostics.push(
      "❌ لا يوجد حساب Firebase Auth مطابق.",
    );
  }

  if (!users.length) {
    diagnostics.push(
      "❌ لا يوجد مستند مطابق داخل users.",
    );
  }

  if (
    authUser &&
    users.length &&
    !users.some((user) => user.id === authUser.uid)
  ) {
    diagnostics.push(
      "⚠️ حساب Auth موجود، لكن لا يوجد users/{uid} بنفس uid.",
    );
  }

  if (!userOrgMemberships.length) {
    diagnostics.push(
      `❌ لا توجد عضوية تحت users/{uid}/orgMemberships/${ORG_ID}.`,
    );
  } else if (
    !userOrgMemberships.some(
      (membership) =>
        membership.id === ORG_ID ||
        membership.orgId === ORG_ID,
    )
  ) {
    diagnostics.push(
      `⚠️ توجد orgMemberships، لكن لم أجد عضوية المؤسسة ${ORG_ID}.`,
    );
  }

  const inactiveUserMemberships =
    userOrgMemberships.filter(
      (membership) =>
        membership.isActive === false ||
        membership.active === false,
    );

  if (inactiveUserMemberships.length) {
    diagnostics.push(
      "⚠️ توجد عضوية مستخدم غير نشطة.",
    );
  }

  if (!people.length) {
    diagnostics.push(
      `❌ لا يوجد person داخل orgs/${ORG_ID}/people.`,
    );
  }

  const missingPersonLinks = users.filter(
    (user) => !user.personId,
  );

  if (missingPersonLinks.length) {
    diagnostics.push(
      "⚠️ يوجد user بدون personId.",
    );
  }

  if (!orgMemberships.length) {
    diagnostics.push(
      `❌ لا توجد عضوية داخل orgs/${ORG_ID}/memberships مرتبطة بالمستخدم أو الشخص.`,
    );
  }

  const inactiveOrgMemberships =
    orgMemberships.filter(
      (membership) =>
        membership.isActive === false ||
        membership.active === false,
    );

  if (inactiveOrgMemberships.length) {
    diagnostics.push(
      "⚠️ توجد عضوية تنظيمية غير نشطة.",
    );
  }

  const emailMismatches = [
    ...(authUser
      ? [
          {
            source: "Auth",
            email: authUser.email,
          },
        ]
      : []),

    ...users.map((user) => ({
      source: user.path,
      email: user.email,
    })),

    ...people.map((person) => ({
      source: person.path,
      email: person.email,
    })),
  ].filter(
    (item) =>
      item.email &&
      normalizeEmail(item.email) !== expectedEmail,
  );

  if (expectedEmail && emailMismatches.length) {
    diagnostics.push({
      message:
        "⚠️ يوجد اختلاف في البريد بين الطبقات.",
      emailMismatches,
    });
  }

  if (users.length > 1) {
    diagnostics.push(
      "⚠️ يوجد أكثر من user مطابق لنفس البريد.",
    );
  }

  if (people.length > 1) {
    diagnostics.push(
      "⚠️ يوجد أكثر من person مطابق أو مرتبط.",
    );
  }

  if (!diagnostics.length) {
    diagnostics.push(
      "✅ لم تظهر مشكلة ربط أساسية في الطبقات المفحوصة.",
    );
  }

  return diagnostics;
}

async function main() {
  if (!EMAIL && !UID) {
    console.error("يجب تمرير البريد أو uid.");

    console.error(
      "مثال: node scripts/inspect-user-access.cjs --email=a.brakat@qz.org.sa",
    );

    console.error(
      "أو: node scripts/inspect-user-access.cjs --uid=FIREBASE_UID",
    );

    process.exit(1);
  }

  initAdmin();

  const db = admin.firestore();

  const authUser = await findAuthUser();
  const users = await findUsers(db, authUser);

  const userMembershipResults = await Promise.all(
    users.map((user) =>
      loadUserOrgMemberships(db, user.id),
    ),
  );

  const userOrgMemberships = uniqueByPath(
    userMembershipResults.flat(),
  );

  const people = await findPeople(
    db,
    users,
    userOrgMemberships,
    authUser,
  );

  const personIds = Array.from(
    new Set([
      ...people.map((person) => person.id),

      ...users
        .map((user) => user.personId)
        .filter(Boolean),

      ...userOrgMemberships
        .map((membership) => membership.personId)
        .filter(Boolean),
    ]),
  );

  const uid =
    authUser?.uid ||
    UID ||
    users[0]?.id ||
    "";

  const [
    orgMemberships,
    operationalMemberships,
    operationalAssignments,
    teacherAssignments,
    guardianLinks,
  ] = await Promise.all([
    loadOrgMemberships(db, uid, personIds),
    loadOperationalMemberships(db, personIds),
    loadOperationalAssignments(db, personIds),
    loadTeacherAssignments(db, personIds),
    loadGuardianLinks(db, personIds),
  ]);

  const allTeacherAssignments = uniqueByPath([
    ...teacherAssignments.asTeacher,
    ...teacherAssignments.asSupervisor,
  ]);

  const teacherAssignmentClassLinks =
    await loadTeacherAssignmentClassLinks(
      db,
      allTeacherAssignments,
    );

  console.log(
    "\nRunning user access inspect only. No writes will be performed.",
  );

  console.log(
    compact({
      orgId: ORG_ID,
      requestedEmail: EMAIL || null,
      requestedUid: UID || null,
      resolvedUid: uid || null,
      resolvedPersonIds: personIds,
    }),
  );

  printSection(
    "Firebase Auth",
    summarizeAuthUser(authUser) || "غير موجود",
  );

  printRows("Firestore users", users);

  printRows(
    "User orgMemberships",
    userOrgMemberships,
  );

  printRows("Org people", people);

  printRows(
    "Org memberships",
    orgMemberships,
  );

  printRows(
    "Legacy operationalMemberships",
    operationalMemberships,
  );

  printRows(
    "Operational assignments as actor",
    operationalAssignments.asActor,
  );

  printRows(
    "Operational assignments as target",
    operationalAssignments.asTarget,
  );

  printRows(
    "Teacher assignments as teacher",
    teacherAssignments.asTeacher,
  );

  printRows(
    "Teacher assignments as supervisor",
    teacherAssignments.asSupervisor,
  );

  printRows(
    "Teacher assignment class links",
    teacherAssignmentClassLinks,
  );

  printRows(
    "Guardian links",
    guardianLinks,
  );

  const diagnostics = buildDiagnostics({
    authUser,
    users,
    userOrgMemberships,
    people,
    orgMemberships,
  });

  printSection("Diagnostics", diagnostics);

  console.log(
    "\n✅ انتهى الفحص بدون أي كتابة.",
  );
}

main().catch((error) => {
  console.error("\n❌ فشل الفحص:");
  console.error(error);
  process.exit(1);
});