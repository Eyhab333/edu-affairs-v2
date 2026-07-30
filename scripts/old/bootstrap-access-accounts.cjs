#!/usr/bin/env node
/*
  Bootstrap Firebase Auth accounts + Firestore access membership

  Usage examples:
    node bootstrap-access-accounts.cjs ./accounts.bootstrap.private.json --serviceAccount=./service-account.json
    node bootstrap-access-accounts.cjs ./accounts.bootstrap.private.json --serviceAccount=./service-account.json --dry-run
    node bootstrap-access-accounts.cjs ./accounts.bootstrap.private.json --serviceAccount=./service-account.json --projectId=my-project-id

  What it does:
    1) Finds or creates Firebase Auth users by email
    2) Creates/updates Firestore:
       - users/{uid}
       - users/{uid}/orgMemberships/{orgId}
    3) Optionally writes org mirror membership:
       - orgs/{orgId}/memberships/{uid}
    4) Writes a local report JSON with created accounts and temporary passwords
*/

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const admin = require("firebase-admin");

const ACCESS_ROLES = new Set([
  "platform_owner",
  "platform_admin",
  "org_owner",
  "org_admin",
  "school_admin",
  "school_manager",
  "staff",
  "teacher",
  "viewer",
]);

function parseArgs(argv) {
  const args = {
    bootstrapPath: null,
    serviceAccount: null,
    projectId: null,
    dryRun: false,
    reportPath: "./accounts.bootstrap.report.json",
  };

  for (const arg of argv.slice(2)) {
    if (!arg.startsWith("--") && !args.bootstrapPath) {
      args.bootstrapPath = arg;
      continue;
    }

    if (arg === "--dry-run") {
      args.dryRun = true;
      continue;
    }

    if (arg.startsWith("--serviceAccount=")) {
      args.serviceAccount = arg.split("=")[1];
      continue;
    }

    if (arg.startsWith("--projectId=")) {
      args.projectId = arg.split("=")[1];
      continue;
    }

    if (arg.startsWith("--reportPath=")) {
      args.reportPath = arg.split("=")[1];
      continue;
    }
  }

  return args;
}

function exitWith(message) {
  console.error(`\n❌ ${message}\n`);
  process.exit(1);
}

function loadJson(filePath) {
  const absolutePath = path.resolve(process.cwd(), filePath);

  if (!fs.existsSync(absolutePath)) {
    exitWith(`File not found: ${absolutePath}`);
  }

  try {
    return JSON.parse(fs.readFileSync(absolutePath, "utf8"));
  } catch (error) {
    exitWith(`Failed to parse JSON: ${error.message}`);
  }
}

function validateBootstrap(config) {
  if (!config || typeof config !== "object" || Array.isArray(config)) {
    exitWith("Bootstrap JSON must be an object.");
  }

  if (!config.meta || typeof config.meta !== "object" || Array.isArray(config.meta)) {
    exitWith("Bootstrap JSON must contain a meta object.");
  }

  if (!Array.isArray(config.accounts)) {
    exitWith("Bootstrap JSON must contain an accounts array.");
  }

  config.accounts.forEach((account, index) => {
    if (!account || typeof account !== "object" || Array.isArray(account)) {
      exitWith(`accounts[${index}] must be an object.`);
    }

    if (typeof account.email !== "string" || !account.email.trim()) {
      exitWith(`accounts[${index}].email must be a non-empty string.`);
    }

    if (typeof account.accessRole !== "string" || !ACCESS_ROLES.has(account.accessRole)) {
      exitWith(
        `accounts[${index}].accessRole must be one of: ${Array.from(ACCESS_ROLES).join(", ")}`
      );
    }

    if (account.orgId != null && typeof account.orgId !== "string") {
      exitWith(`accounts[${index}].orgId must be a string.`);
    }

    if (account.schoolIds != null && !Array.isArray(account.schoolIds)) {
      exitWith(`accounts[${index}].schoolIds must be an array if provided.`);
    }
  });
}

