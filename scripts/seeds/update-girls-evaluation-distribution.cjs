/* eslint-disable no-console */

const admin = require("firebase-admin");
const fs = require("fs");
const path = require("path");

// Read-only unless explicitly invoked with DRY_RUN=false.
const DRY_RUN = process.env.DRY_RUN !== "false";
// Diagnostic mode is always read-only, including when DRY_RUN=false is set.
const DIAGNOSE = process.env.DIAGNOSE === "true";

const CONFIG = {
  orgId: "takween",
  academicYearId: "ay-1448",
  termId: "term-1",
  school: {
    id: "mrb-girls",
    label: "مدرسة منار الريادة بنات",
  },
  oldSupervisor: {
    uid: "aa3uDx6i5uf6Dp5YP3unAqD5Zyo1",
    personId: "p-s-sayed",
    email: "s.sayed@qz.org.sa",
    roleKey: "EDU_SUPERVISOR",
    girlsOperationalAssignmentId: "staff-provisioning__p-s-sayed__mrb-girls__STAFF_EVALUATION",
  },
  newSupervisor: {
    uid: "ZKSVVOeoJOhUhIu4HDFapMwApo83",
    personId: "staff-ZKSVVOeoJOhUhIu4HDFapMwApo83",
  },
  supervisorTeacherPlans: [
    {
      key: "periodic",
      id: "mrb-girls-ay-1448-term-1-educational-supervisor-periodic-teacher-evaluation",
      frameworkId: "educational-supervisor-periodic-teacher-evaluation-v1",
      planKind: "PERIODIC",
      targetKind: "TEACHER",
      title: "تقييم المشرف التعليمي للمعلمات - مدرسة منار الريادة بنات - الفصل الأول",
      sourceTemplateTitle: "تقييم المشرف التعليمي للمعلمين",
    },
    {
      key: "diagnostic",
      id: "mrb-girls-ay-1448-term-1-educational-supervisor-diagnostic-teacher-evaluation",
      frameworkId: "educational-supervisor-diagnostic-teacher-evaluation-v1",
      planKind: "VISIT_BASED",
      targetKind: "TEACHER",
      title: "الزيارة الإشرافية التشخيصية للمعلمات - مدرسة منار الريادة بنات - الفصل الأول",
      sourceTemplateTitle: "الزيارة الإشرافية التشخيصية للمعلمين",
    },
  ],
  vicePrincipalPeriodicPlan: {
    id: "mrb-girls-ay-1448-term-1-girls-vice-principal-periodic-teacher-evaluation",
    frameworkId: "girls-vice-principal-periodic-teacher-evaluation-v1",
    planKind: "PERIODIC",
    targetKind: "TEACHER",
    evaluatorPersonId: "p-f-alobawe",
    evaluatorRoleKey: "GIRLS_VP",
  },
  excludedVicePrincipalAdminPlan: {
    id: "mrb-girls-ay-1448-term-1-vice-principal-periodic-evaluation",
    targetKind: "ADMIN",
    reason: "This is the principal-to-vice-principal admin evaluation, not a vice-principal teacher evaluation.",
  },
};

class PreflightError extends Error {
  constructor(message, report) {
    super(message);
    this.name = "PreflightError";
    this.report = report;
  }
}

function initAdmin() {
  if (admin.apps.length) return;
  const serviceAccountPath = path.resolve(process.cwd(), "service-account.json");
  const serviceAccount = require(serviceAccountPath);
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    projectId: serviceAccount.project_id,
  });
}

function assert(condition, message, report) {
  if (!condition) throw new PreflightError(message, report);
}

function asString(value) {
  return typeof value === "string" ? value.trim() : "";
}

const SCHOOL_ID_ALIASES = {
  manarGirls: "mrb-girls",
  manarBoysSayh: "mrb-boys-sayh",
  manarBoysFaleh: "mrb-boys-faleh",
};

function normalizeSchoolId(value) {
  const schoolId = asString(value);
  return SCHOOL_ID_ALIASES[schoolId] || schoolId;
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

function dataWithId(document) {
  return { id: document.id, path: document.ref.path, ...document.data() };
}

function assignmentKey(data) {
  return [
    asString(data.planId),
    asString(data.cycleId),
    asString(data.targetPersonId),
    asString(data.evaluatorPersonId),
  ].join("|");
}

function assignmentSummary(document) {
  const data = document.data();
  return {
    assignmentId: document.id,
    path: document.ref.path,
    rawSchoolId: asString(data.schoolId),
    normalizedSchoolId: normalizeSchoolId(data.schoolId),
    academicYearId: asString(data.academicYearId),
    termId: asString(data.termId),
    planId: asString(data.planId),
    cycleId: asString(data.cycleId),
    targetPersonId: asString(data.targetPersonId),
    evaluatorPersonId: asString(data.evaluatorPersonId),
    evaluatorEmail: normalizeEmail(data.evaluatorEmail),
    evaluatorRoleKey: asString(data.evaluatorRoleKey),
    targetRoleKey: asString(data.targetRoleKey),
    status: asString(data.status) || "ACTIVE",
    createdAt: data.createdAt ?? null,
    updatedAt: data.updatedAt ?? null,
  };
}

function planSummary(document) {
  const data = document.data();
  return {
    planId: document.id,
    path: document.ref.path,
    schoolId: asString(data.schoolId),
    academicYearId: asString(data.academicYearId),
    termId: asString(data.termId),
    frameworkId: asString(data.frameworkId),
    frameworkKind: asString(data.frameworkKind),
    planKind: asString(data.planKind),
    targetKind: asString(data.targetKind),
    status: asString(data.status),
    title: asString(data.title),
    createdAt: data.createdAt ?? null,
    updatedAt: data.updatedAt ?? null,
  };
}

function scopeMatches(data) {
  return (
    asString(data.schoolId) === CONFIG.school.id &&
    asString(data.academicYearId) === CONFIG.academicYearId &&
    asString(data.termId) === CONFIG.termId
  );
}

function assignmentScopeMatches(data) {
  return (
    normalizeSchoolId(data.schoolId) === CONFIG.school.id &&
    asString(data.academicYearId) === CONFIG.academicYearId &&
    asString(data.termId) === CONFIG.termId
  );
}

function assertPlannedAssignmentWritesAreManarGirls(writes) {
  const offendingDocuments = writes
    .filter((write) => normalizeSchoolId(write.data.schoolId) !== CONFIG.school.id)
    .map((write) => ({
      action: write.action,
      path: write.path,
      assignmentId: asString(write.data.id),
      rawSchoolId: asString(write.data.schoolId),
      normalizedSchoolId: normalizeSchoolId(write.data.schoolId),
      planId: asString(write.data.planId),
      cycleId: asString(write.data.cycleId),
      targetPersonId: asString(write.data.targetPersonId),
      evaluatorPersonId: asString(write.data.evaluatorPersonId),
    }));

  assert(
    offendingDocuments.length === 0,
    "Refusing to write evaluator assignments outside normalized Manar Girls scope.",
    {
      expectedNormalizedSchoolId: CONFIG.school.id,
      offendingDocuments,
      nextAction: "Do not apply. Confirm each assignment's schoolId alias and the configured Manar Girls scope.",
    },
  );
}

function toJsonValue(value) {
  if (value === undefined) return null;
  if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) return value.map(toJsonValue);
  if (typeof value === "object") {
    if (typeof value.toMillis === "function") return value.toMillis();
    if (value instanceof Date) return value.toISOString();
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, toJsonValue(item)]));
  }
  return String(value);
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function countByPlanId(assignments, sourceField) {
  return asArray(assignments).reduce((counts, assignment) => {
    const source = sourceField ? assignment[sourceField] : assignment;
    const planId = asString(source?.planId) || "(missing)";
    counts[planId] = (counts[planId] || 0) + 1;
    return counts;
  }, {});
}

function countFromReportValue(value) {
  return Array.isArray(value) ? value.length : readNumber(value, 0);
}

