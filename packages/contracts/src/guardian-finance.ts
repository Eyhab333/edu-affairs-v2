import { z } from "zod";

const TimestampMsSchema = z.number().int().nonnegative();
const NonEmptyStringSchema = z.string().min(1);
const MoneyMinorSchema = z.number().int().nonnegative();

const CurrencyCodeSchema = z
  .string()
  .length(3)
  .default("SAR");

/**
 * تصنيفات الرسوم
 */
export const GuardianFeeCategorySchema = z.enum([
  "TUITION",
  "REGISTRATION",
  "TRANSPORT",
  "ACTIVITY",
  "BOOKS",
  "UNIFORM",
  "MEALS",
  "SERVICE",
  "OTHER",
]);

export type GuardianFeeCategory = z.infer<
  typeof GuardianFeeCategorySchema
>;

/**
 * نطاق تعريف الرسم.
 *
 * FeeDefinition قد يكون:
 * - على مستوى المؤسسة
 * - مدرسة
 * - سنة دراسية
 * - صف
 * - فصل
 */
export const FeeDefinitionScopeTypeSchema = z.enum([
  "ORG",
  "SCHOOL",
  "ACADEMIC_YEAR",
  "GRADE",
  "CLASS",
  "CUSTOM",
]);

export type FeeDefinitionScopeType = z.infer<
  typeof FeeDefinitionScopeTypeSchema
>;

export const FeeDefinitionStatusSchema = z.enum([
  "DRAFT",
  "ACTIVE",
  "INACTIVE",
  "ARCHIVED",
]);

export type FeeDefinitionStatus = z.infer<
  typeof FeeDefinitionStatusSchema
>;

export const FeeBillingScheduleKindSchema = z.enum([
  "ONE_TIME",
  "MONTHLY",
  "TERM",
  "ANNUAL",
  "CUSTOM",
]);

export type FeeBillingScheduleKind = z.infer<
  typeof FeeBillingScheduleKindSchema
>;

/**
 * حالة المستحق المالي على الطالب.
 */
export const StudentFeeChargeStatusSchema = z.enum([
  "DRAFT",
  "ACTIVE",
  "PARTIALLY_PAID",
  "PAID",
  "OVERDUE",
  "WAIVED",
  "CANCELLED",
]);

export type StudentFeeChargeStatus = z.infer<
  typeof StudentFeeChargeStatusSchema
>;

/**
 * حالة القسط.
 */
export const StudentFeeInstallmentStatusSchema = z.enum([
  "PENDING",
  "PARTIALLY_PAID",
  "PAID",
  "OVERDUE",
  "WAIVED",
  "CANCELLED",
]);

export type StudentFeeInstallmentStatus = z.infer<
  typeof StudentFeeInstallmentStatusSchema
>;

export const GuardianPaymentMethodSchema = z.enum([
  "CASH",
  "BANK_TRANSFER",
  "POS",
  "CARD",
  "ONLINE",
  "CHEQUE",
  "OTHER",
]);

export type GuardianPaymentMethod = z.infer<
  typeof GuardianPaymentMethodSchema
>;

export const GuardianPaymentStatusSchema = z.enum([
  "DRAFT",
  "POSTED",
  "VOIDED",
  "REVERSED",
]);

export type GuardianPaymentStatus = z.infer<
  typeof GuardianPaymentStatusSchema
>;

export const GuardianFinancialAdjustmentKindSchema = z.enum([
  "DISCOUNT",
  "WAIVER",
  "SURCHARGE",
  "CREDIT",
  "CORRECTION",
  "OTHER",
]);

export type GuardianFinancialAdjustmentKind = z.infer<
  typeof GuardianFinancialAdjustmentKindSchema
>;

/**
 * CREDIT:
 * يقلل المبلغ المستحق على ولي الأمر.
 *
 * DEBIT:
 * يزيد المبلغ المستحق.
 */
export const GuardianFinancialAdjustmentDirectionSchema = z.enum([
  "CREDIT",
  "DEBIT",
]);

