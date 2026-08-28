const fs = require("node:fs");
const path = require("node:path");
const ExcelJS = require("exceljs");
const {
  applicationDefault,
  cert,
  getApps,
  initializeApp,
} = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");

const WORKFLOW_ROOT = path.resolve(__dirname, "..");
const DEFAULT_INPUT_FILE = path.join(
  WORKFLOW_ROOT,
  "inputs",
  "student-provisioning.xlsx",
);
const EXPECTED_HEADERS = [
  "displayName",
  "nationalId",
  "schoolId",
  "academicYearId",
  "classId",
  "enrollmentStatus",
];
const ENROLLMENT_STATUSES = new Set([
  "ACTIVE",
  "COMPLETED",
  "REPEATING",
  "TRANSFERRED",
  "WITHDRAWN",
  "SUSPENDED",
  "PENDING",
]);
const APPLY_TOKEN = "APPLY_STUDENT_PROVISIONING";

function parseArgs() {
  const args = {};
  for (const arg of process.argv.slice(2)) {
    if (!arg.startsWith("--")) continue;
    const [key, ...valueParts] = arg.slice(2).split("=");
    args[key] = valueParts.join("=");
  }
  return args;
}

function readCellText(cell) {
  const value = cell.value;
  if (value == null) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value).trim();
  if (typeof value === "object") {
    if (typeof value.text === "string") return value.text.trim();
    if (value.result != null) return String(value.result).trim();
    if (Array.isArray(value.richText)) return value.richText.map((item) => item.text || "").join("").trim();
  }
  return String(value).trim();
}

function readString(data, key) {
  const value = data?.[key];
  return typeof value === "string" ? value.trim() : "";
}

function normalizeRow(row) {
  return {
    ...row,
    errors: Array.isArray(row?.errors) ? row.errors : [],
  };
}

function getConfig(args = parseArgs()) {
  return {
    args,
    orgId: (args.orgId || process.env.ORG_ID || "takween").trim(),
    inputFile: args.input
      ? path.resolve(process.cwd(), args.input)
      : DEFAULT_INPUT_FILE,
    sheetName: (args.sheet || "").trim(),
  };
}

async function initializeFirebase(args) {
  if (getApps().length > 0) return;
  const serviceAccountPath =
    args.serviceAccount ||
    process.env.GOOGLE_APPLICATION_CREDENTIALS ||
    path.resolve(process.cwd(), "service-account.json");

  if (fs.existsSync(serviceAccountPath)) {
    // eslint-disable-next-line global-require, import/no-dynamic-require
    initializeApp({ credential: cert(require(path.resolve(serviceAccountPath))) });
    return;
  }
  initializeApp({ credential: applicationDefault() });
}

