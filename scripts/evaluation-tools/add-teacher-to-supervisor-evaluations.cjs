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
const PLAN_ID_ARG = getArg("planId").trim();
const TEACHER_PERSON_ID = getArg("teacherPersonId").trim();
const TEACHER_EMAIL = getArg("teacherEmail").trim().toLowerCase();

const SUPERVISOR_PERSON_ID = getArg("supervisorPersonId").trim();
const SUPERVISOR_EMAIL = getArg("supervisorEmail").trim().toLowerCase();

const SCHOOL_ID_ARG = getArg("school").trim();

const REPORTS_DIR = path.resolve("scripts/evaluation-tools/reports");

function requireArgs() {
  const missing = [];

  if (!TEACHER_PERSON_ID && !TEACHER_EMAIL) {
    missing.push("--teacherPersonId or --teacherEmail");
  }

  if (!SUPERVISOR_PERSON_ID && !SUPERVISOR_EMAIL) {
    missing.push("--supervisorPersonId or --supervisorEmail");
  }

  if (missing.length > 0) {
    console.error("Missing required args:", missing.join(", "));
    console.error("");
    console.error("Examples:");
    console.error(
      'node .\\scripts\\evaluation-tools\\add-teacher-to-supervisor-evaluations.cjs --teacherPersonId "p-r-a-atriqi" --supervisorPersonId "p-n-alshaya"',
    );
    console.error(
      'node .\\scripts\\evaluation-tools\\add-teacher-to-supervisor-evaluations.cjs --teacherEmail "teacher@qz.org.sa" --supervisorEmail "supervisor@qz.org.sa" --school "mrb-boys-sayh"',
    );
    process.exit(1);
  }
}

function asString(value, fallback = "") {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : fallback;
}

function asNumber(value, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function normalizeEmail(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function normalizeStatus(value) {
  return String(value || "")
    .trim()
    .toUpperCase();
}

function isActive(row) {
  const status = normalizeStatus(row?.status);

  if (status === "ACTIVE") return true;
  if (!status && row?.isActive === true) return true;

  return false;
}

function isUsableCycle(row) {
  const status = normalizeStatus(row?.status);

  return status === "OPEN" || status === "ACTIVE" || !status;
}

function isFrameworkActive(framework) {
  if (!framework) return false;
  if (framework.isActive === false) return false;

  return asString(framework.status, "ACTIVE") === "ACTIVE";
}

function isTeacherPlan(plan) {
  return asString(plan.targetKind) === "TEACHER";
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
      "add-teacher-to-supervisor-evaluations",
      safeFileName(
        report.teacher?.personId || TEACHER_PERSON_ID || TEACHER_EMAIL,
      ),
      "to",
      safeFileName(
        report.supervisor?.personId || SUPERVISOR_PERSON_ID || SUPERVISOR_EMAIL,
      ),
    ].join("__") + ".json";

  const reportPath = path.join(REPORTS_DIR, fileName);

  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), "utf8");

  return reportPath;
}

function uniqueBy(items, getKey) {
  const map = new Map();

  for (const item of items) {
    const key = getKey(item);

    if (!map.has(key)) {
      map.set(key, item);
    }
  }

  return Array.from(map.values());
}

function sortByCycle(items) {
  return [...items].sort((a, b) => {
    const aOrder = asNumber(
      a.sequence,
      asNumber(a.cycleNumber, asNumber(a.order, 9999)),
    );
    const bOrder = asNumber(
      b.sequence,
      asNumber(b.cycleNumber, asNumber(b.order, 9999)),
    );

    if (aOrder !== bOrder) return aOrder - bOrder;

    return asString(a.id).localeCompare(asString(b.id));
  });
}

function buildBalancedWeights(count) {
  if (count <= 0) return [];

  if (count === 1) {
    return [100];
  }

  const base = Math.floor((100 / count) * 1000) / 1000;

  const weights = Array.from({ length: count }, () => base);

  const used = base * count;
  const remainder = Number((100 - used).toFixed(3));

  weights[weights.length - 1] = Number(
    (weights[weights.length - 1] + remainder).toFixed(3),
  );

  return weights;
}

async function getCollectionRows(orgRef, collectionName) {
  const snap = await orgRef.collection(collectionName).get();

  return snap.docs.map((doc) => ({
    id: doc.id,
    ref: doc.ref,
    ...doc.data(),
  }));
}

