/* eslint-disable no-console */

const admin = require("firebase-admin");
const path = require("path");

const APPLY = process.argv.includes("--apply");

const CONFIG = {
  orgId: "takween",
  academicYearId: "ay-1448",
  termId: "term-1",
  evaluator: {
    uid: "CUUwlUsynlMLHqXS0EMQb4XpHCY2",
    personId: "p-t-altwala",
    displayName: "طيبة سليمان الطوالة",
    email: "t.altwala@qz.org.sa",
    roleKey: "VALUES_COORD",
    roleLabel: "منسقة القيم",
  },
  schools: [
    school("kg-01", "روضة واحة الرياحين الأولى", teacher("Cjt5ZpOPXOQxG2sQh6tTUj9Edu63", "p-ma-alfarhod", "منى احمد محمد الفرهود", "ma.alfarhod@qz.org.sa")),
    school("kg-02", "روضة واحة الرياحين الثانية", teacher("RWyxo00bfrX2jPcCRGUfxASoT4o2", "p-r-albatel", "رهام سويد محمد الباتل", "r.albatel@qz.org.sa")),
    school("kg-03", "روضة واحة الرياحين الثالثة", teacher("MJVVV75dEeU3LrFk0C6XRB8Fc6r1", "p-ss-alfaleh", "سارة سعود محمد الفالح", "ss.alfaleh@qz.org.sa")),
    school("kg-04", "روضة واحة الرياحين الرابعة", teacher("uy60CMhBPLUDXWRJ8NlmemfwfDe2", "p-s-bader", "ساره عبدالله علي البدر", "s.bader@qz.org.sa")),
  ],
};

function teacher(uid, personId, displayName, email) {
  return { uid, personId, displayName, email, roleKey: "KG_TEACHER", roleLabel: "معلمة القيم" };
}

function school(id, label, valuesTeacher) {
  return { id, label, valuesTeacher };
}

const ORDINALS = [
  "الأول", "الثاني", "الثالث", "الرابع", "الخامس", "السادس", "السابع", "الثامن", "التاسع",
  "العاشر", "الحادي عشر", "الثاني عشر", "الثالث عشر", "الرابع عشر", "الخامس عشر",
  "السادس عشر", "السابع عشر", "الثامن عشر", "التاسع عشر",
];

const FRAMEWORKS = [
  {
    key: "periodic",
    id: "kg-values-coordinator-values-teacher-periodic-evaluation-v1",
    title: "تقييم منسقة القيم لمعلمات القيم",
    planKind: "PERIODIC",
    frameworkKind: "PERIODIC_STAFF_EVALUATION",
    cycles: ORDINALS.slice(0, 3).map((ordinal, index) => ({
      number: index + 1,
      title: `التقييم ${ordinal}`,
      suffix: `evaluation-${String(index + 1).padStart(2, "0")}`,
      kind: "PERIOD",
    })),
    items: [
      "حسن المظهر ووضوح الصوت مع الاتزان والثقة بالنفس",
      "تقديم مدخل مناسب للدرس الجديد",
      "المهارة في متابعة حضور الأطفال وانضباطهم",
      "المهارة في إدارة الصف",
      "عرض الدرس بطريقة متسلسلة ومترابطة ومشوقة",
      "ربط المفاهيم بخبرات الطفل وبيئته",
      "إثارة تفكير الأطفال من خلال الأسئلة",
      "استخدام استراتيجيات فاعلة وتوظيف تقنيات التعليم",
      "إثارة انتباه الطلاب مع التشجيع والتحفيز",
      "تهيئة بيئة الصف قبل بدء الدرس (التنظيم)",
      "إدارة الوقت بفعالية أثناء الشرح",
      "معالجة السلوك بأسلوب تربوي ومناسب",
      "مناسبة الوسيلة للدرس والطلاب",
      "إتاحة فرصة المشاركة للأطفال",
      "الاهتمام بالتطور المهني والنمو المعرفي",
      "عرض أنشطة وأدوات داعمة للمادة العلمية",
      "التأكد من تحقيق مخرجات الوحدة",
      "تفعيل التقرير الختامي لكل وحدة",
      "التمكن من المادة العلمية والقدرة على تحقيق أهدافها",
      "تفعيل مجتمعات التعلم المهنية",
      "تفعيل الزيارات المتبادلة",
      "المساهمة في تدريب الزملاء تقنيًا",
    ],
  },
  {
    key: "weekly",
    id: "kg-values-coordinator-values-teacher-weekly-evaluation-v1",
    title: "التقييم الأسبوعي لمعلمات القيم بواسطة منسقة القيم",
    planKind: "WEEKLY",
    frameworkKind: "WEEKLY_TEACHER_EVALUATION",
    cycles: ORDINALS.map((ordinal, index) => ({
      number: index + 1,
      title: `الأسبوع ${ordinal}`,
      suffix: `week-${String(index + 1).padStart(2, "0")}`,
      kind: "WEEK",
    })),
    items: [
      "سجل الواجبات",
      "متابعة تنفيذ الملخص الأسبوعي",
      "تفعيل الواجبات",
      "تفعيل نشاط لكل درس",
      "تفعيل استمارة تقييم الأطفال",
      "اكتمال التحضير وتوافقه مع توزيع المنهج",
      "الالتزام بالإشراف على الأطفال والمناوبات",
      "تفعيل الأنشطة المدرسية والتعاون مع أولياء الأمور",
      "التواصل مع أولياء الأمور",
      "النشر الإعلامي للفعاليات وأخبار المدارس",
      "تنفيذ المبادرات والأنشطة اللاصفية",
      "السلوك العام والقدوة الحسنة",
      "الالتزام بالزي الرسمي",
      "القيام بما يسند إليها من مهام",
      "تقبل التوجيه",
      "حسن التصرف مع الرؤساء والزملاء وأولياء الأمور",
    ],
  },
];

