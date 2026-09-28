"use strict";

/*
 * Read-only production diagnostic for listMyTeachingPdfResources.
 * It performs Firestore reads only; no Auth, Firestore, Storage, or Functions
 * configuration is changed.
 *
 * Usage:
 *   node scripts/inspections/diagnose-teaching-pdf-resources.cjs
 *   node scripts/inspections/diagnose-teaching-pdf-resources.cjs --working-person-id=<personId>
 */

const admin = require("firebase-admin");
const fs = require("node:fs");
const path = require("node:path");
const {
  MembershipRole,
  PdfResourceSchema,
  TeacherAssignmentClassLinkSchema,
  TeacherAssignmentSchema,
} = require("../../packages/contracts/dist/index.js");
const {
  isTeacherTargetedByPdfResource,
  resolveActiveTeacherOfferingIds,
  TEACHER_PDF_RESOURCE_ROLE_KEYS,
} = require("../../packages/domain/dist/index.js");

const ORG_ID = "takween";
const TARGET_PERSON_ID = "p-r-albatel";
const TARGET_SCHOOL_ID = "kg-02";
const TEACHING_KINDS = ["ENRICHMENT_MATERIAL", "CURRICULUM_DISTRIBUTION"];
const NOW = Date.now();
const requestedWorkingPersonId = (process.argv.find((arg) => arg.startsWith("--working-person-id=")) || "")
  .slice("--working-person-id=".length)
  .trim();
const summaryOnly = process.argv.includes("--summary");
const briefOnly = process.argv.includes("--brief");
const includeLogs = process.argv.includes("--logs");
const logsOnly = process.argv.includes("--logs-only");

function initAdmin() {
  const serviceAccountPath = path.resolve(process.cwd(), "scripts", "service-account.json");
  if (!fs.existsSync(serviceAccountPath)) throw new Error(`Service account not found: ${serviceAccountPath}`);
  const serviceAccount = require(serviceAccountPath);
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    projectId: serviceAccount.project_id,
  });
}

async function fetchRuntimeLogs() {
  if (!includeLogs) return null;
  const projectId = admin.app().options.projectId;
  const functionName = `projects/${projectId}/locations/me-central2/functions/listMyTeachingPdfResources`;
  const accessToken = await admin.app().options.credential.getAccessToken();
  const request = async (url, options = {}) => {
    const response = await fetch(url, {
      ...options,
      headers: { Authorization: `Bearer ${accessToken.access_token}`, ...(options.headers || {}) },
      signal: AbortSignal.timeout(15000),
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(`${response.status} ${payload.error?.message || JSON.stringify(payload)}`);
    return payload;
  };
  try {
    let functionData = null;
    let functionMetadataError = "";
    let service = "listmyteachingpdfresources";
    try {
      functionData = await request(`https://cloudfunctions.googleapis.com/v2/${functionName}`);
      service = text(functionData.serviceConfig?.service).split("/").pop() || service;
    } catch (error) {
      functionMetadataError = error.message || String(error);
    }
    const filter = [
      'resource.type="cloud_run_revision"',
      `resource.labels.service_name="${service}"`,
      'severity>=ERROR',
      'timestamp>="2026-09-01T00:00:00Z"',
    ].join(" AND ");
    const loggingData = await request("https://logging.googleapis.com/v2/entries:list", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ resourceNames: [`projects/${projectId}`], filter, orderBy: "timestamp desc", pageSize: 100 }),
    });
    return {
      functionName, service, state: functionData?.state || "", updateTime: functionData?.updateTime || "",
      functionMetadataError, errorFilter: filter,
      entries: (loggingData.entries || []).map((entry) => ({
        timestamp: entry.timestamp || "", severity: entry.severity || "", insertId: entry.insertId || "",
        textPayload: entry.textPayload || "", jsonPayload: json(entry.jsonPayload || {}), labels: json(entry.labels || {}),
      })),
    };
  } catch (error) {
    return { functionName, error: error.name === "TimeoutError" ? "Cloud API request timed out after 15 seconds." : error.message || String(error) };
  }
}

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function record(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function timestamp(value) {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : undefined;
}

function json(value) {
  if (value === undefined) return null;
  if (value === null || typeof value !== "object") return value;
  if (value instanceof Date) return { __type: "Date", iso: value.toISOString(), millis: value.getTime() };
  if (typeof value.toMillis === "function" && typeof value.toDate === "function") {
    return { __type: "Timestamp", millis: value.toMillis(), iso: value.toDate().toISOString() };
  }
  if (Array.isArray(value)) return value.map(json);
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, json(item)]));
}

