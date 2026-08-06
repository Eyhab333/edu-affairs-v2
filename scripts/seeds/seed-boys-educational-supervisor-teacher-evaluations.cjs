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
    { id: "mrb-boys-sayh", label: "منار الريادة بنين السيح" },
    { id: "mrb-boys-faleh", label: "منار الريادة بنين الفالح" },
  ],
  supervisors: [
    {
      uid: "aa3uDx6i5uf6Dp5YP3unAqD5Zyo1",
      personId: "p-s-sayed",
      displayName: "السيد محمد احمد احمد",
      email: "s.sayed@qz.org.sa",
      roleKey: "EDU_SUPERVISOR",
      roleLabel: "المشرف التعليمي",
      targets: [
        { schoolId: "mrb-boys-faleh", personId: "p-mahmood", displayName: "محمود محمد ابوالدهب", email: "mahmood@qz.org.sa" },
        { schoolId: "mrb-boys-faleh", personId: "p-hameed-s", displayName: "حامد السيد السيد نافع", email: "hameed-s@qz.org.sa" },
        { schoolId: "mrb-boys-faleh", personId: "p-m-ali", displayName: "محمد مصطفى الصادق", email: "m.ali@qz.org.sa" },
        { schoolId: "mrb-boys-sayh", personId: "p-a-attab", displayName: "عبدالله بن محمد مصطفى عتاب", email: "a.attab@qz.org.sa" },
        { schoolId: "mrb-boys-faleh", personId: "p-a-alddahash", displayName: "عبدالله سليمان عبدالله الدهش", email: "a.alddahash@qz.org.sa" },
        { schoolId: "mrb-boys-faleh", personId: "p-k-alfanisan", displayName: "خالد أحمد الفنيسان", email: "k.alfanisan@qz.org.sa" },
        { schoolId: "mrb-boys-sayh", personId: "p-sa-alhamad", displayName: "سعود احمد سعود الحمد", email: "sa.alhamad@qz.org.sa" },
        { schoolId: "mrb-boys-sayh", personId: "p-t-alhazzany", displayName: "طلال ناصر الهزاني", email: "t.alhazzany@qz.org.sa" },
        { schoolId: "mrb-boys-sayh", personId: "p-f-alnafa", displayName: "فيصل فهد النافع", email: "f.alnafa@qz.org.sa" },
        { schoolId: "mrb-boys-sayh", personId: "p-f-alfahad", displayName: "فيصل فهد عبدالعزيز الفهد", email: "f.alfahad@qz.org.sa" },
        { schoolId: "mrb-boys-sayh", personId: "p-a-alsamhan", displayName: "عبدالرحمن إبراهيم عبدالرحمن السمحان", email: "a.alsamhan@qz.org.sa" },
        { schoolId: "mrb-boys-faleh", personId: "p-k-s-alhamad", displayName: "خالد سعود عبدالعزيز الحمد", email: "k.s.alhamad@qz.org.sa" },
        { schoolId: "mrb-boys-sayh", personId: "p-a-h-aljaser", displayName: "عبدالرحمن حمد عبدالرحمن الجاسر", email: "a.h.aljaser@qz.org.sa" },
        { schoolId: "mrb-boys-sayh", personId: "p-a-mahmood", displayName: "عبدالله محمود احمد منصور", email: "a-mahmood@qz.org.sa" },
        { schoolId: "mrb-boys-faleh", personId: "p-k-alsadle", displayName: "خالد محمد الشاذلي معتمد", email: "k.alsadle@qz.org.sa" },
      ],
    },
    {
      uid: "UTo1Mx2EwSVQJ0gwdTAph8Oa8qz1",
      personId: "p-n-alshaya",
      displayName: "ناصر عبدالله عبدالعزيز الشايع",
      email: "n-alshaya@qz.org.sa",
      roleKey: "BOYS_EDU_SUPERVISOR",
      roleLabel: "المشرف التعليمي",
      targets: [
        { schoolId: "mrb-boys-sayh", personId: "p-m-bayoumi", displayName: "محمد سيد م بيومي", email: "m.bayoumi@qz.org.sa" },
        { schoolId: "mrb-boys-sayh", personId: "p-am-alnutifi", displayName: "أحمد محمد عبدالله النتيفي", email: "am.alnutifi@qz.org.sa" },
        { schoolId: "mrb-boys-faleh", personId: "p-a-ahmad", displayName: "احمد محرم فؤاد فتاح", email: "a-ahmad@qz.org.sa" },
        { schoolId: "mrb-boys-sayh", personId: "p-k-m-ahmd", displayName: "خالد محمد محمد حنفي", email: "k-m-ahmd@qz.org.sa" },
      ],
    },
  ],
};

