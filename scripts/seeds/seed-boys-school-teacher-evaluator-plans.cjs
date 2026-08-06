/* eslint-disable no-console */

const admin = require("firebase-admin");
const path = require("path");

const APPLY = process.argv.includes("--apply");

const CONFIG = {
  orgId: "takween",
  academicYearId: "ay-1448",
  termId: "term-1",
  teacherRoleKey: "BOYS_TEACHER",
  schools: [
    {
      key: "sayh",
      id: "mrb-boys-sayh",
      label: "منار الريادة بنين السيح",
      evaluators: {
        BOYS_STUDENT_GUIDE: {
          uid: "FLC6Mymy87PVqo4OR7EIJGZtZdx1",
          personId: "p-students-mentor-syeh",
          displayName: "الموجه الطلابي",
          email: "students-mentor-syeh@qz.org.sa",
          roleKey: "BOYS_STUDENT_GUIDE",
          roleLabel: "الموجه الطلابي",
        },
        BOYS_VP: {
          uid: "bxh4JOI56QdkFoM6ub0xbjpKEHv2",
          personId: "p-r-almutawa",
          displayName: "رائد سليمان المطوع",
          email: "r.almutawa@qz.org.sa",
          roleKey: "BOYS_VP",
          roleLabel: "وكيل المدرسة",
        },
        BOYS_EDU_VP: {
          uid: "6V8WflFTNzWpejeOrv8JKzfqQC12",
          personId: "p-m-alateeq",
          displayName: "محمد صالح حمد العتيق",
          email: "m.alateeq@qz.org.sa",
          roleKey: "BOYS_EDU_VP",
          roleLabel: "الوكيل التعليمي",
        },
      },
    },
    {
      key: "faleh",
      id: "mrb-boys-faleh",
      label: "منار الريادة بنين الفالح",
      evaluators: {
        BOYS_STUDENT_GUIDE: {
          uid: "gm37B5cNxxUyIasU9G70zHgVkEj2",
          personId: "staff-gm37B5cNxxUyIasU9G70zHgVkEj2",
          displayName: "الموجه الطلابي",
          email: "students-mentor-faleh@qz.org.sa",
          roleKey: "BOYS_STUDENT_GUIDE",
          roleLabel: "الموجه الطلابي",
        },
        BOYS_VP: {
          uid: "qU0t5pxQOthttvJz4IlfJlhw7Gg2",
          personId: "p-ralfaiz",
          displayName: "راشد سليمان فايز الفايز",
          email: "ralfaiz@qz.org.sa",
          roleKey: "BOYS_VP",
          roleLabel: "وكيل المدرسة",
        },
        BOYS_EDU_VP: {
          uid: "H2KAczlZXTRKfVwvbVLLixnufMu2",
          personId: "staff-H2KAczlZXTRKfVwvbVLLixnufMu2",
          displayName: "الوكيل التعليمي",
          email: "educational-agent-faleh@qz.org.sa",
          roleKey: "BOYS_EDU_VP",
          roleLabel: "الوكيل التعليمي",
        },
      },
    },
  ],
};

const WEEK_TITLES = [
  "الأسبوع الأول",
  "الأسبوع الثاني",
  "الأسبوع الثالث",
  "الأسبوع الرابع",
  "الأسبوع الخامس",
  "الأسبوع السادس",
  "الأسبوع السابع",
  "الأسبوع الثامن",
  "الأسبوع التاسع",
  "الأسبوع العاشر",
  "الأسبوع الحادي عشر",
  "الأسبوع الثاني عشر",
  "الأسبوع الثالث عشر",
  "الأسبوع الرابع عشر",
  "الأسبوع الخامس عشر",
  "الأسبوع السادس عشر",
  "الأسبوع السابع عشر",
  "الأسبوع الثامن عشر",
  "الأسبوع التاسع عشر",
];