function reportPlanId(report, expectedPlanId) {
  const selectedSupervisorPlan = asArray(report.selectedSupervisorTeacherPlans)
    .map((entry) => entry?.plan || entry)
    .find((plan) => asString(plan?.planId) === expectedPlanId);
  const scopedPlan = asArray(report.plansForConfirmedManarGirlsSchoolId)
    .find((plan) => asString(plan?.planId) === expectedPlanId);
  const inspectedPlan = asArray(report.plansInspected)
    .find((plan) => asString(plan?.planId) === expectedPlanId);
  const plan = selectedSupervisorPlan || scopedPlan || inspectedPlan;
  return asString(plan?.planId);
}

function reportSchoolAssignmentCounts(report) {
  if (report.sayedAssignmentCountsByNormalizedSchoolId) {
    return report.sayedAssignmentCountsByNormalizedSchoolId;
  }
  const assignmentsBySchool = report.sayedEvaluatorAssignmentsBySchool || {};
  return Object.fromEntries(Object.entries(assignmentsBySchool).map(([schoolId, assignments]) => [
    schoolId,
    countFromReportValue(assignments),
  ]));
}

function countForSchool(counts, schoolId) {
  return readNumber(counts[schoolId], 0);
}

function appendPlanCounts(lines, label, counts) {
  const entries = Object.entries(counts).sort(([left], [right]) => left.localeCompare(right));
  if (entries.length === 0) {
    lines.push(`- ${label}: none`);
    return;
  }
  entries.forEach(([planId, count]) => lines.push(`- ${label} ${planId}: ${count}`));
}

function printFinalSummary(output) {
  const rawReport = output.report || {};
  const report = { ...(rawReport.sharedDiscovery || {}), ...rawReport };
  const mode = asString(output.mode) || "REPORT";
  const scope = report.configuredScope || {
    orgId: CONFIG.orgId,
    schoolId: CONFIG.school.id,
    academicYearId: CONFIG.academicYearId,
    termId: CONFIG.termId,
  };
  const supervisorDiagnosticPlanId = reportPlanId(report, CONFIG.supervisorTeacherPlans.find((plan) => plan.key === "diagnostic")?.id);
  const supervisorPeriodicPlanId = reportPlanId(report, CONFIG.supervisorTeacherPlans.find((plan) => plan.key === "periodic")?.id);
  const diagnosticVpSelection = report.vicePrincipalPeriodicTeacherEvaluationSelection || {};
  const vpPeriodicPlanId = asString(report.selectedVicePrincipalPeriodicTeacherPlan?.planId) ||
    asString(report.vicePrincipalPeriodicPlan?.planId) ||
    asString(diagnosticVpSelection.selectedPlan?.planId) ||
    asString(report.selectedVicePrincipalPeriodicTeacherPlanId);
  const vpAdminPlanId = asArray(report.excludedVicePrincipalAdminPlans)[0]?.planId ||
    asArray(diagnosticVpSelection.excludedAdminPlans)[0]?.planId ||
    asArray(report.excludedVicePrincipalAdminPlanIds)[0] || "";
  const sayedCounts = reportSchoolAssignmentCounts(report);
  const plannedMoves = asArray(report.toMoveFromSayedToNewSupervisor || report.assignmentsToMove);
  const plannedVpDisables = asArray(report.toDisableForVicePrincipalPeriodicTeacherEvaluation || report.vicePrincipalAssignmentsToDisable);
  const moveRemovalsByPlan = countByPlanId(plannedMoves, "from");
  const moveCreatesByPlan = countByPlanId(plannedMoves, "to");
  const vpDisablesByPlan = countByPlanId(plannedVpDisables);
  const vpCandidate = asArray(report.vicePrincipalCandidates || report.candidateVicePrincipalAssignmentsInManarGirls)
    .find((assignment) => asString(assignment.planId) === CONFIG.vicePrincipalPeriodicPlan.id) || plannedVpDisables[0];
  const plannedAssignmentWrites = [
    ...plannedMoves.flatMap((move) => [move.from, move.to]),
    ...plannedVpDisables,
  ];
  const writesOutsideGirls = plannedAssignmentWrites.filter((assignment) => {
    return normalizeSchoolId(assignment?.rawSchoolId || assignment?.normalizedSchoolId || assignment?.schoolId) !== CONFIG.school.id;
  });
  const boysWrites = plannedAssignmentWrites.filter((assignment) => {
    const schoolId = normalizeSchoolId(assignment?.rawSchoolId || assignment?.normalizedSchoolId || assignment?.schoolId);
    return schoolId === "mrb-boys-sayh" || schoolId === "mrb-boys-faleh";
  });
  const validation = report.validation || report.resultingActiveAssignmentWeightChecks || {};
  const validationChecks = asArray(validation.checks);
  const validationErrors = validationChecks.filter((check) => check?.valid === false).length + asArray(validation.errors).length;
  const validationWarnings = asArray(validation.warnings).length;
  const skippedHistorical = asArray(report.skippedHistoricalRecords);
  const requiredPlansMissing = [
    !supervisorDiagnosticPlanId && "supervisor diagnostic plan",
    !supervisorPeriodicPlanId && "supervisor periodic plan",
    !vpPeriodicPlanId && "VP periodic teacher plan",
    !vpAdminPlanId && "VP admin exclusion",
  ].filter(Boolean);
  const plannedActionCount = plannedMoves.length + plannedVpDisables.length;
  const decisionReasons = [];
  let decision;
  if (mode === "DIAGNOSE") {
    decision = "DIAGNOSE ONLY";
  } else if (!output.ok) {
    decision = "NOT SAFE TO APPLY";
    decisionReasons.push(asString(output.error?.message) || "script reported an error");
  } else if (mode === "DRY_RUN") {
    if (validationErrors > 0) decisionReasons.push(`validation errors: ${validationErrors}`);
    if (writesOutsideGirls.length > 0) decisionReasons.push(`planned writes outside mrb-girls: ${writesOutsideGirls.length}`);
    if (boysWrites.length > 0) decisionReasons.push(`boys planned writes: ${boysWrites.length}`);
    if (requiredPlansMissing.length > 0) decisionReasons.push(`missing required plans: ${requiredPlansMissing.join(", ")}`);
    if (plannedActionCount === 0) decisionReasons.push("no planned actions");
    decision = decisionReasons.length === 0 ? "SAFE TO APPLY" : "NOT SAFE TO APPLY";
  } else {
    decision = output.ok ? "SAFE TO APPLY" : "NOT SAFE TO APPLY";
  }

  const lines = [
    "==============================",
    "Girls Evaluation Update Summary",
    "==============================",
    `Mode: ${mode}`,
    `JSON report: ${output.reportFile}`,
    "",
    "Scope:",
    `- orgId: ${asString(scope.orgId) || "MISSING"}`,
    `- schoolId: ${asString(scope.schoolId) || "MISSING"}`,
    `- academicYearId: ${asString(scope.academicYearId) || "MISSING"}`,
    `- termId: ${asString(scope.termId) || "MISSING"}`,
    "",
    "Selected plans:",
    `- Supervisor diagnostic: ${supervisorDiagnosticPlanId || "MISSING"}`,
    `- Supervisor periodic: ${supervisorPeriodicPlanId || "MISSING"}`,
    `- VP periodic teacher: ${vpPeriodicPlanId || "MISSING"}`,
    `- VP admin excluded: ${vpAdminPlanId || "NONE"}`,
    "",
    "Sayed:",
    `- personId: ${asString(report.currentSupervisor?.personId) || CONFIG.oldSupervisor.personId}`,
    `- mrb-girls assignments: ${countForSchool(sayedCounts, "mrb-girls")}`,
    `- mrb-boys-sayh assignments: ${countForSchool(sayedCounts, "mrb-boys-sayh")}`,
    `- mrb-boys-faleh assignments: ${countForSchool(sayedCounts, "mrb-boys-faleh")}`,
  ];
  appendPlanCounts(lines, "to remove from Sayed", moveRemovalsByPlan);
  lines.push(
    "",
    "New supervisor:",
    `- uid: ${CONFIG.newSupervisor.uid}`,
    `- personId: ${asString(report.newSupervisor?.personId) || CONFIG.newSupervisor.personId}`,
  );
  appendPlanCounts(lines, "to create", moveCreatesByPlan);
  lines.push(
    "",
    "Vice principal:",
    `- evaluator: ${asString(vpCandidate?.evaluatorPersonId) || "MISSING"} / ${asString(vpCandidate?.evaluatorRoleKey) || "MISSING"}`,
  );
  appendPlanCounts(lines, "to remove", vpDisablesByPlan);
  lines.push(
    "- ADMIN VP plan touched: NO",
    "",
    "Safety:",
    `- planned writes outside mrb-girls: ${writesOutsideGirls.length}`,
    `- boys planned writes: ${boysWrites.length}`,
    `- skipped because submission exists: ${skippedHistorical.filter((record) => record.reason === "submission exists").length}`,
    `- validation errors: ${validationErrors}`,
    `- validation warnings: ${validationWarnings}`,
    "",
    `Decision: ${decision}`,
  );
  if (mode === "APPLY") {
    lines.push(`Applied: ${output.ok ? "completed without reported errors" : "errors occurred"}`);
    if (output.applied) {
      lines.push(`- assignments moved: ${readNumber(output.applied.assignmentsMoved, 0)}`);
      lines.push(`- VP assignments removed: ${readNumber(output.applied.vicePrincipalAssignmentsRemoved, 0)}`);
    }
  }
  if (decisionReasons.length > 0) lines.push(`Reasons: ${decisionReasons.join("; ")}`);
  console.log(`\n${lines.join("\n")}\n`);
}