function issues(parsed) {
  return parsed.success ? [] : parsed.error.issues.map((issue) => ({
    path: issue.path.join("."),
    code: issue.code,
    message: issue.message,
    expected: issue.expected,
    received: issue.received,
  }));
}

function activeMembership(membership, now) {
  if (membership.isActive === false || membership.active === false) return false;
  const startAt = timestamp(membership.startAt);
  const endAt = timestamp(membership.endAt);
  return !(startAt !== undefined && startAt > now) && !(endAt !== undefined && endAt < now);
}

function membershipDetails(snapshot) {
  const raw = snapshot.data() || {};
  const parsedRole = MembershipRole.safeParse(text(raw.roleKey) || text(raw.role));
  const uid = snapshot.ref.parent.parent ? snapshot.ref.parent.parent.id : "";
  const scopes = record(raw.scopes);
  return {
    uid,
    membershipPath: snapshot.ref.path,
    raw: json(raw),
    extracted: {
      personId: text(raw.personId),
      role: text(raw.role),
      roleKey: text(raw.roleKey),
      resolvedRole: parsedRole.success ? parsedRole.data : "",
      roleParseIssues: issues(parsedRole),
      isActive: raw.isActive,
      active: raw.active,
      startAt: raw.startAt,
      endAt: raw.endAt,
      scopeType: text(raw.scopeType),
      scopeId: text(raw.scopeId),
      scopesSchoolIds: Array.isArray(scopes.schoolIds) ? scopes.schoolIds : [],
    },
    callableMembershipCheck: {
      active: activeMembership(raw, NOW),
      hasValidTeacherRole: parsedRole.success && TEACHER_PDF_RESOURCE_ROLE_KEYS.has(parsedRole.data),
      hasPersonId: Boolean(text(raw.personId)),
      passes: activeMembership(raw, NOW) && parsedRole.success &&
        TEACHER_PDF_RESOURCE_ROLE_KEYS.has(parsedRole.data) && Boolean(text(raw.personId)),
    },
  };
}

function assignmentReport(doc) {
  const raw = doc.data() || {};
  const parsed = TeacherAssignmentSchema.safeParse({ id: doc.id, ...raw });
  const data = parsed.success ? parsed.data : null;
  return {
    id: doc.id,
    path: doc.ref.path,
    raw: json(raw),
    schemaValid: parsed.success,
    zodIssues: issues(parsed),
    extracted: {
      status: text(raw.status), schoolId: text(raw.schoolId), academicYearId: text(raw.academicYearId),
      termId: text(raw.termId), classSubjectOfferingId: text(raw.classSubjectOfferingId),
      startAt: raw.startAt, endAt: raw.endAt,
    },
    parsed: data ? json(data) : null,
    activeAtNow: Boolean(data && data.status === "ACTIVE" && data.startAt <= NOW && (!data.endAt || data.endAt >= NOW)),
  };
}

function linkReport(doc) {
  const raw = doc.data() || {};
  const parsed = TeacherAssignmentClassLinkSchema.safeParse({ id: doc.id, ...raw });
  return {
    id: doc.id,
    path: doc.ref.path,
    raw: json(raw),
    schemaValid: parsed.success,
    zodIssues: issues(parsed),
    assignmentId: text(raw.assignmentId),
    classSubjectOfferingId: text(raw.classSubjectOfferingId),
    parsed: parsed.success ? json(parsed.data) : null,
  };
}

function chunks(items, size) {
  const result = [];
  for (let index = 0; index < items.length; index += size) result.push(items.slice(index, index + size));
  return result;
}

