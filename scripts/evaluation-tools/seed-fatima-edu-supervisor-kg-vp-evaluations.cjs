const admin = require("firebase-admin");
const fs = require("fs");
const path = require("path");

const serviceAccount = require(path.resolve("service-account.json"));

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    projectId: serviceAccount.project_id,
  });
}

const db = admin.firestore();

const APPLY = process.argv.includes("--apply");

function getArg(name, fallback = "") {
  const index = process.argv.indexOf(`--${name}`);
  if (index === -1) return fallback;
  return process.argv[index + 1] || fallback;
}

const ORG_ID = getArg("org", "takween");
const YEAR_ID = getArg("year", "ay-1448");
const TERM_ID = getArg("term", "term-1");

const EVALUATOR = {
  uid: "H9nDRWMOqsfOUE27cJBbJn2RESE3",
  personId: getArg("evaluatorPersonId", "p-f-alhamaad"),
  email: "f-alhamaad@qz.org.sa",
  displayName: "فاطمة حماد الحماد",
  roleKey: "EDU_SUPERVISOR",
  roleLabel: "مشرفة تعليمية",
};

const KG_SCHOOLS = [
  {
    schoolId: "kg-01",
    schoolTitle: "روضة واحة الرياحين الأولى",
    vp: {
      uid: "ms10LdA0k5TVkiJo4VO6pprmcOh2",
      personId: "staff-ms10LdA0k5TVkiJo4VO6pprmcOh2",
      email: "t.alamer@qz.org.sa",
      displayName: "تماضر صالح محمد العامر",
    },
  },
  {
    schoolId: "kg-02",
    schoolTitle: "روضة واحة الرياحين الثانية",
    vp: {
      uid: "yC5MUiMlxCXt9RnrjPmT85Ko34t1",
      personId: "p-h-aljower",
      email: "h.aljower@qz.org.sa",
      displayName: "هاجر أحمد فهد الجوير",
    },
  },
  {
    schoolId: "kg-03",
    schoolTitle: "روضة واحة الرياحين الثالثة",
    vp: {
      uid: "tfvc13fv0DOLqAjQ8s8cpojRMVG2",
      personId: "p-s-alslman",
      email: "s.alslman@qz.org.sa",
      displayName: "ساره سعد أحمد السلمان",
    },
  },
  {
    schoolId: "kg-04",
    schoolTitle: "روضة واحة الرياحين الرابعة",
    vp: {
      uid: "2DtRW3PPQLSjuZR1Pyp1WucwzKy1",
      personId: "p-h-alshaya",
      email: "h.alshaya@qz.org.sa",
      displayName: "حصه عبدالرزاق احمد الشايع",
    },
  },
];

const TARGET_VISITS = 3;

const NEW_FRAMEWORK_ID =
  "educational-supervisor-kg-vp-three-times-evaluation-v1";

const NEW_FRAMEWORK_TITLE =
  "تقييم المشرفة التعليمية للوكيلة - المتابعة ثلاث مرات";

const REPORTS_DIR = path.resolve("scripts/evaluation-tools/reports");

function asString(value, fallback = "") {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : fallback;
}

