const admin = require("firebase-admin");
const fs = require("node:fs");
const path = require("node:path");

const ORG_DEFAULT = "takween";
const EXPECTED_ROLE = "platform_owner";

const DIRECTORY = __dirname;
const REPO_ROOT = path.resolve(DIRECTORY, "..", "..");
const SERVICE_ACCOUNT_PATH = path.join(REPO_ROOT, "scripts", "service-account.json");
const CONFIG_PATH = path.join(DIRECTORY, "targets.local.json");
const REPORTS_DIR = path.join(DIRECTORY, "reports");

const PLATFORM_OWNER_PERMISSIONS = Object.freeze({
  manageAcademicYears: true,
  manageAssignments: true,
  manageCases: true,
  manageClasses: true,
  manageDirectory: true,
  manageDisplay: true,
  manageEvaluations: true,
  manageGrades: true,
  manageOrg: true,
  manageSchools: true,
  manageSubjects: true,
  manageUsers: true,
  sendNotifications: true,
});

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function bool(value, fallback = false) {
  return typeof value === "boolean" ? value : fallback;
}

function safeCreatedAt(snapshot, fallback) {
  const value = snapshot?.data()?.createdAt;
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function isAuthUserNotFound(error) {
  return (
    error &&
    typeof error === "object" &&
    (error.code === "auth/user-not-found" ||
      error.errorInfo?.code === "auth/user-not-found")
  );
}

function initAdmin() {
  if (!fs.existsSync(SERVICE_ACCOUNT_PATH)) {
    throw new Error(
      `Service account not found: ${SERVICE_ACCOUNT_PATH}\n` +
        "Expected file: scripts/service-account.json",
    );
  }

  const serviceAccount = JSON.parse(
    fs.readFileSync(SERVICE_ACCOUNT_PATH, "utf8"),
  );

  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      projectId: serviceAccount.project_id,
    });
  }

  return {
    auth: admin.auth(),
    db: admin.firestore(),
    projectId: serviceAccount.project_id,
  };
}

function loadConfig() {
  if (!fs.existsSync(CONFIG_PATH)) {
    throw new Error(
      [
        `Local config not found: ${CONFIG_PATH}`,
        "Copy targets.local.example.json to targets.local.json, then fill the missing values.",
      ].join("\n"),
    );
  }

  const raw = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
  const orgId = text(raw.orgId) || ORG_DEFAULT;
  const targets = Array.isArray(raw.targets) ? raw.targets : [];

  if (!targets.length) {
    throw new Error("targets.local.json must contain at least one target.");
  }

  const normalized = targets.map((target, index) => {
    const email = text(target.email).toLowerCase();
    const displayName = text(target.displayName);
    const nationalId = text(target.nationalId);
    const title = text(target.title);
    const expectedUid = text(target.expectedUid);
    const key = text(target.key) || `target-${index + 1}`;

    const errors = [];

    if (!email || !email.includes("@")) errors.push("valid email is required");
    if (!displayName || /REPLACE|PUT_/i.test(displayName)) {
      errors.push("displayName must be filled");
    }
    if (!/^\d{10}$/.test(nationalId)) {
      errors.push("nationalId must be exactly 10 digits");
    }
    if (!title) errors.push("title is required");

    if (errors.length) {
      throw new Error(`${key}: ${errors.join("; ")}`);
    }

    return {
      key,
      email,
      displayName,
      nationalId,
      title,
      expectedUid,
      createIfMissing: bool(target.createIfMissing, true),
      resetPasswordOnApply: bool(target.resetPasswordOnApply, true),
      expectGuardianAccess: bool(target.expectGuardianAccess, false),
    };
  });

  const emails = normalized.map((item) => item.email);
  if (new Set(emails).size !== emails.length) {
    throw new Error("Duplicate target email in targets.local.json.");
  }

  return { orgId, targets: normalized };
}

async function getAuthUserByEmail(auth, email) {
  try {
    return await auth.getUserByEmail(email);
  } catch (error) {
    if (isAuthUserNotFound(error)) return null;
    throw error;
  }
}

