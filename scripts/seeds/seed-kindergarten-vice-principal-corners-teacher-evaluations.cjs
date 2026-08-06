/* eslint-disable no-console */

const admin = require("firebase-admin");
const path = require("path");

const APPLY = process.argv.includes("--apply");

const CONFIG = {
  orgId: "takween",
  academicYearId: "ay-1448",
  termId: "term-1",
  schools: [
    school("kg-01", "روضة واحة الرياحين الأولى", evaluator("ms10LdA0k5TVkiJo4VO6pprmcOh2", "staff-ms10LdA0k5TVkiJo4VO6pprmcOh2", "تماضر صالح محمد العامر", "t.alamer@qz.org.sa"), teacher("6pym4mAT1wX9Gw4OeGDGZARbCPJ3", "p-h-alarajh", "حصة عيسى حمد العراجة", "h.alarajh@qz.org.sa")),
    school("kg-02", "روضة واحة الرياحين الثانية", evaluator("yC5MUiMlxCXt9RnrjPmT85Ko34t1", "p-h-aljower", "هاجر أحمد فهد الجوير", "h.aljower@qz.org.sa"), teacher("A0K0ctyJVyZCjp4wO3IBF14Upd32", "p-h-almadallah", "حصه عبدالعزيز محمد المدالله", "h.almadallah@qz.org.sa")),
    school("kg-03", "روضة واحة الرياحين الثالثة", evaluator("tfvc13fv0DOLqAjQ8s8cpojRMVG2", "p-s-alslman", "ساره سعد أحمد السلمان", "s.alslman@qz.org.sa"), teacher("i2LDsRAINLbVxxha3Hm2yg3MFvC2", "p-r-alfayez", "رغده سليمان محمد الفايز", "r.alfayez@qz.org.sa")),
    school("kg-04", "روضة واحة الرياحين الرابعة", evaluator("2DtRW3PPQLSjuZR1Pyp1WucwzKy1", "p-h-alshaya", "حصه عبدالرزاق احمد الشايع", "h.alshaya@qz.org.sa"), teacher("uy60CMhBPLUDXWRJ8NlmemfwfDe2", "p-s-bader", "ساره عبدالله علي البدر", "s.bader@qz.org.sa")),
  ],
};

function evaluator(uid, personId, displayName, email) {
  return { uid, personId, displayName, email, roleKey: "KG_VP", roleLabel: "وكيلة الروضة" };
}

function teacher(uid, personId, displayName, email) {
  return { uid, personId, displayName, email, roleKey: "KG_TEACHER", roleLabel: "معلمة الأركان" };
}

function school(id, label, requestedEvaluator, cornersTeacher) {
  return { id, label, evaluator: requestedEvaluator, cornersTeacher };
}

const ORDINALS = [
  "الأول", "الثاني", "الثالث", "الرابع", "الخامس", "السادس", "السابع", "الثامن", "التاسع",
  "العاشر", "الحادي عشر", "الثاني عشر", "الثالث عشر", "الرابع عشر", "الخامس عشر",
  "السادس عشر", "السابع عشر", "الثامن عشر", "التاسع عشر",
];

