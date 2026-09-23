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
const CYCLE_COUNT = Number(getArg("count", "9"));

const FRAMEWORK_ID = "kg-vp-class-teacher-biweekly-evaluation-v1";

const FRAMEWORK_TITLE = "تقييم وكيلة الروضة لمعلمة الصف - كل أسبوعين";

const KG_SCHOOLS = ["kg-01", "kg-02", "kg-03", "kg-04"];

const KG_VP_PERSON_IDS = {
  "kg-01": "staff-ms10LdA0k5TVkiJo4VO6pprmcOh2",
  "kg-02": "p-h-aljower",
  "kg-03": "p-s-alslman",
  "kg-04": "p-h-alshaya",
};

const ITEMS = [
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
];

const REPORTS_DIR = path.resolve("scripts/evaluation-tools/reports");

function text(value, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function normalizeStatus(value) {
  return String(value || "")
    .trim()
    .toUpperCase();
}

function isActive(row) {
  return normalizeStatus(row?.status) === "ACTIVE";
}

function isUsableCycle(row) {
  const status = normalizeStatus(row?.status);
  return status === "OPEN" || status === "ACTIVE" || !status;
}

function safe(value) {
  return String(value || "")
    .replace(/[^a-zA-Z0-9\u0600-\u06FF._-]+/g, "-")
    .replace(/-+/g, "-");
}

async function rows(orgRef, collectionName) {
  const snap = await orgRef.collection(collectionName).get();

  return snap.docs.map((doc) => ({
    id: doc.id,
    ref: doc.ref,
    ...doc.data(),
  }));
}

async function schoolTitle(orgRef, schoolId) {
  const snap = await orgRef.collection("schools").doc(schoolId).get();

  if (!snap.exists) return schoolId;

  const row = snap.data();

  return text(row.title) || text(row.name) || text(row.displayName) || schoolId;
}

function newPlanId(schoolId) {
  return `${schoolId}-${YEAR_ID}-${TERM_ID}-vp-class-teacher-biweekly-evaluation`;
}

function newCycleId(planId, number) {
  return `${planId}-period-${String(number).padStart(2, "0")}`;
}

function cycleTitle(number) {
  return `المتابعة ${number}`;
}

function targetAssignmentId(planId, personId) {
  return `${planId}-target-${personId}`;
}

function evaluatorAssignmentId(
  planId,
  cycleId,
  targetPersonId,
  evaluatorPersonId,
) {
  return `${planId}-${cycleId}-${targetPersonId}-${evaluatorPersonId}`;
}

function clean(row) {
  const copy = { ...row };

  delete copy.id;
  delete copy.ref;
  delete copy.createdAt;
  delete copy.updatedAt;
  delete copy.removedAt;
  delete copy.removedReason;

  return copy;
}

function writeReport(report) {
  fs.mkdirSync(REPORTS_DIR, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");

  const mode = APPLY ? "apply" : "preview";

  const file = path.join(
    REPORTS_DIR,
    [timestamp, mode, "seed-kg-vp-class-teacher-biweekly-evaluation"].join(
      "__",
    ) + ".json",
  );

  fs.writeFileSync(file, JSON.stringify(report, null, 2), "utf8");

  return file;
}

async function commitInChunks(writes, size = 450) {
  let committed = 0;

  for (let i = 0; i < writes.length; i += size) {
    const batch = db.batch();
    const chunk = writes.slice(i, i + size);

    for (const write of chunk) {
      batch.set(write.ref, write.data, { merge: true });
    }

    await batch.commit();
    committed += chunk.length;
  }

  return committed;
}

async function main() {
  if (!Number.isInteger(CYCLE_COUNT) || CYCLE_COUNT < 1) {
    throw new Error("--count must be an integer >= 1");
  }

  console.log(APPLY ? "APPLY mode" : "Preview mode - no writes");

  const orgRef = db.collection("orgs").doc(ORG_ID);
  const now = Date.now();

  const [
    plans,
    targetAssignments,
    evaluatorAssignments,
    cycles,
    submissions,
    sections,
    rubricItems,
  ] = await Promise.all([
    rows(orgRef, "evaluationPlans"),
    rows(orgRef, "evaluationTargetAssignments"),
    rows(orgRef, "evaluationEvaluatorAssignments"),
    rows(orgRef, "evaluationCycles"),
    rows(orgRef, "evaluationSubmissions"),
    rows(orgRef, "evaluationRubricSections"),
    rows(orgRef, "evaluationRubricItems"),
  ]);

  const conflicts = [];
  const warnings = [];
  const writes = [];

  /*
   * -------------------------------------------------
   * Framework + Rubric
   * -------------------------------------------------
   */

  const frameworkRef = orgRef
    .collection("evaluationFrameworks")
    .doc(FRAMEWORK_ID);

  writes.push({
    ref: frameworkRef,
    data: {
      id: FRAMEWORK_ID,
      orgId: ORG_ID,

      title: FRAMEWORK_TITLE,
      shortTitle: FRAMEWORK_TITLE,

      targetKind: "TEACHER",
      targetRoleKeyHint: "KG_TEACHER",
      targetRoleLabel: "معلمة الصف",

      evaluatorRoleKey: "KG_VP",
      evaluatorRoleLabel: "وكيلة الروضة",

      schoolTypes: ["KG"],

      frequency: "BIWEEKLY",
      planKind: "PERIODIC",

      cycleCount: CYCLE_COUNT,
      maxCyclesPerTerm: CYCLE_COUNT,

      status: "ACTIVE",
      isActive: true,

      version: 1,

      createdAt: now,
      updatedAt: now,

      seedTool: "seed-kg-vp-class-teacher-biweekly-evaluation.cjs",
    },
  });

  const sectionId = `${FRAMEWORK_ID}-section-01`;

  writes.push({
    ref: orgRef.collection("evaluationRubricSections").doc(sectionId),

    data: {
      id: sectionId,
      orgId: ORG_ID,
      frameworkId: FRAMEWORK_ID,

      title: "متابعة معلمة الصف",
      order: 1,
      sequence: 1,
      weight: 100,

      createdAt: now,
      updatedAt: now,
    },
  });

  ITEMS.forEach((title, index) => {
    const number = index + 1;

    const itemId = `${FRAMEWORK_ID}-item-${String(number).padStart(2, "0")}`;

    writes.push({
      ref: orgRef.collection("evaluationRubricItems").doc(itemId),

      data: {
        id: itemId,
        orgId: ORG_ID,
        frameworkId: FRAMEWORK_ID,
        sectionId,

        title,
        order: number,
        sequence: number,

        /*
         * نستخدم تقييمًا خماسيًا مثل بقية التقييمات المعتادة.
         */
        maxScore: 5,
        weight: 1,

        createdAt: now,
        updatedAt: now,
      },
    });
  });

  const schoolReports = [];

  /*
   * -------------------------------------------------
   * School by school
   * -------------------------------------------------
   */

  for (const schoolId of KG_SCHOOLS) {
    const title = await schoolTitle(orgRef, schoolId);

    /*
     * نبحث عن خطة الوكيلة الحالية لمعلمة الصف.
     * هذه هي الـ source of truth لمعلمات الصف الفعليات.
     */
    const sourcePlans = plans.filter((plan) => {
      const id = text(plan.id);

      return (
        text(plan.schoolId) === schoolId &&
        text(plan.academicYearId, YEAR_ID) === YEAR_ID &&
        text(plan.termId, TERM_ID) === TERM_ID &&
        isActive(plan) &&
        (id.includes("vice-principal-class-teacher") ||
          id.includes("class-teacher"))
      );
    });

    const sourcePlanIds = new Set(sourcePlans.map((plan) => text(plan.id)));

    /*
     * فقط Target Assignments التي اسم دورها معلمة الصف.
     * هذا مهم لأن KG_TEACHER يُستخدم أيضًا لمعلمة القيم.
     */
    const classTeacherTargets = targetAssignments.filter(
      (row) =>
        text(row.schoolId) === schoolId &&
        sourcePlanIds.has(text(row.planId)) &&
        text(row.targetRoleLabel) === "معلمة الصف" &&
        isActive(row),
    );

    const teachersMap = new Map();

    for (const row of classTeacherTargets) {
      const personId = text(row.targetPersonId);

      if (!personId || teachersMap.has(personId)) continue;

      teachersMap.set(personId, row);
    }

    const teachers = Array.from(teachersMap.values());

    /*
     * نأخذ Pattern للوكيلة من evaluator assignments
     * الخاصة بخطط معلمة الصف نفسها.
     */
    const vpPersonId = KG_VP_PERSON_IDS[schoolId];

    if (!vpPersonId) {
      conflicts.push({
        reason: "KG_VP_PERSON_ID_NOT_CONFIGURED",
        schoolId,
      });

      continue;
    }

    const vpPatterns = evaluatorAssignments.filter(
      (row) =>
        text(row.schoolId) === schoolId &&
        sourcePlanIds.has(text(row.planId)) &&
        text(row.targetRoleLabel) === "معلمة الصف" &&
        text(row.evaluatorPersonId) === vpPersonId &&
        isActive(row),
    );

    if (teachers.length === 0) {
      conflicts.push({
        reason: "NO_ACTIVE_CLASS_TEACHERS_FOUND",
        schoolId,
      });

      continue;
    }

    if (vpPatterns.length === 0) {
      conflicts.push({
        reason: "NO_ACTIVE_VP_PATTERN_FOUND",
        schoolId,
      });

      continue;
    }

    if (vpPatterns.length === 0) {
      conflicts.push({
        reason: "NO_ACTIVE_VP_PATTERN_FOUND",
        schoolId,
        evaluatorPersonId: vpPersonId,
      });

      continue;
    }

    const evaluatorPattern = vpPatterns[0];
    const evaluatorPersonId = vpPersonId;

    const planId = newPlanId(schoolId);

    writes.push({
      ref: orgRef.collection("evaluationPlans").doc(planId),

      data: {
        id: planId,
        orgId: ORG_ID,

        schoolId,
        schoolTitle: title,

        academicYearId: YEAR_ID,
        termId: TERM_ID,

        frameworkId: FRAMEWORK_ID,

        title: `${FRAMEWORK_TITLE} - ${title} - الفصل الأول`,

        shortTitle: FRAMEWORK_TITLE,

        targetKind: "TEACHER",
        targetRoleKey: "KG_TEACHER",
        targetRoleLabel: "معلمة الصف",

        evaluatorRoleKey: "KG_VP",
        evaluatorRoleLabel: "وكيلة الروضة",

        frequency: "BIWEEKLY",
        planKind: "PERIODIC",

        cycleCount: CYCLE_COUNT,
        maxCyclesPerTerm: CYCLE_COUNT,

        status: "ACTIVE",
        isActive: true,

        createdAt: now,
        updatedAt: now,

        seedTool: "seed-kg-vp-class-teacher-biweekly-evaluation.cjs",
      },
    });

    /*
     * Target assignments
     */
    for (const teacher of teachers) {
      const targetId = targetAssignmentId(planId, text(teacher.targetPersonId));

      writes.push({
        ref: orgRef.collection("evaluationTargetAssignments").doc(targetId),

        data: {
          ...clean(teacher),

          id: targetId,
          orgId: ORG_ID,

          schoolId,
          schoolTitle: title,

          academicYearId: YEAR_ID,
          termId: TERM_ID,

          planId,
          planTitle: `${FRAMEWORK_TITLE} - ${title} - الفصل الأول`,

          frameworkId: FRAMEWORK_ID,

          targetKind: "TEACHER",

          targetRoleKey: "KG_TEACHER",
          targetRoleLabel: "معلمة الصف",

          status: "ACTIVE",

          createdAt: now,
          updatedAt: now,

          seedTool: "seed-kg-vp-class-teacher-biweekly-evaluation.cjs",
        },
      });
    }

    /*
     * Cycles + evaluator assignments
     */
    for (let cycleNumber = 1; cycleNumber <= CYCLE_COUNT; cycleNumber += 1) {
      const cycleId = newCycleId(planId, cycleNumber);

      writes.push({
        ref: orgRef.collection("evaluationCycles").doc(cycleId),

        data: {
          id: cycleId,
          orgId: ORG_ID,

          schoolId,
          schoolTitle: title,

          academicYearId: YEAR_ID,
          termId: TERM_ID,

          planId,
          planTitle: `${FRAMEWORK_TITLE} - ${title} - الفصل الأول`,

          frameworkId: FRAMEWORK_ID,

          title: cycleTitle(cycleNumber),
          shortTitle: cycleTitle(cycleNumber),

          order: cycleNumber,
          sequence: cycleNumber,
          cycleNumber,

          status: "OPEN",

          createdAt: now,
          updatedAt: now,

          seedTool: "seed-kg-vp-class-teacher-biweekly-evaluation.cjs",
        },
      });

      for (const teacher of teachers) {
        const targetPersonId = text(teacher.targetPersonId);

        const assignmentId = evaluatorAssignmentId(
          planId,
          cycleId,
          targetPersonId,
          evaluatorPersonId,
        );

        writes.push({
          ref: orgRef
            .collection("evaluationEvaluatorAssignments")
            .doc(assignmentId),

          data: {
            ...clean(evaluatorPattern),

            id: assignmentId,
            orgId: ORG_ID,

            schoolId,
            schoolTitle: title,

            academicYearId: YEAR_ID,
            termId: TERM_ID,

            planId,
            planTitle: `${FRAMEWORK_TITLE} - ${title} - الفصل الأول`,

            frameworkId: FRAMEWORK_ID,
            frameworkTitle: FRAMEWORK_TITLE,

            cycleId,
            cycleTitle: cycleTitle(cycleNumber),

            targetAssignmentId: targetAssignmentId(planId, targetPersonId),

            targetKind: "TEACHER",

            targetPersonId,
            targetUid: text(teacher.targetUid),
            targetEmail: text(teacher.targetEmail),
            targetDisplayName: text(teacher.targetDisplayName),

            targetRoleKey: "KG_TEACHER",
            targetRoleLabel: "معلمة الصف",

            evaluatorPersonId,
            evaluatorUid: text(evaluatorPattern.evaluatorUid),
            evaluatorEmail: text(evaluatorPattern.evaluatorEmail),
            evaluatorDisplayName: text(evaluatorPattern.evaluatorDisplayName),

            evaluatorRoleKey: text(evaluatorPattern.evaluatorRoleKey, "KG_VP"),

            evaluatorRoleLabel: text(
              evaluatorPattern.evaluatorRoleLabel,
              "وكيلة الروضة",
            ),

            weight: 100,
            status: "ACTIVE",

            createdAt: now,
            updatedAt: now,

            seedTool: "seed-kg-vp-class-teacher-biweekly-evaluation.cjs",
          },
        });
      }
    }

    schoolReports.push({
      schoolId,
      schoolTitle: title,

      sourcePlans: sourcePlans.map((plan) => ({
        id: plan.id,
        title: plan.title || "",
      })),

      classTeachersCount: teachers.length,

      classTeachers: teachers.map((teacher) => ({
        personId: teacher.targetPersonId,
        displayName: teacher.targetDisplayName,
      })),

      evaluator: {
        personId: evaluatorPersonId,
        displayName: evaluatorPattern.evaluatorDisplayName || "",
        email: evaluatorPattern.evaluatorEmail || "",
      },

      newPlanId: planId,
      cycles: CYCLE_COUNT,

      evaluatorAssignments: teachers.length * CYCLE_COUNT,
    });
  }

  /*
   * حماية من وجود submissions سابقة لنفس framework
   */
  const existingSubmissions = submissions.filter(
    (row) => text(row.frameworkId) === FRAMEWORK_ID,
  );

  if (existingSubmissions.length > 0) {
    conflicts.push({
      reason: "NEW_FRAMEWORK_ALREADY_HAS_SUBMISSIONS",
      submissionsCount: existingSubmissions.length,
    });
  }

  const report = {
    decision:
      conflicts.length > 0
        ? "STOPPED"
        : APPLY
          ? "READY_TO_APPLY"
          : "SAFE_PREVIEW",

    mode: APPLY ? "APPLY" : "PREVIEW",

    framework: {
      id: FRAMEWORK_ID,
      title: FRAMEWORK_TITLE,
      itemsCount: ITEMS.length,
      cyclesPerPlan: CYCLE_COUNT,
    },

    schoolsCount: schoolReports.length,

    schoolReports,

    plannedChanges: {
      totalWrites: writes.length,
      submissionsTouched: 0,
      existingPlansTouched: 0,
      existingCyclesTouched: 0,
      existingAssignmentsTouched: 0,
    },

    warnings,
    conflicts,
  };

  const reportPath = writeReport(report);

  console.dir(
    {
      decision: report.decision,
      mode: report.mode,
      reportPath,

      framework: report.framework,

      schools: schoolReports.map((school) => ({
        schoolId: school.schoolId,
        classTeachersCount: school.classTeachersCount,
        evaluator: school.evaluator,
        cycles: school.cycles,
        evaluatorAssignments: school.evaluatorAssignments,
      })),

      plannedChanges: report.plannedChanges,

      warningsCount: warnings.length,

      conflictsCount: conflicts.length,

      conflicts,
    },
    { depth: 20 },
  );

  if (conflicts.length > 0) {
    console.log("");
    console.log("Stopped. No writes performed.");
    process.exit(1);
  }

  if (!APPLY) {
    console.log("");
    console.log("No writes performed.");
    console.log("Review the JSON report before applying.");
    return;
  }

  const committed = await commitInChunks(writes);

  const applyResult = {
    decision: "APPLIED",
    committedWrites: committed,
    submissionsTouched: 0,
  };

  const applyReportPath = writeReport({
    ...report,
    applyResult,
  });

  console.dir({
    ...applyResult,
    applyReportPath,
  });
}

main().catch((error) => {
  console.error("Seed KG VP biweekly class teacher evaluation failed:", error);

  process.exit(1);
});
