/* eslint-disable no-console */

const admin = require("firebase-admin");
const path = require("path");

const APPLY = process.argv.includes("--apply");

const CONFIG = {
  orgId: "takween",
  academicYearId: "ay-1448",
  termId: "term-1",
  evaluator: {
    uid: "atmGJJCwkIZdJHarm9gL0WYLCyQ2",
    personId: "p-h-alnasser",
    displayName: "حمد زيد عبدالعزيز الناصر",
    email: "h-alnasser@qz.org.sa",
    roleKey: "ORG_SUPERVISION_HEAD",
    roleLabel: "رئيس الإشراف",
  },
  schools: [
    {
      key: "sayh",
      id: "mrb-boys-sayh",
      label: "منار الريادة بنين السيح",
      targets: {
        principal: { personId: "p-a-s-alkmays", email: "a-s-alkmays@qz.org.sa" },
        media: { personId: "p-a-d-alawad", email: "a.d.alawad@qz.org.sa" },
        "admin-assistant": { personId: "p-q-alfrhud", email: "q.alfrhud@qz.org.sa" },
        "activity-leader": { personId: "p-f-alqashami", email: "f.alqashami@qz.org.sa" },
        "vice-principal": { personId: "p-r-almutawa", email: "r.almutawa@qz.org.sa" },
        "educational-vice-principal": { personId: "p-m-alateeq", email: "m.alateeq@qz.org.sa" },
        "student-guide": { personId: "p-students-mentor-syeh", email: "students-mentor-syeh@qz.org.sa" },
      },
    },
    {
      key: "faleh",
      id: "mrb-boys-faleh",
      label: "منار الريادة بنين الفالح",
      targets: {
        principal: { personId: "staff-EJP7cQWlOldemQo6R6TciBZXSFt2", email: "riadah3@qz.org.sa" },
        media: { personId: "staff-xqqedggnhfVpwza1UWmqaoPxRmD3", email: "media-faleh@qz.org.sa" },
        "admin-assistant": { personId: "p-a-almotwa", email: "a.almotwa@qz.org.sa" },
        "activity-leader": { personId: "p-f-alqashami", email: "f.alqashami@qz.org.sa" },
        "vice-principal": { personId: "p-ralfaiz", email: "ralfaiz@qz.org.sa" },
        "educational-vice-principal": { personId: "p-m-alateeq", email: "m.alateeq@qz.org.sa" },
        "student-guide": { personId: "staff-gm37B5cNxxUyIasU9G70zHgVkEj2", email: "students-mentor-faleh@qz.org.sa" },
      },
    },
  ],
};

