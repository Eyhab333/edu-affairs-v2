const admin = require("firebase-admin");
const fs = require("node:fs");
const path = require("node:path");

const ORG_ID = "takween";
const OPERATION_KIND = "STUDENT_CASE_HANDLING";
const DIRECTORY = __dirname;
const REPO_ROOT = path.resolve(DIRECTORY, "..", "..");
const SERVICE_ACCOUNT_PATH = path.join(
  REPO_ROOT,
  "scripts",
  "service-account.json",
);
const REPORTS_DIR = path.join(DIRECTORY, "reports");

const CASE_HANDLING_ROLES = new Set([
  "BOYS_PRINCIPAL",
  "BOYS_VP",
  "BOYS_EDU_VP",
  "BOYS_STUDENTS_VP",
  "BOYS_STUDENT_GUIDE",
  "GIRLS_PRINCIPAL",
  "GIRLS_VP",
  "GIRLS_STUDENT_COUNSELOR",
  "KG_PRINCIPAL",
  "KG_VP",
]);

const TEACHER_ROLES = new Set([
  "BOYS_TEACHER",
  "GIRLS_TEACHER",
  "KG_TEACHER",
  "teacher",
]);

const CASE_HANDLING_PERMISSIONS = Object.freeze([
  "VIEW",
  "CREATE",
  "UPDATE_DRAFT",
  "SUBMIT",
  "REVIEW",
  "APPROVE",
]);

const CASE_HANDLING_TITLE = "متابعة إحالات وحالات الطلاب";

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function record(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function strings(value) {
  return Array.isArray(value)
    ? value.map(text).filter(Boolean)
    : [];
}

function isActive(value, now) {
  const row = record(value);
  if (row.active === false || row.isActive === false) return false;
  if (text(row.status) && text(row.status) !== "ACTIVE") return false;
  if (typeof row.startAt === "number" && row.startAt > now) return false;
  if (typeof row.endAt === "number" && row.endAt < now) return false;
  return true;
}

function roleFromMembership(membership) {
  const roleKey = text(membership.roleKey);
  const role = text(membership.role);

  return {
    roleKey: roleKey || role,
    issue: roleKey || role ? "" : "membership roleKey/role is missing",
    inconsistency:
      roleKey && role && roleKey !== role
        ? "membership.role differs from membership.roleKey; recipient callable resolves roleKey first"
        : "",
  };
}

function explicitSchoolIds(membership) {
  const scopes = record(membership.scopes);
  const values = [
    text(membership.scopeType) === "SCHOOL" ? text(membership.scopeId) : "",
    ...strings(scopes.schoolIds),
  ];

  return Array.from(new Set(values.filter(Boolean)));
}

function membershipLocation(snapshot) {
  const membershipRef = snapshot.ref;
  const userRef = membershipRef.parent.parent;

  if (
    membershipRef.parent.id !== "orgMemberships" ||
    !userRef ||
    userRef.parent.id !== "users"
  ) {
    return {
      uid: "",
      issue: "membership is not stored at users/{uid}/orgMemberships/{orgId}",
    };
  }

  return { uid: userRef.id, issue: "" };
}

function schoolName(school) {
  return text(school.name) || text(school.displayName) || "";
}

function personName(person, user) {
  return text(person.displayName) || text(user.displayName) || "";
}

function assignmentId(personId, schoolId) {
  return [
    "staff-provisioning",
    personId,
    schoolId,
    OPERATION_KIND,
  ].join("__");
}

function matchingAssignments(assignments, schoolId, personId) {
  return assignments.filter((assignment) => {
    const data = assignment.data;
    return (
      text(data.schoolId) === schoolId &&
      text(data.operationKind) === OPERATION_KIND &&
      text(data.actorPersonId) === personId
    );
  });
}

function publicAssignment(assignment, now) {
  const data = assignment.data;
  return {
    id: assignment.id,
    path: assignment.path,
    isActive: isActive(data, now),
    status: text(data.status),
    actorRoleKey: text(data.actorRoleKey),
    assignmentIdMatchesConvention:
      assignment.id === assignmentId(text(data.actorPersonId), text(data.schoolId)),
  };
}

function initAdmin() {
  if (!fs.existsSync(SERVICE_ACCOUNT_PATH)) {
    throw new Error(
      "Service account not found: " +
        SERVICE_ACCOUNT_PATH +
        "\nExpected file: scripts/service-account.json",
    );
  }

  const serviceAccount = JSON.parse(
    fs.readFileSync(SERVICE_ACCOUNT_PATH, "utf8"),
  );

  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      projectId: serviceAccount.project_id,
    });
  }

  return {
    db: admin.firestore(),
    projectId: serviceAccount.project_id,
  };
}

