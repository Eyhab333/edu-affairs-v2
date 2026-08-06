/* eslint-disable no-console */

const admin = require("firebase-admin");
const path = require("path");

const APPLY = process.argv.includes("--apply");

const CONFIG = {
  orgId: "takween",
  schoolId: "mrb-girls",
  schoolLabel: "مدرسة منار الريادة بنات",
  academicYearId: "ay-1448",
  termId: "term-1",
  teacherRoleKey: "GIRLS_TEACHER",
  evaluator: {
    uid: "aa3uDx6i5uf6Dp5YP3unAqD5Zyo1",
    personId: "p-s-sayed",
    displayName: "السيد محمد احمد احمد",
    email: "s.sayed@qz.org.sa",
    roleKey: "EDU_SUPERVISOR",
    roleLabel: "المشرف التعليمي",
  },
};

const FRAMEWORKS = [
  {
    key: "periodic",
    id: "educational-supervisor-periodic-teacher-evaluation-v1",
    planSlug: "educational-supervisor-periodic-teacher-evaluation",
    sourceTitle: "تقييم المشرف التعليمي للمعلمين",
    planTitle: "تقييم المشرف التعليمي للمعلمات",
    planKind: "PERIODIC",
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
    sourceTitle: "الزيارة الإشرافية التشخيصية للمعلمين",
    planTitle: "الزيارة الإشرافية التشخيصية للمعلمات",
    planKind: "VISIT_BASED",
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

async function validateFrameworks(db, orgRoot) {
  for (const framework of FRAMEWORKS) {
    const sectionId = `${framework.id}-main`;
    const [frameworkDocument, sectionDocument, items] = await Promise.all([
      readRequiredDoc(db, `${orgRoot}/evaluationFrameworks/${framework.id}`, "Shared framework"),
      readRequiredDoc(db, `${orgRoot}/evaluationRubricSections/${sectionId}`, "Shared framework section"),
      db.collection(`${orgRoot}/evaluationRubricItems`).where("frameworkId", "==", framework.id).get(),
    ]);
    const frameworkData = frameworkDocument.data();
    assert(asString(frameworkData.title) === framework.sourceTitle, `${framework.id} title mismatch.`);
    assert(frameworkData.isActive !== false && frameworkData.isLocked === true && frameworkData.version === 1, `${framework.id} lock/version mismatch.`);
    assert(sectionDocument.data().weight === 100 && isActive(sectionDocument.data()), `${framework.id} section mismatch.`);
    const orderedItems = items.docs.filter((item) => isActive(item.data())).sort((left, right) => left.data().order - right.data().order);
    assert(orderedItems.length === framework.items.length, `${framework.id} item count mismatch.`);
    orderedItems.forEach((item, index) => {
      assert(asString(item.data().title) === framework.items[index], `${framework.id} item ${index + 1} title mismatch.`);
      assert(item.data().order === index + 1 && item.data().maxScore === 5, `${framework.id} item ${index + 1} order/maxScore mismatch.`);
    });
  }
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
    validateFrameworks(db, orgRoot),
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

  const teacherPersonIds = new Set();
  for (const teacherMembership of memberships) {
    const data = teacherMembership.data();
    const roleKey = asString(data.roleKey || data.role).toUpperCase();
    if (isActive(data) && membershipCoversSchool(data) && [CONFIG.teacherRoleKey, "TEACHER"].includes(roleKey) && asString(data.personId)) {
      teacherPersonIds.add(asString(data.personId));
    }
  }
  assert(teacherPersonIds.size > 0, "No active girls teachers found.");
  const people = await db.getAll(...Array.from(teacherPersonIds).map((personId) => db.doc(`${orgRoot}/people/${personId}`)));
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
    const planId = `${CONFIG.schoolId}-${CONFIG.academicYearId}-${CONFIG.termId}-${framework.planSlug}`;
    documents.push({ type: "plan", planId, path: `${orgRoot}/evaluationPlans/${planId}`, data: {
      id: planId, orgId: CONFIG.orgId, schoolId: CONFIG.schoolId, academicYearId: CONFIG.academicYearId,
      termId: CONFIG.termId, title: `${framework.planTitle} - ${CONFIG.schoolLabel} - الفصل الأول`,
      description: `خطة تطبيق ${framework.planTitle} داخل الفصل الدراسي الأول.`, frameworkId: framework.id,
      planKind: framework.planKind, targetKind: "TEACHER", targetRoleKey: CONFIG.teacherRoleKey,
      targetRoleLabel: "المعلمات", status: "ACTIVE",
    }});
    const policyId = `${planId}-policy-educational-supervisor`;
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
    const planId = `${CONFIG.schoolId}-${CONFIG.academicYearId}-${CONFIG.termId}-${framework.planSlug}`;
    const planDocuments = documents.filter((document) => document.planId === planId);
    assert(planDocuments.filter((document) => document.type === "plan").length === 1, `${planId} plan count mismatch.`);
    assert(planDocuments.filter((document) => document.type === "policy").length === 1, `${planId} policy count mismatch.`);
    assert(planDocuments.filter((document) => document.type === "cycle").length === 3, `${planId} cycle count mismatch.`);
    assert(planDocuments.filter((document) => document.type === "targetAssignment").length === teachers.length, `${planId} target count mismatch.`);
    assert(planDocuments.filter((document) => document.type === "evaluatorAssignment").length === teachers.length * 3, `${planId} evaluator count mismatch.`);
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
  for (const group of chunk(documents, 400)) {
    const batch = db.batch();
    for (const document of group) batch.create(db.doc(document.path), {
      ...document.data, createdAt: now, updatedAt: now,
      ...(document.type === "targetAssignment" ? { assignedAt: now } : {}),
    });
    await batch.commit();
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
    assert(cycles.docs.filter((document) => isActive(document.data())).length === 3, `${planId} active cycle verification failed.`);
    assert(targets.docs.filter((document) => isActive(document.data())).length === teachers.length, `${planId} active target verification failed.`);
    assert(assignments.docs.filter((document) => isActive(document.data())).length === teachers.length * 3, `${planId} active evaluator verification failed.`);
  }
}
function buildReport(teachers, documents, inspection) {
  return {
    reusedFrameworks: FRAMEWORKS.map((framework) => ({ id: framework.id, cycles: 3, items: framework.items.length })),
    evaluator: CONFIG.evaluator,
    teachers: teachers.length,
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
  console.log("Girls educational supervisor teacher evaluations applied and verified.");
  console.dir({ verified: countByType(documents), total: documents.length });
}

main().catch((error) => {
  console.error("Girls educational supervisor teacher evaluation seed failed:");
  console.error(error);
  process.exitCode = 1;
});