const FRAMEWORKS = [
  {
    key: "principal",
    id: "supervision-head-principal-evaluation-v1",
    title: "تقييم رئيس الإشراف لمدير المدرسة",
    roleKey: "BOYS_PRINCIPAL",
    roleLabel: "مدير المدرسة",
    cycles: ["التقييم الأول", "التقييم الثاني", "التقييم الثالث"],
    items: [
      "إعداد الخطة التشغيلية",
      "تشكيل اللجان",
      "إعداد الجداول",
      "متابعة الاصطفاف الصباحي",
      "تنظيم السجلات الرسمية",
      "تشكيل اللجان وتفعيلها",
      "تفعيل البرنامج",
      "متابعة الانضباط الوظيفي وتفعيل الإجراءات",
      "تفعيل الزيارات التشخيصية",
      "متابعة توصيات المشرفين",
      "تنظيم الإشراف اليومي",
      "تفعيل سجل الاستئذانات",
      "تفعيل تقويم الأداء",
      "تفعيل الاجتماعات",
      "تفعيل مجلس الآباء",
      "متابعة الإداريين",
    ],
  },
  {
    key: "media",
    id: "supervision-head-media-evaluation-v1",
    title: "تقييم رئيس الإشراف للمنسق الإعلامي",
    roleKey: "MEDIA_SPECIALIST",
    roleLabel: "المنسق الإعلامي",
    cycles: ["التقييم"],
    items: [
      "توثيق الممارسات",
      "خطة المناسبات",
      "توثيق الأنشطة",
      "توثيق الإذاعة",
      "إبراز الإنجازات",
      "إدارة الملف الإعلامي",
      "رفع التقارير الإعلامية",
      "تنفيذ التكليفات",
    ],
  },
  {
    key: "admin-assistant",
    id: "supervision-head-admin-assistant-evaluation-v1",
    title: "تقييم رئيس الإشراف للمساعد الإداري",
    roleKey: "ADMIN_ASSISTANT",
    roleLabel: "المساعد الإداري",
    cycles: ["التقييم"],
    items: [
      "إدارة المراسلات",
      "متابعة البريد",
      "تنظيم الملفات",
      "إدارة برنامج نور وراصد",
      "إعداد كشوف المتابعة",
      "كشوف الفصول",
      "إعداد سجل المهارات",
      "تنفيذ التكليفات",
    ],
  },
  {
    key: "activity-leader",
    id: "supervision-head-activity-leader-evaluation-v1",
    title: "تقييم رئيس الإشراف لرائد النشاط",
    roleKey: "ACTIVITY_COORD",
    roleLabel: "رائد النشاط",
    cycles: ["التقييم"],
    items: [
      "خطة النشاط",
      "خطة الإذاعة",
      "خطة المبادرات",
      "متابعة تنفيذ المبادرات",
      "تنظيم الأيام العالمية والوطنية",
      "تقارير النشاط",
      "المشاركة في مجلس الآباء",
      "تفعيل الزيارات الطلابية",
      "تفعيل الأيام المفتوحة",
      "تفعيل الحفل السنوي",
    ],
  },
  {
    key: "vice-principal",
    id: "supervision-head-school-vice-principal-evaluation-v1",
    title: "تقييم رئيس الإشراف لوكيل المدرسة",
    roleKey: "BOYS_VP",
    roleLabel: "وكيل المدرسة",
    cycles: ["التقييم"],
    items: [
      "المشاركة في الخطة",
      "متابعة ملفات الطلاب",
      "متابعة انتظام المعلمين داخل الفصول",
      "توزيع الطلاب على الفصول",
      "تطبيق لائحة السلوك المدرسي",
      "متابعة خطة النشاط",
      "متابعة الغياب وإرسال الإشعارات",
      "انتظام الطلاب في اليوم الدراسي",
    ],
  },
  {
    key: "educational-vice-principal",
    id: "supervision-head-educational-vice-principal-evaluation-v1",
    title: "تقييم رئيس الإشراف للوكيل التعليمي",
    roleKey: "BOYS_EDU_VP",
    roleLabel: "الوكيل التعليمي",
    cycles: ["التقييم"],
    items: [
      "متابعة تفعيل الكتاب المدرسي",
      "متابعة تفعيل المذكرات الإثرائية",
      "متابعة رفع الفاقد التعليمي",
      "الإشراف على متابعة الاختبارات",
      "تفعيل المتابعات الأسبوعية",
      "تنفيذ الزيارات التشخيصية",
    ],
  },
  {
    key: "student-guide",
    id: "supervision-head-student-guide-evaluation-v1",
    title: "تقييم رئيس الإشراف للموجه الطلابي",
    roleKey: "BOYS_STUDENT_GUIDE",
    roleLabel: "الموجه الطلابي",
    cycles: ["التقييم"],
    items: [
      "متابعة سجل الواجبات",
      "متابعة سجل المهارات",
      "معالجة الفاقد التعليمي",
      "تفعيل الأسبوع التمهيدي",
      "تفعيل البرامج الإرشادية",
      "تصنيف الحالات الطلابية",
      "متابعة المتعثرين",
      "متابعة الغياب",
      "اللقاءات الفردية مع أولياء الأمور",
      "البرامج التوعوية",
      "السجلات الإرشادية",
      "البرامج القيمية",
      "متابعة الحالات الصحية",
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
  return data.isActive !== false && !["INACTIVE", "DISABLED", "ENDED", "REVOKED"].includes(status);
}

async function readRequiredDoc(db, documentPath, label) {
  const snapshot = await db.doc(documentPath).get();
  assert(snapshot.exists, `${label} not found: ${documentPath}`);
  return snapshot;
}

async function validateEvaluator(db, orgRoot) {
  const evaluator = CONFIG.evaluator;
  const [authUser, user, person, membership, assignments] = await Promise.all([
    admin.auth().getUser(evaluator.uid),
    readRequiredDoc(db, `users/${evaluator.uid}`, "Supervision head user"),
    readRequiredDoc(db, `${orgRoot}/people/${evaluator.personId}`, "Supervision head person"),
    readRequiredDoc(db, `users/${evaluator.uid}/orgMemberships/${CONFIG.orgId}`, "Supervision head membership"),
    db.collection(`${orgRoot}/operationalAssignments`)
      .where("actorPersonId", "==", evaluator.personId)
      .get(),
  ]);
  const userData = user.data();
  const personData = person.data();
  const membershipData = membership.data();
  const schoolIds = Array.from(new Set([
    ...(membershipData.scopes?.schoolIds || []),
    membershipData.scopeType === "SCHOOL" ? membershipData.scopeId : "",
  ].map(asString).filter(Boolean)));
  const evaluationSchoolIds = new Set(
    assignments.docs
      .filter((document) => isActive(document.data()) && asString(document.data().operationKind) === "STAFF_EVALUATION")
      .map((document) => asString(document.data().schoolId || document.data().scopeId)),
  );

  assert(normalizeEmail(authUser.email) === evaluator.email, "Supervision head auth email mismatch.");
  assert(normalizeEmail(userData.email || personData.email) === evaluator.email, "Supervision head Firestore email mismatch.");
  assert(asString(membershipData.personId) === evaluator.personId, "Supervision head personId mismatch.");
  assert(asString(membershipData.roleKey || membershipData.role).toUpperCase() === evaluator.roleKey, "Supervision head role mismatch.");
  assert(membershipData.permissions?.manageEvaluations === true, "Supervision head is missing manageEvaluations.");

  for (const school of CONFIG.schools) {
    assert(schoolIds.includes(school.id), `Supervision head membership does not cover ${school.id}.`);
    assert(evaluationSchoolIds.has(school.id), `Supervision head has no STAFF_EVALUATION assignment for ${school.id}.`);
  }
}

async function loadPreflight(db) {
  const orgRoot = `orgs/${CONFIG.orgId}`;
  await validateEvaluator(db, orgRoot);
  const schools = [];

  for (const school of CONFIG.schools) {
    const schoolDocument = await readRequiredDoc(db, `${orgRoot}/schools/${school.id}`, `${school.key} school`);
    const targetEntries = [];

    for (const framework of FRAMEWORKS) {
      const configuredTarget = school.targets[framework.key];
      const person = await readRequiredDoc(
        db,
        `${orgRoot}/people/${configuredTarget.personId}`,
        `${school.key} ${framework.key} target`,
      );
      const personData = person.data();

      assert(normalizeEmail(personData.email) === configuredTarget.email, `${school.key} ${framework.key} email mismatch.`);
      assert(asString(personData.displayName), `${school.key} ${framework.key} displayName missing.`);
      targetEntries.push({
        key: framework.key,
        personId: person.id,
        email: configuredTarget.email,
        displayName: asString(personData.displayName),
        roleKey: framework.roleKey,
        roleLabel: framework.roleLabel,
      });
    }

    schools.push({
      ...school,
      storedName: asString(schoolDocument.data().name || schoolDocument.data().title),
      targets: Object.fromEntries(targetEntries.map((target) => [target.key, target])),
    });
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
        description: `قالب رسمي لـ${framework.title}.`,
        targetKind: "ADMIN_STAFF",
        targetRoleLabel: framework.roleLabel,
        targetRoleKeyHint: framework.roleKey,
        evaluatorKind: "SUPERVISION_HEAD",
        evaluatorLabel: CONFIG.evaluator.roleLabel,
        defaultEvaluatorRoleKeys: [CONFIG.evaluator.roleKey],
        frameworkKind: "ADMIN_EVALUATION",
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
        title: framework.roleLabel,
        description: `بنود تقييم ${framework.roleLabel}.`,
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
    const target = school.targets[framework.key];
    const planId = `${school.id}-${CONFIG.academicYearId}-${CONFIG.termId}-supervision-head-${framework.key}-evaluation`;
    documents.push({
      type: "plan",
      planId,
      schoolKey: school.key,
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
        planKind: "PERIODIC",
        targetKind: "ADMIN_STAFF",
        targetRoleKey: framework.roleKey,
        targetRoleLabel: framework.roleLabel,
        status: "ACTIVE",
      },
    });

    const policyId = `${planId}-policy-supervision-head`;
    documents.push({
      type: "policy",
      planId,
      schoolKey: school.key,
      path: `${orgRoot}/evaluatorPolicies/${policyId}`,
      data: {
        id: policyId,
        orgId: CONFIG.orgId,
        schoolId: school.id,
        academicYearId: CONFIG.academicYearId,
        termId: CONFIG.termId,
        planId,
        evaluatorRoleKey: CONFIG.evaluator.roleKey,
        evaluatorLabel: CONFIG.evaluator.roleLabel,
        weight: 100,
        required: true,
        canSubmit: true,
        canReview: false,
        canApprove: true,
        order: 1,
      },
    });

    const targetAssignmentId = `${planId}-target-${target.personId}`;
    documents.push({
      type: "targetAssignment",
      planId,
      schoolKey: school.key,
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
        targetRoleKey: framework.roleKey,
        targetRoleLabel: framework.roleLabel,
        targetKind: "ADMIN_STAFF",
        status: "ACTIVE",
      },
    });

    framework.cycles.forEach((title, index) => {
      const cycleNumber = index + 1;
      const cycleId = `${planId}-evaluation-${String(cycleNumber).padStart(2, "0")}`;
      documents.push({
        type: "cycle",
        planId,
        schoolKey: school.key,
        path: `${orgRoot}/evaluationCycles/${cycleId}`,
        data: {
          id: cycleId,
          orgId: CONFIG.orgId,
          schoolId: school.id,
          academicYearId: CONFIG.academicYearId,
          termId: CONFIG.termId,
          planId,
          cycleNumber,
          title,
          cycleKind: "CUSTOM",
          status: "OPEN",
          isIncludedInAverage: true,
        },
      });
      const evaluatorAssignmentId = `${planId}-${cycleId}-${target.personId}-${CONFIG.evaluator.personId}`;
      documents.push({
        type: "evaluatorAssignment",
        planId,
        schoolKey: school.key,
        path: `${orgRoot}/evaluationEvaluatorAssignments/${evaluatorAssignmentId}`,
        data: {
          id: evaluatorAssignmentId,
          orgId: CONFIG.orgId,
          schoolId: school.id,
          academicYearId: CONFIG.academicYearId,
          termId: CONFIG.termId,
          planId,
          cycleId,
          targetPersonId: target.personId,
          targetRoleKey: framework.roleKey,
          targetRoleLabel: framework.roleLabel,
          evaluatorPersonId: CONFIG.evaluator.personId,
          evaluatorEmail: CONFIG.evaluator.email,
          evaluatorRoleKey: CONFIG.evaluator.roleKey,
          weight: 100,
          sourceType: "MANUAL",
          status: "ACTIVE",
        },
      });
    });
  }

  return documents;
}