const FRAMEWORKS = [
  {
    key: "periodic",
    id: "educational-supervisor-periodic-teacher-evaluation-v1",
    planSlug: "educational-supervisor-periodic-teacher-evaluation",
    title: "تقييم المشرف التعليمي للمعلمين",
    description: "قالب رسمي لتقييم المشرف التعليمي للمعلمين ثلاث مرات داخل الفصل الدراسي.",
    planKind: "PERIODIC",
    frameworkKind: "PERIODIC_STAFF_EVALUATION",
    cycles: [
      { number: 1, title: "التقييم الأول", suffix: "evaluation-01", kind: "PERIOD" },
      { number: 2, title: "التقييم الثاني", suffix: "evaluation-02", kind: "PERIOD" },
      { number: 3, title: "التقييم الثالث", suffix: "evaluation-03", kind: "PERIOD" },
    ],
    items: [
      "الكتاب المدرسي",
      "التحضير",
      "سجل المتابعة",
      "المذكرة الإثرائية",
      "سجل المهارات",
      "المبادرة التعليمية",
      "خطة الفاقد التعليمي",
      "أوراق عمل الفاقد",
    ],
  },
  {
    key: "diagnostic",
    id: "educational-supervisor-diagnostic-teacher-evaluation-v1",
    planSlug: "educational-supervisor-diagnostic-teacher-evaluation",
    title: "الزيارة الإشرافية التشخيصية للمعلمين",
    description: "قالب رسمي للزيارة الإشرافية التشخيصية للمعلمين ثلاث مرات داخل الفصل الدراسي.",
    planKind: "VISIT_BASED",
    frameworkKind: "CLASSROOM_VISIT",
    cycles: [
      { number: 1, title: "الزيارة الإشرافية الأولى", suffix: "visit-01", kind: "VISIT" },
      { number: 2, title: "الزيارة الإشرافية الثانية", suffix: "visit-02", kind: "VISIT" },
      { number: 3, title: "الزيارة الإشرافية الثالثة", suffix: "visit-03", kind: "VISIT" },
    ],
    items: [
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
    ],
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
    !["DISABLED", "ENDED", "INACTIVE", "REVOKED", "REMOVED"].includes(status)
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
  const result = [];
  for (let index = 0; index < values.length; index += size) {
    result.push(values.slice(index, index + size));
  }
  return result;
}

async function readRequiredDoc(db, documentPath, label) {
  const snapshot = await db.doc(documentPath).get();
  assert(snapshot.exists, `${label} not found: ${documentPath}`);
  return snapshot;
}

async function loadSchoolTeacherPersonIds(db, orgRoot, schoolId) {
  const membershipsRef = db.collection(`${orgRoot}/memberships`);
  const [bySchoolId, byScopeId, bySchoolIds, users] = await Promise.all([
    membershipsRef.where("schoolId", "==", schoolId).get(),
    membershipsRef.where("scopeId", "==", schoolId).get(),
    membershipsRef.where("scopes.schoolIds", "array-contains", schoolId).get(),
    db.collection("users").where("schoolIds", "array-contains", schoolId).get(),
  ]);
  const nestedMemberships = users.empty
    ? []
    : await db.getAll(
        ...users.docs.map((user) =>
          db.doc(`users/${user.id}/orgMemberships/${CONFIG.orgId}`),
        ),
      );

  return new Set(
    uniqueDocuments([
      ...bySchoolId.docs,
      ...byScopeId.docs,
      ...bySchoolIds.docs,
      ...nestedMemberships.filter((membership) => membership.exists),
    ])
      .filter((membership) => {
        const data = membership.data();
        const roleKey = asString(data.roleKey || data.role).toUpperCase();
        return (
          isActive(data) &&
          [CONFIG.teacherRoleKey, "TEACHER"].includes(roleKey) &&
          membershipCoversSchool(data, schoolId)
        );
      })
      .map((membership) => asString(membership.data().personId))
      .filter(Boolean),
  );
}

async function validateSupervisor(db, orgRoot, supervisor) {
  const [authUser, user, person, membership, operations] = await Promise.all([
    admin.auth().getUser(supervisor.uid),
    readRequiredDoc(db, `users/${supervisor.uid}`, "Supervisor user"),
    readRequiredDoc(db, `${orgRoot}/people/${supervisor.personId}`, "Supervisor person"),
    readRequiredDoc(db, `users/${supervisor.uid}/orgMemberships/${CONFIG.orgId}`, "Supervisor membership"),
    db.collection(`${orgRoot}/operationalAssignments`)
      .where("actorPersonId", "==", supervisor.personId)
      .get(),
  ]);
  const membershipData = membership.data();
  const personData = person.data();

  assert(normalizeEmail(authUser.email) === supervisor.email, `${supervisor.email} auth email mismatch.`);
  assert(normalizeEmail(user.data().email || personData.email) === supervisor.email, `${supervisor.email} user email mismatch.`);
  assert(asString(membershipData.personId) === supervisor.personId, `${supervisor.email} personId mismatch.`);
  assert(asString(membershipData.roleKey || membershipData.role).toUpperCase() === supervisor.roleKey, `${supervisor.email} role mismatch.`);
  assert(isActive(membershipData), `${supervisor.email} membership is inactive.`);
  assert(membershipData.permissions?.manageEvaluations === true, `${supervisor.email} is missing manageEvaluations.`);
  assert(asString(personData.displayName) === supervisor.displayName, `${supervisor.email} displayName mismatch.`);

  for (const school of CONFIG.schools) {
    assert(membershipCoversSchool(membershipData, school.id), `${supervisor.email} is missing ${school.id} scope.`);
    const operation = operations.docs.find((document) => {
      const data = document.data();
      return (
        isActive(data) &&
        asString(data.operationKind) === "STAFF_EVALUATION" &&
        asString(data.schoolId || data.scopeId) === school.id
      );
    });
    assert(operation, `${supervisor.email} is missing STAFF_EVALUATION for ${school.id}.`);
  }
}

async function loadPreflight(db) {
  const orgRoot = `orgs/${CONFIG.orgId}`;
  const teacherSets = new Map();

  for (const school of CONFIG.schools) {
    await readRequiredDoc(db, `${orgRoot}/schools/${school.id}`, "School");
    teacherSets.set(
      school.id,
      await loadSchoolTeacherPersonIds(db, orgRoot, school.id),
    );
  }

  for (const supervisor of CONFIG.supervisors) {
    await validateSupervisor(db, orgRoot, supervisor);
  }

  const allTargets = CONFIG.supervisors.flatMap((supervisor) =>
    supervisor.targets.map((target) => ({ ...target, supervisor })),
  );
  const uniqueTargetKeys = new Set(
    allTargets.map((target) => `${target.schoolId}|${target.personId}`),
  );
  assert(uniqueTargetKeys.size === allTargets.length, "A teacher is assigned to more than one supervisor in the same school.");

  const people = await db.getAll(
    ...allTargets.map((target) => db.doc(`${orgRoot}/people/${target.personId}`)),
  );
  people.forEach((person, index) => {
    const target = allTargets[index];
    assert(person.exists, `Teacher not found: ${target.personId}`);
    assert(asString(person.data().displayName) === target.displayName, `${target.personId} displayName mismatch.`);
    assert(normalizeEmail(person.data().email) === target.email, `${target.personId} email mismatch.`);
    assert(teacherSets.get(target.schoolId)?.has(target.personId), `${target.personId} is not an active teacher in ${target.schoolId}.`);
  });

  return { orgRoot, allTargets };
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
        evaluatorKind: "EDUCATIONAL_SUPERVISOR",
        evaluatorLabel: "المشرف التعليمي",
        defaultEvaluatorRoleKeys: ["EDU_SUPERVISOR", "BOYS_EDU_SUPERVISOR"],
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

function buildPlanDocuments(orgRoot, school, framework) {
  const documents = [];
  const planId = `${school.id}-${CONFIG.academicYearId}-${CONFIG.termId}-${framework.planSlug}`;
  const scopedSupervisors = CONFIG.supervisors
    .map((supervisor) => ({
      supervisor,
      targets: supervisor.targets.filter((target) => target.schoolId === school.id),
    }))
    .filter((entry) => entry.targets.length > 0);

  documents.push({
    type: "plan",
    schoolId: school.id,
    planId,
    path: `${orgRoot}/evaluationPlans/${planId}`,
    data: {
      id: planId,
      orgId: CONFIG.orgId,
      schoolId: school.id,
      academicYearId: CONFIG.academicYearId,
      termId: CONFIG.termId,
      title: `${framework.title} - ${school.label} - الفصل الأول`,
      description: `خطة تطبيق ${framework.title} داخل الفصل الدراسي الأول.`,
      frameworkId: framework.id,
      planKind: framework.planKind,
      targetKind: "TEACHER",
      targetRoleKey: CONFIG.teacherRoleKey,
      targetRoleLabel: "المعلمون",
      status: "ACTIVE",
    },
  });

  for (const { supervisor } of scopedSupervisors) {
    const policyId = `${planId}-policy-${supervisor.personId}`;
    documents.push({
      type: "policy",
      schoolId: school.id,
      planId,
      path: `${orgRoot}/evaluatorPolicies/${policyId}`,
      data: {
        id: policyId,
        orgId: CONFIG.orgId,
        schoolId: school.id,
        academicYearId: CONFIG.academicYearId,
        termId: CONFIG.termId,
        planId,
        evaluatorRoleKey: supervisor.roleKey,
        evaluatorLabel: supervisor.roleLabel,
        evaluatorPersonId: supervisor.personId,
        weight: 100,
        required: true,
        canSubmit: true,
        canReview: false,
        canApprove: true,
        order: 1,
      },
    });
  }

  for (const cycle of framework.cycles) {
    const cycleId = `${planId}-${cycle.suffix}`;
    documents.push({
      type: "cycle",
      schoolId: school.id,
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

  for (const { supervisor, targets } of scopedSupervisors) {
    for (const target of targets) {
      const targetAssignmentId = `${planId}-target-${target.personId}`;
      documents.push({
        type: "targetAssignment",
        schoolId: school.id,
        planId,
        path: `${orgRoot}/evaluationTargetAssignments/${targetAssignmentId}`,
        data: {
          id: targetAssignmentId,
          orgId: CONFIG.orgId,
          schoolId: school.id,
          academicYearId: CONFIG.academicYearId,
          termId: CONFIG.termId,
          planId,
          targetPersonId: target.personId,
          targetEmail: target.email,
          targetDisplayName: target.displayName,
          targetRoleKey: CONFIG.teacherRoleKey,
          targetRoleLabel: "معلم",
          targetKind: "TEACHER",
          status: "ACTIVE",
        },
      });

      for (const cycle of framework.cycles) {
        const cycleId = `${planId}-${cycle.suffix}`;
        const assignmentId = `${cycleId}-${target.personId}-${supervisor.personId}`;
        documents.push({
          type: "evaluatorAssignment",
          schoolId: school.id,
          planId,
          path: `${orgRoot}/evaluationEvaluatorAssignments/${assignmentId}`,
          data: {
            id: assignmentId,
            orgId: CONFIG.orgId,
            schoolId: school.id,
            academicYearId: CONFIG.academicYearId,
            termId: CONFIG.termId,
            planId,
            cycleId,
            targetPersonId: target.personId,
            targetRoleKey: CONFIG.teacherRoleKey,
            targetRoleLabel: "معلم",
            evaluatorPersonId: supervisor.personId,
            evaluatorEmail: supervisor.email,
            evaluatorRoleKey: supervisor.roleKey,
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

function assertDesiredStructure(documents) {
  for (const framework of FRAMEWORKS) {
    const sections = documents.filter((document) => document.type === "section" && document.data.frameworkId === framework.id);
    const items = documents.filter((document) => document.type === "item" && document.data.frameworkId === framework.id);
    assert(sections.length === 1, `${framework.id} must have one section.`);
    assert(sections[0].data.weight === 100, `${framework.id} section weight must be 100.`);
    assert(items.length === framework.items.length, `${framework.id} item count mismatch.`);
    assert(items.every((item, index) => item.data.maxScore === 5 && item.data.order === index + 1), `${framework.id} item order/maxScore mismatch.`);
  }

  for (const school of CONFIG.schools) {
    const targetCount = CONFIG.supervisors.reduce(
      (count, supervisor) => count + supervisor.targets.filter((target) => target.schoolId === school.id).length,
      0,
    );
    for (const framework of FRAMEWORKS) {
      const planId = `${school.id}-${CONFIG.academicYearId}-${CONFIG.termId}-${framework.planSlug}`;
      const planDocuments = documents.filter((document) => document.planId === planId);
      assert(planDocuments.filter((document) => document.type === "cycle").length === 3, `${planId} cycle count mismatch.`);
      assert(planDocuments.filter((document) => document.type === "targetAssignment").length === targetCount, `${planId} target count mismatch.`);
      assert(planDocuments.filter((document) => document.type === "evaluatorAssignment").length === targetCount * 3, `${planId} evaluator assignment count mismatch.`);
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
    const snapshots = await db.getAll(...group.map((document) => db.doc(document.path)));
    snapshots.forEach((snapshot, index) => {
      const desired = group[index];
      if (!snapshot.exists) missing.push(desired);
      else {
        assertExistingDocument(snapshot, desired);
        existing.push(desired);
      }
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

async function verifyPlanCounts(db, orgRoot) {
  for (const school of CONFIG.schools) {
    const targetCount = CONFIG.supervisors.reduce(
      (count, supervisor) => count + supervisor.targets.filter((target) => target.schoolId === school.id).length,
      0,
    );
    for (const framework of FRAMEWORKS) {
      const planId = `${school.id}-${CONFIG.academicYearId}-${CONFIG.termId}-${framework.planSlug}`;
      const [cycles, targets, assignments] = await Promise.all([
        db.collection(`${orgRoot}/evaluationCycles`).where("planId", "==", planId).get(),
        db.collection(`${orgRoot}/evaluationTargetAssignments`).where("planId", "==", planId).get(),
        db.collection(`${orgRoot}/evaluationEvaluatorAssignments`).where("planId", "==", planId).get(),
      ]);
      assert(cycles.docs.filter((document) => isActive(document.data())).length === 3, `${planId} active cycle verification failed.`);
      assert(targets.docs.filter((document) => isActive(document.data())).length === targetCount, `${planId} active target verification failed.`);
      assert(assignments.docs.filter((document) => isActive(document.data())).length === targetCount * 3, `${planId} active evaluator assignment verification failed.`);
    }
  }
}

function buildReport(documents, inspection) {
  return {
    evaluators: CONFIG.supervisors.map((supervisor) => ({
      personId: supervisor.personId,
      displayName: supervisor.displayName,
      email: supervisor.email,
      roleKey: supervisor.roleKey,
      targets: CONFIG.schools.map((school) => ({
        schoolId: school.id,
        count: supervisor.targets.filter((target) => target.schoolId === school.id).length,
      })),
    })),
    frameworks: FRAMEWORKS.map((framework) => ({
      id: framework.id,
      cycles: framework.cycles.length,
      items: framework.items.length,
    })),
    desired: countByType(documents),
    existing: countByType(inspection.existing),
    missing: countByType(inspection.missing),
    total: documents.length,
  };
}

async function main() {
  initAdmin();
  const db = admin.firestore();
  const preflight = await loadPreflight(db);
  const documents = [
    ...buildFrameworkDocuments(preflight.orgRoot),
    ...CONFIG.schools.flatMap((school) =>
      FRAMEWORKS.flatMap((framework) =>
        buildPlanDocuments(preflight.orgRoot, school, framework),
      ),
    ),
  ];

  assertDesiredStructure(documents);
  const inspection = await inspectDocuments(db, documents);
  console.log(APPLY ? "Apply mode" : "Preview mode (read-only)");
  console.dir(buildReport(documents, inspection), { depth: 8 });

  if (!APPLY) {
    console.log("No writes performed. Re-run with --apply to create missing documents.");
    return;
  }

  if (inspection.missing.length > 0) await applyMissingDocuments(db, inspection.missing);
  const verification = await inspectDocuments(db, documents);
  assert(verification.missing.length === 0, "Documents are still missing after apply.");
  await verifyPlanCounts(db, preflight.orgRoot);

  console.log("Boys educational supervisor teacher evaluations applied and verified.");
  console.dir({ verified: countByType(documents), total: documents.length });
}

main().catch((error) => {
  console.error("Boys educational supervisor teacher evaluation seed failed:");
  console.error(error);
  process.exitCode = 1;
});
