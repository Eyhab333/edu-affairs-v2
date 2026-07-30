const admin = require("firebase-admin");
const path = require("path");
const fs = require("fs");

const serviceAccount = require(path.join(__dirname, "./service-account.json"));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

const orgId = process.env.ORG_ID || "takween";
const academicYearId = process.env.ACADEMIC_YEAR_ID || "ay-1448";
const dryRun = process.argv.includes("--dry-run");







const startedAt = Date.now();

const PRIMARY_SCHOOLS = [
  "mrb-boys-sayh",
  "mrb-boys-faleh",
  "mrb-girls",
];

function normalize(value) {
  return String(value || "").trim().toLowerCase();
}

function isPrimaryGradeId(gradeId) {
  return /^g[1-6]$/.test(normalize(gradeId));
}

function isPrimaryClassId(classId) {
  return /^g[1-6]-/.test(normalize(classId));
}

function shouldTreatAsPrimaryClass(data, docId) {
  return (
    isPrimaryGradeId(data.gradeId) ||
    isPrimaryClassId(data.id) ||
    isPrimaryClassId(docId)
  );
}

function shouldTreatAsPrimaryOffering(data, docId) {
  return (
    isPrimaryGradeId(data.gradeId) ||
    isPrimaryClassId(data.classId) ||
    isPrimaryClassId(data.id) ||
    isPrimaryClassId(docId)
  );
}

async function backfillClasses(result) {
  for (const schoolId of PRIMARY_SCHOOLS) {
    const snap = await db
      .collection("orgs")
      .doc(orgId)
      .collection("schools")
      .doc(schoolId)
      .collection("academicYears")
      .doc(academicYearId)
      .collection("classes")
      .get();

    for (const docSnap of snap.docs) {
      const data = docSnap.data() || {};

      if (!shouldTreatAsPrimaryClass(data, docSnap.id)) {
        result.classes.skipped += 1;
        continue;
      }

      const currentSchoolType = data.schoolType || "";

      if (currentSchoolType === "PRIMARY" && data.isActive === true) {
        result.classes.alreadyOk += 1;
        continue;
      }

      result.classes.toUpdate += 1;

      const updatePayload = {
        orgId,
        schoolId,
        academicYearId,
        schoolType: "PRIMARY",
        isActive: true,
        status: data.status || "ACTIVE",
        updatedAt: Date.now(),
      };

      if (!dryRun) {
        await docSnap.ref.set(updatePayload, { merge: true });
      }

      result.classes.updated.push({
        schoolId,
        classId: data.id || docSnap.id,
        title: data.title || "",
        gradeId: data.gradeId || "",
        previousSchoolType: currentSchoolType,
      });

      console.log(
        `${dryRun ? "DRY RUN update" : "UPDATED"} class ${schoolId}/${docSnap.id}`,
      );
    }
  }
}

async function backfillOfferings(result) {
  const snap = await db
    .collection("orgs")
    .doc(orgId)
    .collection("classSubjectOfferings")
    .get();

  for (const docSnap of snap.docs) {
    const data = docSnap.data() || {};

    if (!shouldTreatAsPrimaryOffering(data, docSnap.id)) {
      result.offerings.skipped += 1;
      continue;
    }

    if (!PRIMARY_SCHOOLS.includes(data.schoolId)) {
      result.offerings.skipped += 1;
      continue;
    }

    if (data.academicYearId && data.academicYearId !== academicYearId) {
      result.offerings.skipped += 1;
      continue;
    }

    const currentSchoolType = data.schoolType || "";

    if (currentSchoolType === "PRIMARY" && data.isActive === true) {
      result.offerings.alreadyOk += 1;
      continue;
    }

    result.offerings.toUpdate += 1;

    const updatePayload = {
      orgId,
      schoolType: "PRIMARY",
      isActive: true,
      status: data.status || "ACTIVE",
      updatedAt: Date.now(),
    };

    if (!dryRun) {
      await docSnap.ref.set(updatePayload, { merge: true });
    }

    result.offerings.updated.push({
      offeringId: data.id || docSnap.id,
      schoolId: data.schoolId || "",
      academicYearId: data.academicYearId || "",
      gradeId: data.gradeId || "",
      classId: data.classId || "",
      subjectKey: data.subjectKey || "",
      previousSchoolType: currentSchoolType,
    });

    console.log(
      `${dryRun ? "DRY RUN update" : "UPDATED"} offering ${docSnap.id}`,
    );
  }
}

async function main() {
  const result = {
    orgId,
    academicYearId,
    dryRun,
    schools: PRIMARY_SCHOOLS,

    classes: {
      toUpdate: 0,
      alreadyOk: 0,
      skipped: 0,
      updated: [],
    },

    offerings: {
      toUpdate: 0,
      alreadyOk: 0,
      skipped: 0,
      updated: [],
    },
  };

  console.log("Backfilling PRIMARY schoolType...");
  console.log({
    orgId,
    academicYearId,
    dryRun,
    schools: PRIMARY_SCHOOLS,
  });

  await backfillClasses(result);
  await backfillOfferings(result);

  const outputPath = path.join(
    __dirname,
    "backfill-primary-school-type-result.json",
  );

  fs.writeFileSync(outputPath, JSON.stringify(result, null, 2), "utf8");

  console.log("\nDone.");
  console.log({
    dryRun,
    classesToUpdate: result.classes.toUpdate,
    classesAlreadyOk: result.classes.alreadyOk,
    offeringsToUpdate: result.offerings.toUpdate,
    offeringsAlreadyOk: result.offerings.alreadyOk,
    durationMs: Date.now() - startedAt,
  });

  console.log("\nResult written to:");
  console.log(outputPath);
}

main().catch((error) => {
  console.error("Failed to backfill PRIMARY schoolType.");
  console.error(error);
  process.exit(1);
});