async function resolvePerson(params) {
  const { personId, email, roleFallback } = params;
  const normalizedEmail = normalizeEmail(email);

  if (personId) {
    const usersByPersonId = await db
      .collection("users")
      .where("personId", "==", personId)
      .limit(5)
      .get();

    if (!usersByPersonId.empty) {
      const doc = usersByPersonId.docs[0];
      const row = doc.data();

      return {
        uid: asString(row.uid, doc.id),
        personId,
        email: normalizeEmail(row.email),
        displayName:
          asString(row.displayName) ||
          asString(row.fullName) ||
          asString(row.name) ||
          personId,
        roleKey: asString(row.roleKey, roleFallback),
        source: "users/personId",
      };
    }

    const orgRef = db.collection("orgs").doc(ORG_ID);
    const personSnap = await orgRef.collection("people").doc(personId).get();

    if (personSnap.exists) {
      const row = personSnap.data();

      return {
        uid: asString(row.uid),
        personId,
        email: normalizeEmail(row.email),
        displayName:
          asString(row.displayName) ||
          asString(row.fullName) ||
          asString(row.name) ||
          personId,
        roleKey: asString(row.roleKey, roleFallback),
        source: "orgs/people/personId",
      };
    }

    return {
      uid: "",
      personId,
      email: "",
      displayName: personId,
      roleKey: roleFallback,
      source: "fallback/personId",
    };
  }

  if (normalizedEmail) {
    const usersByEmail = await db
      .collection("users")
      .where("email", "==", normalizedEmail)
      .limit(5)
      .get();

    if (!usersByEmail.empty) {
      const doc = usersByEmail.docs[0];
      const row = doc.data();

      return {
        uid: asString(row.uid, doc.id),
        personId: asString(row.personId, doc.id),
        email: normalizedEmail,
        displayName:
          asString(row.displayName) ||
          asString(row.fullName) ||
          asString(row.name) ||
          normalizedEmail,
        roleKey: asString(row.roleKey, roleFallback),
        source: "users/email",
      };
    }

    const orgRef = db.collection("orgs").doc(ORG_ID);
    const peopleByEmail = await orgRef
      .collection("people")
      .where("email", "==", normalizedEmail)
      .limit(5)
      .get();

    if (!peopleByEmail.empty) {
      const doc = peopleByEmail.docs[0];
      const row = doc.data();

      return {
        uid: asString(row.uid),
        personId: asString(row.personId, doc.id),
        email: normalizedEmail,
        displayName:
          asString(row.displayName) ||
          asString(row.fullName) ||
          asString(row.name) ||
          normalizedEmail,
        roleKey: asString(row.roleKey, roleFallback),
        source: "orgs/people/email",
      };
    }
  }

  return null;
}

async function getSchoolTitle(orgRef, schoolId) {
  const snap = await orgRef.collection("schools").doc(schoolId).get();

  if (!snap.exists) return schoolId;

  const row = snap.data();

  return (
    asString(row.title) ||
    asString(row.name) ||
    asString(row.displayName) ||
    schoolId
  );
}

function targetAssignmentId(planId, targetPersonId) {
  return `${planId}-target-${targetPersonId}`;
}

function buildEvaluatorAssignmentIdFromPattern(params) {
  const { pattern, teacherPersonId, planId, cycleId, supervisorPersonId } =
    params;

  const patternId = asString(pattern.id);
  const patternTargetPersonId = asString(pattern.targetPersonId);
  const patternPlanId = asString(pattern.planId);
  const patternCycleId = asString(pattern.cycleId);
  const patternEvaluatorPersonId = asString(pattern.evaluatorPersonId);

  if (
    patternId &&
    patternTargetPersonId &&
    patternId.includes(patternTargetPersonId)
  ) {
    let nextId = patternId.split(patternTargetPersonId).join(teacherPersonId);

    if (patternPlanId && nextId.includes(patternPlanId)) {
      nextId = nextId.split(patternPlanId).join(planId);
    }

    if (patternCycleId && nextId.includes(patternCycleId)) {
      nextId = nextId.split(patternCycleId).join(cycleId);
    }

    if (
      patternEvaluatorPersonId &&
      supervisorPersonId &&
      nextId.includes(patternEvaluatorPersonId)
    ) {
      nextId = nextId.split(patternEvaluatorPersonId).join(supervisorPersonId);
    }

    return nextId;
  }

  return `${planId}-${cycleId}-${teacherPersonId}-${supervisorPersonId}`;
}

