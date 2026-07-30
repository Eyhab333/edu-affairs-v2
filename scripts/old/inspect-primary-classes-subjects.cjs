const admin = require("firebase-admin");
const path = require("path");
const fs = require("fs");

const serviceAccount = require(path.join(__dirname, "./service-account.json"));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

const orgId = process.env.ORG_ID || "takween";
const academicYearIdFilter = process.env.ACADEMIC_YEAR_ID || "";
const schoolIdFilter = process.env.SCHOOL_ID || "";

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

function isKgLike(item) {
  const schoolType = normalize(item.schoolType);
  const schoolId = normalize(item.schoolId);
  const gradeId = normalize(item.gradeId);
  const classId = normalize(item.id || item.classId);

  return (
    schoolType === "KG" ||
    schoolId.startsWith("KG") ||
    gradeId.startsWith("KG") ||
    classId.startsWith("KG")
  );
}

function isPrimaryLikeClass(item) {
  const schoolType = normalize(item.schoolType);

  if (schoolType === "PRIMARY") return true;
  if (schoolType === "KG") return false;

  return !isKgLike(item);
}

function normalizeClassDoc(docSnap) {
  const data = compactDoc(docSnap);

  return {
    id: data.id,
    path: data.path,

    orgId: data.orgId || orgId,
    schoolId: data.schoolId || "",
    academicYearId: data.academicYearId || "",
    gradeId: data.gradeId || "",
    streamId: data.streamId || "",

    schoolType: data.schoolType || "",
    title: data.title || data.name || data.code || data.id,
    code: data.code || data.id,
    sectionLabel: data.sectionLabel || "",
    order: typeof data.order === "number" ? data.order : null,

    studentCount:
      data.studentCount ??
      data.studentsCount ??
      data.enrolledStudentCount ??
      null,

    status: data.status || "",
    isActive: data.isActive,
    active: data.active,
  };
}

function matchesOptionalFilters(item) {
  if (schoolIdFilter && item.schoolId !== schoolIdFilter) return false;
  if (academicYearIdFilter && item.academicYearId !== academicYearIdFilter) {
    return false;
  }

  return true;
}

function sameClassContext(item, classInfo) {
  if (item.classId !== classInfo.id) return false;

  if (item.schoolId && classInfo.schoolId && item.schoolId !== classInfo.schoolId) {
    return false;
  }

  if (
    item.academicYearId &&
    classInfo.academicYearId &&
    item.academicYearId !== classInfo.academicYearId
  ) {
    return false;
  }

  if (item.gradeId && classInfo.gradeId && item.gradeId !== classInfo.gradeId) {
    return false;
  }

  return true;
}

function linkMatchesClass(link, classInfo) {
  if (link.classId === classInfo.id) return true;

  if (Array.isArray(link.classIds) && link.classIds.includes(classInfo.id)) {
    return true;
  }

  if (link.scopeType === "CLASS" && link.scopeId === classInfo.id) {
    return true;
  }

  const offeringId = getOfferingId(link);
  if (offeringId && String(offeringId).startsWith(`${classInfo.id}-`)) {
    return true;
  }

  return false;
}

function linkMatchesContext(link, classInfo) {
  if (!linkMatchesClass(link, classInfo)) return false;

  if (link.schoolId && classInfo.schoolId && link.schoolId !== classInfo.schoolId) {
    return false;
  }

  if (
    link.academicYearId &&
    classInfo.academicYearId &&
    link.academicYearId !== classInfo.academicYearId
  ) {
    return false;
  }

  if (link.gradeId && classInfo.gradeId && link.gradeId !== classInfo.gradeId) {
    return false;
  }

  return true;
}

function assignmentTouchesClass(assignment, classInfo) {
  if (assignment.classId === classInfo.id) return true;

  if (
    Array.isArray(assignment.classIds) &&
    assignment.classIds.includes(classInfo.id)
  ) {
    return true;
  }

  if (assignment.scopeType === "CLASS" && assignment.scopeId === classInfo.id) {
    return true;
  }

  const offeringId = getOfferingId(assignment);
  if (offeringId && String(offeringId).startsWith(`${classInfo.id}-`)) {
    return true;
  }

  return false;
}

function assignmentMatchesContext(assignment, classInfo) {
  if (!assignmentTouchesClass(assignment, classInfo)) return false;

  if (
    assignment.schoolId &&
    classInfo.schoolId &&
    assignment.schoolId !== classInfo.schoolId
  ) {
    return false;
  }

  if (
    assignment.academicYearId &&
    classInfo.academicYearId &&
    assignment.academicYearId !== classInfo.academicYearId
  ) {
    return false;
  }

  if (
    assignment.gradeId &&
    classInfo.gradeId &&
    assignment.gradeId !== classInfo.gradeId
  ) {
    return false;
  }

  return true;
}

