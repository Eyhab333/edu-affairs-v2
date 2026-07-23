import { z } from "zod";

export const StaffProvisioningRoleKey = z.enum(["BOYS_PRINCIPAL"]);

export type StaffProvisioningRoleKey = z.infer<
  typeof StaffProvisioningRoleKey
>;

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

    initialPassword: z.string().min(8).optional(),
  })
  .strict();

export type StaffProvisioningInput = z.infer<
  typeof StaffProvisioningInputSchema
>;