const FRAMEWORKS = [
  {
    key: "weekly",
    id: "kg-vice-principal-corners-teacher-weekly-evaluation-v1",
    title: "تقييم وكيلة الروضة لمعلمة الأركان - التقييم الأسبوعي",
    planKind: "WEEKLY",
    frameworkKind: "WEEKLY_TEACHER_EVALUATION",
    cycles: ORDINALS.map((ordinal, index) => ({
      number: index + 1,
      title: `الأسبوع ${ordinal}`,
      suffix: `week-${String(index + 1).padStart(2, "0")}`,
      kind: "WEEK",
    })),
    items: [
      "متابعة تنفيذ أوراق العمل",
      "تفعيل ملف إنجاز الأطفال",
      "تفعيل استمارة تقييم الأطفال",
      "اكتمال التحضير وتوافقه مع توزيع المنهج",
      "المبادرة في تقبل وتنفيذ التوجيهات",
      "الالتزام بالإشراف على الأطفال والمناوبات",
      "الالتزام بالمناوبة الصباحية ونهاية الدوام",
      "السلوك العام والقدوة الحسنة",
      "حسن التصرف مع الرؤساء والزملاء وأولياء الأمور",
      "التزام المعلمة بدخول الحصص",
    ],
  },
  {
    key: "diagnostic",
    id: "kg-vice-principal-corners-teacher-diagnostic-evaluation-v1",
    title: "الزيارة التشخيصية لمعلمة الأركان بواسطة وكيلة الروضة",
    planKind: "VISIT_BASED",
    frameworkKind: "CLASSROOM_VISIT",
    cycles: [
      { number: 1, title: "الزيارة التشخيصية الأولى", suffix: "visit-01", kind: "VISIT" },
      { number: 2, title: "الزيارة التشخيصية الثانية", suffix: "visit-02", kind: "VISIT" },
    ],
    items: [
      "تقدر المسؤولية وتلتزم بأخلاقيات المهنة والتعليمات التنظيمية",
      "إدارة حوار وأسئلة مفتوحة مع الأطفال داخل المراكز",
      "المهارة في إدارة المراكز التعليمية",
      "عرض النشاط بطريقة متسلسلة ومشوقة ومترابطة",
      "تحقيق أهداف المراكز التعليمية",
      "تفعيل مراكز التعلم بمهارة عالية",
      "استخدام استراتيجيات تعلم فعالة وتوظيف تقنيات التعلم",
      "تهيئة بيئة الصف قبل بدء الدرس (التنظيم)",
      "توظيف استراتيجيات تربوية في معالجة سلوك المتعلمين تدعم اكتساب القيم والمبادئ",
      "تطوير مراكز التعلم بشكل مستمر",
      "الاهتمام بالتطور المهني والنمو المعرفي",
      "الالتزام بمواءمة أنشطة المراكز مع الخطة المنهجية",
      "تنفيذ قوانين المراكز التعليمية",
      "استخدام خامات البيئة بما يثري المراكز",
      "تنفيذ لوحة شعار الوحدة التعليمية",
      "تنفيذ لوحة خطة المفاهيم الأسبوعية للوحدة التعليمية",
      "تخصيص لوحة لعرض أعمال الأطفال",
      "التمكن من المادة العلمية والقدرة على تحقيق أهدافها",
      "التمهيد للنشاط بشكل جذاب ومناسب",
      "الاهتمام بإثراء المراكز التعليمية بالمواد والأدوات اللازمة",
      "الاهتمام بتفعيل ملف إنجاز المعلمة",
    ],
  },
];

function initAdmin() {
  if (admin.apps.length) return;
  const serviceAccountPath = path.resolve(process.cwd(), "service-account.json");
  const serviceAccount = require(serviceAccountPath);
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount), projectId: serviceAccount.project_id });
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
  return data.isActive !== false && data.active !== false &&
    !["DISABLED", "ENDED", "INACTIVE", "REVOKED", "REMOVED"].includes(status);
}