async function findPersonIds(db, orgId, field, value) {
  if (!value) return [];

  const snapshot = await db
    .collection(`orgs/${orgId}/people`)
    .where(field, "==", value)
    .limit(3)
    .get();

  return snapshot.docs.map((doc) => doc.id);
}

function resolveOrgIdFromGuardianRef(ref) {
  const orgRef = ref?.parent?.parent;
  return orgRef && orgRef.parent?.id === "orgs" ? orgRef.id : "";
}

async function inspectGuardianLinks(db, orgId, personId, uid) {
  if (!personId) {
    return {
      guardianRecords: 0,
      guardianLinks: 0,
      guardianIds: [],
    };
  }

  const guardiansSnapshot = await db
    .collectionGroup("guardians")
    .where("personId", "==", personId)
    .get();

  const guardians = guardiansSnapshot.docs.filter(
    (doc) => resolveOrgIdFromGuardianRef(doc.ref) === orgId,
  );

  let guardianLinks = 0;
  const guardianIds = [];

  for (const guardian of guardians) {
    guardianIds.push(guardian.id);

    const links = await db
      .collection(`orgs/${orgId}/guardianLinks`)
      .where("guardianId", "==", guardian.id)
      .get();

    guardianLinks += links.docs.filter((doc) => {
      const data = doc.data() || {};
      const guardianUid = text(data.guardianUid);
      return !guardianUid || !uid || guardianUid === uid;
    }).length;
  }

  return {
    guardianRecords: guardians.length,
    guardianLinks,
    guardianIds,
  };
}

function choosePersonId({
  userPersonId,
  nationalIdPersonIds,
  emailPersonIds,
}) {
  const blockingIssues = [];

  if (nationalIdPersonIds.length > 1) {
    blockingIssues.push(
      `Multiple people found with the same nationalId (${nationalIdPersonIds.length}).`,
    );
  }

  if (emailPersonIds.length > 1) {
    blockingIssues.push(
      `Multiple people found with the same email (${emailPersonIds.length}).`,
    );
  }

  const nationalIdPersonId =
    nationalIdPersonIds.length === 1 ? nationalIdPersonIds[0] : "";
  const emailPersonId = emailPersonIds.length === 1 ? emailPersonIds[0] : "";

  const distinct = Array.from(
    new Set(
      [userPersonId, nationalIdPersonId, emailPersonId].filter(Boolean),
    ),
  );

  if (distinct.length > 1) {
    blockingIssues.push(
      [
        "Person identity conflict.",
        `user.personId=${userPersonId || "none"}`,
        `nationalId match=${nationalIdPersonId || "none"}`,
        `email match=${emailPersonId || "none"}`,
      ].join(" "),
    );
  }

  return {
    personId: distinct[0] || "",
    userPersonId,
    nationalIdPersonId,
    emailPersonId,
    blockingIssues,
  };
}

