/* eslint-disable no-console */

const admin = require("firebase-admin");
const path = require("path");

const APPLY = process.argv.includes("--apply");
const EVALUATOR_KEY = process.argv.includes("--evaluator=student-counselor")
  ? "studentCounselor"
  : process.argv.includes("--evaluator=vice-principal")
    ? "vicePrincipal"
    : "principal";

const EVALUATORS = {
  principal: {
    uid: "okMSrTs9InbKydR0XGo90ZaBqJC2",
    personId: "p-n-albader",
    displayName: "نادية عثمان ناصر البدر",
    email: "n.albader@qz.org.sa",
    roleKey: "GIRLS_PRINCIPAL",
    roleLabel: "مديرة المدرسة",
  },
  vicePrincipal: {
    uid: "nRxO6AZ635QgJIcR4yU6vClgExy2",
    personId: "p-f-alobawe",
    displayName: "فوزيه عبدالله مطلق العبيوي",
    email: "f.alobawe@qz.org.sa",
    roleKey: "GIRLS_VP",
    roleLabel: "وكيلة المدرسة",
  },
  studentCounselor: {
    uid: "Ivr7RIb0AoWIuKAgQTcK0LzKRCz1",
    personId: "staff-Ivr7RIb0AoWIuKAgQTcK0LzKRCz1",
    displayName: "ساره ناصر محمد الحمد",
    email: "sarah@qz.org.sa",
    roleKey: "GIRLS_STUDENT_COUNSELOR",
    roleLabel: "الموجهة الطلابية",
  },
};

const CONFIG = {
  orgId: "takween",
  schoolId: "mrb-girls",
  schoolLabel: "مدرسة منار الريادة بنات",
  academicYearId: "ay-1448",
  termId: "term-1",
  teacherRoleKey: "GIRLS_TEACHER",
  evaluator: EVALUATORS[EVALUATOR_KEY],
};

const WEEK_TITLES = [
  "الأسبوع الأول", "الأسبوع الثاني", "الأسبوع الثالث", "الأسبوع الرابع", "الأسبوع الخامس",
  "الأسبوع السادس", "الأسبوع السابع", "الأسبوع الثامن", "الأسبوع التاسع", "الأسبوع العاشر",
  "الأسبوع الحادي عشر", "الأسبوع الثاني عشر", "الأسبوع الثالث عشر", "الأسبوع الرابع عشر",
  "الأسبوع الخامس عشر", "الأسبوع السادس عشر", "الأسبوع السابع عشر", "الأسبوع الثامن عشر",
  "الأسبوع التاسع عشر",
];

const PRINCIPAL_FRAMEWORKS = [
  {
    key: "weekly",
    id: "girls-principal-weekly-teacher-evaluation-v1",
    planSlug: "girls-principal-weekly-teacher-evaluation",
    title: "التقييم الأسبوعي للمعلمات بواسطة مديرة المدرسة",
    description: "قالب رسمي لمتابعة مديرة المدرسة للمعلمات أسبوعيًا داخل الفصل الدراسي.",
    planKind: "WEEKLY",
    frameworkKind: "WEEKLY_TEACHER_EVALUATION",
    cycles: WEEK_TITLES.map((title, index) => ({
      number: index + 1,
      title,
      suffix: `week-${String(index + 1).padStart(2, "0")}`,
      kind: "WEEK",
    })),
    items: [
      "التحضير",
      "سجل الواجبات",
      "الكتاب المدرسي",
      "الاصطفاف الصباحي",
      "ترتيب ونظافة المرافق",
      "الالتزام بالزي الرسمي",
      "النشر الإعلامي للفعاليات وأخبار المدرسة",
      "التزام المعلمة بدخول الحصص",
      "الإشراف والمناوبة",
      "القيام بما يسند إليها من مهام",
      "التواصل والتفاعل مع أولياء الأمور",
      "حسن التصرف مع الزملاء والرؤساء وأولياء الأمور",
      "المبادرة في تقبل وتنفيذ التوجيهات",
      "تفعيل الأنشطة المدرسية",
      "التحفيز",
    ],
  },
  {
    key: "periodic",
    id: "girls-principal-periodic-teacher-evaluation-v1",
    planSlug: "girls-principal-periodic-teacher-evaluation",
    title: "المتابعة الفترية للمعلمات بواسطة مديرة المدرسة",
    description: "قالب رسمي لمتابعة مديرة المدرسة الفترية للمعلمات مرتين داخل الفصل الدراسي.",
    planKind: "PERIODIC",
    frameworkKind: "CLASSROOM_VISIT",
    cycles: [
      { number: 1, title: "التقييم الأول", suffix: "evaluation-01", kind: "VISIT" },
      { number: 2, title: "التقييم الثاني", suffix: "evaluation-02", kind: "VISIT" },
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
      "مناسبة الاستراتيجيات للدرس",
      "ضبط الصف وإدارته",
      "إدارة الوقت بفاعلية",
      "الفاقد التعليمي",
      "إثارة الدافعية وتعزيز الإجابات",
      "ربط الدرس بواقع حياة التلميذ",
      "التركيز على ترسيخ القيم المستهدفة",
      "تحقيق أهداف الدرس",
      "ربط الأهداف بالتقويم",
      "مهارة إغلاق الدرس",
      "إشباع مهارات المادة",
      "تفعيل الزيارات المتبادلة",
      "تفعيل الأنشطة والمبادرات",
    ],
  },
];