async function readExcelRows(config) {
  if (!fs.existsSync(config.inputFile)) {
    throw new Error(`Excel file not found: ${config.inputFile}`);
  }

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(config.inputFile);
  const worksheet = config.sheetName
    ? workbook.getWorksheet(config.sheetName)
    : workbook.worksheets[0];
  if (!worksheet) {
    throw new Error(config.sheetName ? `Worksheet not found: ${config.sheetName}` : "The workbook has no worksheet.");
  }

  const headerErrors = [];
  for (let index = 0; index < EXPECTED_HEADERS.length; index += 1) {
    const actual = readCellText(worksheet.getRow(1).getCell(index + 1));
    const expected = EXPECTED_HEADERS[index];
    if (actual !== expected) {
      headerErrors.push(`Column ${index + 1}: expected "${expected}", found "${actual}".`);
    }
  }
  for (let index = EXPECTED_HEADERS.length + 1; index <= worksheet.columnCount; index += 1) {
    const extraHeader = readCellText(worksheet.getRow(1).getCell(index));
    if (extraHeader) headerErrors.push(`Unexpected column ${index}: "${extraHeader}".`);
  }
  if (headerErrors.length > 0) return { worksheetName: worksheet.name, rows: [], headerErrors };

  const rows = [];
  const nationalIdRows = new Map();
  for (let rowNumber = 2; rowNumber <= worksheet.rowCount; rowNumber += 1) {
    const row = worksheet.getRow(rowNumber);
    const values = EXPECTED_HEADERS.map((_, index) => readCellText(row.getCell(index + 1)));
    if (values.every((value) => !value)) continue;
    const [displayName, nationalId, schoolId, academicYearId, classId, rawStatus] = values;
    const enrollmentStatus = (rawStatus || "ACTIVE").toUpperCase();
    const errors = [];
    if (!displayName) errors.push("displayName is required.");
    if (!nationalId) errors.push("nationalId is required for safe matching.");
    if (!schoolId) errors.push("schoolId is required.");
    if (!academicYearId) errors.push("academicYearId is required.");
    if (!classId) errors.push("classId is required.");
    if (!ENROLLMENT_STATUSES.has(enrollmentStatus)) errors.push(`enrollmentStatus "${rawStatus}" is not valid.`);
    const importRow = normalizeRow({ rowNumber, displayName, nationalId, schoolId, academicYearId, classId, enrollmentStatus, errors });
    rows.push(importRow);
    if (nationalId) {
      const matches = nationalIdRows.get(nationalId) || [];
      matches.push(importRow);
      nationalIdRows.set(nationalId, matches);
    }
  }
  for (const [nationalId, matches] of nationalIdRows) {
    if (matches.length <= 1) continue;
    matches.forEach((row) => row.errors.push(`nationalId "${nationalId}" is duplicated in rows ${matches.map((item) => item.rowNumber).join(", ")}.`));
  }
  return { worksheetName: worksheet.name, rows, headerErrors: [] };
}

function record(snapshot) {
  return { id: snapshot.id, path: snapshot.ref.path, data: snapshot.data() || {} };
}

function enrollmentIdFor(row, studentId) {
  return `${row.academicYearId}_${row.classId}_${studentId}`;
}

function baseResult(row) {
  return {
    rowNumber: row.rowNumber,
    displayName: row.displayName,
    nationalId: row.nationalId,
    schoolId: row.schoolId,
    academicYearId: row.academicYearId,
    classId: row.classId,
    enrollmentStatus: row.enrollmentStatus,
    action: "BLOCKED",
    personId: "",
    studentId: "",
    enrollmentId: "",
    person: "NONE",
    student: "NONE",
    enrollment: "NONE",
    conflicts: [...(Array.isArray(row?.errors) ? row.errors : [])],
    notes: [],
    internal: {},
  };
}

function validateSchoolData(data, orgId, schoolId, result) {
  if (readString(data, "orgId") && readString(data, "orgId") !== orgId) result.conflicts.push("School orgId does not match the selected org.");
  if (readString(data, "id") && readString(data, "id") !== schoolId) result.conflicts.push("School document id field does not match schoolId.");
  if (data.isArchived === true) result.conflicts.push("School is archived.");
}

function validateYearData(data, orgId, schoolId, academicYearId, result) {
  if (readString(data, "orgId") && readString(data, "orgId") !== orgId) result.conflicts.push("Academic year orgId does not match the selected org.");
  if (readString(data, "schoolId") && readString(data, "schoolId") !== schoolId) result.conflicts.push("Academic year schoolId does not match schoolId.");
  if (readString(data, "id") && readString(data, "id") !== academicYearId) result.conflicts.push("Academic year document id field does not match academicYearId.");
  if (data.isActive === false) result.conflicts.push("Academic year is inactive.");
}

function validateClassData(data, orgId, row, result) {
  if (readString(data, "orgId") && readString(data, "orgId") !== orgId) result.conflicts.push("Class orgId does not match the selected org.");
  if (readString(data, "schoolId") && readString(data, "schoolId") !== row.schoolId) result.conflicts.push("Class schoolId does not match schoolId.");
  if (readString(data, "academicYearId") && readString(data, "academicYearId") !== row.academicYearId) result.conflicts.push("Class academicYearId does not match academicYearId.");
  if (readString(data, "id") && readString(data, "id") !== row.classId) result.conflicts.push("Class document id field does not match classId.");
  if (data.isArchived === true || data.isActive === false || (readString(data, "status") && readString(data, "status") !== "ACTIVE")) result.conflicts.push("Class is not active.");
}

