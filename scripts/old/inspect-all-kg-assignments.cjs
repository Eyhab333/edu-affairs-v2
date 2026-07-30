const admin = require("firebase-admin");
const path = require("path");
const fs = require("fs");

const serviceAccount = require(path.join(__dirname, "./service-account.json"));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

const orgId = process.env.ORG_ID || "takween";
const classId = process.env.CLASS_ID || "kg3-a";
const schoolId = process.env.SCHOOL_ID || "kg-01";
const academicYearId = process.env.ACADEMIC_YEAR_ID || "ay-1448";
const gradeId = process.env.GRADE_ID || "kg3";

function normalize(value) {
  return String(value || "").trim().toUpperCase();
}

function compactDoc(docSnap) {
  const data = docSnap.data() || {};

  return {
    id: data.id || docSnap.id,
    path: docSnap.ref.path,
    ...data,
  };
}

function getPersonId(item) {
  return (
    item.teacherPersonId ||
    item.personId ||
    item.staffPersonId ||
    item.assignedPersonId ||
    item.ownerPersonId ||
    item.userPersonId ||
    ""
  );
}

function getSubjectKey(item) {
  return normalize(
    item.subjectKey ||
      item.subjectId ||
      item.subject ||
      item.assignmentSubjectKey ||
      item.offeringSubjectKey ||
      "",
  );
}

function getOfferingId(item) {
  return (
    item.classSubjectOfferingId ||
    item.offeringId ||
    item.subjectOfferingId ||
    ""
  );
}

function touchesTargetClass(item) {
  if (item.classId === classId) return true;

  if (Array.isArray(item.classIds) && item.classIds.includes(classId)) {
    return true;
  }

  if (item.scopeType === "CLASS" && item.scopeId === classId) return true;

  const offeringId = getOfferingId(item);
  if (offeringId && String(offeringId).startsWith(`${classId}-`)) {
    return true;
  }

  if (String(item.id || "").startsWith(`${classId}-`)) {
    return true;
  }

  return false;
}

function touchesTargetContext(item) {
  if (touchesTargetClass(item)) return true;

  const sameSchool = !item.schoolId || item.schoolId === schoolId;
  const sameYear = !item.academicYearId || item.academicYearId === academicYearId;
  const sameGrade = !item.gradeId || item.gradeId === gradeId;

  return sameSchool && sameYear && sameGrade;
}