const DIAGNOSTIC_ITEMS = [
  "التحضير الذهني والكتابي",
  "الالتزام بخطة توزيع المنهج",
  "التهيئة المناسبة للدرس",
  "إعداد الوسائل المناسبة وتوظيفها",
  "استخدام السبورة وتنظيمها",
  "التسلسل المنطقي في عرض الدرس",
  "مراعاة الفروق الفردية",
  "التقويم القبلي والتكويني والختامي",
  "الالتزام باللغة الفصحى نطقًا وكتابة",
  "التدرج في معالجة أخطاء التلميذ",
  "تفعيل استراتيجيات التدريس الحديثة",
  "استراتيجية التدريس مناسبة للدرس",
  "ضبط الصف وإدارته",
  "إدارة الوقت بفاعلية",
  "إثارة الدافعية وتعزيز الإجابات",
  "ربط الدرس بواقع حياة التلميذ",
  "التركيز على ترسيخ القيم المستهدفة",
  "تحقيق أهداف الدرس",
  "ربط الأهداف بالتقويم",
  "مهارة إغلاق الدرس",
  "إشباع مهارات المادة",
];

const FRAMEWORKS = [
  {
    key: "student-guide-weekly",
    id: "student-guide-weekly-teacher-evaluation-v1",
    planSlug: "student-guide-weekly-teacher-evaluation",
    title: "تقييم الموجه الأسبوعي للمعلمين",
    description: "قالب رسمي لمتابعة الموجه للمعلمين أسبوعيًا داخل الفصل الدراسي.",
    evaluatorRoleKey: "BOYS_STUDENT_GUIDE",
    evaluatorKind: "STUDENT_GUIDE",
    evaluatorLabel: "الموجه الطلابي",
    planKind: "WEEKLY",
    frameworkKind: "WEEKLY_TEACHER_EVALUATION",
    cycles: WEEK_TITLES.map((title, index) => ({
      number: index + 1,
      title,
      suffix: `week-${String(index + 1).padStart(2, "0")}`,
      kind: "WEEK",
    })),
    items: ["سجل المهارات", "مذكرة الواجبات", "متابعة الفواقد"],
  },
  {
    key: "school-vice-principal-weekly",
    id: "school-vice-principal-weekly-teacher-evaluation-v1",
    planSlug: "school-vice-principal-weekly-teacher-evaluation",
    title: "تقييم وكيل المدرسة الأسبوعي للمعلمين",
    description: "قالب رسمي لمتابعة وكيل المدرسة للمعلمين أسبوعيًا داخل الفصل الدراسي.",
    evaluatorRoleKey: "BOYS_VP",
    evaluatorKind: "SCHOOL_VICE_PRINCIPAL",
    evaluatorLabel: "وكيل المدرسة",
    planKind: "WEEKLY",
    frameworkKind: "WEEKLY_TEACHER_EVALUATION",
    cycles: WEEK_TITLES.map((title, index) => ({
      number: index + 1,
      title,
      suffix: `week-${String(index + 1).padStart(2, "0")}`,
      kind: "WEEK",
    })),
    items: [
      "دخول الحصص",
      "الإشراف في الفسح",
      "المناوبة",
      "التواصل مع أولياء الأمور",
      "التعاون بما يسند له من مهام",
      "الاصطفاف الصباحي",
      "تفعيل حصص الانتظار",
    ],
  },
  {
    key: "educational-vice-principal-weekly",
    id: "educational-vice-principal-weekly-teacher-evaluation-v1",
    planSlug: "educational-vice-principal-weekly-teacher-evaluation",
    title: "تقييم الوكيل التعليمي الأسبوعي للمعلمين",
    description: "قالب رسمي لمتابعة الوكيل التعليمي للمعلمين أسبوعيًا داخل الفصل الدراسي.",
    evaluatorRoleKey: "BOYS_EDU_VP",
    evaluatorKind: "EDUCATIONAL_VICE_PRINCIPAL",
    evaluatorLabel: "الوكيل التعليمي",
    planKind: "WEEKLY",
    frameworkKind: "WEEKLY_TEACHER_EVALUATION",
    cycles: WEEK_TITLES.map((title, index) => ({
      number: index + 1,
      title,
      suffix: `week-${String(index + 1).padStart(2, "0")}`,
      kind: "WEEK",
    })),
    items: [
      "مذكرة القياس",
      "سجل المتابعة",
      "الكتاب المدرسي",
      "الفاقد التعليمي",
      "تحفيز المعلم للطلاب",
      "أوراق العمل",
      "سجل المهارات",
    ],
  },
  {
    key: "educational-vice-principal-diagnostic",
    id: "educational-vice-principal-diagnostic-teacher-evaluation-v1",
    planSlug: "educational-vice-principal-diagnostic-teacher-evaluation",
    title: "التقييم التشخيصي للمعلمين بواسطة الوكيل التعليمي",
    description: "قالب رسمي لتقييم الوكيل التعليمي التشخيصي للمعلمين مرة واحدة داخل الفصل الدراسي.",
    evaluatorRoleKey: "BOYS_EDU_VP",
    evaluatorKind: "EDUCATIONAL_VICE_PRINCIPAL",
    evaluatorLabel: "الوكيل التعليمي",
    planKind: "PERIODIC",
    frameworkKind: "CLASSROOM_VISIT",
    cycles: [
      {
        number: 1,
        title: "التقييم التشخيصي",
        suffix: "diagnostic-01",
        kind: "CUSTOM",
      },
    ],
    items: DIAGNOSTIC_ITEMS,
  },
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

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function asString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeEmail(value) {
  return asString(value).toLowerCase();
}

function isActive(data) {
  const status = asString(data.status).toUpperCase();

  return (
    data.isActive !== false &&
    data.active !== false &&
    !["DISABLED", "ENDED", "INACTIVE", "REVOKED"].includes(status)
  );
}

function membershipCoversSchool(data, schoolId) {
  return (
    asString(data.schoolId) === schoolId ||
    asString(data.scopeId) === schoolId ||
    data.scopes?.schoolIds?.includes(schoolId) ||
    data.scopes?.canAccessAllSchools === true
  );
}

function uniqueDocuments(documents) {
  return Array.from(
    new Map(documents.map((document) => [document.ref.path, document])).values(),
  );
}

function chunk(values, size) {
  const chunks = [];

  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }

  return chunks;
}

