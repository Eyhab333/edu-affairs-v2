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
const CYCLE_COUNT = Number(getArg("count", "3"));

const FRAMEWORK_ID =
  "kg-vp-values-teacher-evaluation-v1";

const FRAMEWORK_TITLE =
  "تقييم وكيلة الروضة لمعلمة القيم";

const KG_SCHOOLS = [
  "kg-01",
  "kg-02",
  "kg-03",
  "kg-04",
];

const KG_VP_PERSON_IDS = {
  "kg-01": "staff-ms10LdA0k5TVkiJo4VO6pprmcOh2",
  "kg-02": "p-h-aljower",
  "kg-03": "p-s-alslman",
  "kg-04": "p-h-alshaya",
};

const VALUES_TEACHER_PERSON_IDS = {
  "kg-01": "p-ma-alfarhod",
  "kg-02": "p-alanoodf",
  "kg-03": "p-ss-alfaleh",
  "kg-04": "p-s-bader",
};

const ITEMS = [
  "تقدر المسؤولية وتلتزم بأخلاقيات المهنة والتعليمات التنظيمية",
  "التمكن من المادة العلمية والقدرة على تحقيق أهدافها",
  "تمهد للدرس بشكل جذاب ومناسب (صورة، قصة وسؤال)",
  "عرض الدرس بطريقة متسلسلة ومشوقة ومترابطة",
  "ربط الدرس الجديد بالدرس السابق وفق الأهداف وخبرات الطلاب",
  "تثير تفكير الأطفال من خلال الأسئلة والمناقشة",
  "ربط القيم بخبرات الأطفال وبيئتهم",
  "استخدام استراتيجيات تعلم فعالة وتوظيف تقنيات التعلم",
  "تهيئة بيئة الصف قبل بدء الدرس (التنظيم)",
  "توظف استراتيجيات تربوية في معالجة سلوك المتعلمين تدعم اكتساب القيم والمبادئ",
  "المهارة في إدارة الصف",
  "الاهتمام بالتطور المهني والنمو المعرفي",
  "تحقيق أهداف الوحدة",
  "إثراء الحصيلة اللغوية لدى الطلاب",
  "تفعيل التقرير الختامي لكل وحدة",
  "تنويع الأسئلة ومشاركة الطلاب مع مراعاة الفروق الفردية",
  "الاهتمام بتفعيل ملف إنجاز المعلمة",
  "تحرص على متابعة الطفل في تطبيق القيم من الجانب العقدي والأخلاقي",
  "تقوم تعلم المتعلمين وتتابع تقدمهم بانتظام",
  "تنفيذ الأنشطة المدرسية واللاصفية والمبادرات",
  "تفعيل استمارة تقييم الطفل",
  "المساهمة في تدريب الزملاء تقنيًا",
  "تفعيل الزيارات المتبادلة",
  "متابعة تنفيذ مجتمعات التعلم المهنية",
  "تصمم أوراق عمل منوعة ومميزة تخدم القيم المقدمة للأطفال",
  "السلوك العام والقدوة الحسنة",
];

const REPORTS_DIR = path.resolve(
  "scripts/evaluation-tools/reports",
);

function text(value, fallback = "") {
  return typeof value === "string" && value.trim()
    ? value.trim()
    : fallback;
}

function normalizeStatus(value) {
  return String(value || "").trim().toUpperCase();
}