function timestampForFile() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function writeReport(prefix, payload) {
  fs.mkdirSync(REPORTS_DIR, { recursive: true });
  const filePath = path.join(
    REPORTS_DIR,
    timestampForFile() + "__" + prefix + ".json",
  );
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), "utf8");
  return filePath;
}

async function loadOrganizationState(db) {
  const [schoolSnapshot, membershipSnapshot, assignmentSnapshot] =
    await Promise.all([
      db.collection("orgs/" + ORG_ID + "/schools").get(),
      db.collectionGroup("orgMemberships").where("orgId", "==", ORG_ID).get(),
      db
        .collection("orgs/" + ORG_ID + "/operationalAssignments")
        .get(),
    ]);

  const memberships = membershipSnapshot.docs.map((snapshot) => ({
    id: snapshot.id,
    path: snapshot.ref.path,
    ref: snapshot.ref,
    data: snapshot.data() || {},
    location: membershipLocation(snapshot),
  }));
  const schoolsById = new Map(
    schoolSnapshot.docs.map((snapshot) => [
      snapshot.id,
      {
        id: snapshot.id,
        path: snapshot.ref.path,
        data: snapshot.data() || {},
      },
    ]),
  );
  const assignments = assignmentSnapshot.docs.map((snapshot) => ({
    id: snapshot.id,
    path: snapshot.ref.path,
    data: snapshot.data() || {},
  }));

  const uidValues = Array.from(
    new Set(
      memberships
        .map((membership) => text(membership.data.uid))
        .filter(Boolean),
    ),
  );
  const personValues = Array.from(
    new Set(
      memberships
        .map((membership) => text(membership.data.personId))
        .filter(Boolean),
    ),
  );

  const [userSnapshots, personSnapshots] = await Promise.all([
    uidValues.length
      ? db.getAll(...uidValues.map((uid) => db.doc("users/" + uid)))
      : [],
    personValues.length
      ? db.getAll(
          ...personValues.map((personId) =>
            db.doc("orgs/" + ORG_ID + "/people/" + personId),
          ),
        )
      : [],
  ]);

  const usersByUid = new Map(
    userSnapshots.map((snapshot) => [
      snapshot.id,
      {
        id: snapshot.id,
        exists: snapshot.exists,
        data: snapshot.data() || {},
      },
    ]),
  );
  const peopleById = new Map(
    personSnapshots.map((snapshot) => [
      snapshot.id,
      {
        id: snapshot.id,
        exists: snapshot.exists,
        data: snapshot.data() || {},
      },
    ]),
  );

  return {
    schoolsById,
    memberships,
    assignments,
    usersByUid,
    peopleById,
    counts: {
      schools: schoolSnapshot.size,
      memberships: membershipSnapshot.size,
      operationalAssignments: assignmentSnapshot.size,
    },
  };
}

