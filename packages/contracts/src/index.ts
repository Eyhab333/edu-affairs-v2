import { z } from "zod";

type SchemaMap = Record<string, z.ZodTypeAny>;

/**
 * Shared primitives
 */
const TimestampMsSchema = z.number().int().nonnegative();
const NonEmptyStringSchema = z.string().min(1);

const EmailStringSchema = z.union([z.string().email(), z.literal("")]);
const UrlStringSchema = z.union([z.string().url(), z.literal("")]);

const AuditFieldsSchema = z.object({
  createdAt: TimestampMsSchema.optional(),
  updatedAt: TimestampMsSchema.optional(),
});

/**
 * Core enums
 */
export const Direction = z.enum(["rtl", "ltr"]);
export type Direction = z.infer<typeof Direction>;

export const OrgStatus = z.enum(["active", "inactive", "archived"]);
export type OrgStatus = z.infer<typeof OrgStatus>;

export const SchoolType = z.enum(["KG", "PRIMARY"]);
export type SchoolType = z.infer<typeof SchoolType>;

export const SchoolTrack = z.enum(["BOYS", "GIRLS", "MIXED"]);
export type SchoolTrack = z.infer<typeof SchoolTrack>;

/**
 * أبقينا GenderKey للتوافق مع الاستيرادات الحالية
 */
export const GenderKey = SchoolTrack;
export type GenderKey = z.infer<typeof GenderKey>;

export const AcademicStructureMode = z.enum(["school_based", "org_based"]);
export type AcademicStructureMode = z.infer<typeof AcademicStructureMode>;

export const ProductModuleKey = z.enum([
  "CORE",
  "SCHOOLS",
  "ACADEMICS",
  "DIRECTORY",
  "ASSIGNMENTS",
  "CASES",
  "EVALUATIONS",
  "DISPLAY",
  "COMMS",
  "VIRTUAL_CLASSES",
  "PARENT_APP",
  "ANALYTICS",
]);
export type ProductModuleKey = z.infer<typeof ProductModuleKey>;

/**
 * School-level modules
 */
export const ModuleKey = z.enum([
  "CORE",
  "COMMS",
  "ATTENDANCE",
  "STUDENT_CASES",
  "TEACHER_EVAL",
  "CLASSROOM_DISPLAY",
  "GAMIFICATION",
  "PARENT_NOTIFICATIONS",
  "VIRTUAL_CLASSES",
  "KG_DAILY",
  "PRIMARY_ASSESSMENTS",
  "TRANSPORT",
]);
export type ModuleKey = z.infer<typeof ModuleKey>;

export const SchoolModuleKey = ModuleKey;
export type SchoolModuleKey = z.infer<typeof SchoolModuleKey>;

export const MembershipScopeType = z.enum([
  "ORG",
  "SCHOOL",
  "ACADEMIC_YEAR",
  "GRADE",
  "CLASS",
  "STREAM",
  "SUBJECT",
  "ROUTE",
  "COMMITTEE",
]);
export type MembershipScopeType = z.infer<typeof MembershipScopeType>;

export const MembershipRole = z.enum([
  /**
   * Access / admin roles
   */
  "platform_owner",
  "platform_admin",
  "org_owner",
  "org_admin",
  "school_admin",
  "school_manager",
  "staff",
  "teacher",
  "viewer",

  /**
   * Org / leadership
   */
  "ORG_CHAIR",
  "ORG_CEO",
  "ORG_CEO_ASSIST",
  "ORG_SUPERVISION_HEAD",

  /**
   * Shared operational roles
   */
  "ADMIN_SUPERVISOR",
  "ADMIN_ASSISTANT",
  "MEDIA_SPECIALIST",
  "HR_SPECIALIST",
  "ACTIVITY_COORD",
  "SCHOOL_MONITOR",

  /**
   * Boys school roles
   */
  "BOYS_SUPERVISION_HEAD",
  "BOYS_PRINCIPAL",
  "BOYS_EDU_VP",
  "BOYS_STUDENT_GUIDE",
  "BOYS_STUDENTS_VP",
  "BOYS_TEACHERS_VP",
  "BOYS_EDU_SUPERVISOR",
  "BOYS_TEACHER",

  /**
   * Girls school roles
   */
  "GIRLS_PRINCIPAL",
  "GIRLS_VP",
  "GIRLS_STUDENT_COUNSELOR",
  "GIRLS_EDU_SUPERVISOR",
  "GIRLS_TEACHER",

  /**
   * KG roles
   */
  "KG_EDU_SUPERVISOR",
  "KG_VALUES_COORD",
  "KG_PRINCIPAL",
  "KG_VP",
  "KG_TEACHER",

  /**
   * Transport / guardians
   */
  "BUS_SUPERVISOR",
  "GUARDIAN",
]);
export type MembershipRole = z.infer<typeof MembershipRole>;

/**
 * أبقينا الاسم RoleKey للاستخدام الدلالي عند الحاجة
 */
export const RoleKey = MembershipRole;
export type RoleKey = z.infer<typeof RoleKey>;

/**
 * Organization
 */
export const OrgBrandingSchema = z.object({
  logoUrl: z.string().optional().default(""),
  primaryColor: z.string().optional().default(""),
  secondaryColor: z.string().optional().default(""),
});
export type OrgBranding = z.infer<typeof OrgBrandingSchema>;

export const OrgLocaleSchema = z.object({
  language: z.string().min(1).default("ar"),
  direction: Direction.default("rtl"),
  timezone: z.string().min(1).default("Asia/Riyadh"),
  countryCode: z.string().min(1).default("SA"),
  currency: z.string().min(1).default("SAR"),
});
export type OrgLocale = z.infer<typeof OrgLocaleSchema>;

export const OrgFeaturesSchema = z.object({
  enabledModules: z
    .array(ProductModuleKey)
    .default(["CORE", "SCHOOLS", "ACADEMICS"]),
});
export type OrgFeatures = z.infer<typeof OrgFeaturesSchema>;

export const OrgSettingsSchema = z.object({
  academicStructureMode: AcademicStructureMode.default("school_based"),
  allowMultipleActiveAcademicYears: z.boolean().default(false),
  supportedSchoolTypes: z.array(SchoolType).default(["KG", "PRIMARY"]),
});
export type OrgSettings = z.infer<typeof OrgSettingsSchema>;

export const OrgContactSchema = z.object({
  email: EmailStringSchema.optional().default(""),
  phone: z.string().optional().default(""),
  website: UrlStringSchema.optional().default(""),
});
export type OrgContact = z.infer<typeof OrgContactSchema>;

const OrgSchemaBase = AuditFieldsSchema.merge(
  z.object({
    id: NonEmptyStringSchema,
    slug: z.string().optional().default(""),
    /**
     * ندعم nameAr و name للتوافق مع البيانات الحالية
     */
    nameAr: z.string().optional().default(""),
    nameEn: z.string().optional().default(""),
    name: z.string().optional().default(""),
    shortName: z.string().optional().default(""),
    status: OrgStatus.default("active"),
    branding: OrgBrandingSchema.default({}),
    locale: OrgLocaleSchema.default({}),
    features: OrgFeaturesSchema.default({}),
    settings: OrgSettingsSchema.default({}),
    contact: OrgContactSchema.default({}),
  }),
);

export const OrgSchema = OrgSchemaBase.superRefine((data, ctx) => {
  if (!data.nameAr && !data.name) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "يجب توفير nameAr أو name على الأقل",
      path: ["nameAr"],
    });
  }
});

export type Org = z.infer<typeof OrgSchema>;

/**
 * User / Membership / Access
 */
export const UserProfileSchema = AuditFieldsSchema.merge(
  z.object({
    uid: NonEmptyStringSchema,
    displayName: NonEmptyStringSchema,
    email: EmailStringSchema.default(""),
    phone: z.string().optional().default(""),
    photoUrl: z.string().optional().default(""),
    personId: z.string().optional().default(""),
    isDisabled: z.boolean().default(false),
  }),
);
export type UserProfile = z.infer<typeof UserProfileSchema>;

export const MembershipScopesSchema = z.object({
  schoolIds: z.array(z.string()).default([]),
  gradeIds: z.array(z.string()).default([]),
  classIds: z.array(z.string()).default([]),
  subjectKeys: z.array(z.string()).default([]),
  routeIds: z.array(z.string()).default([]),
  canAccessAllSchools: z.boolean().default(false),
});
export type MembershipScopes = z.infer<typeof MembershipScopesSchema>;

export const MembershipPermissionsSchema = z.object({
  manageOrg: z.boolean().default(false),
  manageSchools: z.boolean().default(false),
  manageAcademicYears: z.boolean().default(false),
  manageGrades: z.boolean().default(false),
  manageClasses: z.boolean().default(false),
  manageSubjects: z.boolean().default(false),
  manageUsers: z.boolean().default(false),
  manageDirectory: z.boolean().default(false),
  manageAssignments: z.boolean().default(false),
  manageCases: z.boolean().default(false),
  manageEvaluations: z.boolean().default(false),
  manageDisplay: z.boolean().default(false),
  sendNotifications: z.boolean().default(false),
});
export type MembershipPermissions = z.infer<typeof MembershipPermissionsSchema>;

const MembershipSchemaBase = AuditFieldsSchema.merge(
  z.object({
    /**
     * id اختياري لأن بعض السياقات تستخدم docId خارجيًا
     */
    id: z.string().optional().default(""),
    uid: z.string().optional().default(""),
    personId: z.string().optional().default(""),
    orgId: NonEmptyStringSchema,

    /**
     * ندعم role و roleKey للتوافق مع الحالتين:
     * - عضويات الوصول الحالية
     * - العضويات التشغيلية في المصادر
     */
    role: MembershipRole.optional(),
    roleKey: MembershipRole.optional(),

    title: z.string().optional().default(""),
    department: z.string().optional().default(""),

    /**
     * نطاق سريع مبسط
     */
    scopes: MembershipScopesSchema.default({}),
    permissions: MembershipPermissionsSchema.default({}),

    /**
     * نطاق تشغيلي أدق
     */
    scopeType: MembershipScopeType.optional(),
    scopeId: z.string().optional().default(""),

    /**
     * روابط تشغيلية أدق للتقييم والإدارة
     * تساعد في توزيع التقييمات بشكل موجّه بدل الاعتماد فقط على الدور العام
     */
    directEvaluatorPersonId: z.string().optional().default(""),
    supervisorPersonId: z.string().optional().default(""),
    managerPersonId: z.string().optional().default(""),
    principalPersonId: z.string().optional().default(""),
    vicePrincipalPersonId: z.string().optional().default(""),

    /**
     * تاريخ العضوية
     */
    startAt: TimestampMsSchema.optional(),
    endAt: TimestampMsSchema.optional(),

    isActive: z.boolean().default(true),
  }),
);

export const MembershipSchema = MembershipSchemaBase.superRefine(
  (data, ctx) => {
    if (!data.uid && !data.personId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "يجب توفير uid أو personId على الأقل",
        path: ["uid"],
      });
    }

    if (!data.role && !data.roleKey) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "يجب توفير role أو roleKey على الأقل",
        path: ["role"],
      });
    }
  },
);

export type Membership = z.infer<typeof MembershipSchema>;

export const UserAccessProfileSchema = AuditFieldsSchema.merge(
  z.object({
    uid: NonEmptyStringSchema,
    orgId: NonEmptyStringSchema,
    personId: z.string().optional().default(""),
    roleKeys: z.array(MembershipRole).default([]),
    schoolIds: z.array(z.string()).default([]),
    isOrgAdmin: z.boolean().default(false),
    isActive: z.boolean().default(true),
    permissions: MembershipPermissionsSchema.default({}),
  }),
);
export type UserAccessProfile = z.infer<typeof UserAccessProfileSchema>;

/**
 * School
 */
export const DisplayPrivacyLevel = z.enum([
  "AVATARS_ONLY",
  "NICKNAME",
  "FULL_NAME",
]);
export type DisplayPrivacyLevel = z.infer<typeof DisplayPrivacyLevel>;

export const SchoolProfileSchema = z.object({
  schoolType: SchoolType,
  enabledModules: z.array(ModuleKey).default(["CORE", "COMMS"]),
  track: SchoolTrack.optional(),
  /**
   * أبقيناه للتوافق مع الاستعمالات الحالية
   */
  gender: GenderKey.optional(),
  stageLabel: z.string().optional(),
  displayPrivacyPolicy: DisplayPrivacyLevel.optional(),
});
export type SchoolProfile = z.infer<typeof SchoolProfileSchema>;

export const SchoolContactSchema = z.object({
  phone: z.string().optional().default(""),
  email: EmailStringSchema.optional().default(""),
  address: z.string().optional().default(""),
});
export type SchoolContact = z.infer<typeof SchoolContactSchema>;

export const SchoolSchema = AuditFieldsSchema.merge(
  z.object({
    id: NonEmptyStringSchema,
    orgId: NonEmptyStringSchema,
    name: NonEmptyStringSchema,
    slug: z.string().optional().default(""),
    profile: SchoolProfileSchema,
    contact: SchoolContactSchema.optional(),
    isArchived: z.boolean().default(false),
  }),
);
export type School = z.infer<typeof SchoolSchema>;

/**
 * Academics
 */
export const AcademicYearSchema = AuditFieldsSchema.merge(
  z.object({
    id: NonEmptyStringSchema,
    schoolId: NonEmptyStringSchema,
    orgId: NonEmptyStringSchema,
    title: NonEmptyStringSchema,
    startsAt: TimestampMsSchema,
    endsAt: TimestampMsSchema,
    isActive: z.boolean().default(false),
  }),
);
export type AcademicYear = z.infer<typeof AcademicYearSchema>;

export const AcademicTermStatus = z.enum(["PLANNED", "ACTIVE", "ENDED"]);
export type AcademicTermStatus = z.infer<typeof AcademicTermStatus>;

export const AcademicTermSchema = AuditFieldsSchema.merge(
  z.object({
    id: NonEmptyStringSchema,
    orgId: NonEmptyStringSchema,
    academicYearId: NonEmptyStringSchema,

    title: NonEmptyStringSchema,
    shortTitle: z.string().optional().default(""),

    order: z.number().int().min(1).default(1),

    status: AcademicTermStatus.default("PLANNED"),
    isCurrent: z.boolean().default(false),

    startsAt: z.number().optional(),
    endsAt: z.number().optional(),
  }),
);

export type AcademicTerm = z.infer<typeof AcademicTermSchema>;

export const AcademicTermContextFieldsSchema = z.object({
  termId: z.string().optional().default(""),
  termTitle: z.string().optional().default(""),
  termShortTitle: z.string().optional().default(""),
});

/**
 * Academic streams / programs
 * المسارات الأكاديمية مثل: عام / تحفيظ / عالمي
 */

export const AcademicStreamKind = z.enum([
  "GENERAL",
  "QURAN",
  "INTERNATIONAL",
  "CUSTOM",
]);
export type AcademicStreamKind = z.infer<typeof AcademicStreamKind>;

export const AcademicStreamSchema = AuditFieldsSchema.merge(
  z.object({
    id: NonEmptyStringSchema,
    orgId: NonEmptyStringSchema,
    schoolId: NonEmptyStringSchema,
    academicYearId: NonEmptyStringSchema,

    code: z.string().optional().default(""),
    title: NonEmptyStringSchema,
    kind: AcademicStreamKind.default("GENERAL"),

    /**
     * مثال:
     * - العام
     * - التحفيظ
     * - العالمي
     */
    shortLabel: z.string().optional().default(""),

    order: z.number().int().min(0).default(0),
    isActive: z.boolean().default(true),
    isArchived: z.boolean().default(false),
  }),
);
export type AcademicStream = z.infer<typeof AcademicStreamSchema>;

export const GradeSchema = AuditFieldsSchema.merge(
  z.object({
    id: NonEmptyStringSchema,
    orgId: NonEmptyStringSchema,
    schoolId: NonEmptyStringSchema,
    academicYearId: NonEmptyStringSchema,
    code: z.string().optional().default(""),
    title: NonEmptyStringSchema,
    order: z.number().int().min(0),
    isArchived: z.boolean().default(false),
  }),
);
export type Grade = z.infer<typeof GradeSchema>;

export const ClassSchema = AuditFieldsSchema.merge(
  z.object({
    id: NonEmptyStringSchema,
    orgId: NonEmptyStringSchema,
    schoolId: NonEmptyStringSchema,
    academicYearId: NonEmptyStringSchema,
    gradeId: z.string().optional(),

    /**
     * يحدد المسار الذي يتبع له الفصل
     * مثل: عام / تحفيظ / عالمي
     */
    streamId: z.string().optional().default(""),

    code: z.string().optional().default(""),
    title: NonEmptyStringSchema,

    /**
     * مثال:
     * أ / ب / ج / الكادي / الزهور
     */
    sectionLabel: z.string().optional().default(""),

    capacity: z.number().int().positive().optional(),
    order: z.number().int().min(0),
    isArchived: z.boolean().default(false),
  }),
);
export type Class = z.infer<typeof ClassSchema>;

export const SubjectSchema = AuditFieldsSchema.merge(
  z.object({
    id: NonEmptyStringSchema,
    orgId: NonEmptyStringSchema,
    schoolId: NonEmptyStringSchema,
    academicYearId: z.string().optional().default(""),

    code: z.string().optional().default(""),
    key: z.string().optional().default(""),
    title: NonEmptyStringSchema,

    /**
     * ربط اختياري بمسار محدد
     * مثال:
     * - مادة خاصة بالتحفيظ
     * - مادة عامة لكل المسارات
     */
    streamId: z.string().optional().default(""),

    /**
     * إن كانت المادة مشتركة على عدة فصول أو عدة مسارات
     */
    appliesToAllStreams: z.boolean().default(true),

    /**
     * مفيد خصوصًا في الروضات:
     * - قيم
     * - أركان
     * - قرآن
     * - أرقام
     */
    category: z.string().optional().default(""),
    order: z.number().int().min(0).default(0),
    isArchived: z.boolean().default(false),
  }),
);
export type Subject = z.infer<typeof SubjectSchema>;

/**
 * Class Subject Offerings
 * المادة المفعّلة داخل فصل محدد
 *
 * Subject = تعريف المادة
 * ClassSubjectOffering = تفعيل المادة داخل الفصل وإعداداتها
 * TeacherAssignment = إسناد الأشخاص على هذه المادة/الفصل
 */

export const ClassSubjectOfferingStatus = z.enum([
  "DRAFT",
  "ACTIVE",
  "PAUSED",
  "ENDED",
  "ARCHIVED",
]);
export type ClassSubjectOfferingStatus = z.infer<
  typeof ClassSubjectOfferingStatus
>;

export const ClassSubjectModuleKey = z.enum([
  "ASSESSMENTS",
  "LEARNING_LOSS",
  "HOMEWORK",
  "LESSON_PREP",
  "QUESTION_BANK",
  "CURRICULUM_PLAN",
  "RESOURCES",
  "GAMIFICATION",
  "VIRTUAL_CLASSES",
  "NOTES",
  "CUSTOM",
]);
export type ClassSubjectModuleKey = z.infer<typeof ClassSubjectModuleKey>;

export const LessonPrepReviewMode = z.enum([
  /**
   * لا يوجد اعتماد ولا إرسال.
   * يستخدم لو التحضير غير إلزامي أو مجرد حفظ داخلي.
   */
  "NONE",

  /**
   * المعلم يرسل التحضير ويُعتبر مكتملًا بدون اعتماد.
   */
  "SUBMIT_ONLY",

  /**
   * المعلم يرسل، ثم يحتاج اعتماد أو إعادة للتعديل.
   */
  "APPROVAL_REQUIRED",
]);
export type LessonPrepReviewMode = z.infer<typeof LessonPrepReviewMode>;

export const ClassSubjectGradingPolicySchema = z.object({
  defaultMaxScore: z.number().min(0).optional(),
  passingScore: z.number().min(0).optional(),

  /**
   * حدود الفاقد الافتراضية لهذه المادة داخل هذا الفصل.
   * يمكن للقالب نفسه أن يتجاوزها لاحقًا إن احتجنا.
   */
  learningLossThresholdScore: z.number().min(0).optional(),
  learningLossThresholdPercentage: z.number().min(0).max(100).optional(),

  /**
   * مفتاح سياسة درجات مخصصة لاحقًا.
   * مثال: PRIMARY_DEFAULT / KG_VALUES / CUSTOM
   */
  gradingScaleKey: z.string().optional().default(""),

  note: z.string().optional().default(""),
});
export type ClassSubjectGradingPolicy = z.infer<
  typeof ClassSubjectGradingPolicySchema
>;

export const ClassSubjectAssessmentPolicySchema = z.object({
  /**
   * قوالب القياس المسموحة لهذه المادة داخل هذا الفصل.
   */
  assessmentTemplateIds: z.array(z.string()).default([]),

  /**
   * قوالب المتابعة المسموحة لهذه المادة داخل هذا الفصل.
   */
  trackerTemplateIds: z.array(z.string()).default([]),

  /**
   * مفاتيح عامة للمرونة دون ربط مباشر بالـ enum في هذه النقطة من الملف.
   * مثال: PRIMARY_PERIODIC_1 / KG_MEASUREMENT_1 / CUSTOM
   */
  allowedAssessmentSlotKeys: z.array(z.string()).default([]),

  allowLearningLoss: z.boolean().default(true),
  requiresReview: z.boolean().default(false),

  note: z.string().optional().default(""),
});
export type ClassSubjectAssessmentPolicy = z.infer<
  typeof ClassSubjectAssessmentPolicySchema
>;

export const ClassSubjectCurriculumPolicySchema = z.object({
  curriculumPlanId: z.string().optional().default(""),
  questionBankId: z.string().optional().default(""),
  resourceFolderId: z.string().optional().default(""),

  lessonPrepRequired: z.boolean().default(false),

  /**
   * سياسة مراجعة/اعتماد تحضير الدروس داخل هذه المادة.
   *
   * NONE:
   * لا يوجد إرسال أو اعتماد.
   *
   * SUBMIT_ONLY:
   * المعلم يرسل التحضير ويُعتبر مكتملًا.
   *
   * APPROVAL_REQUIRED:
   * المعلم يرسل، ثم يحتاج اعتماد أو إعادة للتعديل.
   */
  lessonPrepReviewMode: LessonPrepReviewMode.default("APPROVAL_REQUIRED"),

  homeworkEnabled: z.boolean().default(false),
  resourcesEnabled: z.boolean().default(false),
  questionBankEnabled: z.boolean().default(false),

  note: z.string().optional().default(""),
});
export type ClassSubjectCurriculumPolicy = z.infer<
  typeof ClassSubjectCurriculumPolicySchema
>;

