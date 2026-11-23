const path = require("node:path");
const admin = require("firebase-admin");
const ExcelJS = require("exceljs");

const serviceAccount = require("../service-account.json");

const CONFIG = {
  orgId: "takween",
  outputFileName: "transport-summary.xlsx",
};

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function strings(value) {
  return Array.isArray(value)
    ? value
        .filter((item) => typeof item === "string")
        .map((item) => item.trim())
        .filter(Boolean)
    : [];
}

function label(data, fallback) {
  return (
    text(data?.displayName) ||
    text(data?.nameAr) ||
    text(data?.title) ||
    text(data?.name) ||
    text(data?.shortName) ||
    text(data?.nameEn) ||
    fallback
  );
}

function isCurrentTransportEnrollment(data, now) {
  const status = text(data.status);

  if (!["ACTIVE", "PAUSED"].includes(status)) {
    return false;
  }

  const startsAt =
    typeof data.startsAt === "number"
      ? data.startsAt
      : typeof data.startAt === "number"
        ? data.startAt
        : undefined;

  const endsAt =
    typeof data.endsAt === "number"
      ? data.endsAt
      : typeof data.endAt === "number"
        ? data.endAt
        : undefined;

  if (startsAt !== undefined && startsAt > now) {
    return false;
  }

  if (endsAt !== undefined && endsAt < now) {
    return false;
  }

  return true;
}