function cleanForCopy(row) {
  const cleaned = { ...row };

  delete cleaned.id;
  delete cleaned.ref;

  delete cleaned.targetPersonId;
  delete cleaned.targetEmail;
  delete cleaned.targetDisplayName;
  delete cleaned.targetName;
  delete cleaned.teacherEmail;
  delete cleaned.teacherName;
  delete cleaned.teacherDisplayName;

  delete cleaned.createdAt;
  delete cleaned.updatedAt;
  delete cleaned.removedAt;
  delete cleaned.removedReason;
  delete cleaned.transferredAt;
  delete cleaned.transferTool;
  delete cleaned.seedTool;

  return cleaned;
}

function buildTargetAssignmentWrite(params) {
  const { plan, schoolTitle, teacher, targetRole, pattern, now } = params;

  const planId = asString(plan.id);
  const targetId = targetAssignmentId(planId, teacher.personId);

  return {
    id: targetId,
    orgId: ORG_ID,

    schoolId: asString(plan.schoolId),
    schoolTitle,

    academicYearId: YEAR_ID,
    termId: TERM_ID,

    planId,
    planTitle: asString(plan.title),
    frameworkId: asString(plan.frameworkId),

    targetKind: "TEACHER",
    targetPersonId: teacher.personId,
    targetUid: asString(teacher.uid),
    targetEmail: asString(teacher.email),
    targetDisplayName: asString(teacher.displayName, teacher.personId),
    targetRoleKey:
      asString(targetRole.targetRoleKey) ||
      asString(pattern.targetRoleKey) ||
      asString(teacher.roleKey) ||
      "TEACHER",
    targetRoleLabel:
      asString(targetRole.targetRoleLabel) ||
      asString(pattern.targetRoleLabel) ||
      "معلم/معلمة",

    status: "ACTIVE",

    createdBySupervisorAddTool: true,
    seedTool: "add-teacher-to-supervisor-evaluations.cjs",

    createdAt: now,
    updatedAt: now,
  };
}

function buildEvaluatorAssignmentWrite(params) {
  const {
    plan,
    cycle,
    pattern,
    teacher,
    supervisor,
    schoolTitle,
    targetRole,
    newAssignmentId,
    now,
  } = params;

  const base = cleanForCopy(pattern);
  const planId = asString(plan.id);

  return {
    ...base,

    id: newAssignmentId,
    orgId: ORG_ID,

    schoolId: asString(plan.schoolId),
    schoolTitle,

    academicYearId: YEAR_ID,
    termId: TERM_ID,

    planId,
    planTitle: asString(plan.title),
    displayTitle: asString(pattern.displayTitle, asString(plan.title)),
    evaluatorDisplayTitle: asString(
      pattern.evaluatorDisplayTitle,
      asString(plan.title),
    ),

    frameworkId: asString(plan.frameworkId),
    frameworkTitle: asString(pattern.frameworkTitle),

    cycleId: asString(cycle.id),
    cycleTitle: asString(cycle.title, asString(cycle.shortTitle, "دورة تقييم")),

    targetAssignmentId: targetAssignmentId(planId, teacher.personId),
    targetKind: "TEACHER",
    targetPersonId: teacher.personId,
    targetUid: asString(teacher.uid),
    targetEmail: asString(teacher.email),
    targetDisplayName: asString(teacher.displayName, teacher.personId),
    targetRoleKey:
      asString(targetRole.targetRoleKey) ||
      asString(pattern.targetRoleKey) ||
      asString(teacher.roleKey) ||
      "TEACHER",
    targetRoleLabel:
      asString(targetRole.targetRoleLabel) ||
      asString(pattern.targetRoleLabel) ||
      "معلم/معلمة",

    evaluatorUid: asString(supervisor.uid, asString(pattern.evaluatorUid)),
    evaluatorPersonId: supervisor.personId,
    evaluatorEmail: asString(
      supervisor.email,
      asString(pattern.evaluatorEmail),
    ),
    evaluatorDisplayName: asString(
      supervisor.displayName,
      asString(pattern.evaluatorDisplayName),
    ),
    evaluatorRoleKey:
      asString(supervisor.roleKey) ||
      asString(pattern.evaluatorRoleKey) ||
      "EDU_SUPERVISOR",
    evaluatorRoleLabel: asString(pattern.evaluatorRoleLabel, "مشرف تعليمي"),

    weight: 100,
    status: "ACTIVE",

    createdBySupervisorAddTool: true,
    seedTool: "add-teacher-to-supervisor-evaluations.cjs",

    createdAt: now,
    updatedAt: now,
  };
}

