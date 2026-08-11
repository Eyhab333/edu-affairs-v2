import { z } from "zod";

const IdSchema = z.string().trim().min(1);
const TimestampMsSchema = z.number().int().nonnegative();
const OptionalIdSchema = z.string().trim().optional().default("");
const OptionalTextSchema = z.string().trim().optional().default("");

/**
 * نوع ملف الـ PDF.
 * نضيف الأنواع الفعلية عند الحاجة دون تغيير المحرك.
 */
export const PdfResourceKindSchema = z.enum([
  "JOB_TASKS",
  "ENRICHMENT_MATERIAL",
]);

export type PdfResourceKind = z.infer<typeof PdfResourceKindSchema>;

/**
 * حالة الملف داخل المكتبة.
 */
export const PdfResourceStatusSchema = z.enum([
  "PUBLISHED",
  "ARCHIVED",
]);

export type PdfResourceStatus = z.infer<
  typeof PdfResourceStatusSchema
>;

/**
 * نوع الجمهور المستهدف.
 */
export const PdfResourceAudienceKindSchema = z.enum([
  "STAFF_ROLES",
  "STUDENTS",
]);

export type PdfResourceAudienceKind = z.infer<
  typeof PdfResourceAudienceKindSchema
>;

/**
 * نطاق ظهور ملف الـ PDF.
 *
 * STAFF_ROLES:
 * - targetRoleKeys مطلوب.
 * - schoolIds اختياري، والقائمة الفارغة تعني جميع مدارس المؤسسة.
 *
 * STUDENTS:
 * - schoolIds مطلوب.
 * - بقية الحقول تعمل كفلاتر إضافية.
 */
export const PdfResourceAudienceSchema = z
  .object({
    kind: PdfResourceAudienceKindSchema,

academicYearId: OptionalIdSchema,
termId: OptionalIdSchema,


    targetRoleKeys: z.array(IdSchema).default([]),

    schoolIds: z.array(IdSchema).default([]),
    gradeIds: z.array(IdSchema).default([]),
    classIds: z.array(IdSchema).default([]),
    subjectKeys: z.array(IdSchema).default([]),
  })
  .superRefine((audience, ctx) => {
    if (
      audience.kind === "STAFF_ROLES" &&
      audience.targetRoleKeys.length === 0
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "يجب تحديد دور وظيفي واحد على الأقل",
        path: ["targetRoleKeys"],
      });
    }

    if (
      audience.kind === "STUDENTS" &&
      audience.schoolIds.length === 0
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "يجب تحديد مدرسة واحدة على الأقل",
        path: ["schoolIds"],
      });
    }
  });

export type PdfResourceAudience = z.infer<
  typeof PdfResourceAudienceSchema
>;

/**
 * بيانات ملف الـ PDF المخزن في Firebase Storage.
 */
export const PdfResourceFileSchema = z.object({
  storagePath: IdSchema,
  originalName: IdSchema,
  contentType: z.literal("application/pdf"),
  sizeBytes: z.number().int().nonnegative(),
});

export type PdfResourceFile = z.infer<
  typeof PdfResourceFileSchema
>;

/**
 * ملف PDF داخل المكتبة العامة.
 */
export const PdfResourceSchema = z.object({
  id: IdSchema,
  orgId: IdSchema,

  kind: PdfResourceKindSchema,

  title: z.string().trim().min(1),
  description: OptionalTextSchema,

  audience: PdfResourceAudienceSchema,

  requiresAcknowledgement: z.boolean().default(false),
  status: PdfResourceStatusSchema.default("PUBLISHED"),

  file: PdfResourceFileSchema,

  publishedAt: TimestampMsSchema,
  publishedByUid: IdSchema,
  publishedByPersonId: OptionalIdSchema,
  publishedByDisplayName: OptionalTextSchema,

  archivedAt: TimestampMsSchema.optional(),
  archivedByUid: OptionalIdSchema,
  archivedByPersonId: OptionalIdSchema,

  createdAt: TimestampMsSchema,
  updatedAt: TimestampMsSchema,
});

