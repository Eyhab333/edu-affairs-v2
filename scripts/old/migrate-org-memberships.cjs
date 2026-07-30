const admin = require("firebase-admin");
const path = require("path");

const serviceAccount = require(path.join(__dirname, "./service-account.json"));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

async function migrateOrgMemberships() {
  const orgsSnapshot = await db.collection("orgs").get();

  if (orgsSnapshot.empty) {
    console.log("No orgs found.");
    return;
  }

  let totalOrgs = 0;
  let totalMemberships = 0;
  let totalWrites = 0;

  for (const orgDoc of orgsSnapshot.docs) {
    totalOrgs += 1;
    const orgId = orgDoc.id;

    console.log(`Processing org: ${orgId}`);

    const membershipsSnapshot = await db
      .collection(`orgs/${orgId}/memberships`)
      .get();

    if (membershipsSnapshot.empty) {
      console.log(`No memberships found for org: ${orgId}`);
      continue;
    }

    let batch = db.batch();
    let opCount = 0;

    for (const membershipDoc of membershipsSnapshot.docs) {
      totalMemberships += 1;

      const uid = membershipDoc.id;
      const data = membershipDoc.data();

      const targetRef = db.doc(`users/${uid}/orgMemberships/${orgId}`);

      batch.set(
        targetRef,
        {
          orgId,
          role: data.role || "member",
          active: typeof data.active === "boolean" ? data.active : true,
          createdAt: data.createdAt || admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      opCount += 1;
      totalWrites += 1;

      if (opCount === 500) {
        await batch.commit();
        console.log(`Committed 500 operations for org: ${orgId}`);
        batch = db.batch();
        opCount = 0;
      }
    }

    if (opCount > 0) {
      await batch.commit();
      console.log(`Committed final ${opCount} operations for org: ${orgId}`);
    }
  }

  console.log("Migration completed.");
  console.log(`Total orgs processed: ${totalOrgs}`);
  console.log(`Total memberships read: ${totalMemberships}`);
  console.log(`Total writes performed: ${totalWrites}`);
}

migrateOrgMemberships()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Migration failed:");
    console.error(error);
    process.exit(1);
  });