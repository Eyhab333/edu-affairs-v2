// usage:
// node create-org-membership-by-email.cjs --email=admin@test.com --orgId=takween --serviceAccount=./service-account.json
//
// optional:
// --role=org_admin
// --title="مدير النظام"
// --department="Educational Affairs"
// --allSchools=true
//
// if GOOGLE_APPLICATION_CREDENTIALS is already set, you can omit --serviceAccount

const admin = require("firebase-admin");
const path = require("path");

function parseArgs(argv) {
  const out = {};
  for (const arg of argv) {
    if (!arg.startsWith("--")) continue;
    const eqIndex = arg.indexOf("=");
    if (eqIndex === -1) {
      out[arg.slice(2)] = true;
    } else {
      const key = arg.slice(2, eqIndex);
      const value = arg.slice(eqIndex + 1);
      out[key] = value;
    }
  }
  return out;
}

function toBool(value, fallback = false) {
  if (value === undefined) return fallback;
  if (typeof value === "boolean") return value;
  return String(value).toLowerCase() === "true";
}

async function initAdmin(serviceAccountPath) {
  if (admin.apps.length) return;

  if (serviceAccountPath) {
    const serviceAccount = require(serviceAccountPath);
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
    return;
  }

  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  const email = String(args.email || "").trim().toLowerCase();
  const orgId = String(args.orgId || "").trim();
  const role = String(args.role || "org_admin").trim();
  const title = String(args.title || "مدير النظام").trim();
  const department = String(args.department || "Educational Affairs").trim();
  const allSchools = toBool(args.allSchools, true);
  const serviceAccountPath = args.serviceAccount
    ? path.resolve(String(args.serviceAccount))
    : null;

  if (!email) {
    throw new Error("Missing required argument: --email=user@example.com");
  }

  if (!orgId) {
    throw new Error("Missing required argument: --orgId=takween");
  }

  await initAdmin(serviceAccountPath);

  const auth = admin.auth();
  const db = admin.firestore();

  const userRecord = await auth.getUserByEmail(email);
  const uid = userRecord.uid;
  const now = Date.now();

  const membershipRef = db.doc(`orgs/${orgId}/memberships/${uid}`);
  const membershipSnap = await membershipRef.get();

  const payload = {
    uid,
    orgId,
    role,
    title,
    department,
    scopes: {
      schoolIds: [],
      canAccessAllSchools: allSchools,
    },
    permissions: {
      manageSchools: true,
      manageAcademicYears: true,
      manageGrades: true,
      manageClasses: true,
      manageUsers: true,
    },
    isActive: true,
    updatedAt: now,
  };

  if (!membershipSnap.exists) {
    payload.createdAt = now;
  }

  await membershipRef.set(payload, { merge: true });

  console.log("✅ Membership created/updated successfully");
  console.log(`email: ${email}`);
  console.log(`uid: ${uid}`);
  console.log(`orgId: ${orgId}`);
  console.log(`path: orgs/${orgId}/memberships/${uid}`);
}

main().catch((error) => {
  console.error("❌ Failed:", error.message || error);
  process.exit(1);
});