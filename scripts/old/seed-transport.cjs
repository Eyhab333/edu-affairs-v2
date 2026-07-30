#!/usr/bin/env node

/**
 * Milestone 18B — Transport Seed
 *
 * Usage:
 *   node scripts/seed-transport.cjs --dry-run
 *   node scripts/seed-transport.cjs
 *
 * Optional:
 *   node scripts/seed-transport.cjs --limit=10
 */

const admin = require("firebase-admin");
const path = require("path");

const serviceAccount = require(path.join(__dirname, "./service-account.json"));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

db.settings({
  ignoreUndefinedProperties: true,
});

const DRY_RUN = process.argv.includes("--dry-run");

function getArgValue(name, fallback) {
  const prefix = `--${name}=`;
  const item = process.argv.find((arg) => arg.startsWith(prefix));
  if (!item) return fallback;
  return item.slice(prefix.length);
}

const LIMIT = Number(getArgValue("limit", "5"));

const ORG_ID = "takween";
const SCHOOL_ID = "mrb-boys-sayh";
const ACADEMIC_YEAR_ID = "ay-1448";
const TERM_ID = "term-1";
const TERM_TITLE = "الفصل الدراسي الأول";
const TERM_SHORT_TITLE = "ف1";
const CLASS_ID = "g1-general-1";

const VEHICLE_ID = "vehicle-mrb-boys-sayh-01";
const ROUTE_ID = "route-mrb-boys-sayh-01";

const NOW = Date.now();



function printDryRun(pathValue, data) {
  console.log(`[dry-run] set ${pathValue}`);
  console.log(JSON.stringify(data, null, 2));
}

async function upsertDoc(db, pathValue, data) {
  if (DRY_RUN) {
    printDryRun(pathValue, data);
    return;
  }

  await db.doc(pathValue).set(data, { merge: true });
}

async function getFirstClassStudents(db) {
  const enrollmentsSnap = await db
    .collection(`orgs/${ORG_ID}/studentEnrollments`)
    .where("schoolId", "==", SCHOOL_ID)
    .where("academicYearId", "==", ACADEMIC_YEAR_ID)
    .where("classId", "==", CLASS_ID)
    .where("status", "==", "ACTIVE")
    .limit(LIMIT)
    .get();

  const enrollments = enrollmentsSnap.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  }));

  if (!enrollments.length) {
    throw new Error(
      `No ACTIVE studentEnrollments found for ${SCHOOL_ID}/${ACADEMIC_YEAR_ID}/${CLASS_ID}`
    );
  }

  return enrollments;
}

function buildStudentDisplayName(enrollment) {
  return (
    enrollment.studentDisplayName ||
    enrollment.studentName ||
    enrollment.personDisplayName ||
    enrollment.studentId
  );
}