function buildRecord(params) {
  const membership = params.membership;
  const membershipData = membership.data;
  const role = roleFromMembership(membershipData);
  const personId = text(membershipData.personId);
  const uid = text(membershipData.uid);
  const school = params.schoolId
    ? params.state.schoolsById.get(params.schoolId)
    : null;
  const user = uid ? params.state.usersByUid.get(uid) : null;
  const person = personId ? params.state.peopleById.get(personId) : null;
  const reasons = [];
  const now = params.now;

  if (membership.location.issue) reasons.push(membership.location.issue);
  if (!uid) reasons.push("membership.uid is missing");
  if (membership.location.uid && uid && membership.location.uid !== uid) {
    reasons.push("membership.uid does not match the uid in its document path");
  }
  if (!isActive(membershipData, now)) {
    reasons.push("membership is inactive, disabled, expired, or not yet active");
  }
  if (!role.roleKey) reasons.push(role.issue);
  if (!personId) reasons.push("membership.personId is missing");
  if (!params.schoolId) reasons.push("membership has no explicit school scope");
  if (params.schoolId && !school) reasons.push("school does not exist");
  if (school && school.data.isArchived === true) reasons.push("school is archived");
  if (!user || !user.exists) reasons.push("users/{uid} profile is missing");
  if (user && user.data.isDisabled === true) {
    reasons.push("users/{uid}.isDisabled is true");
  }
  if (
    user &&
    user.exists &&
    text(user.data.personId) &&
    personId &&
    text(user.data.personId) !== personId
  ) {
    reasons.push("users/{uid}.personId does not match membership.personId");
  }
  if (!person || !person.exists) {
    reasons.push("org people document is missing");
  }
  if (person && person.exists && !personName(person.data, user ? user.data : {})) {
    reasons.push("employee display name is missing");
  }

  const scopedSchoolIds = explicitSchoolIds(membershipData);
  if (
    params.schoolId &&
    !scopedSchoolIds.includes(params.schoolId)
  ) {
    reasons.push("school is not an explicit membership scope");
  }

  const allAssignments =
    params.schoolId && personId
      ? matchingAssignments(params.state.assignments, params.schoolId, personId)
      : [];
  const activeAssignments = allAssignments.filter((assignment) =>
    isActive(assignment.data, now),
  );
  const matchingRoleAssignments = activeAssignments.filter(
    (assignment) => text(assignment.data.actorRoleKey) === role.roleKey,
  );
  const mismatchedRoleAssignments = activeAssignments.filter(
    (assignment) => text(assignment.data.actorRoleKey) !== role.roleKey,
  );
  const expectedAssignmentId =
    personId && params.schoolId ? assignmentId(personId, params.schoolId) : "";
  const conventionalDocument = expectedAssignmentId
    ? params.state.assignments.find(
        (assignment) => assignment.id === expectedAssignmentId,
      )
    : null;

  let action = "REVIEW";
  let reason = "";

  if (reasons.length) {
    reason = reasons.join("; ");
  } else if (matchingRoleAssignments.length > 1) {
    reason = "multiple active matching case-handling assignments already exist";
  } else if (matchingRoleAssignments.length === 1) {
    action = "SKIP_EXISTING";
    reason = "active matching STUDENT_CASE_HANDLING assignment already exists";
  } else if (mismatchedRoleAssignments.length) {
    reason =
      "an active case-handling assignment exists for this person and school with a different role";
  } else if (conventionalDocument) {
    reason =
      "the deterministic assignment document already exists but is not an active matching assignment";
  } else if (TEACHER_ROLES.has(role.roleKey)) {
    reason =
      "teacher roles are not auto-provisioned; an existing matching case-handling assignment is required";
  } else if (!CASE_HANDLING_ROLES.has(role.roleKey)) {
    reason = "role is not an approved student case recipient role";
  } else {
    action = "CREATE";
    reason =
      "active employee, explicit active school membership, approved role, and no existing case-handling assignment";
  }

  return {
    schoolId: params.schoolId,
    schoolName: school ? schoolName(school.data) : "",
    personId,
    employeeName: personName(person ? person.data : {}, user ? user.data : {}),
    roleKey: role.roleKey,
    membershipRoleKey: text(membershipData.roleKey),
    membershipRole: text(membershipData.role),
    membershipRoleFieldInconsistency: role.inconsistency,
    membershipId: membership.id,
    membershipPath: membership.path,
    uid,
    action,
    reason,
    existingMatchingAssignments: allAssignments.map((assignment) =>
      publicAssignment(assignment, now),
    ),
    deterministicAssignmentId: expectedAssignmentId,
  };
}

function buildPreviewRecords(state, now) {
  const records = [];

  for (const membership of state.memberships) {
    const schoolIds = explicitSchoolIds(membership.data);
    const targets = schoolIds.length ? schoolIds : [""];

    for (const schoolId of targets) {
      records.push(buildRecord({ state, membership, schoolId, now }));
    }
  }

  const byTarget = new Map();
  for (const item of records) {
    if (!item.schoolId || !item.personId || !item.roleKey) continue;
    const key = [item.schoolId, item.personId, item.roleKey].join("::");
    const existing = byTarget.get(key) || [];
    existing.push(item);
    byTarget.set(key, existing);
  }

  for (const duplicates of byTarget.values()) {
    if (duplicates.length < 2) continue;
    for (const item of duplicates) {
      if (item.action === "CREATE") {
        item.action = "REVIEW";
        item.reason =
          "multiple membership records resolve to the same person, school, and role";
      }
    }
  }

  return records.sort((left, right) => {
    return (
      left.schoolName.localeCompare(right.schoolName, "ar") ||
      left.schoolId.localeCompare(right.schoolId) ||
      left.roleKey.localeCompare(right.roleKey) ||
      left.employeeName.localeCompare(right.employeeName, "ar") ||
      left.personId.localeCompare(right.personId)
    );
  });
}

function summarize(records) {
  const groups = new Map();
  const totals = { CREATE: 0, SKIP_EXISTING: 0, REVIEW: 0 };

  for (const item of records) {
    totals[item.action] += 1;
    const key = [item.schoolId || "<no-school>", item.roleKey || "<no-role>"].join(
      "::",
    );
    const group = groups.get(key) || {
      schoolId: item.schoolId || "",
      schoolName: item.schoolName || "",
      roleKey: item.roleKey || "",
      CREATE: 0,
      SKIP_EXISTING: 0,
      REVIEW: 0,
      total: 0,
    };
    group[item.action] += 1;
    group.total += 1;
    groups.set(key, group);
  }

  return {
    totals,
    bySchoolAndRole: Array.from(groups.values()).sort((left, right) => {
      return (
        left.schoolName.localeCompare(right.schoolName, "ar") ||
        left.schoolId.localeCompare(right.schoolId) ||
        left.roleKey.localeCompare(right.roleKey)
      );
    }),
  };
}

