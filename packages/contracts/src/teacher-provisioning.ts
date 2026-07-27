import { z } from "zod";

const NonEmptyStringSchema = z.string().trim().min(1);

export const TeacherProvisioningRoleKey = z.enum([
  "BOYS_TEACHER",
  "GIRLS_TEACHER",
  "KG_TEACHER",
]);

export type TeacherProvisioningRoleKey = z.infer<
  typeof TeacherProvisioningRoleKey
>;

export const TeacherProvisioningAssignmentSchema = z
  .object({
    academicYearId: NonEmptyStringSchema,
    termId: NonEmptyStringSchema,

    gradeId: NonEmptyStringSchema,
    classId: NonEmptyStringSchema,
    streamId: z.string().trim().optional().default(""),

    subjectKey: NonEmptyStringSchema,
    classSubjectOfferingId: NonEmptyStringSchema,
  })
  .strict();

export type TeacherProvisioningAssignment = z.infer<
  typeof TeacherProvisioningAssignmentSchema
>;

export const TeacherAdditionalDutyKey = z.enum([
  "HOMEROOM_TEACHER",
  "BUS_SUPERVISOR",
]);

export type TeacherAdditionalDutyKey = z.infer<typeof TeacherAdditionalDutyKey>;

const HomeroomTeacherDutySchema = z
  .object({
    dutyKey: z.literal("HOMEROOM_TEACHER"),

    academicYearId: NonEmptyStringSchema,
    termId: NonEmptyStringSchema,

    gradeId: NonEmptyStringSchema,
    classId: NonEmptyStringSchema,
  })
  .strict();

const BusSupervisorDutySchema = z
  .object({
    dutyKey: z.literal("BUS_SUPERVISOR"),
    routeId: NonEmptyStringSchema,
  })
  .strict();

export const TeacherAdditionalDutySchema = z.discriminatedUnion("dutyKey", [
  HomeroomTeacherDutySchema,
  BusSupervisorDutySchema,
]);

export type TeacherAdditionalDuty = z.infer<typeof TeacherAdditionalDutySchema>;

export const TeacherProvisioningBatchTeacherSchema = z
  .object({
    displayName: NonEmptyStringSchema,
    email: z.string().trim().toLowerCase().email(),

    nationalId: z.string().trim().optional().default(""),
    phone: z.string().trim().optional().default(""),

    roleKey: TeacherProvisioningRoleKey,
    title: NonEmptyStringSchema.default("معلم"),

    initialPassword: z.string().min(8).optional(),

    assignments: z.array(TeacherProvisioningAssignmentSchema).min(1),

    additionalDuties: z
      .array(TeacherAdditionalDutySchema)
      .optional()
      .default([]),
  })
  .strict()
  .superRefine((teacher, ctx) => {
    const assignmentKeys = new Set<string>();

    teacher.assignments.forEach((assignment, index) => {
      const key = [
        assignment.academicYearId,
        assignment.termId,
        assignment.classSubjectOfferingId,
      ].join("__");

      if (assignmentKeys.has(key)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "إسناد المادة مكرر لنفس المعلم",
          path: ["assignments", index],
        });

        return;
      }

      assignmentKeys.add(key);
    });

    const dutyKeys = new Set<string>();

    teacher.additionalDuties.forEach((duty, index) => {
      const key =
        duty.dutyKey === "HOMEROOM_TEACHER"
          ? [duty.dutyKey, duty.academicYearId, duty.termId, duty.classId].join(
              "__",
            )
          : [duty.dutyKey, duty.routeId].join("__");

      if (dutyKeys.has(key)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "المهمة الإضافية مكررة لنفس المعلم",
          path: ["additionalDuties", index],
        });

        return;
      }

      dutyKeys.add(key);
    });
  });

export type TeacherProvisioningBatchTeacher = z.infer<
  typeof TeacherProvisioningBatchTeacherSchema
>;

export const TeacherProvisioningBatchInputSchema = z
  .object({
    orgId: NonEmptyStringSchema.default("takween"),
    schoolId: NonEmptyStringSchema,

    teachers: z.array(TeacherProvisioningBatchTeacherSchema).min(1),
  })
  .strict()
  .superRefine((input, ctx) => {
    const emailIndexes = new Map<string, number>();

    input.teachers.forEach((teacher, index) => {
      const previousIndex = emailIndexes.get(teacher.email);

      if (previousIndex !== undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `البريد مكرر، وأول ظهور له في الصف ${previousIndex + 1}`,
          path: ["teachers", index, "email"],
        });

        return;
      }

      emailIndexes.set(teacher.email, index);
    });
  });

export type TeacherProvisioningBatchInput = z.infer<
  typeof TeacherProvisioningBatchInputSchema
>;
