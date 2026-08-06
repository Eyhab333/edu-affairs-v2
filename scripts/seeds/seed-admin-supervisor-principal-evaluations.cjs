/* eslint-disable no-console */

const admin = require("firebase-admin");
const path = require("path");

const APPLY = process.argv.includes("--apply");

const CONFIG = {
  orgId: "takween",
  academicYearId: "ay-1448",
  termId: "term-1",
  evaluator: {
    uid: "4ElchyeiopfV5OsCLG3a0tBfc9g2",
    personId: "p-a-almansur",
    displayName: "اسماء محمد المنصور",
    email: "a-almansur@qz.org.sa",
    roleKey: "ADMIN_SUPERVISOR",
    roleLabel: "المشرفة الإدارية",
  },
  targets: [
    {
      schoolId: "mrb-girls",
      schoolLabel: "مدرسة منار الريادة بنات",
      schoolType: "PRIMARY",
      personId: "p-n-albader",
      displayName: "نادية عثمان ناصر البدر",
      email: "n.albader@qz.org.sa",
      roleKey: "GIRLS_PRINCIPAL",
      roleLabel: "مديرة المدرسة",
    },
    {
      schoolId: "kg-01",
      schoolLabel: "روضة واحة الرياحين الأولى",
      schoolType: "KG",
      personId: "p-a-alhomidi",
      displayName: "أشواق الحميدي الحميدي",
      email: "a.alhomidi@qz.org.sa",
      roleKey: "KG_PRINCIPAL",
      roleLabel: "مديرة الروضة",
    },
    {
      schoolId: "kg-02",
      schoolLabel: "روضة واحة الرياحين الثانية",
      schoolType: "KG",
      personId: "p-s-alturiqe",
      displayName: "سارة عبدالرحمن الطريقي",
      email: "s.alturiqe@qz.org.sa",
      roleKey: "KG_PRINCIPAL",
      roleLabel: "مديرة الروضة",
    },
    {
      schoolId: "kg-03",
      schoolLabel: "روضة واحة الرياحين الثالثة",
      schoolType: "KG",
      personId: "p-s-alnafea",
      displayName: "سمية أحمد راشد النافع",
      email: "s.alnafea@qz.org.sa",
      roleKey: "KG_PRINCIPAL",
      roleLabel: "مديرة الروضة",
    },
    {
      schoolId: "kg-04",
      schoolLabel: "روضة واحة الرياحين الرابعة",
      schoolType: "KG",
      personId: "p-n-alhamiyn",
      displayName: "نورة علي عبدالعزيز الحمين",
      email: "n.alhamiyn@qz.org.sa",
      roleKey: "KG_PRINCIPAL",
      roleLabel: "مديرة الروضة",
    },
  ],
};

const FRAMEWORK = {
  id: "admin-supervisor-principal-evaluation-v1",
  planSlug: "admin-supervisor-principal-evaluation",
  title: "تقييم المشرفة الإدارية لمديرات المدارس والروضات",
  items: [
    "متابعة وتنفيذ التقييم الدوري",
    "الزيارات التشخيصية للطاقم التعليمي وجودة الملاحظات وتقديم الدعم",
    "متابعة تنفيذ التقييم الدوري للطاقم الإداري",
    "إعداد خطة انضباط مدرسي ومتابعة تنفيذها",
    "متابعة الاصطفاف الصباحي",
    "تفعيل سجل الاستئذانات",
    "تنظيم الإشراف اليومي والمناوبات",
    "إعداد الجدول الدراسي",
    "متابعة أعمال الإداريين",
    "الالتزام بالأنظمة واللوائح والتعاميم وتعليمات الإدارة",
    "إدارة الأزمات وحل المشكلات بحكمة",
    "تفعيل الملاحظات التربوية لمديرة المدرسة",
    "تفعيل قنوات التواصل مع أولياء الأمور واستقبال المقترحات وحل المشكلات",
    "تفعيل مجالس أولياء الأمور",
    "التنمية المهنية والنمو الذاتي (التطوير المستمر)",
    "التقارير والإنجاز",
    "تقبل النقد البناء والسعي لتطوير الأداء القيادي باستمرار",
    "إعداد خطة تطوير مهني للمنسوبات ومتابعة تنفيذها",
    "متابعة نظافة وصيانة المبنى المدرسي واكتمال تجهيزاته",
    "اكتمال اللجان والفرق المدرسية وجودة التوثيق",
    "السلوك العام والقدوة الحسنة",
    "النشر الإعلامي للفعاليات وأخبار المدارس",
    "الالتزام بالزي الرسمي",
  ],
};

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