function targetingReasons(resource, context) {
  const audience = resource.audience;
  const reasons = [];
  if (resource.status !== "PUBLISHED") reasons.push("resource.status is not PUBLISHED");
  if (resource.orgId !== context.orgId) reasons.push("resource.orgId does not match caller org");
  if (audience.kind !== "STAFF_ROLES") reasons.push("audience.kind is not STAFF_ROLES");
  if (!audience.targetRoleKeys.some((role) => context.roleKeys.includes(role))) reasons.push("targetRoleKeys has no caller role");
  if (audience.schoolIds.length && !audience.schoolIds.some((id) => context.schoolIds.includes(id))) reasons.push("schoolIds has no active-assignment school");
  if (audience.academicYearId && !context.academicYearIds.includes(audience.academicYearId)) reasons.push("academicYearId has no active assignment match");
  if (audience.termId && !context.termIds.includes(audience.termId)) reasons.push("termId has no active assignment match");
  if (!audience.classSubjectOfferingIds.some((id) => context.teacherOfferingIds.includes(id))) reasons.push("classSubjectOfferingIds has no active teacher offering match");
  return reasons;
}

async function membershipForPerson(db, personId) {
  const snapshot = await db.collectionGroup("orgMemberships").where("personId", "==", personId).get();
  return snapshot.docs.filter((doc) => doc.id === ORG_ID && doc.ref.parent.parent?.id);
}

async function inspectTeacher(db, membershipSnapshot, resources) {
  const membership = membershipDetails(membershipSnapshot);
  const personId = membership.extracted.personId;
  const assignmentSnapshot = await db.collection(`orgs/${ORG_ID}/teacherAssignments`)
    .where("teacherPersonId", "==", personId).get();
  const assignmentsRaw = assignmentSnapshot.docs.map(assignmentReport);
  const assignments = assignmentsRaw.filter((item) => item.schemaValid).map((item) => item.parsed);
  const assignmentIds = assignments.map((item) => item.id);
  const assignmentChunks = chunks(assignmentIds, 10);
  const queriedLinks = [];
  const linkErrors = [];
  for (const assignmentChunk of assignmentChunks) {
    try {
      const snapshot = await db.collection(`orgs/${ORG_ID}/teacherAssignmentClassLinks`)
        .where("assignmentId", "in", assignmentChunk).get();
      queriedLinks.push(...snapshot.docs);
    } catch (error) {
      linkErrors.push({ chunk: assignmentChunk, message: error.message || String(error), code: error.code || "" });
    }
  }
  const linksRaw = queriedLinks.map(linkReport);
  const classLinks = linksRaw.filter((item) => item.schemaValid).map((item) => item.parsed);
  const activeAssignments = assignments.filter((item) =>
    item.status === "ACTIVE" && item.startAt <= NOW && (!item.endAt || item.endAt >= NOW));
  const teacherOfferingIds = resolveActiveTeacherOfferingIds({ assignments, classLinks, now: NOW });
  const offeringSnapshots = teacherOfferingIds.length
    ? await db.getAll(...teacherOfferingIds.map((id) => db.doc(`orgs/${ORG_ID}/classSubjectOfferings/${id}`)))
    : [];
  const offerings = offeringSnapshots.map((snapshot) => {
    const raw = snapshot.exists ? snapshot.data() || {} : null;
    return {
      id: snapshot.id, path: snapshot.ref.path, exists: snapshot.exists,
      schoolId: raw ? text(raw.schoolId) : "", academicYearId: raw ? text(raw.academicYearId) : "",
      gradeId: raw ? text(raw.gradeId) : "", classId: raw ? text(raw.classId) : "",
      subjectKey: raw ? text(raw.subjectKey) : "", status: raw ? text(raw.status) : "",
      isArchived: raw ? raw.isArchived : null, raw: json(raw),
    };
  });
  const context = {
    orgId: ORG_ID, personId, roleKeys: membership.extracted.resolvedRole ? [membership.extracted.resolvedRole] : [],
    schoolIds: [...new Set(activeAssignments.map((item) => item.schoolId))],
    academicYearIds: [...new Set(activeAssignments.map((item) => item.academicYearId))],
    termIds: [...new Set(activeAssignments.map((item) => item.termId).filter(Boolean))],
    teacherOfferingIds,
  };
  const resourcesReport = resources.map((resource) => {
    if (!resource.schemaValid) return { id: resource.id, schemaValid: false, zodIssues: resource.zodIssues };
    const data = resource.parsed;
    const potentiallyKg02 = data.audience.schoolIds.length === 0 || data.audience.schoolIds.includes(TARGET_SCHOOL_ID);
    return {
      id: resource.id, title: data.title, kind: data.kind, schemaValid: true,
      potentiallyRelevantToKg02: potentiallyKg02,
      audience: json(data.audience),
      matchesTeacher: isTeacherTargetedByPdfResource(data, context),
      nonMatchReasons: targetingReasons(data, context),
    };
  });
  return {
    membership,
    teacherAssignments: { rawCount: assignmentsRaw.length, schemaValidCount: assignments.length, documents: assignmentsRaw },
    assignmentIds: { length: assignmentIds.length, ids: assignmentIds, chunks: assignmentChunks,
      emptyInQueryWouldBeIssued: false, // chunk([] , 10) is [], so Promise.all([]) issues no Firestore query.
    },
    teacherAssignmentClassLinks: { queryErrors: linkErrors, rawCount: linksRaw.length, schemaValidCount: classLinks.length, documents: linksRaw },
    activeOfferingResolution: { activeAssignmentIds: activeAssignments.map((item) => item.id), offeringIds: teacherOfferingIds, offerings },
    resourceMatches: resourcesReport,
  };
}

