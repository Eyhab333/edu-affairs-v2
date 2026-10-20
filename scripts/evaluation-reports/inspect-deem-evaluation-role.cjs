/* eslint-disable no-console */

const fs = require("node:fs");
const path = require("node:path");
const admin = require("firebase-admin");

const CONFIG = {
  orgId: "takween",
  email: "d-a-athunian@qz.org.sa",
  expectedSchoolId: "kg-01",
};

function asString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeEmail(value) {
  return asString(value).toLowerCase();
}

function numberValue(value) {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

function statusOf(data) {
  return asString(data?.status).toUpperCase();
}

function activityAt(data) {
  return (
    numberValue(data?.updatedAt) ??
    numberValue(data?.approvedAt) ??
    numberValue(data?.reviewedAt) ??
    numberValue(data?.submittedAt) ??
    numberValue(data?.createdAt) ??
    0
  );
}

/**
 * نفس منطق التقرير الحالي حرفيًا تقريبًا.
 */
function isActiveEvaluationAssignment(data) {
  const status = statusOf(data);

  return (
    status === "ACTIVE" ||
    (!status && data?.isActive === true)
  );
}

function isGenerallyActive(data) {
  const status = statusOf(data);

  return (
    data?.isActive !== false &&
    data?.active !== false &&
    ![
      "DISABLED",
      "ENDED",
      "INACTIVE",
      "REVOKED",
      "REMOVED",
      "ARCHIVED",
    ].includes(status)
  );
}

function targetId(data) {
  return (
    asString(data?.targetPersonId) ||
    asString(data?.targetTeacherPersonId)
  );
}

function uniqueDocuments(documents) {
  return Array.from(
    new Map(
      documents.map((document) => [document.ref.path, document]),
    ).values(),
  );
}

function latestByPlanAndPerson(documents) {
  const result = new Map();

  for (const document of documents) {
    const data = document.data();
    const planId = asString(data.planId);
    const personId = targetId(data);

    if (!planId || !personId) continue;

    const key = `${planId}:${personId}`;
    const current = result.get(key);

    if (
      !current ||
      activityAt(data) > activityAt(current.data())
    ) {
      result.set(key, document);
    }
  }

  return result;
}

function findServiceAccountPath() {
  const candidates = [
    process.env.SERVICE_ACCOUNT_PATH
      ? path.resolve(process.env.SERVICE_ACCOUNT_PATH)
      : null,

    // المسار الذي تستخدمه بعض سكربتات المشروع
    path.resolve(process.cwd(), "service-account.json"),

    // لو الملف موجود داخل scripts
    path.resolve(process.cwd(), "scripts", "service-account.json"),

    // بالنسبة لمكان هذا السكربت:
    // scripts/evaluation-reports/inspect-....cjs
    path.resolve(__dirname, "..", "service-account.json"),
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  throw new Error(
    [
      "Service account file was not found.",
      "Checked:",
      ...candidates.map((candidate) => `- ${candidate}`),
    ].join("\n"),
  );
}

function initAdmin() {
  if (admin.apps.length) return;

  const serviceAccountPath = findServiceAccountPath();
  const serviceAccount = require(serviceAccountPath);

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    projectId: serviceAccount.project_id,
  });

  console.log("Firebase Admin initialized.");
  console.log(`Project: ${serviceAccount.project_id}`);
  console.log(`Service account: ${serviceAccountPath}`);
}

async function findPersonByEmail(db, orgRoot) {
  const peopleRef = db.collection(`${orgRoot}/people`);

  const exactSnapshot = await peopleRef
    .where("email", "==", CONFIG.email)
    .get();

  if (!exactSnapshot.empty) {
    return exactSnapshot.docs;
  }

  console.log(
    "\nExact email query returned no result. Falling back to a read-only people scan...",
  );

  const allPeople = await peopleRef.get();

  return allPeople.docs.filter(
    (document) =>
      normalizeEmail(document.data().email) ===
      normalizeEmail(CONFIG.email),
  );
}