function asNumber(value, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function normalizeStatus(value) {
  return String(value || "").trim().toUpperCase();
}

function isActive(row) {
  const status = normalizeStatus(row?.status);

  if (status === "ACTIVE") return true;
  if (!status && row?.isActive === true) return true;

  return false;
}

function isFrameworkUsable(row) {
  if (!row) return false;
  if (row.isActive === false) return false;

  const status = asString(row.status, "ACTIVE");

  return status === "ACTIVE";
}

function safeFileName(value) {
  return String(value || "")
    .trim()
    .replace(/[@]/g, "_at_")
    .replace(/[^a-zA-Z0-9\u0600-\u06FF._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function writeJsonReport(report) {
  fs.mkdirSync(REPORTS_DIR, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const mode = APPLY ? "apply" : "preview";

  const fileName =
    [
      timestamp,
      mode,
      "seed-fatima-edu-supervisor-kg-vp-evaluations",
      safeFileName(EVALUATOR.personId),
    ].join("__") + ".json";

  const reportPath = path.join(REPORTS_DIR, fileName);

  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), "utf8");

  return reportPath;
}

function visitTitle(visitNumber) {
  switch (visitNumber) {
    case 1:
      return "الزيارة الأولى";
    case 2:
      return "الزيارة الثانية";
    case 3:
      return "الزيارة الثالثة";
    default:
      return `الزيارة ${visitNumber}`;
  }
}

function planIdForSchool(schoolId) {
  return `${schoolId}-${YEAR_ID}-${TERM_ID}-educational-supervisor-kg-vp-three-times-evaluation`;
}

function planTitleForSchool(schoolTitle) {
  return `${NEW_FRAMEWORK_TITLE} - ${schoolTitle} - الفصل الأول`;
}

function cycleIdForVisit(planId, visitNumber) {
  return `${planId}-evaluation-${String(visitNumber).padStart(2, "0")}`;
}

function targetAssignmentId(planId, targetPersonId) {
  return `${planId}-target-${targetPersonId}`;
}

function evaluatorAssignmentId(planId, cycleId, targetPersonId, evaluatorPersonId) {
  return `${planId}-${cycleId}-${targetPersonId}-${evaluatorPersonId}`;
}

function mapFrameworkDocId(sourceId, sourceFrameworkId) {
  const id = asString(sourceId);

  if (id.includes(sourceFrameworkId)) {
    return id.split(sourceFrameworkId).join(NEW_FRAMEWORK_ID);
  }

  return `${NEW_FRAMEWORK_ID}__${id}`;
}

function cleanForCopy(row) {
  const cleaned = { ...row };

  delete cleaned.id;
  delete cleaned.ref;
  delete cleaned.createdAt;
  delete cleaned.updatedAt;
  delete cleaned.lockedAt;
  delete cleaned.isLocked;

  return cleaned;
}

async function getCollectionRows(orgRef, collectionName) {
  const snap = await orgRef.collection(collectionName).get();

  return snap.docs.map((doc) => ({
    ...doc.data(),
    id: doc.id,
    ref: doc.ref,
  }));
}

async function getSchoolTitle(orgRef, fallbackSchool) {
  const snap = await orgRef.collection("schools").doc(fallbackSchool.schoolId).get();

  if (!snap.exists) return fallbackSchool.schoolTitle;

  const data = snap.data();

  return (
    asString(data.title) ||
    asString(data.name) ||
    asString(data.displayName) ||
    fallbackSchool.schoolTitle
  );
}

function isSourceKgPrincipalVpThreeTimesPlan(plan) {
  const planId = asString(plan.id);
  const title = asString(plan.title);
  const frameworkId = asString(plan.frameworkId);

  const isVpPlan =
    planId.includes("vice-principal") ||
    title.includes("للوكيلة") ||
    title.includes("الوكيلة") ||
    frameworkId.includes("vice-principal");

  const isThreeTimes =
    planId.includes("three-times") ||
    title.includes("ثلاث مرات") ||
    asNumber(plan.cycleCount) === 3 ||
    asNumber(plan.maxCyclesPerTerm) === 3;

  const isNotNewPlan = !planId.includes(
    "educational-supervisor-kg-vp-three-times-evaluation",
  );

  return (
    isActive(plan) &&
    asString(plan.academicYearId) === YEAR_ID &&
    asString(plan.termId) === TERM_ID &&
    asString(plan.targetKind) === "ADMIN" &&
    isVpPlan &&
    isThreeTimes &&
    isNotNewPlan
  );
}

function pickSourcePlanForSchool(plans, schoolId) {
  const candidates = plans
    .filter((plan) => asString(plan.schoolId) === schoolId)
    .filter(isSourceKgPrincipalVpThreeTimesPlan)
    .sort((a, b) => {
      const aTitle = asString(a.title);
      const bTitle = asString(b.title);

      const aScore =
        (aTitle.includes("مديرة الروضة") ? 100 : 0) +
        (aTitle.includes("للوكيلة") ? 50 : 0);

      const bScore =
        (bTitle.includes("مديرة الروضة") ? 100 : 0) +
        (bTitle.includes("للوكيلة") ? 50 : 0);

      if (aScore !== bScore) return bScore - aScore;

      return asString(a.id).localeCompare(asString(b.id));
    });

  return {
    sourcePlan: candidates[0] || null,
    candidates,
  };
}

function buildFrameworkWrite(sourceFramework, now) {
  const base = cleanForCopy(sourceFramework || {});

  return {
    ...base,

    id: NEW_FRAMEWORK_ID,
    orgId: ORG_ID,

    title: NEW_FRAMEWORK_TITLE,
    shortTitle: "تقييم المشرفة التعليمية للوكيلة",
    description:
      "قالب تقييم المشرفة التعليمية لوكيلات الروضات - المتابعة ثلاث مرات.",

    targetKind: "ADMIN",
    targetRoleKeyHint: "KG_VP",
    targetRoleLabel: "وكيلة الروضة",

    evaluatorKind: "EDU_SUPERVISOR",
    evaluatorRoleKey: "EDU_SUPERVISOR",
    evaluatorRoleLabel: EVALUATOR.roleLabel,
    evaluatorLabel: EVALUATOR.roleLabel,
    defaultEvaluatorRoleKeys: ["EDU_SUPERVISOR"],

    schoolTypes: ["KG"],

    frameworkKind: "THREE_TIMES_ADMIN_EVALUATION",
    planKind: "VISIT_BASED",
    maxCyclesPerTerm: TARGET_VISITS,

    status: "ACTIVE",
    isActive: true,
    version: 1,

    copiedFromFrameworkId: asString(sourceFramework?.id),
    seedTool: "seed-fatima-edu-supervisor-kg-vp-evaluations.cjs",

    createdAt: now,
    updatedAt: now,
  };
}

function buildSectionWrite(sourceSection, sourceFrameworkId, now) {
  const newSectionId = mapFrameworkDocId(sourceSection.id, sourceFrameworkId);

  const base = cleanForCopy(sourceSection);

  return {
    ...base,

    id: newSectionId,
    orgId: ORG_ID,
    frameworkId: NEW_FRAMEWORK_ID,

    copiedFromSectionId: asString(sourceSection.id),
    seedTool: "seed-fatima-edu-supervisor-kg-vp-evaluations.cjs",

    createdAt: now,
    updatedAt: now,
  };
}

function buildItemWrite(sourceItem, sourceFrameworkId, sectionIdMap, now) {
  const newItemId = mapFrameworkDocId(sourceItem.id, sourceFrameworkId);
  const oldSectionId = asString(sourceItem.sectionId);
  const newSectionId =
    sectionIdMap.get(oldSectionId) || mapFrameworkDocId(oldSectionId, sourceFrameworkId);

  const base = cleanForCopy(sourceItem);

  return {
    ...base,

    id: newItemId,
    orgId: ORG_ID,
    frameworkId: NEW_FRAMEWORK_ID,
    sectionId: newSectionId,

    copiedFromItemId: asString(sourceItem.id),
    copiedFromSectionId: oldSectionId,
    seedTool: "seed-fatima-edu-supervisor-kg-vp-evaluations.cjs",

    createdAt: now,
    updatedAt: now,
  };
}

function buildPlanWrite(params) {
  const { schoolId, schoolTitle, sourcePlan, now } = params;

  const planId = planIdForSchool(schoolId);
  const title = planTitleForSchool(schoolTitle);

  return {
    id: planId,
    orgId: ORG_ID,

    schoolId,
    schoolTitle,

    academicYearId: YEAR_ID,
    termId: TERM_ID,

    frameworkId: NEW_FRAMEWORK_ID,

    title,
    shortTitle: NEW_FRAMEWORK_TITLE,
    description: title,

    targetKind: "ADMIN",
    targetRoleKey: "KG_VP",
    targetRoleLabel: "وكيلة الروضة",

    evaluatorRoleKey: "EDU_SUPERVISOR",
    evaluatorRoleLabel: EVALUATOR.roleLabel,

    planKind: "VISIT_BASED",
    frequency: "THREE_TIMES",
    cycleCount: TARGET_VISITS,
    maxCyclesPerTerm: TARGET_VISITS,

    status: "ACTIVE",
    isActive: true,

    copiedFromPlanId: asString(sourcePlan?.id),
    seedTool: "seed-fatima-edu-supervisor-kg-vp-evaluations.cjs",

    createdAt: now,
    updatedAt: now,
  };
}

function buildCycleWrite(params) {
  const { planId, schoolId, schoolTitle, visitNumber, now } = params;
  const cycleId = cycleIdForVisit(planId, visitNumber);

  return {
    id: cycleId,
    orgId: ORG_ID,

    schoolId,
    schoolTitle,

    academicYearId: YEAR_ID,
    termId: TERM_ID,

    planId,
    planTitle: planTitleForSchool(schoolTitle),
    frameworkId: NEW_FRAMEWORK_ID,

    title: visitTitle(visitNumber),
    shortTitle: visitTitle(visitNumber),

    sequence: visitNumber,
    order: visitNumber,
    cycleNumber: visitNumber,
    visitNumber,

    status: "OPEN",

    seedTool: "seed-fatima-edu-supervisor-kg-vp-evaluations.cjs",

    createdAt: now,
    updatedAt: now,
  };
}

function buildTargetAssignmentWrite(params) {
  const { planId, schoolId, schoolTitle, vp, now } = params;
  const targetId = targetAssignmentId(planId, vp.personId);

  return {
    id: targetId,
    orgId: ORG_ID,

    schoolId,
    schoolTitle,

    academicYearId: YEAR_ID,
    termId: TERM_ID,

    planId,
    planTitle: planTitleForSchool(schoolTitle),
    frameworkId: NEW_FRAMEWORK_ID,

    targetKind: "ADMIN",
    targetPersonId: vp.personId,
    targetUid: vp.uid || "",
    targetEmail: vp.email,
    targetDisplayName: vp.displayName,
    targetRoleKey: "KG_VP",
    targetRoleLabel: "وكيلة الروضة",

    status: "ACTIVE",

    seedTool: "seed-fatima-edu-supervisor-kg-vp-evaluations.cjs",

    createdAt: now,
    updatedAt: now,
  };
}

function buildEvaluatorAssignmentWrite(params) {
  const { planId, cycleId, schoolId, schoolTitle, vp, visitNumber, now } =
    params;

  const assignmentId = evaluatorAssignmentId(
    planId,
    cycleId,
    vp.personId,
    EVALUATOR.personId,
  );

  const targetId = targetAssignmentId(planId, vp.personId);
  const planTitle = planTitleForSchool(schoolTitle);

  return {
    id: assignmentId,
    orgId: ORG_ID,

    schoolId,
    schoolTitle,

    academicYearId: YEAR_ID,
    termId: TERM_ID,

    planId,
    planTitle,
    displayTitle: planTitle,
    evaluatorDisplayTitle: planTitle,

    frameworkId: NEW_FRAMEWORK_ID,
    frameworkTitle: NEW_FRAMEWORK_TITLE,

    cycleId,
    cycleTitle: visitTitle(visitNumber),

    targetAssignmentId: targetId,
    targetKind: "ADMIN",
    targetPersonId: vp.personId,
    targetUid: vp.uid || "",
    targetEmail: vp.email,
    targetDisplayName: vp.displayName,
    targetRoleKey: "KG_VP",
    targetRoleLabel: "وكيلة الروضة",

    evaluatorUid: EVALUATOR.uid,
    evaluatorPersonId: EVALUATOR.personId,
    evaluatorEmail: EVALUATOR.email,
    evaluatorDisplayName: EVALUATOR.displayName,
    evaluatorRoleKey: EVALUATOR.roleKey,
    evaluatorRoleLabel: EVALUATOR.roleLabel,

    weight: 100,
    status: "ACTIVE",

    seedTool: "seed-fatima-edu-supervisor-kg-vp-evaluations.cjs",

    createdAt: now,
    updatedAt: now,
  };
}

async function commitInChunks(writes, chunkSize = 450) {
  let committed = 0;

  for (let i = 0; i < writes.length; i += chunkSize) {
    const batch = db.batch();
    const chunk = writes.slice(i, i + chunkSize);

    for (const write of chunk) {
      batch.set(write.ref, write.data, { merge: true });
    }

    await batch.commit();
    committed += chunk.length;
  }

  return committed;
}

async function main() {
  console.log(APPLY ? "APPLY mode" : "Preview mode - no writes");

  const orgRef = db.collection("orgs").doc(ORG_ID);
  const now = Date.now();

  const [
    plans,
    frameworks,
    sections,
    items,
    cycles,
    targetAssignments,
    evaluatorAssignments,
    submissions,
  ] = await Promise.all([
    getCollectionRows(orgRef, "evaluationPlans"),
    getCollectionRows(orgRef, "evaluationFrameworks"),
    getCollectionRows(orgRef, "evaluationRubricSections"),
    getCollectionRows(orgRef, "evaluationRubricItems"),
    getCollectionRows(orgRef, "evaluationCycles"),
    getCollectionRows(orgRef, "evaluationTargetAssignments"),
    getCollectionRows(orgRef, "evaluationEvaluatorAssignments"),
    getCollectionRows(orgRef, "evaluationSubmissions"),
  ]);

  const frameworksById = new Map(frameworks.map((framework) => [framework.id, framework]));
  const existingCycleIds = new Set(cycles.map((cycle) => asString(cycle.id)));
  const existingTargetAssignmentIds = new Set(
    targetAssignments.map((target) => asString(target.id)),
  );
  const existingEvaluatorAssignmentIds = new Set(
    evaluatorAssignments.map((assignment) => asString(assignment.id)),
  );

  const conflicts = [];
  const warnings = [];

  const sourcePlanLookups = KG_SCHOOLS.map((school) => {
    const lookup = pickSourcePlanForSchool(plans, school.schoolId);

    if (!lookup.sourcePlan) {
      conflicts.push({
        reason: "NO_SOURCE_KG_PRINCIPAL_VP_THREE_TIMES_PLAN_FOUND",
        schoolId: school.schoolId,
        schoolTitle: school.schoolTitle,
        note:
          "لم أجد خطة قديمة أستخدمها كمصدر للبنود، مثل: تقييم مديرة الروضة للوكيلة - المتابعة ثلاث مرات.",
      });
    }

    return {
      school,
      ...lookup,
    };
  });

  const firstSourcePlan = sourcePlanLookups.find((item) => item.sourcePlan)?.sourcePlan;
  const sourceFrameworkId = asString(firstSourcePlan?.frameworkId);
  const sourceFramework = frameworksById.get(sourceFrameworkId) || null;

  if (!firstSourcePlan) {
    conflicts.push({
      reason: "NO_SOURCE_PLAN_AVAILABLE_FOR_FRAMEWORK_COPY",
    });
  }

  if (!sourceFrameworkId || !sourceFramework) {
    conflicts.push({
      reason: "SOURCE_FRAMEWORK_NOT_FOUND",
      sourceFrameworkId,
      sourcePlanId: asString(firstSourcePlan?.id),
    });
  }

  if (sourceFramework && !isFrameworkUsable(sourceFramework)) {
    warnings.push({
      reason: "SOURCE_FRAMEWORK_IS_NOT_MARKED_ACTIVE",
      sourceFrameworkId,
      status: sourceFramework.status || "",
      isActive: sourceFramework.isActive,
      note:
        "سأستخدمه كمصدر نسخ فقط لأننا لا ننشئ submissions ولا نعدل القديم.",
    });
  }

  const sourceSections = sections
    .filter((section) => asString(section.frameworkId) === sourceFrameworkId)
    .sort((a, b) => asNumber(a.order) - asNumber(b.order));

  const sourceItems = items
    .filter((item) => asString(item.frameworkId) === sourceFrameworkId)
    .sort((a, b) => {
      const sectionCompare = asString(a.sectionId).localeCompare(
        asString(b.sectionId),
      );

      if (sectionCompare !== 0) return sectionCompare;

      return asNumber(a.order) - asNumber(b.order);
    });

  if (sourceFramework && sourceSections.length === 0) {
    conflicts.push({
      reason: "SOURCE_FRAMEWORK_HAS_NO_RUBRIC_SECTIONS",
      sourceFrameworkId,
    });
  }

  if (sourceFramework && sourceItems.length === 0) {
    conflicts.push({
      reason: "SOURCE_FRAMEWORK_HAS_NO_RUBRIC_ITEMS",
      sourceFrameworkId,
    });
  }

  const frameworkWrites = [];
  const sectionWrites = [];
  const itemWrites = [];
  const planWrites = [];
  const cycleWrites = [];
  const targetAssignmentWrites = [];
  const evaluatorAssignmentWrites = [];
  const schoolReports = [];

  if (conflicts.length === 0) {
    frameworkWrites.push({
      ref: orgRef.collection("evaluationFrameworks").doc(NEW_FRAMEWORK_ID),
      data: buildFrameworkWrite(sourceFramework, now),
    });

    const sectionIdMap = new Map();

    for (const section of sourceSections) {
      const newSectionId = mapFrameworkDocId(section.id, sourceFrameworkId);
      sectionIdMap.set(asString(section.id), newSectionId);

      sectionWrites.push({
        ref: orgRef.collection("evaluationRubricSections").doc(newSectionId),
        data: buildSectionWrite(section, sourceFrameworkId, now),
      });
    }

    for (const item of sourceItems) {
      const newItemId = mapFrameworkDocId(item.id, sourceFrameworkId);

      itemWrites.push({
        ref: orgRef.collection("evaluationRubricItems").doc(newItemId),
        data: buildItemWrite(item, sourceFrameworkId, sectionIdMap, now),
      });
    }

    for (const lookup of sourcePlanLookups) {
      const schoolTitle = await getSchoolTitle(orgRef, lookup.school);
      const schoolId = lookup.school.schoolId;
      const vp = lookup.school.vp;
      const planId = planIdForSchool(schoolId);

      const planWrite = buildPlanWrite({
        schoolId,
        schoolTitle,
        sourcePlan: lookup.sourcePlan,
        now,
      });

      planWrites.push({
        ref: orgRef.collection("evaluationPlans").doc(planId),
        data: planWrite,
      });

      const targetId = targetAssignmentId(planId, vp.personId);

      targetAssignmentWrites.push({
        ref: orgRef.collection("evaluationTargetAssignments").doc(targetId),
        data: buildTargetAssignmentWrite({
          planId,
          schoolId,
          schoolTitle,
          vp,
          now,
        }),
      });

      const schoolCycleReports = [];
      const schoolEvaluatorReports = [];

      for (let visitNumber = 1; visitNumber <= TARGET_VISITS; visitNumber += 1) {
        const cycleId = cycleIdForVisit(planId, visitNumber);

        cycleWrites.push({
          ref: orgRef.collection("evaluationCycles").doc(cycleId),
          data: buildCycleWrite({
            planId,
            schoolId,
            schoolTitle,
            visitNumber,
            now,
          }),
        });

        const assignmentId = evaluatorAssignmentId(
          planId,
          cycleId,
          vp.personId,
          EVALUATOR.personId,
        );

        evaluatorAssignmentWrites.push({
          ref: orgRef.collection("evaluationEvaluatorAssignments").doc(assignmentId),
          data: buildEvaluatorAssignmentWrite({
            planId,
            cycleId,
            schoolId,
            schoolTitle,
            vp,
            visitNumber,
            now,
          }),
        });

        schoolCycleReports.push({
          cycleId,
          visitNumber,
          title: visitTitle(visitNumber),
          existedBefore: existingCycleIds.has(cycleId),
        });

        schoolEvaluatorReports.push({
          assignmentId,
          cycleId,
          targetPersonId: vp.personId,
          targetDisplayName: vp.displayName,
          evaluatorPersonId: EVALUATOR.personId,
          existedBefore: existingEvaluatorAssignmentIds.has(assignmentId),
        });
      }

      schoolReports.push({
        schoolId,
        schoolTitle,
        sourcePlan: lookup.sourcePlan
          ? {
              id: lookup.sourcePlan.id,
              title: lookup.sourcePlan.title || "",
              frameworkId: lookup.sourcePlan.frameworkId || "",
            }
          : null,
        sourceCandidatesCount: lookup.candidates.length,
        newPlan: {
          id: planId,
          title: planTitleForSchool(schoolTitle),
          existedBefore: plans.some((plan) => asString(plan.id) === planId),
        },
        target: {
          targetAssignmentId: targetId,
          targetAssignmentExistedBefore: existingTargetAssignmentIds.has(targetId),
          vp,
        },
        cycles: schoolCycleReports,
        evaluatorAssignments: schoolEvaluatorReports,
      });
    }
  }

  const matchingSubmissions = submissions.filter((submission) => {
    return asString(submission.frameworkId) === NEW_FRAMEWORK_ID;
  });

  const allWrites = [
    ...frameworkWrites,
    ...sectionWrites,
    ...itemWrites,
    ...planWrites,
    ...cycleWrites,
    ...targetAssignmentWrites,
    ...evaluatorAssignmentWrites,
  ];

  const report = {
    decision:
      conflicts.length > 0
        ? "STOPPED"
        : APPLY
          ? "READY_TO_APPLY"
          : "SAFE_PREVIEW",

    mode: APPLY ? "APPLY" : "PREVIEW",

    input: {
      orgId: ORG_ID,
      academicYearId: YEAR_ID,
      termId: TERM_ID,
      evaluator: EVALUATOR,
      targetVisits: TARGET_VISITS,
      schools: KG_SCHOOLS.map((school) => ({
        schoolId: school.schoolId,
        schoolTitle: school.schoolTitle,
        vp: school.vp,
      })),
    },

    source: {
      sourcePlanId: asString(firstSourcePlan?.id),
      sourcePlanTitle: asString(firstSourcePlan?.title),
      sourceFrameworkId,
      sourceFrameworkTitle: asString(sourceFramework?.title),
      sourceSectionsCount: sourceSections.length,
      sourceItemsCount: sourceItems.length,
    },

    plannedChanges: {
      createOrUpdateFrameworks: frameworkWrites.length,
      createOrUpdateRubricSections: sectionWrites.length,
      createOrUpdateRubricItems: itemWrites.length,
      createOrUpdatePlans: planWrites.length,
      createOrUpdateCycles: cycleWrites.length,
      createOrUpdateTargetAssignments: targetAssignmentWrites.length,
      createOrUpdateEvaluatorAssignments: evaluatorAssignmentWrites.length,
      totalWrites: allWrites.length,
    },

    schoolReports,

    submissions: {
      touched: 0,
      existingMatchingSubmissionsCount: matchingSubmissions.length,
    },

    warnings,
    conflicts,

    safety: {
      deletes: 0,
      submissionsTouched: 0,
      oldPlansTouched: 0,
      oldAssignmentsTouched: 0,
      createsNewFramework: true,
      requiresApplyFlag: true,
    },
  };

  const reportPath = writeJsonReport(report);

  console.dir(
    {
      decision: report.decision,
      mode: report.mode,
      reportPath,
      source: report.source,
      plannedChanges: report.plannedChanges,
      warningsCount: warnings.length,
      conflictsCount: conflicts.length,
      conflicts,
    },
    { depth: 20 },
  );

  if (conflicts.length > 0) {
    console.log("");
    console.log("Stopped. Fix conflicts before applying.");
    process.exit(1);
  }

  if (!APPLY) {
    console.log("");
    console.log("No writes performed.");
    console.log("Review the JSON report carefully.");
    console.log("Run again with --apply to seed Fatima evaluations.");
    return;
  }

  const committed = await commitInChunks(allWrites);

  const applyResult = {
    decision: "APPLIED",
    committedWrites: committed,
    createdOrUpdatedFrameworks: frameworkWrites.length,
    createdOrUpdatedRubricSections: sectionWrites.length,
    createdOrUpdatedRubricItems: itemWrites.length,
    createdOrUpdatedPlans: planWrites.length,
    createdOrUpdatedCycles: cycleWrites.length,
    createdOrUpdatedTargetAssignments: targetAssignmentWrites.length,
    createdOrUpdatedEvaluatorAssignments: evaluatorAssignmentWrites.length,
    submissionsTouched: 0,
  };

  const applyReportPath = writeJsonReport({
    ...report,
    applyResult,
  });

  console.dir({
    ...applyResult,
    applyReportPath,
  });
}

main().catch((error) => {
  console.error("Seed failed:", error);
  process.exit(1);
});