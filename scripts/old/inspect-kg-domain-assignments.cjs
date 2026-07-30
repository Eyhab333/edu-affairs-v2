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

const DOMAIN_KEYS = [
  "CLASS",
  "HOMEROOM",
  "QURAN",
  "LEARNING_GARDENS",
  "NUMBERS",
  "VALUES",
  "CORNERS",
];

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

function getAnyPersonId(item) {
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

function getAnySubjectKey(item) {
  return normalize(
    item.subjectKey ||
      item.subjectId ||
      item.subject ||
      item.assignmentSubjectKey ||
      item.offeringSubjectKey ||
      "",
  );
}

function getAnyOfferingId(item) {
  return (
    item.classSubjectOfferingId ||
    item.offeringId ||
    item.subjectOfferingId ||
    ""
  );
}

function assignmentTouchesClass(item) {
  if (item.classId === classId) return true;

  if (Array.isArray(item.classIds) && item.classIds.includes(classId)) {
    return true;
  }

  if (item.scopeType === "CLASS" && item.scopeId === classId) return true;

  if (item.classSubjectOfferingId && String(item.classSubjectOfferingId).startsWith(`${classId}-`)) {
    return true;
  }

  return false;
}

function assignmentMatchesContext(item) {
  if (!assignmentTouchesClass(item)) return false;

  if (schoolId && item.schoolId && item.schoolId !== schoolId) return false;

  if (
    academicYearId &&
    item.academicYearId &&
    item.academicYearId !== academicYearId
  ) {
    return false;
  }

  return true;
}

function linkMatchesClass(item) {
  if (item.classId === classId) return true;
  if (item.scopeType === "CLASS" && item.scopeId === classId) return true;

  if (Array.isArray(item.classIds) && item.classIds.includes(classId)) {
    return true;
  }

  return false;
}

function linkMatchesContext(item) {
  if (!linkMatchesClass(item)) return false;

  if (schoolId && item.schoolId && item.schoolId !== schoolId) return false;

  if (
    academicYearId &&
    item.academicYearId &&
    item.academicYearId !== academicYearId
  ) {
    return false;
  }

  return true;
}

function offeringMatchesClass(item) {
  return item.classId === classId;
}

function offeringMatchesContext(item) {
  if (!offeringMatchesClass(item)) return false;

  if (schoolId && item.schoolId && item.schoolId !== schoolId) return false;

  if (
    academicYearId &&
    item.academicYearId &&
    item.academicYearId !== academicYearId
  ) {
    return false;
  }

  return true;
}

function pickImportantFields(item) {
  return {
    id: item.id,
    path: item.path,

    personId: getAnyPersonId(item),
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

    operationKinds: item.operationKinds,
    operationKind: item.operationKind,
    availableOperations: item.availableOperations,
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

async function main() {
  console.log("Inspecting KG domain assignments...");
  console.log({
    orgId,
    classId,
    schoolId,
    academicYearId,
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

  const classOfferings = allOfferings
    .filter(offeringMatchesContext)
    .sort((a, b) => {
      const aOrder = typeof a.order === "number" ? a.order : 999;
      const bOrder = typeof b.order === "number" ? b.order : 999;
      return aOrder - bOrder;
    });

  const classTeacherAssignments = allTeacherAssignments
    .filter(assignmentMatchesContext)
    .sort((a, b) => String(a.id).localeCompare(String(b.id)));

  const classLinks = allTeacherAssignmentClassLinks
    .filter(linkMatchesContext)
    .sort((a, b) => String(a.id).localeCompare(String(b.id)));

  const assignmentsById = new Map(
    allTeacherAssignments.map((item) => [item.id, item]),
  );

  const linksWithAssignments = classLinks.map((link) => {
    const teacherAssignmentId =
      link.teacherAssignmentId || link.assignmentId || link.id || "";

    const assignment = assignmentsById.get(teacherAssignmentId) || null;

    return {
      link: pickImportantFields(link),
      resolvedTeacherAssignmentId: teacherAssignmentId,
      assignment: assignment ? pickImportantFields(assignment) : null,
    };
  });

  const offeringsSummary = classOfferings.map((item) => {
    const subjectKey = getAnySubjectKey(item);

    const directAssignments = classTeacherAssignments.filter((assignment) => {
      const assignmentSubjectKey = getAnySubjectKey(assignment);
      const assignmentOfferingId = getAnyOfferingId(assignment);

      return (
        assignmentSubjectKey === subjectKey ||
        assignmentOfferingId === item.id
      );
    });

    const linkedAssignments = linksWithAssignments.filter((entry) => {
      const assignment = entry.assignment;
      const link = entry.link;

      const linkSubjectKey = getAnySubjectKey(link);
      const linkOfferingId = getAnyOfferingId(link);

      const assignmentSubjectKey = assignment ? getAnySubjectKey(assignment) : "";
      const assignmentOfferingId = assignment ? getAnyOfferingId(assignment) : "";

      return (
        linkSubjectKey === subjectKey ||
        linkOfferingId === item.id ||
        assignmentSubjectKey === subjectKey ||
        assignmentOfferingId === item.id
      );
    });

    return {
      offering: pickImportantFields(item),
      normalizedSubjectKey: subjectKey,
      directAssignmentsCount: directAssignments.length,
      directAssignments: directAssignments.map(pickImportantFields),
      linkedAssignmentsCount: linkedAssignments.length,
      linkedAssignments,
    };
  });

  const classOrHomeroomAssignments = classTeacherAssignments.filter((item) => {
    const key = getAnySubjectKey(item);
    const offeringId = getAnyOfferingId(item);

    return (
      key === "CLASS" ||
      key === "HOMEROOM" ||
      offeringId === `${classId}-class`
    );
  });

  const classOrHomeroomLinks = linksWithAssignments.filter((entry) => {
    const linkKey = getAnySubjectKey(entry.link);
    const linkOfferingId = getAnyOfferingId(entry.link);

    const assignmentKey = entry.assignment ? getAnySubjectKey(entry.assignment) : "";
    const assignmentOfferingId = entry.assignment
      ? getAnyOfferingId(entry.assignment)
      : "";

    return (
      linkKey === "CLASS" ||
      linkKey === "HOMEROOM" ||
      linkOfferingId === `${classId}-class` ||
      assignmentKey === "CLASS" ||
      assignmentKey === "HOMEROOM" ||
      assignmentOfferingId === `${classId}-class`
    );
  });

  const domainKeyMatrix = DOMAIN_KEYS.map((domainKey) => {
    const offerings = classOfferings.filter((item) => {
      return getAnySubjectKey(item) === domainKey;
    });

    const assignments = classTeacherAssignments.filter((item) => {
      return getAnySubjectKey(item) === domainKey;
    });

    const links = linksWithAssignments.filter((entry) => {
      const linkKey = getAnySubjectKey(entry.link);
      const assignmentKey = entry.assignment
        ? getAnySubjectKey(entry.assignment)
        : "";

      return linkKey === domainKey || assignmentKey === domainKey;
    });

    return {
      domainKey,
      offeringsCount: offerings.length,
      assignmentCount: assignments.length,
      linksCount: links.length,
      offeringIds: offerings.map((item) => item.id),
      assignmentIds: assignments.map((item) => item.id),
      linkIds: links.map((entry) => entry.link.id),
    };
  });

  const report = {
    context: {
      orgId,
      classId,
      schoolId,
      academicYearId,
    },

    counts: {
      allOfferings: allOfferings.length,
      allTeacherAssignments: allTeacherAssignments.length,
      allTeacherAssignmentClassLinks: allTeacherAssignmentClassLinks.length,

      classOfferings: classOfferings.length,
      classTeacherAssignments: classTeacherAssignments.length,
      classLinks: classLinks.length,

      classOrHomeroomAssignments: classOrHomeroomAssignments.length,
      classOrHomeroomLinks: classOrHomeroomLinks.length,
    },

    domainKeyMatrix,

    classOfferings: classOfferings.map(pickImportantFields),

    classTeacherAssignments: classTeacherAssignments.map(pickImportantFields),

    classLinks: linksWithAssignments,

    classOrHomeroomAssignments: classOrHomeroomAssignments.map(pickImportantFields),

    classOrHomeroomLinks,

    offeringsSummary,
  };

  console.log("\n=== COUNTS ===");
  console.dir(report.counts, { depth: null });

  console.log("\n=== DOMAIN KEY MATRIX ===");
  console.table(domainKeyMatrix);

  console.log("\n=== CLASS / HOMEROOM ASSIGNMENTS ===");
  console.dir(report.classOrHomeroomAssignments, { depth: null });

  console.log("\n=== CLASS / HOMEROOM LINKS ===");
  console.dir(report.classOrHomeroomLinks, { depth: null });

  console.log("\n=== OFFERINGS SUMMARY ===");
  console.dir(
    offeringsSummary.map((item) => ({
      offeringId: item.offering.id,
      subjectKey: item.normalizedSubjectKey,
      directAssignmentsCount: item.directAssignmentsCount,
      linkedAssignmentsCount: item.linkedAssignmentsCount,
    })),
    { depth: null },
  );

  const outputPath = path.join(
    __dirname,
    `inspect-kg-domain-assignments-${classId}.json`,
  );

  fs.writeFileSync(outputPath, JSON.stringify(report, null, 2), "utf8");

  console.log("\nReport written to:");
  console.log(outputPath);
}

main().catch((error) => {
  console.error("Failed to inspect KG domain assignments.");
  console.error(error);
  process.exit(1);
});