const ClassSubjectOfferingSchemaBase = AuditFieldsSchema.merge(
  z.object({
    id: NonEmptyStringSchema,

    orgId: NonEmptyStringSchema,
    schoolId: NonEmptyStringSchema,
    academicYearId: NonEmptyStringSchema,

    classId: NonEmptyStringSchema,
    gradeId: z.string().optional().default(""),
    streamId: z.string().optional().default(""),

    /**
     * المادة من الكتالوج.
     * subjectKey مهم للتشغيل السريع والتقارير.
     * subjectId مهم للربط الدقيق مع Subject.
     */
    subjectId: z.string().optional().default(""),
    subjectKey: z.string().optional().default(""),
    subjectTitleSnapshot: z.string().optional().default(""),

    /**
     * الاسم الظاهر داخل الفصل.
     * قد يختلف عن اسم Subject العام.
     */
    displayName: z.string().optional().default(""),
    shortLabel: z.string().optional().default(""),

    status: ClassSubjectOfferingStatus.default("ACTIVE"),
    isArchived: z.boolean().default(false),

    startAt: TimestampMsSchema.optional(),
    endAt: TimestampMsSchema.optional(),

    order: z.number().int().min(0).default(0),

    /**
     * Modules المفعّلة لهذه المادة داخل هذا الفصل.
     * مثال: واجبات، تحضير، قياسات، فاقد، موارد PDF.
     */
    enabledModuleKeys: z.array(ClassSubjectModuleKey).default(["ASSESSMENTS"]),

    gradingPolicy: ClassSubjectGradingPolicySchema.default({}),
    assessmentPolicy: ClassSubjectAssessmentPolicySchema.default({}),
    curriculumPolicy: ClassSubjectCurriculumPolicySchema.default({}),

    /**
     * مراجع مختصرة لتسهيل البحث.
     */
    curriculumPlanId: z.string().optional().default(""),
    questionBankId: z.string().optional().default(""),
    resourceFolderId: z.string().optional().default(""),

    note: z.string().optional().default(""),
    metadata: z.record(z.unknown()).default({}),
  }),
);

export const ClassSubjectOfferingSchema =
  ClassSubjectOfferingSchemaBase.superRefine((data, ctx) => {
    if (!data.subjectId && !data.subjectKey) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "يجب توفير subjectId أو subjectKey على الأقل",
        path: ["subjectKey"],
      });
    }

    if (
      typeof data.startAt === "number" &&
      typeof data.endAt === "number" &&
      data.endAt < data.startAt
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "endAt لا يمكن أن يكون قبل startAt",
        path: ["endAt"],
      });
    }
  });

export type ClassSubjectOffering = z.infer<typeof ClassSubjectOfferingSchema>;

/**
 * Directory
 */
export const PersonSchema = AuditFieldsSchema.merge(
  z.object({
    id: NonEmptyStringSchema,
    displayName: NonEmptyStringSchema,
    nationalId: z.string().optional(),
    phone: z.string().optional(),
    email: EmailStringSchema.optional().default(""),
  }),
);
export type Person = z.infer<typeof PersonSchema>;

export const StudentSchema = AuditFieldsSchema.merge(
  z.object({
    id: NonEmptyStringSchema,
    personId: NonEmptyStringSchema,
    orgId: NonEmptyStringSchema,
    isArchived: z.boolean().default(false),
  }),
);
export type Student = z.infer<typeof StudentSchema>;

export const GuardianSchema = AuditFieldsSchema.merge(
  z.object({
    id: NonEmptyStringSchema,
    personId: NonEmptyStringSchema,
    orgId: NonEmptyStringSchema,
    isArchived: z.boolean().default(false),
  }),
);
export type Guardian = z.infer<typeof GuardianSchema>;

export const GuardianRelationType = z.enum(["FATHER", "MOTHER", "OTHER"]);
export type GuardianRelationType = z.infer<typeof GuardianRelationType>;

export const GuardianLinkSchema = AuditFieldsSchema.merge(
  z.object({
    id: NonEmptyStringSchema,
    orgId: NonEmptyStringSchema,
    studentId: NonEmptyStringSchema,
    guardianId: NonEmptyStringSchema,
    relationType: GuardianRelationType.default("OTHER"),
    active: z.boolean().default(true),
    startAt: TimestampMsSchema.optional(),
    endAt: TimestampMsSchema.optional(),
  }),
);
export type GuardianLink = z.infer<typeof GuardianLinkSchema>;

/**
 * Enrollment / Assignments
 */
export const EnrollmentStatus = z.enum([
  "ACTIVE",
  "COMPLETED",
  "REPEATING",
  "TRANSFERRED",
  "WITHDRAWN",
  "SUSPENDED",
  "PENDING",
]);
export type EnrollmentStatus = z.infer<typeof EnrollmentStatus>;

export const StudentEnrollmentSchema = AuditFieldsSchema.merge(
  z.object({
    id: NonEmptyStringSchema,
    orgId: NonEmptyStringSchema,
    schoolId: NonEmptyStringSchema,
    academicYearId: NonEmptyStringSchema,
    studentId: NonEmptyStringSchema,
    gradeId: z.string().optional(),

    /**
     * المسار الأكاديمي للطالب
     * مثل: عام / تحفيظ / عالمي
     */
    streamId: z.string().optional().default(""),

    classId: z.string().optional(),
    status: EnrollmentStatus.default("ACTIVE"),
    startAt: TimestampMsSchema,
    endAt: TimestampMsSchema.optional(),
    promotionRunId: z.string().optional(),
  }),
);
export type StudentEnrollment = z.infer<typeof StudentEnrollmentSchema>;

/**
 * Student Assessments / Measurements
 * قياسات الطلاب الرسمية
 */

export const StudentAssessmentKind = z.enum([
  /**
   * KG legacy values
   * أبقيناها للتوافق مع أي بيانات/واجهات قديمة
   */
  "KG_TEACHER_MEASUREMENT",
  "KG_VP_MEASUREMENT",

  /**
   * KG official measurements
   * المستوى الأول: لا قياسات
   * المستوى الثاني: قياس أول + قياس ثاني
   * المستوى الثالث: قياس أول + قياس ثاني + قياس ثالث
   */
  "KG_MEASUREMENT_1",
  "KG_MEASUREMENT_2",
  "KG_MEASUREMENT_3",

  /**
   * KG values / corners assessments
   * قياسات مجالات القيم والأركان في الروضة
   */
  "KG_VALUES_ASSESSMENT",
  "KG_CORNERS_ASSESSMENT",

  /**
   * PRIMARY official assessments
   */
  "PRIMARY_DIAGNOSTIC_TEST",
  "PRIMARY_PERIODIC_TEST_1",
  "PRIMARY_PERIODIC_TEST_2",
  "PRIMARY_CENTRAL_MEASUREMENT_1",
  "PRIMARY_CENTRAL_MEASUREMENT_2",

  /**
   * Flexible / DIY
   */
  "CUSTOM_ASSESSMENT",
]);
export type StudentAssessmentKind = z.infer<typeof StudentAssessmentKind>;

export const StudentAssessmentSlot = z.enum([
  "KG_MEASUREMENT_1",
  "KG_MEASUREMENT_2",
  "KG_MEASUREMENT_3",

  "PRIMARY_DIAGNOSTIC",
  "PRIMARY_PERIODIC_1",
  "PRIMARY_PERIODIC_2",
  "PRIMARY_CENTRAL_1",
  "PRIMARY_CENTRAL_2",

  "CUSTOM",
]);
export type StudentAssessmentSlot = z.infer<typeof StudentAssessmentSlot>;

export const LearningLossSourceType = z.enum([
  /**
   * ناتج عن قياس رسمي
   */
  "ASSESSMENT_RECORD",

  /**
   * ناتج عن متابعة مستمرة
   */
  "TRACKER_ENTRY",

  /**
   * أنشئ يدويًا دون سجل مسبب
   */
  "MANUAL",
]);
export type LearningLossSourceType = z.infer<typeof LearningLossSourceType>;

export const StudentLearningLossPlanStatus = z.enum([
  "DRAFT",
  "ACTIVE",
  "IN_PROGRESS",
  "IMPROVED",
  "PARTIALLY_IMPROVED",
  "NOT_IMPROVED",
  "CLOSED",
  "CANCELLED",
]);
export type StudentLearningLossPlanStatus = z.infer<
  typeof StudentLearningLossPlanStatus
>;

export const LearningLossImprovementIndicator = z.enum([
  "UNKNOWN",
  "IMPROVED",
  "PARTIAL_IMPROVEMENT",
  "NO_IMPROVEMENT",
  "REGRESSED",
]);
export type LearningLossImprovementIndicator = z.infer<
  typeof LearningLossImprovementIndicator
>;

export const LearningLossSkillSeverity = z.enum([
  "LOW",
  "MEDIUM",
  "HIGH",
  "CRITICAL",
]);
export type LearningLossSkillSeverity = z.infer<
  typeof LearningLossSkillSeverity
>;

export const LearningLossActionStatus = z.enum([
  "PLANNED",
  "IN_PROGRESS",
  "DONE",
  "CANCELLED",
  "IN_PROGRESS",
]);
export type LearningLossActionStatus = z.infer<typeof LearningLossActionStatus>;

export const LearningLossSkillSchema = z.object({
  id: z.string().optional().default(""),
  title: NonEmptyStringSchema,
  description: z.string().optional().default(""),

  /**
   * مثال:
   * - قراءة
   * - كتابة
   * - أرقام
   * - قرآن
   * - مهارة اجتماعية
   */
  domain: z.string().optional().default(""),

  severity: LearningLossSkillSeverity.default("MEDIUM"),
});
export type LearningLossSkill = z.infer<typeof LearningLossSkillSchema>;

export const LearningLossRemediationActionSchema = z.object({
  id: z.string().optional().default(""),
  title: NonEmptyStringSchema,
  description: z.string().optional().default(""),
  status: LearningLossActionStatus.default("PLANNED"),
  dueAt: TimestampMsSchema.optional(),
  completedAt: TimestampMsSchema.optional(),
  note: z.string().optional().default(""),
});
export type LearningLossRemediationAction = z.infer<
  typeof LearningLossRemediationActionSchema
>;

export const StudentAssessmentStatus = z.enum([
  "DRAFT",
  "PUBLISHED",
  "LOCKED",
  "CANCELLED",
]);
export type StudentAssessmentStatus = z.infer<typeof StudentAssessmentStatus>;

export const AssessmentScoreType = z.enum(["NUMERIC", "LEVEL", "BOOLEAN"]);
export type AssessmentScoreType = z.infer<typeof AssessmentScoreType>;

/**
 * Shared operation primitives
 * بنية مشتركة لعمليات التشغيل اليومية
 */

export const OperationItemScoreValueType = z.enum([
  "NUMERIC",
  "LEVEL",
  "BOOLEAN",
  "TEXT",
  "RUBRIC",
]);
export type OperationItemScoreValueType = z.infer<
  typeof OperationItemScoreValueType
>;

export const OperationItemScoreSchema = z.object({
  itemKey: NonEmptyStringSchema,
  itemId: z.string().optional().default(""),
  itemTitle: NonEmptyStringSchema,

  category: z.string().optional().default(""),
  valueType: OperationItemScoreValueType.default("NUMERIC"),

  score: z.number().min(0).optional(),
  maxScore: z.number().min(0).optional(),
  weight: z.number().min(0).default(1),

  level: z.string().optional().default(""),
  valueText: z.string().optional().default(""),
  passed: z.boolean().optional(),

  note: z.string().optional().default(""),
  order: z.number().int().min(0).default(0),
});
export type OperationItemScore = z.infer<typeof OperationItemScoreSchema>;

/**
 * تعريف بند داخل القالب نفسه.
 *
 * هذا لا يحتوي درجة الطالب، بل يصف البند الذي سيظهر لاحقًا في جدول الإدخال.
 *
 * مثال:
 * - حرفان / الدرجة الكبرى 7
 * - كلمات / الدرجة الكبرى 8
 */
export const OperationTemplateItemSchema = z.object({
  itemKey: NonEmptyStringSchema,
  itemId: z.string().optional().default(""),
  itemTitle: NonEmptyStringSchema,

  category: z.string().optional().default(""),
  valueType: OperationItemScoreValueType.default("NUMERIC"),

  maxScore: z.number().min(0).optional(),
  weight: z.number().min(0).default(1),

  /**
   * هل يدخل هذا البند في حساب المجموع؟
   * في الغالب true.
   */
  affectsTotal: z.boolean().default(true),

  /**
   * هل البند إجباري عند الإدخال؟
   */
  required: z.boolean().default(true),

  description: z.string().optional().default(""),
  helpText: z.string().optional().default(""),

  order: z.number().int().min(0).default(0),
});
export type OperationTemplateItem = z.infer<typeof OperationTemplateItemSchema>;

export const OperationKind = z.enum([
  "STUDENT_ATTENDANCE",
  "STUDENT_MEASUREMENT",
  "STUDENT_TRACKER",
  "KG_VALUES_EVALUATION",
  "KG_CORNERS_EVALUATION",
  "KG_QURAN_TRACKER",
  "LEARNING_LOSS_FOLLOWUP",
  "STUDENT_HOMEWORK",
  "LESSON_PREP",
  "STUDENT_NOTES",
  "STUDENT_CASE_REFERRAL",
  "STUDENT_CASE_HANDLING",
  "STUDENT_GAMIFICATION",
  "STUDENT_ACTIVITY_MANAGEMENT",
  "VIRTUAL_CLASS",
  "TRANSPORT_ATTENDANCE",
  "STAFF_EVALUATION",
  "STAFF_OBSERVATION",
  "CUSTOM",
]);
export type OperationKind = z.infer<typeof OperationKind>;

export const OperationScopeType = z.enum([
  "ORG",
  "SCHOOL",
  "ACADEMIC_YEAR",
  "GRADE",
  "CLASS",
  "ROUTE",
  "PERSON",
  "PERSON_GROUP",
  "STUDENT",
  "CASE",
  "CUSTOM",
]);
export type OperationScopeType = z.infer<typeof OperationScopeType>;

export const OperationTargetKind = z.enum([
  "STUDENT",
  "STAFF",
  "CLASS",
  "ROUTE",
  "CASE",
  "BATCH",
  "PLAN",
  "NONE",
  "CUSTOM",
]);
export type OperationTargetKind = z.infer<typeof OperationTargetKind>;

export const OperationSourceType = z.enum([
  "OPERATIONAL_ASSIGNMENT",
  "TEACHER_ASSIGNMENT",
  "STUDENT_MEASUREMENT_BATCH",
  "STUDENT_ATTENDANCE_BATCH",
  "STUDENT_LEARNING_LOSS_PLAN",
  "QUESTION_BANK_ITEM",
  "STUDENT_HOMEWORK_ASSIGNMENT",
  "STUDENT_HOMEWORK_SUBMISSION",
  "SUBJECT_LESSON_PREP",
  "CLASSROOM_DISPLAY_SESSION",
  "VIRTUAL_CLASS_SESSION",
  "VIRTUAL_CLASS_ATTENDANCE_IMPORT",
  "STUDENT_CASE",
  "TRANSPORT_ATTENDANCE_BATCH",
  "EVALUATION_CYCLE",
  "EVALUATION_SUBMISSION",
  "CUSTOM",
]);
export type OperationSourceType = z.infer<typeof OperationSourceType>;

/**
 * Classroom Display
 * جلسة شاشة الفصل
 */

export const ClassroomDisplaySessionStatus = z.enum([
  "ACTIVE",
  "PAUSED",
  "ENDED",
  "CANCELLED",
  "EXPIRED",
]);
export type ClassroomDisplaySessionStatus = z.infer<
  typeof ClassroomDisplaySessionStatus
>;

export const ClassroomDisplayPrivacyMode = z.enum([
  "FULL_NAME",
  "NICKNAME",
  "INITIALS_ONLY",
  "AVATAR_ONLY",
  "DISPLAY_ALIAS",
  "ANONYMOUS_NUMBER",
]);
export type ClassroomDisplayPrivacyMode = z.infer<
  typeof ClassroomDisplayPrivacyMode
>;

export const ClassroomDisplayPhotoFallbackMode = z.enum([
  "INITIALS",
  "AVATAR",
  "ALIAS",
  "ANONYMOUS_NUMBER",
]);
export type ClassroomDisplayPhotoFallbackMode = z.infer<
  typeof ClassroomDisplayPhotoFallbackMode
>;

export const ClassroomDisplayThemeKey = z.enum([
  "STARS",
  "SPACE",
  "OCEAN",
  "FOREST",
  "STADIUM",
  "CANDY",
]);
export type ClassroomDisplayThemeKey = z.infer<typeof ClassroomDisplayThemeKey>;

export const ClassroomDisplaySessionSchema = AuditFieldsSchema.merge(
  z.object({
    id: NonEmptyStringSchema,

    orgId: NonEmptyStringSchema,
    schoolId: NonEmptyStringSchema,
    academicYearId: NonEmptyStringSchema,

    /**
     * سياق الفصل الدراسي.
     * مهم لكل السجلات التشغيلية والتقارير.
     */
    termId: NonEmptyStringSchema,
    termTitle: NonEmptyStringSchema,
    termShortTitle: NonEmptyStringSchema,

    /**
     * سياق الفصل والمادة.
     */
    classId: NonEmptyStringSchema,
    gradeId: z.string().optional().default(""),
    streamId: z.string().optional().default(""),

    subjectKey: z.string().optional().default(""),
    classSubjectOfferingId: z.string().optional().default(""),

    /**
     * من بدأ جلسة العرض.
     */
    startedByPersonId: NonEmptyStringSchema,
    startedByRoleKey: MembershipRole.optional(),

    /**
     * حالة الجلسة.
     */
    status: ClassroomDisplaySessionStatus.default("ACTIVE"),

    /**
     * إعدادات الخصوصية.
     *
     * showStudentPhotos = true لا يعني أن كل الصور ستظهر.
     * القرار النهائي لعرض صورة طالب معين يكون لاحقًا في domain
     * حسب موافقة ولي الأمر وسياسة المدرسة ووجود صورة.
     */
    privacyMode: ClassroomDisplayPrivacyMode.default("NICKNAME"),
    showStudentPhotos: z.boolean().default(false),
    photoFallbackMode: ClassroomDisplayPhotoFallbackMode.default("AVATAR"),

    /**
     * إعدادات محتوى الشاشة.
     */
    showLeaderboard: z.boolean().default(true),
    showGamificationFeed: z.boolean().default(true),
    showChallenge: z.boolean().default(false),
    showTimer: z.boolean().default(false),
    showLessonGoal: z.boolean().default(true),
    displayThemeKey: ClassroomDisplayThemeKey.default("STARS"),
    /**
     * محتوى اختياري يظهر في الشاشة.
     */
    lessonGoal: z.string().optional().default(""),
    encouragementMessage: z.string().optional().default(""),

    /**
     * توقيت الجلسة.
     */
    startedAt: TimestampMsSchema,
    endedAt: TimestampMsSchema.optional(),
    expiresAt: TimestampMsSchema.optional(),
    lastHeartbeatAt: TimestampMsSchema.optional(),

    isArchived: z.boolean().default(false),
  }),
);
export type ClassroomDisplaySession = z.infer<
  typeof ClassroomDisplaySessionSchema
>;

/**
 * Virtual Classes
 * الحصص الافتراضية
 */

export const VirtualClassProvider = z.enum([
  "GOOGLE_MEET",
  "ZOOM",
  "MICROSOFT_TEAMS",
  "EXTERNAL_LINK",
]);
export type VirtualClassProvider = z.infer<typeof VirtualClassProvider>;

export const VirtualClassProvisioningStatus = z.enum([
  "NOT_REQUESTED",
  "PENDING",
  "READY",
  "FAILED",
]);
export type VirtualClassProvisioningStatus = z.infer<
  typeof VirtualClassProvisioningStatus
>;

export const VirtualClassGoogleMeetProvisioningMode = z.enum([
  "TEACHER_CALENDAR",
  "FALLBACK_ORG_CALENDAR",
]);
export type VirtualClassGoogleMeetProvisioningMode = z.infer<
  typeof VirtualClassGoogleMeetProvisioningMode
>;

export const VirtualClassSessionStatus = z.enum([
  "DRAFT",
  "SCHEDULED",
  "LIVE",
  "ENDED",
  "ATTENDANCE_IMPORTED",
  "ATTENDANCE_REVIEWED",
  "CANCELLED",
]);
export type VirtualClassSessionStatus = z.infer<
  typeof VirtualClassSessionStatus
>;

export const VirtualClassAttendanceStatus = z.enum([
  "SCHEDULED",
  "JOIN_CLICKED",
  "ATTENDED",
  "LATE",
  "LEFT_EARLY",
  "ABSENT",
  "EXCUSED",
  "UNKNOWN",
]);
export type VirtualClassAttendanceStatus = z.infer<
  typeof VirtualClassAttendanceStatus
>;

export const VirtualClassAttendanceImportStatus = z.enum([
  "PENDING",
  "RUNNING",
  "SUCCESS",
  "PARTIAL_SUCCESS",
  "FAILED",
]);
export type VirtualClassAttendanceImportStatus = z.infer<
  typeof VirtualClassAttendanceImportStatus
>;

export const VirtualClassNotificationType = z.enum([
  "SESSION_SCHEDULED",
  "SESSION_REMINDER",
  "SESSION_STARTED",
  "SESSION_CANCELLED",
  "ATTENDANCE_ABSENCE_RECORDED",
  "RECORDING_AVAILABLE",
]);
export type VirtualClassNotificationType = z.infer<
  typeof VirtualClassNotificationType
>;

export const VirtualClassNotificationStatus = z.enum([
  "PENDING",
  "SENT",
  "FAILED",
  "SKIPPED",
]);
export type VirtualClassNotificationStatus = z.infer<
  typeof VirtualClassNotificationStatus
>;

