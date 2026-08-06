/* eslint-disable no-console */

const admin = require("firebase-admin");
const path = require("path");

const APPLY = process.argv.includes("--apply");

const CONFIG = {
  orgId: "takween",
  academicYearId: "ay-1448",
  termId: "term-1",
  schools: [
    school("kg-01", "روضة واحة الرياحين الأولى", evaluator("ms10LdA0k5TVkiJo4VO6pprmcOh2", "staff-ms10LdA0k5TVkiJo4VO6pprmcOh2", "تماضر صالح محمد العامر", "t.alamer@qz.org.sa"), "p-ma-alfarhod", "p-h-alarajh", 13),
    school("kg-02", "روضة واحة الرياحين الثانية", evaluator("yC5MUiMlxCXt9RnrjPmT85Ko34t1", "p-h-aljower", "هاجر أحمد فهد الجوير", "h.aljower@qz.org.sa"), "p-r-albatel", "p-h-almadallah", 13),
    school("kg-03", "روضة واحة الرياحين الثالثة", evaluator("tfvc13fv0DOLqAjQ8s8cpojRMVG2", "p-s-alslman", "ساره سعد أحمد السلمان", "s.alslman@qz.org.sa"), "p-ss-alfaleh", "p-r-alfayez", 11),
    school("kg-04", "روضة واحة الرياحين الرابعة", evaluator("2DtRW3PPQLSjuZR1Pyp1WucwzKy1", "p-h-alshaya", "حصه عبدالرزاق احمد الشايع", "h.alshaya@qz.org.sa"), "p-s-bader", "p-s-bader", 7),
  ],
};

function evaluator(uid, personId, displayName, email) {
  return { uid, personId, displayName, email, roleKey: "KG_VP", roleLabel: "وكيلة الروضة" };
}

function school(id, label, requestedEvaluator, valuesPersonId, cornersPersonId, expectedTeacherCount) {
  return { id, label, evaluator: requestedEvaluator, valuesPersonId, cornersPersonId, expectedTeacherCount };
}

const ORDINALS = [
  "الأول", "الثاني", "الثالث", "الرابع", "الخامس", "السادس", "السابع", "الثامن", "التاسع",
  "العاشر", "الحادي عشر", "الثاني عشر", "الثالث عشر", "الرابع عشر", "الخامس عشر",
  "السادس عشر", "السابع عشر", "الثامن عشر", "التاسع عشر",
];

const WEEKLY = ORDINALS.map((ordinal, index) => ({
  number: index + 1,
  title: `الأسبوع ${ordinal}`,
  suffix: `week-${String(index + 1).padStart(2, "0")}`,
  kind: "WEEK",
}));

const DIAGNOSTIC = [
  { number: 1, title: "الزيارة التشخيصية الأولى", suffix: "visit-01", kind: "VISIT" },
  { number: 2, title: "الزيارة التشخيصية الثانية", suffix: "visit-02", kind: "VISIT" },
];

