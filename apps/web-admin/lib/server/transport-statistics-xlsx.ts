import "server-only";

import ExcelJS from "exceljs";

import type { TransportStatisticsReport } from "./transport-statistics";

export async function buildTransportStatisticsWorkbook(report: TransportStatisticsReport) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Takween";
  workbook.created = new Date();

  const worksheet = workbook.addWorksheet("تقرير النقل", {
    views: [{ rightToLeft: true, state: "frozen", ySplit: 1 }],
  });
  worksheet.columns = [
    { header: "المدرسة", key: "schoolName", width: 28 },
    { header: "الخط", key: "routeTitle", width: 28 },
    { header: "اسم المشرف", key: "supervisorNames", width: 30 },
    { header: "اسم السائق", key: "driverName", width: 24 },
    { header: "عدد طلاب النقل", key: "studentCount", width: 18 },
  ];

  const headerRow = worksheet.getRow(1);
  headerRow.font = { bold: true };
  headerRow.alignment = { horizontal: "center", vertical: "middle" };
  headerRow.height = 24;

  for (const [index, group] of report.groups.entries()) {
    group.rows.forEach((row) => {
      worksheet.addRow({
        schoolName: row.schoolName,
        routeTitle: row.routeTitle,
        supervisorNames: row.supervisorNames,
        driverName: row.driverName,
        studentCount: row.studentCount,
      });
    });
    const subtotalRow = worksheet.addRow({
      schoolName: "إجمالي المدرسة",
      studentCount: group.totalStudents,
    });
    subtotalRow.font = { bold: true };

    if (index < report.groups.length - 1) worksheet.addRow([]);
  }

  if (report.groups.length > 0) worksheet.addRow([]);
  const totalRow = worksheet.addRow({
    schoolName: "الإجمالي العام",
    studentCount: report.summary.studentCount,
  });
  totalRow.font = { bold: true, size: 13 };

  worksheet.eachRow((row) => {
    row.alignment = { ...row.alignment, vertical: "middle", wrapText: true };
    row.getCell(5).alignment = { horizontal: "center", vertical: "middle" };
  });
  worksheet.autoFilter = { from: "A1", to: "E1" };

  return Buffer.from(await workbook.xlsx.writeBuffer());
}
