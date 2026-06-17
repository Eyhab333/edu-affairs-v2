/* eslint-disable no-console */

const admin = require("firebase-admin");
const path = require("path");

const ORG_ID = process.env.ORG_ID || "takween";
const SCHOOL_ID = process.env.SCHOOL_ID || "mrb-boys-sayh";
const ACADEMIC_YEAR_ID = process.env.ACADEMIC_YEAR_ID || "ay-1448";

const EVALUATOR_EMAIL = (
  process.env.EVALUATOR_EMAIL || "e.ahmad@qz.org.sa"
).toLowerCase();

const TARGET_EMAIL = (
  process.env.TARGET_EMAIL || "a.brakat@qz.org.sa"
).toLowerCase();

function initAdmin() {
  if (admin.apps.length) return;

  const serviceAccountPath = path.resolve(
    process.cwd(),
    "service-account.json",
  );

  const serviceAccount = require(serviceAccountPath);

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    projectId: serviceAccount.project_id,
  });
}

function dataWithId(doc) {
  return {
    id: doc.id,
    path: doc.ref.path,
    ...doc.data(),
  };
}

function compact(value) {
  return JSON.stringify(value, null, 2);
}

async function findPeopleByEmail(db, email) {
  const peopleRef = db.collection(`orgs/${ORG_ID}/people`);

  const exactSnap = await peopleRef.where("email", "==", email).get();

  const exact = exactSnap.docs.map(dataWithId);
  if (exact.length > 0) return exact;

  // fallback: لو الإيميل محفوظ بحروف مختلفة
  const allSnap = await peopleRef.get();

  return allSnap.docs.map(dataWithId).filter((person) => {
    return String(person.email || "").toLowerCase() === email;
  });
}

async function findUsersByEmail(db, email) {
  const usersSnap = await db
    .collection("users")
    .where("email", "==", email)
    .get();

  const exact = usersSnap.docs.map(dataWithId);
  if (exact.length > 0) return exact;

  const allUsersSnap = await db.collection("users").get();

  return allUsersSnap.docs.map(dataWithId).filter((user) => {
    return String(user.email || "").toLowerCase() === email;
  });
}

async function loadUserOrgMemberships(db, userId) {
  const snap = await db
    .collection("users")
    .doc(userId)
    .collection("orgMemberships")
    .get();

  return snap.docs.map(dataWithId);
}

async function loadOperationalMemberships(db, personId) {
  const snap = await db
    .collection(`orgs/${ORG_ID}/operationalMemberships`)
    .where("personId", "==", personId)
    .get();

  return snap.docs.map(dataWithId);
}

async function loadTeacherAssignments(db, personId) {
  const asTeacherSnap = await db
    .collection(`orgs/${ORG_ID}/teacherAssignments`)
    .where("teacherPersonId", "==", personId)
    .get();

  const asSupervisorSnap = await db
    .collection(`orgs/${ORG_ID}/teacherAssignments`)
    .where("supervisorPersonId", "==", personId)
    .get();

  return {
    asTeacher: asTeacherSnap.docs.map(dataWithId),
    asSupervisor: asSupervisorSnap.docs.map(dataWithId),
  };
}

