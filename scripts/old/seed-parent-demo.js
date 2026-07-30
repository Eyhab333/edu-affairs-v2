/* eslint-disable no-console */

const admin = require("firebase-admin");
const path = require("path");

const serviceAccount = require(path.join(__dirname, "./service-account.json"));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const PROJECT_ID = process.env.FIREBASE_PROJECT_ID || "edu-affairs-dev";
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

function required(value, message) {
  if (!value) {
    console.error(message);
    process.exit(1);
  }

  return value;
}

async function getOrCreateAuthUser({ uid, email, password, displayName }) {
  const auth = admin.auth();

  if (uid) {
    try {
      const user = await auth.getUser(uid);
      return user;
    } catch (error) {
      if (error?.code !== "auth/user-not-found") {
        throw error;
      }

      if (!email || !password) {
        console.error(
          "لم يتم العثور على المستخدم بالـ uid. لإنشائه تلقائيًا أرسل --email و --password."
        );
        process.exit(1);
      }

      return auth.createUser({
        uid,
        email,
        password,
        displayName,
        emailVerified: true,
        disabled: false,
      });
    }
  }

  try {
    return await auth.getUserByEmail(email);
  } catch (error) {
    if (error?.code !== "auth/user-not-found") {
      throw error;
    }

    if (!password) {
      console.error(
        "لم يتم العثور على المستخدم. لإنشائه تلقائيًا أرسل --password."
      );
      process.exit(1);
    }

    return auth.createUser({
      email,
      password,
      displayName,
      emailVerified: true,
      disabled: false,
    });
  }
}

async function setDoc(path, data) {
  const db = admin.firestore();
  await db.doc(path).set(data, { merge: true });
  console.log(`✓ ${path}`);
}

async function main() {
  const email = required(
    getArg("email"),
    "استخدم البريد هكذا: --email=parent@test.com"
  );

  const uid = getArg("uid");
  const password = getArg("password");
  const parentName = getArg("parentName", "ولي أمر تجريبي");
  const studentName = getArg("studentName", "طالب تجريبي");
  const studentCode = getArg("studentCode", "demo-1");

  const schoolId = getArg("schoolId", "kg-01");
  const academicYearId = getArg("academicYearId", "ay-1448");
  const gradeId = getArg("gradeId", "kg1");
  const classId = getArg("classId", "kg1-a");
  const streamId = getArg("streamId", "");

  

  const authUser = await getOrCreateAuthUser({
    uid,
    email,
    password,
    displayName: parentName,
  });

  const timestamp = nowMs();

  const safeStudentCode = studentCode
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  const parentPersonId = `p-parent-${authUser.uid}`;
  const guardianId = `g-parent-${authUser.uid}`;
  const studentPersonId = `p-student-${safeStudentCode}`;
  const studentId = `student-${safeStudentCode}`;
  const guardianLinkId = `gl-${guardianId}-${studentId}`;
  const enrollmentId = `enr-${studentId}-${academicYearId}`;
  const membershipId = ORG_ID;

  await setDoc(`users/${authUser.uid}`, {
    uid: authUser.uid,
    displayName: parentName,
    email,
    phone: "",
    photoUrl: "",
    personId: parentPersonId,
    isDisabled: false,
    createdAt: timestamp,
    updatedAt: timestamp,
  });

  await setDoc(`users/${authUser.uid}/orgMemberships/${membershipId}`, {
    id: membershipId,
    uid: authUser.uid,
    personId: parentPersonId,
    orgId: ORG_ID,
    role: "GUARDIAN",
    roleKey: "GUARDIAN",
    title: "ولي أمر",
    department: "",
    scopes: {
      schoolIds: [schoolId],
      gradeIds: [gradeId],
      classIds: [classId],
      subjectKeys: [],
      routeIds: [],
      canAccessAllSchools: false,
    },
    permissions: {},
    scopeType: "SCHOOL",
    scopeId: schoolId,
    isActive: true,
    createdAt: timestamp,
    updatedAt: timestamp,
  });

  await setDoc(`orgs/${ORG_ID}/people/${parentPersonId}`, {
    id: parentPersonId,
    displayName: parentName,
    nationalId: "",
    phone: "",
    email,
    createdAt: timestamp,
    updatedAt: timestamp,
  });

  await setDoc(`orgs/${ORG_ID}/guardians/${guardianId}`, {
    id: guardianId,
    orgId: ORG_ID,
    personId: parentPersonId,
    isArchived: false,
    createdAt: timestamp,
    updatedAt: timestamp,
  });

  await setDoc(`orgs/${ORG_ID}/people/${studentPersonId}`, {
    id: studentPersonId,
    displayName: studentName,
    nationalId: "",
    phone: "",
    email: "",
    createdAt: timestamp,
    updatedAt: timestamp,
  });

  await setDoc(`orgs/${ORG_ID}/students/${studentId}`, {
    id: studentId,
    personId: studentPersonId,
    orgId: ORG_ID,
    isArchived: false,
    createdAt: timestamp,
    updatedAt: timestamp,
  });

  await setDoc(`orgs/${ORG_ID}/guardianLinks/${guardianLinkId}`, {
    id: guardianLinkId,
    orgId: ORG_ID,
    studentId,
    guardianId,
    relationType: "FATHER",
    active: true,
    startAt: timestamp,
    createdAt: timestamp,
    updatedAt: timestamp,
  });

  await setDoc(`orgs/${ORG_ID}/studentEnrollments/${enrollmentId}`, {
    id: enrollmentId,
    orgId: ORG_ID,
    schoolId,
    academicYearId,
    studentId,
    gradeId,
    streamId,
    classId,
    status: "ACTIVE",
    startAt: timestamp,
    createdAt: timestamp,
    updatedAt: timestamp,
  });

  console.log("");
  console.log("تم إنشاء بيانات ولي الأمر التجريبية بنجاح ✅");
  console.log({
    projectId: PROJECT_ID,
    orgId: ORG_ID,
    uid: authUser.uid,
    email,
    parentPersonId,
    guardianId,
    studentId,
    studentName,
    schoolId,
    academicYearId,
    gradeId,
    classId,
  });
}

main().catch((error) => {
  console.error("فشل seed ولي الأمر:");
  console.error(error);
  process.exit(1);
});