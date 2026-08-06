import { z, type RefinementCtx } from "zod";

export const StaffProvisioningRoleKey = z.enum([
  // قيادة مدارس البنين
  "BOYS_PRINCIPAL",
  "BOYS_VP",
  "BOYS_EDU_VP",

  // إدارة مدارس البنين
  "ADMIN_ASSISTANT",
  "ACTIVITY_COORD",
  "MEDIA_SPECIALIST",
  "BOYS_STUDENT_GUIDE",

  // منار بنات
  "GIRLS_PRINCIPAL",
  "GIRLS_VP",
  "GIRLS_STUDENT_COUNSELOR",
  "SCHOOL_MONITOR",
  "NURSERY_CAREGIVER",

  // روضة
  "KG_PRINCIPAL",
  "KG_VP",

  // الإشراف متعدد المدارس
  "ORG_SUPERVISION_HEAD",
  "BOYS_EDU_SUPERVISOR",
  "ADMIN_SUPERVISOR",
  "EDU_SUPERVISOR",
  "VALUES_COORD",
]);

export type StaffProvisioningRoleKey = z.infer<
  typeof StaffProvisioningRoleKey
>;

type StaffProvisioningScopeInput = {
  schoolId: string;
  schoolIds: string[];
  scopeGroupIds: string[];
};

function addDuplicateValueIssues(params: {
  values: string[];
  fieldName: "schoolIds" | "scopeGroupIds";
  ctx: RefinementCtx;
}) {
  const indexes = new Map<string, number>();

  params.values.forEach((value, index) => {
    const previousIndex = indexes.get(value);

    if (previousIndex !== undefined) {
      params.ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `القيمة مكررة، وأول ظهور لها في العنصر ${previousIndex + 1}`,
        path: [params.fieldName, index],
      });

      return;
    }

    indexes.set(value, index);
  });
}

function validateStaffProvisioningScope(
  input: StaffProvisioningScopeInput,
  ctx: RefinementCtx,
) {
  const hasLegacySchoolId = input.schoolId.length > 0;
  const hasDirectSchoolIds = input.schoolIds.length > 0;
  const hasScopeGroups = input.scopeGroupIds.length > 0;

  if (!hasLegacySchoolId && !hasDirectSchoolIds && !hasScopeGroups) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message:
        "يجب توفير schoolId أو schoolIds أو scopeGroupIds على الأقل",
      path: ["schoolIds"],
    });
  }

  /*
   * عند إرسال schoolId مع schoolIds يجب أن يكون ضمن القائمة،
   * حتى لا يكون لدينا مصدران متعارضان لنطاق المدارس.
   */
  if (
    hasLegacySchoolId &&
    hasDirectSchoolIds &&
    !input.schoolIds.includes(input.schoolId)
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "يجب أن يكون schoolId موجودًا داخل schoolIds",
      path: ["schoolId"],
    });
  }

  addDuplicateValueIssues({
    values: input.schoolIds,
    fieldName: "schoolIds",
    ctx,
  });

  addDuplicateValueIssues({
    values: input.scopeGroupIds,
    fieldName: "scopeGroupIds",
    ctx,
  });
}

export const StaffProvisioningInputSchema = z
  .object({
    orgId: z.string().trim().min(1).default("takween"),

    displayName: z.string().trim().min(1),
    email: z.string().trim().toLowerCase().email(),

    nationalId: z.string().trim().optional().default(""),
    phone: z.string().trim().optional().default(""),

    roleKey: StaffProvisioningRoleKey,

    /**
     * حقل التوافق مع الاستدعاءات القديمة أحادية المدرسة.
     * لاحقًا سيُستخدم أيضًا كمدرسة أساسية عند الحاجة.
     */
    schoolId: z.string().trim().optional().default(""),

    /**
     * المدارس الفعلية التي ستُحفظ داخل membership.scopes.schoolIds.
     */
    schoolIds: z
      .array(z.string().trim().min(1))
      .optional()
      .default([]),

    /**
     * مجموعات النطاق التي تم منها اشتقاق schoolIds.
     * لا تعتمد Firestore Rules عليها مباشرة.
     */
    scopeGroupIds: z
      .array(z.string().trim().min(1))
      .optional()
      .default([]),

    title: z.string().trim().min(1),

    principalPersonId: z
      .string()
      .trim()
      .optional()
      .default(""),

    initialPassword: z.string().min(8).optional(),
  })
  .strict()
  .superRefine(validateStaffProvisioningScope);

export type StaffProvisioningInput = z.infer<
  typeof StaffProvisioningInputSchema
>;

/**
 * Batch member
 *
 * نطاق المدارس موجود على مستوى الدفعة؛ لأن كل أعضاء الدفعة
 * الحالية يشتركون في نفس النطاق.
 */
export const StaffProvisioningBatchMemberSchema = z
  .object({
    displayName: z.string().trim().min(1),
    email: z.string().trim().toLowerCase().email(),

    nationalId: z.string().trim().optional().default(""),
    phone: z.string().trim().optional().default(""),

    roleKey: StaffProvisioningRoleKey,
    title: z.string().trim().min(1),

    initialPassword: z.string().min(8).optional(),
  })
  .strict();

export type StaffProvisioningBatchMember = z.infer<
  typeof StaffProvisioningBatchMemberSchema
>;

export const StaffProvisioningBatchInputSchema = z
  .object({
    orgId: z.string().trim().min(1).default("takween"),

    /**
     * توافق مع الدفعات القديمة أحادية المدرسة.
     */
    schoolId: z.string().trim().optional().default(""),

    /**
     * المدارس الفعلية المشتركة بين أعضاء الدفعة.
     */
    schoolIds: z
      .array(z.string().trim().min(1))
      .optional()
      .default([]),

    /**
     * مجموعات نطاق المدارس المشتركة بين أعضاء الدفعة.
     */
    scopeGroupIds: z
      .array(z.string().trim().min(1))
      .optional()
      .default([]),

    principalPersonId: z
      .string()
      .trim()
      .optional()
      .default(""),

    staff: z.array(StaffProvisioningBatchMemberSchema).min(1),
  })
  .strict()
  .superRefine((input, ctx) => {
    validateStaffProvisioningScope(input, ctx);

    const emailIndexes = new Map<string, number>();

    input.staff.forEach((member, index) => {
      const previousIndex = emailIndexes.get(member.email);

      if (previousIndex !== undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `البريد مكرر داخل الدفعة، وأول ظهور له في الصف ${
            previousIndex + 1
          }`,
          path: ["staff", index, "email"],
        });

        return;
      }

      emailIndexes.set(member.email, index);
    });
  });

export type StaffProvisioningBatchInput = z.infer<
  typeof StaffProvisioningBatchInputSchema
>;