function emitJson(report) {
  const mode = asString(report?.mode).toLowerCase() || "report";
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const reportsDirectory = path.resolve(process.cwd(), "reports");
  const fileName = `update-girls-evaluation-distribution-${mode}-${timestamp}.json`;
  const reportPath = path.join(reportsDirectory, fileName);
  const output = {
    ...toJsonValue(report),
    reportFile: path.relative(process.cwd(), reportPath).replace(/\\/g, "/"),
  };
  const json = `${JSON.stringify(output, null, 2)}\n`;

  fs.mkdirSync(reportsDirectory, { recursive: true });
  fs.writeFileSync(reportPath, json, "utf8");
  printFinalSummary(output);
}

async function readRequiredDoc(db, documentPath, label) {
  const snapshot = await db.doc(documentPath).get();
  assert(snapshot.exists, `${label} not found: ${documentPath}`);
  return snapshot;
}

async function loadActor(db, orgRoot, actor, options) {
  const [authUser, user, person, membership, operations] = await Promise.all([
    admin.auth().getUser(actor.uid),
    readRequiredDoc(db, `users/${actor.uid}`, `${options.label} user`),
    readRequiredDoc(db, `${orgRoot}/people/${actor.personId}`, `${options.label} person`),
    readRequiredDoc(db, `users/${actor.uid}/orgMemberships/${CONFIG.orgId}`, `${options.label} membership`),
    db.collection(`${orgRoot}/operationalAssignments`).where("actorPersonId", "==", actor.personId).get(),
  ]);
  const userData = user.data();
  const personData = person.data();
  const membershipData = membership.data();
  const emails = [authUser.email, userData.email, personData.email]
    .map(normalizeEmail)
    .filter(Boolean);
  const uniqueEmails = [...new Set(emails)];
  const roleKey = asString(membershipData.roleKey || membershipData.role).toUpperCase();
  const matchingOperations = operations.docs.filter((document) => {
    const data = document.data();
    return (
      isActive(data) &&
      asString(data.operationKind) === "STAFF_EVALUATION" &&
      asString(data.schoolId || data.scopeId) === CONFIG.school.id
    );
  });
  const matchingOperation = options.expectedOperationalAssignmentId
    ? matchingOperations.find((document) => document.id === options.expectedOperationalAssignmentId)
    : matchingOperations[0];

  assert(uniqueEmails.length === 1, `${options.label} email identity is incomplete or inconsistent.`, {
    actor,
    authEmail: authUser.email || null,
    userEmail: userData.email || null,
    personEmail: personData.email || null,
  });
  assert(asString(personData.displayName), `${options.label} person displayName is missing.`);
  if (options.expectedEmail) {
    assert(uniqueEmails[0] === options.expectedEmail, `${options.label} email mismatch.`, {
      actor,
      expectedEmail: options.expectedEmail,
      actualEmail: uniqueEmails[0],
    });
  }
  assert(asString(userData.personId) === actor.personId, `${options.label} user personId mismatch.`, {
    expected: actor.personId,
    actual: userData.personId || null,
  });
  assert(asString(membershipData.personId) === actor.personId, `${options.label} membership personId mismatch.`, {
    expected: actor.personId,
    actual: membershipData.personId || null,
  });
  assert(isActive(membershipData), `${options.label} membership is inactive.`);
  assert(membershipCoversSchool(membershipData, CONFIG.school.id), `${options.label} does not cover ${CONFIG.school.id}.`);
  assert(membershipData.permissions?.manageEvaluations === true, `${options.label} is missing manageEvaluations.`);
  assert(matchingOperation, `${options.label} is missing active STAFF_EVALUATION for ${CONFIG.school.id}.`, {
    actor,
    operations: operations.docs.map(dataWithId),
  });
  if (options.expectedOperationalAssignmentId) {
    assert(
      matchingOperation.id === options.expectedOperationalAssignmentId,
      `${options.label} Manar Girls STAFF_EVALUATION assignment mismatch.`,
      {
        expectedOperationalAssignmentId: options.expectedOperationalAssignmentId,
        actualOperationalAssignmentId: matchingOperation.id,
      },
    );
  }
  if (options.expectedRoleKey) {
    assert(roleKey === options.expectedRoleKey, `${options.label} role mismatch.`, {
      expectedRoleKey: options.expectedRoleKey,
      actualRoleKey: roleKey || null,
    });
  }

  return {
    uid: actor.uid,
    personId: actor.personId,
    email: uniqueEmails[0],
    displayName: asString(personData.displayName),
    roleKey,
    roleLabel: asString(membershipData.roleLabel || membershipData.roleName || membershipData.title),
    operationId: matchingOperation.id,
  };
}