const VICE_PRINCIPAL_FRAMEWORKS = [
  {
    key: "vice-principal-weekly",
    id: "girls-vice-principal-weekly-teacher-evaluation-v1",
    planSlug: "girls-vice-principal-weekly-teacher-evaluation",
    title: "التقييم الأسبوعي للمعلمات بواسطة وكيلة المدرسة",
    description: "قالب رسمي لمتابعة وكيلة المدرسة للمعلمات أسبوعيًا داخل الفصل الدراسي.",
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
      "أوراق العمل",
      "متابعة التحضير",
      "سجل المهارات",
      "التزام المعلمة بدخول الحصص",
      "الإشراف على الفسح والمناوبات",
      "الاصطفاف الصباحي",
      "تفعيل حصص الانتظار",
      "نظافة المرافق",
      "السلوك العام والقدوة الحسنة",
      "تقبل التوجيهات",
    ],
  },
  {
    key: "vice-principal-periodic",
    id: "girls-vice-principal-periodic-teacher-evaluation-v1",
    planSlug: "girls-vice-principal-periodic-teacher-evaluation",
    title: "المتابعة الفترية للمعلمات بواسطة وكيلة المدرسة",
    description: "قالب رسمي لمتابعة وكيلة المدرسة الفترية للمعلمات مرتين داخل الفصل الدراسي.",
    planKind: "PERIODIC",
    frameworkKind: "CLASSROOM_VISIT",
    cycles: [
      { number: 1, title: "التقييم الأول", suffix: "evaluation-01", kind: "VISIT" },
      { number: 2, title: "التقييم الثاني", suffix: "evaluation-02", kind: "VISIT" },
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
      "تفعيل استراتيجيات التدريس الحديثة المناسبة للدرس",
      "ضبط الصف وإدارته",
      "إدارة الوقت بفاعلية",
      "إثارة الدافعية وتعزيز الإجابات",
      "ربط الدرس بواقع حياة التلميذ",
      "التركيز على ترسيخ القيمة المستهدفة",
      "تحقيق أهداف الدرس",
      "تفعيل المبادرات التعليمية",
      "حسن التصرف مع الرؤساء والزملاء وأولياء الأمور",
      "الالتزام بالمناوبات",
      "مجتمعات التعلم المهنية",
      "الفاقد التعليمي",
      "تدريب الزملاء تقنيًا",
    ],
  },
];

const STUDENT_COUNSELOR_FRAMEWORKS = [
  {
    key: "student-counselor-weekly",
    id: "girls-student-counselor-weekly-teacher-evaluation-v1",
    planSlug: "girls-student-counselor-weekly-teacher-evaluation",
    title: "التقييم الأسبوعي للمعلمات بواسطة الموجهة الطلابية",
    description: "قالب رسمي لمتابعة الموجهة الطلابية للمعلمات أسبوعيًا داخل الفصل الدراسي.",
    planKind: "WEEKLY",
    frameworkKind: "WEEKLY_TEACHER_EVALUATION",
    cycles: WEEK_TITLES.map((title, index) => ({
      number: index + 1,
      title,
      suffix: `week-${String(index + 1).padStart(2, "0")}`,
      kind: "WEEK",
    })),
    items: [
      "سجل المهارات",
      "مذكرة الواجبات",
      "متابعة الفواقد",
    ],
  },
];

