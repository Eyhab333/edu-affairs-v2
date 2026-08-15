/*
 * Read-only inspection of the existing kindergarten setup.
 *
 * This script performs Firestore reads only. It does not create, update,
 * delete, or seed any Firestore document.
 *
 * Usage:
 *   node scripts/inspections/inspect-kindergarten-setup.cjs
 *   ORG_ID=takween node scripts/inspections/inspect-kindergarten-setup.cjs
 *   node scripts/inspections/inspect-kindergarten-setup.cjs --json
 */

const admin = require("firebase-admin");
const fs = require("node:fs");
const path = require("node:path");

const ORG_ID = process.env.ORG_ID || "takween";
const JSON_ONLY = process.argv.includes("--json");
const REPORT_PATH = path.resolve(
  process.env.REPORT_PATH ||
    path.join(
      process.cwd(),
      "scripts",
      "inspections",
      "inspect-kindergarten-setup-report.json",
    ),
);

const REQUESTED_SUBJECTS = [
  { label: "القرآن الكريم", codePoints: "\u0627\u0644\u0642\u0631\u0622\u0646 \u0627\u0644\u0643\u0631\u064a\u0645" },
  {
    label: "الأذكار والهوية الوطنية والأناشيد",
    codePoints: "\u0627\u0644\u0623\u0630\u0643\u0627\u0631 \u0648\u0627\u0644\u0647\u0648\u064a\u0629 \u0627\u0644\u0648\u0637\u0646\u064a\u0629 \u0648\u0627\u0644\u0623\u0646\u0627\u0634\u064a\u062f",
  },
  { label: "بساتين المعرفة", codePoints: "\u0628\u0633\u0627\u062a\u064a\u0646 \u0627\u0644\u0645\u0639\u0631\u0641\u0629" },
  { label: "نعد ونحسب", codePoints: "\u0646\u0639\u062f \u0648\u0646\u062d\u0633\u0628" },
  { label: "القيم", codePoints: "\u0627\u0644\u0642\u064a\u0645" },
  { label: "الأركان", codePoints: "\u0627\u0644\u0623\u0631\u0643\u0627\u0646" },
].map((item) => ({ ...item, text: item.codePoints }));

const BASE_SUBJECT_LABELS = new Set([
  "القرآن الكريم",
  "الأذكار والهوية الوطنية والأناشيد",
  "بساتين المعرفة",
  "نعد ونحسب",
]);

const TEACHER_ROLE_KEYS = new Set(["KG_TEACHER", "TEACHER"]);

function initAdmin() {
  if (admin.apps.length > 0) return;

  const serviceAccountPath = path.resolve(
    process.env.SERVICE_ACCOUNT_PATH ||
      path.join(process.cwd(), "service-account.json"),
  );
  const serviceAccount = require(serviceAccountPath);

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    projectId: serviceAccount.project_id,
  });
}

function asString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function uniqueStrings(values) {
  return Array.from(new Set(values.map(asString).filter(Boolean)));
}

function uniqueByPath(items) {
  return Array.from(new Map(items.map((item) => [item.path, item])).values());
}

function docData(snapshot) {
  return {
    id: snapshot.id,
    path: snapshot.ref.path,
    ...(snapshot.data() || {}),
  };
}

function isActive(data) {
  const status = asString(data.status).toUpperCase();
  return (
    data.isActive !== false &&
    data.active !== false &&
    data.isArchived !== true &&
    !["DISABLED", "ENDED", "INACTIVE", "REVOKED", "ARCHIVED"].includes(status)
  );
}

