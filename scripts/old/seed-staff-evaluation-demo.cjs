/* eslint-disable no-console */

const admin = require("firebase-admin");
const path = require("path");

const ORG_ID = process.env.ORG_ID || "takween";
const SCHOOL_ID = process.env.SCHOOL_ID || "mrb-boys-sayh";
const ACADEMIC_YEAR_ID = process.env.ACADEMIC_YEAR_ID || "ay-1448";
const TERM_ID = process.env.TERM_ID || "term-1";

const EVALUATOR_EMAIL = (
  process.env.EVALUATOR_EMAIL || "e.ahmad@qz.org.sa"
).toLowerCase();

const TARGET_EMAIL = (
  process.env.TARGET_EMAIL || "a.brakat@qz.org.sa"
).toLowerCase();

const FRAMEWORK_ID = "weekly-teacher-evaluation-v1";
const PLAN_ID =
  "mrb-boys-sayh-ay-1448-term-1-weekly-teacher-evaluation";
const CYCLE_ID =
  "mrb-boys-sayh-ay-1448-term-1-weekly-teacher-evaluation-week-01";

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

function now() {
  return Date.now();
}

function dataWithId(doc) {
  return {
    id: doc.id,
    path: doc.ref.path,
    ...doc.data(),
  };
}

async function findPersonByEmail(db, email) {
  const peopleRef = db.collection(`orgs/${ORG_ID}/people`);

  const exactSnap = await peopleRef.where("email", "==", email).get();

  if (!exactSnap.empty) {
    return dataWithId(exactSnap.docs[0]);
  }

  const allSnap = await peopleRef.get();

  const found = allSnap.docs
    .map(dataWithId)
    .find((person) => String(person.email || "").toLowerCase() === email);

  return found || null;
}

async function findUserByEmail(db, email) {
  const usersRef = db.collection("users");

  const exactSnap = await usersRef.where("email", "==", email).get();

  if (!exactSnap.empty) {
    return dataWithId(exactSnap.docs[0]);
  }

  const allSnap = await usersRef.get();

  const found = allSnap.docs
    .map(dataWithId)
    .find((user) => String(user.email || "").toLowerCase() === email);

  return found || null;
}

async function getUserRoleKey(db, userId) {
  if (!userId) return "";

  const membershipRef = db.doc(
    `users/${userId}/orgMemberships/${ORG_ID}`
  );

  const snap = await membershipRef.get();

  if (!snap.exists) return "";

  const data = snap.data() || {};

  return data.roleKey || data.role || "";
}

async function getTargetRoleKey(db, targetPersonId) {
  const operationalSnap = await db
    .collection(`orgs/${ORG_ID}/operationalMemberships`)
    .where("personId", "==", targetPersonId)
    .where("isActive", "==", true)
    .limit(1)
    .get();

  if (!operationalSnap.empty) {
    const data = operationalSnap.docs[0].data();
    return data.roleKey || "";
  }

  const teacherSnap = await db
    .collection(`orgs/${ORG_ID}/teacherAssignments`)
    .where("teacherPersonId", "==", targetPersonId)
    .where("status", "==", "ACTIVE")
    .limit(1)
    .get();

  if (!teacherSnap.empty) {
    return "BOYS_TEACHER";
  }

  return "TEACHER";
}

async function assertSchoolContext(db) {
  const schoolRef = db.doc(`orgs/${ORG_ID}/schools/${SCHOOL_ID}`);
  const schoolSnap = await schoolRef.get();

  if (!schoolSnap.exists) {
    throw new Error(`School not found: ${schoolRef.path}`);
  }

  const yearRef = db.doc(
    `orgs/${ORG_ID}/schools/${SCHOOL_ID}/academicYears/${ACADEMIC_YEAR_ID}`
  );
  const yearSnap = await yearRef.get();

  if (!yearSnap.exists) {
    throw new Error(`Academic year not found: ${yearRef.path}`);
  }

  return {
    school: dataWithId(schoolSnap),
    academicYear: dataWithId(yearSnap),
  };
}

