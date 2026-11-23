import "server-only";

import ExcelJS from "exceljs";

import type { ClassStudentStatisticsReport } from "./class-student-statistics";

export async function buildClassStudentStatisticsWorkbook(
  report: ClassStudentStatisticsReport,
) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Takween";
  workbook.created = new Date();

  const worksheet = workbook.addWorksheet("إحصائية الفصول", {
    views: [{ rightToLeft: true, state: "frozen", ySplit: 1 }],
  });

  worksheet.columns = [
    { header: "المدرسة", key: "schoolName", width: 30 },
    { header: "الصف", key: "gradeTitle", width: 22 },
    { header: "الفصل", key: "classTitle", width: 25 },
    { header: "عدد الطلاب", key: "studentCount", width: 16 },
  ];

  const headerRow = worksheet.getRow(1);
  headerRow.font = { bold: true };
  headerRow.alignment = { horizontal: "center", vertical: "middle" };
  headerRow.height = 24;

  for (const [index, group] of report.groups.entries()) {
    for (const row of group.rows) {
      worksheet.addRow({
        schoolName: row.schoolName,
        gradeTitle: row.gradeTitle,
        classTitle: row.classTitle,
        studentCount: row.studentCount,
      });
    }

    const subtotalRow = worksheet.addRow({
      schoolName: "إجمالي المدرسة",
      studentCount: group.totalStudents,
    });
    subtotalRow.font = { bold: true };

    if (index < report.groups.length - 1) {
      worksheet.addRow([]);
    }
  }

  if (report.groups.length > 0) {
    worksheet.addRow([]);
  }

  const totalRow = worksheet.addRow({
    schoolName: "الإجمالي العام",
    studentCount: report.summary.studentCount,
  });
  totalRow.font = { bold: true, size: 13 };

  worksheet.eachRow((row) => {
    row.alignment = { ...row.alignment, vertical: "middle" };
    row.getCell(4).alignment = { horizontal: "center", vertical: "middle" };
  });
  worksheet.autoFilter = { from: "A1", to: "D1" };

  return Buffer.from(await workbook.xlsx.writeBuffer());
}