export const VirtualClassSessionSchema = AuditFieldsSchema.merge(
  z.object({
    id: NonEmptyStringSchema,

    orgId: NonEmptyStringSchema,
    schoolId: NonEmptyStringSchema,
    academicYearId: NonEmptyStringSchema,

    /**
     * سياق الفصل الدراسي.
     */
    termId: NonEmptyStringSchema,
    termTitle: NonEmptyStringSchema,
    termShortTitle: NonEmptyStringSchema,

    /**
     * سياق الفصل والمادة.
     */
    classId: NonEmptyStringSchema,
    gradeId: z.string().optional().default(""),
    streamId: z.string().optional().default(""),

    subjectKey: z.string().optional().default(""),
    subjectTitle: z.string().optional().default(""),
    classSubjectOfferingId: z.string().optional().default(""),

    title: NonEmptyStringSchema,
    description: z.string().optional().default(""),

    provider: VirtualClassProvider.default("GOOGLE_MEET"),

    /**
     * حالة إنشاء وتجهيز رابط المزود الخارجي.
     * لا تخلط بينها وبين status؛
     * status = حالة الحصة نفسها
     * providerProvisioningStatus = حالة إنشاء الرابط/الاجتماع
     */
    providerProvisioningStatus:
      VirtualClassProvisioningStatus.default("NOT_REQUESTED"),

    providerProvisioningErrorCode: z.string().optional().default(""),
    providerProvisioningErrorMessage: z.string().optional().default(""),
    providerProvisionedAt: TimestampMsSchema.optional(),
    providerProvisioningUpdatedAt: TimestampMsSchema.optional(),

    /**
     * Google Meet / provider fields.
     */
    providerMeetingCode: z.string().optional().default(""),
    providerSpaceName: z.string().optional().default(""),
    providerConferenceRecordName: z.string().optional().default(""),

    /**
     * Google Calendar fields.
     */
    providerCalendarEventId: z.string().optional().default(""),
    providerCalendarId: z.string().optional().default(""),
    providerCalendarHtmlLink: z.string().optional().default(""),
    providerCalendarOwnerEmail: EmailStringSchema.optional().default(""),
    providerOrganizerEmail: EmailStringSchema.optional().default(""),

    /**
     * Idempotency key المستخدم عند طلب إنشاء Google Meet من Calendar API.
     */
    providerConferenceRequestId: z.string().optional().default(""),

    /**
     * كيف تم إنشاء Google Meet.
     */
    googleMeetProvisioningMode:
      VirtualClassGoogleMeetProvisioningMode.optional(),
    googleMeetFallbackReason: z.string().optional().default(""),

    joinUrl: UrlStringSchema.default(""),

    startsAt: TimestampMsSchema,
    endsAt: TimestampMsSchema,

    status: VirtualClassSessionStatus.default("SCHEDULED"),

    createdByPersonId: NonEmptyStringSchema,
    createdByRoleKey: MembershipRole.optional(),

    targetStudentIds: z.array(z.string()).default([]),
    targetCount: z.number().int().min(0).default(0),

    attendanceImportStatus: VirtualClassAttendanceImportStatus.optional(),
    attendanceImportedAt: TimestampMsSchema.optional(),

    attendanceReviewedAt: TimestampMsSchema.optional(),
    attendanceReviewedByPersonId: z.string().optional().default(""),

    recordingUrl: UrlStringSchema.optional().default(""),
    summaryText: z.string().optional().default(""),

    isArchived: z.boolean().default(false),
  }),
);
export type VirtualClassSession = z.infer<typeof VirtualClassSessionSchema>;

export const VirtualClassParticipantSchema = AuditFieldsSchema.merge(
  z.object({
    id: NonEmptyStringSchema,

    orgId: NonEmptyStringSchema,
    sessionId: NonEmptyStringSchema,

    studentId: NonEmptyStringSchema,
    guardianIds: z.array(z.string()).default([]),
    guardianUids: z.array(z.string()).default([]),

    joinToken: z.string().optional().default(""),
    joinClickedAt: TimestampMsSchema.optional(),
    joinClickedByGuardianId: z.string().optional().default(""),
    joinClickedDeviceId: z.string().optional().default(""),

    /**
     * بيانات الحضور من Google Meet أو المزود.
     */
    providerParticipantName: z.string().optional().default(""),
    providerParticipantEmail: EmailStringSchema.optional().default(""),
    providerParticipantId: z.string().optional().default(""),

    providerJoinAt: TimestampMsSchema.optional(),
    providerLeaveAt: TimestampMsSchema.optional(),
    providerDurationMinutes: z.number().min(0).optional(),

    platformJoinStatus: VirtualClassAttendanceStatus.default("SCHEDULED"),
    providerAttendanceStatus: VirtualClassAttendanceStatus.default("UNKNOWN"),
    finalAttendanceStatus: VirtualClassAttendanceStatus.default("UNKNOWN"),

    reviewedByPersonId: z.string().optional().default(""),
    reviewedAt: TimestampMsSchema.optional(),

    teacherNote: z.string().optional().default(""),
  }),
);
export type VirtualClassParticipant = z.infer<
  typeof VirtualClassParticipantSchema
>;

export const VirtualClassAttendanceImportSchema = AuditFieldsSchema.merge(
  z.object({
    id: NonEmptyStringSchema,

    orgId: NonEmptyStringSchema,
    sessionId: NonEmptyStringSchema,

    provider: VirtualClassProvider.default("GOOGLE_MEET"),

    providerConferenceRecordName: z.string().optional().default(""),

    importedAt: TimestampMsSchema.optional(),
    importedByPersonId: z.string().optional().default(""),

    matchedCount: z.number().int().min(0).default(0),
    unmatchedCount: z.number().int().min(0).default(0),
    rawParticipantCount: z.number().int().min(0).default(0),

    status: VirtualClassAttendanceImportStatus.default("PENDING"),
    errorMessage: z.string().optional().default(""),
  }),
);
export type VirtualClassAttendanceImport = z.infer<
  typeof VirtualClassAttendanceImportSchema
>;

export const VirtualClassNotificationLogSchema = AuditFieldsSchema.merge(
  z.object({
    id: NonEmptyStringSchema,

    orgId: NonEmptyStringSchema,
    sessionId: NonEmptyStringSchema,

    studentId: z.string().optional().default(""),
    guardianId: z.string().optional().default(""),

    type: VirtualClassNotificationType,
    title: NonEmptyStringSchema,
    body: z.string().optional().default(""),

    sentAt: TimestampMsSchema.optional(),
    status: VirtualClassNotificationStatus.default("PENDING"),

    errorMessage: z.string().optional().default(""),
  }),
);
export type VirtualClassNotificationLog = z.infer<
  typeof VirtualClassNotificationLogSchema
>;

// ********************

export const StudentMeasurementBatchKind = z.enum([
  "ASSESSMENT",
  "TRACKER",
  "KG_VALUES",
  "KG_CORNERS",
  "KG_QURAN",
  "LEARNING_LOSS_TRACKER",
  "CUSTOM",
]);
export type StudentMeasurementBatchKind = z.infer<
  typeof StudentMeasurementBatchKind
>;

export const StudentMeasurementBatchStatus = z.enum([
  "DRAFT",
  "IN_PROGRESS",
  "SUBMITTED",
  "REVIEWED",
  "LOCKED",
  "CANCELLED",
]);
export type StudentMeasurementBatchStatus = z.infer<
  typeof StudentMeasurementBatchStatus
>;

export const StudentMeasurementBatchStudentRowStatus = z.enum([
  "PENDING",
  "COMPLETED",
  "ABSENT",
  "EXCUSED",
  "SKIPPED",
]);
export type StudentMeasurementBatchStudentRowStatus = z.infer<
  typeof StudentMeasurementBatchStudentRowStatus
>;

export const StudentAssessmentTemplateSchema = AuditFieldsSchema.merge(
  z.object({
    id: NonEmptyStringSchema,
    orgId: NonEmptyStringSchema,
    schoolId: z.string().optional().default(""),

    applicableTermIds: z.array(z.string()).default([]),

    schoolType: SchoolType,
    title: NonEmptyStringSchema,
    kind: StudentAssessmentKind,
    assessmentSlot: StudentAssessmentSlot.default("CUSTOM"),
    evaluatorRoleKey: MembershipRole,
    code: z.string().optional().default(""),
    description: z.string().optional().default(""),
    subjectKey: z.string().optional().default(""),
    order: z.number().int().min(0).default(0),
    maxScore: z.number().min(0).default(100),
    scoreType: AssessmentScoreType.default("NUMERIC"),
    passingScore: z.number().min(0).optional(),

    /**
     * بنود القالب.
     *
     * تستخدم خصوصًا في الروضات أو أي قياس يعتمد على بنود مختلفة.
     * مثال:
     * - حرفان من 7
     * - كلمات من 8
     *
     * عند إدخال النتائج تتحول هذه البنود إلى itemScores داخل سجل الطالب.
     */
    templateItems: z.array(OperationTemplateItemSchema).default([]),

    /**
     * للتحكم في ظهور القالب حسب الصف/المستوى
     * مثال:
     * - KG_LEVEL_1 لا تظهر له قياسات
     * - KG_LEVEL_2 يظهر له قياس أول وثاني
     * - KG_LEVEL_3 يظهر له أول وثاني وثالث
     */
    applicableGradeIds: z.array(z.string()).default([]),
    applicableGradeCodes: z.array(z.string()).default([]),
    applicableClassIds: z.array(z.string()).default([]),
    applicableStreamIds: z.array(z.string()).default([]),

    /**
     * هل هذا القياس قد ينتج عنه خطة فاقد تعليمي؟
     * في الابتدائي:
     * - التشخيصي غالبًا false
     * - الفتري والمركزي غالبًا true
     */
    requiresLearningLossFollowUp: z.boolean().default(false),

    /**
     * حد الفاقد:
     * يمكن استخدام الدرجة المباشرة أو النسبة.
     * نترك الاثنين اختياريين للمرونة.
     */
    learningLossThresholdScore: z.number().min(0).optional(),
    learningLossThresholdPercentage: z.number().min(0).max(100).optional(),
    isActive: z.boolean().default(true),
  }),
);
export type StudentAssessmentTemplate = z.infer<
  typeof StudentAssessmentTemplateSchema
>;

export const StudentAssessmentRecordSchema = AuditFieldsSchema.merge(
  z.object({
    id: NonEmptyStringSchema,
    orgId: NonEmptyStringSchema,
    schoolId: NonEmptyStringSchema,
    academicYearId: NonEmptyStringSchema,

    ...AcademicTermContextFieldsSchema.shape,

    studentId: NonEmptyStringSchema,
    enrollmentId: z.string().optional().default(""),
    gradeId: z.string().optional().default(""),
    classId: z.string().optional().default(""),

    /**
     * المادة المفعّلة داخل الفصل وقت إنشاء هذا السجل.
     */
    classSubjectOfferingId: z.string().optional().default(""),

    templateId: NonEmptyStringSchema,
    kind: StudentAssessmentKind,
    assessmentSlot: StudentAssessmentSlot.default("CUSTOM"),
    subjectKey: z.string().optional().default(""),
    evaluatorRoleKey: MembershipRole,
    assessedByPersonId: NonEmptyStringSchema,
    measuredAt: TimestampMsSchema,
    score: z.number().optional(),
    maxScore: z.number().min(0).optional(),
    level: z.string().optional().default(""),
    passed: z.boolean().optional(),
    notes: z.string().optional().default(""),
    status: StudentAssessmentStatus.default("PUBLISHED"),

    /**
     * ربط السجل الفردي بدفعة إدخال جماعية داخل web-staff
     */
    batchId: z.string().optional().default(""),
    batchKind: StudentMeasurementBatchKind.optional(),

    /**
     * درجات البنود التفصيلية إن كان القياس مبنيًا على بنود
     */
    itemScores: z.array(OperationItemScoreSchema).default([]),

    /**
     * نتيجة القرار بعد مقارنة الدرجة بحد الفاقد داخل القالب
     */
    needsLearningLossFollowUp: z.boolean().default(false),

    /**
     * لو تم إنشاء خطة فاقد من هذا القياس
     */
    learningLossPlanId: z.string().optional().default(""),

    /**
     * سبب مختصر لفتح الفاقد
     * مثال:
     * - الدرجة أقل من حد القياس الفتري الأول
     */
    learningLossTriggerReason: z.string().optional().default(""),
  }),
);
export type StudentAssessmentRecord = z.infer<
  typeof StudentAssessmentRecordSchema
>;

/**
 * Student Trackers / Follow-ups
 * المتابعات المستمرة للطالب
 */

export const StudentTrackerKind = z.enum([
  // KG
  "KG_QURAN_TRACKER",
  "KG_LEARNING_GARDENS_TRACKER",
  "KG_NUMBERS_TRACKER",
  "KG_VALUES_TRACKER",
  "KG_CORNERS_TRACKER",
  "KG_LOSS_TRACKER",

  // Generic / future use
  "PRIMARY_QURAN_TRACKER",
  "PRIMARY_LOSS_TRACKER",
  "CUSTOM_TRACKER",
]);
export type StudentTrackerKind = z.infer<typeof StudentTrackerKind>;

export const StudentTrackerEntryStatus = z.enum([
  "RECORDED",
  "REVIEWED",
  "LOCKED",
  "CANCELLED",
]);
export type StudentTrackerEntryStatus = z.infer<
  typeof StudentTrackerEntryStatus
>;

export const TrackerScoreType = z.enum([
  "NUMERIC",
  "BOOLEAN",
  "LEVEL",
  "TEXT_ONLY",
]);
export type TrackerScoreType = z.infer<typeof TrackerScoreType>;

export const StudentTrackerTemplateSchema = AuditFieldsSchema.merge(
  z.object({
    id: NonEmptyStringSchema,
    orgId: NonEmptyStringSchema,
    schoolId: z.string().optional().default(""),

    // [] = القالب صالح لكل الفصول الدراسية
    // ["term-1"] = خاص بالفصل الدراسي الأول
    // ["term-2"] = خاص بالفصل الدراسي الثاني
    applicableTermIds: z.array(z.string()).default([]),

    schoolType: SchoolType,
    title: NonEmptyStringSchema,
    kind: StudentTrackerKind,
    evaluatorRoleKey: MembershipRole,
    code: z.string().optional().default(""),
    description: z.string().optional().default(""),
    subjectKey: z.string().optional().default(""),

    scoreType: TrackerScoreType.default("NUMERIC"),
    maxScore: z.number().min(0).optional(),
    defaultLessonTitle: z.string().optional().default(""),

    /**
     * بنود قالب المتابعة.
     *
     * مثال:
     * - حفظ السورة
     * - النطق
     * - الإتقان
     */
    templateItems: z.array(OperationTemplateItemSchema).default([]),

    /**
     * هل هذه المتابعة قد تنتج عنها خطة فاقد تعليمي؟
     *
     * مهم للروضة:
     * - متابعة القرآن
     * - متابعة بساتين المعرفة
     * - متابعة الأرقام
     */
    requiresLearningLossFollowUp: z.boolean().default(false),

    /**
     * حد الفاقد:
     * يمكن استخدام الدرجة المباشرة أو النسبة.
     *
     * الأفضل في متابعات الروضة غالبًا استخدام النسبة لأن البنود تختلف.
     */
    learningLossThresholdScore: z.number().min(0).optional(),
    learningLossThresholdPercentage: z.number().min(0).max(100).optional(),

    isContinuous: z.boolean().default(true),
    isActive: z.boolean().default(true),
  }),
);
export type StudentTrackerTemplate = z.infer<
  typeof StudentTrackerTemplateSchema
>;

export const StudentTrackerEntrySchema = AuditFieldsSchema.merge(
  z.object({
    id: NonEmptyStringSchema,
    orgId: NonEmptyStringSchema,
    schoolId: NonEmptyStringSchema,
    academicYearId: NonEmptyStringSchema,

    ...AcademicTermContextFieldsSchema.shape,

    studentId: NonEmptyStringSchema,
    enrollmentId: z.string().optional().default(""),
    gradeId: z.string().optional().default(""),
    classId: z.string().optional().default(""),

    /**
     * المادة المفعّلة داخل الفصل وقت إنشاء هذه المتابعة.
     */
    classSubjectOfferingId: z.string().optional().default(""),

    templateId: NonEmptyStringSchema,
    kind: StudentTrackerKind,
    evaluatorRoleKey: MembershipRole,
    recordedByPersonId: NonEmptyStringSchema,
    recordedAt: TimestampMsSchema,

    /**
     * مثال:
     * - سورة الناس
     * - الفاقد: حرف أ
     * - بساتين المعرفة: الدرس 3
     * - الأرقام: من 1 إلى 5
     */
    topicTitle: z.string().optional().default(""),
    lessonKey: z.string().optional().default(""),
    lessonTitle: z.string().optional().default(""),

    score: z.number().optional(),
    maxScore: z.number().min(0).optional(),
    valueText: z.string().optional().default(""),
    level: z.string().optional().default(""),
    completed: z.boolean().optional(),

    notes: z.string().optional().default(""),
    status: StudentTrackerEntryStatus.default("RECORDED"),

    /**
     * ربط المتابعة الفردية بدفعة إدخال جماعية داخل web-staff
     */
    batchId: z.string().optional().default(""),
    batchKind: StudentMeasurementBatchKind.optional(),

    /**
     * درجات البنود التفصيلية للمتابعات التي تعتمد على بنود
     */
    itemScores: z.array(OperationItemScoreSchema).default([]),

    /**
     * نتيجة القرار بعد مقارنة درجة المتابعة بحد الفاقد داخل قالب المتابعة.
     */
    needsLearningLossFollowUp: z.boolean().default(false),

    /**
     * لو تم إنشاء خطة فاقد من هذه المتابعة.
     */
    learningLossPlanId: z.string().optional().default(""),

    /**
     * سبب مختصر لفتح الفاقد من المتابعة.
     * مثال:
     * - نسبة الطالب أقل من حد الفاقد المحدد في متابعة القرآن
     */
    learningLossTriggerReason: z.string().optional().default(""),
  }),
);
export type StudentTrackerEntry = z.infer<typeof StudentTrackerEntrySchema>;

/**
 * Student Measurement Batches
 * دفعات إدخال جماعية لقياسات ومتابعات الطلاب
 */

export const StudentMeasurementBatchRecordType = z.enum([
  "ASSESSMENT_RECORD",
  "TRACKER_ENTRY",
]);
export type StudentMeasurementBatchRecordType = z.infer<
  typeof StudentMeasurementBatchRecordType
>;

export const StudentMeasurementBatchRecordRefStatus = z.enum([
  "PENDING",
  "COMPLETED",
  "MISSING",
  "CANCELLED",
]);
export type StudentMeasurementBatchRecordRefStatus = z.infer<
  typeof StudentMeasurementBatchRecordRefStatus
>;

export const StudentMeasurementBatchRecordRefSchema = z.object({
  studentId: NonEmptyStringSchema,
  recordType: StudentMeasurementBatchRecordType,
  recordId: z.string().optional().default(""),
  status: StudentMeasurementBatchRecordRefStatus.default("PENDING"),
});
export type StudentMeasurementBatchRecordRef = z.infer<
  typeof StudentMeasurementBatchRecordRefSchema
>;

export const StudentMeasurementBatchStudentRowSchema = z.object({
  studentId: NonEmptyStringSchema,
  studentDisplayName: z.string().optional().default(""),
  enrollmentId: z.string().optional().default(""),

  status: StudentMeasurementBatchStudentRowStatus.default("PENDING"),

  score: z.number().optional(),
  maxScore: z.number().min(0).optional(),
  level: z.string().optional().default(""),
  valueText: z.string().optional().default(""),
  passed: z.boolean().optional(),
  completed: z.boolean().optional(),

  itemScores: z.array(OperationItemScoreSchema).default([]),
  note: z.string().optional().default(""),

  recordType: StudentMeasurementBatchRecordType.optional(),
  recordId: z.string().optional().default(""),
});
export type StudentMeasurementBatchStudentRow = z.infer<
  typeof StudentMeasurementBatchStudentRowSchema
>;

export const StudentMeasurementBatchSchema = AuditFieldsSchema.merge(
  z.object({
    id: NonEmptyStringSchema,
    orgId: NonEmptyStringSchema,
    schoolId: NonEmptyStringSchema,
    academicYearId: NonEmptyStringSchema,

    ...AcademicTermContextFieldsSchema.shape,

    gradeId: z.string().optional().default(""),
    classId: z.string().optional().default(""),

    /**
     * المادة المفعّلة داخل الفصل.
     * هذا يجعل الدفعة مرتبطة بفصل + مادة، وليس فصل فقط.
     */
    classSubjectOfferingId: z.string().optional().default(""),

    scopeType: OperationScopeType.default("CLASS"),
    scopeId: z.string().optional().default(""),

    batchKind: StudentMeasurementBatchKind,
    status: StudentMeasurementBatchStatus.default("DRAFT"),

    templateId: z.string().optional().default(""),
    templateTitle: z.string().optional().default(""),

    assessmentKind: StudentAssessmentKind.optional(),
    trackerKind: StudentTrackerKind.optional(),
    assessmentSlot: StudentAssessmentSlot.default("CUSTOM"),
    subjectKey: z.string().optional().default(""),

    /**
     * للروضة والقيم والأركان والمتابعات المرتبطة بوحدة/أسبوع
     */
    unitKey: z.string().optional().default(""),
    unitTitle: z.string().optional().default(""),
    weekNumber: z.number().int().min(0).optional(),
    weekLabel: z.string().optional().default(""),

    createdByPersonId: NonEmptyStringSchema,
    createdByRoleKey: MembershipRole,

    operationalAssignmentId: z.string().optional().default(""),
    teacherAssignmentId: z.string().optional().default(""),

    measuredAt: TimestampMsSchema.optional(),
    submittedAt: TimestampMsSchema.optional(),
    reviewedAt: TimestampMsSchema.optional(),
    lockedAt: TimestampMsSchema.optional(),
    cancelledAt: TimestampMsSchema.optional(),

    targetStudentIds: z.array(z.string()).default([]),
    targetCount: z.number().int().min(0).default(0),
    completedCount: z.number().int().min(0).default(0),
    missingCount: z.number().int().min(0).default(0),

    studentRows: z.array(StudentMeasurementBatchStudentRowSchema).default([]),
    recordRefs: z.array(StudentMeasurementBatchRecordRefSchema).default([]),

    notes: z.string().optional().default(""),
  }),
);
export type StudentMeasurementBatch = z.infer<
  typeof StudentMeasurementBatchSchema
>;

/**
 * Student Homework / Question Bank
 * الواجبات وبنك الأسئلة
 */

export const HomeworkQuestionType = z.enum([
  "TRUE_FALSE",
  "MULTIPLE_CHOICE",
  "SHORT_ANSWER",
]);
export type HomeworkQuestionType = z.infer<typeof HomeworkQuestionType>;

export const HomeworkStatus = z.enum([
  "DRAFT",
  "PUBLISHED",
  "CLOSED",
  "LOCKED",
  "CANCELLED",
]);
export type HomeworkStatus = z.infer<typeof HomeworkStatus>;

export const HomeworkPublishMode = z.enum([
  "DRAFT_ONLY",
  "PUBLISH_NOW",
  "SCHEDULED",
]);
export type HomeworkPublishMode = z.infer<typeof HomeworkPublishMode>;

export const HomeworkSubmissionStatus = z.enum([
  "NOT_STARTED",
  "IN_PROGRESS",
  "SUBMITTED",
  "LATE_SUBMITTED",
  "GRADED",
  "RETURNED",
  "CANCELLED",
]);
export type HomeworkSubmissionStatus = z.infer<typeof HomeworkSubmissionStatus>;

export const HomeworkGradingMode = z.enum(["AUTO", "MANUAL", "MIXED"]);
export type HomeworkGradingMode = z.infer<typeof HomeworkGradingMode>;

export const HomeworkQuestionDifficulty = z.enum([
  "EASY",
  "MEDIUM",
  "HARD",
  "CHALLENGE",
]);
export type HomeworkQuestionDifficulty = z.infer<
  typeof HomeworkQuestionDifficulty
>;

export const HomeworkChoiceSchema = z.object({
  id: NonEmptyStringSchema,
  text: NonEmptyStringSchema,
  order: z.number().int().min(0).default(0),
});
export type HomeworkChoice = z.infer<typeof HomeworkChoiceSchema>;

