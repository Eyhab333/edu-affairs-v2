import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  where,
} from "firebase/firestore";

import { db } from "@/lib/firebase";

export type WorkDocumentationFieldType =
  | "text"
  | "textarea"
  | "number"
  | "date"
  | "select"
  | "radio"
  | "table";

export type WorkDocumentationColumn = {
  key: string;
  label: string;
  type?: Exclude<WorkDocumentationFieldType, "table" | "textarea" | "radio">;
  options?: string[];
};

export type WorkDocumentationRow = Record<string, string | number>;

export type WorkDocumentationField = {
  key: string;
  label: string;
  type: WorkDocumentationFieldType;
  options?: string[];
  columns?: WorkDocumentationColumn[];
  defaultValue?: string | number;
  defaultRows?: WorkDocumentationRow[];
};

export type WorkDocumentationSection = {
  title: string;
  fields: WorkDocumentationField[];
};

export type WorkDocumentationRoleGroup =
  | "ACTIVITY"
  | "COUNSELOR"
  | "PRINCIPAL"
  | "VICE_PRINCIPAL";

export type WorkDocumentationInstanceMode = "SINGLE" | "MULTIPLE";

export type WorkDocumentationTemplate = {
  key: string;
  title: string;
  roleGroup: WorkDocumentationRoleGroup;
  isSecret?: boolean;
  instanceMode: WorkDocumentationInstanceMode;
  sections: WorkDocumentationSection[];
};

export type WorkDocumentationData = Record<
  string,
  string | number | WorkDocumentationRow[]
>;

export type WorkDocumentationContext = {
  schoolId: string;
  academicYearId: string;
  academicYearTitle: string;
  termId: string;
  termTitle: string;
};

export type WorkDocumentationRecord = {
  id: string;
  templateKey: string;
  templateTitle: string;
  instanceId?: string;
  instanceMode: WorkDocumentationInstanceMode;
  data: WorkDocumentationData;
  createdAt: number;
  updatedAt: number;
};

const RATING_FOUR = ["ممتاز", "جيد", "مقبول", "ضعيف"];
const RATING_THREE = ["جيد", "متوسط", "ضعيف"];
const YES_NO = ["نعم", "لا"];
const ZERO_TO_FOUR = ["0", "1", "2", "3", "4"];

const text = (key: string, label: string): WorkDocumentationField => ({
  key,
  label,
  type: "text",
});
const textarea = (key: string, label: string): WorkDocumentationField => ({
  key,
  label,
  type: "textarea",
});
const number = (key: string, label: string): WorkDocumentationField => ({
  key,
  label,
  type: "number",
});
const date = (key: string, label: string): WorkDocumentationField => ({
  key,
  label,
  type: "date",
});
const select = (
  key: string,
  label: string,
  options: string[],
): WorkDocumentationField => ({ key, label, type: "select", options });
const radio = (
  key: string,
  label: string,
  options: string[],
): WorkDocumentationField => ({ key, label, type: "radio", options });
const table = (
  key: string,
  label: string,
  columns: WorkDocumentationColumn[],
  defaultRows?: WorkDocumentationRow[],
): WorkDocumentationField => ({
  key,
  label,
  type: "table",
  columns,
  defaultRows,
});
const section = (
  title: string,
  fields: WorkDocumentationField[],
): WorkDocumentationSection => ({ title, fields });

const MULTIPLE_TEMPLATE_KEYS = new Set([
  "radio-program-evaluation",
  "radio-program-final-report",
  "activity-program-card",
  "trip-visit-report",
  "activity-program-followup-report",
  "students-activity-attendance",
  "activity-program-remedial-plan",
  "activity-program-execution-followup",
  "student-case-notification",
  "confidential-case-study",
  "guardian-comments-on-teacher",
  "daily-substitution-distribution",
  "staff-circulars-acknowledgement",
  "morning-late-students",
  "behavioral-violation-pledge",
]);

const template = (
  key: string,
  title: string,
  roleGroup: WorkDocumentationRoleGroup,
  sections: WorkDocumentationSection[],
  isSecret = false,
): WorkDocumentationTemplate => ({
  key,
  title,
  roleGroup,
  sections,
  isSecret,
  instanceMode: MULTIPLE_TEMPLATE_KEYS.has(key) ? "MULTIPLE" : "SINGLE",
});

