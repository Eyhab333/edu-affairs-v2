/* eslint-disable no-console */

const admin = require("firebase-admin");
const path = require("path");

const ORG_ID = process.env.ORG_ID || "takween";
const SCHOOL_ID = process.env.SCHOOL_ID || "mrb-boys-sayh";
const ACADEMIC_YEAR_ID = process.env.ACADEMIC_YEAR_ID || "ay-1448";
const TERM_ID = process.env.TERM_ID || "term-1";

const ADMIN_KIND = String(process.env.ADMIN_KIND || "").toLowerCase();
const TARGET_EMAIL = String(process.env.TARGET_EMAIL || "").toLowerCase();

const EVALUATOR_EMAIL = (
  process.env.EVALUATOR_EMAIL || "e.ahmad@qz.org.sa"
).toLowerCase();

const CYCLE_COUNT = 9;

const ADMIN_CONFIGS = {
  media: {
    frameworkId: "director-admin-media-evaluation-v1",
    planSlug: "director-admin-media-evaluation",
    title: "تقييم المدير للإعلامي",
    planTitle: "تقييم المدير للإعلامي - منار الريادة بنين السيح - الفصل الأول",
    roleKey: "MEDIA_SPECIALIST",
    roleLabel: "الإعلامي",
  },
  "admin-assistant": {
    frameworkId: "director-admin-assistant-evaluation-v1",
    planSlug: "director-admin-assistant-evaluation",
    title: "تقييم المدير للمساعد الإداري",
    planTitle:
      "تقييم المدير للمساعد الإداري - منار الريادة بنين السيح - الفصل الأول",
    roleKey: "ADMIN_ASSISTANT",
    roleLabel: "المساعد الإداري",
  },
  "activity-leader": {
    frameworkId: "director-admin-activity-leader-evaluation-v1",
    planSlug: "director-admin-activity-leader-evaluation",
    title: "تقييم المدير لرائد النشاط",
    planTitle:
      "تقييم المدير لرائد النشاط - منار الريادة بنين السيح - الفصل الأول",
    roleKey: "ACTIVITY_LEADER",
    roleLabel: "رائد النشاط",
  },
  "vice-principal": {
    frameworkId: "director-admin-vice-principal-evaluation-v1",
    planSlug: "director-admin-vice-principal-evaluation",
    title: "تقييم المدير لوكيل المدرسة",
    planTitle:
      "تقييم المدير لوكيل المدرسة - منار الريادة بنين السيح - الفصل الأول",
    roleKey: "SCHOOL_VICE_PRINCIPAL",
    roleLabel: "وكيل المدرسة",
  },
  "student-counselor": {
    frameworkId: "director-admin-student-counselor-evaluation-v1",
    planSlug: "director-admin-student-counselor-evaluation",
    title: "تقييم المدير للموجه الطلابي",
    planTitle:
      "تقييم المدير للموجه الطلابي - منار الريادة بنين السيح - الفصل الأول",
    roleKey: "STUDENT_COUNSELOR",
    roleLabel: "الموجه الطلابي",
  },
};

