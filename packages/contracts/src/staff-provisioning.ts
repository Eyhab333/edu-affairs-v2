import { z } from "zod";

export const StaffProvisioningRoleKey = z.enum([
  "BOYS_PRINCIPAL",
  "BOYS_VP",
  "BOYS_EDU_VP",
]);

export type StaffProvisioningRoleKey = z.infer<typeof StaffProvisioningRoleKey>;

export const StaffProvisioningInputSchema = z
  .object({
    orgId: z.string().trim().min(1).default("takween"),

    displayName: z.string().trim().min(1),
    email: z.string().trim().toLowerCase().email(),

    nationalId: z.string().trim().optional().default(""),
    phone: z.string().trim().optional().default(""),

    roleKey: StaffProvisioningRoleKey,

    schoolId: z.string().trim().min(1),
    title: z.string().trim().min(1),
    principalPersonId: z.string().trim().optional().default(""),

    initialPassword: z.string().min(8).optional(),
  })
  .strict();

export type StaffProvisioningInput = z.infer<
  typeof StaffProvisioningInputSchema
>;



// Batch Schema
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
    schoolId: z.string().trim().min(1),

    principalPersonId: z.string().trim().optional().default(""),

    staff: z.array(StaffProvisioningBatchMemberSchema).min(1),
  })
  .strict()
  .superRefine((input, ctx) => {
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