function buildSections(ts) {
  return [
    {
      id: `${FRAMEWORK_ID}-planning`,
      orgId: ORG_ID,
      frameworkId: FRAMEWORK_ID,
      title: "التخطيط والتحضير",
      description: "",
      order: 1,
      weight: 20,
      isActive: true,
      createdAt: ts,
      updatedAt: ts,
    },
    {
      id: `${FRAMEWORK_ID}-classroom-management`,
      orgId: ORG_ID,
      frameworkId: FRAMEWORK_ID,
      title: "إدارة الصف",
      description: "",
      order: 2,
      weight: 25,
      isActive: true,
      createdAt: ts,
      updatedAt: ts,
    },
    {
      id: `${FRAMEWORK_ID}-lesson-delivery`,
      orgId: ORG_ID,
      frameworkId: FRAMEWORK_ID,
      title: "تنفيذ الدرس",
      description: "",
      order: 3,
      weight: 25,
      isActive: true,
      createdAt: ts,
      updatedAt: ts,
    },
    {
      id: `${FRAMEWORK_ID}-student-interaction`,
      orgId: ORG_ID,
      frameworkId: FRAMEWORK_ID,
      title: "التفاعل مع الطلاب",
      description: "",
      order: 4,
      weight: 20,
      isActive: true,
      createdAt: ts,
      updatedAt: ts,
    },
    {
      id: `${FRAMEWORK_ID}-professional-commitment`,
      orgId: ORG_ID,
      frameworkId: FRAMEWORK_ID,
      title: "الالتزام المهني",
      description: "",
      order: 5,
      weight: 10,
      isActive: true,
      createdAt: ts,
      updatedAt: ts,
    },
  ];
}

function buildItems(ts) {
  const rows = [
    [
      "planning",
      [
        "يلتزم بتحضير الدرس قبل موعده",
        "يحدد أهداف الدرس بوضوح",
        "يجهز الوسائل والأنشطة المناسبة",
      ],
    ],
    [
      "classroom-management",
      [
        "يحافظ على انضباط الصف",
        "يتعامل مع الطلاب بهدوء وعدل",
        "يستثمر وقت الحصة بفاعلية",
      ],
    ],
    [
      "lesson-delivery",
      [
        "يشرح المفاهيم بوضوح",
        "يستخدم أساليب تعليم متنوعة",
        "يربط الدرس بأمثلة مناسبة",
      ],
    ],
    [
      "student-interaction",
      [
        "يشجع مشاركة الطلاب",
        "يراعي الفروق الفردية",
        "يقدم تغذية راجعة مناسبة",
      ],
    ],
    [
      "professional-commitment",
      [
        "يلتزم بالحضور والانصراف",
        "يتعاون مع الإدارة والزملاء",
      ],
    ],
  ];

  const items = [];

  for (const [sectionKey, titles] of rows) {
    const sectionId = `${FRAMEWORK_ID}-${sectionKey}`;

    titles.forEach((title, index) => {
      const itemNo = String(index + 1).padStart(2, "0");

      items.push({
        id: `${sectionId}-${itemNo}`,
        orgId: ORG_ID,
        frameworkId: FRAMEWORK_ID,
        sectionId,
        title,
        description: "",
        order: index + 1,
        maxScore: 5,
        scoreInputType: "SCORE",
        isRequired: true,
        isActive: true,
        createdAt: ts,
        updatedAt: ts,
      });
    });
  }

  return items;
}

async function upsert(db, collectionPath, id, data) {
  await db.doc(`${collectionPath}/${id}`).set(data, { merge: true });
}

