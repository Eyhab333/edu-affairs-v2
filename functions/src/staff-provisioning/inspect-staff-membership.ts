import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

import { initializeStaffProvisioningAdmin } from "./initialize-staff-provisioning-admin";

const ORG_ID = "takween";
const EMAIL = "f.alqashami@qz.org.sa";

async function main() {
  initializeStaffProvisioningAdmin();

  const auth = getAuth();
  const db = getFirestore();

  const user = await auth.getUserByEmail(EMAIL);

  const userProfileRef = db.doc(`users/${user.uid}`);
  const membershipRef = db.doc(
    `users/${user.uid}/orgMemberships/${ORG_ID}`,
  );
  const legacyMembershipRef = db.doc(
    `orgs/${ORG_ID}/memberships/${user.uid}`,
  );

  const [userProfileSnap, membershipSnap, legacyMembershipSnap] =
    await Promise.all([
      userProfileRef.get(),
      membershipRef.get(),
      legacyMembershipRef.get(),
    ]);

  const personId =
    userProfileSnap.exists
      ? String(userProfileSnap.data()?.personId ?? "")
      : "";

  const assignmentsSnap = personId
    ? await db
        .collection(`orgs/${ORG_ID}/operationalAssignments`)
        .where("actorPersonId", "==", personId)
        .get()
    : null;

  console.log(
    JSON.stringify(
      {
        auth: {
          uid: user.uid,
          email: user.email,
          displayName: user.displayName,
          disabled: user.disabled,
        },

        userProfile: {
          exists: userProfileSnap.exists,
          path: userProfileRef.path,
          data: userProfileSnap.data() ?? null,
        },

        canonicalMembership: {
          exists: membershipSnap.exists,
          path: membershipRef.path,
          data: membershipSnap.data() ?? null,
        },

        legacyMembership: {
          exists: legacyMembershipSnap.exists,
          path: legacyMembershipRef.path,
          data: legacyMembershipSnap.data() ?? null,
        },

        operationalAssignments:
          assignmentsSnap?.docs.map((doc) => ({
            id: doc.id,
            ...doc.data(),
          })) ?? [],
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});