function normalizeArabic(value) {
  return asString(value)
    .normalize("NFKC")
    .replace(/[\u064B-\u065F\u0670]/g, "")
    .replace(/[إأآٱ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/[\s\-_\/،,.:؛()[\]{}]+/g, "")
    .toLowerCase();
}

function schoolType(data) {
  return asString(data.schoolType || data.profile?.schoolType).toUpperCase();
}

function schoolName(data, id) {
  return asString(
    data.name ||
      data.title ||
      data.displayName ||
      data.profile?.name ||
      data.profile?.title ||
      id,
  );
}

function isKindergartenSchool(item) {
  const id = asString(item.id).toLowerCase();
  const name = normalizeArabic(schoolName(item, item.id));
  return (
    schoolType(item) === "KG" ||
    id.startsWith("kg") ||
    name.includes(normalizeArabic("روضة")) ||
    name.includes("kindergarten")
  );
}

function gradeId(item) {
  return asString(item.gradeId || item.id);
}

function gradeName(item) {
  return asString(item.name || item.title || item.displayName || item.label || item.code || item.id);
}

function className(item) {
  return asString(item.title || item.name || item.displayName || item.code || item.id);
}

function subjectKey(item) {
  return asString(item.subjectKey || item.key || item.code);
}

function subjectTitle(item) {
  return asString(
    item.subjectTitle ||
      item.subjectTitleSnapshot ||
      item.title ||
      item.name ||
      item.displayName ||
      item.label ||
      subjectKey(item),
  );
}

function levelNumber(item) {
  const value = `${gradeId(item)} ${gradeName(item)}`.toLowerCase();
  if (/\bkg\s*[-_ ]?1\b|\bkindergarten\s*1\b|\blevel\s*1\b/.test(value)) return 1;
  if (/\bkg\s*[-_ ]?2\b|\bkindergarten\s*2\b|\blevel\s*2\b/.test(value)) return 2;
  if (/\bkg\s*[-_ ]?3\b|\bkindergarten\s*3\b|\blevel\s*3\b/.test(value)) return 3;

  const normalized = normalizeArabic(`${gradeId(item)} ${gradeName(item)}`);
  if (normalized.includes(normalizeArabic("المستوىالأول")) || normalized.includes(normalizeArabic("الاول"))) return 1;
  if (normalized.includes(normalizeArabic("المستوىالثاني")) || normalized.includes(normalizeArabic("الثاني"))) return 2;
  if (normalized.includes(normalizeArabic("المستوىالثالث")) || normalized.includes(normalizeArabic("الثالث"))) return 3;
  return null;
}

function levelLabel(number) {
  return number === 1
    ? "المستوى الأول"
    : number === 2
      ? "المستوى الثاني"
      : number === 3
        ? "المستوى الثالث"
        : "غير محدد";
}

function requestedSubjectMatch(item) {
  const candidates = [subjectTitle(item), item.name, item.title, item.displayName].filter(Boolean);
  const normalizedCandidates = candidates.map(normalizeArabic);

  return REQUESTED_SUBJECTS.find((requested) => {
    const target = normalizeArabic(requested.text);
    return normalizedCandidates.some(
      (candidate) => candidate === target || candidate.includes(target) || target.includes(candidate),
    );
  }) || null;
}

function personIdOf(data) {
  return asString(
    data.personId ||
      data.teacherPersonId ||
      data.staffPersonId ||
      data.assignedPersonId ||
      data.actorPersonId,
  );
}

function roleKeyOf(data) {
  return asString(data.roleKey || data.role || data.teacherRoleKey || data.assignmentRoleKey).toUpperCase();
}

function uidOf(item) {
  if (asString(item.uid)) return asString(item.uid);
  const nestedMatch = asString(item.path).match(/^users\/([^/]+)\/orgMemberships\//);
  return nestedMatch ? nestedMatch[1] : asString(item.id);
}

function membershipSchoolIds(data) {
  return uniqueStrings([
    ...(Array.isArray(data.schoolIds) ? data.schoolIds : []),
    ...(Array.isArray(data.scopes?.schoolIds) ? data.scopes.schoolIds : []),
    data.schoolId,
    data.scopeId,
  ]);
}

function membershipCoversKg(data, kgSchoolIds) {
  const ids = membershipSchoolIds(data);
  return (
    ids.some((id) => kgSchoolIds.has(id)) ||
    data.scopes?.canAccessAllSchools === true
  );
}

function contextTouchesKg(data, kgSchoolIds, kgClassIds, kgGradeIds, kgOfferingIds) {
  const schoolId = asString(data.schoolId || data.school?.id);
  const gradeIdValue = asString(data.gradeId);
  const classIdValue = asString(data.classId || data.scopeId);
  const offeringId = asString(data.classSubjectOfferingId || data.offeringId || data.subjectOfferingId);
  return (
    kgSchoolIds.has(schoolId) ||
    kgGradeIds.has(gradeIdValue) ||
    kgClassIds.has(classIdValue) ||
    (Array.isArray(data.classIds) && data.classIds.some((id) => kgClassIds.has(id))) ||
    kgOfferingIds.has(offeringId) ||
    [...kgOfferingIds].some((id) => id && (offeringId.startsWith(`${id}-`) || asString(data.id).startsWith(`${id}-`)))
  );
}

function compactClass(item, gradeById) {
  const id = asString(item.id);
  const grade = gradeById.get(gradeId(item));
  return {
    id,
    path: item.path,
    schoolId: asString(item.schoolId),
    academicYearId: asString(item.academicYearId),
    gradeId: gradeId(item),
    gradeName: grade ? gradeName(grade) : "",
    level: levelLabel(levelNumber({ ...item, id: gradeId(item), name: grade ? gradeName(grade) : "" })),
    name: className(item),
    code: asString(item.code),
    streamId: asString(item.streamId),
    isActive: isActive(item),
  };
}

function compactOffering(item) {
  return {
    id: asString(item.id),
    path: item.path,
    schoolId: asString(item.schoolId),
    academicYearId: asString(item.academicYearId),
    gradeId: asString(item.gradeId),
    classId: asString(item.classId),
    subjectKey: subjectKey(item),
    subjectId: asString(item.subjectId),
    subjectTitle: subjectTitle(item),
    status: asString(item.status),
    isActive: item.isActive,
    isArchived: item.isArchived,
    order: item.order ?? null,
    offeringKind: asString(item.offeringKind),
    enabledModuleKeys: Array.isArray(item.enabledModuleKeys) ? item.enabledModuleKeys : [],
  };
}

function compactAssignment(item) {
  return {
    id: asString(item.id),
    path: item.path,
    personId: personIdOf(item),
    teacherPersonId: asString(item.teacherPersonId),
    roleKey: roleKeyOf(item),
    schoolId: asString(item.schoolId),
    academicYearId: asString(item.academicYearId),
    gradeId: asString(item.gradeId),
    classId: asString(item.classId),
    classIds: Array.isArray(item.classIds) ? item.classIds : [],
    scopeType: asString(item.scopeType),
    scopeId: asString(item.scopeId),
    subjectKey: subjectKey(item),
    subjectId: asString(item.subjectId),
    subjectTitle: subjectTitle(item),
    classSubjectOfferingId: asString(item.classSubjectOfferingId),
    offeringId: asString(item.offeringId),
    status: asString(item.status),
    isActive: item.isActive,
    operationKind: asString(item.operationKind),
    operationKinds: Array.isArray(item.operationKinds) ? item.operationKinds : [],
  };
}

async function getDocs(db, collectionPath) {
  const snapshot = await db.collection(collectionPath).get();
  return snapshot.docs.map(docData);
}

async function loadNestedCollection(db, collectionPath) {
  try {
    return await getDocs(db, collectionPath);
  } catch (error) {
    return [{ __loadError: error.message || String(error), path: collectionPath }];
  }
}

async function loadKindergartenStructure(db) {
  const schoolDocs = await getDocs(db, `orgs/${ORG_ID}/schools`);
  const kgSchools = schoolDocs.filter(isKindergartenSchool);
  const kgSchoolIds = new Set(kgSchools.map((item) => item.id));
  const years = [];
  const grades = [];
  const classes = [];
  const subjects = [];
  const loadErrors = [];

  for (const school of kgSchools) {
    const schoolYears = await loadNestedCollection(db, `orgs/${ORG_ID}/schools/${school.id}/academicYears`);
    for (const year of schoolYears) {
      if (year.__loadError) {
        loadErrors.push(year);
        continue;
      }
      const yearItem = {
        ...year,
        schoolId: school.id,
        schoolName: schoolName(school, school.id),
      };
      years.push(yearItem);

      const [yearGrades, yearClasses, yearSubjects] = await Promise.all([
        loadNestedCollection(db, `orgs/${ORG_ID}/schools/${school.id}/academicYears/${year.id}/grades`),
        loadNestedCollection(db, `orgs/${ORG_ID}/schools/${school.id}/academicYears/${year.id}/classes`),
        loadNestedCollection(db, `orgs/${ORG_ID}/schools/${school.id}/academicYears/${year.id}/subjects`),
      ]);

      for (const grade of yearGrades) {
        if (grade.__loadError) loadErrors.push(grade);
        else grades.push({ ...grade, schoolId: school.id, academicYearId: year.id });
      }
      for (const classItem of yearClasses) {
        if (classItem.__loadError) loadErrors.push(classItem);
        else classes.push({ ...classItem, schoolId: school.id, academicYearId: year.id, path: classItem.path });
      }
      for (const subject of yearSubjects) {
        if (subject.__loadError) loadErrors.push(subject);
        else subjects.push({ ...subject, schoolId: school.id, academicYearId: year.id });
      }
    }
  }

  // Include legacy/root class documents if present, while de-duplicating the
  // nested canonical documents above.
  for (const item of await loadNestedCollection(db, `orgs/${ORG_ID}/classes`)) {
    if (item.__loadError) {
      loadErrors.push(item);
      continue;
    }
    if (kgSchoolIds.has(asString(item.schoolId))) classes.push(item);
  }

  const kgClassIds = new Set(classes.map((item) => asString(item.id)).filter(Boolean));
  const kgGradeIds = new Set(classes.map((item) => gradeId(item)).filter(Boolean));

  return {
    schools: kgSchools,
    years: uniqueByPath(years),
    grades: uniqueByPath(grades),
    classes: uniqueByPath(classes),
    subjects: uniqueByPath(subjects),
    kgSchoolIds,
    kgClassIds,
    kgGradeIds,
    loadErrors,
  };
}

async function loadMemberships(db, kgSchoolIds) {
  const rootMemberships = await getDocs(db, `orgs/${ORG_ID}/memberships`);
  const userDocs = await db.collection("users").get();
  const nestedMemberships = [];

  for (const user of userDocs.docs) {
    const membership = await db.doc(`users/${user.id}/orgMemberships/${ORG_ID}`).get();
    if (membership.exists) nestedMemberships.push(docData(membership));
  }

  const allMemberships = uniqueByPath([...rootMemberships, ...nestedMemberships]);
  const membershipCandidates = allMemberships.filter((item) => {
    return isActive(item) && TEACHER_ROLE_KEYS.has(roleKeyOf(item)) && membershipCoversKg(item, kgSchoolIds);
  });
  const teacherMemberships = Array.from(
    membershipCandidates.reduce((map, item) => {
      const identity = [
        uidOf(item),
        personIdOf(item),
        roleKeyOf(item),
        membershipSchoolIds(item).sort().join(","),
        asString(item.scopeType),
        asString(item.scopeId),
      ].join("|");
      const existing = map.get(identity);
      if (!existing || asString(existing.path).startsWith(`users/`)) {
        map.set(identity, item);
      }
      return map;
    }, new Map()).values(),
  );

  const personIds = uniqueStrings(teacherMemberships.map(personIdOf));
  const personSnapshots = personIds.length
    ? await db.getAll(...personIds.map((personId) => db.doc(`orgs/${ORG_ID}/people/${personId}`)))
    : [];
  const peopleById = new Map(personSnapshots.filter((item) => item.exists).map((item) => [item.id, item.data() || {}]));

  return teacherMemberships
    .map((item) => {
      const person = peopleById.get(personIdOf(item)) || {};
      return {
        uid: uidOf(item),
        personId: personIdOf(item),
        displayName: asString(person.displayName || person.name || item.displayName || item.title),
        roleKey: roleKeyOf(item),
        schoolIds: membershipSchoolIds(item),
        scopes: {
          schoolIds: Array.isArray(item.scopes?.schoolIds) ? item.scopes.schoolIds : [],
          scopeGroupIds: Array.isArray(item.scopes?.scopeGroupIds) ? item.scopes.scopeGroupIds : [],
          gradeIds: Array.isArray(item.scopes?.gradeIds) ? item.scopes.gradeIds : [],
          classIds: Array.isArray(item.scopes?.classIds) ? item.scopes.classIds : [],
          subjectKeys: Array.isArray(item.scopes?.subjectKeys) ? item.scopes.subjectKeys : [],
          canAccessAllSchools: item.scopes?.canAccessAllSchools === true,
        },
        scopeType: asString(item.scopeType),
        scopeId: asString(item.scopeId),
        path: item.path,
      };
    })
    .sort((left, right) => left.displayName.localeCompare(right.displayName, "ar"));
}

async function main() {
  initAdmin();
  const db = admin.firestore();
  const orgSnapshot = await db.doc(`orgs/${ORG_ID}`).get();
  if (!orgSnapshot.exists) throw new Error(`Organization not found: ${ORG_ID}`);

  const structure = await loadKindergartenStructure(db);
  const kgSchoolIds = structure.kgSchoolIds;
  const kgClassIds = structure.kgClassIds;
  const kgGradeIds = structure.kgGradeIds;

  const [allOfferings, allTeacherAssignments, allLinks, allOperationalAssignments, memberships] = await Promise.all([
    getDocs(db, `orgs/${ORG_ID}/classSubjectOfferings`),
    getDocs(db, `orgs/${ORG_ID}/teacherAssignments`),
    getDocs(db, `orgs/${ORG_ID}/teacherAssignmentClassLinks`),
    getDocs(db, `orgs/${ORG_ID}/operationalAssignments`),
    loadMemberships(db, kgSchoolIds),
  ]);

  const offerings = allOfferings.filter((item) => contextTouchesKg(item, kgSchoolIds, kgClassIds, kgGradeIds, new Set())).map(compactOffering);
  const kgOfferingIds = new Set(offerings.map((item) => item.id).filter(Boolean));
  const kgTeacherPersonIds = new Set(memberships.map((item) => item.personId).filter(Boolean));

  const teacherAssignments = allTeacherAssignments
    .filter((item) => kgTeacherPersonIds.has(personIdOf(item)) || contextTouchesKg(item, kgSchoolIds, kgClassIds, kgGradeIds, kgOfferingIds))
    .map(compactAssignment);
  const teacherAssignmentIds = new Set(teacherAssignments.map((item) => item.id));

  const teacherAssignmentClassLinks = allLinks
    .filter((item) => {
      const assignmentId = asString(item.teacherAssignmentId || item.assignmentId);
      return (
        teacherAssignmentIds.has(assignmentId) ||
        contextTouchesKg(item, kgSchoolIds, kgClassIds, kgGradeIds, kgOfferingIds)
      );
    })
    .map((item) => ({
      id: asString(item.id),
      path: item.path,
      teacherAssignmentId: asString(item.teacherAssignmentId || item.assignmentId),
      assignmentId: asString(item.assignmentId),
      schoolId: asString(item.schoolId),
      academicYearId: asString(item.academicYearId),
      gradeId: asString(item.gradeId),
      classId: asString(item.classId),
      classIds: Array.isArray(item.classIds) ? item.classIds : [],
      scopeType: asString(item.scopeType),
      scopeId: asString(item.scopeId),
      subjectKey: subjectKey(item),
      classSubjectOfferingId: asString(item.classSubjectOfferingId),
      status: asString(item.status),
      isActive: item.isActive,
    }));

  const operationalAssignments = allOperationalAssignments
    .filter((item) => kgTeacherPersonIds.has(personIdOf(item)) || contextTouchesKg(item, kgSchoolIds, kgClassIds, kgGradeIds, kgOfferingIds))
    .map((item) => ({
      id: asString(item.id),
      path: item.path,
      actorPersonId: asString(item.actorPersonId),
      actorRoleKey: roleKeyOf(item),
      operationKind: asString(item.operationKind),
      operationKinds: Array.isArray(item.operationKinds) ? item.operationKinds : [],
      schoolId: asString(item.schoolId),
      academicYearId: asString(item.academicYearId),
      gradeId: asString(item.gradeId),
      classId: asString(item.classId),
      classIds: Array.isArray(item.classIds) ? item.classIds : [],
      scopeType: asString(item.scopeType),
      scopeId: asString(item.scopeId),
      subjectKey: subjectKey(item),
      classSubjectOfferingId: asString(item.classSubjectOfferingId),
      status: asString(item.status),
      isActive: item.isActive,
    }));

  const gradeById = new Map(structure.grades.map((item) => [gradeId(item), item]));
  const classSummary = structure.classes
    .filter((item) => kgSchoolIds.has(asString(item.schoolId)))
    .map((item) => compactClass(item, gradeById))
    .sort((a, b) => [a.schoolId, a.academicYearId, a.gradeId, a.name, a.id].join("|").localeCompare([b.schoolId, b.academicYearId, b.gradeId, b.name, b.id].join("|")));

  const catalogEntries = structure.subjects
    .map((item) => ({
      id: asString(item.id),
      path: item.path,
      schoolId: asString(item.schoolId),
      academicYearId: asString(item.academicYearId),
      gradeId: asString(item.gradeId),
      subjectKey: subjectKey(item),
      subjectId: asString(item.subjectId || item.id),
      title: subjectTitle(item),
      requestedSubject: requestedSubjectMatch(item)?.label || null,
      isActive: isActive(item),
    }))
    .sort((a, b) => [a.schoolId, a.academicYearId, a.title, a.id].join("|").localeCompare([b.schoolId, b.academicYearId, b.title, b.id].join("|")));

  const subjectMatches = REQUESTED_SUBJECTS.map((requested) => {
    const matchingCatalog = catalogEntries.filter((item) => requestedSubjectMatch(item)?.label === requested.label);
    const matchingOfferings = offerings.filter((item) => requestedSubjectMatch(item)?.label === requested.label);
    const actualKeys = uniqueStrings([...matchingCatalog, ...matchingOfferings].map((item) => item.subjectKey));
    return {
      requestedSubject: requested.label,
      existsInCatalog: matchingCatalog.length > 0,
      existsInOfferings: matchingOfferings.length > 0,
      actualSubjectKeys: actualKeys,
      catalogEntries: matchingCatalog,
      offeringIds: matchingOfferings.map((item) => item.id),
    };
  });

  const levels = [1, 2, 3].map((number) => ({
    requestedLevel: levelLabel(number),
    grades: structure.grades
      .filter((item) => levelNumber(item) === number)
      .map((item) => ({ id: gradeId(item), name: gradeName(item), schoolId: asString(item.schoolId), academicYearId: asString(item.academicYearId), path: item.path })),
    classes: classSummary.filter((item) => item.level === levelLabel(number)),
  }));

  const matchingSubjectKeyByLabel = new Map(
    subjectMatches.flatMap((item) => item.actualSubjectKeys.map((key) => [item.requestedSubject, key])),
  );
  const expectedOfferings = [];
  const unexpectedLevelOneDomainOfferings = [];
  const offeringBelongsToClass = (offering, classItem) =>
    offering.classId === classItem.id &&
    (!offering.schoolId || offering.schoolId === classItem.schoolId) &&
    (!offering.academicYearId || offering.academicYearId === classItem.academicYearId);

  for (const item of classSummary) {
    const requiredLabels = new Set(BASE_SUBJECT_LABELS);
    if (item.level === "المستوى الثاني" || item.level === "المستوى الثالث") {
      requiredLabels.add("القيم");
      requiredLabels.add("الأركان");
    }
    for (const label of requiredLabels) {
      const key = matchingSubjectKeyByLabel.get(label) || "";
      const matching = offerings.filter((offering) => {
        if (!offeringBelongsToClass(offering, item)) return false;
        if (key) return offering.subjectKey === key;
        return requestedSubjectMatch(offering)?.label === label;
      });
      if (matching.length === 0) {
        expectedOfferings.push({
          schoolId: item.schoolId,
          academicYearId: item.academicYearId,
          classId: item.id,
          level: item.level,
          requestedSubject: label,
          actualSubjectKey: key,
        });
      }
    }
    if (item.level === "المستوى الأول") {
      const forbidden = offerings.filter((offering) => offeringBelongsToClass(offering, item) && ["القيم", "الأركان"].includes(requestedSubjectMatch(offering)?.label));
      unexpectedLevelOneDomainOfferings.push(...forbidden.map((offering) => ({
        schoolId: item.schoolId,
        academicYearId: item.academicYearId,
        classId: item.id,
        offeringId: offering.id,
        subjectKey: offering.subjectKey,
        subjectTitle: offering.subjectTitle,
      })));
    }
  }

  const report = {
    metadata: {
      generatedAt: new Date().toISOString(),
      projectId: admin.app().options.projectId,
      orgId: ORG_ID,
      firestoreWritesPerformed: false,
      readOnly: true,
    },
    schools: structure.schools.map((item) => ({ id: item.id, name: schoolName(item, item.id), schoolType: schoolType(item), path: item.path })),
    academicYears: uniqueByPath(structure.years).map((item) => ({ id: item.id, schoolId: item.schoolId, schoolName: item.schoolName, name: asString(item.name || item.title || item.displayName || item.id), path: item.path, isActive: isActive(item) })),
    levels,
    classes: classSummary,
    subjects: {
      catalogEntries,
      requestedSubjects: subjectMatches,
      offeringSubjectEntries: uniqueByPath(offerings).map((item) => ({ subjectKey: item.subjectKey, subjectId: item.subjectId, title: item.subjectTitle })).sort((a, b) => [a.title, a.subjectKey].join("|").localeCompare([b.title, b.subjectKey].join("|"))),
    },
    offerings,
    kgTeacherMemberships: memberships,
    existingAssignments: {
      teacherAssignments,
      teacherAssignmentClassLinks,
      operationalAssignments,
    },
    missingDataRequiredBeforeSeeding: {
      missingRequestedCatalogSubjects: subjectMatches.filter((item) => !item.existsInCatalog).map((item) => item.requestedSubject),
      missingRequestedSubjectKeys: subjectMatches.filter((item) => item.existsInCatalog && item.actualSubjectKeys.length === 0).map((item) => item.requestedSubject),
      missingExpectedOfferings: expectedOfferings,
      unexpectedLevelOneValuesOrLearningCornersOfferings: unexpectedLevelOneDomainOfferings,
      classesWithUnresolvedLevel: classSummary.filter((item) => item.level === "غير محدد").map((item) => ({ classId: item.id, gradeId: item.gradeId, gradeName: item.gradeName })),
      noKgTeacherMemberships: memberships.length === 0,
      noTeacherAssignmentsForKgTeachers: teacherAssignments.length === 0,
    },
    loadErrors: structure.loadErrors,
  };

  fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
  fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2), "utf8");

  if (JSON_ONLY) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  console.log("Read-only kindergarten inspection; Firestore writes: 0");
  console.log(`Organization: ${ORG_ID}`);
  console.log(`Report: ${REPORT_PATH}`);
  console.log("\nSCHOOLS");
  console.table(report.schools);
  console.log("\nACADEMIC YEARS");
  console.table(report.academicYears);
  console.log("\nLEVELS / GRADES / CLASSES");
  console.table(levels.flatMap((item) => item.classes.length ? item.classes : item.grades.map((grade) => ({ requestedLevel: item.requestedLevel, gradeId: grade.id, gradeName: grade.name, schoolId: grade.schoolId, academicYearId: grade.academicYearId }))));
  console.log("\nSUBJECTS");
  console.table(subjectMatches.map((item) => ({ requestedSubject: item.requestedSubject, existsInCatalog: item.existsInCatalog, existsInOfferings: item.existsInOfferings, actualSubjectKeys: item.actualSubjectKeys.join(", ") || "" })));
  console.log("\nOFFERINGS");
  console.table(offerings.map((item) => ({ classId: item.classId, gradeId: item.gradeId, subjectKey: item.subjectKey, subjectTitle: item.subjectTitle, id: item.id })));
  console.log("\nKG TEACHER MEMBERSHIPS");
  console.table(memberships.map((item) => ({ uid: item.uid, personId: item.personId, displayName: item.displayName, roleKey: item.roleKey, schoolIds: item.schoolIds.join(", "), scopeType: item.scopeType, scopeId: item.scopeId })));
  console.log("\nEXISTING ASSIGNMENTS");
  console.log({ teacherAssignments: teacherAssignments.length, teacherAssignmentClassLinks: teacherAssignmentClassLinks.length, operationalAssignments: operationalAssignments.length });
  console.table(teacherAssignments);
  console.log("\nMISSING DATA REQUIRED BEFORE SEEDING");
  console.dir(report.missingDataRequiredBeforeSeeding, { depth: null });
}

main().catch((error) => {
  console.error("Kindergarten inspection failed:", error.stack || error);
  process.exitCode = 1;
});
