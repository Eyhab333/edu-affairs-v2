/* eslint-disable no-console */

const admin = require("firebase-admin");
const path = require("path");

const serviceAccount = require(path.join(__dirname, "./service-account.json"));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

const ORG_ID = process.env.ORG_ID || "takween";

function getArg(name, fallback = "") {
  const prefix = `--${name}=`;
  const found = process.argv.find((item) => item.startsWith(prefix));
  return found ? found.slice(prefix.length).trim() : fallback;
}

function printSection(title) {
  console.log("");
  console.log("=".repeat(90));
  console.log(title);
  console.log("=".repeat(90));
}

function printData(label, data) {
  console.log("");
  console.log(`--- ${label} ---`);
  console.dir(data, { depth: 12, colors: true });
}

function readString(data, key, fallback = "") {
  const value = data?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function isActive(data) {
  if (!data) return false;
  if (data.status && data.status !== "ACTIVE") return false;
  if (data.isActive === false) return false;
  if (data.active === false) return false;
  if (data.isArchived === true) return false;
  return true;
}

async function readDoc(docPath) {
  const snap = await db.doc(docPath).get();

  if (!snap.exists) {
    return null;
  }

  return {
    id: snap.id,
    path: snap.ref.path,
    ...snap.data(),
  };
}

async function queryByField(collectionPath, field, value, limit = 100) {
  if (!value) return [];

  const snap = await db
    .collection(collectionPath)
    .where(field, "==", value)
    .limit(limit)
    .get();

  return snap.docs.map((doc) => ({
    id: doc.id,
    path: doc.ref.path,
    ...doc.data(),
  }));
}

function uniqueByPath(rows) {
  const map = new Map();

  for (const row of rows) {
    if (row?.path) {
      map.set(row.path, row);
    }
  }

  return [...map.values()];
}

function filterByContext(rows, context) {
  return rows.filter((row) => {
    if (context.schoolId && row.schoolId && row.schoolId !== context.schoolId) {
      return false;
    }

    if (
      context.academicYearId &&
      row.academicYearId &&
      row.academicYearId !== context.academicYearId
    ) {
      return false;
    }

    if (context.classId && row.classId && row.classId !== context.classId) {
      return false;
    }

    return true;
  });
}

function collectPersonIds(rows) {
  const fields = [
    "personId",
    "teacherPersonId",
    "staffPersonId",
    "actorPersonId",
    "assignedPersonId",
    "supervisorPersonId",
  ];

  const ids = new Set();

  for (const row of rows) {
    for (const field of fields) {
      const value = readString(row, field);

      if (value) {
        ids.add(value);
      }
    }
  }

  return [...ids];
}

function collectUids(rows) {
  const fields = [
    "uid",
    "teacherUid",
    "staffUid",
    "actorUid",
    "userUid",
    "assignedUid",
    "supervisorUid",
  ];

  const ids = new Set();

  for (const row of rows) {
    for (const field of fields) {
      const value = readString(row, field);

      if (value) {
        ids.add(value);
      }
    }
  }

  return [...ids];
}

async function resolvePeople(personIds) {
  const rows = [];

  for (const personId of personIds) {
    const person = await readDoc(`orgs/${ORG_ID}/people/${personId}`);

    rows.push({
      personId,
      person,
    });
  }

  return rows;
}

async function resolveMemberships({ personIds, uids }) {
  const rows = [];

  for (const personId of personIds) {
    const matches = await queryByField(
      `orgs/${ORG_ID}/memberships`,
      "personId",
      personId,
      20,
    );

    rows.push(...matches);
  }

  for (const uid of uids) {
    const matches = await queryByField(
      `orgs/${ORG_ID}/memberships`,
      "uid",
      uid,
      20,
    );

    rows.push(...matches);
  }

  return uniqueByPath(rows);
}

function buildCandidateTargets({ offerings, assignments, memberships, people }) {
  const personMap = new Map();
  const membershipByPersonId = new Map();
  const membershipByUid = new Map();

  for (const row of people) {
    if (row.personId) {
      personMap.set(row.personId, row.person);
    }
  }

  for (const membership of memberships) {
    const personId = readString(membership, "personId");
    const uid = readString(membership, "uid");

    if (personId) membershipByPersonId.set(personId, membership);
    if (uid) membershipByUid.set(uid, membership);
  }

  return assignments.map((assignment) => {
    const personId =
      readString(assignment, "teacherPersonId") ||
      readString(assignment, "personId") ||
      readString(assignment, "staffPersonId") ||
      readString(assignment, "actorPersonId") ||
      readString(assignment, "assignedPersonId");

    const uid =
      readString(assignment, "teacherUid") ||
      readString(assignment, "uid") ||
      readString(assignment, "staffUid") ||
      readString(assignment, "actorUid") ||
      readString(assignment, "userUid") ||
      readString(assignment, "assignedUid");

    const membership =
      membershipByPersonId.get(personId) ||
      membershipByUid.get(uid) ||
      null;

    const person = personMap.get(personId) || null;

    const subjectKey = readString(assignment, "subjectKey");
    const classSubjectOfferingId = readString(
      assignment,
      "classSubjectOfferingId",
    );

    const offering =
      offerings.find((item) => item.id === classSubjectOfferingId) ||
      offerings.find(
        (item) => subjectKey && readString(item, "subjectKey") === subjectKey,
      ) ||
      null;

    const displayName =
      readString(membership, "displayName") ||
      readString(membership, "title") ||
      readString(person, "displayName") ||
      readString(person, "name") ||
      readString(person, "nameAr") ||
      readString(assignment, "teacherName") ||
      readString(assignment, "displayName") ||
      "معلم";

    return {
      assignmentPath: assignment.path,
      assignmentId: assignment.id,

      subjectKey:
        subjectKey ||
        readString(offering, "subjectKey"),

      subjectTitle:
        readString(assignment, "subjectTitle") ||
        readString(assignment, "subjectName") ||
        readString(offering, "subjectTitle") ||
        readString(offering, "subjectName") ||
        readString(offering, "title"),

      classSubjectOfferingId:
        classSubjectOfferingId ||
        readString(offering, "id"),

      teacherUid:
        uid ||
        readString(membership, "uid"),

      teacherPersonId:
        personId ||
        readString(membership, "personId"),

      teacherDisplayName: displayName,

      roleKey:
        readString(membership, "roleKey") ||
        readString(membership, "role") ||
        readString(assignment, "roleKey") ||
        "teacher",
    };
  });
}

async function main() {
  const studentId = getArg("studentId", "student-1777289315910");
  const schoolIdArg = getArg("schoolId");
  const academicYearIdArg = getArg("academicYearId");

  printSection("Inspect Student Communication Targets - READ ONLY");

  console.log({
    orgId: ORG_ID,
    studentId,
    schoolIdArg,
    academicYearIdArg,
  });

  const student = await readDoc(`orgs/${ORG_ID}/students/${studentId}`);
  printData(`orgs/${ORG_ID}/students/${studentId}`, student);

  const allEnrollments = await queryByField(
    `orgs/${ORG_ID}/studentEnrollments`,
    "studentId",
    studentId,
    50,
  );

  const activeEnrollments = allEnrollments.filter(isActive);

  printData("active studentEnrollments", activeEnrollments);

  const selectedEnrollment =
    activeEnrollments.find((item) => {
      if (schoolIdArg && item.schoolId !== schoolIdArg) return false;
      if (academicYearIdArg && item.academicYearId !== academicYearIdArg) {
        return false;
      }
      return true;
    }) || activeEnrollments[0];

  if (!selectedEnrollment) {
    printSection("Result");
    console.log("لم أجد enrollment نشط لهذا الطالب.");
    return;
  }

  const schoolId = schoolIdArg || selectedEnrollment.schoolId;
  const academicYearId = academicYearIdArg || selectedEnrollment.academicYearId;
  const classId = selectedEnrollment.classId;
  const gradeId = selectedEnrollment.gradeId;

  const context = {
    schoolId,
    academicYearId,
    classId,
    gradeId,
  };

  printData("selected context", {
    studentId,
    ...context,
    enrollmentPath: selectedEnrollment.path,
  });

  const possibleClassDocs = [
    await readDoc(`orgs/${ORG_ID}/classes/${classId}`),
    await readDoc(`orgs/${ORG_ID}/schools/${schoolId}/classes/${classId}`),
  ].filter(Boolean);

  printData("possible class docs", possibleClassDocs);

  const offeringRows = uniqueByPath([
    ...(await queryByField(
      `orgs/${ORG_ID}/classSubjectOfferings`,
      "classId",
      classId,
      100,
    )),
    ...(await queryByField(
      `orgs/${ORG_ID}/classSubjectOfferings`,
      "schoolId",
      schoolId,
      100,
    )),
  ]);

  const offerings = filterByContext(offeringRows, context).filter(isActive);

  printData("classSubjectOfferings candidates", offerings);

  const assignmentRows = uniqueByPath([
    ...(await queryByField(
      `orgs/${ORG_ID}/teacherAssignments`,
      "classId",
      classId,
      100,
    )),
    ...(await queryByField(
      `orgs/${ORG_ID}/teacherAssignments`,
      "schoolId",
      schoolId,
      100,
    )),
    ...(await queryByField(
      `orgs/${ORG_ID}/teacherAssignments`,
      "academicYearId",
      academicYearId,
      100,
    )),
  ]);

  const assignments = filterByContext(assignmentRows, context).filter(isActive);

  printData("teacherAssignments candidates", assignments);

  const personIds = collectPersonIds(assignments);
  const uids = collectUids(assignments);

  printData("collected ids from assignments", {
    personIds,
    uids,
  });

  const people = await resolvePeople(personIds);
  const memberships = await resolveMemberships({ personIds, uids });

  printData("resolved people", people);
  printData("resolved memberships", memberships);

  const targets = buildCandidateTargets({
    offerings,
    assignments,
    memberships,
    people,
  }).filter((target) => {
    return target.teacherUid || target.teacherPersonId;
  });

  printSection("Candidate teacher communication targets");

  console.dir(targets, { depth: 12, colors: true });

  printSection("Done");
  console.log("تم الفحص بدون أي كتابة في Firestore ✅");
}

main().catch((error) => {
  console.error("Inspect failed:");
  console.error(error);
  process.exit(1);
});


