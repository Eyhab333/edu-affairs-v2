const {
  applicationDefault,
  getApps,
  initializeApp,
} = require("firebase-admin/app");

const { getFirestore } = require("firebase-admin/firestore");

const PROJECT_ID = process.env.GCLOUD_PROJECT || "edu-affairs-dev";

const ORG_ID = process.env.ORG_ID || "takween";
const ACADEMIC_YEAR_ID = process.env.ACADEMIC_YEAR_ID || "ay-1448";

const WRITE = process.argv.includes("--write");

const schoolArg = process.argv.find((value) => value.startsWith("--school="));

const ONLY_SCHOOL_ID = schoolArg
  ? schoolArg.slice("--school=".length).trim()
  : "";

if (!getApps().length) {
  initializeApp({
    credential: applicationDefault(),
    projectId: PROJECT_ID,
  });
}

const db = getFirestore();

/*
 * مبالغ تجريبية فقط.
 *
 * amountMinor:
 * 100000 = 1000 ريال.
 *
 * يمكن تغييرها لاحقًا من web-admin عند إنشاء
 * واجهة تعريفات الرسوم.
 */
const DEFAULT_AMOUNT_MINOR = 100000;

function buildDefinition({ schoolId, schoolName, schoolType, now }) {
  const id = `${schoolId}-${ACADEMIC_YEAR_ID}-tuition-test`;

  return {
    id,
    orgId: ORG_ID,

    schoolId,
    academicYearId: ACADEMIC_YEAR_ID,

    code: "TUITION_TEST",
    title: "رسوم دراسية تجريبية",
    description: `تعريف تجريبي لاختبار الرسوم والمدفوعات في ${schoolName}`,

    category: "TUITION",

    currency: "SAR",
    defaultAmountMinor: DEFAULT_AMOUNT_MINOR,

    // نُبقيه مؤقتًا لأن الواجهة الحالية تقرأه.
    amountMinor: DEFAULT_AMOUNT_MINOR,

    defaultInstallmentCount: 1,
    maxInstallmentCount: 10,

    applicableGradeIds: [],
    applicableClassIds: [],

    status: "ACTIVE",
    isActive: true,
    isGuardianVisible: true,

    metadata: {
      seeded: true,
      testData: true,
      schoolType,
      seedKey: "guardian-finance-v1",
    },

    createdAt: now,
    updatedAt: now,
  };
}

async function main() {
  console.log("\nإعدادات التشغيل:");
  console.table({
    projectId: PROJECT_ID,
    orgId: ORG_ID,
    academicYearId: ACADEMIC_YEAR_ID,
    onlySchoolId: ONLY_SCHOOL_ID || "كل المدارس",
    mode: WRITE ? "WRITE" : "DRY RUN",
  });

  const orgRef = db.collection("orgs").doc(ORG_ID);

  const orgSnapshot = await orgRef.get();

  if (!orgSnapshot.exists) {
    throw new Error(`المؤسسة غير موجودة: ${orgRef.path}`);
  }

  const schoolsSnapshot = await orgRef.collection("schools").get();

  if (schoolsSnapshot.empty) {
    throw new Error("لا توجد مدارس داخل المؤسسة.");
  }

  const definitions = [];

  for (const schoolDocument of schoolsSnapshot.docs) {
    if (ONLY_SCHOOL_ID && schoolDocument.id !== ONLY_SCHOOL_ID) {
      continue;
    }

    const school = schoolDocument.data();

    if (school.isArchived === true) {
      console.log(`تخطي مدرسة مؤرشفة: ${schoolDocument.id}`);

      continue;
    }

    const academicYearRef = schoolDocument.ref
      .collection("academicYears")
      .doc(ACADEMIC_YEAR_ID);

    const academicYearSnapshot = await academicYearRef.get();

    if (!academicYearSnapshot.exists) {
      console.log(`تخطي ${schoolDocument.id}: السنة غير موجودة.`);

      continue;
    }

    const academicYear = academicYearSnapshot.data();

    if (academicYear?.isActive !== true) {
      console.log(`تخطي ${schoolDocument.id}: السنة غير نشطة.`);

      continue;
    }

    const schoolName = school.name || school.title || schoolDocument.id;

    const schoolType = school.profile?.schoolType || "UNKNOWN";

    const now = Date.now();

    const definition = buildDefinition({
      schoolId: schoolDocument.id,
      schoolName,
      schoolType,
      now,
    });

    definitions.push({
      ref: orgRef.collection("feeDefinitions").doc(definition.id),

      data: definition,
    });
  }

  if (definitions.length === 0) {
    throw new Error("لم يتم العثور على مدارس مطابقة لإنشاء التعريفات.");
  }

  console.log("\nالتعريفات المخطط إنشاؤها:");

  console.table(
    definitions.map(({ ref, data }) => ({
      documentId: ref.id,
      schoolId: data.schoolId,
      title: data.title,
      amount: `${data.amountMinor / 100} SAR`,
      status: data.status,
    })),
  );

  if (!WRITE) {
    console.log(
      "\nلم تتم أي كتابة. للتنفيذ الفعلي شغّل:\n" +
        "node scripts/seed-guardian-fee-definitions.cjs --write",
    );

    return;
  }

  const batch = db.batch();

  for (const { ref, data } of definitions) {
    const existingSnapshot = await ref.get();

    if (existingSnapshot.exists) {
      const existing = existingSnapshot.data();

      batch.set(
        ref,
        {
          ...data,

          createdAt:
            existing.createdAt ?? existing.createdAtMillis ?? data.createdAt,

          updatedAt: Date.now(),
        },
        { merge: true },
      );
    } else {
      batch.set(ref, data);
    }
  }

  await batch.commit();

  console.log(`\nتم حفظ ${definitions.length} تعريف رسم بنجاح.`);

  console.log(`المسار: orgs/${ORG_ID}/feeDefinitions`);
}

main().catch((error) => {
  console.error("\nفشل Seed تعريفات الرسوم:");
  console.error(error);
  process.exitCode = 1;
});
