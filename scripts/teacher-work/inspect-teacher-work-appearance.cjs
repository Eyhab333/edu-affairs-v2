/* eslint-disable no-console */

const admin = require("firebase-admin");
const path = require("path");

const ORG_ID = "takween";
const TARGET_NAME = "طيبة سليمان الطوالة";

const TARGET_SCHOOL_ID = "kg-01";
const TARGET_ACADEMIC_YEAR_ID = "ay-1448";

function initAdmin() {
  if (admin.apps.length) return;

  const serviceAccountPath = path.resolve(
    __dirname,
    "../service-account.json",
  );

  const serviceAccount = require(serviceAccountPath);

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    projectId: serviceAccount.project_id,
  });
}

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalize(value) {
  return text(value)
    .replace(/\s+/g, " ")
    .trim();
}

function numberValue(value) {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : null;
}

function isAssignmentActive(assignment) {
  if (text(assignment.status) !== "ACTIVE") {
    return {
      active: false,
      reason: `status=${text(assignment.status) || "(missing)"}`,
    };
  }

  if (
    TARGET_ACADEMIC_YEAR_ID &&
    text(assignment.academicYearId) !== TARGET_ACADEMIC_YEAR_ID
  ) {
    return {
      active: false,
      reason: `academicYearId=${text(assignment.academicYearId) || "(missing)"}`,
    };
  }

  const now = Date.now();
  const startAt = numberValue(assignment.startAt);
  const endAt = numberValue(assignment.endAt);

  if (startAt !== null && startAt > now) {
    return {
      active: false,
      reason: "startAt is in the future",
    };
  }

  if (endAt !== null && endAt < now) {
    return {
      active: false,
      reason: "endAt has expired",
    };
  }

  return {
    active: true,
    reason: "ACTIVE",
  };
}

async function findPeopleByName(db) {
  const snapshot = await db
    .collection(`orgs/${ORG_ID}/people`)
    .get();

  const targetNormalized = normalize(TARGET_NAME);

  return snapshot.docs
    .map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }))
    .filter(
      (person) =>
        normalize(person.displayName) === targetNormalized,
    );
}

async function loadOffering(db, offeringId) {
  if (!offeringId) return null;

  const snap = await db
    .doc(
      `orgs/${ORG_ID}/classSubjectOfferings/${offeringId}`,
    )
    .get();

  if (!snap.exists) return null;

  return {
    id: snap.id,
    ...snap.data(),
  };
}

async function loadLinks(db, assignmentId) {
  const snapshot = await db
    .collection(
      `orgs/${ORG_ID}/teacherAssignmentClassLinks`,
    )
    .where("assignmentId", "==", assignmentId)
    .get();

  return snapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  }));
}

async function loadClass(db, {
  schoolId,
  academicYearId,
  classId,
}) {
  if (!schoolId || !academicYearId || !classId) {
    return null;
  }

  const snap = await db
    .doc(
      `orgs/${ORG_ID}/schools/${schoolId}/academicYears/${academicYearId}/classes/${classId}`,
    )
    .get();

  if (!snap.exists) return null;

  return {
    id: snap.id,
    ...snap.data(),
  };
}