async function validateEvaluator(db, orgRoot) {
  const evaluator = CONFIG.evaluator;
  const [authUser, user, person, membership, operations] = await Promise.all([
    admin.auth().getUser(evaluator.uid),
    readRequiredDoc(db, `users/${evaluator.uid}`, "Admin supervisor user"),
    readRequiredDoc(db, `${orgRoot}/people/${evaluator.personId}`, "Admin supervisor person"),
    readRequiredDoc(db, `users/${evaluator.uid}/orgMemberships/${CONFIG.orgId}`, "Admin supervisor membership"),
    db.collection(`${orgRoot}/operationalAssignments`)
      .where("actorPersonId", "==", evaluator.personId)
      .get(),
  ]);
  const membershipData = membership.data();
  const personData = person.data();

  assert(normalizeEmail(authUser.email) === evaluator.email, "Admin supervisor auth email mismatch.");
  assert(normalizeEmail(user.data().email || personData.email) === evaluator.email, "Admin supervisor user email mismatch.");
  assert(asString(membershipData.personId) === evaluator.personId, "Admin supervisor personId mismatch.");
  assert(asString(membershipData.roleKey || membershipData.role).toUpperCase() === evaluator.roleKey, "Admin supervisor role mismatch.");
  assert(isActive(membershipData), "Admin supervisor membership is inactive.");
  assert(membershipData.permissions?.manageEvaluations === true, "Admin supervisor is missing manageEvaluations.");
  assert(asString(personData.displayName) === evaluator.displayName, "Admin supervisor displayName mismatch.");

  for (const target of CONFIG.targets) {
    assert(membershipCoversSchool(membershipData, target.schoolId), `Admin supervisor is missing ${target.schoolId} scope.`);
    const operation = operations.docs.find((document) => {
      const data = document.data();
      return (
        isActive(data) &&
        asString(data.operationKind) === "STAFF_EVALUATION" &&
        asString(data.schoolId || data.scopeId) === target.schoolId
      );
    });
    assert(operation, `Admin supervisor is missing STAFF_EVALUATION for ${target.schoolId}.`);
  }
}

async function validateTargets(db, orgRoot) {
  for (const target of CONFIG.targets) {
    const [school, person, users] = await Promise.all([
      readRequiredDoc(db, `${orgRoot}/schools/${target.schoolId}`, "School"),
      readRequiredDoc(db, `${orgRoot}/people/${target.personId}`, "Principal person"),
      db.collection("users").where("personId", "==", target.personId).get(),
    ]);
    assert(asString(school.data().name || school.data().title) === target.schoolLabel, `${target.schoolId} label mismatch.`);
    assert(asString(person.data().displayName) === target.displayName, `${target.personId} displayName mismatch.`);
    assert(normalizeEmail(person.data().email) === target.email, `${target.personId} email mismatch.`);
    assert(users.size === 1, `${target.personId} must have exactly one user.`);

    const membership = await readRequiredDoc(
      db,
      `users/${users.docs[0].id}/orgMemberships/${CONFIG.orgId}`,
      "Principal membership",
    );
    const membershipData = membership.data();
    assert(isActive(membershipData), `${target.personId} membership is inactive.`);
    assert(asString(membershipData.roleKey || membershipData.role).toUpperCase() === target.roleKey, `${target.personId} role mismatch.`);
    assert(membershipCoversSchool(membershipData, target.schoolId), `${target.personId} school scope mismatch.`);
  }
}

async function loadPreflight(db) {
  const orgRoot = `orgs/${CONFIG.orgId}`;
  await validateEvaluator(db, orgRoot);
  await validateTargets(db, orgRoot);
  return { orgRoot };
}