export const QuestionBankItemSchema = AuditFieldsSchema.merge(
  z.object({
    id: NonEmptyStringSchema,

    orgId: NonEmptyStringSchema,

    /**
     * السؤال غالبًا عام على مستوى مادة/صف/فصل دراسي.
     * لذلك schoolId و academicYearId و classSubjectOfferingId اختيارية عند الحاجة.
     */
    schoolId: z.string().optional().default(""),
    schoolType: SchoolType.optional(),
    academicYearId: z.string().optional().default(""),

    termId: NonEmptyStringSchema,
    termTitle: z.string().optional().default(""),
    termShortTitle: z.string().optional().default(""),

    subjectKey: NonEmptyStringSchema,
    gradeId: z.string().optional().default(""),
    classSubjectOfferingId: z.string().optional().default(""),

    questionType: HomeworkQuestionType,
    title: z.string().optional().default(""),
    prompt: NonEmptyStringSchema,

    choices: z.array(HomeworkChoiceSchema).default([]),

    /**
     * TRUE_FALSE:
     * يمكن أن تكون correctAnswer = "true" أو "false"
     *
     * SHORT_ANSWER:
     * يمكن أن تكون correctAnswer هي الإجابة النموذجية المختصرة.
     *
     * MULTIPLE_CHOICE:
     * نعتمد غالبًا على correctChoiceIds.
     */
    correctAnswer: z.string().optional().default(""),
    correctChoiceIds: z.array(z.string()).default([]),

    explanation: z.string().optional().default(""),
    difficulty: HomeworkQuestionDifficulty.default("MEDIUM"),
    tags: z.array(z.string()).default([]),

    maxScore: z.number().min(0).default(1),
    gradingMode: HomeworkGradingMode.default("AUTO"),

    createdByPersonId: NonEmptyStringSchema,
    createdByRoleKey: MembershipRole.optional(),

    isActive: z.boolean().default(true),
    isArchived: z.boolean().default(false),
  }),
);
export type QuestionBankItem = z.infer<typeof QuestionBankItemSchema>;

export const HomeworkQuestionSnapshotSchema = z.object({
  id: NonEmptyStringSchema,

  /**
   * مرجع السؤال الأصلي في بنك الأسئلة.
   * قد يكون فارغًا لو تم إنشاء السؤال داخل الواجب مباشرة قبل حفظه في البنك.
   */
  questionBankItemId: z.string().optional().default(""),

  questionType: HomeworkQuestionType,
  title: z.string().optional().default(""),
  prompt: NonEmptyStringSchema,

  choices: z.array(HomeworkChoiceSchema).default([]),

  correctAnswer: z.string().optional().default(""),
  correctChoiceIds: z.array(z.string()).default([]),

  explanation: z.string().optional().default(""),
  difficulty: HomeworkQuestionDifficulty.default("MEDIUM"),

  maxScore: z.number().min(0).default(1),
  gradingMode: HomeworkGradingMode.default("AUTO"),

  order: z.number().int().min(0).default(0),
});
export type HomeworkQuestionSnapshot = z.infer<
  typeof HomeworkQuestionSnapshotSchema
>;

export const StudentHomeworkAssignmentSchema = AuditFieldsSchema.merge(
  z.object({
    id: NonEmptyStringSchema,

    orgId: NonEmptyStringSchema,
    schoolId: NonEmptyStringSchema,
    academicYearId: NonEmptyStringSchema,

    termId: NonEmptyStringSchema,
    termTitle: z.string().optional().default(""),
    termShortTitle: z.string().optional().default(""),

    gradeId: z.string().optional().default(""),
    classId: NonEmptyStringSchema,

    subjectKey: NonEmptyStringSchema,
    classSubjectOfferingId: NonEmptyStringSchema,

    title: NonEmptyStringSchema,
    description: z.string().optional().default(""),

    status: HomeworkStatus.default("DRAFT"),
    publishMode: HomeworkPublishMode.default("DRAFT_ONLY"),
    gradingMode: HomeworkGradingMode.default("MIXED"),

    /**
     * أسئلة الواجب تكون Snapshot مستقل.
     * لا نعتمد على questionBankItemId فقط حتى لا تتغير الواجبات القديمة
     * عند تعديل السؤال الأصلي في بنك الأسئلة.
     */
    questions: z.array(HomeworkQuestionSnapshotSchema).default([]),

    maxScore: z.number().min(0).default(0),

    targetStudentIds: z.array(z.string()).default([]),
    targetCount: z.number().int().min(0).default(0),

    submittedCount: z.number().int().min(0).default(0),
    gradedCount: z.number().int().min(0).default(0),
    missingCount: z.number().int().min(0).default(0),

    dueAt: TimestampMsSchema.optional(),
    scheduledPublishAt: TimestampMsSchema.optional(),
    publishedAt: TimestampMsSchema.optional(),
    closedAt: TimestampMsSchema.optional(),
    lockedAt: TimestampMsSchema.optional(),
    cancelledAt: TimestampMsSchema.optional(),

    createdByPersonId: NonEmptyStringSchema,
    createdByRoleKey: MembershipRole.optional(),

    operationalAssignmentId: z.string().optional().default(""),
    teacherAssignmentId: z.string().optional().default(""),

    note: z.string().optional().default(""),
  }),
);
export type StudentHomeworkAssignment = z.infer<
  typeof StudentHomeworkAssignmentSchema
>;

export const StudentHomeworkAnswerSchema = z.object({
  questionId: NonEmptyStringSchema,
  questionBankItemId: z.string().optional().default(""),

  questionType: HomeworkQuestionType,

  selectedChoiceIds: z.array(z.string()).default([]),
  answerText: z.string().optional().default(""),
  booleanAnswer: z.boolean().optional(),

  score: z.number().min(0).optional(),
  maxScore: z.number().min(0).optional(),

  isCorrect: z.boolean().optional(),
  feedback: z.string().optional().default(""),

  gradedAt: TimestampMsSchema.optional(),
  gradedByPersonId: z.string().optional().default(""),
});
export type StudentHomeworkAnswer = z.infer<typeof StudentHomeworkAnswerSchema>;

export const StudentHomeworkSubmissionSchema = AuditFieldsSchema.merge(
  z.object({
    id: NonEmptyStringSchema,

    orgId: NonEmptyStringSchema,
    schoolId: NonEmptyStringSchema,
    academicYearId: NonEmptyStringSchema,

    termId: NonEmptyStringSchema,
    termTitle: z.string().optional().default(""),
    termShortTitle: z.string().optional().default(""),

    homeworkId: NonEmptyStringSchema,

    /**
     * Snapshot خفيف من الواجب وقت إنشاء التسليم.
     *
     * الهدف:
     * تطبيق الطالب/ولي الأمر يستطيع عرض الواجب من التسليم مباشرة
     * دون الحاجة دائمًا لقراءة StudentHomeworkAssignment قراءة إضافية.
     */
    homeworkTitle: z.string().optional().default(""),
    homeworkDescription: z.string().optional().default(""),
    homeworkDueAt: TimestampMsSchema.optional(),
    homeworkPublishedAt: TimestampMsSchema.optional(),

    /**
     * نسخة أسئلة الواجب داخل التسليم.
     * هي نفسها snapshot المحفوظة داخل StudentHomeworkAssignment.
     */
    homeworkQuestions: z.array(HomeworkQuestionSnapshotSchema).default([]),

    studentId: NonEmptyStringSchema,
    enrollmentId: z.string().optional().default(""),

    gradeId: z.string().optional().default(""),
    classId: NonEmptyStringSchema,

    subjectKey: NonEmptyStringSchema,
    classSubjectOfferingId: NonEmptyStringSchema,

    answers: z.array(StudentHomeworkAnswerSchema).default([]),

    score: z.number().min(0).default(0),
    maxScore: z.number().min(0).default(0),

    status: HomeworkSubmissionStatus.default("NOT_STARTED"),

    startedAt: TimestampMsSchema.optional(),
    submittedAt: TimestampMsSchema.optional(),
    gradedAt: TimestampMsSchema.optional(),
    returnedAt: TimestampMsSchema.optional(),

    gradedByPersonId: z.string().optional().default(""),
    feedback: z.string().optional().default(""),

    isLate: z.boolean().default(false),
    note: z.string().optional().default(""),
  }),
);
export type StudentHomeworkSubmission = z.infer<
  typeof StudentHomeworkSubmissionSchema
>;

/**
 * Subject Lesson Prep
 * تحضير الدروس داخل المادة المفعّلة في الفصل
 */

export const SubjectLessonPrepStatus = z.enum([
  "DRAFT",
  "SUBMITTED",
  "APPROVED",
  "RETURNED",
  "LOCKED",
  "CANCELLED",
]);
export type SubjectLessonPrepStatus = z.infer<typeof SubjectLessonPrepStatus>;

export const SubjectLessonPrepReviewerSource = z.enum([
  "NONE",
  "TEACHER_ASSIGNMENT_SUPERVISOR",
  "SCHOOL_POLICY",
  "MANUAL",
  "ADMIN_FALLBACK",
]);
export type SubjectLessonPrepReviewerSource = z.infer<
  typeof SubjectLessonPrepReviewerSource
>;

const NullableTimestampMsSchema = z
  .union([TimestampMsSchema, z.null()])
  .optional()
  .default(null);

export const SubjectLessonPrepSchema = AuditFieldsSchema.merge(
  z.object({
    id: NonEmptyStringSchema,

    orgId: NonEmptyStringSchema,
    schoolId: NonEmptyStringSchema,
    academicYearId: NonEmptyStringSchema,

    ...AcademicTermContextFieldsSchema.shape,

    classId: NonEmptyStringSchema,
    gradeId: z.string().optional().default(""),
    classSubjectOfferingId: NonEmptyStringSchema,
    subjectKey: z.string().optional().default(""),

    teacherPersonId: z.string().optional().default(""),
    teacherAssignmentId: z.string().optional().default(""),

    /**
     * نسخة محفوظة من سياسة المراجعة وقت إنشاء التحضير.
     * هذا يمنع تغيّر معنى التحضيرات القديمة إذا تغير إعداد المادة لاحقًا.
     */
    reviewMode: LessonPrepReviewMode.default("APPROVAL_REQUIRED"),
    approvalRequired: z.boolean().default(true),

    /**
     * المراجع المسؤول عن اعتماد التحضير.
     *
     * في البداية قد تكون فارغة، ثم لاحقًا نملؤها عند الإرسال من:
     * - supervisorPersonId داخل TeacherAssignment
     * - أو سياسة المدرسة
     * - أو اختيار يدوي
     */
    reviewerPersonId: z.string().optional().default(""),
    reviewerRoleKey: MembershipRole.optional(),
    reviewerSource: SubjectLessonPrepReviewerSource.default("NONE"),
    reviewerAssignedAt: NullableTimestampMsSchema,

    /**
     * من قام بالمراجعة النهائية فعليًا.
     * قد يساوي reviewerPersonId أو يكون أدمن له صلاحية تجاوز.
     */
    reviewedByPersonId: z.string().optional().default(""),
    reviewedAt: NullableTimestampMsSchema,

    lessonTitle: NonEmptyStringSchema,
    unitTitle: z.string().optional().default(""),
    weekLabel: z.string().optional().default(""),
    lessonDate: z.string().optional().default(""),
    durationMinutes: z.string().optional().default(""),
    lessonNumber: z.string().optional().default(""),

    objectives: z.string().optional().default(""),
    learningOutcomes: z.string().optional().default(""),
    warmup: z.string().optional().default(""),
    lessonSteps: z.string().optional().default(""),
    strategies: z.string().optional().default(""),
    resources: z.string().optional().default(""),
    assessment: z.string().optional().default(""),
    homeworkNote: z.string().optional().default(""),

    status: SubjectLessonPrepStatus.default("DRAFT"),

    submittedAt: NullableTimestampMsSchema,

    approvedAt: NullableTimestampMsSchema,
    approvedByPersonId: z.string().optional().default(""),

    returnedAt: NullableTimestampMsSchema,
    returnedByPersonId: z.string().optional().default(""),
    returnReason: z.string().optional().default(""),

    lockedAt: NullableTimestampMsSchema,
    cancelledAt: NullableTimestampMsSchema,

    metadata: z.record(z.unknown()).default({}),
  }),
);
export type SubjectLessonPrep = z.infer<typeof SubjectLessonPrepSchema>;

/**
 * Student Notes
 * ملاحظات عامة مستقلة مرتبطة بالطالب
 */

export const StudentNoteCategory = z.enum([
  "GENERAL",
  "EDUCATIONAL",
  "BEHAVIORAL",
  "ADMINISTRATIVE",
  "ATTENDANCE",
  "TRANSPORT",
  "GUARDIAN_COMMUNICATION",

  /**
   * مرتبطة بالفاقد التعليمي أو حاجة الطالب لخطة علاجية.
   */
  "LEARNING_LOSS",

  /**
   * ملاحظة إيجابية أو تحفيزية.
   */
  "POSITIVE",

  /**
   * ملاحظة صحية/رعائية عامة دون تفاصيل طبية حساسة.
   */
  "CARE",

  /**
   * ملاحظة مرتبطة بإجراء أو متابعة تشغيلية.
   */
  "FOLLOW_UP",

  /**
   * تصنيف مخصص لاحقًا.
   */
  "CUSTOM",
]);
export type StudentNoteCategory = z.infer<typeof StudentNoteCategory>;

export const StudentNotePriority = z.enum([
  "INFO",
  "FOLLOW_UP",
  "IMPORTANT",
  "URGENT",
]);
export type StudentNotePriority = z.infer<typeof StudentNotePriority>;

export const StudentNoteVisibility = z.enum([
  /**
   * تظهر لكاتب الملاحظة فقط.
   */
  "PRIVATE_TO_AUTHOR",

  /**
   * تظهر للطاقم الداخلي فقط.
   * أبقيناها للتوافق مع البيانات الحالية.
   */
  "STAFF_ONLY",

  /**
   * تظهر للطاقم الداخلي.
   */
  "STAFF_INTERNAL",

  /**
   * تظهر للقيادة/الإدارة داخل المدرسة.
   * أبقيناها للتوافق مع البيانات الحالية.
   */
  "SCHOOL_LEADERSHIP",

  /**
   * تظهر للإدارة فقط.
   */
  "ADMIN_ONLY",

  /**
   * تظهر لفريق الدعم الطلابي/الإرشاد/الوكيل حسب الصلاحيات.
   */
  "STUDENT_SUPPORT_TEAM",

  /**
   * تظهر لفريق النقل فقط عند ارتباطها بالنقل.
   */
  "TRANSPORT_TEAM",

  /**
   * يمكن إظهارها لاحقًا في تطبيق ولي الأمر.
   * أبقيناها للتوافق مع البيانات الحالية.
   */
  "GUARDIAN_VISIBLE",

  /**
   * تسمية أوضح للعرض لولي الأمر لاحقًا.
   */
  "PARENT_VISIBLE",
]);
export type StudentNoteVisibility = z.infer<typeof StudentNoteVisibility>;

export const StudentNoteStatus = z.enum([
  /**
   * ملاحظة نشطة.
   */
  "ACTIVE",

  /**
   * ملاحظة تحتاج متابعة.
   */
  "NEEDS_FOLLOW_UP",

  /**
   * تم إنهاء أثر الملاحظة أو معالجتها.
   */
  "RESOLVED",

  /**
   * تمت أرشفتها.
   */
  "ARCHIVED",

  /**
   * تم إلغاؤها.
   */
  "CANCELLED",
]);
export type StudentNoteStatus = z.infer<typeof StudentNoteStatus>;

export const StudentNoteFollowUpStatus = z.enum([
  "NONE",
  "NEEDED",
  "DONE",
  "CANCELLED",
  "IN_PROGRESS",
]);
export type StudentNoteFollowUpStatus = z.infer<
  typeof StudentNoteFollowUpStatus
>;

export const StudentNoteSourceType = z.enum([
  /**
   * ملاحظة أدخلها المستخدم يدويًا.
   */
  "MANUAL",

  /**
   * ملاحظة مرتبطة بدفعة حضور.
   */
  "STUDENT_ATTENDANCE_BATCH",

  /**
   * ملاحظة مرتبطة بسجل حضور فردي.
   */
  "STUDENT_ATTENDANCE_RECORD",

  /**
   * ملاحظة مرتبطة بدفعة قياس/متابعة.
   */
  "STUDENT_MEASUREMENT_BATCH",

  /**
   * ملاحظة مرتبطة بسجل قياس رسمي.
   */
  "STUDENT_ASSESSMENT_RECORD",

  /**
   * ملاحظة مرتبطة بمتابعة مستمرة.
   */
  "STUDENT_TRACKER_ENTRY",

  /**
   * ملاحظة مرتبطة بخطة فاقد تعليمي.
   */
  "STUDENT_LEARNING_LOSS_PLAN",

  /**
   * ملاحظة مرتبطة بقضية طالب.
   */
  "STUDENT_CASE",

  /**
   * ملاحظة مرتبطة بسجل أو دفعة نقل.
   */
  "TRANSPORT_ATTENDANCE",

  /**
   * مصدر مخصص.
   */
  "CUSTOM",
]);
export type StudentNoteSourceType = z.infer<typeof StudentNoteSourceType>;

export const StudentNoteSchema = AuditFieldsSchema.merge(
  z.object({
    id: NonEmptyStringSchema,

    orgId: NonEmptyStringSchema,
    schoolId: NonEmptyStringSchema,
    academicYearId: NonEmptyStringSchema,

    ...AcademicTermContextFieldsSchema.shape,

    studentId: NonEmptyStringSchema,
    enrollmentId: z.string().optional().default(""),
    gradeId: z.string().optional().default(""),
    classId: z.string().optional().default(""),

    /**
     * ربط اختياري بمادة مفعّلة داخل الفصل.
     * يسمح بملاحظة عامة، أو ملاحظة مرتبطة بمادة محددة.
     */
    classSubjectOfferingId: z.string().optional().default(""),

    category: StudentNoteCategory.default("GENERAL"),
    priority: StudentNotePriority.default("INFO"),
    visibility: StudentNoteVisibility.default("STAFF_ONLY"),
    status: StudentNoteStatus.default("ACTIVE"),

    /**
     * عند إنشاء ملاحظة واحدة لعدة طلاب من نفس العملية،
     * ننشئ StudentNote لكل طالب ونربطهم بنفس groupNoteId.
     */
    groupNoteId: z.string().optional().default(""),

    /**
     * عنوان مختصر اختياري للملاحظة.
     */
    title: z.string().optional().default(""),

    /**
     * نص الملاحظة الأساسي.
     */
    body: NonEmptyStringSchema,

    /**
     * من سجّل الملاحظة
     */
    recordedByPersonId: NonEmptyStringSchema,
    recordedByRoleKey: MembershipRole.optional(),
    recordedAt: TimestampMsSchema,

    /**
     * المتابعة اللاحقة
     */
    followUpStatus: StudentNoteFollowUpStatus.default("NONE"),
    followUpAt: TimestampMsSchema.optional(),
    followUpByPersonId: z.string().optional().default(""),
    followUpNote: z.string().optional().default(""),

    /**
     * مصدر الملاحظة.
     * يساعدنا نعرف هل جاءت يدويًا، من حضور، من فاقد، من قضية، إلخ.
     */
    sourceType: StudentNoteSourceType.default("MANUAL"),
    sourceId: z.string().optional().default(""),
    sourcePath: z.string().optional().default(""),

    /**
     * روابط اختيارية بسجلات أخرى.
     * أبقيناها لتسهيل القراءة المباشرة دون تفكيك sourceId.
     */
    linkedCaseId: z.string().optional().default(""),
    linkedAttendanceBatchId: z.string().optional().default(""),
    linkedAttendanceRecordId: z.string().optional().default(""),
    linkedTransportAttendanceRecordId: z.string().optional().default(""),
    linkedAssessmentRecordId: z.string().optional().default(""),
    linkedMeasurementBatchId: z.string().optional().default(""),
    linkedTrackerEntryId: z.string().optional().default(""),
    linkedLearningLossPlanId: z.string().optional().default(""),

    /**
     * وسوم مرنة للتصفية لاحقًا.
     */
    tags: z.array(z.string()).default([]),

    archivedAt: TimestampMsSchema.optional(),
    archivedByPersonId: z.string().optional().default(""),

    cancelledAt: TimestampMsSchema.optional(),
    cancelledByPersonId: z.string().optional().default(""),
    cancelReason: z.string().optional().default(""),
  }),
).superRefine((data, ctx) => {
  if (data.status === "ARCHIVED" && !data.archivedAt) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "يجب توفير archivedAt عند أرشفة الملاحظة",
      path: ["archivedAt"],
    });
  }

  if (data.status === "CANCELLED" && !data.cancelledAt) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "يجب توفير cancelledAt عند إلغاء الملاحظة",
      path: ["cancelledAt"],
    });
  }

  if (data.followUpStatus === "NEEDED" && !data.followUpAt) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "يجب تحديد followUpAt عند طلب متابعة لاحقة",
      path: ["followUpAt"],
    });
  }

  if (data.status === "NEEDS_FOLLOW_UP" && data.followUpStatus === "NONE") {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "إذا كانت الملاحظة تحتاج متابعة فيجب تحديث followUpStatus",
      path: ["followUpStatus"],
    });
  }

  if (data.sourceType !== "MANUAL" && !data.sourceId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "يجب توفير sourceId عند ربط الملاحظة بمصدر غير يدوي",
      path: ["sourceId"],
    });
  }
});

export type StudentNote = z.infer<typeof StudentNoteSchema>;

/**
 * Student Learning Loss Plans
 * خطط الفاقد التعليمي
 *
 * هذا الكيان مستقل لأنه يمثل خطة علاجية كاملة:
 * - مهارات مفقودة
 * - خطة وإجراءات معالجة
 * - فترة علاج
 * - قياس أول وثاني
 * - مؤشر تحسن
 */