export type GuardianFinancialAdjustmentDirection = z.infer<
  typeof GuardianFinancialAdjustmentDirectionSchema
>;

export const GuardianFinancialAdjustmentStatusSchema = z.enum([
  "DRAFT",
  "APPLIED",
  "VOIDED",
]);

export type GuardianFinancialAdjustmentStatus = z.infer<
  typeof GuardianFinancialAdjustmentStatusSchema
>;

export const GuardianFinanceNoteVisibilitySchema = z.enum([
  "INTERNAL",
  "STAFF",
  "GUARDIAN_VISIBLE",
]);

export type GuardianFinanceNoteVisibility = z.infer<
  typeof GuardianFinanceNoteVisibilitySchema
>;

export const GuardianFinanceNoteSeveritySchema = z.enum([
  "INFO",
  "LOW",
  "MEDIUM",
  "HIGH",
  "URGENT",
]);

export type GuardianFinanceNoteSeverity = z.infer<
  typeof GuardianFinanceNoteSeveritySchema
>;

export const GuardianPaymentReceiptStatusSchema = z.enum([
  "ISSUED",
  "CANCELLED",
  "REPLACED",
]);

export type GuardianPaymentReceiptStatus = z.infer<
  typeof GuardianPaymentReceiptStatusSchema
>;

/**
 * تعريف الرسم.
 *
 * هذا كيان إعداد يُدار غالبًا من web-admin.
 *
 * أمثلة:
 * - الرسوم الدراسية
 * - رسوم التسجيل
 * - رسوم النقل
 * - رسوم النشاط الصيفي
 */
export const FeeDefinitionSchema = z.object({
  id: NonEmptyStringSchema,
  orgId: NonEmptyStringSchema,

  code: z.string().optional(),
  title: NonEmptyStringSchema,
  shortTitle: z.string().optional(),
  description: z.string().optional(),

  category: GuardianFeeCategorySchema,

  scopeType: FeeDefinitionScopeTypeSchema.default("ORG"),
  scopeId: z.string().optional(),

  /**
   * نطاقات إضافية عند الحاجة إلى تطبيق الرسم
   * على أكثر من مدرسة أو صف.
   */
  schoolIds: z.array(z.string()).default([]),
  gradeIds: z.array(z.string()).default([]),
  classIds: z.array(z.string()).default([]),

  academicYearId: z.string().optional(),

  termId: z.string().optional(),
  termTitle: z.string().optional(),
  termShortTitle: z.string().optional(),

  defaultAmountMinor: MoneyMinorSchema,
  currency: CurrencyCodeSchema,

  billingScheduleKind: FeeBillingScheduleKindSchema.default("ONE_TIME"),
  defaultInstallmentCount: z.number().int().positive().default(1),

  allowPartialPayment: z.boolean().default(true),
  allowOverpayment: z.boolean().default(false),

  /**
   * هل يظهر هذا النوع من الرسوم لولي الأمر؟
   */
  isGuardianVisible: z.boolean().default(true),

  status: FeeDefinitionStatusSchema.default("DRAFT"),

  order: z.number().int().nonnegative().default(0),
  isArchived: z.boolean().default(false),

  createdByPersonId: z.string().optional(),
  updatedByPersonId: z.string().optional(),

  createdAt: TimestampMsSchema,
  updatedAt: TimestampMsSchema,
});

export type FeeDefinition = z.infer<typeof FeeDefinitionSchema>;

/**
 * المستحق المالي الفعلي على طالب.
 *
 * تعريف الرسم FeeDefinition شيء عام.
 * أما StudentFeeCharge فهو المبلغ الفعلي المسند لطالب معين.
 */