const activityTemplates: WorkDocumentationTemplate[] = [
  template("radio-program-evaluation", "استمارة تقييم برنامج إذاعي", "ACTIVITY", [
    section("بيانات البرنامج", [
      text("grade", "الصف"),
      text("day", "اليوم"),
      number("studentCount", "عدد الطلبة"),
      date("date", "التاريخ"),
      text("teacher", "المعلم/ة"),
      number("minutes", "عدد الدقائق"),
    ]),
    section(
      "التقييم",
      [
        "جودة المحتوى وملاءمته للطلاب",
        "تنوع المواضيع والمضامين",
        "جودة الصوت",
        "مهارات التقديم",
        "تنظيم البرنامج والفقرات",
        "إدارة الوقت والزمن",
        "تفاعل الطلاب",
        "مشاركة الطلاب في الإعداد والتقديم",
        "التجديد والابتكار",
        "تأثير البرنامج على الطلاب والمجتمع المدرسي",
        "تحقيق الأهداف التعليمية والتربوية",
      ].map((label, index) => radio(`evaluation_${index + 1}`, label, RATING_FOUR)),
    ),
  ]),
  template("radio-program-final-report", "التقرير الختامي للبرنامج الإذاعي", "ACTIVITY", [
    section("التقرير", [
      select("period", "الفترة", ["أسبوعي", "شهري", "فصلي"]),
      text("implementationOwner", "مسؤول التنفيذ"),
      number("daysCount", "عدد الأيام"),
      number("teachersCount", "إجمالي المعلمين المنفذين"),
      number("minutesTotal", "إجمالي الدقائق"),
      number("classesTotal", "إجمالي الحصص"),
      number("specialProgramsCount", "عدد البرامج الإذاعية النوعية"),
      textarea("generalGoal", "الهدف العام"),
      textarea("indicator", "مؤشر"),
      textarea("positives", "الإيجابيات"),
      textarea("challenges", "التحديات"),
      textarea("aspirations", "التطلعات والتحسين"),
      textarea("achievementIndicator", "مؤشر الإنجاز"),
      textarea("evidence", "شواهد الإنجاز"),
    ]),
  ]),
  template("activity-program-timeline", "التوزيع الزمني لبرامج النشاط", "ACTIVITY", [
    section("برامج النشاط", [
      table("rows", "البرامج", [
        { key: "field", label: "المجال" },
        { key: "program", label: "البرنامج" },
        { key: "sessionsCount", label: "عدد الحصص", type: "number" },
        { key: "teacher", label: "المعلم/ة" },
      ]),
    ]),
  ]),
  template("activity-program-card", "بطاقة تنفيذ برنامج نشاط", "ACTIVITY", [
    section("بيانات البرنامج", [
      text("programName", "اسم البرنامج"),
      text("field", "المجال"),
      number("sessionsCount", "عدد حصص البرنامج"),
      text("startDay", "بداية التنفيذ: اليوم"),
      text("startWeek", "بداية التنفيذ: الأسبوع"),
      date("startDate", "بداية التنفيذ: التاريخ"),
      text("endDay", "نهاية التنفيذ: اليوم"),
      text("endWeek", "نهاية التنفيذ: الأسبوع"),
      date("endDate", "نهاية التنفيذ: التاريخ"),
      text("grade", "الصف"),
      text("teacher", "المعلم المنفذ"),
      number("studentsCount", "عدد الطلبة المشاركين"),
      number("disabledParticipantsCount", "عدد المشاركين من ذوي الإعاقة"),
      number("guardiansCount", "عدد أولياء الأمور المشاركين"),
      radio("madrasatiPlatform", "تنفيذ عبر منصة مدرستي", [
        "بنك الإثراءات",
        "التطوير الذاتي",
        "قيمنا الغالية",
        "نادي القراءة",
      ]),
      number("communityPartnershipsCount", "عدد الشراكات المجتمعية"),
      textarea("communityPartnerships", "أسماء الشراكات"),
      textarea("notes", "ملاحظات"),
    ]),
  ]),
  template("trip-visit-report", "تقرير تنفيذ الرحلة/الزيارة", "ACTIVITY", [
    section("بيانات الرحلة", [
      text("educationAdministration", "الإدارة التعليمية"),
      text("tripLocation", "مكان الرحلة"),
      radio("tripScope", "نطاق الرحلة", ["داخل الإدارة", "خارج الإدارة"]),
      text("time", "الساعة"),
      text("day", "اليوم"),
      date("date", "التاريخ"),
      text("stage", "المرحلة"),
      number("studentsCount", "عدد الطلبة"),
      number("supervisorsCount", "عدد المشرفين"),
      radio("gender", "الفئة", ["بنين", "بنات"]),
      textarea("goals", "أهداف الرحلة"),
      textarea("mainResults", "أهم النتائج"),
    ]),
    section("التقييم", [
      table("evaluationRows", "عناصر التقييم", [
        { key: "item", label: "العنصر" },
        { key: "rating", label: "التقييم", type: "select", options: RATING_THREE },
        { key: "notes", label: "ملاحظات" },
      ], [
        "ملاءمة المكان",
        "ملاءمة التاريخ",
        "وضوح الأهداف",
        "المتعة والفائدة",
        "تنوع البرامج",
        "زيادة الخبرة",
        "مناسبة النقل",
        "الأمن والسلامة",
      ].map((item) => ({ item, rating: "", notes: "" }))),
      table("goalAchievementRows", "تحقق الأهداف", [
        { key: "field", label: "المجال" },
        { key: "goal", label: "الهدف" },
        { key: "level", label: "المستوى", type: "select", options: ZERO_TO_FOUR },
      ], [
        "المواطنة والحياة",
        "الثقافة والفنون",
        "الرياضة والصحة",
        "العلوم والتقنية",
        "النشاط الكشفي",
      ].map((field) => ({ field, goal: "", level: "" }))),
      textarea("positives", "أبرز الإيجابيات"),
      textarea("recommendations", "المقترحات والتوصيات"),
    ]),
    section("المرافقون", [
      table("companions", "المرافقون", [
        { key: "name", label: "الاسم" },
        { key: "nationalId", label: "السجل المدني" },
      ]),
    ]),
  ]),
  template("activity-program-followup-report", "تقرير متابعة تنفيذ برامج النشاط الطلابي", "ACTIVITY", [
    section("بيانات المتابعة", [
      text("period", "الفترة"),
      date("date", "التاريخ"),
      table("rows", "البرامج", [
        { key: "program", label: "البرنامج" },
        { key: "field", label: "المجال" },
        { key: "programSessions", label: "عدد حصص البرنامج", type: "number" },
        { key: "grade", label: "الصف" },
        { key: "completedSessions", label: "عدد الحصص المنفذة", type: "number" },
        { key: "teacher", label: "المعلم المنفذ" },
        { key: "beneficiariesCount", label: "عدد المستفيدين", type: "number" },
        { key: "location", label: "مقر التنفيذ" },
        { key: "notes", label: "ملاحظات" },
      ]),
    ]),
  ]),
  template("honor-deserving", "تكريم المستحقين", "ACTIVITY", [
    section("المستحقون", [
      table("rows", "قائمة التكريم", [
        { key: "name", label: "الاسم" },
        { key: "category", label: "الفئة", type: "select", options: ["طالب/ة", "معلم/ة", "إداري/ة", "ولي أمر", "أخرى"] },
        { key: "participationType", label: "نوع المشاركة" },
        { key: "honorMethod", label: "أسلوب التكريم" },
      ]),
    ]),
  ]),
  template("school-radio-plan", "خطة برنامج الإذاعة المدرسية", "ACTIVITY", [
    section("الخطة", [
      table("rows", "برامج الإذاعة", [
        { key: "week", label: "الأسبوع" },
        { key: "day", label: "اليوم" },
        { key: "date", label: "التاريخ", type: "date" },
        { key: "grade", label: "الصف" },
        { key: "studentsCount", label: "عدد الطلبة", type: "number" },
        { key: "topic", label: "الموضوع" },
        { key: "owner", label: "المسؤول" },
      ]),
    ]),
  ]),
  template("activity-program-execution-plan", "خطة تنفيذ برامج النشاط الطلابي", "ACTIVITY", [
    section("الخطة", [
      table("rows", "البرامج", [
        { key: "field", label: "المجال" },
        { key: "program", label: "البرنامج" },
        { key: "sessionsCount", label: "عدد الحصص", type: "number" },
        { key: "execution", label: "التنفيذ", type: "select", options: ["نفذ", "لم ينفذ"] },
        { key: "notes", label: "الملاحظات" },
      ]),
    ]),
  ]),
  template("students-activity-attendance", "حضور الطلاب في برامج النشاط", "ACTIVITY", [
    section("بيانات الحضور", [
      text("period", "الفترة"),
      date("date", "التاريخ"),
      table("rows", "الحضور", [
        { key: "studentName", label: "اسم الطالب" },
        { key: "grade", label: "الصف" },
        { key: "activityType", label: "نوع النشاط", type: "select", options: ["برامج", "فترات لاصفية"] },
        { key: "programName", label: "اسم البرنامج" },
        { key: "session", label: "الحصة" },
        { key: "teacher", label: "المعلم المنفذ" },
        { key: "programSessionsTotal", label: "إجمالي حصص البرنامج", type: "number" },
        { key: "notes", label: "ملاحظات" },
      ]),
    ]),
  ]),
  template("activity-program-remedial-plan", "خطة علاجية لبرامج النشاط", "ACTIVITY", [
    section("الخطة العلاجية", [
      text("period", "الفترة"),
      date("date", "التاريخ"),
      table("rows", "الإجراءات", [
        { key: "gap", label: "وجه القصور" },
        { key: "actions", label: "الإجراءات العلاجية" },
        { key: "duration", label: "المدة الزمنية" },
        { key: "owner", label: "المسؤول" },
        { key: "measurementTool", label: "أداة مؤشر القياس" },
        { key: "notes", label: "ملاحظات" },
      ]),
    ]),
  ]),
  template("activity-program-execution-followup", "متابعة تنفيذ برامج النشاط", "ACTIVITY", [
    section("المتابعة", [
      text("period", "الفترة"),
      date("date", "التاريخ"),
      table("rows", "برامج النشاط", [
        { key: "field", label: "المجال" },
        { key: "program", label: "البرنامج" },
        { key: "teacher", label: "المعلم المنفذ" },
        { key: "executionLevel", label: "مستوى التنفيذ", type: "select", options: ["تم", "لم يتم"] },
        { key: "grade", label: "الصف" },
        { key: "beneficiariesCount", label: "عدد المستفيدين", type: "number" },
        { key: "week", label: "الأسبوع" },
        { key: "day", label: "اليوم" },
        { key: "date", label: "التاريخ", type: "date" },
      ]),
    ]),
  ]),
];

