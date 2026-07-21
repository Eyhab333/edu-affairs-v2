/* eslint-disable no-console */

const admin = require("firebase-admin");
const path = require("path");

const ORG_ID = process.env.ORG_ID || "takween";
const SCHOOL_ID = process.env.SCHOOL_ID || "mrb-boys-sayh";

const EMAIL = "a-s-alkmays@qz.org.sa";
const PERSON_ID = "p-a-s-alkmays";

const ROLE_KEY = "BOYS_PRINCIPAL";
const ROLE_LABEL = "مدير المدرسة";

const ASSIGNMENT_ID = `${SCHOOL_ID}-principal-staff-evaluation`;

function initAdmin() {
  if (admin.apps.length) return;

  const serviceAccountPath = path.resolve(process.cwd(), "service-account.json");
  const serviceAccount = require(serviceAccountPath);

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    projectId: serviceAccount.project_id,
  });
}

async function getAuthUidByEmail() {
  try {
    const user = await admin.auth().getUserByEmail(EMAIL);
    return user.uid;
  } catch (error) {
    if (error.code === "auth/user-not-found") return "";
    throw error;
  }
}

async function main() {
  initAdmin();

  const db = admin.firestore();
  const now = Date.now();
  const uid = await getAuthUidByEmail();

  console.log("Granting principal evaluation access...");
  console.log({
    orgId: ORG_ID,
    schoolId: SCHOOL_ID,
    email: EMAIL,
    uid,
    personId: PERSON_ID,
    assignmentId: ASSIGNMENT_ID,
  });

  const writes = [
    db.doc(`orgs/${ORG_ID}/operationalAssignments/${ASSIGNMENT_ID}`).set(
      {
        id: ASSIGNMENT_ID,
        orgId: ORG_ID,

        actorPersonId: PERSON_ID,
        actorUid: uid || "",
        actorEmail: EMAIL,
        actorRoleKey: ROLE_KEY,
        actorRoleLabel: ROLE_LABEL,

        operationKind: "STAFF_EVALUATION",

        title: "تقييمات المدير - منار الريادة بنين السيح",
        description:
          "إسناد يتيح لمدير المدرسة فتح وحدة التقييمات ومتابعة تقييمات المعلمين والإداريين المسندة إليه.",

        scopeType: "SCHOOL",
        scopeId: SCHOOL_ID,
        scopeLabel: "مدرسة منار الريادة بنين السيح",
        schoolId: SCHOOL_ID,

        status: "ACTIVE",
        isActive: true,

        createdAt: now,
        updatedAt: now,
      },
      { merge: true },
    ),

    db.doc(`orgs/${ORG_ID}/people/${PERSON_ID}`).set(
      {
        roleKey: ROLE_KEY,
        roleLabel: ROLE_LABEL,
        isActive: true,
        updatedAt: now,
      },
      { merge: true },
    ),
  ];

  if (uid) {
    writes.push(
      db.doc(`users/${uid}/orgMemberships/${ORG_ID}`).set(
        {
          orgId: ORG_ID,
          personId: PERSON_ID,
          role: "staff",
          roleKey: ROLE_KEY,
          roleLabel: ROLE_LABEL,
          isActive: true,
          status: "ACTIVE",

          scopes: {
            schoolIds: [SCHOOL_ID],
            gradeIds: [],
            classIds: [],
            subjectKeys: [],
            routeIds: [],
            canAccessAllSchools: false,
          },

          permissions: {
            manageEvaluations: true,
          },

          updatedAt: now,
          createdAt: now,
        },
        { merge: true },
      ),
    );
  }

  await Promise.all(writes);

  console.log("\n✅ Principal evaluation access granted.");
  console.log({
    email: EMAIL,
    uid,
    personId: PERSON_ID,
    assignmentId: ASSIGNMENT_ID,
    operationKind: "STAFF_EVALUATION",
  });
}

main().catch((error) => {
  console.error("\n❌ Failed to grant principal evaluation access:");
  console.error(error);
  process.exit(1);
});