const admin = require("firebase-admin");
const path = require("path");

const serviceAccount = require(path.join(__dirname, "./service-account.json"));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

const orgId = process.env.ORG_ID || "takween";
const dryRun = process.argv.includes("--dry-run");

const now = Date.now();

const context = {
  schoolId: "kg-01",
  academicYearId: "ay-1448",
  gradeId: "kg3",
  classId: "kg3-a",
};

const classTeacher = {
  personId: "p-s-s-alaues",
  displayName: "سمية سعود حمد العويس",
};

const offeringsToFix = [
  {
    id: "kg3-a-class",
    subjectKey: "CLASS",
    subjectId: "subject-class",
    subjectTitle: "معلمة الصف",
    displayName: "معلمة الصف",
    order: 0,
    offeringKind: "HOMEROOM_ASSIGNMENT",
  },
  {
    id: "kg3-a-quran",
    subjectKey: "QURAN",
    subjectId: "quran",
    subjectTitle: "القرآن",
    displayName: "القرآن",
    order: 10,
    offeringKind: "KG_DOMAIN",
  },
  {
    id: "kg3-a-learning-gardens",
    subjectKey: "LEARNING_GARDENS",
    subjectId: "learning-gardens",
    subjectTitle: "بساتين المعرفة",
    displayName: "بساتين المعرفة",
    order: 20,
    offeringKind: "KG_DOMAIN",
  },
  {
    id: "kg3-a-numbers",
    subjectKey: "NUMBERS",
    subjectId: "numbers",
    subjectTitle: "الأرقام",
    displayName: "الأرقام",
    order: 30,
    offeringKind: "KG_DOMAIN",
  },
  {
    id: "kg3-a-values",
    subjectKey: "VALUES",
    subjectId: "values",
    subjectTitle: "القيم / أسماء الله الحسنى",
    displayName: "القيم / أسماء الله الحسنى",
    order: 40,
    offeringKind: "KG_DOMAIN",
  },
  {
    id: "kg3-a-corners",
    subjectKey: "CORNERS",
    subjectId: "corners",
    subjectTitle: "الأركان / الأنشطة",
    displayName: "الأركان / الأنشطة",
    order: 50,
    offeringKind: "KG_DOMAIN",
  },
];

const classTeacherDomains = [
  {
    suffix: "quran-class-teacher",
    subjectKey: "QURAN",
    subjectId: "quran",
    subjectTitle: "القرآن",
    offeringId: "kg3-a-quran",
  },
  {
    suffix: "learning-gardens-class-teacher",
    subjectKey: "LEARNING_GARDENS",
    subjectId: "learning-gardens",
    subjectTitle: "بساتين المعرفة",
    offeringId: "kg3-a-learning-gardens",
  },
  {
    suffix: "numbers-class-teacher",
    subjectKey: "NUMBERS",
    subjectId: "numbers",
    subjectTitle: "الأرقام",
    offeringId: "kg3-a-numbers",
  },
];

function teacherAssignmentIdFor(domain) {
  return `ta-kg3-a-${domain.suffix}`;
}

function teacherAssignmentClassLinkIdFor(domain) {
  return `tal-kg3-a-${domain.suffix}`;
}

async function upsertDoc(ref, payload, result, label) {
  const snap = await ref.get();

  const finalPayload = {
    ...payload,
    updatedAt: now,
    ...(snap.exists ? {} : { createdAt: now }),
  };

  if (!dryRun) {
    await ref.set(finalPayload, { merge: true });
  }

  if (snap.exists) {
    result.updated += 1;
    console.log(`${dryRun ? "DRY RUN update" : "UPDATED"} ${label}: ${ref.id}`);
  } else {
    result.created += 1;
    console.log(`${dryRun ? "DRY RUN create" : "CREATED"} ${label}: ${ref.id}`);
  }
}

async function main() {
  const startedAt = Date.now();

  const result = {
    orgId,
    dryRun,
    context,
    classTeacher,
    created: 0,
    updated: 0,
    offeringsFixed: 0,
    assignmentsUpserted: 0,
    linksUpserted: 0,
  };

  console.log("Starting KG3-A class teacher domain fix...");
  console.log({
    orgId,
    dryRun,
    context,
    classTeacher,
  });

  const orgRef = db.collection("orgs").doc(orgId);

  for (const offering of offeringsToFix) {
    const ref = orgRef.collection("classSubjectOfferings").doc(offering.id);

    await upsertDoc(
      ref,
      {
        id: offering.id,
        orgId,
        ...context,

        subjectKey: offering.subjectKey,
        subjectId: offering.subjectId,
        subjectTitle: offering.subjectTitle,
        subjectTitleSnapshot: offering.subjectTitle,
        displayName: offering.displayName,
        shortLabel: offering.subjectKey,

        status: "ACTIVE",
        isActive: true,
        order: offering.order,

        offeringKind: offering.offeringKind,
        source: "fix-kg3-a-class-teacher-domains",
        note: "تصحيح سياق kg3-a وربط مجالات الروضة بمدرسة kg-01.",
      },
      result,
      "offering",
    );

    result.offeringsFixed += 1;
  }

  for (const domain of classTeacherDomains) {
    const assignmentId = teacherAssignmentIdFor(domain);

    const assignmentRef = orgRef
      .collection("teacherAssignments")
      .doc(assignmentId);

    await upsertDoc(
      assignmentRef,
      {
        id: assignmentId,
        orgId,

        personId: classTeacher.personId,
        teacherPersonId: classTeacher.personId,

        schoolId: context.schoolId,
        academicYearId: context.academicYearId,
        gradeId: context.gradeId,

        subjectKey: domain.subjectKey,
        subjectId: domain.subjectId,
        subjectTitle: domain.subjectTitle,

        classSubjectOfferingId: domain.offeringId,

        status: "ACTIVE",
        isActive: true,

        source: "fix-kg3-a-class-teacher-domains",
        note: `إسناد تجريبي لمعلمة الصف ${classTeacher.displayName} على مجال ${domain.subjectTitle} في ${context.classId}.`,
      },
      result,
      "teacherAssignment",
    );

    result.assignmentsUpserted += 1;

    const linkId = teacherAssignmentClassLinkIdFor(domain);

    const linkRef = orgRef
      .collection("teacherAssignmentClassLinks")
      .doc(linkId);

    await upsertDoc(
      linkRef,
      {
        id: linkId,
        orgId,

        /**
         * نضع الحقلين معًا لأن البيانات القديمة عندك تستخدم assignmentId،
         * وبعض الدوال قد تبحث عن teacherAssignmentId.
         */
        assignmentId,
        teacherAssignmentId: assignmentId,

        schoolId: context.schoolId,
        academicYearId: context.academicYearId,
        gradeId: context.gradeId,
        classId: context.classId,

        subjectKey: domain.subjectKey,
        subjectId: domain.subjectId,
        classSubjectOfferingId: domain.offeringId,

        status: "ACTIVE",
        isActive: true,

        source: "fix-kg3-a-class-teacher-domains",
        note: `ربط إسناد ${domain.subjectTitle} بفصل ${context.classId}.`,
      },
      result,
      "teacherAssignmentClassLink",
    );

    result.linksUpserted += 1;
  }

  const finishedAt = Date.now();

  console.log("Done.");
  console.log({
    ...result,
    durationMs: finishedAt - startedAt,
  });
}

main().catch((error) => {
  console.error("Failed to fix KG3-A class teacher domains.");
  console.error(error);
  process.exit(1);
});