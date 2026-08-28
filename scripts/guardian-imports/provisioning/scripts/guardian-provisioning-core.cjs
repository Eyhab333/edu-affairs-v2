const fs = require("node:fs");
const path = require("node:path");
const ExcelJS = require("exceljs");
const {
  applicationDefault,
  cert,
  getApps,
  initializeApp,
} = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { getFirestore } = require("firebase-admin/firestore");

const WORKFLOW_ROOT = path.resolve(__dirname, "..");
const DEFAULT_INPUT_FILE = path.join(
  WORKFLOW_ROOT,
  "inputs",
  "guardian-provisioning.xlsx",
);
const EXPECTED_HEADERS = [
  "displayName",
  "nationalId",
  "email",
  "phone",
  "initialPassword",
];
const APPLY_TOKEN = "APPLY_GUARDIAN_PROVISIONING";

function parseArgs() {
  const args = {};

  for (const arg of process.argv.slice(2)) {
    if (!arg.startsWith("--")) continue;

    const [key, ...valueParts] = arg.slice(2).split("=");
    args[key] = valueParts.join("=");
  }

  return args;
}

function readCellText(cell) {
  const value = cell.value;

  if (value == null) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value).trim();
  }

  if (typeof value === "object") {
    if (typeof value.text === "string") return value.text.trim();
    if (value.result != null) return String(value.result).trim();
    if (Array.isArray(value.richText)) {
      return value.richText.map((item) => item.text || "").join("").trim();
    }
  }

  return String(value).trim();
}

function readString(data, key) {
  const value = data?.[key];
  return typeof value === "string" ? value.trim() : "";
}