function countByStatus(rows) {
  return rows.reduce(
    (acc, row) => {
      const status = normalizeStatus(row.status) || "UNKNOWN";
      acc.total += 1;
      acc.byStatus[status] = (acc.byStatus[status] || 0) + 1;
      return acc;
    },
    { total: 0, byStatus: {} },
  );
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
  requireArgs();

  console.log(APPLY ? "APPLY mode" : "Preview mode - no writes");

  const orgRef = db.collection("orgs").doc(ORG_ID);
  const now = Date.now();

  const [teacher, supervisor] = await Promise.all([
    resolvePerson({
      personId: TEACHER_PERSON_ID,
      email: TEACHER_EMAIL,
      roleFallback: "TEACHER",
    }),
    resolvePerson({
      personId: SUPERVISOR_PERSON_ID,
      email: SUPERVISOR_EMAIL,
      roleFallback: "EDU_SUPERVISOR",
    }),
  ]);

  const conflicts = [];
  const warnings = [];

  if (!teacher) {
    conflicts.push({
      reason: "TEACHER_NOT_FOUND",
      teacherPersonId: TEACHER_PERSON_ID,
      teacherEmail: TEACHER_EMAIL,
    });
  }

  if (!supervisor) {
    conflicts.push({
      reason: "SUPERVISOR_NOT_FOUND",
      supervisorPersonId: SUPERVISOR_PERSON_ID,
      supervisorEmail: SUPERVISOR_EMAIL,
    });
  }

  const [
    plans,
    frameworks,
    cycles,
    targetAssignments,
    evaluatorAssignments,
    submissions,
  ] = await Promise.all([
    getCollectionRows(orgRef, "evaluationPlans"),
    getCollectionRows(orgRef, "evaluationFrameworks"),
    getCollectionRows(orgRef, "evaluationCycles"),
    getCollectionRows(orgRef, "evaluationTargetAssignments"),
    getCollectionRows(orgRef, "evaluationEvaluatorAssignments"),
    getCollectionRows(orgRef, "evaluationSubmissions"),
  ]);

  const frameworksById = new Map(
    frameworks.map((framework) => [framework.id, framework]),
  );
  const plansById = new Map(plans.map((plan) => [plan.id, plan]));

  const teacherActiveTargetAssignments = teacher
    ? targetAssignments
        .filter((row) => asString(row.targetPersonId) === teacher.personId)
        .filter((row) => asString(row.academicYearId, YEAR_ID) === YEAR_ID)
        .filter((row) => asString(row.termId, TERM_ID) === TERM_ID)
        .filter(isActive)
    : [];

  const teacherSchoolIds = new Set(
    teacherActiveTargetAssignments
      .map((row) => asString(row.schoolId))
      .filter(Boolean),
  );

  const supervisorPatternAssignments = supervisor
    ? evaluatorAssignments
        .filter(
          (row) => asString(row.evaluatorPersonId) === supervisor.personId,
        )
        .filter((row) => asString(row.academicYearId, YEAR_ID) === YEAR_ID)
        .filter((row) => asString(row.termId, TERM_ID) === TERM_ID)

        .filter(isActive)
    : [];

  const supervisorPatternSchoolIds = new Set(
    supervisorPatternAssignments
      .map((row) => asString(row.schoolId))
      .filter(Boolean),
  );

  let selectedSchoolIds = [];

  if (SCHOOL_ID_ARG) {
    selectedSchoolIds = [SCHOOL_ID_ARG];
  } else {
    selectedSchoolIds = Array.from(teacherSchoolIds).filter((schoolId) =>
      supervisorPatternSchoolIds.has(schoolId),
    );

    if (
      selectedSchoolIds.length === 0 &&
      supervisorPatternSchoolIds.size === 1
    ) {
      selectedSchoolIds = Array.from(supervisorPatternSchoolIds);
      warnings.push({
        reason: "SCHOOL_INFERRED_FROM_SUPERVISOR_ONLY",
        selectedSchoolIds,
        note: "لم أجد تقاطعًا واضحًا بين مدارس المعلم وأنماط المشرف، فاخترت مدرسة المشرف الوحيدة.",
      });
    }
  }

  if (selectedSchoolIds.length === 0) {
    conflicts.push({
      reason: "COULD_NOT_INFER_SCHOOL",
      teacherSchools: Array.from(teacherSchoolIds),
      supervisorPatternSchools: Array.from(supervisorPatternSchoolIds),
      note: "أعد التشغيل مع --school schoolId",
    });
  }

  if (selectedSchoolIds.length > 1) {
    conflicts.push({
      reason: "MULTIPLE_POSSIBLE_SCHOOLS",
      selectedSchoolIds,
      note: "أعد التشغيل مع --school schoolId لتحديد المدرسة المطلوبة.",
    });
  }

  const schoolId = selectedSchoolIds[0] || "";
  const schoolTitle = schoolId ? await getSchoolTitle(orgRef, schoolId) : "";

  let targetPlans;

  if (PLAN_ID_ARG) {
    const explicitPlan = plans.find(
      (plan) => asString(plan.id) === PLAN_ID_ARG,
    );

    if (!explicitPlan) {
      conflicts.push({
        reason: "EXPLICIT_PLAN_NOT_FOUND",
        planId: PLAN_ID_ARG,
      });

      targetPlans = [];
    } else if (asString(explicitPlan.schoolId) !== schoolId) {
      conflicts.push({
        reason: "EXPLICIT_PLAN_SCHOOL_MISMATCH",
        planId: PLAN_ID_ARG,
        planSchoolId: asString(explicitPlan.schoolId),
        requestedSchoolId: schoolId,
      });

      targetPlans = [];
    } else if (!isActive(explicitPlan)) {
      conflicts.push({
        reason: "EXPLICIT_PLAN_NOT_ACTIVE",
        planId: PLAN_ID_ARG,
        status: explicitPlan.status,
        isActive: explicitPlan.isActive,
      });

      targetPlans = [];
    } else if (!isTeacherPlan(explicitPlan)) {
      conflicts.push({
        reason: "EXPLICIT_PLAN_IS_NOT_TEACHER_PLAN",
        planId: PLAN_ID_ARG,
        targetKind: explicitPlan.targetKind,
      });

      targetPlans = [];
    } else {
      const framework = frameworksById.get(asString(explicitPlan.frameworkId));

      if (!isFrameworkActive(framework)) {
        conflicts.push({
          reason: "EXPLICIT_PLAN_FRAMEWORK_NOT_ACTIVE",
          planId: PLAN_ID_ARG,
          frameworkId: asString(explicitPlan.frameworkId),
          frameworkStatus: framework?.status,
          frameworkIsActive: framework?.isActive,
        });

        targetPlans = [];
      } else {
        const activePatternsForPlan = supervisorPatternAssignments.filter(
          (assignment) =>
            asString(assignment.planId) === PLAN_ID_ARG &&
            asString(assignment.schoolId) === schoolId &&
            asString(assignment.evaluatorPersonId) === supervisor.personId &&
            isActive(assignment),
        );

        if (activePatternsForPlan.length === 0) {
          conflicts.push({
            reason: "NO_ACTIVE_SUPERVISOR_PATTERN_FOR_EXPLICIT_PLAN",
            planId: PLAN_ID_ARG,
            supervisorPersonId: supervisor.personId,
          });

          targetPlans = [];
        } else {
          targetPlans = [explicitPlan];
        }
      }
    }
  } else {
    targetPlans = uniqueBy(
      supervisorPatternAssignments
        .filter((assignment) => asString(assignment.schoolId) === schoolId)
        .map((assignment) => plansById.get(asString(assignment.planId)))
        .filter(Boolean)
        .filter((plan) => asString(plan.schoolId) === schoolId)
        .filter((plan) => asString(plan.academicYearId, YEAR_ID) === YEAR_ID)
        .filter((plan) => asString(plan.termId, TERM_ID) === TERM_ID)
        .filter(isActive)
        .filter(isTeacherPlan)
        .filter((plan) => {
          const framework = frameworksById.get(asString(plan.frameworkId));

          return isFrameworkActive(framework);
        }),
      (plan) => asString(plan.id),
    ).sort((a, b) => asString(a.id).localeCompare(asString(b.id)));
  }

  // if (schoolId && targetPlans.length === 0) {
  //   conflicts.push({
  //     reason: "NO_ACTIVE_TEACHER_PLANS_FOR_SUPERVISOR_IN_SCHOOL",
  //     schoolId,
  //     supervisorPersonId: supervisor?.personId,
  //     supervisorEmail: supervisor?.email,
  //   });
  // }

  if (!PLAN_ID_ARG && schoolId && targetPlans.length === 0) {
    conflicts.push({
      reason: "NO_ACTIVE_TEACHER_PLANS_FOR_SUPERVISOR_IN_SCHOOL",
      schoolId,
      supervisorPersonId: supervisor?.personId,
      supervisorEmail: supervisor?.email,
    });
  }

  const newTargetWrites = [];
  const newEvaluatorWrites = [];
  const skippedExistingEvaluatorAssignments = [];
  const planReports = [];

  const existingActiveEvaluatorKeys = new Set(
    evaluatorAssignments
      .filter(isActive)
      .map((assignment) =>
        [
          asString(assignment.planId),
          asString(assignment.cycleId),
          asString(assignment.targetPersonId),
          asString(assignment.evaluatorPersonId),
        ].join("__"),
      ),
  );

  const teacherTargetRoleBySchool = new Map();

  for (const target of teacherActiveTargetAssignments) {
    const targetSchoolId = asString(target.schoolId);

    if (!teacherTargetRoleBySchool.has(targetSchoolId)) {
      teacherTargetRoleBySchool.set(targetSchoolId, {
        targetRoleKey: asString(target.targetRoleKey),
        targetRoleLabel: asString(target.targetRoleLabel),
      });
    }
  }

  for (const plan of targetPlans) {
    const planId = asString(plan.id);

    const planCycles = sortByCycle(
      cycles
        .filter((cycle) => asString(cycle.planId) === planId)
        .filter((cycle) => asString(cycle.academicYearId, YEAR_ID) === YEAR_ID)
        .filter((cycle) => asString(cycle.termId, TERM_ID) === TERM_ID)
        .filter(isUsableCycle),
    );

    if (planCycles.length === 0) {
      conflicts.push({
        reason: "NO_USABLE_CYCLES_FOR_PLAN",
        planId,
        title: asString(plan.title),
      });
      continue;
    }

    const targetRole = teacherTargetRoleBySchool.get(schoolId) || {};

    let firstPattern = null;
    const cycleReports = [];

    for (const cycle of planCycles) {
      const sameCyclePatterns = uniqueBy(
        supervisorPatternAssignments
          .filter((assignment) => asString(assignment.schoolId) === schoolId)
          .filter((assignment) => asString(assignment.planId) === planId)
          .filter(
            (assignment) => asString(assignment.cycleId) === asString(cycle.id),
          )
          .filter(
            (assignment) =>
              asString(assignment.targetPersonId) !== teacher.personId,
          )
          .filter(isActive),
        (assignment) =>
          [
            asString(assignment.evaluatorPersonId),
            asString(assignment.evaluatorRoleKey),
            asString(assignment.evaluatorEmail),
          ].join("__"),
      );

      let patterns = sameCyclePatterns;
      let patternSource = "SAME_PLAN_SAME_CYCLE";

      if (patterns.length === 0) {
        patternSource = "SAME_PLAN_ANY_CYCLE";

        patterns = uniqueBy(
          supervisorPatternAssignments
            .filter((assignment) => asString(assignment.schoolId) === schoolId)
            .filter((assignment) => asString(assignment.planId) === planId)
            .filter(
              (assignment) =>
                asString(assignment.targetPersonId) !== teacher.personId,
            )
            .filter(isActive),
          (assignment) =>
            [
              asString(assignment.evaluatorPersonId),
              asString(assignment.evaluatorRoleKey),
              asString(assignment.evaluatorEmail),
            ].join("__"),
        );
      }

      if (patterns.length === 0) {
        conflicts.push({
          reason: "NO_PATTERN_FOR_PLAN_CYCLE",
          planId,
          cycleId: asString(cycle.id),
          supervisorPersonId: supervisor.personId,
          title: asString(plan.title),
        });
        continue;
      }

      if (!firstPattern) {
        firstPattern = patterns[0];
      }

      const evaluatorReports = [];

      for (const pattern of patterns) {
        const key = [
          planId,
          asString(cycle.id),
          teacher.personId,
          supervisor.personId,
        ].join("__");

        if (existingActiveEvaluatorKeys.has(key)) {
          skippedExistingEvaluatorAssignments.push({
            planId,
            cycleId: asString(cycle.id),
            targetPersonId: teacher.personId,
            evaluatorPersonId: supervisor.personId,
          });

          evaluatorReports.push({
            action: "SKIP_EXISTING",
            cycleId: asString(cycle.id),
            evaluatorPersonId: supervisor.personId,
          });

          continue;
        }

        const newAssignmentId = buildEvaluatorAssignmentIdFromPattern({
          pattern,
          teacherPersonId: teacher.personId,
          planId,
          cycleId: asString(cycle.id),
          supervisorPersonId: supervisor.personId,
        });

        newEvaluatorWrites.push({
          ref: orgRef
            .collection("evaluationEvaluatorAssignments")
            .doc(newAssignmentId),
          data: buildEvaluatorAssignmentWrite({
            plan,
            cycle,
            pattern,
            teacher,
            supervisor,
            schoolTitle,
            targetRole,
            newAssignmentId,
            now,
          }),
        });

        evaluatorReports.push({
          action: "CREATE_OR_UPDATE",
          assignmentId: newAssignmentId,
          cycleId: asString(cycle.id),
          evaluatorPersonId: supervisor.personId,
          evaluatorEmail: supervisor.email,
          evaluatorDisplayName: supervisor.displayName,
          patternId: asString(pattern.id),
          patternTargetPersonId: asString(pattern.targetPersonId),
          patternTargetDisplayName: asString(pattern.targetDisplayName),
          patternSource,
        });
      }

      cycleReports.push({
        cycleId: asString(cycle.id),
        cycleTitle: asString(cycle.title, asString(cycle.shortTitle)),
        patternSource,
        evaluatorReports,
      });
    }

    if (!firstPattern) {
      continue;
    }

    const newTargetId = targetAssignmentId(planId, teacher.personId);

    newTargetWrites.push({
      ref: orgRef.collection("evaluationTargetAssignments").doc(newTargetId),
      data: buildTargetAssignmentWrite({
        plan,
        schoolTitle,
        teacher,
        targetRole,
        pattern: firstPattern,
        now,
      }),
    });

    planReports.push({
      planId,
      title: asString(plan.title),
      frameworkId: asString(plan.frameworkId),
      cyclesCount: planCycles.length,
      newTargetId,
      cycleReports,
    });
  }

  /*
   * Rebalance evaluator weights for the teacher.
   *
   * Every active evaluator assignment for the same:
   * planId + cycleId + targetPersonId
   *
   * must total exactly 100.
   */

  const weightRebalanceWrites = [];
  const weightRebalanceReports = [];

  if (teacher && schoolId) {
    const existingTeacherAssignments = evaluatorAssignments
      .filter((assignment) => asString(assignment.schoolId) === schoolId)
      .filter(
        (assignment) =>
          asString(assignment.targetPersonId) === teacher.personId,
      )
      .filter(
        (assignment) =>
          asString(assignment.academicYearId, YEAR_ID) === YEAR_ID,
      )
      .filter((assignment) => asString(assignment.termId, TERM_ID) === TERM_ID)
      .filter(isActive);

    /*
     * Combine:
     * - existing active assignments
     * - assignments that this script is about to create
     */
    const assignmentMap = new Map();

    for (const assignment of existingTeacherAssignments) {
      assignmentMap.set(asString(assignment.id), {
        source: "EXISTING",
        id: asString(assignment.id),
        ref: assignment.ref,
        data: assignment,
      });
    }

    for (const write of newEvaluatorWrites) {
      const id = asString(write.data.id);

      assignmentMap.set(id, {
        source: "NEW",
        id,
        ref: write.ref,
        data: write.data,
        write,
      });
    }

    const groups = new Map();

    for (const entry of assignmentMap.values()) {
      const data = entry.data;

      const key = [
        asString(data.planId),
        asString(data.cycleId),
        asString(data.targetPersonId),
      ].join("__");

      const current = groups.get(key);

      if (current) {
        current.push(entry);
      } else {
        groups.set(key, [entry]);
      }
    }

    for (const [groupKey, entries] of groups.entries()) {
      /*
       * Stable ordering makes Preview / Apply deterministic.
       */
      entries.sort((a, b) => {
        return asString(a.data.evaluatorPersonId).localeCompare(
          asString(b.data.evaluatorPersonId),
        );
      });

      const weights = buildBalancedWeights(entries.length);

      const targetTotal = Number(
        weights.reduce((sum, value) => sum + value, 0).toFixed(3),
      );

      if (targetTotal !== 100) {
        conflicts.push({
          reason: "CALCULATED_EVALUATOR_WEIGHT_TOTAL_NOT_100",
          groupKey,
          evaluatorCount: entries.length,
          targetTotal,
        });

        continue;
      }

      const evaluatorReports = [];

      entries.forEach((entry, index) => {
        const newWeight = weights[index];
        const oldWeight = asNumber(entry.data.weight, 100);

        evaluatorReports.push({
          assignmentId: entry.id,
          source: entry.source,
          evaluatorPersonId: asString(entry.data.evaluatorPersonId),
          evaluatorEmail: asString(entry.data.evaluatorEmail),
          evaluatorDisplayName: asString(entry.data.evaluatorDisplayName),
          oldWeight,
          newWeight,
        });

        /*
         * New assignment:
         * modify its pending write directly.
         */
        if (entry.source === "NEW") {
          entry.write.data.weight = newWeight;
          entry.write.data.weightRebalancedAt = now;
          entry.write.data.weightRebalanceTool =
            "add-teacher-to-supervisor-evaluations.cjs";

          return;
        }

        /*
         * Existing assignment:
         * only write if its weight actually changes.
         */
        if (oldWeight !== newWeight) {
          weightRebalanceWrites.push({
            ref: entry.ref,
            data: {
              weight: newWeight,
              updatedAt: now,
              weightRebalancedAt: now,
              weightRebalanceTool: "add-teacher-to-supervisor-evaluations.cjs",
            },
          });
        }
      });

      weightRebalanceReports.push({
        groupKey,
        planId: asString(entries[0]?.data.planId),
        cycleId: asString(entries[0]?.data.cycleId),
        targetPersonId: teacher.personId,
        evaluatorCount: entries.length,
        targetWeightTotal: targetTotal,
        evaluators: evaluatorReports,
      });
    }
  }

  const matchingSubmissions = teacher
    ? submissions
        .filter(
          (submission) =>
            asString(submission.targetPersonId) === teacher.personId,
        )
        .filter(
          (submission) =>
            asString(submission.evaluatorPersonId) === supervisor?.personId,
        )
    : [];

  const allWrites = [
    ...newTargetWrites,
    ...newEvaluatorWrites,
    ...weightRebalanceWrites,
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
      teacherPersonId: TEACHER_PERSON_ID,
      teacherEmail: TEACHER_EMAIL,
      supervisorPersonId: SUPERVISOR_PERSON_ID,
      supervisorEmail: SUPERVISOR_EMAIL,
      schoolArg: SCHOOL_ID_ARG,
      planIdArg: PLAN_ID_ARG,
    },

    teacher,
    supervisor,

    selectedSchool: {
      schoolId,
      schoolTitle,
    },

    currentState: {
      teacherActiveTargetAssignments: teacherActiveTargetAssignments.length,
      teacherSchools: Array.from(teacherSchoolIds),
      supervisorPatternAssignments: supervisorPatternAssignments.length,
      supervisorPatternSchools: Array.from(supervisorPatternSchoolIds),
      existingTeacherSupervisorSubmissions: countByStatus(matchingSubmissions),
    },

    targetPlans: {
      count: targetPlans.length,
      plans: targetPlans.map((plan) => ({
        id: plan.id,
        title: plan.title || "",
        frameworkId: plan.frameworkId || "",
      })),
    },

    plannedChanges: {
      createOrUpdateTargetAssignments: newTargetWrites.length,
      createOrUpdateEvaluatorAssignments: newEvaluatorWrites.length,
      rebalanceExistingEvaluatorWeights: weightRebalanceWrites.length,
      skippedExistingEvaluatorAssignments:
        skippedExistingEvaluatorAssignments.length,
      totalWrites: allWrites.length,
    },

    planReports,
    weightRebalanceReports,
    skippedExistingEvaluatorAssignments,

    warnings,
    conflicts,

    safety: {
      deletes: 0,
      submissionsTouched: 0,
      otherSupervisorsTouched: 0,
      existingEvaluatorAssignmentsOnlyTouchedForWeightRebalance:
        weightRebalanceWrites.length,
      requiresApplyFlag: true,
    },
  };

  const reportPath = writeJsonReport(report);

  console.dir(
    {
      decision: report.decision,
      mode: report.mode,
      reportPath,
      teacher: report.teacher,
      supervisor: report.supervisor,
      selectedSchool: report.selectedSchool,
      targetPlansCount: report.targetPlans.count,
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
    console.log(
      "Run again with --apply to add the teacher to this supervisor.",
    );
    return;
  }

  const committed = await commitInChunks(allWrites);

  const applyResult = {
    decision: "APPLIED",
    committedWrites: committed,
    createdOrUpdatedTargetAssignments: newTargetWrites.length,
    createdOrUpdatedEvaluatorAssignments: newEvaluatorWrites.length,
    existingEvaluatorWeightsRebalanced: weightRebalanceWrites.length,
    skippedExistingEvaluatorAssignments:
      skippedExistingEvaluatorAssignments.length,
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
  console.error("Add teacher to supervisor failed:", error);
  process.exit(1);
});