export const StudentLearningLossPlanSchema = AuditFieldsSchema.merge(
  z.object({
    id: NonEmptyStringSchema,

    orgId: NonEmptyStringSchema,
    schoolId: NonEmptyStringSchema,
    academicYearId: NonEmptyStringSchema,

    ...AcademicTermContextFieldsSchema.shape,

    studentId: NonEmptyStringSchema,
    enrollmentId: z.string().optional().default(""),
    gradeId: z.string().optional().default(""),
    classId: z.string().optional().default(""),
    subjectKey: z.string().optional().default(""),
    classSubjectOfferingId: z.string().optional().default(""),

    /**
     * مصدر الخطة
     */
    sourceType: LearningLossSourceType.default("MANUAL"),
    sourceAssessmentRecordId: z.string().optional().default(""),
    sourceTrackerEntryId: z.string().optional().default(""),
    sourceTemplateId: z.string().optional().default(""),
    sourceKind: z.string().optional().default(""),
    sourceTitle: z.string().optional().default(""),

    /**
     * مادة/مجال الفاقد إن وجد
     */
    //subjectKey: z.string().optional().default(""),

    /**
     * المهارات المفقودة
     */
    lostSkills: z.array(LearningLossSkillSchema).default([]),

    /**
     * الخطة العلاجية
     */
    planTitle: z.string().optional().default(""),
    planText: NonEmptyStringSchema,
    remediationActions: z
      .array(LearningLossRemediationActionSchema)
      .default([]),

    planStartAt: TimestampMsSchema,
    planEndAt: TimestampMsSchema.optional(),

    /**
     * المسؤول عن متابعة الخطة
     */
    ownerPersonId: z.string().optional().default(""),
    ownerRoleKey: MembershipRole.optional(),

    /**
     * القياس الأساسي قبل/عند بدء الخطة
     */
    baselineScore: z.number().optional(),
    baselineMaxScore: z.number().min(0).optional(),
    baselineMeasuredAt: TimestampMsSchema.optional(),

    /**
     * القياس الأول للخطة العلاجية
     */
    firstCheckScore: z.number().optional(),
    firstCheckMaxScore: z.number().min(0).optional(),
    firstCheckMeasuredAt: TimestampMsSchema.optional(),
    firstCheckNote: z.string().optional().default(""),

    /**
     * القياس الثاني للخطة العلاجية
     */
    secondCheckScore: z.number().optional(),
    secondCheckMaxScore: z.number().min(0).optional(),
    secondCheckMeasuredAt: TimestampMsSchema.optional(),
    secondCheckNote: z.string().optional().default(""),

    /**
     * مؤشرات التحسن
     * يمكن حسابها آليًا لاحقًا في الواجهة/الدوال، ونخزنها للقراءة السريعة
     */
    improvementDelta: z.number().optional(),
    improvementPercentage: z.number().optional(),
    improvementIndicator: LearningLossImprovementIndicator.default("UNKNOWN"),

    status: StudentLearningLossPlanStatus.default("ACTIVE"),

    createdByPersonId: NonEmptyStringSchema,
    createdByRoleKey: MembershipRole.optional(),

    closedAt: TimestampMsSchema.optional(),
    closedByPersonId: z.string().optional().default(""),
    closeNote: z.string().optional().default(""),

    cancelledAt: TimestampMsSchema.optional(),
    cancelledByPersonId: z.string().optional().default(""),
    cancelReason: z.string().optional().default(""),

    tags: z.array(z.string()).default([]),
    note: z.string().optional().default(""),
  }),
).superRefine((data, ctx) => {
  if (data.planEndAt && data.planEndAt < data.planStartAt) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "تاريخ نهاية الخطة لا يمكن أن يكون قبل تاريخ بدايتها",
      path: ["planEndAt"],
    });
  }

  if (
    data.sourceType === "ASSESSMENT_RECORD" &&
    !data.sourceAssessmentRecordId
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message:
        "يجب توفير sourceAssessmentRecordId عند كون المصدر قياسًا رسميًا",
      path: ["sourceAssessmentRecordId"],
    });
  }

  if (data.sourceType === "TRACKER_ENTRY" && !data.sourceTrackerEntryId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "يجب توفير sourceTrackerEntryId عند كون المصدر متابعة",
      path: ["sourceTrackerEntryId"],
    });
  }

  if (data.status === "CLOSED" && !data.closedAt) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "يجب توفير closedAt عند إغلاق خطة الفاقد",
      path: ["closedAt"],
    });
  }

  if (data.status === "CANCELLED" && !data.cancelledAt) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "يجب توفير cancelledAt عند إلغاء خطة الفاقد",
      path: ["cancelledAt"],
    });
  }

  if (data.lostSkills.length === 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "يجب إدخال مهارة مفقودة واحدة على الأقل",
      path: ["lostSkills"],
    });
  }
});

export type StudentLearningLossPlan = z.infer<
  typeof StudentLearningLossPlanSchema
>;

export const TeacherAssignmentStatus = z.enum(["ACTIVE", "ENDED", "PENDING"]);
export type TeacherAssignmentStatus = z.infer<typeof TeacherAssignmentStatus>;

export const AssignmentRoleInAssignment = z.enum([
  "MAIN",
  "ASSISTANT",
  "SUPPORT",
  "SUBSTITUTE",
]);
export type AssignmentRoleInAssignment = z.infer<
  typeof AssignmentRoleInAssignment
>;

export const TeacherAssignmentKind = z.enum([
  "CLASS_TEACHER",
  "SUBJECT_TEACHER",
  "VALUES_TEACHER",
  "CORNERS_TEACHER",
  "QURAN_TEACHER",
  "SUPPORT_TEACHER",
  "ACTIVITY_TEACHER",
  "CUSTOM",
]);
export type TeacherAssignmentKind = z.infer<typeof TeacherAssignmentKind>;

export const TeacherAssignmentCoverageMode = z.enum([
  "EXPLICIT_CLASSES",
  "ALL_CLASSES_IN_SCOPE",
]);
export type TeacherAssignmentCoverageMode = z.infer<
  typeof TeacherAssignmentCoverageMode
>;

export const TeacherAssignmentTargetScopeType = z.enum([
  "SCHOOL",
  "GRADE",
  "CLASS",
  "STREAM",
]);
export type TeacherAssignmentTargetScopeType = z.infer<
  typeof TeacherAssignmentTargetScopeType
>;

export const TeacherAssignmentSchema = AuditFieldsSchema.merge(
  z.object({
    id: NonEmptyStringSchema,
    orgId: NonEmptyStringSchema,
    schoolId: NonEmptyStringSchema,
    academicYearId: NonEmptyStringSchema,

    teacherPersonId: NonEmptyStringSchema,
    supervisorPersonId: z.string().optional().default(""),

    assignmentKind: TeacherAssignmentKind.default("SUBJECT_TEACHER"),

    /**
     * نطاق الإسناد الرئيسي
     * أمثلة:
     * - CLASS => معلمة فصل محدد
     * - SCHOOL + ALL_CLASSES_IN_SCOPE => معلمة قيم لكل الروضة
     * - GRADE/STREAM + EXPLICIT_CLASSES => معلم عدة فصول
     */
    targetScopeType: TeacherAssignmentTargetScopeType,
    targetScopeId: NonEmptyStringSchema,

    coverageMode: TeacherAssignmentCoverageMode.default("EXPLICIT_CLASSES"),

    /**
     * المادة
     * أبقينا subjectKey للتوافق
     */
    subjectKey: z.string().default("GENERAL"),
    subjectId: z.string().optional().default(""),

    /**
     * ربط اختياري بالمادة المفعّلة داخل فصل محدد.
     * لا نجعله إجباريًا الآن حتى لا نكسر البيانات القديمة.
     */
    classSubjectOfferingId: z.string().optional().default(""),

    /**
     * ربط إضافي اختياري
     */
    gradeId: z.string().optional().default(""),
    streamId: z.string().optional().default(""),

    /**
     * هل هذا الإسناد هو المعلم/ـة الأساسية للفصل
     */
    isHomeroom: z.boolean().default(false),

    /**
     * مثال:
     * MAIN / ASSISTANT / SUPPORT / SUBSTITUTE
     */
    roleInAssignment: AssignmentRoleInAssignment.default("MAIN"),

    status: TeacherAssignmentStatus.default("ACTIVE"),
    startAt: TimestampMsSchema,
    endAt: TimestampMsSchema.optional(),

    note: z.string().optional().default(""),
  }),
);
export type TeacherAssignment = z.infer<typeof TeacherAssignmentSchema>;

export const TeacherAssignmentClassLinkSchema = AuditFieldsSchema.merge(
  z.object({
    id: NonEmptyStringSchema,
    assignmentId: NonEmptyStringSchema,

    orgId: NonEmptyStringSchema,
    schoolId: NonEmptyStringSchema,
    academicYearId: NonEmptyStringSchema,

    classId: NonEmptyStringSchema,
    gradeId: z.string().optional().default(""),
    streamId: z.string().optional().default(""),

    /**
     * ربط اختياري بالمادة المفعّلة داخل هذا الفصل.
     * مهم عندما يكون الإسناد يغطي عدة فصول ولكل فصل offering مستقل.
     */
    classSubjectOfferingId: z.string().optional().default(""),

    /**
     * يفيد في الترتيب أو تمييز الفصل الأساسي عند الحاجة
     */
    order: z.number().int().min(0).default(0),
    isPrimaryClass: z.boolean().default(false),
  }),
);
export type TeacherAssignmentClassLink = z.infer<
  typeof TeacherAssignmentClassLinkSchema
>;

/**
 * Operational Assignments
 * إسنادات التشغيل اليومية العامة
 */

export const OperationalAssignmentStatus = z.enum([
  "ACTIVE",
  "ENDED",
  "PENDING",
  "SUSPENDED",
]);
export type OperationalAssignmentStatus = z.infer<
  typeof OperationalAssignmentStatus
>;

export const OperationalAssignmentCoverageMode = z.enum([
  "SINGLE_SCOPE",
  "ALL_CLASSES_IN_SCOPE",
  "EXPLICIT_CLASSES",
  "EXPLICIT_PEOPLE",
  "EXPLICIT_ROUTES",
  "CUSTOM",
]);
export type OperationalAssignmentCoverageMode = z.infer<
  typeof OperationalAssignmentCoverageMode
>;

export const OperationPermission = z.enum([
  "VIEW",
  "CREATE",
  "UPDATE_DRAFT",
  "SUBMIT",
  "REVIEW",
  "APPROVE",
  "LOCK",
  "CANCEL",
]);
export type OperationPermission = z.infer<typeof OperationPermission>;

export const OperationalAssignmentSchema = AuditFieldsSchema.merge(
  z.object({
    id: NonEmptyStringSchema,
    orgId: NonEmptyStringSchema,

    title: NonEmptyStringSchema,
    description: z.string().optional().default(""),

    status: OperationalAssignmentStatus.default("ACTIVE"),
    isActive: z.boolean().default(true),

    startAt: TimestampMsSchema.optional(),
    endAt: TimestampMsSchema.optional(),

    actorPersonId: NonEmptyStringSchema,
    actorMembershipId: z.string().optional().default(""),
    actorRoleKey: MembershipRole.optional(),

    operationKind: OperationKind,

    scopeType: OperationScopeType,
    scopeId: z.string().optional().default(""),
    scopeLabel: z.string().optional().default(""),

    coverageMode: OperationalAssignmentCoverageMode.default("SINGLE_SCOPE"),

    targetKind: OperationTargetKind.default("NONE"),
    targetPersonIds: z.array(z.string()).default([]),
    targetStudentIds: z.array(z.string()).default([]),
    targetClassIds: z.array(z.string()).default([]),
    targetGradeIds: z.array(z.string()).default([]),
    targetRouteIds: z.array(z.string()).default([]),
    targetRoleKeys: z.array(MembershipRole).default([]),

    permissions: z
      .array(OperationPermission)
      .default(["VIEW", "CREATE", "UPDATE_DRAFT", "SUBMIT"]),

    sourceTeacherAssignmentId: z.string().optional().default(""),
    sourceMembershipId: z.string().optional().default(""),

    note: z.string().optional().default(""),
  }),
);
export type OperationalAssignment = z.infer<typeof OperationalAssignmentSchema>;

/**
 * Staff Tasks
 * مهام التشغيل اليومية داخل web-staff
 */

export const StaffTaskStatus = z.enum([
  "PENDING",
  "IN_PROGRESS",
  "DRAFT",
  "SUBMITTED",
  "NEEDS_REVIEW",
  "RETURNED",
  "COMPLETED",
  "OVERDUE",
  "CANCELLED",
]);
export type StaffTaskStatus = z.infer<typeof StaffTaskStatus>;

export const StaffTaskPriority = z.enum(["LOW", "NORMAL", "HIGH", "URGENT"]);
export type StaffTaskPriority = z.infer<typeof StaffTaskPriority>;

export const StaffTaskSchema = AuditFieldsSchema.merge(
  z.object({
    id: NonEmptyStringSchema,
    orgId: NonEmptyStringSchema,

    actorPersonId: NonEmptyStringSchema,
    actorRoleKey: MembershipRole.optional(),

    taskKind: OperationKind,
    taskTitle: NonEmptyStringSchema,
    taskDescription: z.string().optional().default(""),

    scopeType: OperationScopeType.default("CUSTOM"),
    scopeId: z.string().optional().default(""),
    scopeLabel: z.string().optional().default(""),

    ...AcademicTermContextFieldsSchema.shape,

    targetKind: OperationTargetKind.default("NONE"),
    targetId: z.string().optional().default(""),
    targetLabel: z.string().optional().default(""),

    status: StaffTaskStatus.default("PENDING"),
    priority: StaffTaskPriority.default("NORMAL"),

    dueAt: TimestampMsSchema.optional(),
    availableFrom: TimestampMsSchema.optional(),
    availableUntil: TimestampMsSchema.optional(),

    sourceType: OperationSourceType.default("CUSTOM"),
    sourceId: z.string().optional().default(""),
    sourcePath: z.string().optional().default(""),

    actionLabel: z.string().optional().default(""),
    actionHref: z.string().optional().default(""),

    isArchived: z.boolean().default(false),
  }),
);
export type StaffTask = z.infer<typeof StaffTaskSchema>;

/**
 * Staff Task Read Model
 * نسخة قراءة سريعة ومسطحة لمهام web-staff
 *
 * يمكن بناؤها ديناميكيًا في البداية، ثم تخزينها لاحقًا في:
 * orgs/{orgId}/staffTaskReadModels/{readModelId}
 * أو orgs/{orgId}/staffTasks/{taskId}
 */

export const StaffTaskModuleKey = z.enum([
  "HOME",
  "CLASSES",
  "STUDENTS",
  "ATTENDANCE",
  "MEASUREMENTS",
  "HOMEWORK",
  "LESSON_PREP",
  "LEARNING_LOSS",
  "NOTES",
  "CASES",
  "GAMIFICATION",
  "ACTIVITIES",
  "TRANSPORT",
  "EVALUATIONS",
  "CUSTOM",
]);
export type StaffTaskModuleKey = z.infer<typeof StaffTaskModuleKey>;

export const StaffTaskReadModelSchema = StaffTaskSchema.extend({
  /**
   * مرجع المهمة الأصلية إن كان هذا المستند Read Model مستقلًا
   */
  taskId: z.string().optional().default(""),

  /**
   * بيانات مساعدة للفلترة السريعة
   */
  schoolId: z.string().optional().default(""),
  academicYearId: z.string().optional().default(""),
  gradeId: z.string().optional().default(""),
  classId: z.string().optional().default(""),
  studentId: z.string().optional().default(""),
  staffPersonId: z.string().optional().default(""),
  routeId: z.string().optional().default(""),

  /**
   * الوحدة التي تظهر فيها المهمة داخل web-staff
   */
  moduleKey: StaffTaskModuleKey.default("HOME"),

  /**
   * عناوين جاهزة للعرض بدون قراءة مستندات إضافية
   */
  actorDisplayName: z.string().optional().default(""),
  schoolLabel: z.string().optional().default(""),
  academicYearLabel: z.string().optional().default(""),
  gradeLabel: z.string().optional().default(""),
  classLabel: z.string().optional().default(""),
  studentLabel: z.string().optional().default(""),
  staffLabel: z.string().optional().default(""),
  routeLabel: z.string().optional().default(""),

  /**
   * مفاتيح مساعدة للترتيب والبحث
   */
  dateKey: z.string().optional().default(""),
  dueDateKey: z.string().optional().default(""),
  sortAt: TimestampMsSchema.optional(),
  searchText: z.string().optional().default(""),

  /**
   * مؤشرات سريعة للرئيسية
   */
  isToday: z.boolean().default(false),
  isOverdue: z.boolean().default(false),
  isDraft: z.boolean().default(false),
  isCompleted: z.boolean().default(false),
  completedAt: TimestampMsSchema.optional(),

  /**
   * ملخص عددي اختياري للمهام الجماعية
   */
  targetCount: z.number().int().min(0).default(0),
  completedCount: z.number().int().min(0).default(0),
  missingCount: z.number().int().min(0).default(0),
});
export type StaffTaskReadModel = z.infer<typeof StaffTaskReadModelSchema>;

/**
 * School Day / Student Attendance / Transport Attendance
 * اليوم الدراسي + حضور الطلاب + حضور النقل المدرسي
 */

export const SchoolDayMode = z.enum([
  "ON_SITE",
  "REMOTE",
  "SUSPENDED",
  "HOLIDAY",
]);
export type SchoolDayMode = z.infer<typeof SchoolDayMode>;

export const SchoolDayStatus = z.enum([
  "PLANNED",
  "ACTIVE",
  "CLOSED",
  "CANCELLED",
]);
export type SchoolDayStatus = z.infer<typeof SchoolDayStatus>;

export const SchoolDaySchema = AuditFieldsSchema.merge(
  z.object({
    id: NonEmptyStringSchema,
    orgId: NonEmptyStringSchema,
    schoolId: NonEmptyStringSchema,
    academicYearId: NonEmptyStringSchema,

    /**
     * بداية اليوم الدراسي بصيغة timestamp ms
     * ويفضّل أن تمثل تاريخ اليوم عند 00:00 أو بداية الدوام حسب قراركم
     */
    dayAt: TimestampMsSchema,

    mode: SchoolDayMode.default("ON_SITE"),
    status: SchoolDayStatus.default("PLANNED"),

    /**
     * مثال:
     * - تعليق الدراسة بسبب الأحوال الجوية
     * - تحويل الدراسة عن بُعد
     */
    note: z.string().optional().default(""),

    /**
     * اختياري: لو كان هذا اليوم مرتبطًا بإعلان/قرار رسمي
     */
    sourceRefId: z.string().optional().default(""),
  }),
);
export type SchoolDay = z.infer<typeof SchoolDaySchema>;

export const StudentAttendanceStatus = z.enum([
  "NOT_RECORDED",
  "PRESENT",
  "ABSENT",
  "LATE",
  "EXCUSED_LATE",
  "EXCUSED_ABSENT",
  "LEFT_EARLY",
  "REMOTE_PRESENT",
  "REMOTE_ABSENT",
]);
export type StudentAttendanceStatus = z.infer<typeof StudentAttendanceStatus>;

export const StudentAttendanceSource = z.enum([
  "MANUAL",
  "IMPORT",
  "INTEGRATION",
]);
export type StudentAttendanceSource = z.infer<typeof StudentAttendanceSource>;

export const StudentAttendanceRecordSchema = AuditFieldsSchema.merge(
  z.object({
    id: NonEmptyStringSchema,
    orgId: NonEmptyStringSchema,
    schoolId: NonEmptyStringSchema,
    academicYearId: NonEmptyStringSchema,

    ...AcademicTermContextFieldsSchema.shape,

    schoolDayId: NonEmptyStringSchema,

    studentId: NonEmptyStringSchema,
    enrollmentId: z.string().optional().default(""),
    gradeId: z.string().optional().default(""),
    classId: z.string().optional().default(""),

    status: StudentAttendanceStatus,
    source: StudentAttendanceSource.default("MANUAL"),

    /**
     * ربط سجل الحضور الفردي بدفعة حضور جماعية
     */
    batchId: z.string().optional().default(""),

    /**
     * عادة من يسجل حضور الطلاب:
     * - وكيل شؤون الطلاب
     * ويمكن لاحقًا السماح بجهات أخرى
     */
    recordedByPersonId: NonEmptyStringSchema,
    recorderRoleKey: MembershipRole,

    recordedAt: TimestampMsSchema,

    /**
     * دقائق التأخر.
     * يستخدم مع:
     * - LATE
     * - EXCUSED_LATE
     */
    lateMinutes: z.number().int().min(0).default(0),

    /**
     * دقائق الانصراف المبكر.
     * يستخدم مع:
     * - LEFT_EARLY
     */
    leftEarlyMinutes: z.number().int().min(0).default(0),

    /**
     * سبب العذر أو الملاحظة المرتبطة بالحالة.
     * مثال:
     * - موعد طبي
     * - تأخر بعذر من ولي الأمر
     * - انصراف بإذن الإدارة
     */
    excuseReason: z.string().optional().default(""),

    note: z.string().optional().default(""),
  }),
);
export type StudentAttendanceRecord = z.infer<
  typeof StudentAttendanceRecordSchema
>;

/**
 * Student Attendance Batches
 * دفعات تسجيل حضور الطلاب
 */

export const StudentAttendanceBatchStatus = z.enum([
  "DRAFT",
  "IN_PROGRESS",
  "SUBMITTED",
  "REVIEWED",
  "LOCKED",
  "CANCELLED",
]);
export type StudentAttendanceBatchStatus = z.infer<
  typeof StudentAttendanceBatchStatus
>;

export const StudentAttendanceBatchStudentRowStatus = z.enum([
  "PENDING",
  "COMPLETED",
  "ABSENT",
  "EXCUSED",
  "SKIPPED",
]);
export type StudentAttendanceBatchStudentRowStatus = z.infer<
  typeof StudentAttendanceBatchStudentRowStatus
>;

export const StudentAttendanceBatchRecordRefStatus = z.enum([
  "PENDING",
  "COMPLETED",
  "MISSING",
  "CANCELLED",
]);
export type StudentAttendanceBatchRecordRefStatus = z.infer<
  typeof StudentAttendanceBatchRecordRefStatus
>;

export const StudentAttendanceBatchRecordRefSchema = z.object({
  studentId: NonEmptyStringSchema,
  recordId: z.string().optional().default(""),
  status: StudentAttendanceBatchRecordRefStatus.default("PENDING"),
});
export type StudentAttendanceBatchRecordRef = z.infer<
  typeof StudentAttendanceBatchRecordRefSchema
>;

export const StudentAttendanceBatchStudentRowSchema = z.object({
  studentId: NonEmptyStringSchema,
  studentDisplayName: z.string().optional().default(""),
  enrollmentId: z.string().optional().default(""),

  /**
   * الحالة الافتراضية NOT_RECORDED حتى لا نعتبر الطالب حاضرًا
   * قبل أن يثبت المستخدم الحضور صراحة أو يستخدم إجراء "اعتبار الجميع حاضر".
   */
  status: StudentAttendanceStatus.default("NOT_RECORDED"),

  rowStatus: StudentAttendanceBatchStudentRowStatus.default("PENDING"),

  lateMinutes: z.number().int().min(0).default(0),
  leftEarlyMinutes: z.number().int().min(0).default(0),

  excuseReason: z.string().optional().default(""),
  note: z.string().optional().default(""),

  completed: z.boolean().optional(),
  recordId: z.string().optional().default(""),
});
export type StudentAttendanceBatchStudentRow = z.infer<
  typeof StudentAttendanceBatchStudentRowSchema
>;