export const StudentFeeChargeSchema = z.object({
  id: NonEmptyStringSchema,
  orgId: NonEmptyStringSchema,

  schoolId: NonEmptyStringSchema,
  academicYearId: NonEmptyStringSchema,

  termId: z.string().optional(),
  termTitle: z.string().optional(),
  termShortTitle: z.string().optional(),

  studentId: NonEmptyStringSchema,
  studentPersonId: z.string().optional(),
  studentDisplayName: z.string().optional(),

  /**
   * ولي الأمر الأساسي وقت إنشاء المستحق.
   *
   * المستحق يظل مرتبطًا بالطالب أساسًا،
   * ويمكن لغير هذا الولي رؤيته إذا كان مرتبطًا بالطالب
   * من خلال GuardianLink وفق الصلاحيات.
   */
  guardianId: z.string().optional(),
  guardianPersonId: z.string().optional(),
  guardianDisplayName: z.string().optional(),

  feeDefinitionId: NonEmptyStringSchema,
  feeDefinitionTitle: z.string().optional(),
  feeCategory: GuardianFeeCategorySchema,

  chargeNumber: z.string().optional(),
  title: NonEmptyStringSchema,
  description: z.string().optional(),

  currency: CurrencyCodeSchema,

  /**
   * القيمة الأصلية قبل الخصومات والإضافات.
   */
  originalAmountMinor: MoneyMinorSchema,

  /**
   * مجموع الخصومات والإعفاءات المطبقة.
   */
  discountAmountMinor: MoneyMinorSchema.default(0),

  /**
   * مجموع الإضافات المالية.
   */
  surchargeAmountMinor: MoneyMinorSchema.default(0),

  /**
   * القيمة النهائية بعد الخصومات والإضافات.
   */
  netAmountMinor: MoneyMinorSchema,

  paidAmountMinor: MoneyMinorSchema.default(0),
  outstandingAmountMinor: MoneyMinorSchema,

  status: StudentFeeChargeStatusSchema.default("DRAFT"),

  chargedAt: TimestampMsSchema.optional(),
  dueAt: TimestampMsSchema.optional(),

  installmentIds: z.array(z.string()).default([]),

  isGuardianVisible: z.boolean().default(true),

  createdByPersonId: NonEmptyStringSchema,
  createdByRoleKey: z.string().optional(),

  updatedByPersonId: z.string().optional(),
  updatedByRoleKey: z.string().optional(),

  activatedAt: TimestampMsSchema.optional(),
  paidAt: TimestampMsSchema.optional(),

  cancelledAt: TimestampMsSchema.optional(),
  cancelledByPersonId: z.string().optional(),
  cancellationReason: z.string().optional(),

  notes: z.string().optional(),

  createdAt: TimestampMsSchema,
  updatedAt: TimestampMsSchema,
});

export type StudentFeeCharge = z.infer<
  typeof StudentFeeChargeSchema
>;

/**
 * قسط تابع لمستحق مالي واحد.
 */
export const StudentFeeInstallmentSchema = z.object({
  id: NonEmptyStringSchema,
  orgId: NonEmptyStringSchema,

  schoolId: NonEmptyStringSchema,
  academicYearId: NonEmptyStringSchema,

  termId: z.string().optional(),
  termTitle: z.string().optional(),
  termShortTitle: z.string().optional(),

  chargeId: NonEmptyStringSchema,
  feeDefinitionId: z.string().optional(),

  studentId: NonEmptyStringSchema,
  studentPersonId: z.string().optional(),
  studentDisplayName: z.string().optional(),

  guardianId: z.string().optional(),
  guardianPersonId: z.string().optional(),
  guardianDisplayName: z.string().optional(),

  installmentNumber: z.number().int().positive(),
  title: NonEmptyStringSchema,
  description: z.string().optional(),

  currency: CurrencyCodeSchema,

  amountMinor: MoneyMinorSchema,
  paidAmountMinor: MoneyMinorSchema.default(0),
  outstandingAmountMinor: MoneyMinorSchema,

  status: StudentFeeInstallmentStatusSchema.default("PENDING"),

  dueAt: TimestampMsSchema.optional(),
  paidAt: TimestampMsSchema.optional(),

  waivedAt: TimestampMsSchema.optional(),
  waivedByPersonId: z.string().optional(),
  waiverReason: z.string().optional(),

  cancelledAt: TimestampMsSchema.optional(),
  cancelledByPersonId: z.string().optional(),
  cancellationReason: z.string().optional(),

  note: z.string().optional(),

  createdByPersonId: NonEmptyStringSchema,
  createdByRoleKey: z.string().optional(),

  createdAt: TimestampMsSchema,
  updatedAt: TimestampMsSchema,
});