function assertPlan(document, expected, label, report) {
  assert(document, `${label} not found.`, report);
  const data = document.data();
  assert(
    scopeMatches(data) &&
      asString(data.frameworkId) === expected.frameworkId &&
      asString(data.planKind) === expected.planKind &&
      asString(data.targetKind) === expected.targetKind &&
      (!expected.title || asString(data.title) === expected.title),
    `${label} does not match the seeded reference shape.`,
    { expected, actual: planSummary(document), ...report },
  );
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

function readNumber(value, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function clampPercentage(value) {
  return Math.min(Math.max(value, 0), 100);
}

function backendActive(data) {
  return asString(data.status) === "ACTIVE";
}

function diagnosticPlanSummary(document, reasons = []) {
  if (!document.exists) {
    return { planId: document.id, path: document.ref.path, exists: false, reasons };
  }
  return { exists: true, reasons, ...planSummary(document) };
}

function planSearchText(data) {
  return [
    data.id,
    data.title,
    data.name,
    data.description,
    data.schoolLabel,
    data.schoolName,
    data.schoolTitle,
    data.frameworkId,
    data.frameworkKind,
    data.planKind,
  ].map(asString).join(" ").toLowerCase();
}

function manarGirlsTitleReasons(data) {
  const text = planSearchText(data);
  const reasons = [];
  if (text.includes(CONFIG.school.id.toLowerCase())) reasons.push("id/title/name references mrb-girls");
  if (text.includes(CONFIG.school.label.toLowerCase())) reasons.push("id/title/name contains the confirmed school label");
  if (text.includes("منار الريادة") && text.includes("بنات")) reasons.push("id/title/name contains Manar Al-Riyada and girls terms");
  return reasons;
}

function periodicReasons(data) {
  const reasons = [];
  const planKind = asString(data.planKind).toUpperCase();
  const frameworkKind = asString(data.frameworkKind).toUpperCase();
  const text = planSearchText(data);
  if (planKind === "PERIODIC") reasons.push("planKind=PERIODIC");
  if (frameworkKind.includes("PERIODIC")) reasons.push("frameworkKind includes PERIODIC");
  if (asString(data.frameworkId).toLowerCase().includes("periodic")) reasons.push("frameworkId includes periodic");
  if (text.includes("الفتر") || text.includes("دوري") || text.includes("periodic")) reasons.push("title/name/framework text appears periodic/fatri");
  return reasons;
}

function vicePrincipalPeriodicTeacherReasons(data) {
  const planId = asString(data.id);
  const frameworkId = asString(data.frameworkId);
  const title = asString(data.title);
  const planKind = asString(data.planKind).toUpperCase();
  const targetKind = asString(data.targetKind).toUpperCase();
  const reasons = [];

  if (!scopeMatches(data)) return reasons;
  if (planKind && planKind !== "PERIODIC") return reasons;
  if (targetKind !== "TEACHER") return reasons;
  if (planId === CONFIG.excludedVicePrincipalAdminPlan.id) return reasons;

  if (planId === CONFIG.vicePrincipalPeriodicPlan.id) reasons.push("planId matches the seeded VP periodic teacher plan");
  if (frameworkId === CONFIG.vicePrincipalPeriodicPlan.frameworkId) reasons.push("frameworkId matches the seeded VP periodic teacher framework");
  if (planId.includes("vice-principal-periodic-teacher-evaluation")) reasons.push("planId indicates a vice-principal periodic teacher evaluation");
  if (frameworkId.includes("vice-principal-periodic-teacher-evaluation")) reasons.push("frameworkId indicates a vice-principal periodic teacher evaluation");
  if (title.includes("وكيلة") && title.includes("معلمات") && title.includes("فتر")) reasons.push("title indicates the vice-principal periodic teacher evaluation");

  return reasons;
}

function isConfiguredVicePrincipalPeriodicTeacherPlan(data) {
  return (
    scopeMatches(data) &&
    asString(data.id) === CONFIG.vicePrincipalPeriodicPlan.id &&
    asString(data.frameworkId) === CONFIG.vicePrincipalPeriodicPlan.frameworkId &&
    asString(data.planKind).toUpperCase() === CONFIG.vicePrincipalPeriodicPlan.planKind &&
    asString(data.targetKind).toUpperCase() === CONFIG.vicePrincipalPeriodicPlan.targetKind &&
    asString(data.id) !== CONFIG.excludedVicePrincipalAdminPlan.id
  );
}

function vicePrincipalAdminExclusionReason(data) {
  if (asString(data.id) !== CONFIG.excludedVicePrincipalAdminPlan.id) return "";
  if (asString(data.targetKind).toUpperCase() !== CONFIG.excludedVicePrincipalAdminPlan.targetKind) {
    return "Known admin-plan ID has unexpected targetKind; refusing to treat it as a teacher-evaluation candidate.";
  }
  return CONFIG.excludedVicePrincipalAdminPlan.reason;
}

function summarizeGirlsAssignments(documents) {
  const groups = new Map();
  for (const document of documents) {
    const data = document.data();
    const evaluatorPersonId = asString(data.evaluatorPersonId) || "(missing)";
    const evaluatorRoleKey = asString(data.evaluatorRoleKey) || "(missing)";
    const key = `${evaluatorPersonId}|${evaluatorRoleKey}`;
    const group = groups.get(key) ?? {
      evaluatorPersonId,
      evaluatorRoleKey,
      totalAssignments: 0,
      countByPlanId: {},
      countByStatus: {},
      countByRawSchoolId: {},
      countByNormalizedSchoolId: {},
      sampleAssignmentIds: [],
    };
    const planId = asString(data.planId) || "(missing)";
    const status = asString(data.status) || "(missing)";
    const rawSchoolId = asString(data.schoolId) || "(missing)";
    const normalizedSchoolId = normalizeSchoolId(data.schoolId) || "(missing)";
    group.totalAssignments += 1;
    group.countByPlanId[planId] = (group.countByPlanId[planId] || 0) + 1;
    group.countByStatus[status] = (group.countByStatus[status] || 0) + 1;
    group.countByRawSchoolId[rawSchoolId] = (group.countByRawSchoolId[rawSchoolId] || 0) + 1;
    group.countByNormalizedSchoolId[normalizedSchoolId] = (group.countByNormalizedSchoolId[normalizedSchoolId] || 0) + 1;
    if (group.sampleAssignmentIds.length < 10) group.sampleAssignmentIds.push(document.id);
    groups.set(key, group);
  }
  return [...groups.values()].sort((left, right) => {
    return left.evaluatorPersonId.localeCompare(right.evaluatorPersonId) || left.evaluatorRoleKey.localeCompare(right.evaluatorRoleKey);
  });
}

function countAssignmentsByNormalizedSchoolId(documents) {
  return documents.reduce((counts, document) => {
    const schoolId = normalizeSchoolId(document.data().schoolId) || "(missing)";
    counts[schoolId] = (counts[schoolId] || 0) + 1;
    return counts;
  }, {});
}

function uniqueDocumentsByPath(documents) {
  return [...new Map(documents.map((document) => [document.ref.path, document])).values()];
}

function buildDiagnosticConclusion(params) {
  const schoolPlansAbsent = params.schoolPlans.length === 0;
  const scopedPlansAbsent = params.scopedPlans.length === 0;
  const assignmentsHaveMismatchedPlans = params.referencedPlanSnapshots.some((snapshot) => {
    return !snapshot.exists || !scopeMatches(snapshot.data());
  });
  const sayedHasGirlsAssignments = params.sayedGirlsAssignments.length > 0;
  let recommendedNextAction;
  if (schoolPlansAbsent && params.girlsAssignments.length === 0) {
    recommendedNextAction = "Do not apply. Confirm the actual evaluation school scope and seed source before changing configuration.";
  } else if (scopedPlansAbsent && params.schoolPlans.length > 0) {
    recommendedNextAction = "Do not apply. Review the printed academicYearId and termId values, then explicitly choose the confirmed scope.";
  } else if (assignmentsHaveMismatchedPlans) {
    recommendedNextAction = "Do not apply. Repair or confirm the assignment-to-plan metadata mismatch before any reassignment.";
  } else if (!sayedHasGirlsAssignments) {
    recommendedNextAction = "Do not apply the transfer. Confirm whether السيد should first receive Manar Girls evaluator assignments.";
  } else {
    recommendedNextAction = "Configured Manar Girls scope contains plans. Review the candidates and proceed to the normal dry run for the planned changes.";
  }
  return {
    manarGirlsPlansAbsent: schoolPlansAbsent,
    configuredAcademicYearTermHasNoPlans: scopedPlansAbsent,
    assignmentsPointToMissingOrDifferentlyScopedPlans: assignmentsHaveMismatchedPlans,
    sayedCurrentlyHasNoManarGirlsEvaluatorAssignments: !sayedHasGirlsAssignments,
    recommendedNextAction,
  };
}

function discoveryReport(discovery) {
  return {
    configuredScope: {
      orgId: CONFIG.orgId,
      schoolId: CONFIG.school.id,
      academicYearId: CONFIG.academicYearId,
      termId: CONFIG.termId,
    },
    confirmedPlanIds: discovery.scopedPlans.map((document) => document.id),
    selectedSupervisorTeacherPlans: discovery.selectedSupervisorTeacherPlans.map(({ expected, plan }) => ({
      key: expected.key,
      planId: plan?.id || null,
    })),
    selectedVicePrincipalPeriodicTeacherPlanId: discovery.vpPeriodicTeacherPlanCandidates.length === 1
      ? discovery.vpPeriodicTeacherPlanCandidates[0].id
      : null,
    excludedVicePrincipalAdminPlanIds: discovery.excludedVicePrincipalAdminPlans.map((document) => document.id),
    sayedAssignmentCountsByNormalizedSchoolId: discovery.sayedAssignmentCountsByNormalizedSchoolId,
  };
}

async function discoverManarGirlsEvaluationData(db) {
  const orgRoot = `orgs/${CONFIG.orgId}`;
  const [schoolSnapshot, schoolPlansSnapshot, sayedAssignmentsSnapshot, canonicalGirlsAssignmentsSnapshot, legacyGirlsAssignmentsSnapshot] = await Promise.all([
    db.doc(`${orgRoot}/schools/${CONFIG.school.id}`).get(),
    db.collection(`${orgRoot}/evaluationPlans`).where("schoolId", "==", CONFIG.school.id).get(),
    db.collection(`${orgRoot}/evaluationEvaluatorAssignments`).where("evaluatorPersonId", "==", CONFIG.oldSupervisor.personId).get(),
    db.collection(`${orgRoot}/evaluationEvaluatorAssignments`).where("schoolId", "==", CONFIG.school.id).get(),
    db.collection(`${orgRoot}/evaluationEvaluatorAssignments`).where("schoolId", "==", "manarGirls").get(),
  ]);
  const schoolPlans = schoolPlansSnapshot.docs;
  const scopedPlans = schoolPlans.filter((document) => scopeMatches(document.data()));
  const plansById = new Map(scopedPlans.map((document) => [document.id, document]));
  const selectedSupervisorTeacherPlans = CONFIG.supervisorTeacherPlans.map((expected) => ({
    expected,
    plan: plansById.get(expected.id),
  }));
  const vpPeriodicTeacherCandidates = scopedPlans.filter((document) => {
    return isConfiguredVicePrincipalPeriodicTeacherPlan({ id: document.id, ...document.data() });
  });
  const excludedVicePrincipalAdminPlans = scopedPlans.filter((document) => {
    return Boolean(vicePrincipalAdminExclusionReason({ id: document.id, ...document.data() }));
  });
  const sayedAssignments = sayedAssignmentsSnapshot.docs;
  const girlsAssignments = uniqueDocumentsByPath([
    ...canonicalGirlsAssignmentsSnapshot.docs,
    ...legacyGirlsAssignmentsSnapshot.docs,
  ]);
  const vpPeriodicTeacherAssignments = girlsAssignments.filter((document) => {
    const data = document.data();
    return (
      assignmentScopeMatches(data) &&
      asString(data.planId) === CONFIG.vicePrincipalPeriodicPlan.id
    );
  });
  const sayedAssignmentCountsByNormalizedSchoolId = countAssignmentsByNormalizedSchoolId(sayedAssignments);

  return {
    orgRoot,
    schoolSnapshot,
    schoolPlans,
    scopedPlans,
    selectedSupervisorTeacherPlans,
    vpPeriodicTeacherPlanCandidates,
    excludedVicePrincipalAdminPlans,
    sayedAssignments,
    sayedAssignmentCountsByNormalizedSchoolId,
    girlsAssignments,
    vpPeriodicTeacherAssignments,
  };
}

async function buildDiagnostic(db) {
  const discovery = await discoverManarGirlsEvaluationData(db);
  const { orgRoot, schoolPlans, scopedPlans, sayedAssignments, girlsAssignments } = discovery;
  const allPlansSnapshot = await db.collection(`${orgRoot}/evaluationPlans`).get();
  const titleRelatedPlans = allPlansSnapshot.docs.filter((document) => {
    return asString(document.data().schoolId) !== CONFIG.school.id && manarGirlsTitleReasons(document.data()).length > 0;
  });
  const sayedAssignmentsBySchool = {
    "mrb-girls": sayedAssignments.filter((document) => normalizeSchoolId(document.data().schoolId) === "mrb-girls").map(assignmentSummary),
    "mrb-boys-sayh": sayedAssignments.filter((document) => normalizeSchoolId(document.data().schoolId) === "mrb-boys-sayh").map(assignmentSummary),
    "mrb-boys-faleh": sayedAssignments.filter((document) => normalizeSchoolId(document.data().schoolId) === "mrb-boys-faleh").map(assignmentSummary),
    missingOrOther: sayedAssignments.filter((document) => {
      const schoolId = normalizeSchoolId(document.data().schoolId);
      return ![CONFIG.school.id, "mrb-boys-sayh", "mrb-boys-faleh"].includes(schoolId);
    }).map(assignmentSummary),
  };
  const referencedPlanIds = [...new Set(girlsAssignments.map((document) => asString(document.data().planId)).filter(Boolean))];
  const referencedPlanSnapshots = referencedPlanIds.length
    ? await db.getAll(...referencedPlanIds.map((planId) => db.doc(`${orgRoot}/evaluationPlans/${planId}`)))
    : [];
  const planById = new Map(referencedPlanSnapshots.map((document) => [document.id, document]));
  const vicePrincipalCandidates = girlsAssignments.filter((document) => {
    const roleKey = asString(document.data().evaluatorRoleKey).toUpperCase();
    return roleKey === "GIRLS_VP" || roleKey.includes("VICE_PRINCIPAL") || roleKey.endsWith("_VP");
  }).map((document) => {
    const assignment = assignmentSummary(document);
    const plan = planById.get(assignment.planId);
    const reasons = plan?.exists ? periodicReasons(plan.data()) : ["referenced plan is missing"];
    return {
      ...assignment,
      planTitle: plan?.exists ? asString(plan.data().title) : "",
      appearsPeriodicOrFatri: reasons.length > 0,
      periodicReasons: reasons,
    };
  });
  const periodicCandidates = uniqueDocumentsByPath([
    ...schoolPlans,
    ...titleRelatedPlans,
    ...referencedPlanSnapshots.filter((document) => document.exists),
  ]).map((document) => {
    const reasons = periodicReasons(document.data());
    return diagnosticPlanSummary(document, reasons);
  }).filter((plan) => plan.reasons.length > 0);

  return {
    diagnosticMode: true,
    configuredScope: {
      orgId: CONFIG.orgId,
      schoolId: CONFIG.school.id,
      academicYearId: CONFIG.academicYearId,
      termId: CONFIG.termId,
    },
    plansForConfirmedManarGirlsSchoolId: schoolPlans.map((document) => diagnosticPlanSummary(document, ["schoolId=mrb-girls"])),
    plansRelatedByTitleOrNameWithMissingOrDifferentSchoolId: titleRelatedPlans.map((document) => {
      return diagnosticPlanSummary(document, manarGirlsTitleReasons(document.data()));
    }),
    allSayedEvaluatorAssignments: sayedAssignments.map(assignmentSummary),
    sayedEvaluatorAssignmentsBySchool: sayedAssignmentsBySchool,
    allManarGirlsEvaluatorAssignments: {
      total: girlsAssignments.length,
      groupedByEvaluatorPersonIdAndRoleKey: summarizeGirlsAssignments(girlsAssignments),
    },
    plansReferencedByManarGirlsEvaluatorAssignments: referencedPlanSnapshots.map((document) => diagnosticPlanSummary(document, ["referenced by an evaluator assignment normalized to schoolId=mrb-girls"])),
    vicePrincipalPeriodicTeacherEvaluationSelection: {
      selectedPlan: discovery.vpPeriodicTeacherPlanCandidates.length === 1
        ? diagnosticPlanSummary(
          discovery.vpPeriodicTeacherPlanCandidates[0],
          vicePrincipalPeriodicTeacherReasons({ id: discovery.vpPeriodicTeacherPlanCandidates[0].id, ...discovery.vpPeriodicTeacherPlanCandidates[0].data() }),
        )
        : null,
      candidates: discovery.vpPeriodicTeacherPlanCandidates.map((document) => diagnosticPlanSummary(
        document,
        vicePrincipalPeriodicTeacherReasons({ id: document.id, ...document.data() }),
      )),
      excludedAdminPlans: discovery.excludedVicePrincipalAdminPlans.map((document) => diagnosticPlanSummary(
        document,
        [vicePrincipalAdminExclusionReason({ id: document.id, ...document.data() })],
      )),
    },
    candidateVicePrincipalAssignmentsInManarGirls: vicePrincipalCandidates,
    candidatePeriodicOrFatriPlansForManarGirls: periodicCandidates,
    conclusion: buildDiagnosticConclusion({
      schoolPlans,
      scopedPlans,
      girlsAssignments,
      sayedGirlsAssignments: sayedAssignmentsBySchool["mrb-girls"],
      referencedPlanSnapshots,
    }),
    sharedDiscovery: discoveryReport(discovery),
  };
}

async function buildDiagnosticReport(db, reason) {
  return {
    ok: true,
    mode: "DIAGNOSE",
    readOnly: true,
    reason,
    report: await buildDiagnostic(db),
  };
}

function assignmentGroupKey(data) {
  return [
    normalizeSchoolId(data.schoolId),
    asString(data.planId),
    asString(data.cycleId),
    asString(data.targetPersonId),
  ].join("|");
}

function activeAssignmentWeightCheck(params) {
  const active = params.assignments.filter((assignment) => backendActive(assignment.data));
  const evaluatorPersonIds = active.map((assignment) => asString(assignment.data.evaluatorPersonId));
  const duplicateEvaluatorPersonIds = [...new Set(evaluatorPersonIds.filter((personId, index) => {
    return personId && evaluatorPersonIds.indexOf(personId) !== index;
  }))];
  const missingEvaluatorAssignments = active.filter((assignment) => !asString(assignment.data.evaluatorPersonId));
  const totalWeight = active.reduce((total, assignment) => {
    return total + clampPercentage(readNumber(assignment.data.weight, 100));
  }, 0);
  const fullyDisabled = active.length === 0 && params.allowNoActive === true;
  const valid = fullyDisabled || (
    active.length > 0 &&
    missingEvaluatorAssignments.length === 0 &&
    duplicateEvaluatorPersonIds.length === 0 &&
    Math.abs(totalWeight - 100) <= 0.001
  );
  return {
    group: params.group,
    action: params.action,
    allowNoActive: params.allowNoActive === true,
    fullyDisabled,
    valid,
    activeAssignments: active.map((assignment) => ({
      id: assignment.id,
      evaluatorPersonId: asString(assignment.data.evaluatorPersonId),
      evaluatorRoleKey: asString(assignment.data.evaluatorRoleKey),
      weight: clampPercentage(readNumber(assignment.data.weight, 100)),
      status: asString(assignment.data.status),
    })),
    totalActiveWeight: totalWeight,
    duplicateEvaluatorPersonIds,
    missingEvaluatorAssignmentIds: missingEvaluatorAssignments.map((assignment) => assignment.id),
  };
}

async function validateResultingActiveAssignmentWeights(db, orgRoot, params) {
  const affectedGroups = new Map();
  const ensureGroup = (data, action, allowNoActive) => {
    const key = assignmentGroupKey(data);
    const group = affectedGroups.get(key) ?? {
      group: {
        schoolId: normalizeSchoolId(data.schoolId),
        planId: asString(data.planId),
        cycleId: asString(data.cycleId),
        targetPersonId: asString(data.targetPersonId),
      },
      action,
      allowNoActive,
      removePaths: new Set(),
      replacements: new Map(),
    };
    affectedGroups.set(key, group);
    return group;
  };

  params.moves.forEach((move) => {
    const group = ensureGroup(move.source.data(), "move evaluator assignment", false);
    group.removePaths.add(move.source.ref.path);
    group.replacements.set(move.replacementRef.path, {
      id: move.replacementData.id,
      path: move.replacementRef.path,
      data: { ...move.replacementData, status: "ACTIVE" },
    });
  });
  params.vpDisables.forEach((source) => {
    const group = ensureGroup(source.data(), "disable vice-principal periodic assignment", true);
    group.removePaths.add(source.ref.path);
  });

  const cycleIds = [...new Set([...affectedGroups.values()].map((group) => group.group.cycleId).filter(Boolean))];
  const byCycle = new Map();
  await Promise.all(cycleIds.map(async (cycleId) => {
    const snapshot = await db.collection(`${orgRoot}/evaluationEvaluatorAssignments`).where("cycleId", "==", cycleId).get();
    byCycle.set(cycleId, snapshot.docs);
  }));

  const checks = [];
  for (const group of affectedGroups.values()) {
    const current = (byCycle.get(group.group.cycleId) || []).filter((document) => {
      const data = document.data();
      return (
        normalizeSchoolId(data.schoolId) === group.group.schoolId &&
        asString(data.planId) === group.group.planId &&
        asString(data.cycleId) === group.group.cycleId &&
        asString(data.targetPersonId) === group.group.targetPersonId
      );
    }).map((document) => ({ id: document.id, path: document.ref.path, data: document.data() }));
    const simulated = new Map(current.map((assignment) => [assignment.path, assignment]));
    group.removePaths.forEach((path) => simulated.delete(path));
    group.replacements.forEach((assignment, path) => simulated.set(path, assignment));
    checks.push(activeAssignmentWeightCheck({
      group: group.group,
      action: group.action,
      allowNoActive: group.allowNoActive,
      assignments: [...simulated.values()],
    }));
  }

  const invalidChecks = checks.filter((check) => !check.valid);
  assert(invalidChecks.length === 0, "Resulting ACTIVE evaluator assignments cannot be proven valid for approval.", {
    approvalInvariant: "Each affected plan/cycle/target must have unique active evaluatorPersonId values and active weights totaling 100. Fully disabled vice-principal groups are allowed only because they have no submission and are intentionally removed.",
    invalidChecks,
    allChecks: checks,
    nextAction: "Do not apply. Resolve duplicate evaluators, missing evaluator IDs, or weights that do not total 100 for every listed group.",
  });
  return checks;
}

async function buildPreflight(db) {
  const discovery = await discoverManarGirlsEvaluationData(db);
  const { orgRoot, scopedPlans } = discovery;
  const oldSubmissionsSnapshot = await db
    .collection(`${orgRoot}/evaluationSubmissions`)
    .where("evaluatorPersonId", "==", CONFIG.oldSupervisor.personId)
    .get();
  const schoolCandidates = discovery.schoolSnapshot.exists ? [discovery.schoolSnapshot] : [];
  const candidatePeriodicPlans = scopedPlans
    .filter((document) => asString(document.data().planKind) === "PERIODIC")
    .map(planSummary);
  const vpPeriodicTeacherPlanCandidates = discovery.vpPeriodicTeacherPlanCandidates;
  const excludedVicePrincipalAdminPlans = discovery.excludedVicePrincipalAdminPlans;
  const candidateOldAssignments = discovery.sayedAssignments
    .filter(assignmentScopeMatches)
    .map(assignmentSummary);
  const candidateVicePrincipalAssignments = discovery.vpPeriodicTeacherAssignments.map(assignmentSummary);
  const commonReport = {
    schoolCandidates: schoolCandidates.map(dataWithId),
    candidatePeriodicPlans,
    vicePrincipalPeriodicTeacherPlanCandidates: vpPeriodicTeacherPlanCandidates.map((document) => ({
      plan: planSummary(document),
      matchReasons: vicePrincipalPeriodicTeacherReasons({ id: document.id, ...document.data() }),
    })),
    excludedVicePrincipalAdminPlans: excludedVicePrincipalAdminPlans.map((document) => ({
      plan: planSummary(document),
      exclusionReason: vicePrincipalAdminExclusionReason({ id: document.id, ...document.data() }),
    })),
    candidateVicePrincipalAssignments,
    candidateOldAssignments,
    sharedDiscovery: discoveryReport(discovery),
  };

  assert(
    schoolCandidates.length === 1 && schoolCandidates[0].id === CONFIG.school.id,
    "Could not uniquely confirm Manar Girls schoolId from the schools collection.",
    commonReport,
  );
  assert(scopedPlans.length > 0, "No Manar Girls evaluation plans found for the configured academic year and term.", commonReport);

  let oldSupervisor;
  let newSupervisor;
  try {
    oldSupervisor = await loadActor(db, orgRoot, CONFIG.oldSupervisor, {
      label: "Current supervisor السيد",
      expectedEmail: CONFIG.oldSupervisor.email,
      expectedRoleKey: CONFIG.oldSupervisor.roleKey,
      expectedOperationalAssignmentId: CONFIG.oldSupervisor.girlsOperationalAssignmentId,
    });
    newSupervisor = await loadActor(db, orgRoot, CONFIG.newSupervisor, {
      label: "New supervisor",
      expectedRoleKey: CONFIG.oldSupervisor.roleKey,
    });
  } catch (error) {
    if (error instanceof PreflightError) {
      throw new PreflightError(error.message, {
        ...commonReport,
        actorValidation: error.report || null,
      });
    }
    throw error;
  }
  assert(newSupervisor.roleKey === oldSupervisor.roleKey, "New supervisor role must match the existing evaluator policy role.", {
    oldSupervisor,
    newSupervisor,
    ...commonReport,
  });

  const selectedSupervisorTeacherPlans = discovery.selectedSupervisorTeacherPlans.map(({ expected, plan }) => {
    assertPlan(plan, expected, `Educational-supervisor ${expected.key} teacher plan`, commonReport);
    return { expected, plan };
  });
  assert(
    vpPeriodicTeacherPlanCandidates.length === 1,
    "Vice-principal periodic teacher-evaluation plan is missing or ambiguous.",
    {
      ...commonReport,
      nextAction: "Do not apply. Confirm the single TEACHER-target periodic vice-principal plan shown in the candidate list.",
    },
  );
  const vpPlan = vpPeriodicTeacherPlanCandidates[0];
  assertPlan(vpPlan, CONFIG.vicePrincipalPeriodicPlan, "Vice-principal periodic teacher-evaluation plan", commonReport);
  assert(
    vpPlan.id !== CONFIG.excludedVicePrincipalAdminPlan.id,
    "The principal-to-vice-principal ADMIN plan must never be selected for this update.",
    commonReport,
  );

  const vpSubmissionsSnapshot = await db
    .collection(`${orgRoot}/evaluationSubmissions`)
    .where("planId", "==", vpPlan.id)
    .get();

  const vpCandidates = discovery.vpPeriodicTeacherAssignments;
  assert(vpCandidates.length > 0, "Vice-principal periodic plan has no evaluator assignments.", { ...commonReport, vpCandidates: [] });
  assert(
    vpCandidates.every((document) => {
      const data = document.data();
      return (
        asString(data.evaluatorPersonId) === CONFIG.vicePrincipalPeriodicPlan.evaluatorPersonId &&
        asString(data.evaluatorRoleKey).toUpperCase() === CONFIG.vicePrincipalPeriodicPlan.evaluatorRoleKey
      );
    }),
    "Vice-principal periodic assignments do not match the seeded vice-principal reference.",
    { ...commonReport, vpCandidates: vpCandidates.map(assignmentSummary) },
  );

  const selectedSupervisorTeacherPlanIds = new Set(
    selectedSupervisorTeacherPlans.map(({ plan }) => plan.id),
  );
  const oldAssignments = discovery.sayedAssignments.filter(assignmentScopeMatches);
  const activeSelectedOldAssignments = oldAssignments.filter((document) => {
    return backendActive(document.data()) && selectedSupervisorTeacherPlanIds.has(asString(document.data().planId));
  });
  const untouchedOldAssignments = oldAssignments.filter((document) => {
    return backendActive(document.data()) && !selectedSupervisorTeacherPlanIds.has(asString(document.data().planId));
  });
  selectedSupervisorTeacherPlans.forEach(({ expected, plan }) => {
    assert(
      activeSelectedOldAssignments.some((assignment) => assignment.data().planId === plan.id),
      `No active السيد evaluator assignments found for the selected ${expected.key} teacher plan.`,
      {
        selectedSupervisorTeacherPlans: selectedSupervisorTeacherPlans.map((entry) => planSummary(entry.plan)),
        activeSelectedOldAssignments: activeSelectedOldAssignments.map(assignmentSummary),
        ...commonReport,
      },
    );
  });
  activeSelectedOldAssignments.forEach((document) => {
    assert(selectedSupervisorTeacherPlanIds.has(asString(document.data().planId)), "Selected السيد assignment is outside the confirmed teacher-plan set.", {
      assignment: assignmentSummary(document),
      ...commonReport,
    });
  });

  const oldSubmissionKeys = new Set(
    oldSubmissionsSnapshot.docs.filter(assignmentScopeMatches).map((document) => assignmentKey(document.data())),
  );
  const vpSubmissionKeys = new Set(
    vpSubmissionsSnapshot.docs.filter(assignmentScopeMatches).map((document) => assignmentKey(document.data())),
  );
  const moves = [];
  const skippedHistorical = [];
  for (const source of activeSelectedOldAssignments) {
    const data = source.data();
    if (oldSubmissionKeys.has(assignmentKey(data))) {
      skippedHistorical.push({ action: "move", reason: "submission exists", assignment: assignmentSummary(source) });
      continue;
    }
    const replacementId = `${asString(data.cycleId)}-${asString(data.targetPersonId)}-${newSupervisor.personId}`;
    const replacementRef = db.doc(`${orgRoot}/evaluationEvaluatorAssignments/${replacementId}`);
    const { createdAt, updatedAt, ...sourceData } = data;
    moves.push({
      source,
      replacementRef,
      replacementData: {
        ...sourceData,
        schoolId: CONFIG.school.id,
        id: replacementId,
        evaluatorPersonId: newSupervisor.personId,
        evaluatorEmail: newSupervisor.email,
        evaluatorRoleKey: newSupervisor.roleKey,
        status: "ACTIVE",
        ...(Object.prototype.hasOwnProperty.call(sourceData, "evaluatorDisplayName")
          ? { evaluatorDisplayName: newSupervisor.displayName }
          : {}),
      },
    });
  }
  const replacements = moves.length
    ? await db.getAll(...moves.map((move) => move.replacementRef))
    : [];
  const newMoveDocuments = [];
  const existingMoveDocuments = [];
  replacements.forEach((snapshot, index) => {
    const move = moves[index];
    if (!snapshot.exists) {
      newMoveDocuments.push(move);
      return;
    }
    assertExistingDocument(snapshot, { path: snapshot.ref.path, data: move.replacementData });
    assert(isActive(snapshot.data()), `Existing replacement assignment is not active: ${snapshot.ref.path}`);
    existingMoveDocuments.push(move);
  });

  const vpDisables = [];
  for (const source of vpCandidates.filter((document) => backendActive(document.data()))) {
    if (vpSubmissionKeys.has(assignmentKey(source.data()))) {
      skippedHistorical.push({ action: "disable vice-principal periodic", reason: "submission exists", assignment: assignmentSummary(source) });
      continue;
    }
    vpDisables.push(source);
  }

  const plannedAssignmentWrites = [
    ...moves.flatMap((move) => [
      { action: "create replacement evaluator assignment", path: move.replacementRef.path, data: move.replacementData },
      { action: "remove current supervisor evaluator assignment", path: move.source.ref.path, data: move.source.data() },
    ]),
    ...vpDisables.map((source) => ({
      action: "remove vice-principal periodic evaluator assignment",
      path: source.ref.path,
      data: source.data(),
    })),
  ];
  assertPlannedAssignmentWritesAreManarGirls(plannedAssignmentWrites);

  const resultingActiveAssignmentWeightChecks = await validateResultingActiveAssignmentWeights(db, orgRoot, {
    moves,
    vpDisables,
    plannedAssignmentWrites,
  });

  return {
    orgRoot,
    oldSupervisor,
    newSupervisor,
    schoolId: CONFIG.school.id,
    inspectedPlans: scopedPlans.map(planSummary),
    selectedSupervisorTeacherPlans: selectedSupervisorTeacherPlans.map(({ expected, plan }) => ({
      key: expected.key,
      sourceTemplateTitle: expected.sourceTemplateTitle,
      plan: planSummary(plan),
    })),
    vpPlan: planSummary(vpPlan),
    excludedVicePrincipalAdminPlans: excludedVicePrincipalAdminPlans.map(planSummary),
    moves,
    newMoveDocuments,
    existingMoveDocuments,
    vpDisables,
    skippedHistorical,
    resultingActiveAssignmentWeightChecks,
    untouchedOldAssignments: untouchedOldAssignments.map(assignmentSummary),
    candidatePeriodicPlans,
    candidateOldAssignments,
    vpCandidates: vpCandidates.map(assignmentSummary),
    sayedAssignmentCountsByNormalizedSchoolId: discovery.sayedAssignmentCountsByNormalizedSchoolId,
    sharedDiscovery: discoveryReport(discovery),
  };
}

function buildPreview(preflight) {
  const plannedMoves = preflight.moves.map((move) => ({
    from: assignmentSummary(move.source),
    to: {
      id: move.replacementData.id,
      path: move.replacementRef.path,
      rawSchoolId: asString(move.replacementData.schoolId),
      normalizedSchoolId: normalizeSchoolId(move.replacementData.schoolId),
      evaluatorPersonId: move.replacementData.evaluatorPersonId,
      evaluatorEmail: move.replacementData.evaluatorEmail,
    },
  }));
  const plannedVpDisables = preflight.vpDisables.map(assignmentSummary);
  const validation = {
    checkedGroups: preflight.resultingActiveAssignmentWeightChecks.length,
    checks: preflight.resultingActiveAssignmentWeightChecks,
    intentionallyFullyDisabledGroups: preflight.resultingActiveAssignmentWeightChecks
      .filter((check) => check.fullyDisabled)
      .map((check) => check.group),
  };

  return {
    dryRun: DRY_RUN,
    configuredScope: {
      orgId: CONFIG.orgId,
      schoolId: CONFIG.school.id,
      academicYearId: CONFIG.academicYearId,
      termId: CONFIG.termId,
    },
    manarGirlsSchoolId: preflight.schoolId,
    plansInspected: preflight.inspectedPlans,
    currentSupervisor: preflight.oldSupervisor,
    newSupervisor: preflight.newSupervisor,
    selectedSupervisorTeacherPlans: preflight.selectedSupervisorTeacherPlans,
    vicePrincipalPeriodicPlan: preflight.vpPlan,
    selectedVicePrincipalPeriodicTeacherPlan: preflight.vpPlan,
    excludedVicePrincipalAdminPlans: preflight.excludedVicePrincipalAdminPlans,
    sayedAssignmentCountsByNormalizedSchoolId: preflight.sayedAssignmentCountsByNormalizedSchoolId,
    toMoveFromSayedToNewSupervisor: plannedMoves,
    assignmentsToMove: plannedMoves,
    replacementAssignments: {
      create: preflight.newMoveDocuments.length,
      alreadyPresent: preflight.existingMoveDocuments.length,
    },
    toDisableForVicePrincipalPeriodicTeacherEvaluation: plannedVpDisables,
    vicePrincipalAssignmentsToDisable: plannedVpDisables,
    validation,
    resultingActiveAssignmentWeightChecks: validation,
    untouchedActiveSayedAssignments: preflight.untouchedOldAssignments,
    skippedHistoricalRecords: preflight.skippedHistorical,
    sharedDiscovery: preflight.sharedDiscovery,
    conclusion: {
      configuredAcademicYearTermHasNoPlans: false,
      selectedVicePrincipalPeriodicTeacherPlan: preflight.vpPlan.planId,
      recommendedNextAction: "Review the planned Manar Girls-only changes and validation, then use DRY_RUN=false only if approved.",
    },
    summary: {
      plansInspected: preflight.inspectedPlans.length,
      assignmentsToMove: plannedMoves.length,
      replacementAssignmentsToCreate: preflight.newMoveDocuments.length,
      replacementAssignmentsAlreadyPresent: preflight.existingMoveDocuments.length,
      vicePrincipalAssignmentsToDisable: plannedVpDisables.length,
      skippedHistoricalRecords: preflight.skippedHistorical.length,
      validationCheckedGroups: validation.checkedGroups,
    },
  };
}

async function applyMoves(db, preflight) {
  const now = Date.now();
  const allMoves = [...preflight.newMoveDocuments, ...preflight.existingMoveDocuments];
  for (const group of chunk(allMoves, 200)) {
    const batch = db.batch();
    group.forEach((move) => {
      if (preflight.newMoveDocuments.includes(move)) {
        batch.create(move.replacementRef, {
          ...move.replacementData,
          createdAt: now,
          updatedAt: now,
          migratedAt: now,
          migratedFromEvaluatorPersonId: preflight.oldSupervisor.personId,
        });
      }
      batch.update(move.source.ref, {
        status: "REMOVED",
        removedAt: now,
        removalReason: "Reassigned to the Manar Girls replacement educational supervisor.",
        replacementEvaluatorAssignmentId: move.replacementData.id,
        updatedAt: now,
      });
    });
    await batch.commit();
  }
}

async function disableVicePrincipalAssignments(db, preflight) {
  const now = Date.now();
  for (const group of chunk(preflight.vpDisables, 400)) {
    const batch = db.batch();
    group.forEach((source) => {
      batch.update(source.ref, {
        status: "REMOVED",
        removedAt: now,
        removalReason: "Manar Girls periodic vice-principal evaluation removed from future work.",
        updatedAt: now,
      });
    });
    await batch.commit();
  }
}

async function verifyApply(db, preflight) {
  const refs = [
    ...preflight.moves.map((move) => move.source.ref),
    ...preflight.vpDisables.map((document) => document.ref),
  ];
  const snapshots = refs.length ? await db.getAll(...refs) : [];
  snapshots.forEach((snapshot) => assert(asString(snapshot.data()?.status) === "REMOVED", `Expected REMOVED status at ${snapshot.ref.path}.`));
}

async function main() {
  initAdmin();
  const db = admin.firestore();
  if (DIAGNOSE) {
    emitJson(await buildDiagnosticReport(db, "DIAGNOSE=true"));
    return;
  }

  let preflight;
  try {
    preflight = await buildPreflight(db);
  } catch (error) {
    if (
      error instanceof PreflightError &&
      error.message === "No Manar Girls evaluation plans found for the configured academic year and term."
    ) {
      const diagnostic = await buildDiagnosticReport(db, error.message);
      throw new PreflightError(error.message, {
        ...(error.report || {}),
        diagnostic,
      });
    }
    throw error;
  }
  const preview = buildPreview(preflight);

  if (DRY_RUN) {
    emitJson({
      ok: true,
      mode: "DRY_RUN",
      readOnly: true,
      report: preview,
      nextAction: "Review this report. Re-run with DRY_RUN=false only to apply the listed safe changes.",
    });
    return;
  }

  assertPlannedAssignmentWritesAreManarGirls(preflight.plannedAssignmentWrites);
  await applyMoves(db, preflight);
  await disableVicePrincipalAssignments(db, preflight);
  await verifyApply(db, preflight);

  emitJson({
    ok: true,
    mode: "APPLY",
    readOnly: false,
    report: preview,
    applied: {
      schoolId: preflight.schoolId,
      plansInspected: preflight.inspectedPlans.length,
      assignmentsMoved: preflight.moves.length,
      replacementAssignmentsCreated: preflight.newMoveDocuments.length,
      vicePrincipalAssignmentsRemoved: preflight.vpDisables.length,
      skippedHistoricalRecords: preflight.skippedHistorical.length,
    },
  });
}

main().catch((error) => {
  if (error instanceof PreflightError) {
    emitJson({
      ok: false,
      mode: DIAGNOSE ? "DIAGNOSE" : DRY_RUN ? "DRY_RUN" : "APPLY",
      readOnly: DIAGNOSE || DRY_RUN,
      error: {
        name: error.name,
        message: error.message,
      },
      report: error.report || null,
    });
  } else {
    emitJson({
      ok: false,
      mode: DIAGNOSE ? "DIAGNOSE" : DRY_RUN ? "DRY_RUN" : "APPLY",
      readOnly: DIAGNOSE || DRY_RUN,
      error: {
        name: error instanceof Error ? error.name : "Error",
        message: error instanceof Error ? error.message : String(error),
      },
    });
  }
  process.exitCode = 1;
});