async function main() {
  

  console.log("Milestone 18B — Transport Seed");
  console.log({
    dryRun: DRY_RUN,
    orgId: ORG_ID,
    schoolId: SCHOOL_ID,
    academicYearId: ACADEMIC_YEAR_ID,
    classId: CLASS_ID,
    limit: LIMIT,
  });

  const students = await getFirstClassStudents(db);

  const vehiclePath = `orgs/${ORG_ID}/transportVehicles/${VEHICLE_ID}`;
  const routePath = `orgs/${ORG_ID}/transportRoutes/${ROUTE_ID}`;

  const vehicle = {
    id: VEHICLE_ID,
    orgId: ORG_ID,

    code: "BUS-01",
    plateNumber: "TEST-001",
    title: "باص تجريبي 01",
    model: "تجريبي",
    capacity: 25,

    status: "ACTIVE",
    notes: "بيانات تجريبية لمرحلة Milestone 18B",

    createdAt: NOW,
    updatedAt: NOW,
  };

  const route = {
    id: ROUTE_ID,
    orgId: ORG_ID,
    schoolId: SCHOOL_ID,
    academicYearId: ACADEMIC_YEAR_ID,

    code: "MRB-SAYH-R01",
    title: "خط تجريبي 01 - منار الريادة بنين السيح",
    shortTitle: "خط 01",
    description: "خط نقل تجريبي مرتبط بفصل أول ابتدائي / العام / أ",

    vehicleId: VEHICLE_ID,
    supervisorPersonIds: [],

    areaLabel: "السيح",
    startsFromLabel: "حي تجريبي 1",
    endsAtLabel: "مدرسة منار الريادة بنين السيح",

    status: "ACTIVE",
    order: 1,
    isArchived: false,

    createdAt: NOW,
    updatedAt: NOW,
  };

  await upsertDoc(db, vehiclePath, vehicle);
  await upsertDoc(db, routePath, route);

  const stops = [
    {
      id: `${ROUTE_ID}-stop-01`,
      title: "نقطة 1 - حي تجريبي",
      areaLabel: "السيح",
      addressText: "عنوان تجريبي لنقطة الصعود الأولى",
      order: 1,
      estimatedMorningTime: "06:30",
      estimatedAfternoonTime: "13:30",
    },
    {
      id: `${ROUTE_ID}-stop-02`,
      title: "نقطة 2 - حي تجريبي",
      areaLabel: "السيح",
      addressText: "عنوان تجريبي لنقطة الصعود الثانية",
      order: 2,
      estimatedMorningTime: "06:40",
      estimatedAfternoonTime: "13:40",
    },
  ];

  for (const stop of stops) {
    const stopPath = `orgs/${ORG_ID}/transportRouteStops/${stop.id}`;

    await upsertDoc(db, stopPath, {
      id: stop.id,
      orgId: ORG_ID,
      routeId: ROUTE_ID,

      title: stop.title,
      description: "نقطة توقف تجريبية",
      kind: "BOTH",

      areaLabel: stop.areaLabel,
      addressText: stop.addressText,

      order: stop.order,
      estimatedMorningTime: stop.estimatedMorningTime,
      estimatedAfternoonTime: stop.estimatedAfternoonTime,

      isActive: true,
      isArchived: false,

      createdAt: NOW,
      updatedAt: NOW,
    });
  }

  let enrollmentCount = 0;

  for (const [index, student] of students.entries()) {
    const stop = stops[index % stops.length];

    const enrollmentId = `${ROUTE_ID}-${student.studentId}`;
    const enrollmentPath = `orgs/${ORG_ID}/studentTransportEnrollments/${enrollmentId}`;

    const enrollment = {
      id: enrollmentId,
      orgId: ORG_ID,

      schoolId: SCHOOL_ID,
      academicYearId: ACADEMIC_YEAR_ID,
      termId: TERM_ID,
      termTitle: TERM_TITLE,
      termShortTitle: TERM_SHORT_TITLE,

      studentId: student.studentId,
      studentPersonId: student.studentPersonId,
      studentDisplayName: buildStudentDisplayName(student),

      guardianPersonId: student.guardianPersonId,
      guardianDisplayName: student.guardianDisplayName,
      guardianPhone: student.guardianPhone,

      routeId: ROUTE_ID,
      routeTitle: route.title,

      pickupStopId: stop.id,
      pickupStopTitle: stop.title,

      dropoffStopId: stop.id,
      dropoffStopTitle: stop.title,

      status: "ACTIVE",

      startsAt: NOW,
      notes: "اشتراك نقل تجريبي تم إنشاؤه من seed-transport.cjs",

      createdAt: NOW,
      updatedAt: NOW,
    };

    await upsertDoc(db, enrollmentPath, enrollment);
    enrollmentCount += 1;
  }

  console.log("");
  console.log("Transport seed completed.");
  console.log({
    dryRun: DRY_RUN,
    vehiclePath,
    routePath,
    stopsCount: stops.length,
    enrollmentsCount: enrollmentCount,
  });
}

main().catch((error) => {
  console.error("Transport seed failed:");
  console.error(error);
  process.exit(1);
});