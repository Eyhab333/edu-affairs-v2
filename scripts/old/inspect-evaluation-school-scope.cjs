/* eslint-disable no-console */

const admin = require("firebase-admin");
const path = require("path");

const ORG_ID = process.env.ORG_ID || "takween";
const SCHOOL_ID = process.env.SCHOOL_ID || "mrb-boys-sayh";

const PRINCIPAL_EMAIL = "a-s-alkmays@qz.org.sa";
const IHAB_EMAIL = "e.ahmad@qz.org.sa";

const COLLECTIONS = [
  "evaluationFrameworks",
  "evaluationPlans",
  "evaluationCycles",
  "evaluationTargetAssignments",
  "evaluationEvaluatorAssignments",
  "evaluationSubmissions",
  "evaluationCycleTargetSummaries",
  "evaluationStaffSummaries",
];

function initAdmin() {
  if (admin.apps.length) return;

  const serviceAccountPath = path.resolve(process.cwd(), "service-account.json");
  const serviceAccount = require(serviceAccountPath);

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    projectId: serviceAccount.project_id,
  });
}

function dataWithId(doc) {
  return {
    id: doc.id,
    path: doc.ref.path,
    ...doc.data(),
  };
}

function normalizeEmail(value) {
  return String(value || "").toLowerCase();
}