async function inspectTarget(context, config, target) {
  const { auth, db } = context;
  const { orgId } = config;

  const authUser = await getAuthUserByEmail(auth, target.email);
  const uid = authUser?.uid || "";

  let userSnapshot = null;
  let userData = {};
  let membershipSnapshot = null;
  let membershipData = {};

  if (uid) {
    userSnapshot = await db.doc(`users/${uid}`).get();
    userData = userSnapshot.exists ? userSnapshot.data() || {} : {};

    membershipSnapshot = await db
      .doc(`users/${uid}/orgMemberships/${orgId}`)
      .get();
    membershipData = membershipSnapshot.exists
      ? membershipSnapshot.data() || {}
      : {};
  }

  const userPersonId = text(userData.personId);

  const [nationalIdPersonIds, emailPersonIds] = await Promise.all([
    findPersonIds(db, orgId, "nationalId", target.nationalId),
    findPersonIds(db, orgId, "email", target.email),
  ]);

  const identity = choosePersonId({
    userPersonId,
    nationalIdPersonIds,
    emailPersonIds,
  });

  const blockingIssues = [...identity.blockingIssues];

  if (target.expectedUid && uid && target.expectedUid !== uid) {
    blockingIssues.push(
      `Expected UID ${target.expectedUid}, but Firebase Auth resolved ${uid}.`,
    );
  }

  if (!authUser && !target.createIfMissing) {
    blockingIssues.push(
      "Firebase Auth user does not exist and createIfMissing=false.",
    );
  }

  const personId = identity.personId;
  let personSnapshot = null;
  let personData = {};

  if (personId) {
    personSnapshot = await db
      .doc(`orgs/${orgId}/people/${personId}`)
      .get();
    personData = personSnapshot.exists ? personSnapshot.data() || {} : {};
  }

  const guardian = await inspectGuardianLinks(db, orgId, personId, uid);

  if (
    target.expectGuardianAccess &&
    authUser &&
    personId &&
    (guardian.guardianRecords === 0 || guardian.guardianLinks === 0)
  ) {
    blockingIssues.push(
      "Expected guardian access, but no active guardian structure was found for the resolved user/person.",
    );
  }

  return {
    key: target.key,
    email: target.email,
    title: target.title,
    displayName: target.displayName,

    auth: authUser
      ? {
          exists: true,
          uid: authUser.uid,
          email: authUser.email || "",
          displayName: authUser.displayName || "",
          disabled: authUser.disabled === true,
        }
      : {
          exists: false,
          uid: "",
          email: target.email,
          displayName: "",
          disabled: false,
        },

    user: {
      exists: Boolean(userSnapshot?.exists),
      personId: userPersonId,
      displayName: text(userData.displayName),
      email: text(userData.email),
      isDisabled: userData.isDisabled === true,
    },

    identity: {
      resolvedPersonId: personId,
      source: userPersonId
        ? "USER_PROFILE"
        : identity.nationalIdPersonId
          ? "NATIONAL_ID"
          : identity.emailPersonId
            ? "EMAIL"
            : authUser
              ? "NEW_PERSON_FOR_EXISTING_AUTH"
              : "NEW_PERSON_AFTER_AUTH_CREATE",
      nationalIdMatchFound: Boolean(identity.nationalIdPersonId),
      emailMatchFound: Boolean(identity.emailPersonId),
    },

    person: {
      exists: Boolean(personSnapshot?.exists),
      id: personId,
      displayName: text(personData.displayName),
      email: text(personData.email),
      nationalIdPresent: Boolean(text(personData.nationalId)),
    },

    membership: {
      exists: Boolean(membershipSnapshot?.exists),
      role: text(membershipData.role),
      roleKey: text(membershipData.roleKey),
      title: text(membershipData.title),
      isActive: membershipData.isActive === true || membershipData.active === true,
      canAccessAllSchools:
        membershipData.scopes?.canAccessAllSchools === true,
    },

    guardian: {
      expected: target.expectGuardianAccess,
      guardianRecords: guardian.guardianRecords,
      guardianLinks: guardian.guardianLinks,
      guardianIds: guardian.guardianIds,
    },

    blockingIssues,
  };
}

function buildPreviewAction(state, target) {
  return {
    key: target.key,
    email: target.email,
    safeToApply: state.blockingIssues.length === 0,
    authAction: state.auth.exists ? "UPDATE_REUSE" : "CREATE",
    passwordAction: target.resetPasswordOnApply
      ? state.auth.exists
        ? "RESET_TO_CONFIGURED_NATIONAL_ID"
        : "SET_FROM_CONFIGURED_NATIONAL_ID"
      : "UNCHANGED",
    userAction: state.user.exists ? "MERGE_UPDATE" : "CREATE",
    personAction: state.person.exists
      ? "MERGE_UPDATE"
      : state.identity.resolvedPersonId
        ? "CREATE_AT_EXISTING_PERSON_ID"
        : "CREATE_AFTER_AUTH_UID_IS_KNOWN",
    membershipAction: state.membership.exists
      ? `UPDATE_${state.membership.roleKey || state.membership.role || "UNKNOWN"}_TO_PLATFORM_OWNER`
      : "CREATE_PLATFORM_OWNER",
    resolvedPersonId:
      state.identity.resolvedPersonId || "<staff-{new-auth-uid}>",
    preserveGuardianData: true,
    guardianBefore: state.guardian,
    blockingIssues: state.blockingIssues,
  };
}

