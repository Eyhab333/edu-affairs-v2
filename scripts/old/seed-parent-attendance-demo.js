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
  if (!found) return fallback;
  return found.slice(prefix.length).trim();
}

function startOfDayMs(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function dateKeyFromMs(ms) {
  const d = new Date(ms);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function normalizeStudentId(value) {
  if (!value) return "student-demo-1";
  return value.trim();
}

async function getActiveEnrollment(studentId) {
  const snap = await db
    .collection(`orgs/${ORG_ID}/studentEnrollments`)
    .where("studentId", "==", studentId)
    .get();

  for (const doc of snap.docs) {
    const data = doc.data();
    if (data.status === "ACTIVE") {
      return {
        id: data.id || doc.id,
        ...data,
      };
    }
  }

  return null;
}

async function setDoc(path, data) {
  await db.doc(path).set(data, { merge: true });
  console.log(`✓ ${path}`);
}

async function main() {
  const studentId = normalizeStudentId(getArg("studentId", "student-demo-1"));
  const daysCount = Number(getArg("days", "10"));

  if (!Number.isFinite(daysCount) || daysCount <= 0) {
    console.error("قيمة --days يجب أن تكون رقمًا أكبر من صفر");
    process.exit(1);
  }

  const enrollment = await getActiveEnrollment(studentId);

  if (!enrollment) {
    console.error(`لم يتم العثور على قيد ACTIVE للطالب: ${studentId}`);
    process.exit(1);
  }

  const schoolId = getArg("schoolId", enrollment.schoolId || "kg-01");
  const academicYearId = getArg(
    "academicYearId",
    enrollment.academicYearId || "ay-1448"
  );
  const gradeId = getArg("gradeId", enrollment.gradeId || "");
  const classId = getArg("classId", enrollment.classId || "");
  const enrollmentId = enrollment.id || "";

  const recorderPersonId = getArg(
    "recordedByPersonId",
    "p-demo-attendance-recorder"
  );
  const recorderRoleKey = getArg("recorderRoleKey", "KG_VP");

  const now = Date.now();

  await setDoc(`orgs/${ORG_ID}/people/${recorderPersonId}`, {
    id: recorderPersonId,
    displayName: "مسجل حضور تجريبي",
    email: "",
    phone: "",
    nationalId: "",
    createdAt: now,
    updatedAt: now,
  });

  const today = new Date();
  const startDate = addDays(today, -(daysCount - 1));

  const statuses = [
    {
      status: "PRESENT",
      lateMinutes: 0,
      leftEarlyMinutes: 0,
      excuseReason: "",
      note: "حاضر",
    },
    {
      status: "PRESENT",
      lateMinutes: 0,
      leftEarlyMinutes: 0,
      excuseReason: "",
      note: "حاضر",
    },
    {
      status: "LATE",
      lateMinutes: 12,
      leftEarlyMinutes: 0,
      excuseReason: "",
      note: "تأخر بسيط",
    },
    {
      status: "PRESENT",
      lateMinutes: 0,
      leftEarlyMinutes: 0,
      excuseReason: "",
      note: "حاضر",
    },
    {
      status: "ABSENT",
      lateMinutes: 0,
      leftEarlyMinutes: 0,
      excuseReason: "",
      note: "غياب بدون عذر",
    },
    {
      status: "EXCUSED_ABSENT",
      lateMinutes: 0,
      leftEarlyMinutes: 0,
      excuseReason: "عذر من ولي الأمر",
      note: "غياب بعذر",
    },
    {
      status: "EXCUSED_LATE",
      lateMinutes: 8,
      leftEarlyMinutes: 0,
      excuseReason: "موعد طبي",
      note: "تأخر بعذر",
    },
    {
      status: "LEFT_EARLY",
      lateMinutes: 0,
      leftEarlyMinutes: 45,
      excuseReason: "استئذان",
      note: "انصراف مبكر",
    },
  ];

  for (let i = 0; i < daysCount; i += 1) {
    const day = addDays(startDate, i);
    const dayAt = startOfDayMs(day);
    const dateKey = dateKeyFromMs(dayAt);

    const schoolDayId = `school-day-${schoolId}-${academicYearId}-${dateKey}`;
    const recordId = `attendance-${studentId}-${dateKey}`;

    const statusData = statuses[i % statuses.length];

    await setDoc(`orgs/${ORG_ID}/schoolDays/${schoolDayId}`, {
      id: schoolDayId,
      orgId: ORG_ID,
      schoolId,
      academicYearId,
      dayAt,
      mode: "ON_SITE",
      status: "CLOSED",
      note: "يوم دراسي تجريبي",
      sourceRefId: "",
      createdAt: now,
      updatedAt: now,
    });

    await setDoc(`orgs/${ORG_ID}/studentAttendanceRecords/${recordId}`, {
      id: recordId,
      orgId: ORG_ID,
      schoolId,
      academicYearId,

      termId: "",
      termTitle: "",
      termShortTitle: "",

      schoolDayId,

      studentId,
      enrollmentId,
      gradeId,
      classId,

      status: statusData.status,
      source: "MANUAL",

      batchId: "",

      recordedByPersonId: recorderPersonId,
      recorderRoleKey,

      recordedAt: dayAt + 8 * 60 * 60 * 1000,

      lateMinutes: statusData.lateMinutes,
      leftEarlyMinutes: statusData.leftEarlyMinutes,

      excuseReason: statusData.excuseReason,
      note: statusData.note,

      createdAt: now,
      updatedAt: now,
    });
  }

  console.log("");
  console.log("تم إنشاء سجلات حضور تجريبية بنجاح ✅");
  console.log({
    orgId: ORG_ID,
    studentId,
    daysCount,
    schoolId,
    academicYearId,
    gradeId,
    classId,
    enrollmentId,
  });
}

main().catch((error) => {
  console.error("فشل seed الحضور التجريبي:");
  console.error(error);
  process.exit(1);
});