async function readRequiredDoc(db, documentPath, label) {
  const snapshot = await db.doc(documentPath).get();
  assert(snapshot.exists, `${label} not found: ${documentPath}`);
  return snapshot;
}

async function loadSchoolMemberships(db, collectionPath, schoolId) {
  const [bySchoolId, byScopeId, bySchoolIds] = await Promise.all([
    db.collection(collectionPath).where("schoolId", "==", schoolId).get(),
    db.collection(collectionPath).where("scopeId", "==", schoolId).get(),
    db.collection(collectionPath)
      .where("scopes.schoolIds", "array-contains", schoolId)
      .get(),
  ]);

  return uniqueDocuments([
    ...bySchoolId.docs,
    ...byScopeId.docs,
    ...bySchoolIds.docs,
  ]);
}

async function validateEvaluator(db, orgRoot, school, evaluator) {
  const [authUser, user, person, membership] = await Promise.all([
    admin.auth().getUser(evaluator.uid),
    readRequiredDoc(db, `users/${evaluator.uid}`, `${evaluator.roleLabel} user`),
    readRequiredDoc(db, `${orgRoot}/people/${evaluator.personId}`, `${evaluator.roleLabel} person`),
    readRequiredDoc(
      db,
      `users/${evaluator.uid}/orgMemberships/${CONFIG.orgId}`,
      `${evaluator.roleLabel} membership`,
    ),
  ]);
  const userData = user.data();
  const personData = person.data();
  const membershipData = membership.data();

  assert(normalizeEmail(authUser.email) === evaluator.email, `${school.key} ${evaluator.roleKey} auth email mismatch.`);
  assert(normalizeEmail(userData.email || personData.email) === evaluator.email, `${school.key} ${evaluator.roleKey} email mismatch.`);
  assert(asString(membershipData.personId) === evaluator.personId, `${school.key} ${evaluator.roleKey} personId mismatch.`);
  assert(asString(membershipData.roleKey || membershipData.role).toUpperCase() === evaluator.roleKey, `${school.key} ${evaluator.roleKey} role mismatch.`);
  assert(isActive(membershipData), `${school.key} ${evaluator.roleKey} membership is inactive.`);
  assert(membershipCoversSchool(membershipData, school.id), `${school.key} ${evaluator.roleKey} has no school scope.`);
  assert(membershipData.permissions?.manageEvaluations === true, `${school.key} ${evaluator.roleKey} is missing manageEvaluations.`);
  assert(asString(personData.displayName) === evaluator.displayName, `${school.key} ${evaluator.roleKey} displayName mismatch.`);
}

