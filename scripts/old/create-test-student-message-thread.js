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

function nowMillis() {
  return Date.now();
}

function safeIdPart(value) {
  return String(value || "")
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, "_");
}

function readString(data, key, fallback = "") {
  const value = data?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

async function readDoc(docPath) {
  const snap = await db.doc(docPath).get();
  if (!snap.exists) return null;

  return {
    id: snap.id,
    ...snap.data(),
  };
}

async function findActiveGuardianLink({ orgId, studentId }) {
  const snap = await db
    .collection(`orgs/${orgId}/guardianLinks`)
    .where("studentId", "==", studentId)
    .limit(20)
    .get();

  for (const doc of snap.docs) {
    const data = doc.data();

    if (data.active === true && data.isArchived !== true && data.guardianUid) {
      return {
        id: doc.id,
        ...data,
      };
    }
  }

  return null;
}

async function findActiveEnrollment({ orgId, studentId, schoolId, academicYearId }) {
  const snap = await db
    .collection(`orgs/${orgId}/studentEnrollments`)
    .where("studentId", "==", studentId)
    .limit(20)
    .get();

  for (const doc of snap.docs) {
    const data = doc.data();

    if (
      data.status === "ACTIVE" &&
      data.schoolId === schoolId &&
      data.academicYearId === academicYearId
    ) {
      return {
        id: doc.id,
        ...data,
      };
    }
  }

  return null;
}

async function findStaffMembership({ orgId, staffUid }) {
  const snap = await db
    .collection(`orgs/${orgId}/memberships`)
    .where("uid", "==", staffUid)
    .limit(10)
    .get();

  for (const doc of snap.docs) {
    const data = doc.data();

    if (data.isActive !== false && data.active !== false) {
      return {
        id: doc.id,
        ...data,
      };
    }
  }

  return null;
}

async function main() {
  const staffUid = getArg("staffUid", "oyVunHzwNwdYV5HMyJKsUwaeCfW2");
  const studentId = getArg("studentId", "student-1777289315910");
  const schoolId = getArg("schoolId", "mrb-boys-sayh");
  const academicYearId = getArg("academicYearId", "ay-1448");

  console.log("Creating test student message thread...");
  console.log({
    orgId: ORG_ID,
    staffUid,
    studentId,
    schoolId,
    academicYearId,
  });

  const student = await readDoc(`orgs/${ORG_ID}/students/${studentId}`);

  if (!student) {
    throw new Error(`Student not found: ${studentId}`);
  }

  const guardianLink = await findActiveGuardianLink({
    orgId: ORG_ID,
    studentId,
  });

  if (!guardianLink) {
    throw new Error(`No active guardianLink found for student: ${studentId}`);
  }

  const staffMembership = await findStaffMembership({
    orgId: ORG_ID,
    staffUid,
  });

  if (!staffMembership) {
    throw new Error(`No active staff membership found for uid: ${staffUid}`);
  }

  const enrollment = await findActiveEnrollment({
    orgId: ORG_ID,
    studentId,
    schoolId,
    academicYearId,
  });

  if (!enrollment) {
    throw new Error(
      `No active enrollment found for student=${studentId}, school=${schoolId}, year=${academicYearId}`,
    );
  }

  const guardianUid = guardianLink.guardianUid;
  const guardianPersonId =
    guardianLink.guardianPersonId || guardianLink.guardianId || guardianUid;

  const staffPersonId = staffMembership.personId || staffUid;
  const staffRoleKey = staffMembership.roleKey || staffMembership.role || "STAFF";

  const guardianDisplayName =
    guardianLink.guardianDisplayName ||
    guardianLink.guardianName ||
    "ولي الأمر التجريبي";

  const staffDisplayName =
    staffMembership.displayName ||
    staffMembership.title ||
    "إيهاب";

  const threadId = [
    "test-student-context",
    safeIdPart(schoolId),
    safeIdPart(academicYearId),
    safeIdPart(studentId),
    safeIdPart(guardianUid),
    safeIdPart(staffUid),
  ].join("__");

  const threadRef = db.doc(`orgs/${ORG_ID}/threads/${threadId}`);
  const messagesRef = threadRef.collection("messages");

  const existingThread = await threadRef.get();

  if (existingThread.exists) {
    console.log("Thread already exists:");
    console.log(threadRef.path);
    console.log("threadId:", threadId);
    return;
  }

  const now = nowMillis();
  const messageId = `msg_${now}`;

  const messageBody =
    "رسالة تجريبية من ولي الأمر لاختبار نظام الرسائل داخل منصة الشؤون التعليمية.";

  await db.runTransaction(async (transaction) => {
    transaction.set(threadRef, {
      id: threadId,
      orgId: ORG_ID,

      type: "STUDENT_CONTEXT",
      status: "ACTIVE",

      isInternal: false,

      scopeType: "STUDENT",
      scopeId: studentId,

      schoolId,
      academicYearId,
      termId: "",
      gradeId: enrollment.gradeId || "",
      classId: enrollment.classId || "",

      subjectKey: "",
      classSubjectOfferingId: "",

      studentId,
      caseId: "",

      createdByUid: guardianUid,
      createdByPersonId: guardianPersonId,
      createdByRoleKey: "GUARDIAN",

      allowedRoleKeys: [staffRoleKey],

      participantPersonIds: [guardianPersonId, staffPersonId],
      participantUids: [guardianUid, staffUid],

      participants: [
        {
          uid: guardianUid,
          personId: guardianPersonId,
          kind: "GUARDIAN",
          roleKey: "GUARDIAN",
          displayName: guardianDisplayName,
          unreadCount: 0,
          muted: false,
        },
        {
          uid: staffUid,
          personId: staffPersonId,
          kind: "STAFF",
          roleKey: staffRoleKey,
          displayName: staffDisplayName,
          unreadCount: 1,
          muted: false,
        },
      ],

      lastMessageSummary: messageBody,
      lastMessageSenderUid: guardianUid,
      lastMessageSenderPersonId: guardianPersonId,
      lastMessageType: "TEXT",
      lastMessageAt: now,

      createdAt: now,
      updatedAt: now,

      seededBy: "scripts/create-test-student-message-thread.js",
    });

    transaction.set(messagesRef.doc(messageId), {
      id: messageId,
      orgId: ORG_ID,
      threadId,

      type: "TEXT",
      status: "SENT",

      senderUid: guardianUid,
      senderPersonId: guardianPersonId,
      senderRoleKey: "GUARDIAN",
      senderDisplayName: guardianDisplayName,

      body: messageBody,

      createdAt: now,
      updatedAt: now,

      seededBy: "scripts/create-test-student-message-thread.js",
    });
  });

  console.log("");
  console.log("Created test thread successfully ✅");
  console.log("threadPath:", threadRef.path);
  console.log("threadId:", threadId);
  console.log("");
  console.log("Open:");
  console.log("/staff/messages");
}

main().catch((error) => {
  console.error("Failed to create test thread:");
  console.error(error);
  process.exit(1);
});