function isPrimaryTemplate(item) {
  const schoolType = normalize(item.schoolType);
  const id = normalize(item.id);
  const kind = normalize(item.kind);
  const subjectKey = normalize(item.subjectKey);
  const title = String(item.title || "");

  if (schoolType === "PRIMARY") return true;
  if (schoolType === "KG") return false;

  if (id.startsWith("PRIMARY") || kind.startsWith("PRIMARY")) return true;
  if (subjectKey.startsWith("PRIMARY")) return true;
  if (title.includes("ابتدائي")) return true;

  return false;
}

function pickOffering(item) {
  return {
    id: item.id,
    path: item.path,

    orgId: item.orgId || orgId,
    schoolType: item.schoolType || "",
    schoolId: item.schoolId || "",
    academicYearId: item.academicYearId || "",
    gradeId: item.gradeId || "",
    classId: item.classId || "",

    subjectKey: item.subjectKey || "",
    subjectId: item.subjectId || "",
    subjectTitle: item.subjectTitle || item.subjectTitleSnapshot || "",
    displayName: item.displayName || item.shortLabel || "",

    enabledModuleKeys: item.enabledModuleKeys || [],
    status: item.status || "",
    isActive: item.isActive,
    active: item.active,
    order: item.order,
  };
}

function pickAssignment(item, peopleById) {
  const personId = getPersonId(item);

  return {
    id: item.id,
    path: item.path,

    personId,
    person: personId ? peopleById[personId] || null : null,

    teacherPersonId: item.teacherPersonId || "",
    assignedPersonId: item.assignedPersonId || "",
    staffPersonId: item.staffPersonId || "",

    roleKey: item.roleKey || "",
    teacherRoleKey: item.teacherRoleKey || "",
    assignmentRoleKey: item.assignmentRoleKey || "",

    schoolId: item.schoolId || "",
    academicYearId: item.academicYearId || "",
    gradeId: item.gradeId || "",
    classId: item.classId || "",
    classIds: item.classIds || [],
    scopeType: item.scopeType || "",
    scopeId: item.scopeId || "",

    subjectKey: item.subjectKey || "",
    subjectId: item.subjectId || "",
    subjectTitle: item.subjectTitle || "",
    classSubjectOfferingId: item.classSubjectOfferingId || "",
    offeringId: item.offeringId || "",

    status: item.status || "",
    isActive: item.isActive,
    active: item.active,

    operationKind: item.operationKind || "",
    operationKinds: item.operationKinds || [],
  };
}

function pickLink(item, assignment, peopleById) {
  const teacherAssignmentId = item.teacherAssignmentId || item.assignmentId || "";
  const personId = assignment ? getPersonId(assignment) : "";

  return {
    id: item.id,
    path: item.path,

    teacherAssignmentId,
    assignmentId: item.assignmentId || "",

    assignment: assignment
      ? {
          id: assignment.id,
          personId,
          person: personId ? peopleById[personId] || null : null,
          subjectKey: assignment.subjectKey || "",
          subjectId: assignment.subjectId || "",
          subjectTitle: assignment.subjectTitle || "",
          roleKey:
            assignment.roleKey ||
            assignment.teacherRoleKey ||
            assignment.assignmentRoleKey ||
            "",
          classSubjectOfferingId: assignment.classSubjectOfferingId || "",
          status: assignment.status || "",
          isActive: assignment.isActive,
        }
      : null,

    schoolId: item.schoolId || "",
    academicYearId: item.academicYearId || "",
    gradeId: item.gradeId || "",
    classId: item.classId || "",
    classIds: item.classIds || [],
    scopeType: item.scopeType || "",
    scopeId: item.scopeId || "",

    subjectKey: item.subjectKey || "",
    subjectId: item.subjectId || "",
    classSubjectOfferingId: item.classSubjectOfferingId || "",
    offeringId: item.offeringId || "",

    status: item.status || "",
    isActive: item.isActive,
    active: item.active,
  };
}