function initFirebase({ serviceAccount, projectId }) {
  if (admin.apps.length > 0) {
    return admin.app();
  }

  let credential;

  if (serviceAccount) {
    const absoluteServiceAccountPath = path.resolve(process.cwd(), serviceAccount);

    if (!fs.existsSync(absoluteServiceAccountPath)) {
      exitWith(`Service account file not found: ${absoluteServiceAccountPath}`);
    }

    const serviceAccountJson = JSON.parse(
      fs.readFileSync(absoluteServiceAccountPath, "utf8")
    );

    credential = admin.credential.cert(serviceAccountJson);
  } else {
    credential = admin.credential.applicationDefault();
  }

  return admin.initializeApp({
    credential,
    ...(projectId ? { projectId } : {}),
  });
}

function getNowMs() {
  return Date.now();
}

function normalizeString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function randomPassword(length = 14) {
  const raw = crypto.randomBytes(24).toString("base64url");
  const base = raw.slice(0, Math.max(length, 10));
  return `Tk@${base}!`;
}

function derivePassword(account, meta) {
  const initialPassword = normalizeString(account.initialPassword);
  if (initialPassword) {
    return initialPassword;
  }

  const strategy = normalizeString(meta.passwordStrategy) || "random";
  const prefix = normalizeString(meta.passwordPrefix) || "Tk@";

  if (strategy === "nationalIdLast6WithPrefix") {
    const nationalIdDigits = String(account.nationalId || "").replace(/\D/g, "");
    if (nationalIdDigits.length < 6) {
      exitWith(
        `Account ${account.email} يحتاج nationalId صالحًا أو initialPassword صريحًا لأن passwordStrategy = nationalIdLast6WithPrefix`
      );
    }

    return `${prefix}${nationalIdDigits.slice(-6)}!`;
  }

  return randomPassword();
}

async function getOrCreateAuthUser(auth, account, meta) {
  const email = normalizeString(account.email).toLowerCase();
  const displayName = normalizeString(account.displayName) || email;
  const disabled = !!account.disabled;
  const createAuthIfMissing = account.createAuthIfMissing !== false;
  const mustExistInAuth = !!account.mustExistInAuth;
  const updateExistingUser = meta.updateExistingUser !== false;
  const resetPasswordOnExisting = !!meta.resetPasswordOnExisting;

  try {
    const existingUser = await auth.getUserByEmail(email);

    const updates = {};
    let passwordForReport = "";

    if (updateExistingUser) {
      if (existingUser.displayName !== displayName) {
        updates.displayName = displayName;
      }
      if (existingUser.disabled !== disabled) {
        updates.disabled = disabled;
      }
    }

    if (resetPasswordOnExisting) {
      const password = derivePassword(account, meta);
      updates.password = password;
      passwordForReport = password;
    }

    if (Object.keys(updates).length > 0) {
      await auth.updateUser(existingUser.uid, updates);
    }

    return {
      uid: existingUser.uid,
      email,
      displayName,
      disabled,
      created: false,
      passwordForReport,
    };
  } catch (error) {
    if (error && error.code !== "auth/user-not-found") {
      throw error;
    }

    if (mustExistInAuth || !createAuthIfMissing) {
      exitWith(
        `User not found in Firebase Auth for ${email}. إمّا أن تنشئ الحساب أولًا أو تجعل createAuthIfMissing=true`
      );
    }

    const password = derivePassword(account, meta);

    const createdUser = await auth.createUser({
      email,
      password,
      displayName,
      disabled,
    });

    return {
      uid: createdUser.uid,
      email,
      displayName,
      disabled,
      created: true,
      passwordForReport: password,
    };
  }
}