const counselorTemplates: WorkDocumentationTemplate[] = [
  template("orientation-week-program", "برنامج الأسبوع التمهيدي", "COUNSELOR", [
    section("الأسبوع التمهيدي", [
      table("rows", "البرنامج", [
        { key: "day", label: "اليوم" },
        { key: "date", label: "التاريخ", type: "date" },
        { key: "program", label: "البرنامج/الأنشطة" },
        { key: "departureTime", label: "وقت الانصراف" },
      ], ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس"].map((day) => ({
        day,
        date: "",
        program: "",
        departureTime: "",
      }))),
    ]),
  ]),
  template("orientation-week-report", "تقرير إعداد وتنفيذ الأسبوع التمهيدي", "COUNSELOR", [
    section("بيانات المدرسة", [
      text("schoolName", "اسم المدرسة"),
      text("schoolPhone", "هاتف المدرسة"),
      number("studentsCount", "عدد طلاب المدرسة"),
      number("repeatingFirstGradeCount", "المعيدين بالصف الأول"),
      number("newFirstGradeCount", "المستجدين"),
      number("committeeMembersCount", "أعضاء اللجنة"),
      number("participatingTeachersCount", "المعلمين المشاركين"),
    ]),
    section("مرحلة الإعداد", [
      ...[1, 2, 3, 4, 5].map((item) => radio(`preparation_${item}`, `بند الإعداد ${item}`, YES_NO)),
    ]),
    section("مرحلة التنفيذ", [
      ...[1, 2, 3, 4, 5, 6].map((item) => radio(`implementation_${item}`, `بند التنفيذ ${item}`, YES_NO)),
      textarea("difficulties", "الصعوبات"),
      number("casesCount", "عدد الحالات"),
      textarea("caseTypes", "نوع الحالات"),
      textarea("procedures", "الإجراءات الوقائية والعلاجية"),
    ]),
    section("أعضاء اللجنة", [
      table("committeeMembers", "الأعضاء", [
        { key: "name", label: "الاسم" },
        { key: "job", label: "العمل بالمدرسة" },
      ]),
    ]),
  ]),
  template("medical-cases-register", "كشف بالحالات المرضية", "COUNSELOR", [
    section("الحالات", [
      table("rows", "كشف الحالات", [
        { key: "studentName", label: "اسم الطالب" },
        { key: "grade", label: "الصف" },
        { key: "homePhone", label: "هاتف المنزل" },
        { key: "workPhone", label: "هاتف العمل" },
        { key: "mobilePhone", label: "الجوال" },
        { key: "medicalCase", label: "وصف الحالة المرضية" },
        { key: "requiredAction", label: "الإجراء المطلوب عند وقوع الحالة" },
        { key: "recommendations", label: "التوصيات" },
      ]),
    ]),
  ]),
  template("student-case-notification", "إبلاغ عن حالة طالب", "COUNSELOR", [
    section("الحالات", [
      table("rows", "بلاغات الحالات", [
        { key: "studentName", label: "اسم الطالب" },
        { key: "grade", label: "الصف" },
        { key: "caseDescription", label: "وصف الحالة" },
        { key: "requiredAction", label: "الإجراء المطلوب" },
        { key: "recommendations", label: "التوصيات" },
      ]),
    ]),
  ]),
  template("student-guidance-programs", "البرامج الإرشادية المقدمة للطالب", "COUNSELOR", [
    section("البرامج", [
      table("rows", "البرامج الإرشادية", [
        { key: "programName", label: "اسم البرنامج" },
        { key: "implementationDate", label: "تاريخ التنفيذ", type: "date" },
        { key: "occasion", label: "المناسبة" },
        { key: "beneficiariesCount", label: "عدد المستفيدين", type: "number" },
      ]),
    ]),
  ]),
  template("semester-guidance-report", "التقرير الفصلي للإرشاد الطلابي", "COUNSELOR", [
    section("المتأخرون دراسيًا", [
      number("lateStudentsCount", "عدد الطلاب"),
      textarea("latePrograms", "البرامج المنفذة"),
      number("lateBeneficiaries", "المستفيدون"),
      textarea("lateResponse", "مدى الاستجابة"),
      textarea("lateDifficulties", "الصعوبات"),
      textarea("lateSuggestions", "المقترحات"),
    ]),
    section("المتفوقون", [
      number("excellentStudentsCount", "عدد الطلاب"),
      textarea("excellentPrograms", "البرامج المنفذة"),
      number("excellentBeneficiaries", "المستفيدون"),
      textarea("excellentResponse", "مدى الاستجابة"),
      textarea("excellentDifficulties", "الصعوبات"),
      textarea("excellentSuggestions", "المقترحات"),
    ]),
    section("التأخر والغياب", [
      number("absenceStudentsCount", "عدد الطلاب"),
      textarea("absencePrograms", "البرامج المنفذة"),
      number("absenceBeneficiaries", "المستفيدون"),
      textarea("absenceResponse", "مدى الاستجابة"),
      textarea("absenceDifficulties", "الصعوبات"),
      textarea("absenceSuggestions", "المقترحات"),
    ]),
    section("الحالات السلوكية", [
      table("behavioralCases", "الحالات", [
        { key: "caseDescription", label: "وصف الحالة" },
        { key: "recurrence", label: "التكرار", type: "number" },
        { key: "procedures", label: "الإجراءات" },
        { key: "effectiveness", label: "فاعليتها" },
        { key: "status", label: "الحالة", type: "select", options: ["مستمر", "انتهى"] },
      ]),
      textarea("behavioralDifficulties", "الصعوبات"),
      textarea("behavioralSuggestions", "المقترحات"),
    ]),
    section("البرامج والنشرات التوعوية", [
      number("awarenessProgramsCount", "عدد البرامج المنفذة"),
      number("awarenessBeneficiaries", "المستفيدون"),
      textarea("awarenessPrograms", "البرامج والنشرات"),
      textarea("awarenessResponse", "مدى الاستجابة"),
      textarea("awarenessDifficulties", "الصعوبات"),
      textarea("awarenessSuggestions", "المقترحات"),
    ]),
  ]),
  template("guardian-visits", "زيارات أولياء الأمور", "COUNSELOR", [
    section("الزيارات", [
      table("rows", "الزيارات", [
        { key: "guardianName", label: "اسم ولي الأمر" },
        { key: "studentName", label: "اسم الطالب" },
        { key: "relationship", label: "صلته بالطالب" },
        { key: "grade", label: "الصف" },
        { key: "purpose", label: "الغرض من الزيارة" },
        { key: "visitDate", label: "تاريخ الزيارة", type: "date" },
      ]),
    ]),
  ]),
  template("confidential-case-study", "دراسة حالة — سري", "COUNSELOR", [
    section("بيانات الطالب والحالة", [
      text("studentName", "اسم الطالب"),
      text("grade", "الصف"),
      text("caseSource", "مصدر الحالة"),
      textarea("referralReason", "سبب التحويل"),
      text("initialClassification", "التصنيف المبدئي"),
    ]),
    section("الأسرة والحالة", [
      textarea("familyData", "بيانات الأسرة"),
      textarea("healthPhysicalStatus", "الحالة الصحية والجسمية"),
      textarea("academicStatus", "الحالة الدراسية"),
      textarea("familyRelationships", "العلاقات الأسرية"),
      textarea("socialRelationships", "العلاقات الاجتماعية"),
      textarea("schoolRelationships", "العلاقات المدرسية"),
    ]),
    section("الطالب والبيئة", [
      textarea("aspirations", "الطموحات والاهتمامات والدافعية"),
      textarea("familyView", "رؤية الأسرة"),
      textarea("studentView", "رؤية الطالب"),
      textarea("anger", "الغضب"),
      textarea("teachers", "المعلمون"),
      textarea("handlingAggression", "التعامل مع الاعتداء"),
      textarea("medications", "الأدوية"),
    ]),
    section("الخطة العلاجية", [
      textarea("problemDescription", "وصف المشكلة"),
      textarea("initialDiagnosis", "التشخيص الأولي"),
      textarea("treatmentPlanProcedures", "إجراءات الخطة العلاجية"),
      textarea("improvementExtent", "مدى التحسن"),
      textarea("reasons", "الأسباب"),
      textarea("recommendations", "التوصيات"),
    ]),
  ], true),
  template("confidential-family-circumstances", "الظروف الأسرية الخاصة — سري", "COUNSELOR", [
    section("الظروف الأسرية", [
      table("rows", "الحالات", [
        { key: "studentName", label: "اسم الطالب" },
        { key: "grade", label: "الصف" },
        { key: "familyProblem", label: "المشكلة الأسرية" },
      ]),
    ]),
  ], true),
  template("health-circumstances", "الظروف الصحية وكيفية التعامل معها", "COUNSELOR", [
    section("الظروف الصحية", [
      table("rows", "الحالات", [
        { key: "studentName", label: "اسم الطالب" },
        { key: "grade", label: "الصف" },
        { key: "healthProblem", label: "المشكلة الصحية" },
        { key: "howToHandle", label: "كيفية التعامل معها" },
      ]),
    ]),
  ]),
  template("morning-lineup-late-followup", "متابعة المتأخرين عن الاصطفاف", "COUNSELOR", [
    section("المتابعة", [
      table("rows", "المتأخرون", [
        { key: "studentName", label: "اسم الطالب" },
        { key: "grade", label: "الصف" },
        { key: "referralDate", label: "تاريخ التحويل", type: "date" },
        { key: "actionTaken", label: "الإجراء المتخذ" },
      ]),
    ]),
  ]),
  template("skills-struggling-referrals", "تحويل المتعثرين في المهارات", "COUNSELOR", [
    section("التحويلات", [
      table("rows", "المتعثرون", [
        { key: "studentName", label: "اسم الطالب" },
        { key: "teacher", label: "المعلم" },
        { key: "date", label: "التاريخ", type: "date" },
        { key: "classSection", label: "الصف والفصل" },
        { key: "skill", label: "المهارة" },
      ]),
    ]),
  ]),
  template("behavioral-problem-referrals", "المحولون بسبب المشاكل السلوكية", "COUNSELOR", [
    section("التحويلات", [
      table("rows", "الحالات", [
        { key: "studentName", label: "اسم الطالب" },
        { key: "grade", label: "الصف" },
        { key: "referringTeacher", label: "المعلم المحول" },
        { key: "referralReasons", label: "أسباب التحويل" },
        { key: "caseWork", label: "العمل مع الحالة" },
      ]),
    ]),
  ]),
  template("vice-principal-referrals", "تحويلات وكيل المدرسة للموجه", "COUNSELOR", [
    section("التحويلات", [
      table("rows", "التحويلات", [
        { key: "studentName", label: "اسم الطالب" },
        { key: "grade", label: "الصف" },
        { key: "purpose", label: "الغرض من التحويل" },
        { key: "action", label: "الإجراء" },
        { key: "date", label: "التاريخ", type: "date" },
      ]),
    ]),
  ]),
  template("guardian-comments-on-teacher", "ملاحظات أولياء الأمور على المعلم", "COUNSELOR", [
    section("بيانات المعلم", [
      text("teacherName", "اسم المعلم"),
      table("rows", "الملاحظات", [
        { key: "comment", label: "الملاحظة" },
        { key: "submittedBy", label: "مقدم الملاحظة" },
        { key: "date", label: "التاريخ", type: "date" },
      ]),
    ]),
  ]),
];

