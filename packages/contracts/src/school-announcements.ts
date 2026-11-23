import { z } from "zod";

const IdSchema = z.string().trim().min(1).max(200);
const TimestampSchema = z.number().int().nonnegative();
const HttpsUrlSchema = z
  .string()
  .url()
  .refine((value) => value.startsWith("https://"), "HTTPS URL required");

export const SchoolAnnouncementPrioritySchema = z.enum([
  "NORMAL",
  "IMPORTANT",
  "URGENT",
]);
export type SchoolAnnouncementPriority = z.infer<
  typeof SchoolAnnouncementPrioritySchema
>;

export const SchoolAnnouncementStatusSchema = z.enum([
  "DRAFT",
  "PUBLISHED",
  "ARCHIVED",
]);
export type SchoolAnnouncementStatus = z.infer<
  typeof SchoolAnnouncementStatusSchema
>;

export const SchoolAnnouncementAudienceScopeSchema = z.enum([
  "SCHOOL",
  "GRADES",
  "CLASSES",
  "STUDENTS",
]);
export type SchoolAnnouncementAudienceScope = z.infer<
  typeof SchoolAnnouncementAudienceScopeSchema
>;

export const SchoolAnnouncementAudienceSchema = z.object({
  scope: SchoolAnnouncementAudienceScopeSchema.default("SCHOOL"),
  gradeIds: z.array(IdSchema).max(100).default([]),
  classIds: z.array(IdSchema).max(300).default([]),
  studentIds: z.array(IdSchema).max(500).default([]),
});
export type SchoolAnnouncementAudience = z.infer<
  typeof SchoolAnnouncementAudienceSchema
>;

export const SchoolAnnouncementAttachmentSchema = z.object({
  title: z.string().trim().min(1).max(200),
  url: HttpsUrlSchema,
  contentType: z.string().trim().max(200).optional(),
  sizeBytes: z.number().int().nonnegative().optional(),
});
export type SchoolAnnouncementAttachment = z.infer<
  typeof SchoolAnnouncementAttachmentSchema
>;

/**
 * A standalone school announcement. It deliberately has no dependency on the
 * school-activity lifecycle, registration, or notification models.
 */
export const SchoolAnnouncementSchema = z.object({
  id: IdSchema,
  orgId: IdSchema,
  schoolId: IdSchema,
  academicYearId: z.string().trim().max(200).default(""),
  termId: z.string().trim().max(200).default(""),

  title: z.string().trim().min(1).max(200),
  content: z.string().trim().min(1).max(20_000),
  priority: SchoolAnnouncementPrioritySchema.default("NORMAL"),
  imageUrl: HttpsUrlSchema.optional(),
  attachments: z.array(SchoolAnnouncementAttachmentSchema).max(10).default([]),
  audience: SchoolAnnouncementAudienceSchema.default({
    scope: "SCHOOL",
    gradeIds: [],
    classIds: [],
    studentIds: [],
  }),

  publicationStartsAt: TimestampSchema.optional(),
  publicationEndsAt: TimestampSchema.optional(),
  status: SchoolAnnouncementStatusSchema.default("DRAFT"),

  createdByUid: IdSchema,
  createdByPersonId: IdSchema,
  createdByRoleKey: z.string().trim().max(100).default(""),
  createdByDisplayName: z.string().trim().max(200).default(""),

  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
  publishedAt: TimestampSchema.optional(),
  archivedAt: TimestampSchema.optional(),
});
export type SchoolAnnouncement = z.infer<typeof SchoolAnnouncementSchema>;

export function isSchoolAnnouncementVisibleAt(
  announcement: Pick<
    SchoolAnnouncement,
    "status" | "publicationStartsAt" | "publicationEndsAt"
  >,
  nowMs: number,
) {
  return (
    announcement.status === "PUBLISHED" &&
    (announcement.publicationStartsAt == null ||
      announcement.publicationStartsAt <= nowMs) &&
    (announcement.publicationEndsAt == null ||
      nowMs <= announcement.publicationEndsAt)
  );
}