function isDirectorRelated(data) {
  const text = [
    data.id,
    data.planId,
    data.frameworkId,
    data.title,
    data.description,
    data.targetRoleLabel,
    data.evaluatorRoleLabel,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return text.includes("director-") || text.includes("تقييم المدير");
}

async function inspectCollection(db, collectionName) {
  const snap = await db.collection(`orgs/${ORG_ID}/${collectionName}`).get();

  const docs = snap.docs.map(dataWithId);

  const result = {
    collectionName,
    total: docs.length,
    hasSchoolId: 0,
    missingSchoolId: 0,
    matchingSchoolId: 0,
    otherSchoolId: 0,
    directorRelated: 0,
    principalEvaluator: 0,
    ihabEvaluator: 0,
    samplesMissingSchoolId: [],
    samplesOtherSchoolId: [],
    samplesIhabEvaluator: [],
  };

  for (const doc of docs) {
    if (doc.schoolId) {
      result.hasSchoolId += 1;

      if (doc.schoolId === SCHOOL_ID) {
        result.matchingSchoolId += 1;
      } else {
        result.otherSchoolId += 1;

        if (result.samplesOtherSchoolId.length < 5) {
          result.samplesOtherSchoolId.push({
            id: doc.id,
            path: doc.path,
            schoolId: doc.schoolId,
            planId: doc.planId,
            title: doc.title,
          });
        }
      }
    } else {
      result.missingSchoolId += 1;

      if (result.samplesMissingSchoolId.length < 5) {
        result.samplesMissingSchoolId.push({
          id: doc.id,
          path: doc.path,
          planId: doc.planId,
          frameworkId: doc.frameworkId,
          title: doc.title,
        });
      }
    }

    if (isDirectorRelated(doc)) {
      result.directorRelated += 1;
    }

    const evaluatorEmail = normalizeEmail(doc.evaluatorEmail);

    if (evaluatorEmail === PRINCIPAL_EMAIL) {
      result.principalEvaluator += 1;
    }

    if (evaluatorEmail === IHAB_EMAIL) {
      result.ihabEvaluator += 1;

      if (result.samplesIhabEvaluator.length < 5) {
        result.samplesIhabEvaluator.push({
          id: doc.id,
          path: doc.path,
          planId: doc.planId,
          cycleId: doc.cycleId,
          targetPersonId: doc.targetPersonId,
          evaluatorEmail: doc.evaluatorEmail,
        });
      }
    }
  }

  return result;
}

async function inspectPrincipalAccess(db) {
  const peopleSnap = await db
    .collection(`orgs/${ORG_ID}/people`)
    .where("email", "==", PRINCIPAL_EMAIL)
    .limit(1)
    .get();

  const principalPerson = peopleSnap.empty ? null : dataWithId(peopleSnap.docs[0]);

  let authUser = null;

  try {
    const user = await admin.auth().getUserByEmail(PRINCIPAL_EMAIL);
    authUser = {
      uid: user.uid,
      email: user.email,
      displayName: user.displayName,
      disabled: user.disabled,
    };
  } catch (error) {
    if (error.code !== "auth/user-not-found") throw error;
  }

  let orgMembership = null;

  if (authUser) {
    const membershipSnap = await db
      .doc(`users/${authUser.uid}/orgMemberships/${ORG_ID}`)
      .get();

    if (membershipSnap.exists) {
      orgMembership = dataWithId(membershipSnap);
    }
  }

  const operationalMemberships = [];

  if (principalPerson) {
    const opSnap = await db
      .collection(`orgs/${ORG_ID}/operationalMemberships`)
      .where("personId", "==", principalPerson.id)
      .get();

    opSnap.docs.forEach((doc) => operationalMemberships.push(dataWithId(doc)));
  }

  const badAssignmentSnap = await db
    .doc(`orgs/${ORG_ID}/operationalAssignments/${SCHOOL_ID}-principal-staff-evaluation`)
    .get();

  return {
    principalPerson: principalPerson
      ? {
          id: principalPerson.id,
          email: principalPerson.email,
          displayName: principalPerson.displayName,
          roleKey: principalPerson.roleKey,
          roleLabel: principalPerson.roleLabel,
          uid: principalPerson.uid,
        }
      : null,

    authUser,

    orgMembership: orgMembership
      ? {
          path: orgMembership.path,
          personId: orgMembership.personId,
          role: orgMembership.role,
          roleKey: orgMembership.roleKey,
          roleLabel: orgMembership.roleLabel,
          scopeType: orgMembership.scopeType,
          scopeId: orgMembership.scopeId,
          isActive: orgMembership.isActive,
          permissions: orgMembership.permissions,
          scopes: orgMembership.scopes,
        }
      : null,

    operationalMemberships: operationalMemberships.map((item) => ({
      path: item.path,
      personId: item.personId,
      uid: item.uid,
      email: item.email,
      displayName: item.displayName,
      roleKey: item.roleKey,
      roleLabel: item.roleLabel,
      scopeType: item.scopeType,
      scopeId: item.scopeId,
      schoolId: item.schoolId,
      isActive: item.isActive,
      status: item.status,
    })),

    badOperationalAssignmentExists: badAssignmentSnap.exists,
  };
}

async function main() {
  initAdmin();

  const db = admin.firestore();

  console.log("Inspecting evaluation school scope...");
  console.log({
    orgId: ORG_ID,
    schoolId: SCHOOL_ID,
    principalEmail: PRINCIPAL_EMAIL,
    ihabEmail: IHAB_EMAIL,
  });

  const access = await inspectPrincipalAccess(db);

  console.log("\n==============================");
  console.log("Principal access");
  console.log("==============================");
  console.dir(access, { depth: 10 });

  console.log("\n==============================");
  console.log("Evaluation collections");
  console.log("==============================");

  for (const collectionName of COLLECTIONS) {
    const result = await inspectCollection(db, collectionName);

    console.log(`\n--- ${collectionName} ---`);
    console.log({
      total: result.total,
      hasSchoolId: result.hasSchoolId,
      missingSchoolId: result.missingSchoolId,
      matchingSchoolId: result.matchingSchoolId,
      otherSchoolId: result.otherSchoolId,
      directorRelated: result.directorRelated,
      principalEvaluator: result.principalEvaluator,
      ihabEvaluator: result.ihabEvaluator,
    });

    if (result.samplesMissingSchoolId.length) {
      console.log("Samples missing schoolId:");
      console.dir(result.samplesMissingSchoolId, { depth: 5 });
    }

    if (result.samplesOtherSchoolId.length) {
      console.log("Samples other schoolId:");
      console.dir(result.samplesOtherSchoolId, { depth: 5 });
    }

    if (result.samplesIhabEvaluator.length) {
      console.log("Samples still assigned to Ihab:");
      console.dir(result.samplesIhabEvaluator, { depth: 5 });
    }
  }

  console.log("\n✅ Evaluation school scope inspect completed.");
}

main().catch((error) => {
  console.error("\n❌ Inspect failed:");
  console.error(error);
  process.exit(1);
});