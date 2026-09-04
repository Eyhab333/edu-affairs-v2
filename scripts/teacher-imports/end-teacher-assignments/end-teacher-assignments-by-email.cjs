const admin = require("firebase-admin");
const path = require("path");

const serviceAccount = require(path.resolve("service-account.json"));

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

const db = admin.firestore();

const APPLY = process.argv.includes("--apply");

function getArg(name) {
  const prefix = `--${name}=`;
  const arg = process.argv.find((x) => x.startsWith(prefix));
  return arg ? arg.slice(prefix.length).trim() : "";
}

const ORG_ID = getArg("org") || "takween";
const TEACHER_EMAIL = getArg("email");
const SCHOOL_ID = getArg("school");

if (!TEACHER_EMAIL || !SCHOOL_ID) {
  console.error(`
Missing required args.

Usage:
node .\\scripts\\seeds\\end-teacher-assignments-by-email.cjs --email=hameed-s@qz.org.sa --school=mrb-boys-faleh

Apply:
node .\\scripts\\seeds\\end-teacher-assignments-by-email.cjs --email=hameed-s@qz.org.sa --school=mrb-boys-faleh --apply
`);
  process.exit(1);
}

function isActiveAssignment(data) {
  return data.status === "ACTIVE" || data.active === true;
}

async function resolveTeacher() {
  const usersSnap = await db
    .collection("users")
    .where("email", "==", TEACHER_EMAIL)
    .limit(10)
    .get();

  const users = usersSnap.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  }));

  const exactUsers = users.filter((u) => u.email === TEACHER_EMAIL);

  if (exactUsers.length !== 1) {
    throw new Error(
      `Expected exactly one user for email ${TEACHER_EMAIL}, found ${exactUsers.length}`
    );
  }

  const user = exactUsers[0];

  if (!user.personId) {
    throw new Error(`User ${TEACHER_EMAIL} has no personId`);
  }

  return {
    email: user.email,
    uid: user.uid || user.id,
    personId: user.personId,
    displayName: user.displayName || null,
  };
}

async function main() {
  console.log(APPLY ? "APPLY mode" : "Preview mode (read-only)");

  const teacher = await resolveTeacher();

  const snap = await db
    .collection("orgs")
    .doc(ORG_ID)
    .collection("teacherAssignments")
    .where("teacherPersonId", "==", teacher.personId)
    .get();

  const allAssignments = snap.docs.map((doc) => ({
    id: doc.id,
    ref: doc.ref,
    ...doc.data(),
  }));

  const activeAssignmentsToEnd = allAssignments.filter((row) => {
    return row.schoolId === SCHOOL_ID && isActiveAssignment(row);
  });

  const keptAssignments = allAssignments.filter((row) => {
    return row.schoolId !== SCHOOL_ID || !isActiveAssignment(row);
  });

  console.dir(
    {
      orgId: ORG_ID,
      teacher,
      schoolToEnd: SCHOOL_ID,
      totalTeacherAssignmentsFound: allAssignments.length,
      activeAssignmentsToEndCount: activeAssignmentsToEnd.length,
      assignmentsToEnd: activeAssignmentsToEnd.map((row) => ({
        id: row.id,
        schoolId: row.schoolId,
        academicYearId: row.academicYearId,
        termId: row.termId,
        classId: row.classId,
        classSubjectOfferingId: row.classSubjectOfferingId,
        subjectKey: row.subjectKey,
        status: row.status,
        active: row.active,
      })),
      keptAssignmentsCount: keptAssignments.length,
      decision:
        activeAssignmentsToEnd.length > 0 ? "SAFE TO APPLY" : "NOTHING TO END",
    },
    { depth: 10 }
  );

  if (!APPLY) {
    console.log("No writes performed. Re-run with --apply to end only the listed assignments.");
    return;
  }

  if (activeAssignmentsToEnd.length === 0) {
    console.log("No active assignments found. Nothing written.");
    return;
  }

  const now = Date.now();
  const batch = db.batch();

  for (const row of activeAssignmentsToEnd) {
    batch.update(row.ref, {
      status: "ENDED",
      active: false,
      endedAt: now,
      updatedAt: now,
    });
  }

  await batch.commit();

  console.dir(
    {
      decision: "APPLIED",
      teacherEmail: TEACHER_EMAIL,
      teacherPersonId: teacher.personId,
      schoolId: SCHOOL_ID,
      endedTeacherAssignments: activeAssignmentsToEnd.length,
    },
    { depth: 5 }
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});