function personNeedsUpdate(person, row) {
  return readString(person.data, "displayName") !== row.displayName;
}

function enrollmentNeedsUpdate(enrollment, row, classData) {
  const expected = {
    schoolId: row.schoolId,
    academicYearId: row.academicYearId,
    classId: row.classId,
    streamId: readString(classData, "streamId"),
    status: row.enrollmentStatus,
  };
  const gradeId = readString(classData, "gradeId");
  if (gradeId) expected.gradeId = gradeId;
  return Object.entries(expected).some(([key, value]) => readString(enrollment.data, key) !== value);
}

function applyResolvedSummary(result, { person, student, targetEnrollment, personUpdate, enrollmentUpdate, createPerson, createStudent, createEnrollment, transferFrom }) {
  result.personId = person?.id || "<new-person-id>";
  result.studentId = student?.id || "<new-student-id>";
  result.enrollmentId = targetEnrollment?.id || enrollmentIdFor(result, result.studentId);
  result.person = createPerson ? "CREATE" : personUpdate ? "UPDATE" : "KEEP_EXISTING";
  result.student = createStudent ? "CREATE" : "KEEP_EXISTING";
  result.enrollment = createEnrollment ? "CREATE" : transferFrom ? "TRANSFER" : enrollmentUpdate ? "UPDATE" : "KEEP_EXISTING";
  if (transferFrom) result.action = "TRANSFER";
  else if (createPerson || createStudent || createEnrollment) result.action = "CREATE";
  else if (personUpdate || enrollmentUpdate) result.action = "UPDATE";
  else result.action = "KEEP_EXISTING";
  result.internal = { person, student, targetEnrollment, personUpdate, enrollmentUpdate, createPerson, createStudent, createEnrollment, transferFrom };
}