export const StudentAttendanceBatchSchema = AuditFieldsSchema.merge(
  z.object({
    id: NonEmptyStringSchema,
    orgId: NonEmptyStringSchema,
    schoolId: NonEmptyStringSchema,
    academicYearId: NonEmptyStringSchema,

    ...AcademicTermContextFieldsSchema.shape,

    schoolDayId: NonEmptyStringSchema,

    gradeId: z.string().optional().default(""),
    classId: z.string().optional().default(""),

    scopeType: OperationScopeType.default("CLASS"),
    scopeId: z.string().optional().default(""),

    status: StudentAttendanceBatchStatus.default("DRAFT"),
    source: StudentAttendanceSource.default("MANUAL"),

    createdByPersonId: NonEmptyStringSchema,
    createdByRoleKey: MembershipRole,

    operationalAssignmentId: z.string().optional().default(""),

    recordedAt: TimestampMsSchema.optional(),
    submittedAt: TimestampMsSchema.optional(),
    reviewedAt: TimestampMsSchema.optional(),
    lockedAt: TimestampMsSchema.optional(),
    cancelledAt: TimestampMsSchema.optional(),

    targetStudentIds: z.array(z.string()).default([]),
    targetCount: z.number().int().min(0).default(0),
    completedCount: z.number().int().min(0).default(0),
    missingCount: z.number().int().min(0).default(0),

    notRecordedCount: z.number().int().min(0).default(0),
    presentCount: z.number().int().min(0).default(0),
    absentCount: z.number().int().min(0).default(0),
    lateCount: z.number().int().min(0).default(0),
    excusedLateCount: z.number().int().min(0).default(0),
    excusedAbsentCount: z.number().int().min(0).default(0),
    leftEarlyCount: z.number().int().min(0).default(0),
    remotePresentCount: z.number().int().min(0).default(0),
    remoteAbsentCount: z.number().int().min(0).default(0),

    studentRows: z.array(StudentAttendanceBatchStudentRowSchema).default([]),
    recordRefs: z.array(StudentAttendanceBatchRecordRefSchema).default([]),

    notes: z.string().optional().default(""),
  }),
);
export type StudentAttendanceBatch = z.infer<
  typeof StudentAttendanceBatchSchema
>;

/**
 * Evaluations
 * تقييمات المعلمين والإداريين
 */

/*
export const EvaluationFrameworkStatus = z.enum([
  "DRAFT",
  "ACTIVE",
  "ARCHIVED",
]);
export type EvaluationFrameworkStatus = z.infer<
  typeof EvaluationFrameworkStatus
>;

export const EvaluationFrequencyType = z.enum([
  "WEEKLY",
  "VISITS",
  "PERIODIC_ANALYSIS",
  "MONTHLY",
  "TERM",
  "CUSTOM",
]);
export type EvaluationFrequencyType = z.infer<typeof EvaluationFrequencyType>;

export const EvaluationCycleType = z.enum([
  "WEEK",
  "VISIT",
  "MONTH",
  "TERM",
  "PERIODIC_ANALYSIS",
  "CUSTOM",
]);
export type EvaluationCycleType = z.infer<typeof EvaluationCycleType>;

export const EvaluationSubmissionStatus = z.enum([
  "DRAFT",
  "SUBMITTED",
  "UNDER_REVIEW",
  "APPROVED",
  "RETURNED",
  "LOCKED",
  "CANCELLED",
]);
export type EvaluationSubmissionStatus = z.infer<
  typeof EvaluationSubmissionStatus
>;

export const EvaluationApprovalMode = z.enum([
  "NONE",
  "OPTIONAL_APPROVAL",
  "REQUIRED_APPROVAL",
]);
export type EvaluationApprovalMode = z.infer<typeof EvaluationApprovalMode>;

export const EvaluationTargetKind = z.enum([
  "TEACHER",
  "STAFF",
  "LEADER",
  "ADMIN",
]);
export type EvaluationTargetKind = z.infer<typeof EvaluationTargetKind>;



export const EvaluationFrameworkSchema = AuditFieldsSchema.merge(
  z.object({
    id: NonEmptyStringSchema,
    orgId: NonEmptyStringSchema,
    schoolId: z.string().optional().default(""),
    title: NonEmptyStringSchema,
    targetRoleKey: MembershipRole,
    targetKind: EvaluationTargetKind.default("TEACHER"),
    status: EvaluationFrameworkStatus.default("DRAFT"),
    version: z.number().int().positive().default(1),
    description: z.string().optional().default(""),
    isActive: z.boolean().default(true),
  }),
);
export type EvaluationFramework = z.infer<typeof EvaluationFrameworkSchema>;

export const EvaluationRubricItemSchema = AuditFieldsSchema.merge(
  z.object({
    id: NonEmptyStringSchema,
    frameworkId: NonEmptyStringSchema,
    templateKey: NonEmptyStringSchema,

    title: NonEmptyStringSchema,
    category: NonEmptyStringSchema,
    description: z.string().optional().default(""),

    order: z.number().int().min(0),
    maxScore: z.number().min(0),
    weight: z.number().min(0).default(1),

    /**
     * يحدد إن كان هذا البند يظهر في تقييمات فئة معينة فقط
     * مثل: أسبوعي / فصلي / أعمال كتابية / تشخيصي
    
    tags: z.array(z.string()).default([]),

    isRequired: z.boolean().default(true),
    isActive: z.boolean().default(true),
  }),
);
export type EvaluationRubricItem = z.infer<typeof EvaluationRubricItemSchema>;

export const EvaluatorPolicySchema = AuditFieldsSchema.merge(
  z.object({
    id: NonEmptyStringSchema,
    orgId: NonEmptyStringSchema,
    schoolId: z.string().optional().default(""),

    evaluatorRoleKey: MembershipRole,
    targetRoleKey: MembershipRole,

    /**
     * مثال:
     * SCHOOL / ORG
     * ويمكن لاحقًا توسيعه إلى GRADE / CLASS إن احتجنا
    
    scopeType: MembershipScopeType.default("SCHOOL"),
    scopeId: z.string().optional().default(""),

    canEvaluate: z.boolean().default(true),
    canApprove: z.boolean().default(false),

    /**
     * مثال:
     * المدير يقيّم الوكيل ومن تحته
     * المشرفة الإدارية تقيّم المديرات
     
    notes: z.string().optional().default(""),

    isActive: z.boolean().default(true),
  }),
);
export type EvaluatorPolicy = z.infer<typeof EvaluatorPolicySchema>;

export const EvaluationPlanSchema = AuditFieldsSchema.merge(
  z.object({
    id: NonEmptyStringSchema,
    frameworkId: NonEmptyStringSchema,
    orgId: z.string().optional().default(""),
    schoolId: z.string().optional().default(""),

    evaluatorRoleKey: MembershipRole,
    targetRoleKey: MembershipRole,
    targetKind: EvaluationTargetKind.default("TEACHER"),

    templateKey: NonEmptyStringSchema,
    title: NonEmptyStringSchema,

    frequencyType: EvaluationFrequencyType,
    cycleType: EvaluationCycleType.optional(),

    weeksCount: z.number().int().min(0).default(0),
    visitsCount: z.number().int().min(0).default(0),
    monthsCount: z.number().int().min(0).default(0),
    termsCount: z.number().int().min(0).default(0),

    approvalMode: EvaluationApprovalMode.default("NONE"),

    /**
     * لتفريق الخطة الأسبوعية عن الفترية عن التحليل عن الأعمال الكتابية...
    
    tags: z.array(z.string()).default([]),

    isActive: z.boolean().default(true),
    description: z.string().optional().default(""),
  }),
);
export type EvaluationPlan = z.infer<typeof EvaluationPlanSchema>;

export const EvaluationCycleSchema = AuditFieldsSchema.merge(
  z.object({
    id: NonEmptyStringSchema,
    planId: NonEmptyStringSchema,
    orgId: z.string().optional().default(""),
    schoolId: z.string().optional().default(""),
    academicYearId: NonEmptyStringSchema,

    cycleType: EvaluationCycleType,
    label: NonEmptyStringSchema,

    /**
     * أمثلة:
     * - الأسبوع الأول
     * - زيارة 1
     * - الشهر الأول
     * - الفصل الدراسي الأول
     
    order: z.number().int().min(0).default(0),

    startsAt: TimestampMsSchema.optional(),
    endsAt: TimestampMsSchema.optional(),

    isOpen: z.boolean().default(true),
    isLocked: z.boolean().default(false),
  }),
);
export type EvaluationCycle = z.infer<typeof EvaluationCycleSchema>;

export const EvaluationSubmissionSchema = AuditFieldsSchema.merge(
  z.object({
    id: NonEmptyStringSchema,
    planId: NonEmptyStringSchema,
    cycleId: z.string().optional().default(""),

    orgId: z.string().optional().default(""),
    schoolId: NonEmptyStringSchema,
    academicYearId: NonEmptyStringSchema,

    evaluatorPersonId: NonEmptyStringSchema,
    evaluatorRoleKey: MembershipRole.optional(),

    /**
     * أبقينا targetTeacherPersonId للتوافق مع البيانات الحالية
     * وأضافنا targetPersonId ليعمل للمعلمين والإداريين معًا
     
    targetPersonId: z.string().optional().default(""),
    targetTeacherPersonId: z.string().optional().default(""),
    targetRoleKey: MembershipRole.optional(),

    cycleLabel: NonEmptyStringSchema,
    templateKey: z.string().optional().default(""),

    status: EvaluationSubmissionStatus.default("DRAFT"),

    submittedAt: TimestampMsSchema.optional(),
    reviewedAt: TimestampMsSchema.optional(),
    approvedAt: TimestampMsSchema.optional(),
    lockedAt: TimestampMsSchema.optional(),

    reviewedByPersonId: z.string().optional().default(""),
    approvedByPersonId: z.string().optional().default(""),

    totalScore: z.number().min(0).default(0),
    maxScore: z.number().min(0).default(0),
    weightedScore: z.number().min(0).default(0),

    summary: z.string().optional().default(""),
    recommendations: z.string().optional().default(""),
  }),
).superRefine((data, ctx) => {
  if (!data.targetPersonId && !data.targetTeacherPersonId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "يجب توفير targetPersonId أو targetTeacherPersonId على الأقل",
      path: ["targetPersonId"],
    });
  }
});
export type EvaluationSubmission = z.infer<typeof EvaluationSubmissionSchema>;

export const EvaluationSubmissionItemScoreSchema = AuditFieldsSchema.merge(
  z.object({
    id: NonEmptyStringSchema,
    submissionId: NonEmptyStringSchema,
    rubricItemId: NonEmptyStringSchema,

    title: NonEmptyStringSchema,
    category: z.string().optional().default(""),

    score: z.number().min(0).default(0),
    maxScore: z.number().min(0).default(0),
    weight: z.number().min(0).default(1),

    comment: z.string().optional().default(""),
  }),
);
export type EvaluationSubmissionItemScore = z.infer<
  typeof EvaluationSubmissionItemScoreSchema
>;

export const EvaluationSummaryReadModelSchema = AuditFieldsSchema.merge(
  z.object({
    id: NonEmptyStringSchema,
    orgId: NonEmptyStringSchema,
    schoolId: z.string().optional().default(""),
    academicYearId: NonEmptyStringSchema,

    targetPersonId: NonEmptyStringSchema,
    targetRoleKey: MembershipRole.optional(),

    submissionsCount: z.number().int().min(0).default(0),
    approvedSubmissionsCount: z.number().int().min(0).default(0),

    totalScore: z.number().min(0).default(0),
    maxScore: z.number().min(0).default(0),
    percentage: z.number().min(0).default(0),

    lastSubmissionAt: TimestampMsSchema.optional(),
    lastCycleLabel: z.string().optional().default(""),
  }),
);
export type EvaluationSummaryReadModel = z.infer<
  typeof EvaluationSummaryReadModelSchema
>;


*/

/**
 * Promotion / year close
 */
export const PromotionMappingSchema = z.object({
  fromGradeCode: NonEmptyStringSchema,
  toGradeCode: NonEmptyStringSchema,
});
export type PromotionMapping = z.infer<typeof PromotionMappingSchema>;

export const PromotionPolicySchema = AuditFieldsSchema.merge(
  z.object({
    id: NonEmptyStringSchema,
    orgId: NonEmptyStringSchema,
    schoolType: SchoolType,
    mappings: z.array(PromotionMappingSchema).default([]),
  }),
);
export type PromotionPolicy = z.infer<typeof PromotionPolicySchema>;

export const PromotionRunStatus = z.enum([
  "DRAFT",
  "PREVIEWED",
  "APPROVED",
  "EXECUTED",
  "ROLLED_BACK",
  "FAILED",
]);
export type PromotionRunStatus = z.infer<typeof PromotionRunStatus>;

export const PromotionRunSchema = AuditFieldsSchema.merge(
  z.object({
    id: NonEmptyStringSchema,
    orgId: NonEmptyStringSchema,
    schoolId: NonEmptyStringSchema,
    fromAcademicYearId: NonEmptyStringSchema,
    toAcademicYearId: NonEmptyStringSchema,
    status: PromotionRunStatus.default("DRAFT"),
    createdByPersonId: NonEmptyStringSchema,
    approvedByPersonId: z.string().optional().default(""),
    executedByPersonId: z.string().optional().default(""),
    createdAt: TimestampMsSchema,
    approvedAt: TimestampMsSchema.optional(),
    executedAt: TimestampMsSchema.optional(),
  }),
);
export type PromotionRun = z.infer<typeof PromotionRunSchema>;

/**
 * Classroom Display / Gamification
 */
export const ClassroomDisplayMode = z.enum([
  "CLASS_ONLY",
  "STUDENT_ONLY",
  "CLASS_AND_STUDENT",
]);
export type ClassroomDisplayMode = z.infer<typeof ClassroomDisplayMode>;

export const ClassroomDisplayPolicySchema = AuditFieldsSchema.merge(
  z.object({
    id: NonEmptyStringSchema,
    schoolId: NonEmptyStringSchema,
    defaultMode: ClassroomDisplayMode.default("CLASS_AND_STUDENT"),
    privacyLevel: DisplayPrivacyLevel.default("NICKNAME"),
    allowFullName: z.boolean().default(false),
    allowStudentLeaderboard: z.boolean().default(true),
    allowTeamMode: z.boolean().default(true),
    allowClassMode: z.boolean().default(true),
  }),
);
export type ClassroomDisplayPolicy = z.infer<
  typeof ClassroomDisplayPolicySchema
>;

export const OctalysisSettingsSchema = z.object({
  meaning: z.boolean().default(true),
  accomplishment: z.boolean().default(true),
  empowerment: z.boolean().default(true),
  ownership: z.boolean().default(true),
  socialInfluence: z.boolean().default(true),
  scarcity: z.boolean().default(true),
  unpredictability: z.boolean().default(true),
  avoidance: z.boolean().default(true),
});
export type OctalysisSettings = z.infer<typeof OctalysisSettingsSchema>;

export const GamificationFeaturesSchema = z.object({
  classXP: z.boolean().default(true),
  studentXP: z.boolean().default(true),
  badges: z.boolean().default(true),
  quests: z.boolean().default(true),
  streaks: z.boolean().default(true),
  teams: z.boolean().default(true),
  mysteryRewards: z.boolean().default(true),
  leaderboard: z.boolean().default(true),
});
export type GamificationFeatures = z.infer<typeof GamificationFeaturesSchema>;

export const GamificationSettingsSchema = AuditFieldsSchema.merge(
  z.object({
    id: NonEmptyStringSchema,
    schoolId: NonEmptyStringSchema,
    enabled: z.boolean().default(true),
    octalysis: OctalysisSettingsSchema.default({}),
    features: GamificationFeaturesSchema.default({}),
  }),
);
export type GamificationSettings = z.infer<typeof GamificationSettingsSchema>;

export const ClassSessionStatus = z.enum([
  "ACTIVE",
  "PAUSED",
  "ENDED",
  "CANCELLED",
]);
export type ClassSessionStatus = z.infer<typeof ClassSessionStatus>;

export const ClassSessionSchema = AuditFieldsSchema.merge(
  z.object({
    id: NonEmptyStringSchema,
    orgId: NonEmptyStringSchema,
    schoolId: NonEmptyStringSchema,
    academicYearId: NonEmptyStringSchema,
    classId: NonEmptyStringSchema,
    teacherPersonId: NonEmptyStringSchema,
    startedAt: TimestampMsSchema,
    endedAt: TimestampMsSchema.optional(),
    status: ClassSessionStatus.default("ACTIVE"),
    displayPolicyId: z.string().optional().default(""),
  }),
);
export type ClassSession = z.infer<typeof ClassSessionSchema>;

export const GamificationEventType = z.enum([
  "CLASS_XP_ADD",
  "CLASS_XP_REMOVE",
  "STUDENT_XP_ADD",
  "STUDENT_XP_REMOVE",
  "BADGE_AWARDED",
  "STREAK_UPDATED",
]);
export type GamificationEventType = z.infer<typeof GamificationEventType>;

export const GamificationEventSchema = AuditFieldsSchema.merge(
  z.object({
    id: NonEmptyStringSchema,
    sessionId: NonEmptyStringSchema,
    schoolId: NonEmptyStringSchema,
    classId: NonEmptyStringSchema,
    studentId: z.string().optional().default(""),
    type: GamificationEventType,
    value: z.number(),
    createdByPersonId: NonEmptyStringSchema,
    createdAt: TimestampMsSchema,
    note: z.string().optional().default(""),
  }),
);
export type GamificationEvent = z.infer<typeof GamificationEventSchema>;

/**
 * Student Gamification Events
 * أحداث تحفيز الطلاب داخل web-staff و Classroom Display
 */

export const StudentGamificationEventType = z.enum([
  "XP_ADD",
  "XP_REMOVE",
  "POINTS_ADD",
  "POINTS_REMOVE",
  "BADGE_AWARDED",
  "BADGE_REVOKED",
  "STREAK_UPDATED",
  "LEVEL_UP",
  "POSITIVE_NOTE",
  "QUEST_COMPLETED",
  "CUSTOM",
]);
export type StudentGamificationEventType = z.infer<
  typeof StudentGamificationEventType
>;

export const StudentGamificationEventVisibility = z.enum([
  "STAFF_ONLY",
  "STUDENT_DISPLAY",
  "GUARDIAN_VISIBLE",
  "STUDENT_AND_GUARDIAN_VISIBLE",
  "PUBLIC_LEADERBOARD",
  "EVERYONE",
]);
export type StudentGamificationEventVisibility = z.infer<
  typeof StudentGamificationEventVisibility
>;

export const StudentGamificationEventStatus = z.enum([
  "ACTIVE",
  "REVERSED",
  "CANCELLED",
]);
export type StudentGamificationEventStatus = z.infer<
  typeof StudentGamificationEventStatus
>;

export const StudentGamificationValueKind = z.enum([
  "XP",
  "POINTS",
  "BADGE_VALUE",
  "STREAK",
  "LEVEL",
  "CUSTOM",
]);
export type StudentGamificationValueKind = z.infer<
  typeof StudentGamificationValueKind
>;

export const StudentGamificationEventSourceType = z.enum([
  "MANUAL",
  "CLASSROOM_DISPLAY",

  "CLASS_SUBJECT_OFFERING",

  "STUDENT_MEASUREMENT_BATCH",
  "STUDENT_ASSESSMENT_RECORD",
  "STUDENT_TRACKER_ENTRY",

  "STUDENT_ATTENDANCE_BATCH",

  "STUDENT_HOMEWORK_ASSIGNMENT",
  "STUDENT_HOMEWORK_SUBMISSION",

  "QUESTION_BANK_ITEM",

  "STUDENT_NOTE",
  "STUDENT_CASE",
  "LEARNING_LOSS_PLAN",

  "CUSTOM",
]);
export type StudentGamificationEventSourceType = z.infer<
  typeof StudentGamificationEventSourceType
>;

export const StudentGamificationEventSchema = AuditFieldsSchema.merge(
  z.object({
    id: NonEmptyStringSchema,

    orgId: NonEmptyStringSchema,
    schoolId: NonEmptyStringSchema,
    academicYearId: NonEmptyStringSchema,

    /**
     * سياق الفصل الدراسي.
     * مهم للتقارير، وتطبيق ولي الأمر، وشاشة الفصل، وعدم خلط أحداث التحفيز بين الفصول الدراسية.
     */
    termId: z.string().optional().default(""),
    termTitle: z.string().optional().default(""),
    termShortTitle: z.string().optional().default(""),

    /**
     * الطالب والسياق الدراسي.
     */
    studentId: NonEmptyStringSchema,
    enrollmentId: z.string().optional().default(""),
    gradeId: z.string().optional().default(""),
    streamId: z.string().optional().default(""),
    classId: z.string().optional().default(""),

    /**
     * سياق المادة.
     * يجعل التحفيز مرتبطًا بمادة محددة مثل الواجبات وبنك الأسئلة.
     */
    subjectKey: z.string().optional().default(""),
    classSubjectOfferingId: z.string().optional().default(""),

    /**
     * ربط الحدث بالإسناد الذي سمح بإنشائه.
     */
    teacherAssignmentId: z.string().optional().default(""),
    operationalAssignmentId: z.string().optional().default(""),

    eventType: StudentGamificationEventType,
    status: StudentGamificationEventStatus.default("ACTIVE"),
    visibility: StudentGamificationEventVisibility.default("STUDENT_DISPLAY"),

    title: z.string().optional().default(""),
    description: z.string().optional().default(""),

    /**
     * سبب التحفيز وتصنيفه.
     * reasonKey يصلح للربط بسياسات أو قوالب لاحقًا.
     */
    reasonKey: z.string().optional().default(""),
    reasonTitle: z.string().optional().default(""),
    category: z.string().optional().default(""),
    categoryTitle: z.string().optional().default(""),

    /**
     * القيمة العددية، مثل XP أو نقاط.
     */
    value: z.number().default(0),
    valueKind: StudentGamificationValueKind.default("POINTS"),

    /**
     * بيانات الشارة أو المستوى أو المهمة.
     */
    badgeKey: z.string().optional().default(""),
    badgeTitle: z.string().optional().default(""),
    levelKey: z.string().optional().default(""),
    questKey: z.string().optional().default(""),

    /**
     * للتحفيز الجماعي.
     * كل طالب له Event مستقل، لكن يمكن ربطهم بنفس groupEventId.
     */
    groupEventId: z.string().optional().default(""),
    groupEventTitle: z.string().optional().default(""),

    /**
     * من أنشأ الحدث.
     */
    createdByPersonId: NonEmptyStringSchema,
    createdByRoleKey: MembershipRole.optional(),
    occurredAt: TimestampMsSchema,

    /**
     * ربط اختياري بجلسة العرض أو مصدر التشغيل.
     */
    sessionId: z.string().optional().default(""),
    sourceType: StudentGamificationEventSourceType.default("MANUAL"),
    sourceId: z.string().optional().default(""),
    sourcePath: z.string().optional().default(""),

    /**
     * عند عكس الحدث أو إلغائه.
     */
    reversedAt: TimestampMsSchema.optional(),
    reversedByPersonId: z.string().optional().default(""),
    reverseReason: z.string().optional().default(""),

    cancelledAt: TimestampMsSchema.optional(),
    cancelledByPersonId: z.string().optional().default(""),
    cancelReason: z.string().optional().default(""),

    note: z.string().optional().default(""),
  }),
).superRefine((data, ctx) => {
  if (data.status === "REVERSED" && !data.reversedAt) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "يجب توفير reversedAt عند عكس حدث التحفيز",
      path: ["reversedAt"],
    });
  }

  if (data.status === "CANCELLED" && !data.cancelledAt) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "يجب توفير cancelledAt عند إلغاء حدث التحفيز",
      path: ["cancelledAt"],
    });
  }
});
export type StudentGamificationEvent = z.infer<
  typeof StudentGamificationEventSchema