const principalTemplates: WorkDocumentationTemplate[] = [
  template("daily-substitution-distribution", "توزيع الانتظار اليومي", "PRINCIPAL", [
    section("البيانات", [
      text("absentTeacher", "المعلم الغائب"),
      text("day", "اليوم"),
      date("date", "التاريخ"),
      text("responsibleName", "اسم المسؤول"),
      table("rows", "التوزيع", [
        { key: "period", label: "الحصة" },
        { key: "classroom", label: "الفصل" },
        { key: "subject", label: "المادة" },
        { key: "substituteTeacher", label: "المعلم المنتظر" },
        { key: "notes", label: "ملاحظات" },
      ]),
    ]),
  ]),
  template("daily-supervision", "الإشراف اليومي", "PRINCIPAL", [
    section("الإشراف", [
      text("week", "الأسبوع"),
      text("day", "اليوم"),
      date("date", "التاريخ"),
      text("teacherName", "اسم المعلم"),
      text("supervisionLocation", "موقع الإشراف"),
    ]),
  ]),
  template("daily-duty", "المناوبة اليومية", "PRINCIPAL", [
    section("المناوبة", [
      text("week", "الأسبوع"),
      text("day", "اليوم"),
      date("date", "التاريخ"),
      text("teacherName", "اسم المعلم"),
    ]),
  ]),
  template("school-purchases", "مشتريات المدرسة", "PRINCIPAL", [
    section("المشتريات", [
      text("item", "البند"),
      number("amountNumber", "إجمالي المبلغ رقمًا"),
      text("amountWords", "إجمالي المبلغ كتابة"),
      table("rows", "تفاصيل المشتريات", [
        { key: "item", label: "الصنف/البيان" },
        { key: "quantity", label: "الكمية", type: "number" },
        { key: "unitPrice", label: "السعر الإفرادي", type: "number" },
        { key: "totalPrice", label: "السعر الإجمالي", type: "number" },
        { key: "date", label: "التاريخ", type: "date" },
        { key: "invoiceNumber", label: "رقم الفاتورة" },
        { key: "invoiceIssuer", label: "جهة الفاتورة" },
      ]),
    ]),
  ]),
  template("incoming-register", "سجل الوارد", "PRINCIPAL", [
    section("الوارد", [
      text("incomingNumber", "رقم الوارد"),
      date("date", "التاريخ"),
      text("type", "النوع"),
      text("source", "الجهة الواردة منها"),
      textarea("attachments", "المرفقات"),
      textarea("subject", "الموضوع"),
      text("fileNumber", "رقم الملف"),
    ]),
  ]),
  template("staff-circulars-acknowledgement", "اطلاع الموظفين على التعاميم", "PRINCIPAL", [
    section("التعميم", [
      text("circularNumber", "رقم التعميم"),
      date("date", "التاريخ"),
      text("issuedBy", "صادر من"),
      textarea("subject", "بخصوص"),
      table("staff", "قائمة الموظفين", [
        { key: "name", label: "اسم الموظف" },
      ]),
    ]),
  ]),
  template("outgoing-register", "سجل الصادر", "PRINCIPAL", [
    section("الصادر", [
      text("outgoingNumber", "رقم الصادر"),
      date("date", "التاريخ"),
      text("type", "النوع"),
      text("destination", "الجهة الصادرة منها المعاملة"),
      textarea("attachments", "المرفقات"),
      textarea("subject", "الموضوع"),
      text("fileNumber", "رقم الملف"),
    ]),
  ]),
  template("transaction-handover", "توديع المعاملات", "PRINCIPAL", [
    section("المعاملة", [
      text("transactionNumber", "رقم المعاملة"),
      text("type", "النوع"),
      textarea("attachments", "المرفقات"),
      textarea("subject", "الموضوع"),
      text("sentTo", "الجهة المرسل لها"),
      text("recipientName", "اسم المستلم"),
      text("day", "اليوم"),
      date("receivedAt", "تاريخ الاستلام"),
    ]),
  ]),
  template("staff-permission", "استئذان الموظف", "PRINCIPAL", [
    section("الاستئذان", [
      text("employeeName", "اسم الموظف"),
      text("day", "اليوم"),
      date("date", "التاريخ"),
      text("exitTime", "وقت الخروج"),
      textarea("exitReason", "مبررات الخروج"),
      text("returnTime", "وقت العودة"),
      textarea("notes", "ملاحظات"),
    ]),
  ]),
  template("classroom-visits-plan", "خطة الزيارات الصفية", "PRINCIPAL", [
    section("بيانات المعلم", [
      text("teacherName", "اسم المعلم"),
      text("specialization", "التخصص"),
      radio("execution", "التنفيذ", ["في الموعد", "تعديل"]),
    ]),
    section("الزيارة الأولى", [
      text("firstDay", "اليوم"),
      date("firstDate", "التاريخ"),
      text("firstSubject", "المادة"),
      text("firstPeriod", "الحصة"),
      text("firstClassroom", "الفصل"),
    ]),
    section("الزيارة الثانية", [
      text("secondDay", "اليوم"),
      date("secondDate", "التاريخ"),
      text("secondSubject", "المادة"),
      text("secondPeriod", "الحصة"),
      text("secondClassroom", "الفصل"),
    ]),
  ]),
];