async function resolveStudentRow({ db, orgId, row }) {
  const result = baseResult(row);
  if (result.conflicts.length > 0) return result;
  const schoolPath = `orgs/${orgId}/schools/${row.schoolId}`;
  const yearPath = `${schoolPath}/academicYears/${row.academicYearId}`;
  const classPath = `${yearPath}/classes/${row.classId}`;
  const [schoolSnapshot, yearSnapshot, classSnapshot, peopleSnapshot] = await Promise.all([
    db.doc(schoolPath).get(),
    db.doc(yearPath).get(),
    db.doc(classPath).get(),
    db.collection(`orgs/${orgId}/people`).where("nationalId", "==", row.nationalId).limit(3).get(),
  ]);
  if (!schoolSnapshot.exists) result.conflicts.push(`School does not exist: ${schoolPath}.`);
  if (!yearSnapshot.exists) result.conflicts.push(`Academic year does not exist: ${yearPath}.`);
  if (!classSnapshot.exists) result.conflicts.push(`Class does not exist: ${classPath}.`);
  if (schoolSnapshot.exists) validateSchoolData(schoolSnapshot.data() || {}, orgId, row.schoolId, result);
  if (yearSnapshot.exists) validateYearData(yearSnapshot.data() || {}, orgId, row.schoolId, row.academicYearId, result);
  if (classSnapshot.exists) validateClassData(classSnapshot.data() || {}, orgId, row, result);

  const people = peopleSnapshot.docs.map(record);
  if (people.length > 1) result.conflicts.push(`Multiple People match nationalId (${people.length}).`);
  if (result.conflicts.length > 0) return result;

  const person = people[0] || null;
  if (!person) {
    applyResolvedSummary(result, { person: null, student: null, targetEnrollment: null, personUpdate: false, enrollmentUpdate: false, createPerson: true, createStudent: true, createEnrollment: true, transferFrom: null });
    result.notes.push("New Person, Student, and StudentEnrollment will be created; no Firebase Auth or users document is used.");
    return result;
  }

  const studentsSnapshot = await db.collection(`orgs/${orgId}/students`).where("personId", "==", person.id).limit(3).get();
  const students = studentsSnapshot.docs.map(record);
  if (students.length > 1) {
    result.conflicts.push(`Multiple Students reference Person ${person.id}.`);
    return result;
  }
  const student = students[0] || null;
  if (!student) {
    applyResolvedSummary(result, { person, student: null, targetEnrollment: null, personUpdate: personNeedsUpdate(person, row), enrollmentUpdate: false, createPerson: false, createStudent: true, createEnrollment: true, transferFrom: null });
    result.notes.push("Existing Person has no Student; a Student and StudentEnrollment will be created.");
    return result;
  }
  if (student.data.isArchived === true) {
    result.conflicts.push(`Student ${student.id} is archived; unarchiving is not automatic.`);
    return result;
  }

  const enrollmentsSnapshot = await db.collection(`orgs/${orgId}/studentEnrollments`).where("studentId", "==", student.id).get();
  const enrollments = enrollmentsSnapshot.docs.map(record);
  const sameYear = enrollments.filter((item) => readString(item.data, "academicYearId") === row.academicYearId);
  const activeEnrollments = sameYear.filter((item) => readString(item.data, "status") === "ACTIVE");
  if (activeEnrollments.length > 1) {
    result.conflicts.push(`Student ${student.id} has multiple ACTIVE enrollments in academic year ${row.academicYearId}.`);
    return result;
  }
  const targetId = enrollmentIdFor(row, student.id);
  const targetEnrollment = sameYear.find((item) => item.id === targetId) || null;
  const activeEnrollment = activeEnrollments[0] || null;
  const classData = classSnapshot.data() || {};
  const personUpdate = personNeedsUpdate(person, row);

  if (activeEnrollment && (readString(activeEnrollment.data, "schoolId") !== row.schoolId || readString(activeEnrollment.data, "classId") !== row.classId)) {
    if (row.enrollmentStatus !== "ACTIVE") {
      result.conflicts.push("A class or school transfer requires enrollmentStatus ACTIVE for the new enrollment.");
      return result;
    }
    if (targetEnrollment) {
      result.conflicts.push(`Target enrollment ${targetEnrollment.id} already exists; a transfer will not overwrite historical enrollment data.`);
      return result;
    }
    applyResolvedSummary(result, { person, student, targetEnrollment: null, personUpdate, enrollmentUpdate: false, createPerson: false, createStudent: false, createEnrollment: true, transferFrom: activeEnrollment });
    result.enrollmentId = targetId;
    result.notes.push(`ACTIVE enrollment ${activeEnrollment.id} will become TRANSFERRED; its startAt and class history are preserved.`);
    return result;
  }

  if (!targetEnrollment) {
    if (activeEnrollment && row.enrollmentStatus === "ACTIVE") {
      result.conflicts.push("Existing ACTIVE enrollment does not resolve to the requested class.");
      return result;
    }
    applyResolvedSummary(result, { person, student, targetEnrollment: null, personUpdate, enrollmentUpdate: false, createPerson: false, createStudent: false, createEnrollment: true, transferFrom: null });
    result.enrollmentId = targetId;
    return result;
  }

  const enrollmentUpdate = enrollmentNeedsUpdate(targetEnrollment, row, classData);
  if (row.enrollmentStatus === "ACTIVE" && activeEnrollment && activeEnrollment.id !== targetEnrollment.id) {
    result.conflicts.push("Another ACTIVE enrollment exists in the same academic year.");
    return result;
  }
  applyResolvedSummary(result, { person, student, targetEnrollment, personUpdate, enrollmentUpdate, createPerson: false, createStudent: false, createEnrollment: false, transferFrom: null });
  result.notes.push("Existing enrollment startAt is preserved on updates.");
  return result;
}

async function resolveRows({ config, rows }) {
  await initializeFirebase(config.args);
  const db = getFirestore();
  const results = [];
  for (const row of rows) results.push(await resolveStudentRow({ db, orgId: config.orgId, row: normalizeRow(row) }));
  return { db, results };
}

function personPayload(personId, row, now) {
  return { id: personId, displayName: row.displayName, nationalId: row.nationalId, phone: "", email: "", createdAt: now, updatedAt: now };
}