function assertStructure(documents, preflight) {
  for (const framework of FRAMEWORKS) {
    const sections = documents.filter((document) => document.type === "section" && document.data.frameworkId === framework.id);
    const items = documents.filter((document) => document.type === "item" && document.data.frameworkId === framework.id);
    assert(sections.length === 1 && sections[0].data.weight === 100, `${framework.id} section validation failed.`);
    assert(items.length === framework.items.length, `${framework.id} item count mismatch.`);
    assert(items.every((item, index) => item.data.order === index + 1 && item.data.maxScore === 5), `${framework.id} item validation failed.`);
  }

  for (const school of preflight.schools) {
    for (const framework of FRAMEWORKS) {
      const planId = `${school.id}-${CONFIG.academicYearId}-${CONFIG.termId}-supervision-head-${framework.key}-evaluation`;
      const planDocuments = documents.filter((document) => document.planId === planId);
      assert(planDocuments.filter((document) => document.type === "cycle").length === framework.cycles.length, `${planId} cycle count mismatch.`);
      assert(planDocuments.filter((document) => document.type === "targetAssignment").length === 1, `${planId} target count mismatch.`);
      assert(planDocuments.filter((document) => document.type === "evaluatorAssignment").length === framework.cycles.length, `${planId} evaluator count mismatch.`);
    }
  }
}