const FRAMEWORKS = EVALUATOR_KEY === "studentCounselor"
  ? STUDENT_COUNSELOR_FRAMEWORKS
  : EVALUATOR_KEY === "vicePrincipal"
    ? VICE_PRINCIPAL_FRAMEWORKS
    : PRINCIPAL_FRAMEWORKS;

function initAdmin() {
  if (admin.apps.length) return;
  const serviceAccountPath = path.resolve(process.cwd(), "service-account.json");
  const serviceAccount = require(serviceAccountPath);
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount), projectId: serviceAccount.project_id });
}

function assert(condition, message) { if (!condition) throw new Error(message); }
function asString(value) { return typeof value === "string" ? value.trim() : ""; }
function normalizeEmail(value) { return asString(value).toLowerCase(); }
function isActive(data) {
  const status = asString(data.status).toUpperCase();
  return data.isActive !== false && data.active !== false && !["DISABLED", "ENDED", "INACTIVE", "REVOKED", "REMOVED"].includes(status);
}
function membershipCoversSchool(data) {
  return asString(data.schoolId) === CONFIG.schoolId || asString(data.scopeId) === CONFIG.schoolId || data.scopes?.schoolIds?.includes(CONFIG.schoolId) || data.scopes?.canAccessAllSchools === true;
}
function uniqueDocuments(documents) {
  return Array.from(new Map(documents.map((document) => [document.ref.path, document])).values());
}
function chunk(values, size) {
  const result = [];
  for (let index = 0; index < values.length; index += size) result.push(values.slice(index, index + size));
  return result;
}
async function readRequiredDoc(db, documentPath, label) {
  const snapshot = await db.doc(documentPath).get();
  assert(snapshot.exists, `${label} not found: ${documentPath}`);
  return snapshot;
}

async function loadSchoolMemberships(db, orgRoot) {
  const membershipsRef = db.collection(`${orgRoot}/memberships`);
  const [bySchoolId, byScopeId, bySchoolIds, users] = await Promise.all([
    membershipsRef.where("schoolId", "==", CONFIG.schoolId).get(),
    membershipsRef.where("scopeId", "==", CONFIG.schoolId).get(),
    membershipsRef.where("scopes.schoolIds", "array-contains", CONFIG.schoolId).get(),
    db.collection("users").where("schoolIds", "array-contains", CONFIG.schoolId).get(),
  ]);
  const nested = users.empty
    ? []
    : await db.getAll(...users.docs.map((user) => db.doc(`users/${user.id}/orgMemberships/${CONFIG.orgId}`)));
  return uniqueDocuments([...bySchoolId.docs, ...byScopeId.docs, ...bySchoolIds.docs, ...nested.filter((membership) => membership.exists)]);
}