function buildMembershipData({ orgId, uid, personId, title, createdAt, now }) {
  return {
    id: orgId,
    uid,
    personId,
    orgId,

    role: EXPECTED_ROLE,
    roleKey: EXPECTED_ROLE,

    title,
    department: "",

    scopeType: "ORG",
    scopeId: orgId,

    schoolIds: [],

    scopes: {
      canAccessAllSchools: true,
      schoolIds: [],
      gradeIds: [],
      classIds: [],
      subjectKeys: [],
      routeIds: [],
    },

    permissions: { ...PLATFORM_OWNER_PERMISSIONS },

    isActive: true,

    createdAt,
    updatedAt: now,
  };
}

function redact(value) {
  if (Array.isArray(value)) return value.map(redact);

  if (value && typeof value === "object") {
    const out = {};
    for (const [key, item] of Object.entries(value)) {
      if (
        ["nationalId", "password", "initialPassword"].includes(key)
      ) {
        out[key] = "[REDACTED]";
      } else {
        out[key] = redact(item);
      }
    }
    return out;
  }

  return value;
}

function timestampForFile() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function writeReport(prefix, payload) {
  fs.mkdirSync(REPORTS_DIR, { recursive: true });
  const filePath = path.join(
    REPORTS_DIR,
    `${timestampForFile()}__${prefix}.json`,
  );

  fs.writeFileSync(
    filePath,
    JSON.stringify(redact(payload), null, 2),
    "utf8",
  );

  return filePath;
}

async function applyTarget(context, config, target, beforeState) {
  const { auth, db } = context;
  const { orgId } = config;

  if (beforeState.blockingIssues.length) {
    throw new Error(
      `${target.email}: blocked: ${beforeState.blockingIssues.join(" | ")}`,
    );
  }

  let authUser = await getAuthUserByEmail(auth, target.email);
  let authAction = "REUSED";

  if (!authUser) {
    authUser = await auth.createUser({
      email: target.email,
      displayName: target.displayName,
      password: target.nationalId,
      disabled: false,
      emailVerified: false,
    });
    authAction = "CREATED";
  } else {
    const update = {
      displayName: target.displayName,
      disabled: false,
    };

    if (target.resetPasswordOnApply) {
      update.password = target.nationalId;
    }

    authUser = await auth.updateUser(authUser.uid, update);
    authAction = "UPDATED";
  }

  if (target.expectedUid && authUser.uid !== target.expectedUid) {
    throw new Error(
      `${target.email}: UID changed unexpectedly. Expected ${target.expectedUid}, got ${authUser.uid}.`,
    );
  }

  let personId = beforeState.identity.resolvedPersonId;

  if (!personId) {
    const userSnapshot = await db.doc(`users/${authUser.uid}`).get();
    const existingUserPersonId = text(userSnapshot.data()?.personId);
    personId = existingUserPersonId || `staff-${authUser.uid}`;
  }

  const userRef = db.doc(`users/${authUser.uid}`);
  const personRef = db.doc(`orgs/${orgId}/people/${personId}`);
  const membershipRef = db.doc(
    `users/${authUser.uid}/orgMemberships/${orgId}`,
  );

  const now = Date.now();

  await db.runTransaction(async (transaction) => {
    const [userSnapshot, personSnapshot, membershipSnapshot] =
      await Promise.all([
        transaction.get(userRef),
        transaction.get(personRef),
        transaction.get(membershipRef),
      ]);

    const currentUserPersonId = text(userSnapshot.data()?.personId);

    if (currentUserPersonId && currentUserPersonId !== personId) {
      throw new Error(
        `${target.email}: users/${authUser.uid}.personId changed during apply (${currentUserPersonId} != ${personId}).`,
      );
    }

    transaction.set(
      userRef,
      {
        uid: authUser.uid,
        displayName: target.displayName,
        email: target.email,
        personId,
        isDisabled: false,
        createdAt: safeCreatedAt(userSnapshot, now),
        updatedAt: now,
      },
      { merge: true },
    );

    transaction.set(
      personRef,
      {
        id: personId,
        displayName: target.displayName,
        email: target.email,
        nationalId: target.nationalId,
        createdAt: safeCreatedAt(personSnapshot, now),
        updatedAt: now,
      },
      { merge: true },
    );

    transaction.set(
      membershipRef,
      buildMembershipData({
        orgId,
        uid: authUser.uid,
        personId,
        title: target.title,
        createdAt: safeCreatedAt(membershipSnapshot, now),
        now,
      }),
      { merge: true },
    );
  });

  return {
    key: target.key,
    email: target.email,
    uid: authUser.uid,
    personId,
    authAction,
    passwordUpdated:
      authAction === "CREATED" || target.resetPasswordOnApply,
    membershipPath: membershipRef.path,
    guardianDataTouched: false,
    teacherAssignmentsTouched: false,
    operationalAssignmentsTouched: false,
  };
}