async function inspectPerson(db, person) {
  console.log("");
  console.log("============================================================");
  console.log("PERSON");
  console.log("============================================================");
  console.log("displayName:", person.displayName);
  console.log("personId:", person.id);

  if (person.email) {
    console.log("email:", person.email);
  }

  const assignmentSnapshot = await db
    .collection(`orgs/${ORG_ID}/teacherAssignments`)
    .where("teacherPersonId", "==", person.id)
    .get();

  const assignments = assignmentSnapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  }));

  console.log("");
  console.log("Teacher assignments found:", assignments.length);

  if (!assignments.length) {
    console.log("");
    console.log(
      "No teacherAssignments found for this person.",
    );
    return;
  }

  const results = [];

  for (const assignment of assignments) {
    const offeringId = text(
      assignment.classSubjectOfferingId,
    );

    const offering = await loadOffering(
      db,
      offeringId,
    );

    const links = await loadLinks(
      db,
      assignment.id,
    );

    const schoolId = text(assignment.schoolId);
    const academicYearId = text(
      assignment.academicYearId,
    );

    const directClassId = text(
      assignment.classId,
    );

    const effectiveSubjectKey =
      text(assignment.subjectKey) ||
      text(offering?.subjectKey);

    const activity = isAssignmentActive(
      assignment,
    );

    const inKg01 =
      schoolId === TARGET_SCHOOL_ID;

    /*
     * teacher-work requires a subjectKey.
     * With ALL_SUBJECTS scope, any non-empty subjectKey
     * in the allowed school is visible.
     */
    const hasTeacherWorkSubject =
      Boolean(effectiveSubjectKey);

    const wouldAppear =
      activity.active &&
      inKg01 &&
      hasTeacherWorkSubject;

    const classIds = [
      directClassId,
      ...links.map((link) =>
        text(link.classId),
      ),
    ].filter(Boolean);

    const uniqueClassIds = [
      ...new Set(classIds),
    ];

    const classLabels = [];

    for (const classId of uniqueClassIds) {
      const classDoc = await loadClass(db, {
        schoolId,
        academicYearId,
        classId,
      });

      classLabels.push(
        classDoc?.title ||
          classDoc?.sectionLabel ||
          classDoc?.code ||
          classId,
      );
    }

    results.push({
      assignmentId: assignment.id,
      schoolId,
      academicYearId,
      status: text(assignment.status),
      subjectKey:
        effectiveSubjectKey || "(missing)",
      offeringId:
        offeringId || "(none)",
      classes:
        classLabels.join(" | ") ||
        uniqueClassIds.join(" | ") ||
        "(none)",
      active:
        activity.active ? "YES" : "NO",
      appearsInKg01:
        wouldAppear ? "YES" : "NO",
      reason: wouldAppear
        ? "ACTIVE assignment in kg-01 with visible subject"
        : !activity.active
          ? activity.reason
          : !inKg01
            ? `schoolId=${schoolId || "(missing)"}`
            : "missing subjectKey",
    });

    console.log("");
    console.log("------------------------------------------------------------");
    console.log("Assignment:", assignment.id);
    console.log("------------------------------------------------------------");

    console.log("teacherPersonId:", text(
      assignment.teacherPersonId,
    ));

    console.log(
      "schoolId:",
      schoolId || "(missing)",
    );

    console.log(
      "academicYearId:",
      academicYearId || "(missing)",
    );

    console.log(
      "status:",
      text(assignment.status) || "(missing)",
    );

    console.log(
      "subjectKey:",
      text(assignment.subjectKey) || "(missing)",
    );

    console.log(
      "classSubjectOfferingId:",
      offeringId || "(missing)",
    );

    if (offering) {
      console.log("");
      console.log("Offering:");
      console.log(
        "  schoolId:",
        text(offering.schoolId) || "(missing)",
      );
      console.log(
        "  academicYearId:",
        text(offering.academicYearId) ||
          "(missing)",
      );
      console.log(
        "  classId:",
        text(offering.classId) || "(missing)",
      );
      console.log(
        "  subjectKey:",
        text(offering.subjectKey) || "(missing)",
      );
      console.log(
        "  title:",
        text(offering.displayName) ||
          text(offering.subjectTitleSnapshot) ||
          text(offering.shortLabel) ||
          "(missing)",
      );
    } else if (offeringId) {
      console.log("");
      console.log(
        "WARNING: Offering document was not found.",
      );
    }

    console.log("");
    console.log(
      "Effective subjectKey:",
      effectiveSubjectKey || "(missing)",
    );

    console.log("");
    console.log(
      `Class links (${links.length}):`,
    );

    for (const link of links) {
      console.log({
        id: link.id,
        assignmentId: text(link.assignmentId),
        schoolId: text(link.schoolId),
        academicYearId: text(
          link.academicYearId,
        ),
        classId: text(link.classId),
      });
    }

    console.log("");
    console.log(
      "Active for current year:",
      activity.active ? "YES" : "NO",
      `(${activity.reason})`,
    );

    console.log(
      `Would appear in teacher-work for ${TARGET_SCHOOL_ID}:`,
      wouldAppear ? "YES" : "NO",
    );

    if (wouldAppear) {
      console.log("");
      console.log(
        ">>> THIS ASSIGNMENT CAN MAKE THE TEACHER APPEAR IN KG-01 <<<",
      );
    }
  }

  console.log("");
  console.log("============================================================");
  console.log("SUMMARY");
  console.log("============================================================");

  console.table(results);

  const causingAssignments = results.filter(
    (item) => item.appearsInKg01 === "YES",
  );

  console.log("");
  console.log(
    `Assignments causing appearance in ${TARGET_SCHOOL_ID}:`,
    causingAssignments.length,
  );

  for (const item of causingAssignments) {
    console.log(
      `- ${item.assignmentId} | ${item.subjectKey} | ${item.classes}`,
    );
  }
}

async function main() {
  initAdmin();

  const db = admin.firestore();

  console.log(
    "Teacher-work appearance inspection (READ ONLY)",
  );
  console.log("Org:", ORG_ID);
  console.log("Target:", TARGET_NAME);
  console.log(
    "Target school:",
    TARGET_SCHOOL_ID,
  );
  console.log(
    "Academic year:",
    TARGET_ACADEMIC_YEAR_ID,
  );

  const people = await findPeopleByName(db);

  if (!people.length) {
    throw new Error(
      `Person not found by displayName: ${TARGET_NAME}`,
    );
  }

  if (people.length > 1) {
    console.log("");
    console.log(
      `WARNING: Found ${people.length} people with the same display name.`,
    );
  }

  for (const person of people) {
    await inspectPerson(db, person);
  }

  console.log("");
  console.log("Inspection complete.");
  console.log("No writes performed.");
}

main().catch((error) => {
  console.error("");
  console.error(
    "Teacher-work appearance inspection failed:",
  );
  console.error(error);
  process.exitCode = 1;
});