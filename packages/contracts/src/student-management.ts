import { z } from "zod";

const SafeIdSchema = z.string().trim().min(1).max(128).refine(
  (value) => !value.includes("/"),
  "Document identifiers cannot contain '/'.",
);

const OptionalIdentityTextSchema = z.string().trim().max(200);

export const UpdateStudentIdentityChangesSchema = z
  .object({
    displayName: z.string().trim().min(1).max(200).optional(),
    nationalId: OptionalIdentityTextSchema.optional(),
    phone: OptionalIdentityTextSchema.optional(),
    email: z
      .string()
      .trim()
      .max(320)
      .refine(
        (value) => !value || z.string().email().safeParse(value).success,
        "Email must be a valid email address or empty.",
      )
      .optional(),
  })
  .strict()
  .refine(
    (changes) => Object.values(changes).some((value) => value !== undefined),
    "At least one identity field must be provided.",
  );

export type UpdateStudentIdentityChanges = z.infer<
  typeof UpdateStudentIdentityChangesSchema
>;

export const UpdateStudentIdentityRequestSchema = z
  .object({
    orgId: SafeIdSchema,
    studentId: SafeIdSchema,
    changes: UpdateStudentIdentityChangesSchema,
    operationId: SafeIdSchema.optional(),
    reason: z.string().trim().max(1000).optional(),
  })
  .strict();

export type UpdateStudentIdentityRequest = z.infer<
  typeof UpdateStudentIdentityRequestSchema
>;

export const UpdateStudentIdentityResultSchema = z
  .object({
    updated: z.boolean(),
    noChange: z.boolean(),
    studentId: SafeIdSchema,
    personId: SafeIdSchema,
    updatedFields: z.array(
      z.enum(["displayName", "nationalId", "phone", "email"]),
    ),
    operationId: SafeIdSchema.optional(),
  })
  .strict();

export type UpdateStudentIdentityResult = z.infer<
  typeof UpdateStudentIdentityResultSchema
>;

const RequiredIdentityTextSchema = z.string().trim().min(1).max(200);
const EnrollmentIdSchema = z.string().trim().min(1).max(1500).refine(
  (value) => !value.includes("/"),
  "Document identifiers cannot contain '/'.",
);

export const CreateStudentIdentitySchema = z
  .object({
    displayName: RequiredIdentityTextSchema,
    nationalId: RequiredIdentityTextSchema,
    phone: OptionalIdentityTextSchema.optional().default(""),
    email: z
      .string()
      .trim()
      .max(320)
      .refine(
        (value) => !value || z.string().email().safeParse(value).success,
        "Email must be a valid email address or empty.",
      )
      .optional()
      .default(""),
  })
  .strict();

export type CreateStudentIdentity = z.infer<typeof CreateStudentIdentitySchema>;

export const CreateStudentPlacementSchema = z
  .object({
    schoolId: SafeIdSchema,
    academicYearId: SafeIdSchema,
    classId: SafeIdSchema,
  })
  .strict();

export type CreateStudentPlacement = z.infer<typeof CreateStudentPlacementSchema>;

export const CreateStudentRequestSchema = z
  .object({
    orgId: SafeIdSchema,
    identity: CreateStudentIdentitySchema,
    placement: CreateStudentPlacementSchema,
    operationId: SafeIdSchema,
    reason: z.string().trim().max(1000).optional(),
  })
  .strict();

export type CreateStudentRequest = z.infer<typeof CreateStudentRequestSchema>;

export const CreateStudentResultSchema = z
  .object({
    created: z.literal(true),
    personId: SafeIdSchema,
    studentId: SafeIdSchema,
    enrollmentId: EnrollmentIdSchema,
    operationId: SafeIdSchema,
  })
  .strict();

export type CreateStudentResult = z.infer<typeof CreateStudentResultSchema>;

export const TransferStudentTargetSchema = z
  .object({
    schoolId: SafeIdSchema,
    academicYearId: SafeIdSchema,
    classId: SafeIdSchema,
  })
  .strict();

export type TransferStudentTarget = z.infer<typeof TransferStudentTargetSchema>;

export const TransferStudentRequestSchema = z
  .object({
    orgId: SafeIdSchema,
    studentId: SafeIdSchema,
    target: TransferStudentTargetSchema,
    transferReason: z.string().trim().min(1).max(1000),
    operationId: SafeIdSchema,
  })
  .strict();

export type TransferStudentRequest = z.infer<typeof TransferStudentRequestSchema>;

export const TransferStudentResultSchema = z
  .object({
    transferred: z.boolean(),
    noChange: z.boolean(),
    studentId: SafeIdSchema,
    sourceEnrollmentId: EnrollmentIdSchema,
    targetEnrollmentId: EnrollmentIdSchema,
    operationId: SafeIdSchema,
  })
  .strict();

export type TransferStudentResult = z.infer<typeof TransferStudentResultSchema>;

export const EndStudentEnrollmentRequestSchema = z
  .object({
    orgId: SafeIdSchema,
    studentId: SafeIdSchema,
    academicYearId: SafeIdSchema,
    reason: z.string().trim().min(1).max(1000),
    operationId: SafeIdSchema,
  })
  .strict();

export type EndStudentEnrollmentRequest = z.infer<
  typeof EndStudentEnrollmentRequestSchema
>;

export const EndStudentEnrollmentResultSchema = z
  .object({
    ended: z.literal(true),
    studentId: SafeIdSchema,
    sourceEnrollmentId: EnrollmentIdSchema,
    operationId: SafeIdSchema,
  })
  .strict();

export type EndStudentEnrollmentResult = z.infer<
  typeof EndStudentEnrollmentResultSchema
>;

export const ReEnrollStudentRequestSchema = z
  .object({
    orgId: SafeIdSchema,
    studentId: SafeIdSchema,
    target: TransferStudentTargetSchema,
    reason: z.string().trim().min(1).max(1000),
    operationId: SafeIdSchema,
  })
  .strict();

export type ReEnrollStudentRequest = z.infer<typeof ReEnrollStudentRequestSchema>;

export const ReEnrollStudentResultSchema = z
  .object({
    reenrolled: z.literal(true),
    studentId: SafeIdSchema,
    enrollmentId: EnrollmentIdSchema,
    operationId: SafeIdSchema,
  })
  .strict();

export type ReEnrollStudentResult = z.infer<typeof ReEnrollStudentResultSchema>;