function pickAssignmentFields(item) {
  return {
    id: item.id,
    path: item.path,

    personId: getPersonId(item),
    teacherPersonId: item.teacherPersonId,
    assignedPersonId: item.assignedPersonId,
    staffPersonId: item.staffPersonId,

    roleKey: item.roleKey,
    teacherRoleKey: item.teacherRoleKey,
    assignmentRoleKey: item.assignmentRoleKey,

    schoolId: item.schoolId,
    academicYearId: item.academicYearId,
    gradeId: item.gradeId,
    classId: item.classId,
    classIds: item.classIds,
    scopeType: item.scopeType,
    scopeId: item.scopeId,

    subjectKey: item.subjectKey,
    subjectId: item.subjectId,
    subjectTitle: item.subjectTitle,
    classSubjectOfferingId: item.classSubjectOfferingId,
    offeringId: item.offeringId,

    status: item.status,
    isActive: item.isActive,
    active: item.active,

    operationKind: item.operationKind,
    operationKinds: item.operationKinds,
    availableOperations: item.availableOperations,

    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}

function pickLinkFields(item) {
  return {
    id: item.id,
    path: item.path,

    teacherAssignmentId: item.teacherAssignmentId,
    assignmentId: item.assignmentId,

    schoolId: item.schoolId,
    academicYearId: item.academicYearId,
    gradeId: item.gradeId,
    classId: item.classId,
    classIds: item.classIds,
    scopeType: item.scopeType,
    scopeId: item.scopeId,

    subjectKey: item.subjectKey,
    subjectId: item.subjectId,
    classSubjectOfferingId: item.classSubjectOfferingId,
    offeringId: item.offeringId,

    status: item.status,
    isActive: item.isActive,
    active: item.active,

    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}

function pickOfferingFields(item) {
  return {
    id: item.id,
    path: item.path,

    schoolId: item.schoolId,
    academicYearId: item.academicYearId,
    gradeId: item.gradeId,
    classId: item.classId,

    subjectKey: item.subjectKey,
    subjectId: item.subjectId,
    subjectTitle: item.subjectTitle,
    subjectTitleSnapshot: item.subjectTitleSnapshot,
    displayName: item.displayName,
    shortLabel: item.shortLabel,

    status: item.status,
    isActive: item.isActive,
    active: item.active,

    order: item.order,
    offeringKind: item.offeringKind,
    source: item.source,

    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}

async function getCollection(collectionName) {
  const snap = await db
    .collection("orgs")
    .doc(orgId)
    .collection(collectionName)
    .get();

  return snap.docs.map(compactDoc);
}

async function loadPeople(personIds) {
  const result = {};

  for (const personId of personIds) {
    if (!personId) continue;

    try {
      const ref = db.collection("orgs").doc(orgId).collection("people").doc(personId);
      const snap = await ref.get();

      if (!snap.exists) {
        result[personId] = {
          id: personId,
          exists: false,
        };
        continue;
      }

      const data = snap.data() || {};

      result[personId] = {
        id: personId,
        exists: true,
        displayName: data.displayName || data.name || data.fullName || "",
        email: data.email || "",
        phone: data.phone || data.mobile || "",
      };
    } catch (error) {
      result[personId] = {
        id: personId,
        exists: false,
        error: error.message || String(error),
      };
    }
  }

  return result;
}

function isPossibleHomeroomAssignment(item) {
  const subjectKey = getSubjectKey(item);
  const id = normalize(item.id);
  const roleKey = normalize(item.roleKey || item.teacherRoleKey || item.assignmentRoleKey);
  const operationKind = normalize(item.operationKind);
  const offeringId = normalize(getOfferingId(item));

  return (
    subjectKey === "CLASS" ||
    subjectKey === "HOMEROOM" ||
    id.includes("CLASS") ||
    id.includes("HOMEROOM") ||
    roleKey.includes("CLASS") ||
    roleKey.includes("HOMEROOM") ||
    operationKind.includes("CLASS") ||
    operationKind.includes("HOMEROOM") ||
    offeringId.endsWith("-CLASS")
  );
}

function isPossibleKgClassTeacher(item) {
  const id = normalize(item.id);
  const subjectKey = getSubjectKey(item);
  const roleKey = normalize(item.roleKey || item.teacherRoleKey || item.assignmentRoleKey);
  const personId = normalize(getPersonId(item));

  return (
    isPossibleHomeroomAssignment(item) ||
    subjectKey === "QURAN" ||
    subjectKey === "LEARNING_GARDENS" ||
    subjectKey === "NUMBERS" ||
    id.includes("KG-CLASS") ||
    id.includes("KG_CLASS") ||
    id.includes("TEACHER") ||
    roleKey.includes("TEACHER") ||
    personId.includes("CLASS")
  );
}

async function main() {
  console.log("Inspecting all KG assignments broadly...");
  console.log({
    orgId,
    classId,
    schoolId,
    academicYearId,
    gradeId,
  });

  const [
    allOfferings,
    allTeacherAssignments,
    allTeacherAssignmentClassLinks,
  ] = await Promise.all([
    getCollection("classSubjectOfferings"),
    getCollection("teacherAssignments"),
    getCollection("teacherAssignmentClassLinks"),
  ]);

  const assignmentsById = new Map(
    allTeacherAssignments.map((item) => [item.id, item]),
  );

  const targetOfferings = allOfferings
    .filter((item) => {
      if (item.classId === classId) return true;
      if (String(item.id || "").startsWith(`${classId}-`)) return true;
      return false;
    })
    .sort((a, b) => String(a.id).localeCompare(String(b.id)));

  const contextOfferings = allOfferings
    .filter(touchesTargetContext)
    .sort((a, b) => String(a.id).localeCompare(String(b.id)));

  const contextAssignments = allTeacherAssignments
    .filter(touchesTargetContext)
    .sort((a, b) => String(a.id).localeCompare(String(b.id)));

  const contextLinks = allTeacherAssignmentClassLinks
    .filter(touchesTargetContext)
    .sort((a, b) => String(a.id).localeCompare(String(b.id)));

  const allLinksExpanded = allTeacherAssignmentClassLinks.map((link) => {
    const teacherAssignmentId = link.teacherAssignmentId || link.assignmentId || "";
    const assignment = assignmentsById.get(teacherAssignmentId) || null;

    return {
      link: pickLinkFields(link),
      resolvedTeacherAssignmentId: teacherAssignmentId,
      assignment: assignment ? pickAssignmentFields(assignment) : null,
    };
  });

  const contextLinksExpanded = contextLinks.map((link) => {
    const teacherAssignmentId = link.teacherAssignmentId || link.assignmentId || "";
    const assignment = assignmentsById.get(teacherAssignmentId) || null;

    return {
      link: pickLinkFields(link),
      resolvedTeacherAssignmentId: teacherAssignmentId,
      assignment: assignment ? pickAssignmentFields(assignment) : null,
    };
  });

  const possibleHomeroomAssignments = allTeacherAssignments
    .filter(isPossibleHomeroomAssignment)
    .map(pickAssignmentFields);

  const possibleKgClassTeacherAssignments = allTeacherAssignments
    .filter(isPossibleKgClassTeacher)
    .map(pickAssignmentFields);

  const personIds = Array.from(
    new Set(
      allTeacherAssignments
        .map(getPersonId)
        .filter(Boolean),
    ),
  );

  const people = await loadPeople(personIds);

  const assignmentsWithPeople = allTeacherAssignments.map((item) => {
    const picked = pickAssignmentFields(item);
    const personId = picked.personId;

    return {
      ...picked,
      person: personId ? people[personId] || null : null,
    };
  });

  const subjectMatrix = {};

  for (const assignment of allTeacherAssignments) {
    const subjectKey = getSubjectKey(assignment) || "NO_SUBJECT";
    subjectMatrix[subjectKey] ||= {
      subjectKey,
      assignmentIds: [],
      personIds: [],
    };

    subjectMatrix[subjectKey].assignmentIds.push(assignment.id);

    const personId = getPersonId(assignment);
    if (personId && !subjectMatrix[subjectKey].personIds.includes(personId)) {
      subjectMatrix[subjectKey].personIds.push(personId);
    }
  }

  const report = {
    context: {
      orgId,
      classId,
      schoolId,
      academicYearId,
      gradeId,
    },

    counts: {
      allOfferings: allOfferings.length,
      allTeacherAssignments: allTeacherAssignments.length,
      allTeacherAssignmentClassLinks: allTeacherAssignmentClassLinks.length,

      targetOfferings: targetOfferings.length,
      contextOfferings: contextOfferings.length,
      contextAssignments: contextAssignments.length,
      contextLinks: contextLinks.length,

      possibleHomeroomAssignments: possibleHomeroomAssignments.length,
      possibleKgClassTeacherAssignments: possibleKgClassTeacherAssignments.length,
      people: personIds.length,
    },

    subjectMatrix: Object.values(subjectMatrix),

    targetOfferings: targetOfferings.map(pickOfferingFields),
    contextOfferings: contextOfferings.map(pickOfferingFields),

    allTeacherAssignments: assignmentsWithPeople,
    contextAssignments: contextAssignments.map(pickAssignmentFields),

    allTeacherAssignmentClassLinks: allLinksExpanded,
    contextLinks: contextLinksExpanded,

    possibleHomeroomAssignments,
    possibleKgClassTeacherAssignments,

    people,
  };

  console.log("\n=== COUNTS ===");
  console.dir(report.counts, { depth: null });

  console.log("\n=== SUBJECT MATRIX ===");
  console.table(report.subjectMatrix);

  console.log("\n=== TARGET OFFERINGS ===");
  console.table(report.targetOfferings.map((item) => ({
    id: item.id,
    classId: item.classId,
    schoolId: item.schoolId,
    academicYearId: item.academicYearId,
    gradeId: item.gradeId,
    subjectKey: item.subjectKey,
    displayName: item.displayName,
    status: item.status,
  })));

  console.log("\n=== ALL TEACHER ASSIGNMENTS ===");
  console.dir(report.allTeacherAssignments, { depth: null });

  console.log("\n=== CONTEXT LINKS ===");
  console.dir(report.contextLinks, { depth: null });

  console.log("\n=== POSSIBLE HOMEROOM ASSIGNMENTS ===");
  console.dir(report.possibleHomeroomAssignments, { depth: null });

  console.log("\n=== POSSIBLE KG CLASS TEACHER ASSIGNMENTS ===");
  console.dir(report.possibleKgClassTeacherAssignments, { depth: null });

  const outputPath = path.join(
    __dirname,
    `inspect-all-kg-assignments-${classId}.json`,
  );

  fs.writeFileSync(outputPath, JSON.stringify(report, null, 2), "utf8");

  console.log("\nReport written to:");
  console.log(outputPath);
}

main().catch((error) => {
  console.error("Failed to inspect all KG assignments.");
  console.error(error);
  process.exit(1);
});