const vicePrincipalTemplates: WorkDocumentationTemplate[] = [
  template("morning-late-students", "المتأخرون صباحًا", "VICE_PRINCIPAL", [
    section("المتأخرون", [
      text("day", "اليوم"),
      date("date", "التاريخ"),
      table("rows", "الطلاب", [
        { key: "studentName", label: "اسم الطالب" },
        { key: "grade", label: "الصف" },
        { key: "lateness", label: "مقدار التأخر" },
      ]),
    ]),
  ]),
  template("behavioral-violation-pledge", "تعهد مخالفة سلوكية", "VICE_PRINCIPAL", [
    section("التعهد", [
      text("studentName", "اسم الطالب"),
      text("grade", "الصف"),
      text("violationDay", "يوم المخالفة"),
      date("violationDate", "تاريخ المخالفة"),
      text("violationDegree", "درجة المخالفة"),
      textarea("violationDescription", "وصف المخالفة"),
      text("guardianName", "اسم ولي الأمر"),
      textarea("guardianNotification", "بيانات إبلاغ ولي الأمر"),
    ]),
  ]),
  template("class-leaders", "رواد الفصول", "VICE_PRINCIPAL", [
    section("رواد الفصول", [
      table("rows", "الفصول", [
        { key: "classroom", label: "الفصل" },
        { key: "leaderName", label: "اسم رائد الفصل" },
      ]),
    ]),
  ]),
  template("student-complaints-register", "سجل شكاوى الطلاب", "VICE_PRINCIPAL", [
    section("الشكاوى", [
      table("rows", "سجل الشكاوى", [
        { key: "studentName", label: "اسم الطالب" },
        { key: "grade", label: "الصف" },
        { key: "day", label: "اليوم" },
        { key: "date", label: "التاريخ", type: "date" },
        { key: "problem", label: "المشكلة" },
        { key: "actionTaken", label: "الإجراء المتخذ" },
      ]),
    ]),
  ]),
  template("class-monitors", "عرفاء الفصول", "VICE_PRINCIPAL", [
    section("عرفاء الفصول", [
      table("rows", "الفصول", [
        { key: "classroom", label: "الفصل" },
        { key: "monitor", label: "عريف الفصل" },
        { key: "deputyMonitor", label: "نائب العريف" },
      ]),
    ]),
  ]),
];