async function loadPreflight(db) {
  const orgRoot = `orgs/${CONFIG.orgId}`;
  const evaluator = CONFIG.evaluator;
  const [authUser, user, person, membership, operations, school, memberships] = await Promise.all([
    admin.auth().getUser(evaluator.uid),
    readRequiredDoc(db, `users/${evaluator.uid}`, "Evaluator user"),
    readRequiredDoc(db, `${orgRoot}/people/${evaluator.personId}`, "Evaluator person"),
    readRequiredDoc(db, `users/${evaluator.uid}/orgMemberships/${CONFIG.orgId}`, "Evaluator membership"),
    db.collection(`${orgRoot}/operationalAssignments`).where("actorPersonId", "==", evaluator.personId).get(),
    readRequiredDoc(db, `${orgRoot}/schools/${CONFIG.schoolId}`, "School"),
    loadSchoolMemberships(db, orgRoot),
  ]);
  const membershipData = membership.data();
  assert(normalizeEmail(authUser.email) === evaluator.email, "Evaluator auth email mismatch.");
  assert(normalizeEmail(user.data().email || person.data().email) === evaluator.email, "Evaluator user email mismatch.");
  assert(asString(membershipData.personId) === evaluator.personId, "Evaluator personId mismatch.");
  assert(asString(membershipData.roleKey || membershipData.role).toUpperCase() === evaluator.roleKey, "Evaluator role mismatch.");
  assert(isActive(membershipData) && membershipCoversSchool(membershipData), "Evaluator membership/scope mismatch.");
  assert(membershipData.permissions?.manageEvaluations === true, "Evaluator is missing manageEvaluations.");
  assert(asString(person.data().displayName) === evaluator.displayName, "Evaluator displayName mismatch.");
  assert(asString(school.data().name || school.data().title) === CONFIG.schoolLabel, "School label mismatch.");
  assert(operations.docs.some((document) => isActive(document.data()) && asString(document.data().operationKind) === "STAFF_EVALUATION" && asString(document.data().schoolId || document.data().scopeId) === CONFIG.schoolId), "Evaluator is missing STAFF_EVALUATION.");

  const teacherMemberships = memberships.filter((document) => {
    const data = document.data();
    const roleKey = asString(data.roleKey || data.role).toUpperCase();
    return isActive(data) && membershipCoversSchool(data) && [CONFIG.teacherRoleKey, "TEACHER"].includes(roleKey) && asString(data.personId);
  });
  const membershipByPersonId = new Map();
  for (const teacherMembership of teacherMemberships) {
    const personId = asString(teacherMembership.data().personId);
    const existingMembership = membershipByPersonId.get(personId);
    if (existingMembership) {
      const existingRoleKey = asString(
        existingMembership.data().roleKey || existingMembership.data().role,
      ).toUpperCase();
      const currentRoleKey = asString(
        teacherMembership.data().roleKey || teacherMembership.data().role,
      ).toUpperCase();
      assert(
        existingRoleKey === currentRoleKey,
        `Conflicting duplicate teacher membership: ${personId}`,
      );
      continue;
    }
    membershipByPersonId.set(personId, teacherMembership);
  }
  assert(membershipByPersonId.size > 0, "No active girls teachers found.");
  const people = await db.getAll(...Array.from(membershipByPersonId.keys()).map((personId) => db.doc(`${orgRoot}/people/${personId}`)));
  const teachers = people.map((teacher) => {
    assert(teacher.exists, `Teacher person missing: ${teacher.ref.path}`);
    const displayName = asString(teacher.data().displayName);
    const email = normalizeEmail(teacher.data().email);
    assert(displayName && email, `Teacher identity incomplete: ${teacher.ref.path}`);
    return { personId: teacher.id, displayName, email };
  }).sort((left, right) => left.displayName.localeCompare(right.displayName, "ar"));
  return { orgRoot, teachers };
}