async function loadSchoolPreflight(db, orgRoot, school) {
  const [schoolDocument, memberships] = await Promise.all([
    readRequiredDoc(db, `${orgRoot}/schools/${school.id}`, `${school.key} school`),
    loadSchoolMemberships(db, `${orgRoot}/memberships`, school.id),
    ...Object.values(school.evaluators).map((evaluator) =>
      validateEvaluator(db, orgRoot, school, evaluator),
    ),
  ]);
  const teacherMemberships = memberships.filter((membership) => {
    const data = membership.data();
    const roleKey = asString(data.roleKey || data.role).toUpperCase();

    return (
      isActive(data) &&
      [CONFIG.teacherRoleKey, "TEACHER"].includes(roleKey) &&
      asString(data.personId)
    );
  });
  const membershipByPersonId = new Map();

  for (const membership of teacherMemberships) {
    const personId = asString(membership.data().personId);
    assert(!membershipByPersonId.has(personId), `${school.key} duplicate teacher membership: ${personId}`);
    membershipByPersonId.set(personId, membership);
  }

  assert(membershipByPersonId.size > 0, `${school.key} has no active teachers.`);

  const people = await db.getAll(
    ...Array.from(membershipByPersonId.keys()).map((personId) =>
      db.doc(`${orgRoot}/people/${personId}`),
    ),
  );
  const teachers = people
    .map((person) => {
      assert(person.exists, `Teacher person missing: ${person.ref.path}`);
      const data = person.data();
      const displayName = asString(data.displayName);
      const email = normalizeEmail(data.email);

      assert(displayName, `Teacher displayName missing: ${person.ref.path}`);
      assert(email, `Teacher email missing: ${person.ref.path}`);

      return { personId: person.id, displayName, email };
    })
    .sort((left, right) => left.displayName.localeCompare(right.displayName, "ar"));

  return {
    ...school,
    storedName: asString(schoolDocument.data().name || schoolDocument.data().title),
    teachers,
  };
}

async function loadPreflight(db) {
  const orgRoot = `orgs/${CONFIG.orgId}`;
  const schools = [];

  for (const school of CONFIG.schools) {
    schools.push(await loadSchoolPreflight(db, orgRoot, school));
  }

  return { orgRoot, schools };
}