function findAssignmentInconsistencies(state, records, now) {
  const validTargets = new Set(
    records
      .filter((item) => item.schoolId && item.personId && item.roleKey)
      .filter((item) => item.action !== "REVIEW")
      .map((item) => [item.schoolId, item.personId, item.roleKey].join("::")),
  );

  return state.assignments
    .filter((assignment) => {
      return (
        isActive(assignment.data, now) &&
        text(assignment.data.operationKind) === OPERATION_KIND
      );
    })
    .filter((assignment) => {
      const key = [
        text(assignment.data.schoolId),
        text(assignment.data.actorPersonId),
        text(assignment.data.actorRoleKey),
      ].join("::");
      return !validTargets.has(key);
    })
    .map((assignment) => ({
      assignmentId: assignment.id,
      assignmentPath: assignment.path,
      schoolId: text(assignment.data.schoolId),
      personId: text(assignment.data.actorPersonId),
      roleKey: text(assignment.data.actorRoleKey),
      reason:
        "No active, explicit-school membership record produced a matching non-review recipient entry.",
    }));
}

function findMembershipRoleFieldInconsistencies(records) {
  return records
    .filter((item) => item.membershipRoleFieldInconsistency)
    .map((item) => ({
      schoolId: item.schoolId,
      schoolName: item.schoolName,
      personId: item.personId,
      membershipId: item.membershipId,
      membershipPath: item.membershipPath,
      roleKey: item.roleKey,
      membershipRoleKey: item.membershipRoleKey,
      membershipRole: item.membershipRole,
      reason: item.membershipRoleFieldInconsistency,
    }));
}

function makeAssignmentData(params) {
  const now = params.now;
  return {
    id: assignmentId(params.personId, params.schoolId),
    orgId: ORG_ID,
    schoolId: params.schoolId,
    academicYearId: "",
    termId: "",
    gradeId: "",
    classId: "",
    subjectKey: "",
    classSubjectOfferingId: "",
    title: CASE_HANDLING_TITLE,
    description: "",
    status: "ACTIVE",
    isActive: true,
    actorPersonId: params.personId,
    actorMembershipId: params.membershipId,
    actorRoleKey: params.roleKey,
    operationKind: OPERATION_KIND,
    scopeType: "SCHOOL",
    scopeId: params.schoolId,
    scopeLabel: params.schoolId,
    coverageMode: "ALL_CLASSES_IN_SCOPE",
    targetKind: "CASE",
    targetPersonIds: [],
    targetStudentIds: [],
    targetClassIds: [],
    targetGradeIds: [],
    targetRouteIds: [],
    targetRoleKeys: [],
    permissions: [...CASE_HANDLING_PERMISSIONS],
    sourceTeacherAssignmentId: "",
    sourceMembershipId: params.membershipId,
    note: "Created by student case recipient provisioning.",
    createdAt: now,
    updatedAt: now,
  };
}

function parseFlagValue(args, flag) {
  const index = args.indexOf(flag);
  if (index === -1) return "";
  return text(args[index + 1]);
}

function resolveReportPath(value) {
  if (!value) return "";
  return path.resolve(process.cwd(), value);
}

function validatePreviewReport(report) {
  if (!report || typeof report !== "object") {
    throw new Error("Preview report must contain a JSON object.");
  }
  if (report.reportType !== "STUDENT_CASE_RECIPIENT_PREVIEW") {
    throw new Error("The report is not a student case recipient preview.");
  }
  if (report.orgId !== ORG_ID) {
    throw new Error("The preview report is not for org takween.");
  }
  if (report.reviewed !== true || !text(report.reviewedAt)) {
    throw new Error(
      "The preview report must be manually marked reviewed=true with a reviewedAt timestamp before apply.",
    );
  }
  if (!Array.isArray(report.records)) {
    throw new Error("The preview report has no records array.");
  }
}

function relativeReportPath(filePath) {
  return path.relative(REPO_ROOT, filePath).replace(/\\/g, "/");
}

module.exports = {
  ORG_ID,
  OPERATION_KIND,
  CASE_HANDLING_ROLES,
  SERVICE_ACCOUNT_PATH,
  REPORTS_DIR,
  assignmentId,
  buildPreviewRecords,
  explicitSchoolIds,
  findAssignmentInconsistencies,
  findMembershipRoleFieldInconsistencies,
  initAdmin,
  isActive,
  loadOrganizationState,
  makeAssignmentData,
  parseFlagValue,
  record,
  relativeReportPath,
  resolveReportPath,
  roleFromMembership,
  summarize,
  text,
  validatePreviewReport,
  writeReport,
};