function buildDocuments(orgRoot, teachers) {
  const documents = [];
  for (const framework of FRAMEWORKS) {
    const sectionId = `${framework.id}-main`;
    const planId = `${CONFIG.schoolId}-${CONFIG.academicYearId}-${CONFIG.termId}-${framework.planSlug}`;
    documents.push({ type: "framework", path: `${orgRoot}/evaluationFrameworks/${framework.id}`, data: {
      id: framework.id, orgId: CONFIG.orgId, title: framework.title, description: framework.description,
      targetKind: "TEACHER", targetRoleLabel: "المعلمات", targetRoleKeyHint: CONFIG.teacherRoleKey,
      evaluatorKind: "SCHOOL_PRINCIPAL", evaluatorLabel: CONFIG.evaluator.roleLabel,
      defaultEvaluatorRoleKeys: [CONFIG.evaluator.roleKey], frameworkKind: framework.frameworkKind,
      schoolTypes: ["PRIMARY"], maxCyclesPerTerm: framework.cycles.length, defaultItemMaxScore: 5,
      isActive: true, isLocked: true, version: 1,
    }});
    documents.push({ type: "section", path: `${orgRoot}/evaluationRubricSections/${sectionId}`, data: {
      id: sectionId, orgId: CONFIG.orgId, frameworkId: framework.id, title: framework.title,
      description: `بنود ${framework.title}.`, order: 1, weight: 100, isActive: true,
    }});
    framework.items.forEach((title, index) => {
      const itemId = `${sectionId}-${String(index + 1).padStart(2, "0")}`;
      documents.push({ type: "item", path: `${orgRoot}/evaluationRubricItems/${itemId}`, data: {
        id: itemId, orgId: CONFIG.orgId, frameworkId: framework.id, sectionId, title, description: "",
        order: index + 1, maxScore: 5, scoreInputType: "SCORE", isRequired: true, isActive: true,
      }});
    });
    documents.push({ type: "plan", planId, path: `${orgRoot}/evaluationPlans/${planId}`, data: {
      id: planId, orgId: CONFIG.orgId, schoolId: CONFIG.schoolId, academicYearId: CONFIG.academicYearId,
      termId: CONFIG.termId, title: `${framework.title} - ${CONFIG.schoolLabel} - الفصل الأول`,
      description: `خطة تطبيق ${framework.title} داخل الفصل الدراسي الأول.`, frameworkId: framework.id,
      planKind: framework.planKind, targetKind: "TEACHER", targetRoleKey: CONFIG.teacherRoleKey,
      targetRoleLabel: "المعلمات", status: "ACTIVE",
    }});
    const policyId = `${planId}-policy-principal`;
    documents.push({ type: "policy", planId, path: `${orgRoot}/evaluatorPolicies/${policyId}`, data: {
      id: policyId, orgId: CONFIG.orgId, schoolId: CONFIG.schoolId, academicYearId: CONFIG.academicYearId,
      termId: CONFIG.termId, planId, evaluatorRoleKey: CONFIG.evaluator.roleKey,
      evaluatorLabel: CONFIG.evaluator.roleLabel, evaluatorPersonId: CONFIG.evaluator.personId,
      weight: 100, required: true, canSubmit: true, canReview: false, canApprove: true, order: 1,
    }});
    for (const cycle of framework.cycles) {
      const cycleId = `${planId}-${cycle.suffix}`;
      documents.push({ type: "cycle", planId, path: `${orgRoot}/evaluationCycles/${cycleId}`, data: {
        id: cycleId, orgId: CONFIG.orgId, schoolId: CONFIG.schoolId, academicYearId: CONFIG.academicYearId,
        termId: CONFIG.termId, planId, cycleNumber: cycle.number, title: cycle.title, cycleKind: cycle.kind,
        status: "OPEN", isIncludedInAverage: true,
      }});
    }
    for (const teacher of teachers) {
      const targetId = `${planId}-target-${teacher.personId}`;
      documents.push({ type: "targetAssignment", planId, path: `${orgRoot}/evaluationTargetAssignments/${targetId}`, data: {
        id: targetId, orgId: CONFIG.orgId, schoolId: CONFIG.schoolId, academicYearId: CONFIG.academicYearId,
        termId: CONFIG.termId, planId, targetPersonId: teacher.personId, targetEmail: teacher.email,
        targetDisplayName: teacher.displayName, targetRoleKey: CONFIG.teacherRoleKey, targetRoleLabel: "معلمة",
        targetKind: "TEACHER", status: "ACTIVE",
      }});
      for (const cycle of framework.cycles) {
        const cycleId = `${planId}-${cycle.suffix}`;
        const assignmentId = `${cycleId}-${teacher.personId}-${CONFIG.evaluator.personId}`;
        documents.push({ type: "evaluatorAssignment", planId, path: `${orgRoot}/evaluationEvaluatorAssignments/${assignmentId}`, data: {
          id: assignmentId, orgId: CONFIG.orgId, schoolId: CONFIG.schoolId,
          academicYearId: CONFIG.academicYearId, termId: CONFIG.termId, planId, cycleId,
          targetPersonId: teacher.personId, targetRoleKey: CONFIG.teacherRoleKey, targetRoleLabel: "معلمة",
          evaluatorPersonId: CONFIG.evaluator.personId, evaluatorEmail: CONFIG.evaluator.email,
          evaluatorRoleKey: CONFIG.evaluator.roleKey, weight: 100, sourceType: "MANUAL", status: "ACTIVE",
        }});
      }
    }
  }
  return documents;
}

function assertStructure(documents, teachers) {
  for (const framework of FRAMEWORKS) {
    const sections = documents.filter((document) => document.type === "section" && document.data.frameworkId === framework.id);
    const items = documents.filter((document) => document.type === "item" && document.data.frameworkId === framework.id);
    assert(sections.length === 1 && sections[0].data.weight === 100, `${framework.id} section validation failed.`);
    assert(items.length === framework.items.length, `${framework.id} item count mismatch.`);
    assert(new Set(framework.items).size === framework.items.length, `${framework.id} contains duplicate items.`);
    assert(items.every((item, index) => item.data.order === index + 1 && item.data.maxScore === 5), `${framework.id} item validation failed.`);
    const planId = `${CONFIG.schoolId}-${CONFIG.academicYearId}-${CONFIG.termId}-${framework.planSlug}`;
    const planDocuments = documents.filter((document) => document.planId === planId);
    assert(planDocuments.filter((document) => document.type === "cycle").length === framework.cycles.length, `${planId} cycle count mismatch.`);
    assert(planDocuments.filter((document) => document.type === "targetAssignment").length === teachers.length, `${planId} target count mismatch.`);
    assert(planDocuments.filter((document) => document.type === "evaluatorAssignment").length === teachers.length * framework.cycles.length, `${planId} evaluator count mismatch.`);
  }
}