function assertDocument(snapshot, desired) {
  const current = snapshot.data();
  for (const [field, expected] of Object.entries(desired.data)) {
    assert(
      JSON.stringify(current[field]) === JSON.stringify(expected),
      `Conflicting ${field} at ${snapshot.ref.path}: expected ${JSON.stringify(expected)}, found ${JSON.stringify(current[field])}`,
    );
  }
}

async function inspectDocuments(db, documents) {
  const snapshots = await db.getAll(...documents.map((document) => db.doc(document.path)));
  const missing = [];
  const existing = [];
  snapshots.forEach((snapshot, index) => {
    const desired = documents[index];
    if (!snapshot.exists) {
      missing.push(desired);
      return;
    }
    assertDocument(snapshot, desired);
    existing.push(desired);
  });
  return { missing, existing };
}

function countByType(documents) {
  return documents.reduce((counts, document) => {
    counts[document.type] = (counts[document.type] || 0) + 1;
    return counts;
  }, {});
}

async function applyMissing(db, documents) {
  assert(documents.length <= 500, "Firestore batch limit exceeded.");
  const batch = db.batch();
  const now = Date.now();
  for (const document of documents) {
    batch.create(db.doc(document.path), {
      ...document.data,
      createdAt: now,
      updatedAt: now,
      ...(document.type === "framework" ? { lockedAt: now } : {}),
      ...(document.type === "targetAssignment" ? { assignedAt: now } : {}),
    });
  }
  await batch.commit();
}