export type StudentFeeInstallment = z.infer<
  typeof StudentFeeInstallmentSchema
>;

/**
 * توزيع مبلغ دفعة مالية على مستحق أو قسط.
 *
 * يمكن للدفعة الواحدة أن تغطي:
 * - أكثر من طالب
 * - أكثر من مستحق
 * - أكثر من قسط
 */
export const GuardianPaymentAllocationSchema = z.object({
  id: NonEmptyStringSchema,

  studentId: NonEmptyStringSchema,
  studentPersonId: z.string().optional(),
  studentDisplayName: z.string().optional(),

  chargeId: NonEmptyStringSchema,
  installmentId: z.string().optional(),

  amountMinor: MoneyMinorSchema,

  note: z.string().optional(),
});

export type GuardianPaymentAllocation = z.infer<
  typeof GuardianPaymentAllocationSchema
>;

/**
 * الدفعة المالية التي سجلها المحصل.
 *
 * لا نحذف الدفعات نهائيًا بعد اعتمادها.
 * عند الخطأ تتحول إلى VOIDED أو REVERSED.
 */
export const GuardianPaymentSchema = z.object({
  id: NonEmptyStringSchema,
  orgId: NonEmptyStringSchema,

  /**
   * قد تغطي الدفعة أبناء في أكثر من مدرسة،
   * لذلك نستخدم مصفوفات بدل schoolId واحد.
   */
  schoolIds: z.array(z.string()).default([]),
  academicYearIds: z.array(z.string()).default([]),
  termIds: z.array(z.string()).default([]),

  guardianId: NonEmptyStringSchema,
  guardianPersonId: z.string().optional(),
  guardianDisplayName: z.string().optional(),
  guardianPhone: z.string().optional(),

  receiptNumber: NonEmptyStringSchema,

  currency: CurrencyCodeSchema,

  amountMinor: MoneyMinorSchema,
  allocatedAmountMinor: MoneyMinorSchema.default(0),
  unallocatedAmountMinor: MoneyMinorSchema.default(0),

  paymentMethod: GuardianPaymentMethodSchema,
  status: GuardianPaymentStatusSchema.default("DRAFT"),

  paidAt: TimestampMsSchema,

  referenceNumber: z.string().optional(),
  bankName: z.string().optional(),
  transferDate: TimestampMsSchema.optional(),
  chequeNumber: z.string().optional(),
  cardLast4: z.string().max(4).optional(),

  allocations: z
    .array(GuardianPaymentAllocationSchema)
    .default([]),

  collectedByPersonId: NonEmptyStringSchema,
  collectedByRoleKey: z.string().optional(),
  collectorDisplayName: z.string().optional(),

  postedAt: TimestampMsSchema.optional(),

  voidedAt: TimestampMsSchema.optional(),
  voidedByPersonId: z.string().optional(),
  voidReason: z.string().optional(),

  reversedAt: TimestampMsSchema.optional(),
  reversedByPersonId: z.string().optional(),
  reversalReason: z.string().optional(),
  reversalPaymentId: z.string().optional(),

  note: z.string().optional(),

  createdAt: TimestampMsSchema,
  updatedAt: TimestampMsSchema,
});

export type GuardianPayment = z.infer<
  typeof GuardianPaymentSchema
>;

/**
 * خصم أو إعفاء أو إضافة أو تصحيح مالي.
 */