const FRAMEWORKS = [
  {
    key: "weekly",
    id: "kg-vice-principal-class-teacher-weekly-evaluation-v1",
    title: "تقييم وكيلة الروضة لمعلمة الصف - المتابعة الأسبوعية",
    planKind: "WEEKLY",
    frameworkKind: "WEEKLY_TEACHER_EVALUATION",
    cycles: WEEKLY,
    items: [
      "متابعة سجل الواجبات",
      "متابعة الكتاب المدرسي",
      "متابعة الحروف",
      "متابعة القرآن",
      "متابعة تنفيذ أوراق العمل",
      "متابعة تنفيذ الفاقد التعليمي",
      "اكتمال التحضير وتوافقه مع المنهج",
      "الالتزام بالإشراف على الأطفال",
      "تفعيل الأنشطة المدرسية والتعاون مع أولياء الأمور",
      "الالتزام بمواعيد الحضور والانصراف",
      "السلوك العام والقدوة الحسنة",
      "المبادرة في تقبل وتنفيذ التوجيهات",
      "حسن التصرف مع الرؤساء والزملاء وأولياء الأمور",
      "التزام المعلمة بدخول الحصص",
    ],
  },
  {
    key: "diagnostic",
    id: "kg-vice-principal-class-teacher-diagnostic-evaluation-v1",
    title: "الزيارة التشخيصية لمعلمة الصف بواسطة وكيلة الروضة",
    planKind: "VISIT_BASED",
    frameworkKind: "CLASSROOM_VISIT",
    cycles: DIAGNOSTIC,
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

async function loadActiveMemberships(db) {
  const users = await db.collection("users").get();
  const memberships = [];
  for (let index = 0; index < users.docs.length; index += 400) {
    const snapshots = await db.getAll(
      ...users.docs.slice(index, index + 400).map((user) => db.doc(`users/${user.id}/orgMemberships/${CONFIG.orgId}`)),
    );
    memberships.push(...snapshots.filter((document) => document.exists && isActive(document.data())));
  }
  return memberships;
}

async function loadPreflight(db) {
  const orgRoot = `orgs/${CONFIG.orgId}`;
  const memberships = await loadActiveMemberships(db);
  const runtimeSchools = [];

  for (const schoolConfig of CONFIG.schools) {
    const requestedEvaluator = schoolConfig.evaluator;
    const [authUser, user, person, membership, operations, schoolDocument] = await Promise.all([
      admin.auth().getUser(requestedEvaluator.uid),
      readRequiredDoc(db, `users/${requestedEvaluator.uid}`, "Evaluator user"),
      readRequiredDoc(db, `${orgRoot}/people/${requestedEvaluator.personId}`, "Evaluator person"),
      readRequiredDoc(db, `users/${requestedEvaluator.uid}/orgMemberships/${CONFIG.orgId}`, "Evaluator membership"),
      db.collection(`${orgRoot}/operationalAssignments`).where("actorPersonId", "==", requestedEvaluator.personId).get(),
      readRequiredDoc(db, `${orgRoot}/schools/${schoolConfig.id}`, "School"),
    ]);
    const evaluatorMembership = membership.data();
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

    const teacherMemberships = memberships.filter((teacherMembership) => {
      const data = teacherMembership.data();
      return asString(data.roleKey || data.role).toUpperCase() === "KG_TEACHER" && membershipCoversSchool(data, schoolConfig.id);
    });
    assert(teacherMemberships.length === schoolConfig.expectedTeacherCount, `${schoolConfig.id} teacher count mismatch.`);
    const people = await db.getAll(...teacherMemberships.map((teacherMembership) =>
      db.doc(`${orgRoot}/people/${asString(teacherMembership.data().personId)}`),
    ));
    const peopleById = new Map(people.filter((teacherPerson) => teacherPerson.exists).map((teacherPerson) => [teacherPerson.id, teacherPerson.data()]));
    const teachers = teacherMemberships.map((teacherMembership) => {
      const personId = asString(teacherMembership.data().personId);
      const teacherPerson = peopleById.get(personId);
      assert(teacherPerson, `${schoolConfig.id} teacher person missing: ${personId}`);
      return {
        personId,
        displayName: asString(teacherPerson.displayName || teacherMembership.data().displayName),
        email: normalizeEmail(teacherPerson.email || teacherMembership.data().email),
      };
    }).sort((left, right) => left.displayName.localeCompare(right.displayName, "ar"));
    assert(teachers.some((teacher) => teacher.personId === schoolConfig.valuesPersonId), `${schoolConfig.id} values teacher missing.`);
    assert(teachers.some((teacher) => teacher.personId === schoolConfig.cornersPersonId), `${schoolConfig.id} corners teacher missing.`);
    const excludedPersonIds = new Set([schoolConfig.valuesPersonId, schoolConfig.cornersPersonId]);
    const classTeachers = teachers.filter((teacher) => !excludedPersonIds.has(teacher.personId));
    assert(classTeachers.length === schoolConfig.expectedTeacherCount - excludedPersonIds.size, `${schoolConfig.id} class teacher count mismatch.`);
    runtimeSchools.push({ ...schoolConfig, classTeachers });
  }

  return { orgRoot, schools: runtimeSchools };
}

function buildFrameworkDocuments(orgRoot) {
  const documents = [];
  for (const framework of FRAMEWORKS) {
    const sectionId = `${framework.id}-main`;
    documents.push({ type: "framework", path: `${orgRoot}/evaluationFrameworks/${framework.id}`, data: {
      id: framework.id, orgId: CONFIG.orgId, title: framework.title, description: `قالب رسمي لـ${framework.title}.`,
      targetKind: "TEACHER", targetRoleLabel: "معلمة الصف", targetRoleKeyHint: "KG_TEACHER",
      evaluatorKind: "SCHOOL_VICE_PRINCIPAL", evaluatorLabel: "وكيلة الروضة",
      defaultEvaluatorRoleKeys: ["KG_VP"], frameworkKind: framework.frameworkKind,
      schoolTypes: ["KG"], maxCyclesPerTerm: framework.cycles.length, defaultItemMaxScore: 5,
      isActive: true, isLocked: true, version: 1,
    }});
    documents.push({ type: "section", path: `${orgRoot}/evaluationRubricSections/${sectionId}`, data: {
      id: sectionId, orgId: CONFIG.orgId, frameworkId: framework.id, title: "معلمة الصف",
      description: `بنود ${framework.title}.`, order: 1, weight: 100, isActive: true,
    }});
    framework.items.forEach((title, index) => {
      const itemId = `${sectionId}-${String(index + 1).padStart(2, "0")}`;
      documents.push({ type: "item", path: `${orgRoot}/evaluationRubricItems/${itemId}`, data: {
        id: itemId, orgId: CONFIG.orgId, frameworkId: framework.id, sectionId, title, description: "",
        order: index + 1, maxScore: 5, scoreInputType: "SCORE", isRequired: true, isActive: true,
      }});
    });
  }
  return documents;
}

function buildPlanDocuments(orgRoot, schools) {
  const documents = [];
  for (const schoolConfig of schools) {
    for (const framework of FRAMEWORKS) {
      const planId = `${schoolConfig.id}-${CONFIG.academicYearId}-${CONFIG.termId}-vice-principal-class-teacher-${framework.key}-evaluation`;
      documents.push({ type: "plan", planId, path: `${orgRoot}/evaluationPlans/${planId}`, data: {
        id: planId, orgId: CONFIG.orgId, schoolId: schoolConfig.id, academicYearId: CONFIG.academicYearId,
        termId: CONFIG.termId, title: `${framework.title} - ${schoolConfig.label} - الفصل الأول`,
        description: `خطة تطبيق ${framework.title} داخل الفصل الدراسي الأول.`, frameworkId: framework.id,
        planKind: framework.planKind, targetKind: "TEACHER", targetRoleKey: "KG_TEACHER",
        targetRoleLabel: "معلمة الصف", status: "ACTIVE",
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
      for (const target of schoolConfig.classTeachers) {
        const targetAssignmentId = `${planId}-target-${target.personId}`;
        documents.push({ type: "targetAssignment", planId, path: `${orgRoot}/evaluationTargetAssignments/${targetAssignmentId}`, data: {
          id: targetAssignmentId, orgId: CONFIG.orgId, schoolId: schoolConfig.id,
          academicYearId: CONFIG.academicYearId, termId: CONFIG.termId, planId,
          targetPersonId: target.personId, targetEmail: target.email, targetDisplayName: target.displayName,
          targetRoleKey: "KG_TEACHER", targetRoleLabel: "معلمة الصف", targetKind: "TEACHER", status: "ACTIVE",
        }});
        for (const cycle of framework.cycles) {
          const cycleId = `${planId}-${cycle.suffix}`;
          const assignmentId = `${cycleId}-${target.personId}-${schoolConfig.evaluator.personId}`;
          documents.push({ type: "evaluatorAssignment", planId, path: `${orgRoot}/evaluationEvaluatorAssignments/${assignmentId}`, data: {
            id: assignmentId, orgId: CONFIG.orgId, schoolId: schoolConfig.id,
            academicYearId: CONFIG.academicYearId, termId: CONFIG.termId, planId, cycleId,
            targetPersonId: target.personId, targetRoleKey: "KG_TEACHER", targetRoleLabel: "معلمة الصف",
            evaluatorPersonId: schoolConfig.evaluator.personId, evaluatorEmail: schoolConfig.evaluator.email,
            evaluatorRoleKey: schoolConfig.evaluator.roleKey, weight: 100, sourceType: "MANUAL", status: "ACTIVE",
          }});
        }
      }
    }
  }
  return documents;
}

function assertStructure(documents, schools) {
  for (const framework of FRAMEWORKS) {
    const sections = documents.filter((document) => document.type === "section" && document.data.frameworkId === framework.id);
    const items = documents.filter((document) => document.type === "item" && document.data.frameworkId === framework.id);
    assert(sections.length === 1 && sections[0].data.weight === 100, `${framework.id} section validation failed.`);
    assert(items.length === framework.items.length && new Set(framework.items).size === framework.items.length, `${framework.id} item validation failed.`);
    assert(items.every((item, index) => item.data.order === index + 1 && item.data.maxScore === 5), `${framework.id} item order/maxScore failed.`);
  }
  for (const schoolConfig of schools) {
    for (const framework of FRAMEWORKS) {
      const planId = `${schoolConfig.id}-${CONFIG.academicYearId}-${CONFIG.termId}-vice-principal-class-teacher-${framework.key}-evaluation`;
      const planDocuments = documents.filter((document) => document.planId === planId);
      assert(planDocuments.filter((document) => document.type === "cycle").length === framework.cycles.length, `${planId} cycle count mismatch.`);
      assert(planDocuments.filter((document) => document.type === "targetAssignment").length === schoolConfig.classTeachers.length, `${planId} target count mismatch.`);
      assert(planDocuments.filter((document) => document.type === "evaluatorAssignment").length === schoolConfig.classTeachers.length * framework.cycles.length, `${planId} evaluator count mismatch.`);
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

async function verifyPlanCounts(db, orgRoot, schools) {
  for (const schoolConfig of schools) {
    for (const framework of FRAMEWORKS) {
      const planId = `${schoolConfig.id}-${CONFIG.academicYearId}-${CONFIG.termId}-vice-principal-class-teacher-${framework.key}-evaluation`;
      const [cycles, targets, assignments] = await Promise.all([
        db.collection(`${orgRoot}/evaluationCycles`).where("planId", "==", planId).get(),
        db.collection(`${orgRoot}/evaluationTargetAssignments`).where("planId", "==", planId).get(),
        db.collection(`${orgRoot}/evaluationEvaluatorAssignments`).where("planId", "==", planId).get(),
      ]);
      assert(cycles.docs.filter((document) => isActive(document.data())).length === framework.cycles.length, `${planId} active cycle verification failed.`);
      assert(targets.docs.filter((document) => isActive(document.data())).length === schoolConfig.classTeachers.length, `${planId} active target verification failed.`);
      assert(assignments.docs.filter((document) => isActive(document.data())).length === schoolConfig.classTeachers.length * framework.cycles.length, `${planId} active evaluator verification failed.`);
    }
  }
}

function buildReport(documents, inspection, schools) {
  return {
    schools: schools.map((schoolConfig) => ({
      id: schoolConfig.id,
      evaluator: schoolConfig.evaluator.displayName,
      classTeacherCount: schoolConfig.classTeachers.length,
    })),
    frameworks: FRAMEWORKS.map((framework) => ({ id: framework.id, cycles: framework.cycles.length, items: framework.items.length })),
    desired: countByType(documents), existing: countByType(inspection.existing),
    missing: countByType(inspection.missing), total: documents.length,
  };
}

async function main() {
  initAdmin();
  const db = admin.firestore();
  const { orgRoot, schools } = await loadPreflight(db);
  const documents = [...buildFrameworkDocuments(orgRoot), ...buildPlanDocuments(orgRoot, schools)];
  assertStructure(documents, schools);
  const inspection = await inspectDocuments(db, documents);
  console.log(APPLY ? "Apply mode" : "Preview mode (read-only)");
  console.dir(buildReport(documents, inspection, schools), { depth: 10 });
  if (!APPLY) {
    console.log("No writes performed. Re-run with --apply to create missing documents.");
    return;
  }
  if (inspection.missing.length > 0) await applyMissingDocuments(db, inspection.missing);
  const verification = await inspectDocuments(db, documents);
  assert(verification.missing.length === 0, "Documents are still missing after apply.");
  await verifyPlanCounts(db, orgRoot, schools);
  console.log("Kindergarten vice-principal class-teacher evaluations applied and verified.");
  console.dir({ verified: countByType(documents), total: documents.length });
}

main().catch((error) => {
  console.error("Kindergarten vice-principal class-teacher evaluation seed failed:");
  console.error(error);
  process.exitCode = 1;
});
