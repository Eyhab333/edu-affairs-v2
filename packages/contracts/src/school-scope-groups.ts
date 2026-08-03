import { z } from "zod";

export const SchoolScopeGroupSchema = z
  .object({
    id: z.string().trim().min(1),
    orgId: z.string().trim().min(1),

    title: z.string().trim().min(1),
    description: z.string().trim().optional().default(""),

    /**
     * المدارس الفعلية التي تشملها المجموعة.
     * هذه القائمة هي التي تُنسخ لاحقًا إلى membership.scopes.schoolIds.
     */
    schoolIds: z.array(z.string().trim().min(1)).min(1),

    isActive: z.boolean().default(true),

    createdAt: z.number().int().nonnegative().optional(),
    updatedAt: z.number().int().nonnegative().optional(),
  })
  .strict()
  .superRefine((group, ctx) => {
    const indexes = new Map<string, number>();

    group.schoolIds.forEach((schoolId, index) => {
      const previousIndex = indexes.get(schoolId);

      if (previousIndex !== undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `المدرسة مكررة، وأول ظهور لها في العنصر ${
            previousIndex + 1
          }`,
          path: ["schoolIds", index],
        });

        return;
      }

      indexes.set(schoolId, index);
    });
  });

export type SchoolScopeGroup = z.infer<
  typeof SchoolScopeGroupSchema
>;