function buildFrameworkDocuments(orgRoot) {
  const documents = [];

  for (const framework of FRAMEWORKS) {
    const sectionId = `${framework.id}-main`;

    documents.push({
      type: "framework",
      path: `${orgRoot}/evaluationFrameworks/${framework.id}`,
      data: {
        id: framework.id,
        orgId: CONFIG.orgId,
        title: framework.title,
        description: framework.description,
        targetKind: "TEACHER",
        targetRoleLabel: "المعلمون",
        targetRoleKeyHint: CONFIG.teacherRoleKey,
        evaluatorKind: framework.evaluatorKind,
        evaluatorLabel: framework.evaluatorLabel,
        defaultEvaluatorRoleKeys: [framework.evaluatorRoleKey],
        frameworkKind: framework.frameworkKind,
        schoolTypes: ["PRIMARY"],
        maxCyclesPerTerm: framework.cycles.length,
        defaultItemMaxScore: 5,
        isActive: true,
        isLocked: true,
        version: 1,
      },
    });
    documents.push({
      type: "section",
      path: `${orgRoot}/evaluationRubricSections/${sectionId}`,
      data: {
        id: sectionId,
        orgId: CONFIG.orgId,
        frameworkId: framework.id,
        title: framework.title,
        description: `بنود ${framework.title}.`,
        order: 1,
        weight: 100,
        isActive: true,
      },
    });

    framework.items.forEach((title, index) => {
      const itemNumber = String(index + 1).padStart(2, "0");

      documents.push({
        type: "item",
        path: `${orgRoot}/evaluationRubricItems/${sectionId}-${itemNumber}`,
        data: {
          id: `${sectionId}-${itemNumber}`,
          orgId: CONFIG.orgId,
          frameworkId: framework.id,
          sectionId,
          title,
          description: "",
          order: index + 1,
          maxScore: 5,
          scoreInputType: "SCORE",
          isRequired: true,
          isActive: true,
        },
      });
    });
  }

  return documents;
}

function buildSchoolDocuments(orgRoot, school) {
  const documents = [];

  for (const framework of FRAMEWORKS) {
    const evaluator = school.evaluators[framework.evaluatorRoleKey];
    const planId = `${school.id}-${CONFIG.academicYearId}-${CONFIG.termId}-${framework.planSlug}`;
    const planTitle = `${framework.title} - ${school.label} - الفصل الأول`;

    documents.push({
      type: "plan",
      schoolKey: school.key,
      planId,
      path: `${orgRoot}/evaluationPlans/${planId}`,
      data: {
        id: planId,
        orgId: CONFIG.orgId,
        schoolId: school.id,
        academicYearId: CONFIG.academicYearId,
        termId: CONFIG.termId,
        title: planTitle,
        description: `خطة تطبيق ${framework.title} داخل الفصل الدراسي الأول.`,
        frameworkId: framework.id,
        planKind: framework.planKind,
        targetKind: "TEACHER",
        targetRoleKey: CONFIG.teacherRoleKey,
        targetRoleLabel: "المعلمون",
        status: "ACTIVE",
      },
    });

    const policyId = `${planId}-policy-${framework.key}`;
    documents.push({
      type: "policy",
      schoolKey: school.key,
      planId,
      path: `${orgRoot}/evaluatorPolicies/${policyId}`,
      data: {
        id: policyId,
        orgId: CONFIG.orgId,
        schoolId: school.id,
        academicYearId: CONFIG.academicYearId,
        termId: CONFIG.termId,
        planId,
        evaluatorRoleKey: evaluator.roleKey,
        evaluatorLabel: evaluator.roleLabel,
        weight: 100,
        required: true,
        canSubmit: true,
        canReview: false,
        canApprove: true,
        order: 1,
      },
    });

    for (const cycle of framework.cycles) {
      const cycleId = `${planId}-${cycle.suffix}`;

      documents.push({
        type: "cycle",
        schoolKey: school.key,
        planId,
        path: `${orgRoot}/evaluationCycles/${cycleId}`,
        data: {
          id: cycleId,
          orgId: CONFIG.orgId,
          schoolId: school.id,
          academicYearId: CONFIG.academicYearId,
          termId: CONFIG.termId,
          planId,
          cycleNumber: cycle.number,
          title: cycle.title,
          cycleKind: cycle.kind,
          status: "OPEN",
          isIncludedInAverage: true,
        },
      });
    }

    for (const teacher of school.teachers) {
      const targetAssignmentId = `${planId}-target-${teacher.personId}`;

      documents.push({
        type: "targetAssignment",
        schoolKey: school.key,
        planId,
        path: `${orgRoot}/evaluationTargetAssignments/${targetAssignmentId}`,
        data: {
          id: targetAssignmentId,
          orgId: CONFIG.orgId,
          schoolId: school.id,
          academicYearId: CONFIG.academicYearId,
          termId: CONFIG.termId,
          planId,
          targetPersonId: teacher.personId,
          targetEmail: teacher.email,
          targetDisplayName: teacher.displayName,
          targetRoleKey: CONFIG.teacherRoleKey,
          targetRoleLabel: "معلم",
          targetKind: "TEACHER",
          status: "ACTIVE",
        },
      });

      for (const cycle of framework.cycles) {
        const cycleId = `${planId}-${cycle.suffix}`;
        const evaluatorAssignmentId = `${planId}-${cycleId}-${teacher.personId}-${evaluator.personId}`;

        documents.push({
          type: "evaluatorAssignment",
          schoolKey: school.key,
          planId,
          path: `${orgRoot}/evaluationEvaluatorAssignments/${evaluatorAssignmentId}`,
          data: {
            id: evaluatorAssignmentId,
            orgId: CONFIG.orgId,
            schoolId: school.id,
            academicYearId: CONFIG.academicYearId,
            termId: CONFIG.termId,
            planId,
            cycleId,
            targetPersonId: teacher.personId,
            targetRoleKey: CONFIG.teacherRoleKey,
            targetRoleLabel: "معلم",
            evaluatorPersonId: evaluator.personId,
            evaluatorEmail: evaluator.email,
            evaluatorRoleKey: evaluator.roleKey,
            weight: 100,
            sourceType: "MANUAL",
            status: "ACTIVE",
          },
        });
      }
    }
  }

  return documents;
}