async function verifyPlanCounts(db, preflight) {
  for (const school of preflight.schools) {
    for (const framework of FRAMEWORKS) {
      const planId = `${school.id}-${CONFIG.academicYearId}-${CONFIG.termId}-supervision-head-${framework.key}-evaluation`;
      const [cycles, targets, evaluators] = await Promise.all([
        db.collection(`${preflight.orgRoot}/evaluationCycles`).where("planId", "==", planId).get(),
        db.collection(`${preflight.orgRoot}/evaluationTargetAssignments`).where("planId", "==", planId).get(),
        db.collection(`${preflight.orgRoot}/evaluationEvaluatorAssignments`).where("planId", "==", planId).get(),
      ]);
      assert(cycles.docs.filter((document) => isActive(document.data())).length === framework.cycles.length, `${planId} cycle verify failed.`);
      assert(targets.docs.filter((document) => isActive(document.data())).length === 1, `${planId} target verify failed.`);
      assert(evaluators.docs.filter((document) => isActive(document.data())).length === framework.cycles.length, `${planId} evaluator verify failed.`);
    }
  }
}

async function main() {
  initAdmin();
  const db = admin.firestore();
  const preflight = await loadPreflight(db);
  const documents = [
    ...buildFrameworkDocuments(preflight.orgRoot),
    ...preflight.schools.flatMap((school) => buildSchoolDocuments(preflight.orgRoot, school)),
  ];
  assertStructure(documents, preflight);
  const inspection = await inspectDocuments(db, documents);

  console.log(APPLY ? "Apply mode" : "Preview mode (read-only)");
  console.dir({
    evaluator: CONFIG.evaluator,
    schools: preflight.schools.map((school) => ({
      id: school.id,
      name: school.storedName,
      targets: Object.values(school.targets).map((target) => ({
        roleLabel: target.roleLabel,
        personId: target.personId,
        displayName: target.displayName,
        email: target.email,
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
  }, { depth: 8 });

  if (!APPLY) {
    console.log("No writes performed. Re-run with --apply to create missing documents.");
    return;
  }

  if (inspection.missing.length > 0) await applyMissing(db, inspection.missing);
  const verification = await inspectDocuments(db, documents);
  assert(verification.missing.length === 0, "Documents remain missing after apply.");
  await verifyPlanCounts(db, preflight);
  console.log("Supervision head boys admin evaluations applied and verified.");
  console.dir({ verified: countByType(documents), total: documents.length });
}

main().catch((error) => {
  console.error("Supervision head boys admin evaluation seed failed:");
  console.error(error);
  process.exitCode = 1;
});
