/* eslint-disable no-console */

const admin = require("firebase-admin");
const fs = require("fs");
const path = require("path");

const ORG_ID = "takween";
const FALEH_SCHOOL_ID = "mrb-boys-faleh";
const SAYH_SCHOOL_ID = "mrb-boys-sayh";

const FALEH_PRINCIPAL = {
  uid: "EJP7cQWlOldemQo6R6TciBZXSFt2",
  personId: "staff-EJP7cQWlOldemQo6R6TciBZXSFt2",
  roleKey: "BOYS_PRINCIPAL",
  schoolId: FALEH_SCHOOL_ID,
};

const SAYH_PRINCIPAL_EMAIL = "a-s-alkmays@qz.org.sa";

const FALEH_PLAN_ID =
  "mrb-boys-faleh-ay-1448-term-1-director-diagnostic-teacher-evaluation";
const FALEH_CYCLE_ID = `${FALEH_PLAN_ID}-diagnostic-01`;
const FALEH_TARGET_PERSON_ID = "p-k-alfanisan";
const DIAGNOSTIC_FRAMEWORK_ID =
  "director-diagnostic-teacher-evaluation-v1";

const SAYH_PLAN_ID =
  "mrb-boys-sayh-ay-1448-term-1-director-diagnostic-teacher-evaluation";
const SAYH_CYCLE_ID = `${SAYH_PLAN_ID}-diagnostic-01`;

function initAdmin() {
  if (admin.apps.length) return;

  const serviceAccountPath = path.resolve(
    process.cwd(),
    "service-account.json",
  );
  const serviceAccount = require(serviceAccountPath);

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    projectId: serviceAccount.project_id,
  });
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function readEnvFile(filePath) {
  const values = {};
  const content = fs.readFileSync(filePath, "utf8");

  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#")) continue;

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex < 1) continue;

    const key = trimmed.slice(0, separatorIndex).trim();
    const rawValue = trimmed.slice(separatorIndex + 1).trim();
    const value = rawValue.replace(/^(["'])(.*)\1$/, "$2");

    values[key] = value;
  }

  return values;
}

function membershipAllowsSchool(membership, schoolId) {
  return (
    membership.scopeId === schoolId ||
    membership.scopes?.schoolIds?.includes(schoolId) ||
    membership.scopes?.canAccessAllSchools === true
  );
}

async function getMembership(db, uid) {
  const snapshot = await db
    .doc(`users/${uid}/orgMemberships/${ORG_ID}`)
    .get();

  assert(snapshot.exists, `Membership not found for uid ${uid}.`);

  return snapshot.data();
}

async function exchangeCustomToken(apiKey, customToken) {
  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: customToken, returnSecureToken: true }),
    },
  );
  const body = await response.json();

  if (!response.ok || !body.idToken) {
    throw new Error(
      `Custom-token exchange failed with status ${response.status}.`,
    );
  }

  return body.idToken;
}

function firestoreBaseUrl(projectId) {
  return (
    `https://firestore.googleapis.com/v1/projects/${projectId}` +
    "/databases/(default)/documents"
  );
}

async function firestoreRequest(params) {
  const response = await fetch(params.url, {
    method: params.method || "GET",
    headers: {
      authorization: `Bearer ${params.idToken}`,
      ...(params.body ? { "content-type": "application/json" } : {}),
    },
    ...(params.body ? { body: JSON.stringify(params.body) } : {}),
  });
  const body = await response.json();

  return { status: response.status, body };
}

async function assertDocumentAllowed(params) {
  const result = await firestoreRequest({
    url: `${params.baseUrl}/${params.documentPath}`,
    idToken: params.idToken,
  });

  assert(
    result.status === 200,
    `${params.label} should be allowed; received ${result.status}.`,
  );
}

async function assertDocumentDenied(params) {
  const result = await firestoreRequest({
    url: `${params.baseUrl}/${params.documentPath}`,
    idToken: params.idToken,
  });

  assert(
    result.status === 403,
    `${params.label} should be denied; received ${result.status}.`,
  );
}

