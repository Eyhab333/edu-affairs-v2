const admin = require("firebase-admin");
const path = require("path");

const serviceAccount = require(path.join(__dirname, "./service-account.json"));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

async function addUserToOrg({ uid, orgId, role = "member" }) {
  if (!uid) throw new Error("uid is required");
  if (!orgId) throw new Error("orgId is required");

  const now = admin.firestore.FieldValue.serverTimestamp();

  const orgMembershipRef = db.doc(`orgs/${orgId}/memberships/${uid}`);
  const userMembershipRef = db.doc(`users/${uid}/orgMemberships/${orgId}`);

  const batch = db.batch();

  batch.set(
    orgMembershipRef,
    {
      uid,
      orgId,
      role,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    },
    { merge: true }
  );

  batch.set(
    userMembershipRef,
    {
      orgId,
      role,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    },
    { merge: true }
  );

  await batch.commit();

  console.log(`User ${uid} added to org ${orgId} with role ${role}`);
}

async function main() {
  const [, , uid, orgId, role] = process.argv;

  if (!uid || !orgId) {
    console.error("Usage: node add-user-to-org.cjs <uid> <orgId> [role]");
    process.exit(1);
  }

  try {
    await addUserToOrg({
      uid,
      orgId,
      role: role || "member",
    });
    process.exit(0);
  } catch (error) {
    console.error("Failed to add user to org:");
    console.error(error);
    process.exit(1);
  }
}

main();