function assertExistingDocument(snapshot, desired) {
  const current = snapshot.data();
  for (const [field, expected] of Object.entries(desired.data)) {
    assert(JSON.stringify(current[field]) === JSON.stringify(expected), `Conflicting ${field} at ${snapshot.ref.path}: expected ${JSON.stringify(expected)}, found ${JSON.stringify(current[field])}`);
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
      else { assertExistingDocument(snapshot, desired); existing.push(desired); }
    });
  }
  return { missing, existing };
}
function countByType(documents) {
  return documents.reduce((counts, document) => { counts[document.type] = (counts[document.type] || 0) + 1; return counts; }, {});
}
async function applyMissingDocuments(db, documents) {
  const now = Date.now();
  const groups = chunk(documents, 400);
  for (let index = 0; index < groups.length; index += 1) {
    const batch = db.batch();
    for (const document of groups[index]) batch.create(db.doc(document.path), {
      ...document.data, createdAt: now, updatedAt: now,
      ...(document.type === "framework" ? { lockedAt: now } : {}),
      ...(document.type === "targetAssignment" ? { assignedAt: now } : {}),
    });
    await batch.commit();
    console.log(`Applied batch ${index + 1}/${groups.length} (${groups[index].length} documents).`);
  }
}
async function verifyPlanCounts(db, orgRoot, teachers) {
  for (const framework of FRAMEWORKS) {
    const planId = `${CONFIG.schoolId}-${CONFIG.academicYearId}-${CONFIG.termId}-${framework.planSlug}`;
    const [cycles, targets, assignments] = await Promise.all([
      db.collection(`${orgRoot}/evaluationCycles`).where("planId", "==", planId).get(),
      db.collection(`${orgRoot}/evaluationTargetAssignments`).where("planId", "==", planId).get(),
      db.collection(`${orgRoot}/evaluationEvaluatorAssignments`).where("planId", "==", planId).get(),
    ]);
    assert(cycles.docs.filter((document) => isActive(document.data())).length === framework.cycles.length, `${planId} active cycle verification failed.`);
    assert(targets.docs.filter((document) => isActive(document.data())).length === teachers.length, `${planId} active target verification failed.`);
    assert(assignments.docs.filter((document) => isActive(document.data())).length === teachers.length * framework.cycles.length, `${planId} active evaluator verification failed.`);
  }
}
function buildReport(teachers, documents, inspection) {
  return {
    evaluator: CONFIG.evaluator,
    teachers: { count: teachers.length, people: teachers },
    frameworks: FRAMEWORKS.map((framework) => ({ id: framework.id, cycles: framework.cycles.length, items: framework.items.length })),
    desired: countByType(documents), existing: countByType(inspection.existing), missing: countByType(inspection.missing), total: documents.length,
  };
}

async function main() {
  initAdmin();
  const db = admin.firestore();
  const preflight = await loadPreflight(db);
  const documents = buildDocuments(preflight.orgRoot, preflight.teachers);
  assertStructure(documents, preflight.teachers);
  const inspection = await inspectDocuments(db, documents);
  console.log(APPLY ? "Apply mode" : "Preview mode (read-only)");
  console.dir(buildReport(preflight.teachers, documents, inspection), { depth: 7 });
  if (!APPLY) { console.log("No writes performed. Re-run with --apply to create missing documents."); return; }
  if (inspection.missing.length > 0) await applyMissingDocuments(db, inspection.missing);
  const verification = await inspectDocuments(db, documents);
  assert(verification.missing.length === 0, "Documents are still missing after apply.");
  await verifyPlanCounts(db, preflight.orgRoot, preflight.teachers);
  console.log(`${CONFIG.evaluator.roleLabel} teacher evaluations applied and verified.`);
  console.dir({ verified: countByType(documents), total: documents.length });
}

main().catch((error) => {
  console.error(`${CONFIG.evaluator.roleLabel} teacher evaluation seed failed:`);
  console.error(error);
  process.exitCode = 1;
});
