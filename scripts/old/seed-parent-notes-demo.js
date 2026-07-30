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

function nowMs() {
  return Date.now();
}

function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function atHourMs(date, hour) {
  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    hour,
    0,
    0,
    0
  ).getTime();
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

async function setDoc(docPath, data) {
  await db.doc(docPath).set(data, { merge: true });
  console.log(`✓ ${docPath}`);
}

async function main() {
  const studentId = normalizeStudentId(getArg("studentId", "student-demo-1"));

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
  const streamId = getArg("streamId", enrollment.streamId || "");
  const enrollmentId = enrollment.id || "";

  const createdByPersonId = getArg("createdByPersonId", "p-demo-note-author");
  const createdByRoleKey = getArg("createdByRoleKey", "KG_TEACHER");

  const timestamp = nowMs();

  await setDoc(`orgs/${ORG_ID}/people/${createdByPersonId}`, {
    id: createdByPersonId,
    displayName: "معلمة تجريبية للملاحظات",
    email: "",
    phone: "",
    nationalId: "",
    createdAt: timestamp,
    updatedAt: timestamp,
  });

  const today = new Date();

  const notes = [
    {
      key: "positive-participation",
      daysAgo: 0,
      noteType: "POSITIVE",
      title: "مشاركة إيجابية",
      body: "شارك الطالب اليوم بشكل جميل في النشاط الصفي، وكان متعاونًا مع زملائه.",
      severity: "LOW",
      visibility: "PARENT_VISIBLE",
      status: "ACTIVE",
      followUpStatus: "NONE",
      tags: ["parent-visible", "positive"],
    },
    {
      key: "learning-reminder",
      daysAgo: 1,
      noteType: "ACADEMIC",
      title: "تنبيه تعليمي بسيط",
      body: "يحتاج الطالب إلى مراجعة قصيرة للحروف التي تمت دراستها هذا الأسبوع.",
      severity: "NORMAL",
      visibility: "PARENT_VISIBLE",
      status: "ACTIVE",
      followUpStatus: "NONE",
      tags: ["parent-visible", "academic"],
    },
    {
      key: "excellent-behavior",
      daysAgo: 2,
      noteType: "BEHAVIOR_POSITIVE",
      title: "سلوك مميز",
      body: "أظهر الطالب التزامًا جميلًا بالتعليمات داخل الصف.",
      severity: "LOW",
      visibility: "PARENT_VISIBLE",
      status: "ACTIVE",
      followUpStatus: "NONE",
      tags: ["parent-visible", "behavior"],
    },

    // ملاحظة داخلية لا يجب أن تظهر في تطبيق ولي الأمر لاحقًا
    {
      key: "internal-follow-up",
      daysAgo: 3,
      noteType: "INTERNAL",
      title: "ملاحظة داخلية للتجربة",
      body: "هذه ملاحظة داخلية لا ينبغي أن تظهر لولي الأمر.",
      severity: "HIGH",
      visibility: "STAFF_INTERNAL",
      status: "NEEDS_FOLLOW_UP",
      followUpStatus: "NEEDED",
      tags: ["internal"],
    },
  ];

  for (const note of notes) {
    const noteAt = atHourMs(addDays(today, -note.daysAgo), 10);
    const noteDateKey = dateKeyFromMs(noteAt);
    const noteId = `note-${studentId}-${note.key}`;

    const data = {
      id: noteId,
      orgId: ORG_ID,

      schoolId,
      academicYearId,

      termId: "",
      termTitle: "",
      termShortTitle: "",

      studentId,
      enrollmentId,
      gradeId,
      streamId,
      classId,

      noteType: note.noteType,
      title: note.title,
      body: note.body,
      severity: note.severity,
      visibility: note.visibility,
      status: note.status,

      createdByPersonId,
      createdByRoleKey,

      sourceType: "MANUAL",
      sourceId: "",

      followUpStatus: note.followUpStatus,
      followUpAt:
        note.followUpStatus === "NEEDED"
          ? atHourMs(addDays(today, 2), 10)
          : undefined,

      noteAt,
      noteDateKey,

      visibleToGuardian: note.visibility === "PARENT_VISIBLE",
      guardianVisibility:
        note.visibility === "PARENT_VISIBLE" ? "VISIBLE" : "HIDDEN",

      linkedCaseId: "",
      linkedAttendanceBatchId: "",
      linkedAttendanceRecordId: "",
      linkedTransportAttendanceRecordId: "",
      linkedAssessmentRecordId: "",
      linkedMeasurementBatchId: "",
      linkedTrackerEntryId: "",
      linkedLearningLossPlanId: "",

      tags: note.tags,

      createdAt: noteAt,
      updatedAt: timestamp,
    };

    Object.keys(data).forEach((key) => {
      if (data[key] === undefined) {
        delete data[key];
      }
    });

    await setDoc(`orgs/${ORG_ID}/studentNotes/${noteId}`, data);
  }

  console.log("");
  console.log("تم إنشاء ملاحظات تجريبية بنجاح ✅");
  console.log({
    orgId: ORG_ID,
    studentId,
    schoolId,
    academicYearId,
    gradeId,
    classId,
    visibleNotes: notes.filter((note) => note.visibility === "PARENT_VISIBLE")
      .length,
    internalNotes: notes.filter((note) => note.visibility !== "PARENT_VISIBLE")
      .length,
  });
}

main().catch((error) => {
  console.error("فشل seed الملاحظات التجريبية:");
  console.error(error);
  process.exit(1);
});