async function upsertUserAccess(db, authResult, account, meta) {
  const nowMs = getNowMs();
  const uid = authResult.uid;
  const orgId = normalizeString(account.orgId) || normalizeString(meta.defaultOrgId);

  if (!orgId) {
    exitWith(`Account ${account.email} does not have orgId and meta.defaultOrgId is missing.`);
  }

  const accessRole = normalizeString(account.accessRole);
  const schoolIds = Array.isArray(account.schoolIds) ? account.schoolIds : [];
  const personId = normalizeString(account.personId);
  const mustChangePassword =
    typeof account.mustChangePassword === "boolean"
      ? account.mustChangePassword
      : meta.mustChangePassword !== false;

  const userRef = db.doc(`users/${uid}`);
  const membershipRef = db.doc(`users/${uid}/orgMemberships/${orgId}`);

  const userSnap = await userRef.get();
  const membershipSnap = await membershipRef.get();

  const userData = {
    uid,
    orgId,
    email: authResult.email,
    displayName: authResult.displayName,
    personId,
    roles: [accessRole],
    schoolIds,
    isOrgAdmin: !!account.isOrgAdmin,
    mustChangePassword: !!mustChangePassword,
    isDisabled: !!authResult.disabled,
    updatedAt: nowMs,
    ...(userSnap.exists ? {} : { createdAt: nowMs }),
  };

  const membershipData = {
    orgId,
    role: accessRole,
    isActive: true,
    personId,
    schoolIds,
    updatedAt: nowMs,
    ...(membershipSnap.exists ? {} : { createdAt: nowMs }),
  };

  await userRef.set(userData, { merge: true });
  await membershipRef.set(membershipData, { merge: true });

  if (meta.writeOrgMirrorMembership === true) {
    const mirrorRef = db.doc(`orgs/${orgId}/memberships/${uid}`);
    const mirrorSnap = await mirrorRef.get();

    await mirrorRef.set(
      {
        uid,
        orgId,
        role: accessRole,
        isActive: true,
        personId,
        schoolIds,
        updatedAt: nowMs,
        ...(mirrorSnap.exists ? {} : { createdAt: nowMs }),
      },
      { merge: true }
    );
  }

  return {
    uid,
    orgId,
    accessRole,
  };
}

async function main() {
  const args = parseArgs(process.argv);

  if (!args.bootstrapPath) {
    exitWith(
      "Usage: node bootstrap-access-accounts.cjs <accounts.bootstrap.private.json> [--serviceAccount=path] [--projectId=id] [--dry-run] [--reportPath=path]"
    );
  }

  const config = loadJson(args.bootstrapPath);
  validateBootstrap(config);

  console.log(`\n📦 Bootstrap file loaded: ${args.bootstrapPath}`);
  console.log(`👥 Accounts count: ${config.accounts.length}`);
  console.log(`🧪 Dry run: ${args.dryRun ? "yes" : "no"}`);

  if (args.dryRun) {
    console.log("");
    config.accounts.forEach((account, index) => {
      const email = normalizeString(account.email).toLowerCase();
      const orgId = normalizeString(account.orgId) || normalizeString(config.meta.defaultOrgId);
      console.log(
        `- [${index + 1}] ${email} -> ${orgId} (${account.accessRole})`
      );
    });
    console.log("\n🧪 Dry run only. No data was written.\n");
    return;
  }

  initFirebase(args);

  const auth = admin.auth();
  const db = admin.firestore();

  const report = {
    generatedAt: new Date().toISOString(),
    projectId: admin.app().options.projectId || args.projectId || "",
    results: [],
  };

  for (const account of config.accounts) {
    const email = normalizeString(account.email).toLowerCase();
    console.log(`\n➡️ Processing: ${email}`);

    const authResult = await getOrCreateAuthUser(auth, account, config.meta);
    const accessResult = await upsertUserAccess(db, authResult, account, config.meta);

    report.results.push({
      email,
      uid: authResult.uid,
      createdInAuth: authResult.created,
      initialPassword: authResult.passwordForReport || "",
      orgId: accessResult.orgId,
      accessRole: accessResult.accessRole,
    });

    console.log(
      `✅ Done: ${email} | uid=${authResult.uid} | role=${accessResult.accessRole}`
    );
  }

  const absoluteReportPath = path.resolve(process.cwd(), args.reportPath);
  fs.writeFileSync(absoluteReportPath, JSON.stringify(report, null, 2), "utf8");

  console.log(`\n📝 Report written to: ${absoluteReportPath}`);
  console.log("\n🎉 Accounts bootstrap completed successfully.\n");
}

main().catch((error) => {
  console.error("\n❌ Bootstrap failed.");
  console.error(error);
  process.exit(1);
});