function membershipCoversSchool(data, schoolId) {
  return asString(data.schoolId) === schoolId || asString(data.scopeId) === schoolId ||
    data.scopes?.schoolIds?.includes(schoolId) || data.scopes?.canAccessAllSchools === true;
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

async function validateActor(db, orgRoot, schoolConfig) {
  const requestedEvaluator = schoolConfig.evaluator;
  const requestedTarget = schoolConfig.cornersTeacher;
  const [authUser, user, person, membership, operations, targetAuth, targetPerson, targetMembership, schoolDocument] = await Promise.all([
    admin.auth().getUser(requestedEvaluator.uid),
    readRequiredDoc(db, `users/${requestedEvaluator.uid}`, "Evaluator user"),
    readRequiredDoc(db, `${orgRoot}/people/${requestedEvaluator.personId}`, "Evaluator person"),
    readRequiredDoc(db, `users/${requestedEvaluator.uid}/orgMemberships/${CONFIG.orgId}`, "Evaluator membership"),
    db.collection(`${orgRoot}/operationalAssignments`).where("actorPersonId", "==", requestedEvaluator.personId).get(),
    admin.auth().getUser(requestedTarget.uid),
    readRequiredDoc(db, `${orgRoot}/people/${requestedTarget.personId}`, "Target person"),
    readRequiredDoc(db, `users/${requestedTarget.uid}/orgMemberships/${CONFIG.orgId}`, "Target membership"),
    readRequiredDoc(db, `${orgRoot}/schools/${schoolConfig.id}`, "School"),
  ]);
  const evaluatorMembership = membership.data();
  const targetMembershipData = targetMembership.data();
  assert(normalizeEmail(authUser.email) === requestedEvaluator.email, `${schoolConfig.id} evaluator auth email mismatch.`);
  assert(normalizeEmail(user.data().email || person.data().email) === requestedEvaluator.email, `${schoolConfig.id} evaluator user email mismatch.`);
  assert(asString(evaluatorMembership.personId) === requestedEvaluator.personId, `${schoolConfig.id} evaluator personId mismatch.`);
  assert(asString(evaluatorMembership.roleKey || evaluatorMembership.role).toUpperCase() === requestedEvaluator.roleKey, `${schoolConfig.id} evaluator role mismatch.`);
  assert(isActive(evaluatorMembership) && membershipCoversSchool(evaluatorMembership, schoolConfig.id), `${schoolConfig.id} evaluator scope mismatch.`);
  assert(evaluatorMembership.permissions?.manageEvaluations === true, `${schoolConfig.id} evaluator is missing manageEvaluations.`);
  assert(asString(person.data().displayName) === requestedEvaluator.displayName, `${schoolConfig.id} evaluator displayName mismatch.`);
  assert(asString(schoolDocument.data().name || schoolDocument.data().title) === schoolConfig.label, `${schoolConfig.id} label mismatch.`);
  assert(operations.docs.some((document) => {
    const data = document.data();
    return isActive(data) && asString(data.operationKind) === "STAFF_EVALUATION" &&
      asString(data.schoolId || data.scopeId) === schoolConfig.id;
  }), `${schoolConfig.id} evaluator is missing STAFF_EVALUATION.`);
  assert(normalizeEmail(targetAuth.email) === requestedTarget.email, `${schoolConfig.id} target auth email mismatch.`);
  assert(asString(targetPerson.data().displayName) === requestedTarget.displayName, `${schoolConfig.id} target displayName mismatch.`);
  assert(normalizeEmail(targetPerson.data().email) === requestedTarget.email, `${schoolConfig.id} target person email mismatch.`);
  assert(asString(targetMembershipData.personId) === requestedTarget.personId, `${schoolConfig.id} target personId mismatch.`);
  assert(asString(targetMembershipData.roleKey || targetMembershipData.role).toUpperCase() === requestedTarget.roleKey, `${schoolConfig.id} target role mismatch.`);
  assert(isActive(targetMembershipData) && membershipCoversSchool(targetMembershipData, schoolConfig.id), `${schoolConfig.id} target scope mismatch.`);
}

async function loadPreflight(db) {
  const orgRoot = `orgs/${CONFIG.orgId}`;
  for (const schoolConfig of CONFIG.schools) await validateActor(db, orgRoot, schoolConfig);
  return { orgRoot };
}

function buildDocuments(orgRoot) {
  const documents = [];
  for (const framework of FRAMEWORKS) {
    const sectionId = `${framework.id}-main`;
    documents.push({ type: "framework", path: `${orgRoot}/evaluationFrameworks/${framework.id}`, data: {
      id: framework.id, orgId: CONFIG.orgId, title: framework.title, description: `قالب رسمي لـ${framework.title}.`,
      targetKind: "TEACHER", targetRoleLabel: "معلمة الأركان", targetRoleKeyHint: "KG_TEACHER",
      evaluatorKind: "SCHOOL_VICE_PRINCIPAL", evaluatorLabel: "وكيلة الروضة",
      defaultEvaluatorRoleKeys: ["KG_VP"], frameworkKind: framework.frameworkKind,
      schoolTypes: ["KG"], maxCyclesPerTerm: framework.cycles.length, defaultItemMaxScore: 5,
      isActive: true, isLocked: true, version: 1,
    }});
    documents.push({ type: "section", path: `${orgRoot}/evaluationRubricSections/${sectionId}`, data: {
      id: sectionId, orgId: CONFIG.orgId, frameworkId: framework.id, title: "معلمة الأركان",
      description: `بنود ${framework.title}.`, order: 1, weight: 100, isActive: true,
    }});
    framework.items.forEach((title, index) => {
      const itemId = `${sectionId}-${String(index + 1).padStart(2, "0")}`;
      documents.push({ type: "item", path: `${orgRoot}/evaluationRubricItems/${itemId}`, data: {
        id: itemId, orgId: CONFIG.orgId, frameworkId: framework.id, sectionId, title, description: "",
        order: index + 1, maxScore: 5, scoreInputType: "SCORE", isRequired: true, isActive: true,
      }});
    });

    for (const schoolConfig of CONFIG.schools) {
      const target = schoolConfig.cornersTeacher;
      const planId = `${schoolConfig.id}-${CONFIG.academicYearId}-${CONFIG.termId}-vice-principal-corners-teacher-${framework.key}-evaluation`;
      documents.push({ type: "plan", planId, path: `${orgRoot}/evaluationPlans/${planId}`, data: {
        id: planId, orgId: CONFIG.orgId, schoolId: schoolConfig.id, academicYearId: CONFIG.academicYearId,
        termId: CONFIG.termId, title: `${framework.title} - ${schoolConfig.label} - الفصل الأول`,
        description: `خطة تطبيق ${framework.title} داخل الفصل الدراسي الأول.`, frameworkId: framework.id,
        planKind: framework.planKind, targetKind: "TEACHER", targetRoleKey: "KG_TEACHER",
        targetRoleLabel: "معلمة الأركان", status: "ACTIVE",
      }});
      const policyId = `${planId}-policy-${schoolConfig.evaluator.personId}`;
      documents.push({ type: "policy", planId, path: `${orgRoot}/evaluatorPolicies/${policyId}`, data: {
        id: policyId, orgId: CONFIG.orgId, schoolId: schoolConfig.id, academicYearId: CONFIG.academicYearId,
        termId: CONFIG.termId, planId, evaluatorRoleKey: schoolConfig.evaluator.roleKey,
        evaluatorLabel: schoolConfig.evaluator.roleLabel, evaluatorPersonId: schoolConfig.evaluator.personId,
        weight: 100, required: true, canSubmit: true, canReview: false, canApprove: true, order: 1,
      }});
      for (const cycle of framework.cycles) {
        const cycleId = `${planId}-${cycle.suffix}`;
        documents.push({ type: "cycle", planId, path: `${orgRoot}/evaluationCycles/${cycleId}`, data: {
          id: cycleId, orgId: CONFIG.orgId, schoolId: schoolConfig.id, academicYearId: CONFIG.academicYearId,
          termId: CONFIG.termId, planId, cycleNumber: cycle.number, title: cycle.title,
          cycleKind: cycle.kind, status: "OPEN", isIncludedInAverage: true,
        }});
      }
      const targetAssignmentId = `${planId}-target-${target.personId}`;
      documents.push({ type: "targetAssignment", planId, path: `${orgRoot}/evaluationTargetAssignments/${targetAssignmentId}`, data: {
        id: targetAssignmentId, orgId: CONFIG.orgId, schoolId: schoolConfig.id,
        academicYearId: CONFIG.academicYearId, termId: CONFIG.termId, planId,
        targetPersonId: target.personId, targetEmail: target.email, targetDisplayName: target.displayName,
        targetRoleKey: target.roleKey, targetRoleLabel: target.roleLabel, targetKind: "TEACHER", status: "ACTIVE",
      }});
      for (const cycle of framework.cycles) {
        const cycleId = `${planId}-${cycle.suffix}`;
        const assignmentId = `${cycleId}-${target.personId}-${schoolConfig.evaluator.personId}`;
        documents.push({ type: "evaluatorAssignment", planId, path: `${orgRoot}/evaluationEvaluatorAssignments/${assignmentId}`, data: {
          id: assignmentId, orgId: CONFIG.orgId, schoolId: schoolConfig.id,
          academicYearId: CONFIG.academicYearId, termId: CONFIG.termId, planId, cycleId,
          targetPersonId: target.personId, targetRoleKey: target.roleKey, targetRoleLabel: target.roleLabel,
          evaluatorPersonId: schoolConfig.evaluator.personId, evaluatorEmail: schoolConfig.evaluator.email,
          evaluatorRoleKey: schoolConfig.evaluator.roleKey, weight: 100, sourceType: "MANUAL", status: "ACTIVE",
        }});
      }
    }
  }
  return documents;
}

function assertStructure(documents) {
  for (const framework of FRAMEWORKS) {
    const sections = documents.filter((document) => document.type === "section" && document.data.frameworkId === framework.id);
    const items = documents.filter((document) => document.type === "item" && document.data.frameworkId === framework.id);
    assert(sections.length === 1 && sections[0].data.weight === 100, `${framework.id} section validation failed.`);
    assert(items.length === framework.items.length && new Set(framework.items).size === framework.items.length, `${framework.id} item validation failed.`);
    assert(items.every((item, index) => item.data.order === index + 1 && item.data.maxScore === 5), `${framework.id} item order/maxScore failed.`);
    for (const schoolConfig of CONFIG.schools) {
      const planId = `${schoolConfig.id}-${CONFIG.academicYearId}-${CONFIG.termId}-vice-principal-corners-teacher-${framework.key}-evaluation`;
      const planDocuments = documents.filter((document) => document.planId === planId);
      assert(planDocuments.filter((document) => document.type === "cycle").length === framework.cycles.length, `${planId} cycle count mismatch.`);
      assert(planDocuments.filter((document) => document.type === "targetAssignment").length === 1, `${planId} target count mismatch.`);
      assert(planDocuments.filter((document) => document.type === "evaluatorAssignment").length === framework.cycles.length, `${planId} evaluator count mismatch.`);
    }
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
  return documents.reduce((counts, document) => {
    counts[document.type] = (counts[document.type] || 0) + 1;
    return counts;
  }, {});
}

async function applyMissingDocuments(db, documents) {
  const now = Date.now();
  for (const group of chunk(documents, 400)) {
    const batch = db.batch();
    for (const document of group) {
      batch.create(db.doc(document.path), {
        ...document.data, createdAt: now, updatedAt: now,
        ...(document.type === "framework" ? { lockedAt: now } : {}),
        ...(document.type === "targetAssignment" ? { assignedAt: now } : {}),
      });
    }
    await batch.commit();
  }
}

async function verifyPlanCounts(db, orgRoot) {
  for (const framework of FRAMEWORKS) {
    for (const schoolConfig of CONFIG.schools) {
      const planId = `${schoolConfig.id}-${CONFIG.academicYearId}-${CONFIG.termId}-vice-principal-corners-teacher-${framework.key}-evaluation`;
      const [cycles, targets, assignments] = await Promise.all([
        db.collection(`${orgRoot}/evaluationCycles`).where("planId", "==", planId).get(),
        db.collection(`${orgRoot}/evaluationTargetAssignments`).where("planId", "==", planId).get(),
        db.collection(`${orgRoot}/evaluationEvaluatorAssignments`).where("planId", "==", planId).get(),
      ]);
      assert(cycles.docs.filter((document) => isActive(document.data())).length === framework.cycles.length, `${planId} active cycle verification failed.`);
      assert(targets.docs.filter((document) => isActive(document.data())).length === 1, `${planId} active target verification failed.`);
      assert(assignments.docs.filter((document) => isActive(document.data())).length === framework.cycles.length, `${planId} active evaluator verification failed.`);
    }
  }
}

function buildReport(documents, inspection) {
  return {
    schools: CONFIG.schools.map((schoolConfig) => ({
      id: schoolConfig.id,
      evaluator: schoolConfig.evaluator.displayName,
      cornersTeacher: schoolConfig.cornersTeacher.displayName,
    })),
    frameworks: FRAMEWORKS.map((framework) => ({ id: framework.id, cycles: framework.cycles.length, items: framework.items.length })),
    desired: countByType(documents), existing: countByType(inspection.existing),
    missing: countByType(inspection.missing), total: documents.length,
  };
}

async function main() {
  initAdmin();
  const db = admin.firestore();
  const { orgRoot } = await loadPreflight(db);
  const documents = buildDocuments(orgRoot);
  assertStructure(documents);
  const inspection = await inspectDocuments(db, documents);
  console.log(APPLY ? "Apply mode" : "Preview mode (read-only)");
  console.dir(buildReport(documents, inspection), { depth: 10 });
  if (!APPLY) {
    console.log("No writes performed. Re-run with --apply to create missing documents.");
    return;
  }
  if (inspection.missing.length > 0) await applyMissingDocuments(db, inspection.missing);
  const verification = await inspectDocuments(db, documents);
  assert(verification.missing.length === 0, "Documents are still missing after apply.");
  await verifyPlanCounts(db, orgRoot);
  console.log("Kindergarten vice-principal corners-teacher evaluations applied and verified.");
  console.dir({ verified: countByType(documents), total: documents.length });
}

main().catch((error) => {
  console.error("Kindergarten vice-principal corners-teacher evaluation seed failed:");
  console.error(error);
  process.exitCode = 1;
});