function initAdmin() {
  if (admin.apps.length) return;
  const serviceAccount = require(path.resolve(process.cwd(), "service-account.json"));
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

async function loadPreflight(db) {
  const orgRoot = `orgs/${CONFIG.orgId}`;
  const evaluator = CONFIG.evaluator;
  const [authUser, user, person, membership, operations] = await Promise.all([
    admin.auth().getUser(evaluator.uid),
    readRequiredDoc(db, `users/${evaluator.uid}`, "Evaluator user"),
    readRequiredDoc(db, `${orgRoot}/people/${evaluator.personId}`, "Evaluator person"),
    readRequiredDoc(db, `users/${evaluator.uid}/orgMemberships/${CONFIG.orgId}`, "Evaluator membership"),
    db.collection(`${orgRoot}/operationalAssignments`).where("actorPersonId", "==", evaluator.personId).get(),
  ]);
  const evaluatorMembership = membership.data();
  assert(normalizeEmail(authUser.email) === evaluator.email, "Evaluator auth email mismatch.");
  assert(normalizeEmail(user.data().email || person.data().email) === evaluator.email, "Evaluator user email mismatch.");
  assert(asString(evaluatorMembership.personId) === evaluator.personId, "Evaluator personId mismatch.");
  assert(asString(evaluatorMembership.roleKey || evaluatorMembership.role).toUpperCase() === evaluator.roleKey, "Evaluator role mismatch.");
  assert(isActive(evaluatorMembership) && evaluatorMembership.permissions?.manageEvaluations === true, "Evaluator membership/permission mismatch.");
  assert(asString(person.data().displayName) === evaluator.displayName, "Evaluator displayName mismatch.");

  for (const schoolConfig of CONFIG.schools) {
    const target = schoolConfig.valuesTeacher;
    const [schoolDocument, targetAuth, targetPerson, targetMembership] = await Promise.all([
      readRequiredDoc(db, `${orgRoot}/schools/${schoolConfig.id}`, "School"),
      admin.auth().getUser(target.uid),
      readRequiredDoc(db, `${orgRoot}/people/${target.personId}`, "Target person"),
      readRequiredDoc(db, `users/${target.uid}/orgMemberships/${CONFIG.orgId}`, "Target membership"),
    ]);
    const targetMembershipData = targetMembership.data();
    assert(asString(schoolDocument.data().name || schoolDocument.data().title) === schoolConfig.label, `${schoolConfig.id} label mismatch.`);
    assert(membershipCoversSchool(evaluatorMembership, schoolConfig.id), `Evaluator is missing ${schoolConfig.id} scope.`);
    assert(operations.docs.some((document) => {
      const data = document.data();
      return isActive(data) && asString(data.operationKind) === "STAFF_EVALUATION" &&
        asString(data.schoolId || data.scopeId) === schoolConfig.id;
    }), `Evaluator is missing STAFF_EVALUATION for ${schoolConfig.id}.`);
    assert(normalizeEmail(targetAuth.email) === target.email, `${schoolConfig.id} target auth email mismatch.`);
    assert(asString(targetPerson.data().displayName) === target.displayName, `${schoolConfig.id} target displayName mismatch.`);
    assert(normalizeEmail(targetPerson.data().email) === target.email, `${schoolConfig.id} target email mismatch.`);
    assert(asString(targetMembershipData.personId) === target.personId, `${schoolConfig.id} target personId mismatch.`);
    assert(asString(targetMembershipData.roleKey || targetMembershipData.role).toUpperCase() === target.roleKey, `${schoolConfig.id} target role mismatch.`);
    assert(isActive(targetMembershipData) && membershipCoversSchool(targetMembershipData, schoolConfig.id), `${schoolConfig.id} target scope mismatch.`);
  }

  return { orgRoot };
}

function buildDocuments(orgRoot) {
  const documents = [];
  for (const framework of FRAMEWORKS) {
    const sectionId = `${framework.id}-main`;
    documents.push({ type: "framework", path: `${orgRoot}/evaluationFrameworks/${framework.id}`, data: {
      id: framework.id, orgId: CONFIG.orgId, title: framework.title, description: `قالب رسمي لـ${framework.title}.`,
      targetKind: "TEACHER", targetRoleLabel: "معلمة القيم", targetRoleKeyHint: "KG_TEACHER",
      evaluatorKind: "VALUES_COORDINATOR", evaluatorLabel: CONFIG.evaluator.roleLabel,
      defaultEvaluatorRoleKeys: [CONFIG.evaluator.roleKey], frameworkKind: framework.frameworkKind,
      schoolTypes: ["KG"], maxCyclesPerTerm: framework.cycles.length, defaultItemMaxScore: 5,
      isActive: true, isLocked: true, version: 1,
    }});
    documents.push({ type: "section", path: `${orgRoot}/evaluationRubricSections/${sectionId}`, data: {
      id: sectionId, orgId: CONFIG.orgId, frameworkId: framework.id, title: "معلمة القيم",
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
      const target = schoolConfig.valuesTeacher;
      const planId = `${schoolConfig.id}-${CONFIG.academicYearId}-${CONFIG.termId}-values-coordinator-values-teacher-${framework.key}-evaluation`;
      documents.push({ type: "plan", planId, path: `${orgRoot}/evaluationPlans/${planId}`, data: {
        id: planId, orgId: CONFIG.orgId, schoolId: schoolConfig.id, academicYearId: CONFIG.academicYearId,
        termId: CONFIG.termId, title: `${framework.title} - ${schoolConfig.label} - الفصل الأول`,
        description: `خطة تطبيق ${framework.title} داخل الفصل الدراسي الأول.`, frameworkId: framework.id,
        planKind: framework.planKind, targetKind: "TEACHER", targetRoleKey: "KG_TEACHER",
        targetRoleLabel: "معلمة القيم", status: "ACTIVE",
      }});
      const policyId = `${planId}-policy-${CONFIG.evaluator.personId}`;
      documents.push({ type: "policy", planId, path: `${orgRoot}/evaluatorPolicies/${policyId}`, data: {
        id: policyId, orgId: CONFIG.orgId, schoolId: schoolConfig.id, academicYearId: CONFIG.academicYearId,
        termId: CONFIG.termId, planId, evaluatorRoleKey: CONFIG.evaluator.roleKey,
        evaluatorLabel: CONFIG.evaluator.roleLabel, evaluatorPersonId: CONFIG.evaluator.personId,
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
        const assignmentId = `${cycleId}-${target.personId}-${CONFIG.evaluator.personId}`;
        documents.push({ type: "evaluatorAssignment", planId, path: `${orgRoot}/evaluationEvaluatorAssignments/${assignmentId}`, data: {
          id: assignmentId, orgId: CONFIG.orgId, schoolId: schoolConfig.id,
          academicYearId: CONFIG.academicYearId, termId: CONFIG.termId, planId, cycleId,
          targetPersonId: target.personId, targetRoleKey: target.roleKey, targetRoleLabel: target.roleLabel,
          evaluatorPersonId: CONFIG.evaluator.personId, evaluatorEmail: CONFIG.evaluator.email,
          evaluatorRoleKey: CONFIG.evaluator.roleKey, weight: 100, sourceType: "MANUAL", status: "ACTIVE",
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
      const planId = `${schoolConfig.id}-${CONFIG.academicYearId}-${CONFIG.termId}-values-coordinator-values-teacher-${framework.key}-evaluation`;
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
      const planId = `${schoolConfig.id}-${CONFIG.academicYearId}-${CONFIG.termId}-values-coordinator-values-teacher-${framework.key}-evaluation`;
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
    evaluator: CONFIG.evaluator,
    schools: CONFIG.schools.map((schoolConfig) => ({
      id: schoolConfig.id,
      valuesTeacher: schoolConfig.valuesTeacher.displayName,
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
  console.log("Kindergarten values coordinator teacher evaluations applied and verified.");
  console.dir({ verified: countByType(documents), total: documents.length });
}

main().catch((error) => {
  console.error("Kindergarten values coordinator teacher evaluation seed failed:");
  console.error(error);
  process.exitCode = 1;
});