function buildDocuments(orgRoot) {
  const documents = [];
  const sectionId = `${FRAMEWORK.id}-main`;

  documents.push({
    type: "framework",
    path: `${orgRoot}/evaluationFrameworks/${FRAMEWORK.id}`,
    data: {
      id: FRAMEWORK.id,
      orgId: CONFIG.orgId,
      title: FRAMEWORK.title,
      description: "قالب رسمي لتقييم المشرفة الإدارية لمديرات المدارس والروضات.",
      targetKind: "ADMIN",
      targetRoleLabel: "مديرات المدارس والروضات",
      targetRoleKeyHints: ["GIRLS_PRINCIPAL", "KG_PRINCIPAL"],
      evaluatorKind: "ADMIN_SUPERVISOR",
      evaluatorLabel: CONFIG.evaluator.roleLabel,
      defaultEvaluatorRoleKeys: [CONFIG.evaluator.roleKey],
      frameworkKind: "ADMIN_EVALUATION",
      schoolTypes: ["PRIMARY", "KG"],
      maxCyclesPerTerm: 1,
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
      frameworkId: FRAMEWORK.id,
      title: "الأداء الإداري والقيادي",
      description: "بنود تقييم الأداء الإداري والقيادي لمديرة المدرسة أو الروضة.",
      order: 1,
      weight: 100,
      isActive: true,
    },
  });
  FRAMEWORK.items.forEach((title, index) => {
    const itemNumber = String(index + 1).padStart(2, "0");
    documents.push({
      type: "item",
      path: `${orgRoot}/evaluationRubricItems/${sectionId}-${itemNumber}`,
      data: {
        id: `${sectionId}-${itemNumber}`,
        orgId: CONFIG.orgId,
        frameworkId: FRAMEWORK.id,
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

  for (const target of CONFIG.targets) {
    const planId = `${target.schoolId}-${CONFIG.academicYearId}-${CONFIG.termId}-${FRAMEWORK.planSlug}`;
    const cycleId = `${planId}-evaluation-01`;
    const policyId = `${planId}-policy-admin-supervisor`;
    const targetAssignmentId = `${planId}-target-${target.personId}`;
    const evaluatorAssignmentId = `${cycleId}-${target.personId}-${CONFIG.evaluator.personId}`;

    documents.push({
      type: "plan",
      planId,
      schoolId: target.schoolId,
      path: `${orgRoot}/evaluationPlans/${planId}`,
      data: {
        id: planId,
        orgId: CONFIG.orgId,
        schoolId: target.schoolId,
        academicYearId: CONFIG.academicYearId,
        termId: CONFIG.termId,
        title: `تقييم المشرفة الإدارية ل${target.roleLabel} - ${target.schoolLabel} - الفصل الأول`,
        description: `خطة تقييم ${target.roleLabel} بواسطة المشرفة الإدارية داخل الفصل الدراسي الأول.`,
        frameworkId: FRAMEWORK.id,
        planKind: "ONE_TIME",
        targetKind: "ADMIN",
        targetRoleKey: target.roleKey,
        targetRoleLabel: target.roleLabel,
        status: "ACTIVE",
      },
    });
    documents.push({
      type: "policy",
      planId,
      schoolId: target.schoolId,
      path: `${orgRoot}/evaluatorPolicies/${policyId}`,
      data: {
        id: policyId,
        orgId: CONFIG.orgId,
        schoolId: target.schoolId,
        academicYearId: CONFIG.academicYearId,
        termId: CONFIG.termId,
        planId,
        evaluatorRoleKey: CONFIG.evaluator.roleKey,
        evaluatorLabel: CONFIG.evaluator.roleLabel,
        evaluatorPersonId: CONFIG.evaluator.personId,
        weight: 100,
        required: true,
        canSubmit: true,
        canReview: false,
        canApprove: true,
        order: 1,
      },
    });
    documents.push({
      type: "targetAssignment",
      planId,
      schoolId: target.schoolId,
      path: `${orgRoot}/evaluationTargetAssignments/${targetAssignmentId}`,
      data: {
        id: targetAssignmentId,
        orgId: CONFIG.orgId,
        schoolId: target.schoolId,
        academicYearId: CONFIG.academicYearId,
        termId: CONFIG.termId,
        planId,
        targetPersonId: target.personId,
        targetEmail: target.email,
        targetDisplayName: target.displayName,
        targetRoleKey: target.roleKey,
        targetRoleLabel: target.roleLabel,
        targetKind: "ADMIN",
        status: "ACTIVE",
      },
    });
    documents.push({
      type: "cycle",
      planId,
      schoolId: target.schoolId,
      path: `${orgRoot}/evaluationCycles/${cycleId}`,
      data: {
        id: cycleId,
        orgId: CONFIG.orgId,
        schoolId: target.schoolId,
        academicYearId: CONFIG.academicYearId,
        termId: CONFIG.termId,
        planId,
        cycleNumber: 1,
        title: "التقييم",
        cycleKind: "CUSTOM",
        status: "OPEN",
        isIncludedInAverage: true,
      },
    });
    documents.push({
      type: "evaluatorAssignment",
      planId,
      schoolId: target.schoolId,
      path: `${orgRoot}/evaluationEvaluatorAssignments/${evaluatorAssignmentId}`,
      data: {
        id: evaluatorAssignmentId,
        orgId: CONFIG.orgId,
        schoolId: target.schoolId,
        academicYearId: CONFIG.academicYearId,
        termId: CONFIG.termId,
        planId,
        cycleId,
        targetPersonId: target.personId,
        targetRoleKey: target.roleKey,
        targetRoleLabel: target.roleLabel,
        evaluatorPersonId: CONFIG.evaluator.personId,
        evaluatorEmail: CONFIG.evaluator.email,
        evaluatorRoleKey: CONFIG.evaluator.roleKey,
        weight: 100,
        sourceType: "MANUAL",
        status: "ACTIVE",
      },
    });
  }

  return documents;
}

function assertStructure(documents) {
  const sections = documents.filter((document) => document.type === "section");
  const items = documents.filter((document) => document.type === "item");
  assert(sections.length === 1 && sections[0].data.weight === 100, "Framework section validation failed.");
  assert(items.length === FRAMEWORK.items.length, "Framework item count mismatch.");
  assert(items.every((item, index) => item.data.order === index + 1 && item.data.maxScore === 5), "Framework item validation failed.");

  for (const target of CONFIG.targets) {
    const planId = `${target.schoolId}-${CONFIG.academicYearId}-${CONFIG.termId}-${FRAMEWORK.planSlug}`;
    const planDocuments = documents.filter((document) => document.planId === planId);
    for (const type of ["plan", "policy", "targetAssignment", "cycle", "evaluatorAssignment"]) {
      assert(planDocuments.filter((document) => document.type === type).length === 1, `${planId} ${type} count mismatch.`);
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
  const now = Date.now();
  for (const group of chunk(documents, 400)) {
    const batch = db.batch();
    for (const document of group) {
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
}

async function verifyPlanCounts(db, orgRoot) {
  for (const target of CONFIG.targets) {
    const planId = `${target.schoolId}-${CONFIG.academicYearId}-${CONFIG.termId}-${FRAMEWORK.planSlug}`;
    const [cycles, targets, assignments] = await Promise.all([
      db.collection(`${orgRoot}/evaluationCycles`).where("planId", "==", planId).get(),
      db.collection(`${orgRoot}/evaluationTargetAssignments`).where("planId", "==", planId).get(),
      db.collection(`${orgRoot}/evaluationEvaluatorAssignments`).where("planId", "==", planId).get(),
    ]);
    assert(cycles.docs.filter((document) => isActive(document.data())).length === 1, `${planId} active cycle verification failed.`);
    assert(targets.docs.filter((document) => isActive(document.data())).length === 1, `${planId} active target verification failed.`);
    assert(assignments.docs.filter((document) => isActive(document.data())).length === 1, `${planId} active evaluator assignment verification failed.`);
  }
}

function buildReport(documents, inspection) {
  return {
    evaluator: CONFIG.evaluator,
    targets: CONFIG.targets.map((target) => ({
      schoolId: target.schoolId,
      schoolLabel: target.schoolLabel,
      personId: target.personId,
      displayName: target.displayName,
      email: target.email,
      roleKey: target.roleKey,
    })),
    framework: { id: FRAMEWORK.id, cycles: 1, items: FRAMEWORK.items.length },
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
  const documents = buildDocuments(preflight.orgRoot);
  assertStructure(documents);
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
  console.log("Admin supervisor principal evaluations applied and verified.");
  console.dir({ verified: countByType(documents), total: documents.length });
}

main().catch((error) => {
  console.error("Admin supervisor principal evaluation seed failed:");
  console.error(error);
  process.exitCode = 1;
});
