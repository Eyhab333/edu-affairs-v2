const path = require("node:path");
const admin = require("firebase-admin");
const ExcelJS = require("exceljs");

const serviceAccount = require("../service-account.json");

const CONFIG = {
  orgId: "takween",
  outputFileName: "transport-students-by-school.xlsx",
};

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function label(data, fallback) {
  return (
    text(data?.nameAr) ||
    text(data?.title) ||
    text(data?.name) ||
    text(data?.shortName) ||
    text(data?.nameEn) ||
    fallback
  );
}

function isCurrentEnrollment(data, now) {
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

  const [schoolsSnapshot, enrollmentsSnapshot] = await Promise.all([
    db.collection(`orgs/${orgId}/schools`).get(),
    db.collection(`orgs/${orgId}/studentTransportEnrollments`).get(),
  ]);

  const schools = schoolsSnapshot.docs
    .map((doc) => {
      const data = doc.data();

      return {
        id: doc.id,
        name: label(data, doc.id),
        isArchived:
          data.isArchived === true ||
          text(data.status).toUpperCase() === "ARCHIVED",
      };
    })
    .filter((school) => !school.isArchived);

  const studentsBySchool = new Map();

  for (const school of schools) {
    studentsBySchool.set(school.id, new Set());
  }

  const allStudentIds = new Set();

  for (const doc of enrollmentsSnapshot.docs) {
    const enrollment = doc.data();

    if (!isCurrentEnrollment(enrollment, now)) {
      continue;
    }

    const schoolId = text(enrollment.schoolId);
    const studentId = text(enrollment.studentId);

    if (!schoolId || !studentId) {
      continue;
    }

    if (!studentsBySchool.has(schoolId)) {
      studentsBySchool.set(schoolId, new Set());
    }

    studentsBySchool.get(schoolId).add(studentId);

    allStudentIds.add(studentId);
  }

  const rows = schools
    .map((school) => ({
      schoolName: school.name,
      studentCount: studentsBySchool.get(school.id)?.size ?? 0,
    }))
    .sort((a, b) => a.schoolName.localeCompare(b.schoolName, "ar"));

  const workbook = new ExcelJS.Workbook();

  workbook.creator = "Takween";
  workbook.created = new Date();

  const sheet = workbook.addWorksheet("طلاب النقل حسب المدرسة", {
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
      width: 38,
    },
    {
      header: "عدد الطلاب المشتركين بالنقل",
      key: "studentCount",
      width: 28,
    },
  ];

  for (const item of rows) {
    sheet.addRow(item);
  }

  sheet.addRow([]);

  const totalRow = sheet.addRow({
    schoolName: "الإجمالي العام",
    studentCount: allStudentIds.size,
  });

  totalRow.font = {
    bold: true,
    size: 13,
  };

  const headerRow = sheet.getRow(1);

  headerRow.font = {
    bold: true,
  };

  headerRow.alignment = {
    horizontal: "center",
    vertical: "middle",
  };

  headerRow.height = 26;

  sheet.eachRow((row, rowNumber) => {
    row.alignment = {
      vertical: "middle",
    };

    if (rowNumber > 1) {
      row.getCell(2).alignment = {
        horizontal: "center",
        vertical: "middle",
      };
    }
  });

  sheet.autoFilter = {
    from: "A1",
    to: "B1",
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