export const WORK_DOCUMENTATION_TEMPLATES = [
  ...activityTemplates,
  ...counselorTemplates,
  ...principalTemplates,
  ...vicePrincipalTemplates,
];

const ROLE_GROUPS: Record<WorkDocumentationRoleGroup, string[]> = {
  ACTIVITY: ["ACTIVITY_COORD"],
  COUNSELOR: ["BOYS_STUDENT_GUIDE", "GIRLS_STUDENT_COUNSELOR"],
  PRINCIPAL: ["BOYS_PRINCIPAL", "GIRLS_PRINCIPAL", "KG_PRINCIPAL"],
  VICE_PRINCIPAL: [
    "BOYS_VP",
    "BOYS_STUDENTS_VP",
    "BOYS_TEACHERS_VP",
    "GIRLS_VP",
    "KG_VP",
  ],
};

export function canAccessWorkDocumentation(roles: string[]) {
  return roles.some((role) =>
    Object.values(ROLE_GROUPS).some((roleKeys) => roleKeys.includes(role)),
  );
}

export function getWorkDocumentationRole(roles: string[]) {
  return roles.find((role) => canAccessWorkDocumentation([role])) ?? null;
}

export function getWorkDocumentationTemplates(roleKey: string) {
  const roleGroup = (Object.entries(ROLE_GROUPS).find(([, roleKeys]) =>
    roleKeys.includes(roleKey),
  )?.[0] ?? null) as WorkDocumentationRoleGroup | null;

  if (!roleGroup) return [];

  return WORK_DOCUMENTATION_TEMPLATES.filter(
    (item) => item.roleGroup === roleGroup,
  );
}