async function chooseControlMembership(db) {
  const all = await db.collectionGroup("orgMemberships").get();
  const candidates = all.docs.filter((doc) => {
    if (doc.id !== ORG_ID || doc.ref.parent.parent?.id === undefined) return false;
    const data = doc.data() || {};
    const role = MembershipRole.safeParse(text(data.roleKey) || text(data.role));
    const schools = Array.isArray(record(data.scopes).schoolIds) ? record(data.scopes).schoolIds : [];
    return text(data.personId) !== TARGET_PERSON_ID && activeMembership(data, NOW) && role.success &&
      role.data === "KG_TEACHER" && (schools.includes(TARGET_SCHOOL_ID) || text(data.scopeId) === TARGET_SCHOOL_ID);
  });
  if (requestedWorkingPersonId) return candidates.find((doc) => text(doc.data()?.personId) === requestedWorkingPersonId) || null;
  for (const candidate of candidates) {
    const assignments = await db.collection(`orgs/${ORG_ID}/teacherAssignments`)
      .where("teacherPersonId", "==", text(candidate.data()?.personId)).get();
    if (assignments.docs.some((doc) => TeacherAssignmentSchema.safeParse({ id: doc.id, ...doc.data() }).success)) return candidate;
  }
  return candidates[0] || null;
}