export type PdfResource = z.infer<
  typeof PdfResourceSchema
>;

/**
 * أنواع أصحاب الإقرار.
 * النسخة الأولى تدعم الموظفين فقط.
 * يمكن إضافة STUDENT أو GUARDIAN لاحقًا دون إعادة تسمية العقد.
 */
export const PdfResourceAcknowledgementActorKindSchema = z.enum([
  "STAFF",
]);

export type PdfResourceAcknowledgementActorKind = z.infer<
  typeof PdfResourceAcknowledgementActorKindSchema
>;

export const PdfResourceAcknowledgementStatusSchema = z.enum([
  "PENDING",
  "ACKNOWLEDGED",
]);

export type PdfResourceAcknowledgementStatus = z.infer<
  typeof PdfResourceAcknowledgementStatusSchema
>;

/**
 * إقرار الاطلاع على ملف PDF.
 */
export const PdfResourceAcknowledgementSchema = z.object({
  /**
   * سيكون مساويًا لـ actorId داخل Firestore،
   * لمنع وجود أكثر من إقرار لنفس الشخص على نفس الملف.
   */
  id: IdSchema,

  orgId: IdSchema,
  resourceId: IdSchema,

  actorKind:
    PdfResourceAcknowledgementActorKindSchema.default("STAFF"),

  actorId: IdSchema,

  uid: OptionalIdSchema,
  personId: OptionalIdSchema,

  displayName: z.string().trim().min(1),
  roleKey: OptionalIdSchema,
  schoolId: OptionalIdSchema,

  acknowledgedAt: TimestampMsSchema,
});

export type PdfResourceAcknowledgement = z.infer<
  typeof PdfResourceAcknowledgementSchema
>;

/**
 * عنصر داخل تقرير الإقرارات.
 */
export const PdfResourceAcknowledgementReportItemSchema =
  z.object({
    actorKind:
      PdfResourceAcknowledgementActorKindSchema.default("STAFF"),

    actorId: IdSchema,

    uid: OptionalIdSchema,
    personId: OptionalIdSchema,

    displayName: z.string().trim().min(1),
    roleKey: OptionalIdSchema,
    schoolId: OptionalIdSchema,

    acknowledgementStatus:
      PdfResourceAcknowledgementStatusSchema.default("PENDING"),

    acknowledgedAt: TimestampMsSchema.optional(),
  });

export type PdfResourceAcknowledgementReportItem = z.infer<
  typeof PdfResourceAcknowledgementReportItemSchema
>;

export const PdfResourceAcknowledgementReportSummarySchema =
  z.object({
    totalTargeted: z.number().int().nonnegative(),
    acknowledgedCount: z.number().int().nonnegative(),
    pendingCount: z.number().int().nonnegative(),
    completionPercentage: z.number().min(0).max(100),
  });

export type PdfResourceAcknowledgementReportSummary = z.infer<
  typeof PdfResourceAcknowledgementReportSummarySchema
>;

export const PdfResourceAcknowledgementReportSchema = z.object({
  orgId: IdSchema,

  resourceId: IdSchema,
  resourceTitle: z.string().trim().min(1),

  generatedAt: TimestampMsSchema,

  summary: PdfResourceAcknowledgementReportSummarySchema,

  items: z
    .array(PdfResourceAcknowledgementReportItemSchema)
    .default([]),
});

export type PdfResourceAcknowledgementReport = z.infer<
  typeof PdfResourceAcknowledgementReportSchema
>;

export const GetPdfResourceAcknowledgementReportInputSchema =
  z.object({
    orgId: IdSchema,
    resourceId: IdSchema,
  });

export type GetPdfResourceAcknowledgementReportInput = z.infer<
  typeof GetPdfResourceAcknowledgementReportInputSchema
>;