function isActive(row) {
  return normalizeStatus(row?.status) === "ACTIVE";
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

async function rows(orgRef, collectionName) {
  const snap = await orgRef.collection(collectionName).get();

  return snap.docs.map((doc) => ({
    id: doc.id,
    ref: doc.ref,
    ...doc.data(),
  }));
}

async function schoolTitle(orgRef, schoolId) {
  const snap = await orgRef
    .collection("schools")
    .doc(schoolId)
    .get();

  if (!snap.exists) return schoolId;

  const row = snap.data();

  return (
    text(row.title) ||
    text(row.name) ||
    text(row.displayName) ||
    schoolId
  );
}

function planIdFor(schoolId) {
  return `${schoolId}-${YEAR_ID}-${TERM_ID}-vp-values-teacher-evaluation`;
}

function cycleIdFor(planId, number) {
  return `${planId}-evaluation-${String(number).padStart(2, "0")}`;
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

function writeReport(report) {
  fs.mkdirSync(REPORTS_DIR, { recursive: true });

  const timestamp = new Date()
    .toISOString()
    .replace(/[:.]/g, "-");

  const mode = APPLY ? "apply" : "preview";

  const file = path.join(
    REPORTS_DIR,
    `${timestamp}__${mode}__seed-kg-vp-values-teacher-evaluation.json`,
  );

  fs.writeFileSync(
    file,
    JSON.stringify(report, null, 2),
    "utf8",
  );

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

  console.log(
    APPLY
      ? "APPLY mode"
      : "Preview mode - no writes",
  );

  const orgRef = db.collection("orgs").doc(ORG_ID);
  const now = Date.now();

  const [
    targetAssignments,
    evaluatorAssignments,
    submissions,
  ] = await Promise.all([
    rows(orgRef, "evaluationTargetAssignments"),
    rows(orgRef, "evaluationEvaluatorAssignments"),
    rows(orgRef, "evaluationSubmissions"),
  ]);

  const conflicts = [];
  const warnings = [];
  const writes = [];
  const schoolReports = [];

  /*
   * Framework
   */
  writes.push({
    ref: orgRef
      .collection("evaluationFrameworks")
      .doc(FRAMEWORK_ID),

    data: {
      id: FRAMEWORK_ID,
      orgId: ORG_ID,

      title: FRAMEWORK_TITLE,
      shortTitle: FRAMEWORK_TITLE,

      targetKind: "TEACHER",
      targetRoleKeyHint: "KG_TEACHER",
      targetRoleLabel: "معلمة القيم",

      evaluatorRoleKey: "KG_VP",
      evaluatorRoleLabel: "وكيلة الروضة",

      schoolTypes: ["KG"],

      frequency: "PERIODIC",
      planKind: "PERIODIC",

      cycleCount: CYCLE_COUNT,
      maxCyclesPerTerm: CYCLE_COUNT,

      status: "ACTIVE",
      isActive: true,

      version: 1,

      createdAt: now,
      updatedAt: now,

      seedTool:
        "seed-kg-vp-values-teacher-evaluation.cjs",
    },
  });

  /*
   * Rubric section
   */
  const sectionId =
    `${FRAMEWORK_ID}-section-01`;

  writes.push({
    ref: orgRef
      .collection("evaluationRubricSections")
      .doc(sectionId),

    data: {
      id: sectionId,
      orgId: ORG_ID,
      frameworkId: FRAMEWORK_ID,

      title: "تقييم معلمة القيم",

      order: 1,
      sequence: 1,
      weight: 100,

      createdAt: now,
      updatedAt: now,
    },
  });

  /*
   * 26 rubric items
   */
  ITEMS.forEach((title, index) => {
    const number = index + 1;

    const itemId =
      `${FRAMEWORK_ID}-item-${String(number).padStart(2, "0")}`;

    writes.push({
      ref: orgRef
        .collection("evaluationRubricItems")
        .doc(itemId),

      data: {
        id: itemId,
        orgId: ORG_ID,
        frameworkId: FRAMEWORK_ID,
        sectionId,

        title,

        order: number,
        sequence: number,

        maxScore: 5,
        weight: 1,

        createdAt: now,
        updatedAt: now,
      },
    });
  });

  /*
   * School by school
   */
  for (const schoolId of KG_SCHOOLS) {
    const vpPersonId =
      KG_VP_PERSON_IDS[schoolId];

    const valuesTeacherPersonId =
      VALUES_TEACHER_PERSON_IDS[schoolId];

    if (!vpPersonId) {
      conflicts.push({
        reason: "KG_VP_NOT_CONFIGURED",
        schoolId,
      });

      continue;
    }

    if (!valuesTeacherPersonId) {
      conflicts.push({
        reason: "VALUES_TEACHER_NOT_CONFIGURED",
        schoolId,
      });

      continue;
    }

    const title =
      await schoolTitle(orgRef, schoolId);

    /*
     * نستخرج بيانات معلمة القيم من أي assignment موجود لها.
     */
    const teacherPatterns = targetAssignments
      .filter(
        (row) =>
          text(row.schoolId) === schoolId &&
          text(row.targetPersonId) ===
            valuesTeacherPersonId,
      )
      .sort((a, b) => {
        const aValues =
          text(a.targetRoleLabel).includes("القيم")
            ? 1
            : 0;

        const bValues =
          text(b.targetRoleLabel).includes("القيم")
            ? 1
            : 0;

        return bValues - aValues;
      });

    if (teacherPatterns.length === 0) {
      conflicts.push({
        reason:
          "NO_EXISTING_TARGET_PATTERN_FOR_VALUES_TEACHER",
        schoolId,
        targetPersonId:
          valuesTeacherPersonId,
      });

      continue;
    }

    const teacherPattern =
      teacherPatterns[0];

    /*
     * نستخرج بيانات الوكيلة من أي evaluator assignment
     * فعال لها في نفس الروضة.
     */
    const vpPatterns = evaluatorAssignments
      .filter(
        (row) =>
          text(row.schoolId) === schoolId &&
          text(row.evaluatorPersonId) ===
            vpPersonId &&
          isActive(row),
      );

    if (vpPatterns.length === 0) {
      conflicts.push({
        reason:
          "NO_ACTIVE_EVALUATOR_PATTERN_FOR_VP",
        schoolId,
        evaluatorPersonId: vpPersonId,
      });

      continue;
    }

    const evaluatorPattern =
      vpPatterns[0];

    const planId =
      planIdFor(schoolId);

    const planTitle =
      `${FRAMEWORK_TITLE} - ${title} - الفصل الأول`;

    /*
     * Plan
     */
    writes.push({
      ref: orgRef
        .collection("evaluationPlans")
        .doc(planId),

      data: {
        id: planId,
        orgId: ORG_ID,

        schoolId,
        schoolTitle: title,

        academicYearId: YEAR_ID,
        termId: TERM_ID,

        frameworkId: FRAMEWORK_ID,

        title: planTitle,
        shortTitle: FRAMEWORK_TITLE,

        targetKind: "TEACHER",
        targetRoleKey: "KG_TEACHER",
        targetRoleLabel: "معلمة القيم",

        evaluatorRoleKey: "KG_VP",
        evaluatorRoleLabel: "وكيلة الروضة",

        frequency: "PERIODIC",
        planKind: "PERIODIC",

        cycleCount: CYCLE_COUNT,
        maxCyclesPerTerm: CYCLE_COUNT,

        status: "ACTIVE",
        isActive: true,

        createdAt: now,
        updatedAt: now,

        seedTool:
          "seed-kg-vp-values-teacher-evaluation.cjs",
      },
    });

    /*
     * Target assignment
     */
    const targetId =
      targetAssignmentId(
        planId,
        valuesTeacherPersonId,
      );

    writes.push({
      ref: orgRef
        .collection("evaluationTargetAssignments")
        .doc(targetId),

      data: {
        ...clean(teacherPattern),

        id: targetId,
        orgId: ORG_ID,

        schoolId,
        schoolTitle: title,

        academicYearId: YEAR_ID,
        termId: TERM_ID,

        planId,
        planTitle,

        frameworkId: FRAMEWORK_ID,

        targetKind: "TEACHER",

        targetPersonId:
          valuesTeacherPersonId,

        targetRoleKey: "KG_TEACHER",
        targetRoleLabel: "معلمة القيم",

        status: "ACTIVE",

        createdAt: now,
        updatedAt: now,

        seedTool:
          "seed-kg-vp-values-teacher-evaluation.cjs",
      },
    });

    /*
     * Cycles + evaluator assignments
     */
    for (
      let number = 1;
      number <= CYCLE_COUNT;
      number += 1
    ) {
      const cycleId =
        cycleIdFor(planId, number);

      const cycleTitle =
        `التقييم ${number}`;

      writes.push({
        ref: orgRef
          .collection("evaluationCycles")
          .doc(cycleId),

        data: {
          id: cycleId,
          orgId: ORG_ID,

          schoolId,
          schoolTitle: title,

          academicYearId: YEAR_ID,
          termId: TERM_ID,

          planId,
          planTitle,

          frameworkId: FRAMEWORK_ID,

          title: cycleTitle,
          shortTitle: cycleTitle,

          order: number,
          sequence: number,
          cycleNumber: number,

          status: "OPEN",

          createdAt: now,
          updatedAt: now,

          seedTool:
            "seed-kg-vp-values-teacher-evaluation.cjs",
        },
      });

      const assignmentId =
        evaluatorAssignmentId(
          planId,
          cycleId,
          valuesTeacherPersonId,
          vpPersonId,
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
          planTitle,

          frameworkId: FRAMEWORK_ID,
          frameworkTitle:
            FRAMEWORK_TITLE,

          cycleId,
          cycleTitle,

          targetAssignmentId:
            targetId,

          targetKind: "TEACHER",

          targetPersonId:
            valuesTeacherPersonId,

          targetUid:
            text(teacherPattern.targetUid),

          targetEmail:
            text(teacherPattern.targetEmail),

          targetDisplayName:
            text(
              teacherPattern.targetDisplayName,
            ),

          targetRoleKey:
            "KG_TEACHER",

          targetRoleLabel:
            "معلمة القيم",

          evaluatorPersonId:
            vpPersonId,

          evaluatorUid:
            text(
              evaluatorPattern.evaluatorUid,
            ),

          evaluatorEmail:
            text(
              evaluatorPattern.evaluatorEmail,
            ),

          evaluatorDisplayName:
            text(
              evaluatorPattern.evaluatorDisplayName,
            ),

          evaluatorRoleKey:
            text(
              evaluatorPattern.evaluatorRoleKey,
              "KG_VP",
            ),

          evaluatorRoleLabel:
            text(
              evaluatorPattern.evaluatorRoleLabel,
              "وكيلة الروضة",
            ),

          weight: 100,
          status: "ACTIVE",

          createdAt: now,
          updatedAt: now,

          seedTool:
            "seed-kg-vp-values-teacher-evaluation.cjs",
        },
      });
    }

    schoolReports.push({
      schoolId,
      schoolTitle: title,

      valuesTeacher: {
        personId:
          valuesTeacherPersonId,

        displayName:
          text(
            teacherPattern.targetDisplayName,
          ),

        email:
          text(
            teacherPattern.targetEmail,
          ),
      },

      evaluator: {
        personId:
          vpPersonId,

        displayName:
          text(
            evaluatorPattern.evaluatorDisplayName,
          ),

        email:
          text(
            evaluatorPattern.evaluatorEmail,
          ),
      },

      planId,
      cycles: CYCLE_COUNT,
      evaluatorAssignments:
        CYCLE_COUNT,
    });
  }

  /*
   * حماية لو framework سبق استخدامه.
   */
  const frameworkSubmissions =
    submissions.filter(
      (row) =>
        text(row.frameworkId) ===
        FRAMEWORK_ID,
    );

  if (frameworkSubmissions.length > 0) {
    conflicts.push({
      reason:
        "FRAMEWORK_ALREADY_HAS_SUBMISSIONS",
      submissionsCount:
        frameworkSubmissions.length,
    });
  }

  const report = {
    decision:
      conflicts.length > 0
        ? "STOPPED"
        : APPLY
          ? "READY_TO_APPLY"
          : "SAFE_PREVIEW",

    mode:
      APPLY
        ? "APPLY"
        : "PREVIEW",

    framework: {
      id: FRAMEWORK_ID,
      title: FRAMEWORK_TITLE,
      itemsCount: ITEMS.length,
      cyclesPerPlan: CYCLE_COUNT,
    },

    schools:
      schoolReports,

    plannedChanges: {
      totalWrites:
        writes.length,

      submissionsTouched: 0,
      existingEvaluationsTouched: 0,
    },

    warningsCount:
      warnings.length,

    conflictsCount:
      conflicts.length,

    conflicts,
  };

  const reportPath =
    writeReport(report);

  console.dir(
    {
      decision:
        report.decision,

      mode:
        report.mode,

      reportPath,

      framework:
        report.framework,

      schools:
        schoolReports,

      plannedChanges:
        report.plannedChanges,

      warningsCount:
        warnings.length,

      conflictsCount:
        conflicts.length,

      conflicts,
    },
    { depth: 20 },
  );

  if (conflicts.length > 0) {
    console.log("");
    console.log(
      "Stopped. No writes performed.",
    );

    process.exit(1);
  }

  if (!APPLY) {
    console.log("");
    console.log(
      "No writes performed.",
    );

    return;
  }

  const committedWrites =
    await commitInChunks(writes);

  const result = {
    decision: "APPLIED",
    committedWrites,
    submissionsTouched: 0,
  };

  console.dir(result);
}

main().catch((error) => {
  console.error(
    "Seed KG VP values teacher evaluation failed:",
    error,
  );

  process.exit(1);
});