async function main() {
  const { orgId, outputFileName } = CONFIG;
  const now = Date.now();

  const [
    schoolsSnapshot,
    routesSnapshot,
    vehiclesSnapshot,
    enrollmentsSnapshot,
    assignmentsSnapshot,
  ] = await Promise.all([
    db.collection(`orgs/${orgId}/schools`).get(),
    db.collection(`orgs/${orgId}/transportRoutes`).get(),
    db.collection(`orgs/${orgId}/transportVehicles`).get(),
    db.collection(`orgs/${orgId}/studentTransportEnrollments`).get(),
    db.collection(`orgs/${orgId}/operationalAssignments`).get(),
  ]);

  const schools = new Map();

  for (const doc of schoolsSnapshot.docs) {
    const data = doc.data();

    schools.set(doc.id, {
      id: doc.id,
      name: label(data, doc.id),
    });
  }

  const vehicles = new Map();

  for (const doc of vehiclesSnapshot.docs) {
    const data = doc.data();

    vehicles.set(doc.id, {
      id: doc.id,
      plateNumber: text(data.plateNumber) || "غير محدد",
    });
  }

  const routes = routesSnapshot.docs
    .map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }))
    .filter((route) => {
      return route.isArchived !== true && text(route.status) !== "ARCHIVED";
    });

  const supervisorIdsByRoute = new Map();

  for (const route of routes) {
    supervisorIdsByRoute.set(
      route.id,
      new Set(strings(route.supervisorPersonIds)),
    );
  }

  for (const doc of assignmentsSnapshot.docs) {
    const assignment = doc.data();

    if (
      text(assignment.operationKind) !== "TRANSPORT_ATTENDANCE" ||
      text(assignment.status) !== "ACTIVE" ||
      assignment.isActive === false
    ) {
      continue;
    }

    const actorPersonId = text(assignment.actorPersonId);

    if (!actorPersonId) {
      continue;
    }

    const routeIds = new Set();

    if (text(assignment.scopeType) === "ROUTE" && text(assignment.scopeId)) {
      routeIds.add(text(assignment.scopeId));
    }

    for (const routeId of strings(assignment.targetRouteIds)) {
      routeIds.add(routeId);
    }

    for (const routeId of routeIds) {
      const supervisors = supervisorIdsByRoute.get(routeId);

      if (supervisors) {
        supervisors.add(actorPersonId);
      }
    }
  }

  const studentIdsByRoute = new Map();

  for (const doc of enrollmentsSnapshot.docs) {
    const enrollment = doc.data();

    if (!isCurrentTransportEnrollment(enrollment, now)) {
      continue;
    }

    const routeId = text(enrollment.routeId);
    const studentId = text(enrollment.studentId);

    if (!routeId || !studentId) {
      continue;
    }

    if (!studentIdsByRoute.has(routeId)) {
      studentIdsByRoute.set(routeId, new Set());
    }

    studentIdsByRoute.get(routeId).add(studentId);
  }

  const referencedSupervisorIds = new Set();

  for (const route of routes) {
    for (const supervisorPersonId of supervisorIdsByRoute.get(route.id) ?? []) {
      referencedSupervisorIds.add(supervisorPersonId);
    }
  }

  const people = new Map();

  const personIds = Array.from(referencedSupervisorIds);

  if (personIds.length > 0) {
    const personSnapshots = await db.getAll(
      ...personIds.map((personId) =>
        db.doc(`orgs/${orgId}/people/${personId}`),
      ),
    );

    for (const snapshot of personSnapshots) {
      if (!snapshot.exists) {
        continue;
      }

      people.set(snapshot.id, label(snapshot.data(), snapshot.id));
    }
  }

  const rows = routes.map((route) => {
    const schoolId = text(route.schoolId);
    const vehicleId = text(route.vehicleId);

    const supervisorPersonIds = Array.from(
      supervisorIdsByRoute.get(route.id) ?? [],
    );

    const supervisorNames = supervisorPersonIds
      .map((personId) => people.get(personId) || personId)
      .sort((a, b) => a.localeCompare(b, "ar"));

    return {
      schoolName: schools.get(schoolId)?.name || schoolId || "غير محدد",

      routeTitle: text(route.title) || text(route.shortTitle) || route.id,

      supervisorName:
        supervisorNames.length > 0 ? supervisorNames.join("، ") : "غير محدد",

      plateNumber: vehicleId
        ? vehicles.get(vehicleId)?.plateNumber || "غير محدد"
        : "غير محدد",

      studentCount: studentIdsByRoute.get(route.id)?.size ?? 0,
    };
  });

  rows.sort((a, b) => {
    const schoolCompare = a.schoolName.localeCompare(b.schoolName, "ar");

    if (schoolCompare !== 0) {
      return schoolCompare;
    }

    return a.routeTitle.localeCompare(b.routeTitle, "ar");
  });

  const workbook = new ExcelJS.Workbook();

  workbook.creator = "Takween";
  workbook.created = new Date();

  const sheet = workbook.addWorksheet("إحصائية النقل", {
    views: [
      {
        rightToLeft: true,
        state: "frozen",
        ySplit: 1,
      },
    ],
  });

  sheet.columns = [
    {
      header: "المدرسة",
      key: "schoolName",
      width: 32,
    },
    {
      header: "الخط",
      key: "routeTitle",
      width: 35,
    },
    {
      header: "اسم المشرف",
      key: "supervisorName",
      width: 32,
    },
    {
      header: "رقم اللوحة",
      key: "plateNumber",
      width: 30,
    },
    {
      header: "عدد طلاب النقل",
      key: "studentCount",
      width: 18,
    },
  ];

  for (const item of rows) {
    sheet.addRow(item);
  }

  const headerRow = sheet.getRow(1);

  headerRow.font = {
    bold: true,
  };

  headerRow.alignment = {
    horizontal: "center",
    vertical: "middle",
  };

  headerRow.height = 24;

  sheet.eachRow((row, rowNumber) => {
    row.alignment = {
      vertical: "middle",
    };

    if (rowNumber > 1) {
      row.getCell(5).alignment = {
        horizontal: "center",
        vertical: "middle",
      };
    }
  });

  sheet.autoFilter = {
    from: "A1",
    to: "E1",
  };

  const outputPath = path.join(__dirname, outputFileName);

  await workbook.xlsx.writeFile(outputPath);

  console.log(outputPath);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