async function loadTargetAssignments(db, orgRoot, personId) {
  const collection = db.collection(
    `${orgRoot}/evaluationTargetAssignments`,
  );

  const [byPersonId, byTeacherPersonId] = await Promise.all([
    collection
      .where("targetPersonId", "==", personId)
      .get(),

    collection
      .where("targetTeacherPersonId", "==", personId)
      .get(),
  ]);

  return uniqueDocuments([
    ...byPersonId.docs,
    ...byTeacherPersonId.docs,
  ]);
}

async function loadPlans(db, orgRoot, planIds) {
  if (!planIds.length) return new Map();

  const snapshots = await db.getAll(
    ...planIds.map((planId) =>
      db.doc(`${orgRoot}/evaluationPlans/${planId}`),
    ),
  );

  return new Map(
    snapshots.map((snapshot) => [
      snapshot.id,
      snapshot.exists ? snapshot.data() : null,
    ]),
  );
}

async function loadTeacherAssignments(
  db,
  orgRoot,
  personId,
) {
  const collection = db.collection(
    `${orgRoot}/teacherAssignments`,
  );

  const fields = [
    "personId",
    "teacherPersonId",
    "actorPersonId",
  ];

  const snapshots = await Promise.all(
    fields.map((field) =>
      collection.where(field, "==", personId).get(),
    ),
  );

  return uniqueDocuments(
    snapshots.flatMap((snapshot) => snapshot.docs),
  );
}

async function loadOrgMemberships(
  db,
  orgRoot,
  personId,
) {
  const collection = db.collection(
    `${orgRoot}/memberships`,
  );

  const fields = [
    "personId",
    "teacherPersonId",
  ];

  const snapshots = await Promise.all(
    fields.map((field) =>
      collection.where(field, "==", personId).get(),
    ),
  );

  return uniqueDocuments(
    snapshots.flatMap((snapshot) => snapshot.docs),
  );
}

function printPerson(personDocument) {
  const data = personDocument.data();

  console.log("\n========================================");
  console.log("PERSON");
  console.log("========================================");

  console.table([
    {
      personId: personDocument.id,
      displayName:
        asString(data.displayName) ||
        asString(data.fullName) ||
        asString(data.name),
      email: asString(data.email),
      roleKey: asString(data.roleKey) || "-",
      role: asString(data.role) || "-",
      isArchived:
        typeof data.isArchived === "boolean"
          ? data.isArchived
          : "-",
    },
  ]);
}

function printMemberships(memberships) {
  console.log("\n========================================");
  console.log("CURRENT MEMBERSHIP EVIDENCE");
  console.log("========================================");

  if (!memberships.length) {
    console.log("No org membership documents found.");
    return;
  }

  console.table(
    memberships.map((document) => {
      const data = document.data();

      return {
        id: document.id,
        roleKey:
          asString(data.roleKey) ||
          asString(data.role) ||
          "-",
        schoolId: asString(data.schoolId) || "-",
        scopeId: asString(data.scopeId) || "-",
        scopeType: asString(data.scopeType) || "-",
        schoolIds: Array.isArray(data.scopes?.schoolIds)
          ? data.scopes.schoolIds.join(", ")
          : "-",
        active: isGenerallyActive(data)
          ? "YES"
          : "NO",
      };
    }),
  );
}

function printTeacherAssignments(assignments) {
  console.log("\n========================================");
  console.log("TEACHER ASSIGNMENTS");
  console.log("========================================");

  if (!assignments.length) {
    console.log("No teacherAssignments found.");
    return;
  }

  console.table(
    assignments.map((document) => {
      const data = document.data();

      return {
        id: document.id,
        schoolId: asString(data.schoolId) || "-",
        academicYearId:
          asString(data.academicYearId) || "-",
        classId: asString(data.classId) || "-",
        gradeId: asString(data.gradeId) || "-",
        subjectKey:
          asString(data.subjectKey) ||
          asString(data.subjectId) ||
          "-",
        roleKey:
          asString(data.roleKey) ||
          asString(data.role) ||
          "-",
        status: statusOf(data) || "-",
        isActive:
          typeof data.isActive === "boolean"
            ? data.isActive
            : "-",
        active: isGenerallyActive(data)
          ? "YES"
          : "NO",
      };
    }),
  );
}

