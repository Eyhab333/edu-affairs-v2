import { z } from "zod";

export const SchoolStudentDirectoryEntrySchema = z
  .object({
    orgId: z.string().trim().min(1),
    schoolId: z.string().trim().min(1),

    studentId: z.string().trim().min(1),
    personId: z.string().trim().optional().default(""),

    displayName: z.string().trim().min(1),

    nationalId: z.string().trim().optional().default(""),
    phone: z.string().trim().optional().default(""),
    email: z.string().trim().toLowerCase().optional().default(""),

    isActive: z.boolean().default(true),

    version: z.number().int().positive().default(1),
    updatedAtIso: z.string().datetime(),
  })
  .strict();

export type SchoolStudentDirectoryEntry = z.infer<
  typeof SchoolStudentDirectoryEntrySchema
>;