function studentPayload(studentId, personId, orgId, now) {
  return { id: studentId, personId, orgId, isArchived: false, createdAt: now, updatedAt: now };
}

function enrollmentPayload(enrollmentId, studentId, orgId, row, classData, now) {
  const payload = {
    id: enrollmentId,
    orgId,
    schoolId: row.schoolId,
    academicYearId: row.academicYearId,
    studentId,
    streamId: readString(classData, "streamId"),
    classId: row.classId,
    status: row.enrollmentStatus,
    startAt: now,
    createdAt: now,
    updatedAt: now,
  };
  const gradeId = readString(classData, "gradeId");
  if (gradeId) payload.gradeId = gradeId;
  return payload;
}

function updatedEnrollmentFields(existing, row, classData, now) {
  const expected = enrollmentPayload(existing.id, readString(existing.data, "studentId"), readString(existing.data, "orgId"), row, classData, now);
  const changes = { updatedAt: now };
  ["schoolId", "academicYearId", "studentId", "gradeId", "streamId", "classId", "status"].forEach((key) => {
    if (key === "gradeId" && !Object.prototype.hasOwnProperty.call(expected, key)) return;
    if (readString(existing.data, key) !== readString(expected, key)) changes[key] = expected[key];
  });
  return changes;
}

async function nextGeneratedIds(db, orgId) {
  let suffix = Date.now();
  while (true) {
    const personId = `person-${suffix}`;
    const studentId = `student-${suffix}`;
    const [personSnapshot, studentSnapshot] = await Promise.all([
      db.doc(`orgs/${orgId}/people/${personId}`).get(),
      db.doc(`orgs/${orgId}/students/${studentId}`).get(),
    ]);
    if (!personSnapshot.exists && !studentSnapshot.exists) return { personId, studentId };
    suffix += 1;
  }
}