>;

/**
 * Student Gamification Summary Snapshot
 * ملخص خفيف لأحداث تحفيز الطالب
 *
 * الهدف:
 * - لا يقرأ تطبيق ولي الأمر/الطالب كل الأحداث الخام.
 * - نجهّز ملخصًا سريعًا للعرض لاحقًا.
 */

export const StudentGamificationSubjectSummarySnapshotSchema = z.object({
  subjectKey: z.string().optional().default(""),
  subjectTitle: z.string().optional().default(""),
  classSubjectOfferingId: z.string().optional().default(""),

  totalEvents: z.number().int().min(0).default(0),
  activeEvents: z.number().int().min(0).default(0),

  totalPoints: z.number().default(0),
  totalXp: z.number().default(0),

  badgeAwardedCount: z.number().int().min(0).default(0),
  badgeRevokedCount: z.number().int().min(0).default(0),
  netBadgeCount: z.number().int().default(0),

  streakEventCount: z.number().int().min(0).default(0),
  levelUpEventCount: z.number().int().min(0).default(0),

  latestEventAt: TimestampMsSchema.optional(),
});
export type StudentGamificationSubjectSummarySnapshot = z.infer<
  typeof StudentGamificationSubjectSummarySnapshotSchema
>;

export const StudentGamificationRecentEventSnapshotSchema = z.object({
  id: NonEmptyStringSchema,

  studentId: NonEmptyStringSchema,

  eventType: StudentGamificationEventType,
  status: StudentGamificationEventStatus.default("ACTIVE"),
  visibility: StudentGamificationEventVisibility.default("STUDENT_DISPLAY"),

  title: z.string().optional().default(""),
  description: z.string().optional().default(""),

  reasonKey: z.string().optional().default(""),
  reasonTitle: z.string().optional().default(""),

  category: z.string().optional().default(""),
  categoryTitle: z.string().optional().default(""),

  value: z.number().default(0),
  valueKind: StudentGamificationValueKind.default("POINTS"),

  badgeKey: z.string().optional().default(""),
  badgeTitle: z.string().optional().default(""),

  subjectKey: z.string().optional().default(""),
  subjectTitle: z.string().optional().default(""),
  classSubjectOfferingId: z.string().optional().default(""),

  occurredAt: TimestampMsSchema,
});
export type StudentGamificationRecentEventSnapshot = z.infer<
  typeof StudentGamificationRecentEventSnapshotSchema
>;

export const StudentGamificationSummarySnapshotSchema = AuditFieldsSchema.merge(
  z.object({
    id: NonEmptyStringSchema,

    orgId: NonEmptyStringSchema,
    schoolId: NonEmptyStringSchema,
    academicYearId: NonEmptyStringSchema,

    termId: z.string().optional().default(""),
    termTitle: z.string().optional().default(""),
    termShortTitle: z.string().optional().default(""),

    studentId: NonEmptyStringSchema,
    enrollmentId: z.string().optional().default(""),

    gradeId: z.string().optional().default(""),
    streamId: z.string().optional().default(""),
    classId: z.string().optional().default(""),

    /**
     * الأرقام العامة.
     */
    totalEvents: z.number().int().min(0).default(0),
    activeEvents: z.number().int().min(0).default(0),

    totalPoints: z.number().default(0),
    totalXp: z.number().default(0),

    badgeAwardedCount: z.number().int().min(0).default(0),
    badgeRevokedCount: z.number().int().min(0).default(0),
    netBadgeCount: z.number().int().default(0),

    streakEventCount: z.number().int().min(0).default(0),
    levelUpEventCount: z.number().int().min(0).default(0),

    latestEventAt: TimestampMsSchema.optional(),

    /**
     * عدادات الظهور.
     */
    staffOnlyEventsCount: z.number().int().min(0).default(0),
    studentDisplayEventsCount: z.number().int().min(0).default(0),
    guardianVisibleEventsCount: z.number().int().min(0).default(0),
    publicLeaderboardEventsCount: z.number().int().min(0).default(0),

    /**
     * عدادات مريحة للعرض.
     */
    studentVisibleEventsCount: z.number().int().min(0).default(0),
    guardianEligibleEventsCount: z.number().int().min(0).default(0),

    /**
     * ملخص حسب المادة.
     */
    bySubject: z
      .array(StudentGamificationSubjectSummarySnapshotSchema)
      .default([]),

    /**
     * آخر الأحداث الخفيفة.
     * ليست كل الأحداث الخام.
     */
    recentEvents: z
      .array(StudentGamificationRecentEventSnapshotSchema)
      .default([]),

    /**
     * وقت بناء الملخص.
     */
    computedAt: TimestampMsSchema,
  }),
);
export type StudentGamificationSummarySnapshot = z.infer<
  typeof StudentGamificationSummarySnapshotSchema
>;

/**
 * Gamification Catalog
 * كتالوج التحفيز
 *
 * الهدف:
 * - أسباب جاهزة للتحفيز بدل النص الحر فقط.
 * - شارات جاهزة يمكن منحها للطلاب.
 * - قابل للتوسعة لاحقًا للمستويات والقواعد التلقائية.
 */

export const GamificationCatalogScopeType = z.enum([
  "ORG",
  "SCHOOL",
  "ACADEMIC_YEAR",
  "TERM",
  "GRADE",
  "CLASS",
  "SUBJECT",
  "CLASS_SUBJECT_OFFERING",
]);
export type GamificationCatalogScopeType = z.infer<
  typeof GamificationCatalogScopeType
>;

export const GamificationCatalogStatus = z.enum([
  "ACTIVE",
  "INACTIVE",
  "ARCHIVED",
]);
export type GamificationCatalogStatus = z.infer<
  typeof GamificationCatalogStatus
>;

export const GamificationBadgeKind = z.enum([
  "PARTICIPATION",
  "ACHIEVEMENT",
  "IMPROVEMENT",
  "BEHAVIOR",
  "HOMEWORK",
  "ATTENDANCE",
  "TEAMWORK",
  "READING",
  "QURAN",
  "CUSTOM",
]);
export type GamificationBadgeKind = z.infer<typeof GamificationBadgeKind>;

export const GamificationReasonKind = z.enum([
  "PARTICIPATION",
  "HOMEWORK_COMPLETED",
  "HOMEWORK_EXCELLENT",
  "ASSESSMENT_EXCELLENT",
  "IMPROVEMENT",
  "POSITIVE_BEHAVIOR",
  "TEAMWORK",
  "ATTENDANCE_COMMITMENT",
  "SKILL_MASTERY",
  "QURAN_RECITATION",
  "CUSTOM",
]);
export type GamificationReasonKind = z.infer<typeof GamificationReasonKind>;

export const GamificationCatalogVisibility = z.enum([
  "STAFF_ONLY",
  "STUDENT_DISPLAY",
  "GUARDIAN_VISIBLE",
  "PUBLIC_LEADERBOARD",
  "EVERYONE",
]);
export type GamificationCatalogVisibility = z.infer<
  typeof GamificationCatalogVisibility
>;

export const GamificationBadgeSchema = AuditFieldsSchema.merge(
  z.object({
    id: NonEmptyStringSchema,

    orgId: NonEmptyStringSchema,

    /**
     * نطاق إتاحة الشارة.
     * مثال:
     * - شارة عامة للمؤسسة
     * - شارة خاصة بمدرسة
     * - شارة خاصة بمادة
     */
    scopeType: GamificationCatalogScopeType.default("ORG"),
    scopeId: z.string().optional().default(""),

    schoolId: z.string().optional().default(""),
    academicYearId: z.string().optional().default(""),
    termId: z.string().optional().default(""),

    gradeId: z.string().optional().default(""),
    classId: z.string().optional().default(""),

    subjectKey: z.string().optional().default(""),
    classSubjectOfferingId: z.string().optional().default(""),

    key: NonEmptyStringSchema,
    title: NonEmptyStringSchema,
    description: z.string().optional().default(""),

    kind: GamificationBadgeKind.default("CUSTOM"),
    category: z.string().optional().default(""),
    categoryTitle: z.string().optional().default(""),

    /**
     * أيقونة أو صورة الشارة.
     * في البداية يمكن استخدام emoji/iconKey فقط.
     * imageUrl اختياري لاحقًا.
     */
    iconKey: z.string().optional().default(""),
    emoji: z.string().optional().default(""),
    imageUrl: z.string().optional().default(""),

    /**
     * لون اختياري للعرض.
     */
    color: z.string().optional().default(""),
    backgroundColor: z.string().optional().default(""),

    /**
     * القيمة الافتراضية عند منح الشارة.
     */
    defaultValue: z.number().default(0),
    defaultValueKind: StudentGamificationValueKind.default("BADGE_VALUE"),

    defaultVisibility:
      StudentGamificationEventVisibility.default("STUDENT_DISPLAY"),

    order: z.number().int().min(0).default(0),
    status: GamificationCatalogStatus.default("ACTIVE"),

    createdByPersonId: z.string().optional().default(""),
  }),
);
export type GamificationBadge = z.infer<typeof GamificationBadgeSchema>;

export const GamificationReasonSchema = AuditFieldsSchema.merge(
  z.object({
    id: NonEmptyStringSchema,

    orgId: NonEmptyStringSchema,

    /**
     * نطاق إتاحة سبب التحفيز.
     */
    scopeType: GamificationCatalogScopeType.default("ORG"),
    scopeId: z.string().optional().default(""),

    schoolId: z.string().optional().default(""),
    academicYearId: z.string().optional().default(""),
    termId: z.string().optional().default(""),

    gradeId: z.string().optional().default(""),
    classId: z.string().optional().default(""),

    subjectKey: z.string().optional().default(""),
    classSubjectOfferingId: z.string().optional().default(""),

    key: NonEmptyStringSchema,
    title: NonEmptyStringSchema,
    description: z.string().optional().default(""),

    kind: GamificationReasonKind.default("CUSTOM"),
    category: z.string().optional().default(""),
    categoryTitle: z.string().optional().default(""),

    /**
     * نوع الحدث الافتراضي عند اختيار هذا السبب.
     */
    defaultEventType: StudentGamificationEventType.default("POINTS_ADD"),
    defaultValue: z.number().default(5),
    defaultValueKind: StudentGamificationValueKind.default("POINTS"),
    defaultVisibility:
      StudentGamificationEventVisibility.default("STUDENT_DISPLAY"),

    /**
     * ربط اختياري بشارة جاهزة.
     * مثال:
     * سبب "إتقان مهارة" يمنح شارة "متقن المهارة".
     */
    badgeKey: z.string().optional().default(""),
    badgeId: z.string().optional().default(""),

    /**
     * هل يظهر هذا السبب في صفحة التحفيز اليدوي؟
     */
    isManual: z.boolean().default(true),

    /**
     * لاحقًا يمكن أن تستخدمه القواعد التلقائية.
     */
    sourceType: StudentGamificationEventSourceType.default("MANUAL"),

    order: z.number().int().min(0).default(0),
    status: GamificationCatalogStatus.default("ACTIVE"),

    createdByPersonId: z.string().optional().default(""),
  }),
);
export type GamificationReason = z.infer<typeof GamificationReasonSchema>;

/**
 * Gamification Rules & Levels
 * قواعد المستويات والإنجازات
 *
 * الهدف:
 * - حساب مستوى الطالب حسب النقاط / XP / الشارات.
 * - فتح إنجاز أو شارة تلقائيًا عند تحقق شرط معين.
 */

export const GamificationLevelRuleSchema = AuditFieldsSchema.merge(
  z.object({
    id: NonEmptyStringSchema,

    orgId: NonEmptyStringSchema,

    /**
     * نطاق تطبيق قاعدة المستوى.
     * مثال:
     * - مستوى عام على المؤسسة
     * - مستوى خاص بمدرسة
     * - مستوى خاص بمادة
     */
    scopeType: GamificationCatalogScopeType.default("ORG"),
    scopeId: z.string().optional().default(""),

    schoolId: z.string().optional().default(""),
    academicYearId: z.string().optional().default(""),
    termId: z.string().optional().default(""),

    gradeId: z.string().optional().default(""),
    classId: z.string().optional().default(""),

    subjectKey: z.string().optional().default(""),
    classSubjectOfferingId: z.string().optional().default(""),

    key: NonEmptyStringSchema,
    title: NonEmptyStringSchema,
    description: z.string().optional().default(""),

    /**
     * رقم المستوى.
     * مثال:
     * 1 = مبتدئ
     * 2 = نشيط
     * 3 = متميز
     */
    levelNumber: z.number().int().min(1),

    /**
     * شروط الوصول للمستوى.
     * يمكن استخدام النقاط أو XP أو الشارات أو أكثر من شرط.
     */
    minPoints: z.number().min(0).default(0),
    minXp: z.number().min(0).default(0),
    minBadges: z.number().int().min(0).default(0),

    /**
     * بيانات العرض.
     */
    iconKey: z.string().optional().default(""),
    emoji: z.string().optional().default(""),
    imageUrl: z.string().optional().default(""),

    color: z.string().optional().default(""),
    backgroundColor: z.string().optional().default(""),

    /**
     * مكافأة اختيارية عند الوصول للمستوى.
     */
    rewardBadgeId: z.string().optional().default(""),
    rewardBadgeKey: z.string().optional().default(""),

    rewardValue: z.number().default(0),
    rewardValueKind: StudentGamificationValueKind.default("CUSTOM"),

    order: z.number().int().min(0).default(0),
    status: GamificationCatalogStatus.default("ACTIVE"),

    createdByPersonId: z.string().optional().default(""),
  }),
);
export type GamificationLevelRule = z.infer<typeof GamificationLevelRuleSchema>;

export const GamificationAchievementKind = z.enum([
  "PARTICIPATION",
  "ACHIEVEMENT",
  "IMPROVEMENT",
  "HOMEWORK",
  "ATTENDANCE",
  "BEHAVIOR",
  "TEAMWORK",
  "READING",
  "QURAN",
  "LEVEL",
  "CUSTOM",
]);
export type GamificationAchievementKind = z.infer<
  typeof GamificationAchievementKind
>;

export const GamificationAchievementTriggerMetric = z.enum([
  /**
   * حسب إجمالي النقاط.
   */
  "TOTAL_POINTS",

  /**
   * حسب إجمالي XP.
   */
  "TOTAL_XP",

  /**
   * حسب عدد الشارات.
   */
  "BADGE_COUNT",

  /**
   * حسب عدد مرات سبب معين.
   * مثال: مشاركة مميزة 10 مرات.
   */
  "REASON_COUNT",

  /**
   * حسب عدد مرات نوع حدث معين.
   * مثال: POINTS_ADD عشر مرات.
   */
  "EVENT_TYPE_COUNT",

  /**
   * حسب الوصول لمستوى معين.
   */
  "LEVEL_REACHED",

  /**
   * مخصص لاحقًا.
   */
  "CUSTOM",
]);
export type GamificationAchievementTriggerMetric = z.infer<
  typeof GamificationAchievementTriggerMetric
>;

export const GamificationAchievementRuleSchema = AuditFieldsSchema.merge(
  z.object({
    id: NonEmptyStringSchema,

    orgId: NonEmptyStringSchema,

    /**
     * نطاق تطبيق قاعدة الإنجاز.
     */
    scopeType: GamificationCatalogScopeType.default("ORG"),
    scopeId: z.string().optional().default(""),

    schoolId: z.string().optional().default(""),
    academicYearId: z.string().optional().default(""),
    termId: z.string().optional().default(""),

    gradeId: z.string().optional().default(""),
    classId: z.string().optional().default(""),

    subjectKey: z.string().optional().default(""),
    classSubjectOfferingId: z.string().optional().default(""),

    key: NonEmptyStringSchema,
    title: NonEmptyStringSchema,
    description: z.string().optional().default(""),

    kind: GamificationAchievementKind.default("CUSTOM"),

    category: z.string().optional().default(""),
    categoryTitle: z.string().optional().default(""),

    /**
     * ما الذي يفتح هذا الإنجاز؟
     */
    triggerMetric: GamificationAchievementTriggerMetric.default("TOTAL_POINTS"),

    /**
     * قيمة الشرط.
     * مثال:
     * - 50 نقطة
     * - 5 شارات
     * - 10 مرات مشاركة
     */
    thresholdValue: z.number().min(0).default(1),

    /**
     * فلاتر اختيارية للشرط.
     */
    triggerEventType: StudentGamificationEventType.optional(),
    triggerReasonKey: z.string().optional().default(""),
    triggerBadgeKey: z.string().optional().default(""),
    triggerLevelKey: z.string().optional().default(""),

    /**
     * هل الشرط خاص بمادة معينة؟
     */
    requiredSubjectKey: z.string().optional().default(""),
    requiredClassSubjectOfferingId: z.string().optional().default(""),

    /**
     * ما المكافأة عند فتح الإنجاز؟
     */
    rewardEventType: StudentGamificationEventType.default("BADGE_AWARDED"),

    rewardBadgeId: z.string().optional().default(""),
    rewardBadgeKey: z.string().optional().default(""),
    rewardBadgeTitle: z.string().optional().default(""),

    rewardValue: z.number().default(0),
    rewardValueKind: StudentGamificationValueKind.default("BADGE_VALUE"),

    defaultVisibility:
      StudentGamificationEventVisibility.default("STUDENT_DISPLAY"),

    /**
     * هل يمكن فتح الإنجاز أكثر من مرة؟
     */
    isRepeatable: z.boolean().default(false),

    /**
     * حد التكرار إن كان repeatable.
     * 0 يعني بدون حد.
     */
    repeatLimit: z.number().int().min(0).default(0),

    /**
     * بيانات العرض.
     */
    iconKey: z.string().optional().default(""),
    emoji: z.string().optional().default(""),
    imageUrl: z.string().optional().default(""),

    color: z.string().optional().default(""),
    backgroundColor: z.string().optional().default(""),

    order: z.number().int().min(0).default(0),
    status: GamificationCatalogStatus.default("ACTIVE"),

    createdByPersonId: z.string().optional().default(""),
  }),
);
export type GamificationAchievementRule = z.infer<
  typeof GamificationAchievementRuleSchema
>;

/**
 * Student / Guardian Gamification Views
 * نماذج عرض آمنة وخفيفة للطالب وولي الأمر
 *
 * الهدف:
 * - لا نكشف التفاصيل التشغيلية مثل createdByPersonId / sourcePath / assignments.
 * - نعرض فقط ما يصلح للطالب أو ولي الأمر أو شاشة الفصل لاحقًا.
 */

export const StudentGamificationPublicAudience = z.enum([
  "STUDENT",
  "GUARDIAN",
  "CLASSROOM_DISPLAY",
  "PUBLIC_LEADERBOARD",
]);
export type StudentGamificationPublicAudience = z.infer<
  typeof StudentGamificationPublicAudience
>;

export const StudentGamificationPublicEventSchema = z.object({
  id: NonEmptyStringSchema,

  orgId: NonEmptyStringSchema,
  schoolId: NonEmptyStringSchema,
  academicYearId: NonEmptyStringSchema,

  termId: z.string().optional().default(""),
  termTitle: z.string().optional().default(""),
  termShortTitle: z.string().optional().default(""),

  studentId: NonEmptyStringSchema,
  enrollmentId: z.string().optional().default(""),

  gradeId: z.string().optional().default(""),
  streamId: z.string().optional().default(""),
  classId: z.string().optional().default(""),

  subjectKey: z.string().optional().default(""),
  subjectTitle: z.string().optional().default(""),
  classSubjectOfferingId: z.string().optional().default(""),

  eventType: StudentGamificationEventType,
  visibility: StudentGamificationEventVisibility,

  title: z.string().optional().default(""),
  description: z.string().optional().default(""),

  reasonKey: z.string().optional().default(""),
  reasonTitle: z.string().optional().default(""),

  category: z.string().optional().default(""),
  categoryTitle: z.string().optional().default(""),

  value: z.number().default(0),
  valueKind: StudentGamificationValueKind.default("POINTS"),

  badgeKey: z.string().optional().default(""),
  badgeTitle: z.string().optional().default(""),

  occurredAt: TimestampMsSchema,
});
export type StudentGamificationPublicEvent = z.infer<
  typeof StudentGamificationPublicEventSchema
>;

export const StudentGamificationPublicSubjectSummarySchema = z.object({
  subjectKey: z.string().optional().default(""),
  subjectTitle: z.string().optional().default(""),
  classSubjectOfferingId: z.string().optional().default(""),

  totalEvents: z.number().int().min(0).default(0),

  totalPoints: z.number().default(0),
  totalXp: z.number().default(0),

  badgeAwardedCount: z.number().int().min(0).default(0),
  netBadgeCount: z.number().int().default(0),

  latestEventAt: TimestampMsSchema.optional(),
});
export type StudentGamificationPublicSubjectSummary = z.infer<
  typeof StudentGamificationPublicSubjectSummarySchema
>;

export const StudentGamificationStudentViewSchema = AuditFieldsSchema.merge(
  z.object({
    id: NonEmptyStringSchema,

    orgId: NonEmptyStringSchema,
    schoolId: NonEmptyStringSchema,
    academicYearId: NonEmptyStringSchema,

    termId: z.string().optional().default(""),
    termTitle: z.string().optional().default(""),
    termShortTitle: z.string().optional().default(""),

    studentId: NonEmptyStringSchema,
    enrollmentId: z.string().optional().default(""),

    gradeId: z.string().optional().default(""),
    streamId: z.string().optional().default(""),
    classId: z.string().optional().default(""),

    audience: StudentGamificationPublicAudience.default("STUDENT"),

    totalVisibleEvents: z.number().int().min(0).default(0),

    totalPoints: z.number().default(0),
    totalXp: z.number().default(0),

    badgeAwardedCount: z.number().int().min(0).default(0),
    netBadgeCount: z.number().int().default(0),

    levelUpEventCount: z.number().int().min(0).default(0),
    latestEventAt: TimestampMsSchema.optional(),

    bySubject: z
      .array(StudentGamificationPublicSubjectSummarySchema)
      .default([]),

    recentEvents: z.array(StudentGamificationPublicEventSchema).default([]),

    computedAt: TimestampMsSchema,
  }),
);
export type StudentGamificationStudentView = z.infer<
  typeof StudentGamificationStudentViewSchema
>;