function assertDesiredStructure(documents, preflight) {
  for (const framework of FRAMEWORKS) {
    const frameworkSections = documents.filter(
      (document) => document.type === "section" && document.data.frameworkId === framework.id,
    );
    const frameworkItems = documents.filter(
      (document) => document.type === "item" && document.data.frameworkId === framework.id,
    );

    assert(frameworkSections.length === 1, `${framework.id} must have one section.`);
    assert(frameworkSections[0].data.weight === 100, `${framework.id} section weight must be 100.`);
    assert(frameworkItems.length === framework.items.length, `${framework.id} item count mismatch.`);
    assert(
      frameworkItems.every((item, index) => item.data.maxScore === 5 && item.data.order === index + 1),
      `${framework.id} item order/maxScore mismatch.`,
    );
  }

  for (const school of preflight.schools) {
    for (const framework of FRAMEWORKS) {
      const planId = `${school.id}-${CONFIG.academicYearId}-${CONFIG.termId}-${framework.planSlug}`;
      const planDocuments = documents.filter((document) => document.planId === planId);

      assert(planDocuments.filter((document) => document.type === "cycle").length === framework.cycles.length, `${planId} cycle count mismatch.`);
      assert(planDocuments.filter((document) => document.type === "targetAssignment").length === school.teachers.length, `${planId} target count mismatch.`);
      assert(planDocuments.filter((document) => document.type === "evaluatorAssignment").length === school.teachers.length * framework.cycles.length, `${planId} evaluator assignment count mismatch.`);
    }
  }
}

function assertExistingDocument(snapshot, desired) {
  const current = snapshot.data();

  for (const [field, expected] of Object.entries(desired.data)) {
    assert(
      JSON.stringify(current[field]) === JSON.stringify(expected),
      `Conflicting ${field} at ${snapshot.ref.path}: expected ${JSON.stringify(expected)}, found ${JSON.stringify(current[field])}`,
    );
  }
}

async function inspectDocuments(db, documents) {
  const missing = [];
  const existing = [];

  for (const group of chunk(documents, 400)) {
    const snapshots = await db.getAll(
      ...group.map((document) => db.doc(document.path)),
    );

    snapshots.forEach((snapshot, index) => {
      const desired = group[index];

      if (!snapshot.exists) {
        missing.push(desired);
        return;
      }

      assertExistingDocument(snapshot, desired);
      existing.push(desired);
    });
  }

  return { missing, existing };
}

function countByType(documents) {
  return documents.reduce((counts, document) => {
    counts[document.type] = (counts[document.type] || 0) + 1;
    return counts;
  }, {});
}