export const GuardianFinancialAdjustmentSchema = z.object({
  id: NonEmptyStringSchema,
  orgId: NonEmptyStringSchema,

  schoolId: NonEmptyStringSchema,
  academicYearId: NonEmptyStringSchema,

  termId: z.string().optional(),
  termTitle: z.string().optional(),
  termShortTitle: z.string().optional(),

  studentId: NonEmptyStringSchema,
  studentPersonId: z.string().optional(),
  studentDisplayName: z.string().optional(),

  guardianId: z.string().optional(),
  guardianPersonId: z.string().optional(),
  guardianDisplayName: z.string().optional(),

  chargeId: NonEmptyStringSchema,
  installmentId: z.string().optional(),

  kind: GuardianFinancialAdjustmentKindSchema,
  direction: GuardianFinancialAdjustmentDirectionSchema,

  status: GuardianFinancialAdjustmentStatusSchema.default("DRAFT"),

  currency: CurrencyCodeSchema,
  amountMinor: MoneyMinorSchema,

  reason: NonEmptyStringSchema,
  note: z.string().optional(),

  createdByPersonId: NonEmptyStringSchema,
  createdByRoleKey: z.string().optional(),

  approvedByPersonId: z.string().optional(),
  approvedByRoleKey: z.string().optional(),

  appliedAt: TimestampMsSchema.optional(),

  voidedAt: TimestampMsSchema.optional(),
  voidedByPersonId: z.string().optional(),
  voidReason: z.string().optional(),

  createdAt: TimestampMsSchema,
  updatedAt: TimestampMsSchema,
});

export type GuardianFinancialAdjustment = z.infer<
  typeof GuardianFinancialAdjustmentSchema
>;

/**
 * إيصال مرتبط بدفعة مالية.
 */
export const GuardianPaymentReceiptSchema = z.object({
  id: NonEmptyStringSchema,
  orgId: NonEmptyStringSchema,

  paymentId: NonEmptyStringSchema,

  guardianId: NonEmptyStringSchema,
  guardianPersonId: z.string().optional(),
  guardianDisplayName: z.string().optional(),

  receiptNumber: NonEmptyStringSchema,

  status: GuardianPaymentReceiptStatusSchema.default("ISSUED"),

  currency: CurrencyCodeSchema,
  amountMinor: MoneyMinorSchema,

  issuedAt: TimestampMsSchema,
  issuedByPersonId: NonEmptyStringSchema,
  issuedByRoleKey: z.string().optional(),

  /**
   * رابط نسخة PDF أو صورة الإيصال إن تم توليدها لاحقًا.
   */
  fileUrl: z.string().optional(),

  cancelledAt: TimestampMsSchema.optional(),
  cancelledByPersonId: z.string().optional(),
  cancellationReason: z.string().optional(),

  replacementReceiptId: z.string().optional(),

  note: z.string().optional(),

  createdAt: TimestampMsSchema,
  updatedAt: TimestampMsSchema,
});

export type GuardianPaymentReceipt = z.infer<
  typeof GuardianPaymentReceiptSchema
>;

/**
 * ملاحظة مالية مرتبطة بولي الأمر أو الطالب
 * أو مستحق أو دفعة معينة.
 */
export const GuardianFinanceNoteSchema = z.object({
  id: NonEmptyStringSchema,
  orgId: NonEmptyStringSchema,

  schoolId: z.string().optional(),
  academicYearId: z.string().optional(),
  termId: z.string().optional(),

  guardianId: z.string().optional(),
  guardianPersonId: z.string().optional(),

  studentId: z.string().optional(),
  studentPersonId: z.string().optional(),

  chargeId: z.string().optional(),
  installmentId: z.string().optional(),
  paymentId: z.string().optional(),
  adjustmentId: z.string().optional(),

  title: NonEmptyStringSchema,
  body: NonEmptyStringSchema,

  severity: GuardianFinanceNoteSeveritySchema.default("INFO"),
  visibility: GuardianFinanceNoteVisibilitySchema.default("INTERNAL"),

  createdByPersonId: NonEmptyStringSchema,
  createdByRoleKey: z.string().optional(),

  createdAt: TimestampMsSchema,
  updatedAt: TimestampMsSchema,
});

export type GuardianFinanceNote = z.infer<
  typeof GuardianFinanceNoteSchema