function printAllTargetAssignments(assignments) {
  console.log("\n========================================");
  console.log("ALL EVALUATION TARGET ASSIGNMENTS");
  console.log("========================================");

  if (!assignments.length) {
    console.log(
      "No evaluationTargetAssignments found for this person.",
    );
    return;
  }

  console.table(
    assignments.map((document) => {
      const data = document.data();

      return {
        id: document.id,
        planId: asString(data.planId) || "-",
        schoolId: asString(data.schoolId) || "-",
        targetPersonId:
          asString(data.targetPersonId) || "-",
        targetTeacherPersonId:
          asString(data.targetTeacherPersonId) || "-",
        targetRoleKey:
          asString(data.targetRoleKey) || "-",
        targetKind:
          asString(data.targetKind) || "-",
        status: statusOf(data) || "-",
        isActive:
          typeof data.isActive === "boolean"
            ? data.isActive
            : "-",
        reportActive:
          isActiveEvaluationAssignment(data)
            ? "YES"
            : "NO",
        createdAt:
          numberValue(data.createdAt) ?? "-",
        updatedAt:
          numberValue(data.updatedAt) ?? "-",
        activityAt: activityAt(data),
      };
    }),
  );
}

function printPlans(plansById) {
  console.log("\n========================================");
  console.log("LINKED EVALUATION PLANS");
  console.log("========================================");

  if (!plansById.size) {
    console.log("No linked evaluation plans.");
    return;
  }

  console.table(
    Array.from(plansById, ([planId, data]) => {
      if (!data) {
        return {
          id: planId,
          title: "DOCUMENT MISSING",
          schoolId: "-",
          academicYearId: "-",
          termId: "-",
          targetRoleKey: "-",
          targetKind: "-",
          planKind: "-",
          status: "-",
        };
      }

      return {
        id: planId,
        title:
          asString(data.title) ||
          asString(data.shortTitle) ||
          "-",
        schoolId: asString(data.schoolId) || "-",
        academicYearId:
          asString(data.academicYearId) || "-",
        termId: asString(data.termId) || "-",
        targetRoleKey:
          asString(data.targetRoleKey) || "-",
        targetKind:
          asString(data.targetKind) || "-",
        planKind:
          asString(data.planKind) ||
          asString(data.frequencyType) ||
          "-",
        status: statusOf(data) || "-",
      };
    }),
  );
}

function resolveEffectiveRole({
  assignment,
  plan,
  person,
}) {
  const assignmentRole = asString(
    assignment?.targetRoleKey,
  );

  if (assignmentRole) {
    return {
      roleKey: assignmentRole,
      source:
        "evaluationTargetAssignments.targetRoleKey",
    };
  }

  const planRole = asString(plan?.targetRoleKey);

  if (planRole) {
    return {
      roleKey: planRole,
      source: "evaluationPlans.targetRoleKey",
    };
  }

  const personRoleKey = asString(person?.roleKey);

  if (personRoleKey) {
    return {
      roleKey: personRoleKey,
      source: "people.roleKey",
    };
  }

  const personRole = asString(person?.role);

  if (personRole) {
    return {
      roleKey: personRole,
      source: "people.role",
    };
  }

  return {
    roleKey: "",
    source: "NONE",
  };
}

