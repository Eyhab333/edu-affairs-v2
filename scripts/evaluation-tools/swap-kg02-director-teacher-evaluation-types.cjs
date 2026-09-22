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

const ORG_ID = "takween";
const SCHOOL_ID = "kg-02";
const YEAR_ID = "ay-1448";
const TERM_ID = "term-1";

const RAHAM_PERSON_ID = "p-r-albatel";
const ALANOOD_PERSON_ID = "p-alanoodf";

const REPORTS_DIR = path.resolve("scripts/evaluation-tools/reports");

const PLANS = {
  classDiagnostic:
    "kg-02-ay-1448-term-1-class-teacher-diagnostic-evaluation",

  classWeekly:
    "kg-02-ay-1448-term-1-class-teacher-weekly-evaluation",

  valuesPeriodic:
    "kg-02-ay-1448-term-1-values-teacher-periodic-evaluation",

  valuesWeekly:
    "kg-02-ay-1448-term-1-values-teacher-weekly-evaluation",
};

function asString(value, fallback = "") {
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

function isUsableCycle(row) {
  const status = normalizeStatus(row?.status);

  return status === "OPEN" || status === "ACTIVE" || !status;
}

function safeFileName(value) {
  return String(value || "")
    .trim()
    .replace(/[^a-zA-Z0-9\u0600-\u06FF._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

async function getRows(orgRef, collectionName) {
  const snap = await orgRef.collection(collectionName).get();

  return snap.docs.map((doc) => ({
    id: doc.id,
    ref: doc.ref,
    ...doc.data(),
  }));
}

async function resolvePerson(personId) {
  const users = await db
    .collection("users")
    .where("personId", "==", personId)
    .limit(5)
    .get();

  if (!users.empty) {
    const doc = users.docs[0];
    const row = doc.data();

    return {
      uid: asString(row.uid, doc.id),
      personId,
      email: asString(row.email),
      displayName:
        asString(row.displayName) ||
        asString(row.fullName) ||
        asString(row.name) ||
        personId,
      roleKey: asString(row.roleKey),
    };
  }

  const personSnap = await db
    .collection("orgs")
    .doc(ORG_ID)
    .collection("people")
    .doc(personId)
    .get();

  if (personSnap.exists) {
    const row = personSnap.data();

    return {
      uid: asString(row.uid),
      personId,
      email: asString(row.email),
      displayName:
        asString(row.displayName) ||
        asString(row.fullName) ||
        asString(row.name) ||
        personId,
      roleKey: asString(row.roleKey),
    };
  }

  return null;
}

function targetAssignmentId(planId, personId) {
  return `${planId}-target-${personId}`;
}

function evaluatorAssignmentIdFromPattern(
  pattern,
  oldTargetPersonId,
  newTargetPersonId,
) {
  const oldId = asString(pattern.id);

  if (oldId && oldTargetPersonId && oldId.includes(oldTargetPersonId)) {
    return oldId.split(oldTargetPersonId).join(newTargetPersonId);
  }

  return [
    asString(pattern.planId),
    asString(pattern.cycleId),
    newTargetPersonId,
    asString(pattern.evaluatorPersonId),
  ].join("-");
}

function cleanForCopy(row) {
  const copy = { ...row };

  delete copy.id;
  delete copy.ref;

  delete copy.targetPersonId;
  delete copy.targetUid;
  delete copy.targetEmail;
  delete copy.targetDisplayName;
  delete copy.targetAssignmentId;

  delete copy.createdAt;
  delete copy.updatedAt;

  delete copy.removedAt;
  delete copy.removedReason;

  return copy;
}

function writeReport(report) {
  fs.mkdirSync(REPORTS_DIR, { recursive: true });

  const timestamp = new Date()
    .toISOString()
    .replace(/[:.]/g, "-");

  const mode = APPLY ? "apply" : "preview";

  const reportPath = path.join(
    REPORTS_DIR,
    [
      timestamp,
      mode,
      "swap-kg02-director-teacher-evaluation-types",
    ].join("__") + ".json",
  );

  fs.writeFileSync(
    reportPath,
    JSON.stringify(report, null, 2),
    "utf8",
  );

  return reportPath;
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

function findTargetAssignment(
  targetAssignments,
  planId,
  personId,
) {
  return targetAssignments.find(
    (row) =>
      asString(row.planId) === planId &&
      asString(row.targetPersonId) === personId &&
      isActive(row),
  );
}

function findEvaluatorAssignments(
  evaluatorAssignments,
  planId,
  personId,
) {
  return evaluatorAssignments.filter(
    (row) =>
      asString(row.planId) === planId &&
      asString(row.targetPersonId) === personId &&
      isActive(row),
  );
}

function findAnyActiveTargetPattern(
  targetAssignments,
  planId,
  excludedPersonId,
) {
  return targetAssignments.find(
    (row) =>
      asString(row.planId) === planId &&
      asString(row.targetPersonId) !== excludedPersonId &&
      isActive(row),
  );
}

async function main() {
  console.log(
    APPLY
      ? "APPLY mode"
      : "Preview mode - no writes",
  );

  const orgRef = db.collection("orgs").doc(ORG_ID);
  const now = Date.now();

  const [
    raham,
    alanood,
    plans,
    cycles,
    targetAssignments,
    evaluatorAssignments,
    submissions,
  ] = await Promise.all([
    resolvePerson(RAHAM_PERSON_ID),
    resolvePerson(ALANOOD_PERSON_ID),
    getRows(orgRef, "evaluationPlans"),
    getRows(orgRef, "evaluationCycles"),
    getRows(orgRef, "evaluationTargetAssignments"),
    getRows(orgRef, "evaluationEvaluatorAssignments"),
    getRows(orgRef, "evaluationSubmissions"),
  ]);

  const conflicts = [];
  const warnings = [];

  if (!raham) {
    conflicts.push({
      reason: "RAHAM_NOT_FOUND",
      personId: RAHAM_PERSON_ID,
    });
  }

  if (!alanood) {
    conflicts.push({
      reason: "ALANOOD_NOT_FOUND",
      personId: ALANOOD_PERSON_ID,
    });
  }

  const requiredPlanIds = Object.values(PLANS);

  for (const planId of requiredPlanIds) {
    const plan = plans.find(
      (row) => asString(row.id) === planId,
    );

    if (!plan) {
      conflicts.push({
        reason: "PLAN_NOT_FOUND",
        planId,
      });
    }
  }

  /*
   * حماية إضافية:
   * نحن نعرف أنكم في البداية،
   * لكن لو ظهر أي submission لأحدهما في هذه الخطط نتوقف.
   */
  const relevantSubmissions = submissions.filter(
    (row) =>
      requiredPlanIds.includes(asString(row.planId)) &&
      [RAHAM_PERSON_ID, ALANOOD_PERSON_ID].includes(
        asString(row.targetPersonId),
      ),
  );

  if (relevantSubmissions.length > 0) {
    conflicts.push({
      reason: "SUBMISSIONS_ALREADY_EXIST",
      submissionsCount: relevantSubmissions.length,
      submissions: relevantSubmissions.map((row) => ({
        id: row.id,
        planId: row.planId || "",
        cycleId: row.cycleId || "",
        targetPersonId: row.targetPersonId || "",
        status: row.status || "",
      })),
    });
  }

  const writes = [];

  const removedTargets = [];
  const removedEvaluators = [];
  const createdTargets = [];
  const createdEvaluators = [];

  /*
   * -------------------------------------------------
   * 1) إزالة رهام من خطط معلمة القيم عند المديرة
   * -------------------------------------------------
   */

  const rahamOldPlanIds = [
    PLANS.valuesPeriodic,
    PLANS.valuesWeekly,
  ];

  for (const planId of rahamOldPlanIds) {
    const target = findTargetAssignment(
      targetAssignments,
      planId,
      RAHAM_PERSON_ID,
    );

    if (target) {
      writes.push({
        ref: target.ref,
        data: {
          status: "REMOVED",
          removedAt: now,
          removedReason:
            "ROLE_CHANGED_VALUES_TEACHER_TO_CLASS_TEACHER",
          updatedAt: now,
          swapTool:
            "swap-kg02-director-teacher-evaluation-types.cjs",
        },
      });

      removedTargets.push({
        personId: RAHAM_PERSON_ID,
        planId,
        id: target.id,
      });
    }

    const evaluatorRows = findEvaluatorAssignments(
      evaluatorAssignments,
      planId,
      RAHAM_PERSON_ID,
    );

    for (const row of evaluatorRows) {
      writes.push({
        ref: row.ref,
        data: {
          status: "REMOVED",
          removedAt: now,
          removedReason:
            "ROLE_CHANGED_VALUES_TEACHER_TO_CLASS_TEACHER",
          updatedAt: now,
          swapTool:
            "swap-kg02-director-teacher-evaluation-types.cjs",
        },
      });

      removedEvaluators.push({
        personId: RAHAM_PERSON_ID,
        planId,
        cycleId: row.cycleId || "",
        id: row.id,
      });
    }
  }

  /*
   * -------------------------------------------------
   * 2) إزالة العنود من خطط معلمة الصف عند المديرة
   * -------------------------------------------------
   */

  const alanoodOldPlanIds = [
    PLANS.classDiagnostic,
    PLANS.classWeekly,
  ];

  for (const planId of alanoodOldPlanIds) {
    const target = findTargetAssignment(
      targetAssignments,
      planId,
      ALANOOD_PERSON_ID,
    );

    if (target) {
      writes.push({
        ref: target.ref,
        data: {
          status: "REMOVED",
          removedAt: now,
          removedReason:
            "ROLE_CHANGED_CLASS_TEACHER_TO_VALUES_TEACHER",
          updatedAt: now,
          swapTool:
            "swap-kg02-director-teacher-evaluation-types.cjs",
        },
      });

      removedTargets.push({
        personId: ALANOOD_PERSON_ID,
        planId,
        id: target.id,
      });
    }

    const evaluatorRows = findEvaluatorAssignments(
      evaluatorAssignments,
      planId,
      ALANOOD_PERSON_ID,
    );

    for (const row of evaluatorRows) {
      writes.push({
        ref: row.ref,
        data: {
          status: "REMOVED",
          removedAt: now,
          removedReason:
            "ROLE_CHANGED_CLASS_TEACHER_TO_VALUES_TEACHER",
          updatedAt: now,
          swapTool:
            "swap-kg02-director-teacher-evaluation-types.cjs",
        },
      });

      removedEvaluators.push({
        personId: ALANOOD_PERSON_ID,
        planId,
        cycleId: row.cycleId || "",
        id: row.id,
      });
    }
  }

  /*
   * -------------------------------------------------
   * 3) إضافة رهام إلى خطط معلمة الصف
   * -------------------------------------------------
   */

  const rahamNewPlanIds = [
    PLANS.classDiagnostic,
    PLANS.classWeekly,
  ];

  for (const planId of rahamNewPlanIds) {
    /*
     * نستخدم العنود نفسها كـ pattern لأنها كانت
     * معلمة صف في هذه الخطط.
     */
    const targetPattern =
      targetAssignments.find(
        (row) =>
          asString(row.planId) === planId &&
          asString(row.targetPersonId) === ALANOOD_PERSON_ID,
      ) ||
      findAnyActiveTargetPattern(
        targetAssignments,
        planId,
        RAHAM_PERSON_ID,
      );

    if (!targetPattern) {
      conflicts.push({
        reason: "NO_CLASS_TEACHER_TARGET_PATTERN",
        planId,
      });

      continue;
    }

    const targetId = targetAssignmentId(
      planId,
      RAHAM_PERSON_ID,
    );

    const targetBase = cleanForCopy(targetPattern);

    writes.push({
      ref: orgRef
        .collection("evaluationTargetAssignments")
        .doc(targetId),

      data: {
        ...targetBase,

        id: targetId,
        orgId: ORG_ID,

        schoolId: SCHOOL_ID,
        academicYearId: YEAR_ID,
        termId: TERM_ID,

        planId,

        targetPersonId: RAHAM_PERSON_ID,
        targetUid: asString(raham.uid),
        targetEmail: asString(raham.email),
        targetDisplayName: asString(
          raham.displayName,
          RAHAM_PERSON_ID,
        ),

        targetRoleKey: "KG_TEACHER",
        targetRoleLabel: "معلمة الصف",

        status: "ACTIVE",

        createdAt: now,
        updatedAt: now,

        swapTool:
          "swap-kg02-director-teacher-evaluation-types.cjs",
      },
    });

    createdTargets.push({
      personId: RAHAM_PERSON_ID,
      planId,
      id: targetId,
      targetRoleLabel: "معلمة الصف",
    });

    const cycleRows = cycles
      .filter(
        (row) =>
          asString(row.planId) === planId,
      )
      .filter(isUsableCycle);

    for (const cycle of cycleRows) {
      const pattern =
        evaluatorAssignments.find(
          (row) =>
            asString(row.planId) === planId &&
            asString(row.cycleId) === asString(cycle.id) &&
            asString(row.targetPersonId) === ALANOOD_PERSON_ID,
        ) ||
        evaluatorAssignments.find(
          (row) =>
            asString(row.planId) === planId &&
            asString(row.cycleId) === asString(cycle.id) &&
            isActive(row),
        );

      if (!pattern) {
        conflicts.push({
          reason:
            "NO_CLASS_TEACHER_EVALUATOR_PATTERN",
          planId,
          cycleId: cycle.id,
        });

        continue;
      }

      const assignmentId =
        evaluatorAssignmentIdFromPattern(
          pattern,
          asString(pattern.targetPersonId),
          RAHAM_PERSON_ID,
        );

      const base = cleanForCopy(pattern);

      writes.push({
        ref: orgRef
          .collection("evaluationEvaluatorAssignments")
          .doc(assignmentId),

        data: {
          ...base,

          id: assignmentId,
          orgId: ORG_ID,

          schoolId: SCHOOL_ID,
          academicYearId: YEAR_ID,
          termId: TERM_ID,

          planId,
          cycleId: cycle.id,

          targetAssignmentId: targetId,

          targetPersonId: RAHAM_PERSON_ID,
          targetUid: asString(raham.uid),
          targetEmail: asString(raham.email),
          targetDisplayName: asString(
            raham.displayName,
            RAHAM_PERSON_ID,
          ),

          targetRoleKey: "KG_TEACHER",
          targetRoleLabel: "معلمة الصف",

          status: "ACTIVE",

          createdAt: now,
          updatedAt: now,

          swapTool:
            "swap-kg02-director-teacher-evaluation-types.cjs",
        },
      });

      createdEvaluators.push({
        personId: RAHAM_PERSON_ID,
        planId,
        cycleId: cycle.id,
        id: assignmentId,
        targetRoleLabel: "معلمة الصف",
      });
    }
  }

  /*
   * -------------------------------------------------
   * 4) إضافة العنود إلى خطط معلمة القيم
   * -------------------------------------------------
   */

  const alanoodNewPlanIds = [
    PLANS.valuesPeriodic,
    PLANS.valuesWeekly,
  ];

  for (const planId of alanoodNewPlanIds) {
    /*
     * نستخدم رهام القديمة نفسها كـ pattern
     * لأنها كانت معلمة القيم.
     */
    const targetPattern =
      targetAssignments.find(
        (row) =>
          asString(row.planId) === planId &&
          asString(row.targetPersonId) === RAHAM_PERSON_ID,
      ) ||
      findAnyActiveTargetPattern(
        targetAssignments,
        planId,
        ALANOOD_PERSON_ID,
      );

    if (!targetPattern) {
      conflicts.push({
        reason: "NO_VALUES_TEACHER_TARGET_PATTERN",
        planId,
      });

      continue;
    }

    const targetId = targetAssignmentId(
      planId,
      ALANOOD_PERSON_ID,
    );

    const targetBase = cleanForCopy(targetPattern);

    writes.push({
      ref: orgRef
        .collection("evaluationTargetAssignments")
        .doc(targetId),

      data: {
        ...targetBase,

        id: targetId,
        orgId: ORG_ID,

        schoolId: SCHOOL_ID,
        academicYearId: YEAR_ID,
        termId: TERM_ID,

        planId,

        targetPersonId: ALANOOD_PERSON_ID,
        targetUid: asString(alanood.uid),
        targetEmail: asString(alanood.email),
        targetDisplayName: asString(
          alanood.displayName,
          ALANOOD_PERSON_ID,
        ),

        targetRoleKey: "KG_TEACHER",
        targetRoleLabel: "معلمة القيم",

        status: "ACTIVE",

        createdAt: now,
        updatedAt: now,

        swapTool:
          "swap-kg02-director-teacher-evaluation-types.cjs",
      },
    });

    createdTargets.push({
      personId: ALANOOD_PERSON_ID,
      planId,
      id: targetId,
      targetRoleLabel: "معلمة القيم",
    });

    const cycleRows = cycles
      .filter(
        (row) =>
          asString(row.planId) === planId,
      )
      .filter(isUsableCycle);

    for (const cycle of cycleRows) {
      const pattern =
        evaluatorAssignments.find(
          (row) =>
            asString(row.planId) === planId &&
            asString(row.cycleId) === asString(cycle.id) &&
            asString(row.targetPersonId) === RAHAM_PERSON_ID,
        ) ||
        evaluatorAssignments.find(
          (row) =>
            asString(row.planId) === planId &&
            asString(row.cycleId) === asString(cycle.id) &&
            isActive(row),
        );

      if (!pattern) {
        conflicts.push({
          reason:
            "NO_VALUES_TEACHER_EVALUATOR_PATTERN",
          planId,
          cycleId: cycle.id,
        });

        continue;
      }

      const assignmentId =
        evaluatorAssignmentIdFromPattern(
          pattern,
          asString(pattern.targetPersonId),
          ALANOOD_PERSON_ID,
        );

      const base = cleanForCopy(pattern);

      writes.push({
        ref: orgRef
          .collection("evaluationEvaluatorAssignments")
          .doc(assignmentId),

        data: {
          ...base,

          id: assignmentId,
          orgId: ORG_ID,

          schoolId: SCHOOL_ID,
          academicYearId: YEAR_ID,
          termId: TERM_ID,

          planId,
          cycleId: cycle.id,

          targetAssignmentId: targetId,

          targetPersonId: ALANOOD_PERSON_ID,
          targetUid: asString(alanood.uid),
          targetEmail: asString(alanood.email),
          targetDisplayName: asString(
            alanood.displayName,
            ALANOOD_PERSON_ID,
          ),

          targetRoleKey: "KG_TEACHER",
          targetRoleLabel: "معلمة القيم",

          status: "ACTIVE",

          createdAt: now,
          updatedAt: now,

          swapTool:
            "swap-kg02-director-teacher-evaluation-types.cjs",
        },
      });

      createdEvaluators.push({
        personId: ALANOOD_PERSON_ID,
        planId,
        cycleId: cycle.id,
        id: assignmentId,
        targetRoleLabel: "معلمة القيم",
      });
    }
  }

  const report = {
    decision:
      conflicts.length > 0
        ? "STOPPED"
        : APPLY
          ? "READY_TO_APPLY"
          : "SAFE_PREVIEW",

    mode: APPLY ? "APPLY" : "PREVIEW",

    people: {
      raham,
      alanood,
    },

    scope: {
      orgId: ORG_ID,
      schoolId: SCHOOL_ID,
      academicYearId: YEAR_ID,
      termId: TERM_ID,
    },

    changes: {
      raham: {
        from: "معلمة القيم",
        to: "معلمة الصف",
      },

      alanood: {
        from: "معلمة الصف",
        to: "معلمة القيم",
      },
    },

    plannedChanges: {
      removeTargetAssignments:
        removedTargets.length,

      removeEvaluatorAssignments:
        removedEvaluators.length,

      createOrUpdateTargetAssignments:
        createdTargets.length,

      createOrUpdateEvaluatorAssignments:
        createdEvaluators.length,

      submissionsTouched: 0,

      totalWrites:
        writes.length,
    },

    removedTargets,
    removedEvaluators,
    createdTargets,
    createdEvaluators,

    warnings,
    conflicts,

    safety: {
      submissionsRequiredToBeZero: true,
      submissionsTouched: 0,

      educationalSupervisorPlansTouched: false,
      vicePrincipalPlansTouched: false,
      kgVpSupervisoryPlansTouched: false,
      valuesCoordinatorPlansTouched: false,

      onlyDirectorTeacherPlansTouched: true,

      firestoreDeletes: 0,
      requiresApplyFlag: true,
    },
  };

  const reportPath = writeReport(report);

  console.dir(
    {
      decision: report.decision,
      mode: report.mode,
      reportPath,
      people: report.people,
      changes: report.changes,
      plannedChanges: report.plannedChanges,
      warningsCount: warnings.length,
      conflictsCount: conflicts.length,
      conflicts,
    },
    { depth: 20 },
  );

  if (conflicts.length > 0) {
    console.log("");
    console.log(
      "Stopped. No changes were performed.",
    );

    process.exit(1);
  }

  if (!APPLY) {
    console.log("");
    console.log("No writes performed.");
    console.log(
      "Review the JSON report carefully before applying.",
    );

    return;
  }

  const committed = await commitInChunks(writes);

  const applyResult = {
    decision: "APPLIED",
    committedWrites: committed,

    targetAssignmentsRemoved:
      removedTargets.length,

    evaluatorAssignmentsRemoved:
      removedEvaluators.length,

    targetAssignmentsCreatedOrUpdated:
      createdTargets.length,

    evaluatorAssignmentsCreatedOrUpdated:
      createdEvaluators.length,

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
  console.error(
    "Swap KG-02 director evaluation types failed:",
    error,
  );

  process.exit(1);
});