async function applyStudentResult({ db, orgId, result }) {
  if (result.action === "BLOCKED") return { rowNumber: result.rowNumber, action: "BLOCKED", detail: result.conflicts.join(" | ") };
  if (result.action === "KEEP_EXISTING") return { rowNumber: result.rowNumber, action: "KEEP_EXISTING", detail: "No writes required." };

  const row = normalizeRow(result);
  const now = Date.now();
  const generated = result.internal.createStudent ? await nextGeneratedIds(db, orgId) : null;
  const personId = result.internal.createPerson ? generated.personId : result.personId;
  const studentId = result.internal.createStudent ? generated.studentId : result.studentId;
  const enrollmentId = enrollmentIdFor(row, studentId);
  const schoolRef = db.doc(`orgs/${orgId}/schools/${row.schoolId}`);
  const yearRef = db.doc(`${schoolRef.path}/academicYears/${row.academicYearId}`);
  const classRef = db.doc(`orgs/${orgId}/schools/${row.schoolId}/academicYears/${row.academicYearId}/classes/${row.classId}`);
  const personRef = db.doc(`orgs/${orgId}/people/${personId}`);
  const studentRef = db.doc(`orgs/${orgId}/students/${studentId}`);
  const targetEnrollmentRef = db.doc(`orgs/${orgId}/studentEnrollments/${enrollmentId}`);
  const studentEnrollmentsQuery = db.collection(`orgs/${orgId}/studentEnrollments`).where("studentId", "==", studentId);
  const oldEnrollmentRef = result.internal.transferFrom
    ? db.doc(result.internal.transferFrom.path)
    : null;

  await db.runTransaction(async (transaction) => {
    const reads = [
      transaction.get(schoolRef),
      transaction.get(yearRef),
      transaction.get(classRef),
      transaction.get(personRef),
      transaction.get(studentRef),
      transaction.get(targetEnrollmentRef),
      transaction.get(studentEnrollmentsQuery),
    ];
    if (oldEnrollmentRef) reads.push(transaction.get(oldEnrollmentRef));
    const snapshots = await Promise.all(reads);
    const [schoolSnapshot, yearSnapshot, classSnapshot, personSnapshot, studentSnapshot, targetEnrollmentSnapshot, studentEnrollmentsSnapshot, oldEnrollmentSnapshot] = snapshots;
    if (!schoolSnapshot.exists || !yearSnapshot.exists) throw new Error("School or academic year changed after preview; rerun preview.");
    if (!classSnapshot.exists) throw new Error(`Class no longer exists: ${classRef.path}`);
    const check = baseResult(row);
    validateSchoolData(schoolSnapshot.data() || {}, orgId, row.schoolId, check);
    validateYearData(yearSnapshot.data() || {}, orgId, row.schoolId, row.academicYearId, check);
    validateClassData(classSnapshot.data() || {}, orgId, row, check);
    if (check.conflicts.length > 0) throw new Error(check.conflicts.join(" | "));
    if (result.internal.createPerson ? personSnapshot.exists : !personSnapshot.exists) throw new Error("Person changed after preview; rerun preview.");
    if (result.internal.createStudent ? studentSnapshot.exists : !studentSnapshot.exists) throw new Error("Student changed after preview; rerun preview.");
    if (result.internal.createEnrollment ? targetEnrollmentSnapshot.exists : !targetEnrollmentSnapshot.exists) throw new Error("Target enrollment changed after preview; rerun preview.");
    if (oldEnrollmentRef && (!oldEnrollmentSnapshot.exists || readString(oldEnrollmentSnapshot.data(), "status") !== "ACTIVE")) throw new Error("Previous ACTIVE enrollment changed after preview; rerun preview.");
    const activeEnrollmentIds = studentEnrollmentsSnapshot.docs
      .filter((snapshot) => readString(snapshot.data(), "academicYearId") === row.academicYearId && readString(snapshot.data(), "status") === "ACTIVE")
      .map((snapshot) => snapshot.id);
    if (result.internal.transferFrom) {
      if (activeEnrollmentIds.length !== 1 || activeEnrollmentIds[0] !== result.internal.transferFrom.id) {
        throw new Error("ACTIVE enrollment set changed after preview; rerun preview.");
      }
    } else if (result.internal.createEnrollment && row.enrollmentStatus === "ACTIVE" && activeEnrollmentIds.length > 0) {
      throw new Error("An ACTIVE enrollment now exists in the same academic year; rerun preview.");
    } else if (!result.internal.createEnrollment && row.enrollmentStatus === "ACTIVE" && activeEnrollmentIds.some((id) => id !== enrollmentId)) {
      throw new Error("Another ACTIVE enrollment now exists in the same academic year; rerun preview.");
    }

    if (result.internal.createPerson) transaction.create(personRef, personPayload(personId, row, now));
    else if (result.internal.personUpdate) transaction.update(personRef, { displayName: row.displayName, updatedAt: now });
    if (result.internal.createStudent) transaction.create(studentRef, studentPayload(studentId, personId, orgId, now));
    if (result.internal.transferFrom) transaction.update(oldEnrollmentRef, { status: "TRANSFERRED", endAt: now, updatedAt: now });
    if (result.internal.createEnrollment) transaction.create(targetEnrollmentRef, enrollmentPayload(enrollmentId, studentId, orgId, row, classSnapshot.data() || {}, now));
    else if (result.internal.enrollmentUpdate) transaction.update(targetEnrollmentRef, updatedEnrollmentFields(result.internal.targetEnrollment, row, classSnapshot.data() || {}, now));
  });

  return { rowNumber: result.rowNumber, action: result.action, personId, studentId, enrollmentId };
}

function printResults(title, results) {
  console.log(title);
  console.table(results.map((result) => ({
    row: result.rowNumber,
    action: result.action,
    person: result.person,
    student: result.student,
    enrollment: result.enrollment,
    personId: result.personId,
    studentId: result.studentId,
    enrollmentId: result.enrollmentId,
    conflicts: result.conflicts?.join(" | ") || "",
  })));
}

module.exports = {
  APPLY_TOKEN,
  EXPECTED_HEADERS,
  applyStudentResult,
  getConfig,
  printResults,
  readExcelRows,
  resolveRows,
};