async function main() {
  initAdmin();
  const db = admin.firestore();
  const runtimeLogs = await fetchRuntimeLogs();
  if (logsOnly) {
    console.log(JSON.stringify({ readOnly: true, runtimeLogs }, null, 2));
    return;
  }
  const targetMemberships = await membershipForPerson(db, TARGET_PERSON_ID);
  if (!targetMemberships.length) throw new Error(`No users/*/orgMemberships/${ORG_ID} membership found for ${TARGET_PERSON_ID}`);
  const resourcesSnapshot = await db.collection(`orgs/${ORG_ID}/pdfResources`).where("kind", "in", TEACHING_KINDS).get();
  const resources = resourcesSnapshot.docs.map((doc) => {
    const raw = doc.data() || {};
    const parsed = PdfResourceSchema.safeParse({ id: doc.id, orgId: ORG_ID, ...raw });
    return { id: doc.id, raw: json(raw), schemaValid: parsed.success, zodIssues: issues(parsed), parsed: parsed.success ? json(parsed.data) : null };
  });
  const target = await inspectTeacher(db, targetMemberships[0], resources);
  const controlMembership = await chooseControlMembership(db);
  const control = controlMembership ? await inspectTeacher(db, controlMembership, resources) : null;
  const fullReport = {
    generatedAt: new Date(NOW).toISOString(), now: NOW, readOnly: true,
    target: { personId: TARGET_PERSON_ID, displayName: "رهام سويد محمد الباتل", result: target },
    resources: { queryKinds: TEACHING_KINDS, rawCount: resources.length, schemaValidCount: resources.filter((item) => item.schemaValid).length,
      schemaRejected: resources.filter((item) => !item.schemaValid).map((item) => ({ id: item.id, raw: item.raw, zodIssues: item.zodIssues })), },
    comparison: control ? {
      selection: requestedWorkingPersonId ? "explicit --working-person-id" : "active KG_TEACHER scoped to kg-02 with at least one schema-valid assignment; page success is not asserted by Firestore data alone",
      personId: control.membership.extracted.personId, uid: control.membership.uid, result: control,
    } : { selection: "no suitable active KG-02 control membership found", result: null },
    runtimeLogs,
  };
  if (!summaryOnly && !briefOnly) {
    console.log(JSON.stringify(fullReport, null, 2));
    return;
  }
  const compact = (result) => ({
    membership: result.membership,
    teacherAssignments: {
      rawCount: result.teacherAssignments.rawCount,
      schemaValidCount: result.teacherAssignments.schemaValidCount,
      documents: result.teacherAssignments.documents.map((item) => ({
        id: item.id, schemaValid: item.schemaValid, zodIssues: item.zodIssues,
        extracted: item.extracted, activeAtNow: item.activeAtNow,
      })),
    },
    assignmentIds: result.assignmentIds,
    teacherAssignmentClassLinks: {
      queryErrors: result.teacherAssignmentClassLinks.queryErrors,
      rawCount: result.teacherAssignmentClassLinks.rawCount,
      schemaValidCount: result.teacherAssignmentClassLinks.schemaValidCount,
      documents: result.teacherAssignmentClassLinks.documents.map((item) => ({
        id: item.id, schemaValid: item.schemaValid, zodIssues: item.zodIssues,
        assignmentId: item.assignmentId, classSubjectOfferingId: item.classSubjectOfferingId,
      })),
    },
    activeOfferingResolution: result.activeOfferingResolution,
    potentiallyRelevantKg02Resources: result.resourceMatches.filter((item) => item.potentiallyRelevantToKg02 || !item.schemaValid),
  });
  if (briefOnly) {
    const brief = (result) => ({
      membership: {
        uid: result.membership.uid,
        extracted: result.membership.extracted,
        callableMembershipCheck: result.membership.callableMembershipCheck,
      },
      assignmentCounts: {
        raw: result.teacherAssignments.rawCount,
        schemaValid: result.teacherAssignments.schemaValidCount,
        active: result.teacherAssignments.documents.filter((item) => item.activeAtNow).length,
      },
      assignmentIds: result.assignmentIds,
      classLinkCounts: {
        raw: result.teacherAssignmentClassLinks.rawCount,
        schemaValid: result.teacherAssignmentClassLinks.schemaValidCount,
        queryErrors: result.teacherAssignmentClassLinks.queryErrors,
      },
      offeringIds: result.activeOfferingResolution.offeringIds,
      offerings: result.activeOfferingResolution.offerings.map(({ raw, ...item }) => item),
      relevantResourceResults: result.resourceMatches
        .filter((item) => item.potentiallyRelevantToKg02 || !item.schemaValid)
        .map((item) => ({
          id: item.id, title: item.title, schemaValid: item.schemaValid,
          matchesTeacher: item.matchesTeacher, nonMatchReasons: item.nonMatchReasons,
          offeringTargetCount: item.audience?.classSubjectOfferingIds?.length,
          matchingOfferingIds: item.audience?.classSubjectOfferingIds?.filter((id) =>
            result.activeOfferingResolution.offeringIds.includes(id)),
          zodIssues: item.zodIssues,
        })),
    });
    console.log(JSON.stringify({
      generatedAt: fullReport.generatedAt, now: NOW, readOnly: true,
      target: { personId: TARGET_PERSON_ID, result: brief(target) },
      resources: {
        rawCount: fullReport.resources.rawCount, schemaValidCount: fullReport.resources.schemaValidCount,
        schemaRejected: fullReport.resources.schemaRejected.map(({ raw, ...item }) => item),
      },
      comparison: control ? {
        selection: fullReport.comparison.selection, personId: fullReport.comparison.personId,
        uid: fullReport.comparison.uid, result: brief(control),
      } : fullReport.comparison,
      runtimeLogs,
    }, null, 2));
    return;
  }
  console.log(JSON.stringify({
    generatedAt: fullReport.generatedAt, now: NOW, readOnly: true,
    target: { personId: TARGET_PERSON_ID, result: compact(target) },
    resources: fullReport.resources,
    comparison: control ? {
      selection: fullReport.comparison.selection, personId: fullReport.comparison.personId, uid: fullReport.comparison.uid,
      result: compact(control),
    } : fullReport.comparison,
    runtimeLogs,
  }, null, 2));
}

main().catch((error) => {
  console.error(JSON.stringify({ readOnly: true, error: error.message || String(error), code: error.code || "", stack: error.stack || "" }, null, 2));
  process.exitCode = 1;
});