async function applyMissingDocuments(db, documents) {
  const groups = chunk(documents, 400);
  const now = Date.now();

  for (let index = 0; index < groups.length; index += 1) {
    const batch = db.batch();

    for (const document of groups[index]) {
      batch.create(db.doc(document.path), {
        ...document.data,
        createdAt: now,
        updatedAt: now,
        ...(document.type === "framework" ? { lockedAt: now } : {}),
        ...(document.type === "targetAssignment" ? { assignedAt: now } : {}),
      });
    }

    await batch.commit();
    console.log(`Applied batch ${index + 1}/${groups.length} (${groups[index].length} documents).`);
  }
}

async function verifyPlanCounts(db, preflight) {
  const orgRoot = preflight.orgRoot;

  for (const school of preflight.schools) {
    for (const framework of FRAMEWORKS) {
      const planId = `${school.id}-${CONFIG.academicYearId}-${CONFIG.termId}-${framework.planSlug}`;
      const [cycles, targets, evaluatorAssignments] = await Promise.all([
        db.collection(`${orgRoot}/evaluationCycles`).where("planId", "==", planId).get(),
        db.collection(`${orgRoot}/evaluationTargetAssignments`).where("planId", "==", planId).get(),
        db.collection(`${orgRoot}/evaluationEvaluatorAssignments`).where("planId", "==", planId).get(),
      ]);

      assert(cycles.docs.filter((document) => isActive(document.data())).length === framework.cycles.length, `${planId} active cycle verification failed.`);
      assert(targets.docs.filter((document) => isActive(document.data())).length === school.teachers.length, `${planId} active target verification failed.`);
      assert(evaluatorAssignments.docs.filter((document) => isActive(document.data())).length === school.teachers.length * framework.cycles.length, `${planId} evaluator assignment verification failed.`);
    }
  }
}

function buildReport(preflight, documents, inspection) {
  return {
    schools: preflight.schools.map((school) => ({
      key: school.key,
      id: school.id,
      name: school.storedName,
      teachers: school.teachers.length,
      evaluators: Object.values(school.evaluators).map((evaluator) => ({
        roleKey: evaluator.roleKey,
        personId: evaluator.personId,
        displayName: evaluator.displayName,
        email: evaluator.email,
      })),
      plans: FRAMEWORKS.map((framework) => ({
        frameworkId: framework.id,
        cycles: framework.cycles.length,
        items: framework.items.length,
        evaluatorRoleKey: framework.evaluatorRoleKey,
      })),
    })),
    desired: countByType(documents),
    existing: countByType(inspection.existing),
    missing: countByType(inspection.missing),
    totalDocuments: documents.length,
  };
}

async function main() {
  initAdmin();

  const db = admin.firestore();
  const preflight = await loadPreflight(db);
  const documents = [
    ...buildFrameworkDocuments(preflight.orgRoot),
    ...preflight.schools.flatMap((school) =>
      buildSchoolDocuments(preflight.orgRoot, school),
    ),
  ];

  assertDesiredStructure(documents, preflight);

  const inspection = await inspectDocuments(db, documents);

  console.log(APPLY ? "Apply mode" : "Preview mode (read-only)");
  console.dir(buildReport(preflight, documents, inspection), { depth: 8 });

  if (!APPLY) {
    console.log("No writes performed. Re-run with --apply to create missing documents.");
    return;
  }

  if (inspection.missing.length > 0) {
    await applyMissingDocuments(db, inspection.missing);
  }

  const verification = await inspectDocuments(db, documents);
  assert(verification.missing.length === 0, "Documents are still missing after apply.");
  await verifyPlanCounts(db, preflight);

  console.log("Boys schools teacher evaluator plans applied and verified.");
  console.dir({ verified: countByType(documents), total: documents.length });
}

main().catch((error) => {
  console.error("Boys schools teacher evaluator plan seed failed:");
  console.error(error);
  process.exitCode = 1;
});