export function getWorkDocumentationTemplate(
  roleKey: string,
  templateKey: string,
) {
  return getWorkDocumentationTemplates(roleKey).find(
    (item) => item.key === templateKey,
  );
}

export function getWorkDocumentationInstanceMode(
  templateDefinition: WorkDocumentationTemplate,
) {
  return templateDefinition.instanceMode;
}

export function getInitialWorkDocumentationData(
  templateDefinition: WorkDocumentationTemplate,
  savedData?: WorkDocumentationData,
) {
  const result: WorkDocumentationData = {};

  templateDefinition.sections.forEach((itemSection) => {
    itemSection.fields.forEach((field) => {
      const savedValue = savedData?.[field.key];

      if (field.type === "table") {
        result[field.key] = Array.isArray(savedValue)
          ? savedValue
          : (field.defaultRows ?? []).map((row) => ({ ...row }));
        return;
      }

      result[field.key] =
        typeof savedValue === "string" || typeof savedValue === "number"
          ? savedValue
          : (field.defaultValue ?? "");
    });
  });

  return result;
}

function normalizeInputValue(
  value: string | number | undefined,
  type: WorkDocumentationFieldType,
) {
  if (type !== "number" || value === "" || value === undefined) {
    return value ?? "";
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : "";
}

export function normalizeWorkDocumentationData(
  templateDefinition: WorkDocumentationTemplate,
  value: WorkDocumentationData,
) {
  const normalized: WorkDocumentationData = {};

  templateDefinition.sections.forEach((itemSection) => {
    itemSection.fields.forEach((field) => {
      if (field.type === "table") {
        const currentValue = value[field.key];
        const rows = Array.isArray(currentValue) ? currentValue : [];
        normalized[field.key] = rows.map((row) =>
          Object.fromEntries(
            (field.columns ?? []).map((column) => [
              column.key,
              normalizeInputValue(row[column.key], column.type ?? "text"),
            ]),
          ),
        );
        return;
      }

      normalized[field.key] = normalizeInputValue(value[field.key] as string | number, field.type);
    });
  });

  return normalized;
}

export function createWorkDocumentationTableRow(
  field: WorkDocumentationField,
) {
  return Object.fromEntries(
    (field.columns ?? []).map((column) => [column.key, ""]),
  ) as WorkDocumentationRow;
}

export function resolveWorkDocumentationSchoolId(params: {
  schoolIds: string[];
  scopedSchoolId?: string;
  requestedSchoolId?: string | null;
}) {
  if (
    params.requestedSchoolId &&
    params.schoolIds.includes(params.requestedSchoolId)
  ) {
    return params.requestedSchoolId;
  }

  if (
    params.scopedSchoolId &&
    params.schoolIds.includes(params.scopedSchoolId)
  ) {
    return params.scopedSchoolId;
  }

  return params.schoolIds[0] ?? "";
}

function asString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function asNumber(value: unknown) {
  return typeof value === "number" ? value : 0;
}

export async function loadWorkDocumentationContext(params: {
  orgId: string;
  schoolId: string;
  academicYearId: string;
  academicYearTitle?: string;
  termId: string;
  termTitle?: string;
}): Promise<WorkDocumentationContext | null> {
  if (!params.orgId || !params.schoolId || !params.academicYearId || !params.termId) {
    return null;
  }

  return {
    schoolId: params.schoolId,
    academicYearId: params.academicYearId,
    academicYearTitle: params.academicYearTitle || params.academicYearId,
    termId: params.termId,
    termTitle: params.termTitle || params.termId,
  };
}

export function getWorkDocumentationRecordId(params: {
  personId: string;
  schoolId: string;
  academicYearId: string;
  termId: string;
  templateKey: string;
  instanceId?: string;
}) {
  return [
    "wd",
    params.personId,
    params.schoolId,
    params.academicYearId,
    params.termId,
    params.templateKey,
    ...(params.instanceId ? [params.instanceId] : []),
  ]
    .map((part) => encodeURIComponent(part))
    .join("__");
}

export async function loadWorkDocumentationRecord(params: {
  orgId: string;
  personId: string;
  schoolId: string;
  academicYearId: string;
  termId: string;
  templateKey: string;
  instanceId?: string;
}): Promise<WorkDocumentationRecord | null> {
  const recordId = getWorkDocumentationRecordId(params);
  const snapshot = await getDoc(
    doc(db, "orgs", params.orgId, "workDocumentation", recordId),
  );

  if (!snapshot.exists()) return null;

  const record = snapshot.data();
  return {
    id: snapshot.id,
    templateKey: asString(record.templateKey),
    templateTitle: asString(record.templateTitle),
    instanceId: asString(record.instanceId) || undefined,
    instanceMode: record.instanceMode === "MULTIPLE" ? "MULTIPLE" : "SINGLE",
    data:
      record.data && typeof record.data === "object"
        ? (record.data as WorkDocumentationData)
        : {},
    createdAt: asNumber(record.createdAt),
    updatedAt: asNumber(record.updatedAt),
  };
}

export async function listWorkDocumentationRecords(params: {
  orgId: string;
  personId: string;
  roleKey: string;
  schoolId: string;
  academicYearId: string;
  termId: string;
  templateKey?: string;
}): Promise<WorkDocumentationRecord[]> {
  const snapshot = await getDocs(
    query(
      collection(db, "orgs", params.orgId, "workDocumentation"),
      where("personId", "==", params.personId),
      where("roleKey", "==", params.roleKey),
      where("schoolId", "==", params.schoolId),
    ),
  );

  return snapshot.docs
    .filter((item) => {
      const record = item.data();
      return (
        record.academicYearId === params.academicYearId &&
        record.termId === params.termId &&
        (!params.templateKey || record.templateKey === params.templateKey)
      );
    })
    .map((item) => {
      const record = item.data();
      return {
        id: item.id,
        templateKey: asString(record.templateKey),
        templateTitle: asString(record.templateTitle),
        instanceId: asString(record.instanceId) || undefined,
        instanceMode:
          record.instanceMode === "MULTIPLE" ? "MULTIPLE" : "SINGLE",
        data:
          record.data && typeof record.data === "object"
            ? (record.data as WorkDocumentationData)
            : {},
        createdAt: asNumber(record.createdAt),
        updatedAt: asNumber(record.updatedAt),
      } satisfies WorkDocumentationRecord;
    })
    .filter((record) => record.templateKey)
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function saveWorkDocumentationRecord(params: {
  orgId: string;
  schoolId: string;
  academicYearId: string;
  termId: string;
  personId: string;
  roleKey: string;
  template: WorkDocumentationTemplate;
  data: WorkDocumentationData;
  createdAt?: number;
  instanceId?: string;
  instanceMode?: WorkDocumentationInstanceMode;
}) {
  const now = Date.now();
  const instanceMode = params.instanceMode ?? params.template.instanceMode;

  if (instanceMode === "MULTIPLE" && !params.instanceId) {
    throw new Error("يتطلب التوثيق المتعدد معرفًا مستقلًا.");
  }

  const recordId = getWorkDocumentationRecordId({
    ...params,
    templateKey: params.template.key,
    instanceId: instanceMode === "MULTIPLE" ? params.instanceId : undefined,
  });

  await setDoc(doc(db, "orgs", params.orgId, "workDocumentation", recordId), {
    orgId: params.orgId,
    schoolId: params.schoolId,
    academicYearId: params.academicYearId,
    termId: params.termId,
    personId: params.personId,
    roleKey: params.roleKey,
    templateKey: params.template.key,
    templateTitle: params.template.title,
    ...(instanceMode === "MULTIPLE"
      ? {
          instanceId: params.instanceId,
          instanceMode,
        }
      : {}),
    data: params.data,
    createdAt: params.createdAt ?? now,
    updatedAt: now,
  });

  return {
    createdAt: params.createdAt ?? now,
    updatedAt: now,
  };
}