export const StudentGamificationGuardianViewSchema = AuditFieldsSchema.merge(
  z.object({
    id: NonEmptyStringSchema,

    orgId: NonEmptyStringSchema,
    schoolId: NonEmptyStringSchema,
    academicYearId: NonEmptyStringSchema,

    termId: z.string().optional().default(""),
    termTitle: z.string().optional().default(""),
    termShortTitle: z.string().optional().default(""),

    guardianId: z.string().optional().default(""),

    studentId: NonEmptyStringSchema,
    enrollmentId: z.string().optional().default(""),

    studentDisplayName: z.string().optional().default(""),

    gradeId: z.string().optional().default(""),
    streamId: z.string().optional().default(""),
    classId: z.string().optional().default(""),

    audience: StudentGamificationPublicAudience.default("GUARDIAN"),

    totalVisibleEvents: z.number().int().min(0).default(0),

    totalPoints: z.number().default(0),
    totalXp: z.number().default(0),

    badgeAwardedCount: z.number().int().min(0).default(0),
    netBadgeCount: z.number().int().default(0),

    levelUpEventCount: z.number().int().min(0).default(0),
    latestEventAt: TimestampMsSchema.optional(),

    bySubject: z
      .array(StudentGamificationPublicSubjectSummarySchema)
      .default([]),

    recentEvents: z.array(StudentGamificationPublicEventSchema).default([]),

    computedAt: TimestampMsSchema,
  }),
);
export type StudentGamificationGuardianView = z.infer<
  typeof StudentGamificationGuardianViewSchema
>;

export const StudentGamificationClassroomDisplayViewSchema =
  AuditFieldsSchema.merge(
    z.object({
      id: NonEmptyStringSchema,

      orgId: NonEmptyStringSchema,
      schoolId: NonEmptyStringSchema,
      academicYearId: NonEmptyStringSchema,

      termId: z.string().optional().default(""),
      termTitle: z.string().optional().default(""),
      termShortTitle: z.string().optional().default(""),

      gradeId: z.string().optional().default(""),
      streamId: z.string().optional().default(""),
      classId: z.string().optional().default(""),

      subjectKey: z.string().optional().default(""),
      subjectTitle: z.string().optional().default(""),
      classSubjectOfferingId: z.string().optional().default(""),

      audience: StudentGamificationPublicAudience.default("CLASSROOM_DISPLAY"),

      totalVisibleEvents: z.number().int().min(0).default(0),

      recentEvents: z.array(StudentGamificationPublicEventSchema).default([]),

      computedAt: TimestampMsSchema,
    }),
  );
export type StudentGamificationClassroomDisplayView = z.infer<
  typeof StudentGamificationClassroomDisplayViewSchema
>;

/**
 * Notifications
 * نظام إشعارات عام مبني على:
 * NotificationEvent -> NotificationLog -> DeliveryAttempts -> DeviceTokens
 */

export const NotificationChannel = z.enum(["PUSH", "EMAIL", "SMS", "IN_APP"]);
export type NotificationChannel = z.infer<typeof NotificationChannel>;

export const DevicePlatform = z.enum(["ANDROID", "IOS", "WEB", "UNKNOWN"]);
export type DevicePlatform = z.infer<typeof DevicePlatform>;

export const ClientAppKind = z.enum([
  "mobile-parent",
  "mobile-staff",
  "web-staff",
  "web-admin",
  "unknown",
]);
export type ClientAppKind = z.infer<typeof ClientAppKind>;

export const NotificationRecipientKind = z.enum([
  "USER",
  "PERSON",
  "GUARDIAN",
  "STAFF",
  "STUDENT",
]);
export type NotificationRecipientKind = z.infer<
  typeof NotificationRecipientKind
>;

/**
 * اسم قديم للتوافق مع أي استيرادات حالية
 */
export const NotificationRecipientType = NotificationRecipientKind;
export type NotificationRecipientType = z.infer<
  typeof NotificationRecipientType
>;

export const NotificationEventType = z.enum([
  "VIRTUAL_CLASS_SCHEDULED",
  "VIRTUAL_CLASS_REMINDER",

  "CHAT_MESSAGE_CREATED",

  "STUDENT_ABSENCE_RECORDED",
  "STUDENT_LATE_RECORDED",
  "STUDENT_NOTE_PUBLISHED",
  "STUDENT_CASE_CREATED",
  "STUDENT_CASE_UPDATED",

  "HOMEWORK_PUBLISHED",
  "HOMEWORK_DUE_REMINDER",

  "STUDENT_GAMIFICATION_AWARDED",

  "LEARNING_LOSS_PLAN_CREATED",
  "LEARNING_LOSS_FOLLOWUP_DUE",

  "STAFF_EVALUATION_ASSIGNED",

  "TRANSPORT_ALERT_CREATED",

  "GENERAL_ANNOUNCEMENT_PUBLISHED",

  "FINANCE_INVOICE_ISSUED",
  "FINANCE_PAYMENT_DUE",
  "FINANCE_PAYMENT_REMINDER",
  "FINANCE_PAYMENT_RECEIVED",
  "FINANCE_BALANCE_UPDATED",

  "CUSTOM",
]);
export type NotificationEventType = z.infer<typeof NotificationEventType>;

export const NotificationSourceType = z.enum([
  "VIRTUAL_CLASS_SESSION",

  "CHAT_THREAD",
  "CHAT_MESSAGE",

  "STUDENT_ATTENDANCE_BATCH",
  "STUDENT_ATTENDANCE_RECORD",
  "STUDENT_NOTE",
  "STUDENT_CASE",

  "STUDENT_HOMEWORK_ASSIGNMENT",
  "STUDENT_HOMEWORK_SUBMISSION",

  "STUDENT_GAMIFICATION_EVENT",
  "STUDENT_LEARNING_LOSS_PLAN",

  "TRANSPORT_ATTENDANCE_BATCH",
  "TRANSPORT_ATTENDANCE_RECORD",

  "EVALUATION_CYCLE",
  "EVALUATION_SUBMISSION",

  "ANNOUNCEMENT",

  "FINANCE_ACCOUNT",
  "FINANCE_INVOICE",
  "FINANCE_PAYMENT",
  "FINANCE_RECEIPT",

  "MANUAL",
  "CUSTOM",
]);
export type NotificationSourceType = z.infer<typeof NotificationSourceType>;

export const NotificationAudienceKind = z.enum([
  /**
   * مستلمون مباشرون تم تحديدهم داخل event.
   */
  "DIRECT_RECIPIENTS",

  /**
   * تعميمات عامة.
   */
  "ALL_GUARDIANS",
  "ALL_STAFF",
  "ALL_STUDENTS",

  /**
   * تعميمات حسب نطاق.
   */
  "SCHOOL_GUARDIANS",
  "GRADE_GUARDIANS",
  "CLASS_GUARDIANS",
  "ROUTE_GUARDIANS",

  /**
   * لاحقًا لاستعلامات مخصصة.
   */
  "CUSTOM_QUERY",
]);
export type NotificationAudienceKind = z.infer<typeof NotificationAudienceKind>;

export const NotificationAudienceScopeType = z.enum([
  "ORG",
  "SCHOOL",
  "ACADEMIC_YEAR",
  "TERM",
  "GRADE",
  "CLASS",
  "ROUTE",
  "STUDENT",
  "CUSTOM",
]);
export type NotificationAudienceScopeType = z.infer<
  typeof NotificationAudienceScopeType
>;

export const NotificationEventStatus = z.enum([
  "PENDING",
  "PROCESSING",
  "PROCESSED",
  "PARTIALLY_PROCESSED",
  "FAILED",
  "CANCELLED",
  "SKIPPED",
]);
export type NotificationEventStatus = z.infer<typeof NotificationEventStatus>;

export const NotificationLogStatus = z.enum([
  "PENDING",
  "SENT",
  "FAILED",
  "READ",
  "ARCHIVED",
  "CANCELLED",
]);
export type NotificationLogStatus = z.infer<typeof NotificationLogStatus>;

/**
 * اسم قديم للتوافق مع أي استعمالات حالية.
 * QUEUED موجودة فقط حتى لا نكسر بيانات أو كود قديم.
 */
export const NotificationStatus = z.enum([
  "QUEUED",
  "PENDING",
  "SENT",
  "FAILED",
  "READ",
  "ARCHIVED",
  "CANCELLED",
]);
export type NotificationStatus = z.infer<typeof NotificationStatus>;

export const NotificationDeliveryStatus = z.enum([
  "PENDING",
  "SUCCESS",
  "FAILED",
  "SKIPPED",
]);
export type NotificationDeliveryStatus = z.infer<
  typeof NotificationDeliveryStatus
>;

export const NotificationEventSchema = AuditFieldsSchema.merge(
  z.object({
    id: NonEmptyStringSchema,
    orgId: NonEmptyStringSchema,

    /**
     * سياق اختياري للمدرسة/السنة/الفصل الدراسي.
     */
    schoolId: z.string().optional().default(""),
    academicYearId: z.string().optional().default(""),
    ...AcademicTermContextFieldsSchema.shape,

    gradeId: z.string().optional().default(""),
    classId: z.string().optional().default(""),
    subjectKey: z.string().optional().default(""),
    classSubjectOfferingId: z.string().optional().default(""),

    type: NotificationEventType,

    sourceType: NotificationSourceType,
    sourceId: NonEmptyStringSchema,
    sourcePath: z.string().optional().default(""),

    /**
     * من تسبب في الحدث.
     */
    actorUid: z.string().optional().default(""),
    actorPersonId: z.string().optional().default(""),
    actorRoleKey: MembershipRole.optional(),

    /**
     * مستهدفات عامة تساعد الـ Functions في تحديد المستلمين.
     */
    targetSchoolId: z.string().optional().default(""),
    targetClassId: z.string().optional().default(""),
    targetStudentId: z.string().optional().default(""),
    targetGuardianId: z.string().optional().default(""),
    targetStaffPersonId: z.string().optional().default(""),
    targetPersonId: z.string().optional().default(""),
    targetRouteId: z.string().optional().default(""),
    targetThreadId: z.string().optional().default(""),
    targetConversationId: z.string().optional().default(""),

    /**
     * جمهور الإشعار.
     *
     * DIRECT_RECIPIENTS:
     * يتم الاعتماد على targetGuardianId / targetPersonId / targetStaffPersonId.
     *
     * ALL_GUARDIANS / SCHOOL_GUARDIANS / CLASS_GUARDIANS:
     * تستخدم لاحقًا في resolveRecipients لتوليد notificationLogs لكل مستلم.
     */
    audienceKind: NotificationAudienceKind.default("DIRECT_RECIPIENTS"),
    audienceScopeType: NotificationAudienceScopeType.optional(),
    audienceScopeId: z.string().optional().default(""),

    /**
     * فلتر مرن لاحقًا.
     * مثال:
     * - أولياء أمور مدرسة معينة
     * - أولياء أمور لديهم مستحقات
     * - موظفون بدور معين
     */
    recipientFilter: z.record(z.unknown()).default({}),

    /**
     * Payload خفيف فقط.
     * لا نضع معلومات حساسة كاملة هنا، خصوصًا في الشات.
     */
    payload: z.record(z.unknown()).default({}),

    status: NotificationEventStatus.default("PENDING"),

    processingStartedAt: TimestampMsSchema.optional(),
    processedAt: TimestampMsSchema.optional(),
    failedAt: TimestampMsSchema.optional(),

    attemptsCount: z.number().int().min(0).default(0),
    generatedNotificationCount: z.number().int().min(0).default(0),
    successfulDeliveryCount: z.number().int().min(0).default(0),
    failedDeliveryCount: z.number().int().min(0).default(0),

    errorCode: z.string().optional().default(""),
    errorMessage: z.string().optional().default(""),

    createdAt: TimestampMsSchema,
  }),
);
export type NotificationEvent = z.infer<typeof NotificationEventSchema>;

export const NotificationLogSchema = AuditFieldsSchema.merge(
  z.object({
    id: NonEmptyStringSchema,
    orgId: NonEmptyStringSchema,

    eventId: z.string().optional().default(""),

    schoolId: z.string().optional().default(""),
    academicYearId: z.string().optional().default(""),
    ...AcademicTermContextFieldsSchema.shape,

    gradeId: z.string().optional().default(""),
    classId: z.string().optional().default(""),
    targetClassId: z.string().optional().default(""),

    subjectKey: z.string().optional().default(""),
    classSubjectOfferingId: z.string().optional().default(""),

    audienceKind: NotificationAudienceKind.default("DIRECT_RECIPIENTS"),
    audienceScopeType: NotificationAudienceScopeType.optional(),
    audienceScopeId: z.string().optional().default(""),

    recipientKind: NotificationRecipientKind,
    recipientUid: z.string().optional().default(""),
    recipientPersonId: z.string().optional().default(""),
    guardianId: z.string().optional().default(""),
    staffPersonId: z.string().optional().default(""),
    studentId: z.string().optional().default(""),

    type: NotificationEventType,

    title: NonEmptyStringSchema,
    body: NonEmptyStringSchema,

    sourceType: NotificationSourceType,
    sourceId: z.string().optional().default(""),
    sourcePath: z.string().optional().default(""),

    /**
     * أين يفتح التطبيق عند الضغط على الإشعار.
     */
    targetRoute: z.string().optional().default(""),
    targetParams: z.record(z.unknown()).default({}),

    /**
     * بيانات خفيفة للـ FCM data payload.
     */
    data: z.record(z.string()).default({}),

    channels: z.array(NotificationChannel).default(["IN_APP", "PUSH"]),

    status: NotificationLogStatus.default("PENDING"),

    createdAt: TimestampMsSchema,
    sentAt: TimestampMsSchema.optional(),
    failedAt: TimestampMsSchema.optional(),
    readAt: TimestampMsSchema.optional(),
    archivedAt: TimestampMsSchema.optional(),

    errorCode: z.string().optional().default(""),
    errorMessage: z.string().optional().default(""),
  }),
);
export type NotificationLog = z.infer<typeof NotificationLogSchema>;

export const DeviceTokenSchema = AuditFieldsSchema.merge(
  z.object({
    id: NonEmptyStringSchema,
    orgId: NonEmptyStringSchema,

    uid: NonEmptyStringSchema,
    personId: z.string().optional().default(""),
    guardianId: z.string().optional().default(""),
    staffPersonId: z.string().optional().default(""),

    platform: DevicePlatform.default("UNKNOWN"),
    app: ClientAppKind.default("unknown"),

    fcmToken: NonEmptyStringSchema,
    deviceId: z.string().optional().default(""),

    isActive: z.boolean().default(true),

    lastSeenAt: TimestampMsSchema.optional(),
    disabledAt: TimestampMsSchema.optional(),

    lastErrorCode: z.string().optional().default(""),
    lastErrorMessage: z.string().optional().default(""),

    createdAt: TimestampMsSchema,
    updatedAt: TimestampMsSchema.optional(),
  }),
);
export type DeviceToken = z.infer<typeof DeviceTokenSchema>;

export const NotificationDeliveryAttemptSchema = AuditFieldsSchema.merge(
  z.object({
    id: NonEmptyStringSchema,
    orgId: NonEmptyStringSchema,

    eventId: z.string().optional().default(""),
    notificationId: NonEmptyStringSchema,

    recipientUid: z.string().optional().default(""),
    recipientPersonId: z.string().optional().default(""),

    channel: NotificationChannel.default("PUSH"),

    deviceTokenId: z.string().optional().default(""),
    fcmToken: z.string().optional().default(""),

    status: NotificationDeliveryStatus.default("PENDING"),

    /**
     * messageId الراجع من Firebase Admin عند نجاح الإرسال.
     */
    providerMessageId: z.string().optional().default(""),

    errorCode: z.string().optional().default(""),
    errorMessage: z.string().optional().default(""),

    attemptedAt: TimestampMsSchema,
  }),
);
export type NotificationDeliveryAttempt = z.infer<
  typeof NotificationDeliveryAttemptSchema
>;

/**
 * Legacy lightweight notification.
 * نتركه مؤقتًا حتى لا نكسر أي كود قديم يعتمد على NotificationSchema.
 * النظام الجديد سيستخدم NotificationLogSchema.
 */
export const NotificationSchema = AuditFieldsSchema.merge(
  z.object({
    id: NonEmptyStringSchema,
    orgId: NonEmptyStringSchema,
    recipientType: NotificationRecipientType,
    recipientPersonId: z.string().optional().default(""),
    title: NonEmptyStringSchema,
    body: NonEmptyStringSchema,
    channel: NotificationChannel,
    status: NotificationStatus.default("QUEUED"),
    createdAt: TimestampMsSchema,
  }),
);
export type Notification = z.infer<typeof NotificationSchema>;

export const MessageParticipantKind = z.enum([
  "GUARDIAN",
  "STAFF",
  "STUDENT",
  "SYSTEM",
]);
export type MessageParticipantKind = z.infer<typeof MessageParticipantKind>;

export const MessageType = z.enum(["TEXT", "SYSTEM", "IMAGE", "FILE", "VOICE"]);
export type MessageType = z.infer<typeof MessageType>;

export const ThreadStatus = z.enum([
  "ACTIVE",
  "CLOSED",
  "ARCHIVED",
  "LOCKED",
  "CANCELLED",
]);
export type ThreadStatus = z.infer<typeof ThreadStatus>;

export const ThreadScopeType = z.enum([
  "ORG",
  "SCHOOL",
  "ACADEMIC_YEAR",
  "GRADE",
  "CLASS",
  "STUDENT",
  "CASE",
  "PERSON",
  "PERSON_GROUP",
  "CUSTOM",
]);
export type ThreadScopeType = z.infer<typeof ThreadScopeType>;

export const MessagePolicySchema = AuditFieldsSchema.merge(
  z.object({
    id: NonEmptyStringSchema,
    orgId: NonEmptyStringSchema,
    title: NonEmptyStringSchema,

    /**
     * Roles that guardians are allowed to start conversations with.
     * Example: teacher, class teacher, student affairs VP, school admin.
     */
    guardianCanMessageRoles: z.array(MembershipRole).default([]),

    /**
     * Optional school-level scoping for future policy customization.
     * Empty means organization-wide policy.
     */
    schoolIds: z.array(z.string()).default([]),

    isActive: z.boolean().default(true),
  }),
);
export type MessagePolicy = z.infer<typeof MessagePolicySchema>;

export const ThreadType = z.enum([
  "DIRECT",
  "GROUP",
  "STUDENT_CONTEXT",
  "CASE_CONTEXT",
]);
export type ThreadType = z.infer<typeof ThreadType>;

export const ThreadParticipantSummarySchema = z.object({
  uid: z.string().optional().default(""),
  personId: z.string().optional().default(""),
  kind: MessageParticipantKind.default("STAFF"),
  roleKey: z.string().optional().default(""),
  displayName: z.string().optional().default(""),

  lastReadAt: TimestampMsSchema.optional(),
  unreadCount: z.number().int().nonnegative().default(0),

  muted: z.boolean().default(false),
  archivedAt: TimestampMsSchema.optional(),
});
export type ThreadParticipantSummary = z.infer<
  typeof ThreadParticipantSummarySchema
>;

export const ThreadSchema = AuditFieldsSchema.merge(
  z.object({
    id: NonEmptyStringSchema,
    orgId: NonEmptyStringSchema,

    type: ThreadType.default("DIRECT"),
    status: ThreadStatus.default("ACTIVE"),

    /**
     * Internal means staff-to-staff or staff group conversation.
     * External means guardian-facing conversation.
     */
    isInternal: z.boolean().default(false),

    /**
     * General scope for filtering and access control.
     */
    scopeType: ThreadScopeType.default("ORG"),
    scopeId: z.string().optional().default(""),

    /**
     * School/academic context.
     * Important because classId/studentId alone are not globally safe enough.
     */
    schoolId: z.string().optional().default(""),
    academicYearId: z.string().optional().default(""),
    termId: z.string().optional().default(""),
    gradeId: z.string().optional().default(""),
    classId: z.string().optional().default(""),

    /**
     * Optional subject context for parent ↔ subject teacher conversations.
     */
    subjectKey: z.string().optional().default(""),
    classSubjectOfferingId: z.string().optional().default(""),

    /**
     * Context-linked conversations.
     */
    studentId: z.string().optional().default(""),
    caseId: z.string().optional().default(""),

    /**
     * Creator.
     */
    createdByUid: z.string().optional().default(""),
    createdByPersonId: z.string().optional().default(""),
    createdByRoleKey: z.string().optional().default(""),

    /**
     * Allowed role keys for scoped/group conversations.
     * Useful for school channels or restricted internal groups.
     */
    allowedRoleKeys: z.array(z.string()).default([]),

    /**
     * Backward-compatible participant fields.
     */
    participantPersonIds: z.array(z.string()).default([]),

    /**
     * UID list is important for Firestore rules and notification routing.
     */
    participantUids: z.array(z.string()).default([]),

    /**
     * Rich participant summaries for UI, unread, and routing.
     */
    participants: z.array(ThreadParticipantSummarySchema).default([]),

    lastMessageSummary: z.string().optional().default(""),
    lastMessageAt: TimestampMsSchema.optional(),
    lastMessageSenderUid: z.string().optional().default(""),
    lastMessageSenderPersonId: z.string().optional().default(""),
    lastMessageType: MessageType.optional().default("TEXT"),

    closedAt: TimestampMsSchema.optional(),
    archivedAt: TimestampMsSchema.optional(),
  }),
);
export type Thread = z.infer<typeof ThreadSchema>;

export const MessageSchema = AuditFieldsSchema.merge(
  z.object({
    id: NonEmptyStringSchema,
    orgId: NonEmptyStringSchema,
    threadId: NonEmptyStringSchema,

    schoolId: z.string().optional().default(""),

    type: MessageType.default("TEXT"),

    senderUid: z.string().optional().default(""),
    senderPersonId: NonEmptyStringSchema,
    senderRoleKey: z.string().optional().default(""),
    senderParticipantKind: MessageParticipantKind.default("STAFF"),

    body: NonEmptyStringSchema,

    createdAt: TimestampMsSchema,

    editedAt: TimestampMsSchema.optional(),
    deletedAt: TimestampMsSchema.optional(),
    isDeleted: z.boolean().default(false),
  }),
);
export type Message = z.infer<typeof MessageSchema>;

/**
 * Import templates
 */
export const ImportTemplateDefinitionSchema = z.object({
  requiredColumns: z.array(z.string()).default([]),
  optionalColumns: z.array(z.string()).default([]),
  mode: z.string().default("CREATE_OR_UPDATE_ONLY"),
});
export type ImportTemplateDefinition = z.infer<
  typeof ImportTemplateDefinitionSchema
>;

export const ImportTemplatesSchema = z.object({
  students: ImportTemplateDefinitionSchema.optional(),
  staff: ImportTemplateDefinitionSchema.optional(),
});
export type ImportTemplates = z.infer<typeof ImportTemplatesSchema>;

export * from "./staff-evaluations";
export * from "./student-cases";
export * from "./transport";
export * from "./school-activities";