function pickTemplate(item) {
  const templateItems = Array.isArray(item.templateItems)
    ? item.templateItems
    : [];

  return {
    id: item.id,
    path: item.path,
    collectionName: item.collectionName,

    title: item.title || "",
    code: item.code || "",

    schoolType: item.schoolType || "",
    schoolId: item.schoolId || "",
    academicYearId: item.academicYearId || "",
    gradeId: item.gradeId || "",
    applicableGradeIds: item.applicableGradeIds || [],

    subjectKey: item.subjectKey || "",
    subjectId: item.subjectId || "",
    subjectTitle: item.subjectTitle || "",

    kind: item.kind || "",
    assessmentSlot: item.assessmentSlot || "",

    evaluatorRoleKey: item.evaluatorRoleKey || "",
    ownerRoleKey: item.ownerRoleKey || "",
    ownerRoleLabel: item.ownerRoleLabel || "",

    maxScore: item.maxScore,
    itemMaxScore: item.itemMaxScore,
    requiresLearningLossFollowUp: item.requiresLearningLossFollowUp,
    learningLossThresholdPercentage: item.learningLossThresholdPercentage,
    learningLossThresholdScore: item.learningLossThresholdScore,

    isActive: item.isActive,
    status: item.status || "",

    templateItemsCount: templateItems.length,
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

async function getCollectionWithName(collectionName) {
  const snap = await db
    .collection("orgs")
    .doc(orgId)
    .collection(collectionName)
    .get();

  return snap.docs.map((docSnap) => ({
    ...compactDoc(docSnap),
    collectionName,
  }));
}

async function loadClasses() {
  const byComposite = new Map();

  try {
    const snap = await db.collectionGroup("classes").get();

    for (const docSnap of snap.docs) {
      const item = normalizeClassDoc(docSnap);

      if (item.orgId && item.orgId !== orgId) continue;
      if (!isPrimaryLikeClass(item)) continue;
      if (!matchesOptionalFilters(item)) continue;

      const key = [
        item.schoolId,
        item.academicYearId,
        item.gradeId,
        item.id,
        item.path,
      ].join("::");

      byComposite.set(key, item);
    }
  } catch (error) {
    console.log("collectionGroup('classes') failed:");
    console.log(error.message || error);
  }

  try {
    const snap = await db.collection("orgs").doc(orgId).collection("classes").get();

    for (const docSnap of snap.docs) {
      const item = normalizeClassDoc(docSnap);

      if (!isPrimaryLikeClass(item)) continue;
      if (!matchesOptionalFilters(item)) continue;

      const key = [
        item.schoolId,
        item.academicYearId,
        item.gradeId,
        item.id,
        item.path,
      ].join("::");

      byComposite.set(key, item);
    }
  } catch (error) {
    console.log("root org classes failed:");
    console.log(error.message || error);
  }

  return Array.from(byComposite.values()).sort((a, b) => {
    return [
      a.schoolId,
      a.academicYearId,
      a.gradeId,
      String(a.order ?? ""),
      a.id,
    ]
      .join("::")
      .localeCompare(
        [
          b.schoolId,
          b.academicYearId,
          b.gradeId,
          String(b.order ?? ""),
          b.id,
        ].join("::"),
      );
  });
}

async function loadPeople(personIds) {
  const result = {};

  for (const personId of personIds) {
    if (!personId) continue;

    try {
      const snap = await db
        .collection("orgs")
        .doc(orgId)
        .collection("people")
        .doc(personId)
        .get();

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

function buildSubjectMatrix(classesSummary) {
  const map = new Map();

  for (const classSummary of classesSummary) {
    for (const offering of classSummary.offerings) {
      const key = offering.subjectKey || "NO_SUBJECT_KEY";

      if (!map.has(key)) {
        map.set(key, {
          subjectKey: key,
          subjectTitle: offering.subjectTitle || offering.displayName || "",
          classesCount: 0,
          offeringIds: [],
        });
      }

      const entry = map.get(key);
      entry.classesCount += 1;
      entry.offeringIds.push(offering.id);
    }
  }

  return Array.from(map.values()).sort((a, b) =>
    a.subjectKey.localeCompare(b.subjectKey),
  );
}

async function main() {
  const startedAt = Date.now();

  console.log("Inspecting PRIMARY classes and subjects...");
  console.log({
    orgId,
    academicYearIdFilter: academicYearIdFilter || "ALL",
    schoolIdFilter: schoolIdFilter || "ALL",
  });

  const [
    classes,
    offerings,
    teacherAssignments,
    teacherAssignmentClassLinks,
    assessmentTemplates,
    trackerTemplates,
  ] = await Promise.all([
    loadClasses(),
    getCollection("classSubjectOfferings"),
    getCollection("teacherAssignments"),
    getCollection("teacherAssignmentClassLinks"),
    getCollectionWithName("studentAssessmentTemplates"),
    getCollectionWithName("studentTrackerTemplates"),
  ]);

  const assignmentsById = new Map(
    teacherAssignments.map((item) => [item.id, item]),
  );

  const personIds = Array.from(
    new Set(teacherAssignments.map(getPersonId).filter(Boolean)),
  );

  const peopleById = await loadPeople(personIds);

  const classesSummary = classes.map((classInfo) => {
    const classOfferings = offerings
      .filter((item) => sameClassContext(item, classInfo))
      .map(pickOffering)
      .sort((a, b) => {
        const aOrder = typeof a.order === "number" ? a.order : 999;
        const bOrder = typeof b.order === "number" ? b.order : 999;

        if (aOrder !== bOrder) return aOrder - bOrder;

        return String(a.subjectKey || a.id).localeCompare(
          String(b.subjectKey || b.id),
        );
      });

    const directAssignments = teacherAssignments
      .filter((item) => assignmentMatchesContext(item, classInfo))
      .map((item) => pickAssignment(item, peopleById));

    const links = teacherAssignmentClassLinks
      .filter((item) => linkMatchesContext(item, classInfo))
      .map((link) => {
        const teacherAssignmentId =
          link.teacherAssignmentId || link.assignmentId || "";
        const assignment = assignmentsById.get(teacherAssignmentId) || null;

        return pickLink(link, assignment, peopleById);
      });

    return {
      classInfo,

      counts: {
        offerings: classOfferings.length,
        directAssignments: directAssignments.length,
        links: links.length,
      },

      offerings: classOfferings,
      directAssignments,
      links,
    };
  });

  const primaryTemplates = [...assessmentTemplates, ...trackerTemplates]
    .filter(isPrimaryTemplate)
    .map(pickTemplate)
    .sort((a, b) => {
      const collectionCompare = a.collectionName.localeCompare(
        b.collectionName,
      );

      if (collectionCompare !== 0) return collectionCompare;

      return String(a.id).localeCompare(String(b.id));
    });

  const subjectMatrix = buildSubjectMatrix(classesSummary);

  const report = {
    context: {
      orgId,
      academicYearIdFilter: academicYearIdFilter || "",
      schoolIdFilter: schoolIdFilter || "",
    },

    counts: {
      primaryClasses: classes.length,
      classSubjectOfferings: offerings.length,
      teacherAssignments: teacherAssignments.length,
      teacherAssignmentClassLinks: teacherAssignmentClassLinks.length,
      primaryTemplates: primaryTemplates.length,
      people: Object.keys(peopleById).length,
    },

    subjectMatrix,

    classesSummary,

    primaryTemplates,
  };

  console.log("\n=== COUNTS ===");
  console.dir(report.counts, { depth: null });

  console.log("\n=== PRIMARY CLASSES ===");
  console.table(
    classesSummary.map((item) => ({
      schoolId: item.classInfo.schoolId,
      academicYearId: item.classInfo.academicYearId,
      gradeId: item.classInfo.gradeId,
      classId: item.classInfo.id,
      title: item.classInfo.title,
      offerings: item.counts.offerings,
      assignments: item.counts.directAssignments,
      links: item.counts.links,
      students: item.classInfo.studentCount ?? "—",
    })),
  );

  console.log("\n=== SUBJECT MATRIX FROM OFFERINGS ===");
  console.table(
    subjectMatrix.map((item) => ({
      subjectKey: item.subjectKey,
      subjectTitle: item.subjectTitle,
      classesCount: item.classesCount,
      offeringsCount: item.offeringIds.length,
    })),
  );

  console.log("\n=== PRIMARY TEMPLATES ===");
  console.table(
    primaryTemplates.map((item) => ({
      collection: item.collectionName,
      id: item.id,
      title: item.title,
      schoolType: item.schoolType,
      gradeId: item.gradeId || "—",
      subjectKey: item.subjectKey || "—",
      kind: item.kind,
      slot: item.assessmentSlot || "—",
      maxScore: item.maxScore ?? "—",
      items: item.templateItemsCount,
      opensLoss: item.requiresLearningLossFollowUp === true ? "YES" : "NO",
    })),
  );

  const outputPath = path.join(
    __dirname,
    "inspect-primary-classes-subjects-report.json",
  );

  fs.writeFileSync(outputPath, JSON.stringify(report, null, 2), "utf8");

  const finishedAt = Date.now();

  console.log("\nReport written to:");
  console.log(outputPath);

  console.log("\nDone.");
  console.log({
    durationMs: finishedAt - startedAt,
  });
}

main().catch((error) => {
  console.error("Failed to inspect PRIMARY classes and subjects.");
  console.error(error);
  process.exit(1);
});