function determineTeacherRoleEvidence({
  memberships,
  teacherAssignments,
}) {
  const membershipRoles = memberships
    .filter((document) =>
      isGenerallyActive(document.data()),
    )
    .map((document) =>
      asString(
        document.data().roleKey ||
          document.data().role,
      ).toUpperCase(),
    )
    .filter(Boolean);

  const explicitTeacherRoles = membershipRoles.filter(
    (role) =>
      role.includes("TEACHER") ||
      role === "TEACHER",
  );

  if (explicitTeacherRoles.length) {
    return {
      candidate:
        explicitTeacherRoles[0],
      source: "active org membership",
    };
  }

  const activeTeacherAssignments =
    teacherAssignments.filter((document) =>
      isGenerallyActive(document.data()),
    );

  if (activeTeacherAssignments.length) {
    return {
      candidate: "KG_TEACHER",
      source:
        "active teacherAssignments + KG school context",
    };
  }

  return {
    candidate: "",
    source: "",
  };
}

function printEffectiveRoles({
  activeAssignments,
  plansById,
  person,
}) {
  console.log("\n========================================");
  console.log("EFFECTIVE REPORT ROLE PER PLAN");
  console.log("========================================");

  if (!activeAssignments.length) {
    console.log(
      "No active evaluation target assignments.",
    );
    return [];
  }

  const rows = activeAssignments.map((document) => {
    const assignment = document.data();
    const planId = asString(assignment.planId);
    const plan = plansById.get(planId) || {};
    const effective = resolveEffectiveRole({
      assignment,
      plan,
      person,
    });

    return {
      assignmentId: document.id,
      planId,
      assignmentRole:
        asString(assignment.targetRoleKey) || "-",
      planRole:
        asString(plan.targetRoleKey) || "-",
      personRoleKey:
        asString(person.roleKey) || "-",
      personRole:
        asString(person.role) || "-",
      effectiveReportRole:
        effective.roleKey || "-",
      sourceUsed: effective.source,
    };
  });

  console.table(rows);

  return rows;
}