>;

/**
 * ملخص مالي لطالب واحد.
 *
 * Read Model يمكن بناؤه من domain ديناميكيًا،
 * ثم تخزينه لاحقًا عند الحاجة.
 */
export const StudentFinanceSummarySchema = z.object({
  id: NonEmptyStringSchema,
  orgId: NonEmptyStringSchema,

  schoolId: NonEmptyStringSchema,
  academicYearId: NonEmptyStringSchema,

  termId: z.string().optional(),
  termTitle: z.string().optional(),
  termShortTitle: z.string().optional(),

  studentId: NonEmptyStringSchema,
  studentPersonId: z.string().optional(),
  studentDisplayName: z.string().optional(),

  currency: CurrencyCodeSchema,

  originalAmountMinor: MoneyMinorSchema.default(0),
  discountAmountMinor: MoneyMinorSchema.default(0),
  surchargeAmountMinor: MoneyMinorSchema.default(0),

  netAmountMinor: MoneyMinorSchema.default(0),
  paidAmountMinor: MoneyMinorSchema.default(0),
  outstandingAmountMinor: MoneyMinorSchema.default(0),
  overdueAmountMinor: MoneyMinorSchema.default(0),

  chargeCount: z.number().int().nonnegative().default(0),
  openChargeCount: z.number().int().nonnegative().default(0),
  paidChargeCount: z.number().int().nonnegative().default(0),
  overdueChargeCount: z.number().int().nonnegative().default(0),

  nextInstallmentId: z.string().optional(),
  nextInstallmentTitle: z.string().optional(),
  nextInstallmentDueAt: TimestampMsSchema.optional(),
  nextInstallmentAmountMinor: MoneyMinorSchema.optional(),

  lastPaymentId: z.string().optional(),
  lastPaymentAt: TimestampMsSchema.optional(),
  lastPaymentAmountMinor: MoneyMinorSchema.optional(),

  updatedAt: TimestampMsSchema,
});

export type StudentFinanceSummary = z.infer<
  typeof StudentFinanceSummarySchema
>;

/**
 * صف طالب داخل ملخص ولي الأمر.
 */
export const GuardianFinanceStudentSummarySchema =
  StudentFinanceSummarySchema.omit({
    id: true,
    orgId: true,
    updatedAt: true,
  });

export type GuardianFinanceStudentSummary = z.infer<
  typeof GuardianFinanceStudentSummarySchema
>;

/**
 * الملخص المالي الكامل لولي الأمر.
 */
export const GuardianFinanceSummarySchema = z.object({
  id: NonEmptyStringSchema,
  orgId: NonEmptyStringSchema,

  guardianId: NonEmptyStringSchema,
  guardianPersonId: z.string().optional(),
  guardianDisplayName: z.string().optional(),
  guardianPhone: z.string().optional(),

  currency: CurrencyCodeSchema,

  originalAmountMinor: MoneyMinorSchema.default(0),
  discountAmountMinor: MoneyMinorSchema.default(0),
  surchargeAmountMinor: MoneyMinorSchema.default(0),

  netAmountMinor: MoneyMinorSchema.default(0),
  paidAmountMinor: MoneyMinorSchema.default(0),
  outstandingAmountMinor: MoneyMinorSchema.default(0),
  overdueAmountMinor: MoneyMinorSchema.default(0),

  studentCount: z.number().int().nonnegative().default(0),
  chargeCount: z.number().int().nonnegative().default(0),
  openChargeCount: z.number().int().nonnegative().default(0),
  overdueChargeCount: z.number().int().nonnegative().default(0),

  students: z
    .array(GuardianFinanceStudentSummarySchema)
    .default([]),

  lastPaymentId: z.string().optional(),
  lastPaymentAt: TimestampMsSchema.optional(),
  lastPaymentAmountMinor: MoneyMinorSchema.optional(),

  updatedAt: TimestampMsSchema,
});

export type GuardianFinanceSummary = z.infer<
  typeof GuardianFinanceSummarySchema
>;