async function main() {
  initAdmin();

  const db = admin.firestore();

  const ts = now();

  console.log("Seeding staff evaluation demo...");
  console.log({
    orgId: ORG_ID,
    schoolId: SCHOOL_ID,
    academicYearId: ACADEMIC_YEAR_ID,
    termId: TERM_ID,
    evaluatorEmail: EVALUATOR_EMAIL,
    targetEmail: TARGET_EMAIL,
  });

  const { school, academicYear } = await assertSchoolContext(db);

  console.log("School:", school.name || school.id);
  console.log("Academic year:", academicYear.title || academicYear.id);

  const evaluatorPerson = await findPersonByEmail(db, EVALUATOR_EMAIL);
  if (!evaluatorPerson) {
    throw new Error(`Evaluator person not found: ${EVALUATOR_EMAIL}`);
  }

  const targetPerson = await findPersonByEmail(db, TARGET_EMAIL);
  if (!targetPerson) {
    throw new Error(`Target person not found: ${TARGET_EMAIL}`);
  }

  const evaluatorUser = await findUserByEmail(db, EVALUATOR_EMAIL);
  const evaluatorRoleKey =
    (evaluatorUser && (await getUserRoleKey(db, evaluatorUser.id))) ||
    "platform_owner";

  const targetRoleKey = await getTargetRoleKey(db, targetPerson.id);

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
  });

  const framework = {
    id: FRAMEWORK_ID,
    orgId: ORG_ID,
    title: "تقييم أسبوعي للمعلم",
    description: "قالب تجريبي لتقييم المعلم أسبوعيًا.",
    targetKind: "TEACHER",
    frameworkKind: "WEEKLY_TEACHER_EVALUATION",
    schoolTypes: ["PRIMARY"],
    isActive: true,
    version: 1,
    createdAt: ts,
    updatedAt: ts,
  };

  const sections = buildSections(ts);
  const items = buildItems(ts);

  const plan = {
    id: PLAN_ID,
    orgId: ORG_ID,
    schoolId: SCHOOL_ID,
    academicYearId: ACADEMIC_YEAR_ID,
    termId: TERM_ID,
    title: "تقييم معلمي مدرسة منار الريادة بنين السيح - الفصل الأول",
    description: "خطة تجريبية لتشغيل محرك تقييم المعلمين.",
    frameworkId: FRAMEWORK_ID,
    planKind: "WEEKLY",
    targetKind: "TEACHER",
    status: "ACTIVE",
    createdAt: ts,
    updatedAt: ts,
  };

  const policy = {
    id: `${PLAN_ID}-policy-platform-owner`,
    orgId: ORG_ID,
    planId: PLAN_ID,
    evaluatorRoleKey,
    evaluatorLabel: "المقيم التجريبي",
    weight: 100,
    required: true,
    canSubmit: true,
    canReview: false,
    canApprove: true,
    order: 1,
    createdAt: ts,
    updatedAt: ts,
  };

  const cycle = {
    id: CYCLE_ID,
    orgId: ORG_ID,
    schoolId: SCHOOL_ID,
    academicYearId: ACADEMIC_YEAR_ID,
    termId: TERM_ID,
    planId: PLAN_ID,
    cycleNumber: 1,
    title: "الأسبوع الأول",
    cycleKind: "WEEK",
    status: "OPEN",
    isIncludedInAverage: true,
    createdAt: ts,
    updatedAt: ts,
  };

  const targetAssignment = {
    id: `${PLAN_ID}-target-${targetPerson.id}`,
    orgId: ORG_ID,
    schoolId: SCHOOL_ID,
    academicYearId: ACADEMIC_YEAR_ID,
    termId: TERM_ID,
    planId: PLAN_ID,
    targetPersonId: targetPerson.id,
    targetEmail: TARGET_EMAIL,
    targetDisplayName: targetPerson.displayName || TARGET_EMAIL,
    targetRoleKey,
    targetKind: "TEACHER",
    status: "ACTIVE",
    assignedAt: ts,
    createdAt: ts,
    updatedAt: ts,
  };

  const evaluatorAssignment = {
    id: `${PLAN_ID}-${CYCLE_ID}-${targetPerson.id}-${evaluatorPerson.id}`,
    orgId: ORG_ID,
    schoolId: SCHOOL_ID,
    academicYearId: ACADEMIC_YEAR_ID,
    termId: TERM_ID,
    planId: PLAN_ID,
    cycleId: CYCLE_ID,
    targetPersonId: targetPerson.id,
    evaluatorPersonId: evaluatorPerson.id,
    evaluatorEmail: EVALUATOR_EMAIL,
    evaluatorRoleKey,
    weight: 100,
    sourceType: "SEED",
    status: "ACTIVE",
    createdAt: ts,
    updatedAt: ts,
  };

  const writes = [];

  writes.push(
    upsert(
      db,
      `orgs/${ORG_ID}/evaluationFrameworks`,
      framework.id,
      framework
    )
  );

  for (const section of sections) {
    writes.push(
      upsert(
        db,
        `orgs/${ORG_ID}/evaluationRubricSections`,
        section.id,
        section
      )
    );
  }

  for (const item of items) {
    writes.push(
      upsert(
        db,
        `orgs/${ORG_ID}/evaluationRubricItems`,
        item.id,
        item
      )
    );
  }

  writes.push(
    upsert(db, `orgs/${ORG_ID}/evaluationPlans`, plan.id, plan)
  );

  writes.push(
    upsert(db, `orgs/${ORG_ID}/evaluatorPolicies`, policy.id, policy)
  );

  writes.push(
    upsert(db, `orgs/${ORG_ID}/evaluationCycles`, cycle.id, cycle)
  );

  writes.push(
    upsert(
      db,
      `orgs/${ORG_ID}/evaluationTargetAssignments`,
      targetAssignment.id,
      targetAssignment
    )
  );

  writes.push(
    upsert(
      db,
      `orgs/${ORG_ID}/evaluationEvaluatorAssignments`,
      evaluatorAssignment.id,
      evaluatorAssignment
    )
  );

  await Promise.all(writes);

  console.log("\n✅ Seed completed successfully.");
  console.log({
    frameworksUpserted: 1,
    sectionsUpserted: sections.length,
    itemsUpserted: items.length,
    plansUpserted: 1,
    policiesUpserted: 1,
    cyclesUpserted: 1,
    targetAssignmentsUpserted: 1,
    evaluatorAssignmentsUpserted: 1,
  });

  console.log("\nCreated/updated IDs:");
  console.log({
    frameworkId: FRAMEWORK_ID,
    planId: PLAN_ID,
    cycleId: CYCLE_ID,
    targetAssignmentId: targetAssignment.id,
    evaluatorAssignmentId: evaluatorAssignment.id,
  });
}

main().catch((error) => {
  console.error("\n❌ Seed failed:");
  console.error(error);
  process.exit(1);
});