function equalityFilter(fieldPath, stringValue) {
  return {
    fieldFilter: {
      field: { fieldPath },
      op: "EQUAL",
      value: { stringValue },
    },
  };
}

async function assertQueryAllowed(params) {
  const result = await firestoreRequest({
    url: `${params.baseUrl}/orgs/${ORG_ID}:runQuery`,
    method: "POST",
    idToken: params.idToken,
    body: {
      structuredQuery: {
        from: [{ collectionId: params.collectionId }],
        where: {
          compositeFilter: {
            op: "AND",
            filters: params.filters,
          },
        },
        limit: Math.max(params.minimumDocuments, 1),
      },
    },
  });

  assert(
    result.status === 200,
    `${params.label} should be allowed; received ${result.status}.`,
  );

  const documents = Array.isArray(result.body)
    ? result.body.filter((row) => row.document)
    : [];

  assert(
    documents.length >= params.minimumDocuments,
    `${params.label} returned ${documents.length} documents.`,
  );
}

async function createIdentity(uid, apiKey) {
  const customToken = await admin.auth().createCustomToken(uid);
  return exchangeCustomToken(apiKey, customToken);
}

async function main() {
  initAdmin();

  const db = admin.firestore();
  const serviceAccount = require(
    path.resolve(process.cwd(), "service-account.json"),
  );
  const env = readEnvFile(
    path.resolve(process.cwd(), "apps/web-staff/.env.local"),
  );
  const apiKey = env.NEXT_PUBLIC_FIREBASE_API_KEY;
  const projectId =
    env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || serviceAccount.project_id;

  assert(apiKey, "NEXT_PUBLIC_FIREBASE_API_KEY is missing.");
  assert(projectId, "Firebase project id is missing.");

  const sayhUser = await admin.auth().getUserByEmail(SAYH_PRINCIPAL_EMAIL);
  const [falehMembership, sayhMembership] = await Promise.all([
    getMembership(db, FALEH_PRINCIPAL.uid),
    getMembership(db, sayhUser.uid),
  ]);

  const sayhPrincipal = {
    uid: sayhUser.uid,
    personId: sayhMembership.personId,
    roleKey: sayhMembership.roleKey || sayhMembership.role,
    schoolId: SAYH_SCHOOL_ID,
  };

  for (const [label, principal, membership] of [
    ["Faleh principal", FALEH_PRINCIPAL, falehMembership],
    ["Sayh principal", sayhPrincipal, sayhMembership],
  ]) {
    assert(
      (membership.roleKey || membership.role) === "BOYS_PRINCIPAL",
      `${label} role is not BOYS_PRINCIPAL.`,
    );
    assert(
      membership.permissions?.manageEvaluations === true,
      `${label} is missing manageEvaluations.`,
    );
    assert(
      membershipAllowsSchool(membership, principal.schoolId),
      `${label} cannot access the expected school.`,
    );
  }

  const [falehIdToken, sayhIdToken] = await Promise.all([
    createIdentity(FALEH_PRINCIPAL.uid, apiKey),
    createIdentity(sayhPrincipal.uid, apiKey),
  ]);
  const baseUrl = firestoreBaseUrl(projectId);

  await assertDocumentAllowed({
    baseUrl,
    idToken: falehIdToken,
    documentPath: `orgs/${ORG_ID}/evaluationCycles/${FALEH_CYCLE_ID}`,
    label: "Faleh principal reading a Faleh evaluation cycle",
  });
  await assertDocumentAllowed({
    baseUrl,
    idToken: falehIdToken,
    documentPath: `orgs/${ORG_ID}/evaluationPlans/${FALEH_PLAN_ID}`,
    label: "Faleh principal reading the Faleh evaluation plan",
  });
  await assertDocumentAllowed({
    baseUrl,
    idToken: falehIdToken,
    documentPath:
      `orgs/${ORG_ID}/evaluationTargetAssignments/` +
      `${FALEH_PLAN_ID}-target-${FALEH_TARGET_PERSON_ID}`,
    label: "Faleh principal reading the Faleh target assignment",
  });
  await assertDocumentAllowed({
    baseUrl,
    idToken: falehIdToken,
    documentPath:
      `orgs/${ORG_ID}/evaluationFrameworks/${DIAGNOSTIC_FRAMEWORK_ID}`,
    label: "Faleh principal reading the diagnostic framework",
  });
  await assertDocumentDenied({
    baseUrl,
    idToken: falehIdToken,
    documentPath: `orgs/${ORG_ID}/evaluationCycles/${SAYH_CYCLE_ID}`,
    label: "Faleh principal reading a Sayh evaluation cycle",
  });
  await assertDocumentAllowed({
    baseUrl,
    idToken: sayhIdToken,
    documentPath: `orgs/${ORG_ID}/evaluationCycles/${SAYH_CYCLE_ID}`,
    label: "Sayh principal reading a Sayh evaluation cycle",
  });
  await assertDocumentDenied({
    baseUrl,
    idToken: sayhIdToken,
    documentPath: `orgs/${ORG_ID}/evaluationCycles/${FALEH_CYCLE_ID}`,
    label: "Sayh principal reading a Faleh evaluation cycle",
  });

  await assertQueryAllowed({
    baseUrl,
    idToken: falehIdToken,
    collectionId: "evaluationEvaluatorAssignments",
    filters: [
      equalityFilter("schoolId", FALEH_SCHOOL_ID),
      equalityFilter("cycleId", FALEH_CYCLE_ID),
      equalityFilter("targetPersonId", FALEH_TARGET_PERSON_ID),
      equalityFilter("evaluatorPersonId", FALEH_PRINCIPAL.personId),
      equalityFilter("status", "ACTIVE"),
    ],
    minimumDocuments: 1,
    label: "Faleh evaluator assignment query",
  });

  await assertQueryAllowed({
    baseUrl,
    idToken: falehIdToken,
    collectionId: "evaluatorPolicies",
    filters: [
      equalityFilter("schoolId", FALEH_SCHOOL_ID),
      equalityFilter("planId", FALEH_PLAN_ID),
    ],
    minimumDocuments: 1,
    label: "Faleh evaluator policy query",
  });

  await assertQueryAllowed({
    baseUrl,
    idToken: falehIdToken,
    collectionId: "evaluationRubricSections",
    filters: [equalityFilter("frameworkId", DIAGNOSTIC_FRAMEWORK_ID)],
    minimumDocuments: 1,
    label: "Diagnostic rubric sections query",
  });

  await assertQueryAllowed({
    baseUrl,
    idToken: falehIdToken,
    collectionId: "evaluationRubricItems",
    filters: [equalityFilter("frameworkId", DIAGNOSTIC_FRAMEWORK_ID)],
    minimumDocuments: 21,
    label: "Diagnostic rubric items query",
  });

  await assertQueryAllowed({
    baseUrl,
    idToken: falehIdToken,
    collectionId: "evaluationSubmissions",
    filters: [
      equalityFilter("schoolId", FALEH_SCHOOL_ID),
      equalityFilter("cycleId", FALEH_CYCLE_ID),
      equalityFilter("targetPersonId", FALEH_TARGET_PERSON_ID),
      equalityFilter("evaluatorPersonId", FALEH_PRINCIPAL.personId),
    ],
    minimumDocuments: 0,
    label: "Faleh evaluation submission query",
  });

  console.log("Evaluation access scope verification passed.");
  console.dir({
    roleKey: "BOYS_PRINCIPAL",
    checks: {
      falehPrincipalInFaleh: "ALLOWED",
      falehPrincipalInSayh: "DENIED",
      sayhPrincipalInSayh: "ALLOWED",
      sayhPrincipalInFaleh: "DENIED",
      falehAssignmentQuery: "ALLOWED",
      falehPolicyQuery: "ALLOWED",
      falehFormReads: "ALLOWED",
    },
  });
}

main().catch((error) => {
  console.error("Evaluation access scope verification failed:");
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