function checkExpectedPermissions(permissions) {
  const failures = [];

  for (const [key, expected] of Object.entries(
    PLATFORM_OWNER_PERMISSIONS,
  )) {
    if (permissions?.[key] !== expected) {
      failures.push(`permissions.${key} is not true`);
    }
  }

  return failures;
}

async function verifyTarget(context, config, target) {
  const state = await inspectTarget(context, config, target);
  const failures = [];

  if (!state.auth.exists) failures.push("Firebase Auth user is missing");
  if (state.auth.disabled) failures.push("Firebase Auth user is disabled");

  if (target.expectedUid && state.auth.uid !== target.expectedUid) {
    failures.push(
      `UID mismatch: expected ${target.expectedUid}, got ${state.auth.uid || "missing"}`,
    );
  }

  if (!state.user.exists) failures.push("users/{uid} profile is missing");
  if (!state.user.personId) failures.push("users/{uid}.personId is missing");

  if (!state.person.exists) failures.push("people/{personId} is missing");

  if (!state.membership.exists) {
    failures.push("orgMemberships/takween is missing");
  } else {
    if (state.membership.role !== EXPECTED_ROLE) {
      failures.push(`membership.role=${state.membership.role || "missing"}`);
    }
    if (state.membership.roleKey !== EXPECTED_ROLE) {
      failures.push(
        `membership.roleKey=${state.membership.roleKey || "missing"}`,
      );
    }
    if (!state.membership.isActive) {
      failures.push("membership is not active");
    }
    if (!state.membership.canAccessAllSchools) {
      failures.push("scopes.canAccessAllSchools is not true");
    }
  }

  if (state.blockingIssues.length) {
    failures.push(...state.blockingIssues.map((x) => `blocking: ${x}`));
  }

  if (
    target.expectGuardianAccess &&
    (state.guardian.guardianRecords === 0 ||
      state.guardian.guardianLinks === 0)
  ) {
    failures.push("guardian records/links are missing after apply");
  }

  if (state.auth.exists) {
    const membershipSnapshot = await context.db
      .doc(`users/${state.auth.uid}/orgMemberships/${config.orgId}`)
      .get();
    const membershipData = membershipSnapshot.data() || {};
    failures.push(
      ...checkExpectedPermissions(membershipData.permissions),
    );
  }

  return {
    key: target.key,
    email: target.email,
    ok: failures.length === 0,
    uid: state.auth.uid,
    personId: state.user.personId || state.identity.resolvedPersonId,
    roleKey: state.membership.roleKey,
    canAccessAllSchools: state.membership.canAccessAllSchools,
    guardian: state.guardian,
    failures,
  };
}

function publicState(state) {
  return redact(state);
}

module.exports = {
  EXPECTED_ROLE,
  PLATFORM_OWNER_PERMISSIONS,
  CONFIG_PATH,
  SERVICE_ACCOUNT_PATH,
  initAdmin,
  loadConfig,
  inspectTarget,
  buildPreviewAction,
  applyTarget,
  verifyTarget,
  publicState,
  writeReport,
};