async function main() {
  console.log("========================================");
  console.log("DEEM EVALUATION ROLE INSPECTION");
  console.log("READ ONLY - NO FIRESTORE WRITES");
  console.log("========================================");

  initAdmin();

  const db = admin.firestore();
  const orgRoot = `orgs/${CONFIG.orgId}`;

  const personDocuments = await findPersonByEmail(
    db,
    orgRoot,
  );

  if (personDocuments.length === 0) {
    throw new Error(
      `No person found with email ${CONFIG.email}`,
    );
  }

  if (personDocuments.length > 1) {
    console.log(
      "\nWARNING: More than one person document has this email:",
    );

    console.table(
      personDocuments.map((document) => ({
        personId: document.id,
        displayName:
          asString(document.data().displayName) ||
          "-",
        email:
          asString(document.data().email) || "-",
      })),
    );

    throw new Error(
      "Multiple people matched the email. Inspection stopped to avoid ambiguous diagnosis.",
    );
  }

  const personDocument = personDocuments[0];
  const personId = personDocument.id;
  const person = personDocument.data();

  printPerson(personDocument);

  const [
    targetAssignments,
    teacherAssignments,
    memberships,
  ] = await Promise.all([
    loadTargetAssignments(
      db,
      orgRoot,
      personId,
    ),
    loadTeacherAssignments(
      db,
      orgRoot,
      personId,
    ),
    loadOrgMemberships(
      db,
      orgRoot,
      personId,
    ),
  ]);

  printMemberships(memberships);
  printTeacherAssignments(teacherAssignments);
  printAllTargetAssignments(targetAssignments);

  const planIds = Array.from(
    new Set(
      targetAssignments
        .map((document) =>
          asString(document.data().planId),
        )
        .filter(Boolean),
    ),
  );

  const plansById = await loadPlans(
    db,
    orgRoot,
    planIds,
  );

  printPlans(plansById);

  // نفس شروط التقرير: لا نأخذ إلا التعيينات النشطة.
  const activeAssignments =
    targetAssignments.filter((document) =>
      isActiveEvaluationAssignment(
        document.data(),
      ),
    );

  // نفس أسلوب التقرير:
  // latest per planId + personId.
  const winningAssignments = Array.from(
    latestByPlanAndPerson(
      activeAssignments,
    ).values(),
  );

  console.log("\n========================================");
  console.log("WINNING ACTIVE TARGET ASSIGNMENTS");
  console.log("same planId + personId dedupe");
  console.log("========================================");

  console.table(
    winningAssignments.map((document) => {
      const data = document.data();

      return {
        assignmentId: document.id,
        planId: asString(data.planId),
        targetRoleKey:
          asString(data.targetRoleKey) || "-",
        status: statusOf(data) || "-",
        activityAt: activityAt(data),
      };
    }),
  );

  const effectiveRows = printEffectiveRoles({
    activeAssignments: winningAssignments,
    plansById,
    person,
  });

  const badRows = effectiveRows.filter(
    (row) =>
      row.effectiveReportRole.toUpperCase() ===
      "KG_PRINCIPAL",
  );

  const teacherRoleEvidence =
    determineTeacherRoleEvidence({
      memberships,
      teacherAssignments,
    });

  console.log("\n========================================");
  console.log("DIAGNOSIS");
  console.log("========================================");

  console.log(`PersonId: ${personId}`);
  console.log(`Email: ${CONFIG.email}`);
  console.log(
    `Expected school: ${CONFIG.expectedSchoolId}`,
  );
  console.log(
    `Total evaluation target assignments: ${targetAssignments.length}`,
  );
  console.log(
    `Active assignments according to report logic: ${activeAssignments.length}`,
  );
  console.log(
    `Winning plan/person assignments: ${winningAssignments.length}`,
  );
  console.log(
    `Rows resolving to KG_PRINCIPAL: ${badRows.length}`,
  );

  if (badRows.length) {
    console.log(
      "\nDocuments causing KG_PRINCIPAL in the report:",
    );

    console.table(
      badRows.map((row) => ({
        assignmentId: row.assignmentId,
        planId: row.planId,
        effectiveRole:
          row.effectiveReportRole,
        source: row.sourceUsed,
        assignmentRole:
          row.assignmentRole,
        planRole: row.planRole,
      })),
    );
  } else {
    console.log(
      "\nNo winning active evaluation target currently resolves to KG_PRINCIPAL.",
    );
  }

  console.log("\nTeacher role evidence:");

  if (teacherRoleEvidence.candidate) {
    console.log(
      `Candidate current teacher role: ${teacherRoleEvidence.candidate}`,
    );
    console.log(
      `Evidence source: ${teacherRoleEvidence.source}`,
    );
  } else {
    console.log(
      "Could not safely infer a teacher role from current membership/teacherAssignment evidence.",
    );
  }

  console.log("\n========================================");
  console.log("PROPOSED DATA CORRECTION - NOT APPLIED");
  console.log("========================================");

  if (
    badRows.length &&
    teacherRoleEvidence.candidate
  ) {
    for (const row of badRows) {
      console.log(`Assignment: ${row.assignmentId}`);
      console.log(`Plan: ${row.planId}`);
      console.log(
        `Bad source: ${row.sourceUsed}`,
      );

      if (
        row.sourceUsed ===
        "evaluationTargetAssignments.targetRoleKey"
      ) {
        console.log(
          `Proposed before -> after: KG_PRINCIPAL -> ${teacherRoleEvidence.candidate}`,
        );
        console.log(
          "Field: evaluationTargetAssignments.targetRoleKey",
        );
      } else if (
        row.sourceUsed ===
        "evaluationPlans.targetRoleKey"
      ) {
        console.log(
          `Proposed before -> after: KG_PRINCIPAL -> ${teacherRoleEvidence.candidate}`,
        );
        console.log(
          "Field: evaluationPlans.targetRoleKey",
        );
      }

      console.log("---");
    }
  } else {
    console.log(
      "No automatic correction recommendation because the evidence is incomplete or KG_PRINCIPAL was not reproduced.",
    );
  }

  console.log("\n========================================");
  console.log("READ-ONLY INSPECTION COMPLETE");
  console.log("No Firestore writes were performed.");
  console.log("========================================");
}

main().catch((error) => {
  console.error("\nInspection failed:");
  console.error(error);
  process.exitCode = 1;
});