async function inspectOne(db, label, email) {
  console.log("\n==================================================");
  console.log(label);
  console.log("email:", email);
  console.log("==================================================");

  const people = await findPeopleByEmail(db, email);

  if (!people.length) {
    console.log("❌ لم أجد person داخل:");
    console.log(`orgs/${ORG_ID}/people`);
  } else {
    console.log(`✅ people found: ${people.length}`);
    for (const person of people) {
      console.log(
        compact({
          path: person.path,
          id: person.id,
          displayName: person.displayName,
          email: person.email,
          phone: person.phone,
        }),
      );

      const operationalMemberships = await loadOperationalMemberships(
        db,
        person.id,
      );

      console.log("\nOperational Memberships:");
      if (!operationalMemberships.length) {
        console.log("لا يوجد operationalMemberships");
      } else {
        for (const membership of operationalMemberships) {
          console.log(
            compact({
              path: membership.path,
              id: membership.id,
              roleKey: membership.roleKey,
              scopeType: membership.scopeType,
              scopeId: membership.scopeId,
              isActive: membership.isActive,
            }),
          );
        }
      }

      const teacherAssignments = await loadTeacherAssignments(db, person.id);

      console.log("\nTeacher Assignments as teacher:");
      if (!teacherAssignments.asTeacher.length) {
        console.log("لا يوجد teacherAssignments كمعلم");
      } else {
        for (const assignment of teacherAssignments.asTeacher) {
          console.log(
            compact({
              path: assignment.path,
              id: assignment.id,
              schoolId: assignment.schoolId,
              academicYearId: assignment.academicYearId,
              assignmentKind: assignment.assignmentKind,
              targetScopeType: assignment.targetScopeType,
              targetScopeId: assignment.targetScopeId,
              subjectKey: assignment.subjectKey,
              status: assignment.status,
            }),
          );
        }
      }

      console.log("\nTeacher Assignments as supervisor:");
      if (!teacherAssignments.asSupervisor.length) {
        console.log("لا يوجد teacherAssignments كمشرف");
      } else {
        for (const assignment of teacherAssignments.asSupervisor) {
          console.log(
            compact({
              path: assignment.path,
              id: assignment.id,
              schoolId: assignment.schoolId,
              academicYearId: assignment.academicYearId,
              teacherPersonId: assignment.teacherPersonId,
              assignmentKind: assignment.assignmentKind,
              targetScopeType: assignment.targetScopeType,
              targetScopeId: assignment.targetScopeId,
              subjectKey: assignment.subjectKey,
              status: assignment.status,
            }),
          );
        }
      }
    }
  }

  const users = await findUsersByEmail(db, email);

  console.log("\nUsers:");
  if (!users.length) {
    console.log("لا يوجد user بهذا الإيميل داخل users");
  } else {
    for (const user of users) {
      console.log(
        compact({
          path: user.path,
          id: user.id,
          email: user.email,
          displayName: user.displayName,
          personId: user.personId,
        }),
      );

      const orgMemberships = await loadUserOrgMemberships(db, user.id);

      console.log("User orgMemberships:");
      if (!orgMemberships.length) {
        console.log("لا يوجد orgMemberships تحت user");
      } else {
        for (const membership of orgMemberships) {
          console.log(
            compact({
              path: membership.path,
              id: membership.id,
              orgId: membership.orgId,
              role: membership.role,
              roleKey: membership.roleKey,
              isActive: membership.isActive,
              active: membership.active,
            }),
          );
        }
      }
    }
  }
}

async function inspectSchoolContext(db) {
  console.log("\n==================================================");
  console.log("School Context");
  console.log("==================================================");

  const schoolRef = db.doc(`orgs/${ORG_ID}/schools/${SCHOOL_ID}`);
  const schoolSnap = await schoolRef.get();

  if (!schoolSnap.exists) {
    console.log(`❌ المدرسة غير موجودة: ${schoolRef.path}`);
  } else {
    const school = dataWithId(schoolSnap);
    console.log(
      compact({
        path: school.path,
        id: school.id,
        name: school.name,
        schoolType: school.profile?.schoolType,
        track: school.profile?.track,
      }),
    );
  }

  const yearRef = db.doc(
    `orgs/${ORG_ID}/schools/${SCHOOL_ID}/academicYears/${ACADEMIC_YEAR_ID}`,
  );
  const yearSnap = await yearRef.get();

  if (!yearSnap.exists) {
    console.log(`❌ السنة الدراسية غير موجودة: ${yearRef.path}`);
  } else {
    const year = dataWithId(yearSnap);
    console.log(
      compact({
        path: year.path,
        id: year.id,
        title: year.title,
        isActive: year.isActive,
      }),
    );
  }
}

async function main() {
  initAdmin();

  const db = admin.firestore();

  console.log("Running simple inspect only. No writes will be performed.");
  console.log(
    compact({
      orgId: ORG_ID,
      schoolId: SCHOOL_ID,
      academicYearId: ACADEMIC_YEAR_ID,
      evaluatorEmail: EVALUATOR_EMAIL,
      targetEmail: TARGET_EMAIL,
    }),
  );

  await inspectSchoolContext(db);
  await inspectOne(db, "Evaluator", EVALUATOR_EMAIL);
  await inspectOne(db, "Target", TARGET_EMAIL);

  console.log("\n✅ Inspect finished. No writes performed.");
}

main().catch((error) => {
  console.error("\n❌ Inspect failed:");
  console.error(error);
  process.exit(1);
});