function initAdmin() {
  if (admin.apps.length) return;

  const serviceAccountPath = path.resolve(
    process.cwd(),
    "service-account.json"
  );

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

function pad(value) {
  return String(value).padStart(2, "0");
}

function evaluationTitle(value) {
  const titles = {
    1: "التقييم الأول",
    2: "التقييم الثاني",
    3: "التقييم الثالث",
    4: "التقييم الرابع",
    5: "التقييم الخامس",
    6: "التقييم السادس",
    7: "التقييم السابع",
    8: "التقييم الثامن",
    9: "التقييم التاسع",
  };

  return titles[value] || `التقييم ${value}`;
}

async function assertDoc(db, pathValue, label) {
  const snap = await db.doc(pathValue).get();

  if (!snap.exists) {
    throw new Error(`${label} not found: ${pathValue}`);
  }

  return dataWithId(snap);
}

async function findPersonByEmail(db, email) {
  const snap = await db
    .collection(`orgs/${ORG_ID}/people`)
    .where("email", "==", email)
    .limit(1)
    .get();

  if (!snap.empty) return dataWithId(snap.docs[0]);

  const allSnap = await db.collection(`orgs/${ORG_ID}/people`).get();

  return (
    allSnap.docs
      .map(dataWithId)
      .find((person) => String(person.email || "").toLowerCase() === email) ||
    null
  );
}

async function findUserByEmail(db, email) {
  const snap = await db
    .collection("users")
    .where("email", "==", email)
    .limit(1)
    .get();

  if (!snap.empty) return dataWithId(snap.docs[0]);

  return null;
}

async function getUserRoleKey(db, userId) {
  if (!userId) return "";

  const snap = await db.doc(`users/${userId}/orgMemberships/${ORG_ID}`).get();

  if (!snap.exists) return "";

  const data = snap.data() || {};

  return data.roleKey || data.role || "";
}

async function getTargetRoleKey(db, targetPersonId, fallbackRoleKey) {
  const membershipSnap = await db
    .collection(`orgs/${ORG_ID}/operationalMemberships`)
    .where("personId", "==", targetPersonId)
    .where("isActive", "==", true)
    .limit(1)
    .get();

  if (!membershipSnap.empty) {
    const data = membershipSnap.docs[0].data();
    return data.roleKey || fallbackRoleKey;
  }

  return fallbackRoleKey;
}

async function upsert(db, pathValue, data) {
  await db.doc(pathValue).set(data, { merge: true });
}

async function main() {
  const config = ADMIN_CONFIGS[ADMIN_KIND];

  if (!config) {
    throw new Error(
      `ADMIN_KIND is required. Use one of: ${Object.keys(ADMIN_CONFIGS).join(
        ", "
      )}`
    );
  }

  if (!TARGET_EMAIL) {
    throw new Error(
      "TARGET_EMAIL is required. Example: $env:TARGET_EMAIL='employee@qz.org.sa'"
    );
  }

  initAdmin();

  const db = admin.firestore();
  const ts = Date.now();

  const planId = `${SCHOOL_ID}-${ACADEMIC_YEAR_ID}-${TERM_ID}-${config.planSlug}`;

  console.log("Seeding admin role evaluation demo...");
  console.log({
    orgId: ORG_ID,
    schoolId: SCHOOL_ID,
    academicYearId: ACADEMIC_YEAR_ID,
    termId: TERM_ID,
    adminKind: ADMIN_KIND,
    frameworkId: config.frameworkId,
    planId,
    targetEmail: TARGET_EMAIL,
    evaluatorEmail: EVALUATOR_EMAIL,
  });

  const [school, academicYear, framework] = await Promise.all([
    assertDoc(db, `orgs/${ORG_ID}/schools/${SCHOOL_ID}`, "School"),
    assertDoc(
      db,
      `orgs/${ORG_ID}/schools/${SCHOOL_ID}/academicYears/${ACADEMIC_YEAR_ID}`,
      "Academic year"
    ),
    assertDoc(
      db,
      `orgs/${ORG_ID}/evaluationFrameworks/${config.frameworkId}`,
      "Evaluation framework"
    ),
  ]);

  console.log("School:", school.name || school.id);
  console.log("Academic year:", academicYear.title || academicYear.id);
  console.log("Framework:", framework.title || framework.id);

  const targetPerson = await findPersonByEmail(db, TARGET_EMAIL);
  if (!targetPerson) {
    throw new Error(`Target person not found: ${TARGET_EMAIL}`);
  }

  const evaluatorPerson = await findPersonByEmail(db, EVALUATOR_EMAIL);
  if (!evaluatorPerson) {
    throw new Error(`Evaluator person not found: ${EVALUATOR_EMAIL}`);
  }

  const evaluatorUser = await findUserByEmail(db, EVALUATOR_EMAIL);
  const evaluatorRoleKey =
    (evaluatorUser && (await getUserRoleKey(db, evaluatorUser.id))) ||
    "platform_owner";

  const targetRoleKey = await getTargetRoleKey(
    db,
    targetPerson.id,
    config.roleKey
  );

  console.log("Evaluator:");
  console.log({
    personId: evaluatorPerson.id,
    displayName: evaluatorPerson.displayName,
    email: evaluatorPerson.email,
    roleKey: evaluatorRoleKey,
  });

  console.log("Target:");
  console.log({
    personId: targetPerson.id,
    displayName: targetPerson.displayName,
    email: targetPerson.email,
    roleKey: targetRoleKey,
    roleLabel: config.roleLabel,
  });

  const plan = {
    id: planId,
    orgId: ORG_ID,
    schoolId: SCHOOL_ID,
    academicYearId: ACADEMIC_YEAR_ID,
    termId: TERM_ID,

    title: config.planTitle,
    description: `خطة تطبيق ${config.title} 9 مرات داخل الفصل الدراسي.`,

    frameworkId: config.frameworkId,
    planKind: "PERIODIC",
    targetKind: "ADMIN_STAFF",
    targetRoleKey,
    targetRoleLabel: config.roleLabel,

    status: "ACTIVE",

    createdAt: ts,
    updatedAt: ts,
  };

  const evaluatorPolicy = {
    id: `${planId}-policy-director`,
    orgId: ORG_ID,
    planId,

    evaluatorRoleKey,
    evaluatorLabel: "مدير المدرسة / المقيم التجريبي",
    weight: 100,

    required: true,
    canSubmit: true,
    canReview: false,
    canApprove: true,

    order: 1,
    createdAt: ts,
    updatedAt: ts,
  };

  const targetAssignment = {
    id: `${planId}-target-${targetPerson.id}`,
    orgId: ORG_ID,
    schoolId: SCHOOL_ID,
    academicYearId: ACADEMIC_YEAR_ID,
    termId: TERM_ID,

    planId,

    targetPersonId: targetPerson.id,
    targetEmail: TARGET_EMAIL,
    targetDisplayName: targetPerson.displayName || TARGET_EMAIL,
    targetRoleKey,
    targetRoleLabel: config.roleLabel,
    targetKind: "ADMIN_STAFF",

    status: "ACTIVE",
    assignedAt: ts,
    createdAt: ts,
    updatedAt: ts,
  };

  const writes = [
    upsert(db, `orgs/${ORG_ID}/evaluationPlans/${planId}`, plan),
    upsert(
      db,
      `orgs/${ORG_ID}/evaluatorPolicies/${evaluatorPolicy.id}`,
      evaluatorPolicy
    ),
    upsert(
      db,
      `orgs/${ORG_ID}/evaluationTargetAssignments/${targetAssignment.id}`,
      targetAssignment
    ),
  ];

  for (let index = 1; index <= CYCLE_COUNT; index += 1) {
    const cycleId = `${planId}-evaluation-${pad(index)}`;

    const cycle = {
      id: cycleId,
      orgId: ORG_ID,
      schoolId: SCHOOL_ID,
      academicYearId: ACADEMIC_YEAR_ID,
      termId: TERM_ID,

      planId,
      cycleNumber: index,
      title: evaluationTitle(index),
      cycleKind: "CUSTOM",
      status: "OPEN",
      isIncludedInAverage: true,

      createdAt: ts,
      updatedAt: ts,
    };

    const evaluatorAssignmentId = `${planId}-${cycleId}-${targetPerson.id}-${evaluatorPerson.id}`;

    const evaluatorAssignment = {
      id: evaluatorAssignmentId,
      orgId: ORG_ID,
      schoolId: SCHOOL_ID,
      academicYearId: ACADEMIC_YEAR_ID,
      termId: TERM_ID,

      planId,
      cycleId,

      targetPersonId: targetPerson.id,
      targetRoleKey,
      targetRoleLabel: config.roleLabel,

      evaluatorPersonId: evaluatorPerson.id,
      evaluatorEmail: EVALUATOR_EMAIL,
      evaluatorRoleKey,

      weight: 100,
      sourceType: "AUTO_GENERATED",
      status: "ACTIVE",

      createdAt: ts,
      updatedAt: ts,
    };

    writes.push(upsert(db, `orgs/${ORG_ID}/evaluationCycles/${cycleId}`, cycle));

    writes.push(
      upsert(
        db,
        `orgs/${ORG_ID}/evaluationEvaluatorAssignments/${evaluatorAssignmentId}`,
        evaluatorAssignment
      )
    );
  }

  await Promise.all(writes);

  console.log("\n✅ Admin role evaluation demo seed completed.");
  console.log({
    adminKind: ADMIN_KIND,
    roleLabel: config.roleLabel,
    planId,
    cyclesCreatedOrUpdated: CYCLE_COUNT,
    targetPersonId: targetPerson.id,
    evaluatorPersonId: evaluatorPerson.id,
  });
}

main().catch((error) => {
  console.error("\n❌ Admin role evaluation demo seed failed:");
  console.error(error);
  process.exit(1);
});