function normalizeEmail(value) {
  return value.trim().toLowerCase();
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function getConfig(args = parseArgs()) {
  const input = args.input
    ? path.resolve(process.cwd(), args.input)
    : DEFAULT_INPUT_FILE;

  return {
    args,
    orgId: (args.orgId || process.env.ORG_ID || "takween").trim(),
    inputFile: input,
    sheetName: (args.sheet || "").trim(),
  };
}

async function initializeFirebase(args) {
  if (getApps().length > 0) return;

  const serviceAccountPath =
    args.serviceAccount ||
    process.env.GOOGLE_APPLICATION_CREDENTIALS ||
    path.resolve(process.cwd(), "service-account.json");

  if (fs.existsSync(serviceAccountPath)) {
    // eslint-disable-next-line global-require, import/no-dynamic-require
    const serviceAccount = require(path.resolve(serviceAccountPath));
    initializeApp({ credential: cert(serviceAccount) });
    return;
  }

  initializeApp({ credential: applicationDefault() });
}

async function readExcelRows(config) {
  if (!fs.existsSync(config.inputFile)) {
    throw new Error(`Excel file not found: ${config.inputFile}`);
  }

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(config.inputFile);

  const worksheet = config.sheetName
    ? workbook.getWorksheet(config.sheetName)
    : workbook.worksheets[0];

  if (!worksheet) {
    throw new Error(
      config.sheetName
        ? `Worksheet not found: ${config.sheetName}`
        : "The workbook has no worksheet.",
    );
  }

  const headerErrors = [];
  for (let index = 0; index < EXPECTED_HEADERS.length; index += 1) {
    const actual = readCellText(worksheet.getRow(1).getCell(index + 1));
    const expected = EXPECTED_HEADERS[index];
    if (actual !== expected) {
      headerErrors.push(
        `Column ${index + 1}: expected "${expected}", found "${actual}".`,
      );
    }
  }

  for (let index = EXPECTED_HEADERS.length + 1; index <= worksheet.columnCount; index += 1) {
    const extraHeader = readCellText(worksheet.getRow(1).getCell(index));
    if (extraHeader) {
      headerErrors.push(`Unexpected column ${index}: "${extraHeader}".`);
    }
  }

  if (headerErrors.length > 0) {
    return { worksheetName: worksheet.name, rows: [], headerErrors };
  }

  const rows = [];
  const nationalIdRows = new Map();
  const emailRows = new Map();

  for (let rowNumber = 2; rowNumber <= worksheet.rowCount; rowNumber += 1) {
    const row = worksheet.getRow(rowNumber);
    const values = EXPECTED_HEADERS.map((_, index) =>
      readCellText(row.getCell(index + 1)),
    );

    if (values.every((value) => !value)) continue;

    const [displayName, nationalId, rawEmail, phone, initialPassword] = values;
    const email = normalizeEmail(rawEmail);
    const errors = [];

    if (!displayName) errors.push("displayName is required.");
    if (!nationalId) errors.push("nationalId is required for safe matching.");
    if (!email) {
      errors.push("email is required for guardian account provisioning.");
    } else if (!isValidEmail(email)) {
      errors.push("email is not valid.");
    }

    const importRow = {
      rowNumber,
      displayName,
      nationalId,
      email,
      phone,
      initialPassword,
      errors,
    };
    rows.push(importRow);

    if (nationalId) {
      const matchingRows = nationalIdRows.get(nationalId) || [];
      matchingRows.push(importRow);
      nationalIdRows.set(nationalId, matchingRows);
    }

    if (email) {
      const matchingRows = emailRows.get(email) || [];
      matchingRows.push(importRow);
      emailRows.set(email, matchingRows);
    }
  }

  for (const [nationalId, matchingRows] of nationalIdRows) {
    if (matchingRows.length <= 1) continue;
    matchingRows.forEach((row) => {
      row.errors.push(`nationalId "${nationalId}" is duplicated in rows ${matchingRows.map((item) => item.rowNumber).join(", ")}.`);
    });
  }

  for (const [email, matchingRows] of emailRows) {
    if (matchingRows.length <= 1) continue;
    matchingRows.forEach((row) => {
      row.errors.push(`email "${email}" is duplicated in rows ${matchingRows.map((item) => item.rowNumber).join(", ")}.`);
    });
  }

  return { worksheetName: worksheet.name, rows, headerErrors: [] };
}

async function findAuthUserByEmail(auth, email) {
  try {
    return await auth.getUserByEmail(email);
  } catch (error) {
    if (error?.code === "auth/user-not-found") return null;
    throw error;
  }
}

async function findAuthUserByUid(auth, uid) {
  try {
    return await auth.getUser(uid);
  } catch (error) {
    if (error?.code === "auth/user-not-found") return null;
    throw error;
  }
}

function toSnapshotRecord(snapshot) {
  return {
    id: snapshot.id,
    path: snapshot.ref.path,
    data: snapshot.data() || {},
  };
}

function membershipRole(membership) {
  return readString(membership.data, "roleKey") || readString(membership.data, "role");
}

function isStaffMembership(membership) {
  const role = membershipRole(membership);
  return Boolean(role && role !== "GUARDIAN");
}

function membershipPersonConflict(membership, personId) {
  const membershipPersonId = readString(membership.data, "personId");
  return Boolean(membershipPersonId && membershipPersonId !== personId);
}

async function loadMemberships({ db, orgId, uid, personId }) {
  const directRef = db.doc(`users/${uid}/orgMemberships/${orgId}`);
  const orgMembershipsRef = db.collection(`orgs/${orgId}/memberships`);
  const queries = [
    directRef.get(),
    orgMembershipsRef.where("uid", "==", uid).get(),
  ];

  if (personId) {
    queries.push(orgMembershipsRef.where("personId", "==", personId).get());
  }

  const [directSnapshot, ...querySnapshots] = await Promise.all(queries);
  const byPath = new Map();

  if (directSnapshot.exists) {
    const record = toSnapshotRecord(directSnapshot);
    byPath.set(record.path, record);
  }

  for (const snapshot of querySnapshots) {
    for (const document of snapshot.docs) {
      const record = toSnapshotRecord(document);
      byPath.set(record.path, record);
    }
  }

  return Array.from(byPath.values());
}

function baseResult(row) {
  return {
    rowNumber: row.rowNumber,
    displayName: row.displayName,
    nationalId: row.nationalId,
    email: row.email,
    phone: row.phone,
    action: "BLOCKED",
    uid: "",
    personId: "",
    guardianId: "",
    auth: "NONE",
    user: "NONE",
    person: "NONE",
    guardian: "NONE",
    orgMembership: "NONE",
    conflicts: [...row.errors],
    notes: [],
    internal: {},
  };
}

function profileNeedsUpdate(existing, row) {
  return (
    readString(existing, "displayName") !== row.displayName ||
    (row.phone && readString(existing, "phone") !== row.phone) ||
    readString(existing, "email") !== row.email
  );
}

function guardianNeedsUpdate(existing, uid, personId) {
  return (
    readString(existing, "personId") !== personId ||
    readString(existing, "uid") !== uid ||
    readString(existing, "authUid") !== uid ||
    readString(existing, "userUid") !== uid ||
    existing.isArchived === true
  );
}

async function resolveGuardianRow({ auth, db, orgId, row }) {
  const result = baseResult(row);
  if (result.conflicts.length > 0) return result;

  const [peopleSnapshot, usersByEmailSnapshot, authUser] = await Promise.all([
    db.collection(`orgs/${orgId}/people`).where("nationalId", "==", row.nationalId).limit(3).get(),
    db.collection("users").where("email", "==", row.email).limit(3).get(),
    findAuthUserByEmail(auth, row.email),
  ]);

  const people = peopleSnapshot.docs.map(toSnapshotRecord);
  const usersByEmail = usersByEmailSnapshot.docs.map(toSnapshotRecord);

  if (people.length > 1) {
    result.conflicts.push(`Multiple People match nationalId (${people.length}).`);
  }
  if (usersByEmail.length > 1) {
    result.conflicts.push(`Multiple users documents match email (${usersByEmail.length}).`);
  }
  if (result.conflicts.length > 0) return result;

  let person = people[0] || null;
  let personSource = person ? "NATIONAL_ID" : "";
  let selectedUid = authUser?.uid || "";
  let userRecord = null;

  if (usersByEmail.length === 1) {
    userRecord = usersByEmail[0];
    if (selectedUid && selectedUid !== userRecord.id) {
      result.conflicts.push("Firebase Auth UID does not match users document found by email.");
    }
    selectedUid = selectedUid || userRecord.id;
  }

  if (selectedUid && !userRecord) {
    const directUserSnapshot = await db.doc(`users/${selectedUid}`).get();
    if (directUserSnapshot.exists) userRecord = toSnapshotRecord(directUserSnapshot);
  }

  if (!person && selectedUid) {
    const linkedPersonId = readString(userRecord?.data, "personId");

    if (!linkedPersonId) {
      result.conflicts.push(
        "Email belongs to an existing Auth/user identity but no Person matched nationalId.",
      );
    } else {
      const linkedPersonSnapshot = await db.doc(`orgs/${orgId}/people/${linkedPersonId}`).get();
      if (!linkedPersonSnapshot.exists) {
        result.conflicts.push("Existing users.personId does not resolve to a Person in this org.");
      } else {
        const linkedPerson = toSnapshotRecord(linkedPersonSnapshot);
        const existingNationalId = readString(linkedPerson.data, "nationalId");

        if (existingNationalId && existingNationalId !== row.nationalId) {
          result.conflicts.push("Email-linked Person has a different nationalId.");
        } else {
          person = linkedPerson;
          personSource = "AUTH_USER_PERSON";
        }
      }
    }
  }

  if (result.conflicts.length > 0) return result;

  let usersByPerson = [];
  if (person) {
    const usersByPersonSnapshot = await db
      .collection("users")
      .where("personId", "==", person.id)
      .limit(3)
      .get();
    usersByPerson = usersByPersonSnapshot.docs.map(toSnapshotRecord);

    if (usersByPerson.length > 1) {
      result.conflicts.push(`Multiple users documents reference Person ${person.id}.`);
      return result;
    }

    if (usersByPerson.length === 1) {
      const byPersonUser = usersByPerson[0];
      if (selectedUid && selectedUid !== byPersonUser.id) {
        result.conflicts.push("nationalId Person and email resolve to different user UIDs.");
        return result;
      }
      selectedUid = selectedUid || byPersonUser.id;
      userRecord = userRecord || byPersonUser;
    }
  }

  // A staff account can be represented only by an org membership. Reuse its
  // UID when the Person match is unambiguous; never create a second account
  // for that same employee Person.
  if (person && !selectedUid) {
    const membershipsByPersonSnapshot = await db
      .collection(`orgs/${orgId}/memberships`)
      .where("personId", "==", person.id)
      .limit(10)
      .get();
    const membershipUids = Array.from(
      new Set(
        membershipsByPersonSnapshot.docs
          .map((document) => readString(document.data(), "uid"))
          .filter(Boolean),
      ),
    );

    if (membershipUids.length > 1) {
      result.conflicts.push("Person is linked to multiple membership UIDs.");
      return result;
    }

    if (membershipUids.length === 1) {
      selectedUid = membershipUids[0];
      const membershipUserSnapshot = await db.doc(`users/${selectedUid}`).get();
      if (membershipUserSnapshot.exists) {
        userRecord = toSnapshotRecord(membershipUserSnapshot);
      }
    }
  }

  if (selectedUid && !authUser) {
    const authByUid = await findAuthUserByUid(auth, selectedUid);
    if (!authByUid) {
      result.conflicts.push("users document exists but its Firebase Auth user does not.");
      return result;
    }
    if (normalizeEmail(authByUid.email || "") !== row.email) {
      result.conflicts.push("Existing Firebase Auth email differs from the Excel email.");
      return result;
    }
  }

  if (userRecord) {
    const userPersonId = readString(userRecord.data, "personId");
    if (person && userPersonId && userPersonId !== person.id) {
      result.conflicts.push("users.personId differs from the resolved Person.");
      return result;
    }
    if (readString(userRecord.data, "email") && normalizeEmail(readString(userRecord.data, "email")) !== row.email) {
      result.conflicts.push("Existing users.email differs from the Excel email.");
      return result;
    }
  }

  const needsNewAuth = !selectedUid;
  const needsNewPerson = !person;

  if (needsNewAuth && !person && usersByEmail.length > 0) {
    result.conflicts.push("users document exists for the email but Firebase Auth does not.");
    return result;
  }

  if (needsNewAuth) {
    if (!row.initialPassword) {
      result.conflicts.push(
        "initialPassword is required when a new Firebase Auth user must be created.",
      );
      return result;
    }

    result.uid = "<new-auth-uid>";
    result.personId = "p-parent-<new-auth-uid>";
    result.guardianId = "g-parent-<new-auth-uid>";
    result.auth = "CREATE";
    result.user = "CREATE";
    result.person = needsNewPerson ? "CREATE" : "UPDATE";
    result.guardian = "CREATE";
    result.orgMembership = needsNewPerson ? "CREATE" : "NONE";
    result.action = needsNewPerson ? "CREATE" : "UPDATE";
    result.notes.push(
      needsNewPerson
        ? "A new Auth user will be created using the supplied initialPassword."
        : "A new Auth user will be connected to the existing Person; no staff membership will be created or changed.",
    );
    result.internal = {
      needsNewAuth: true,
      initialPassword: row.initialPassword,
      person,
      userRecord: null,
      guardian: null,
      memberships: [],
    };
    return result;
  }

  const uid = selectedUid;
  const personId = person ? person.id : `p-parent-${uid}`;
  const guardiansSnapshot = await db
    .collection(`orgs/${orgId}/guardians`)
    .where("personId", "==", personId)
    .limit(3)
    .get();
  const guardians = guardiansSnapshot.docs.map(toSnapshotRecord);
  const activeGuardians = guardians.filter((guardian) => guardian.data.isArchived !== true);

  if (activeGuardians.length > 1) {
    result.conflicts.push(`Multiple active Guardians reference Person ${personId}.`);
    return result;
  }
  if (activeGuardians.length === 0 && guardians.length > 0) {
    result.conflicts.push("Only archived Guardian records exist; unarchiving is intentionally not automatic.");
    return result;
  }

  const guardian = activeGuardians[0] || null;
  if (guardian) {
    const guardianUids = ["uid", "authUid", "userUid"]
      .map((key) => readString(guardian.data, key))
      .filter(Boolean);
    if (guardianUids.length > 0 && guardianUids.some((guardianUid) => guardianUid !== uid)) {
      result.conflicts.push("Existing Guardian is bound to a different Firebase Auth UID.");
      return result;
    }
  }

  const memberships = await loadMemberships({ db, orgId, uid, personId });
  for (const membership of memberships) {
    if (membershipPersonConflict(membership, personId)) {
      result.conflicts.push(`Membership ${membership.path} belongs to a different Person.`);
    }
  }
  if (result.conflicts.length > 0) return result;

  const existingStaff = memberships.some(isStaffMembership);
  if (existingStaff && !userRecord) {
    result.conflicts.push(
      "Existing staff membership has no users profile; this workflow will not repair staff profiles.",
    );
    return result;
  }
  const userNeedsCreate = !userRecord;
  const allowProfileUpdate = !existingStaff;
  const personNeedsUpdate = !person || (allowProfileUpdate && profileNeedsUpdate(person.data, row));
  const userNeedsUpdate = userNeedsCreate || (allowProfileUpdate && profileNeedsUpdate(userRecord.data, row));
  const guardianNeedsCreate = !guardian;
  const guardianUpdate = guardian && guardianNeedsUpdate(guardian.data, uid, personId);

  result.uid = uid;
  result.personId = personId;
  result.guardianId = guardian ? guardian.id : `g-parent-${uid}`;
  result.auth = "KEEP_EXISTING";
  result.user = userNeedsCreate ? "CREATE" : userNeedsUpdate ? "UPDATE" : "KEEP_EXISTING";
  result.person = !person ? "CREATE" : personNeedsUpdate ? "UPDATE" : "KEEP_EXISTING";
  result.guardian = guardianNeedsCreate ? "CREATE" : guardianUpdate ? "UPDATE" : "KEEP_EXISTING";
  result.orgMembership = "KEEP_EXISTING";

  if (existingStaff) {
    result.action = "EXISTING_STAFF";
    result.user = userNeedsCreate ? "CREATE" : "KEEP_EXISTING";
    result.person = person ? "KEEP_EXISTING" : "CREATE";
    result.notes.push("Existing staff membership is preserved; no membership or staff profile fields will be overwritten.");
  } else if (
    result.user === "KEEP_EXISTING" &&
    result.person === "KEEP_EXISTING" &&
    result.guardian === "KEEP_EXISTING"
  ) {
    result.action = "KEEP_EXISTING";
  } else {
    result.action = "UPDATE";
  }

  result.notes.push(
    personSource === "AUTH_USER_PERSON"
      ? "Person was reused through the existing Auth user after confirming its nationalId is empty."
      : "Person was resolved by nationalId.",
  );
  result.internal = { needsNewAuth: false, person, userRecord, guardian, memberships, existingStaff };
  return result;
}

async function resolveRows({ config, rows }) {
  await initializeFirebase(config.args);
  const auth = getAuth();
  const db = getFirestore();
  const results = [];

  for (const row of rows) {
    results.push(await resolveGuardianRow({ auth, db, orgId: config.orgId, row }));
  }

  return { auth, db, results };
}

function createUserPayload({ uid, personId, row, existing, now }) {
  return {
    uid,
    displayName: row.displayName,
    email: row.email,
    phone: row.phone || readString(existing, "phone"),
    photoUrl: readString(existing, "photoUrl"),
    personId,
    isDisabled: existing?.isDisabled === true,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
}

function createPersonPayload({ personId, row, existing, now }) {
  return {
    id: personId,
    displayName: row.displayName,
    nationalId: row.nationalId,
    phone: row.phone || readString(existing, "phone"),
    email: row.email,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
}

function createGuardianPayload({ guardianId, orgId, personId, uid, existing, now }) {
  return {
    id: guardianId,
    orgId,
    personId,
    uid,
    authUid: uid,
    userUid: uid,
    isArchived: false,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
}

function createGuardianMembershipPayload({ orgId, uid, personId, now }) {
  return {
    id: orgId,
    uid,
    personId,
    orgId,
    role: "GUARDIAN",
    roleKey: "GUARDIAN",
    title: "ولي أمر",
    department: "",
    scopes: {
      schoolIds: [],
      gradeIds: [],
      classIds: [],
      subjectKeys: [],
      routeIds: [],
      canAccessAllSchools: false,
    },
    permissions: {},
    scopeType: "ORG",
    scopeId: orgId,
    isActive: true,
    createdAt: now,
    updatedAt: now,
  };
}

async function applyGuardianResult({ auth, db, orgId, result }) {
  if (result.action === "BLOCKED" || result.action === "KEEP_EXISTING") {
    return { rowNumber: result.rowNumber, action: result.action, applied: false, error: "" };
  }

  const row = {
    rowNumber: result.rowNumber,
    displayName: result.displayName,
    nationalId: result.nationalId,
    email: result.email,
    phone: result.phone,
    initialPassword: result.internal.initialPassword || "",
  };
  const now = Date.now();
  let uid = result.uid;
  let personId = result.personId;
  let guardianId = result.guardianId;
  let authCreated = false;

  try {
    if (result.internal.needsNewAuth) {
      const authUser = await auth.createUser({
        email: row.email,
        displayName: row.displayName,
        password: row.initialPassword,
        disabled: false,
      });
      authCreated = true;
      uid = authUser.uid;
      personId = result.internal.person ? result.internal.person.id : `p-parent-${uid}`;
      guardianId = `g-parent-${uid}`;
    }

    const batch = db.batch();
    const existingPerson = result.internal.person?.data;
    const existingUser = result.internal.userRecord?.data;
    const existingGuardian = result.internal.guardian?.data;
    const isStaff = result.internal.existingStaff === true;

    if (result.user === "CREATE" || (result.user === "UPDATE" && !isStaff)) {
      batch.set(
        db.doc(`users/${uid}`),
        createUserPayload({ uid, personId, row, existing: existingUser, now }),
        { merge: true },
      );
    }

    if (result.person === "CREATE" || (result.person === "UPDATE" && !isStaff)) {
      batch.set(
        db.doc(`orgs/${orgId}/people/${personId}`),
        createPersonPayload({ personId, row, existing: existingPerson, now }),
        { merge: true },
      );
    }

    if (result.guardian === "CREATE" || result.guardian === "UPDATE") {
      batch.set(
        db.doc(`orgs/${orgId}/guardians/${guardianId}`),
        createGuardianPayload({
          guardianId,
          orgId,
          personId,
          uid,
          existing: existingGuardian,
          now,
        }),
        { merge: true },
      );
    }

    if (result.orgMembership === "CREATE") {
      batch.set(
        db.doc(`users/${uid}/orgMemberships/${orgId}`),
        createGuardianMembershipPayload({ orgId, uid, personId, now }),
        { merge: true },
      );
    }

    await batch.commit();
    return { rowNumber: result.rowNumber, action: result.action, applied: true, error: "", uid, personId, guardianId };
  } catch (error) {
    return {
      rowNumber: result.rowNumber,
      action: "BLOCKED",
      applied: false,
      error: error instanceof Error ? error.message : String(error),
      authCreated,
    };
  }
}

function summarize(results) {
  return results.reduce(
    (summary, result) => {
      summary.total += 1;
      summary[result.action] = (summary[result.action] || 0) + 1;
      return summary;
    },
    { total: 0, CREATE: 0, UPDATE: 0, KEEP_EXISTING: 0, EXISTING_STAFF: 0, BLOCKED: 0 },
  );
}

function printResults(title, results) {
  console.log(`\n${title}`);
  console.table(
    results.map((result) => ({
      row: result.rowNumber,
      name: result.displayName,
      nationalId: result.nationalId,
      email: result.email,
      action: result.action,
      uid: result.uid,
      personId: result.personId,
      guardianId: result.guardianId,
      conflicts: result.conflicts?.length || 0,
    })),
  );
  console.log(summarize(results));
}

module.exports = {
  APPLY_TOKEN,
  DEFAULT_INPUT_FILE,
  EXPECTED_HEADERS,
  getConfig,
  parseArgs,
  printResults,
  readExcelRows,
  resolveRows,
  applyGuardianResult,
};
