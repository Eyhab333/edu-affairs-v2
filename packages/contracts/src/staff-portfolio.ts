import { z } from "zod";

import { MembershipRole } from "./membership-role";

const TimestampMsSchema = z.number().int().nonnegative();
const IdSchema = z.string().trim().min(1);

export const StaffPortfolioItemKindSchema = z.enum([
  "INITIATIVE",
  "PROFESSIONAL_DEVELOPMENT",
]);
export type StaffPortfolioItemKind = z.infer<typeof StaffPortfolioItemKindSchema>;

export const StaffPortfolioItemStatusSchema = z.enum(["SUBMITTED", "ARCHIVED"]);
export type StaffPortfolioItemStatus = z.infer<typeof StaffPortfolioItemStatusSchema>;

export const StaffPortfolioFileSchema = z.object({
  storagePath: IdSchema,
  originalName: IdSchema,
  contentType: z.literal("application/pdf"),
  sizeBytes: z.number().int().positive().max(25 * 1024 * 1024),
});
export type StaffPortfolioFile = z.infer<typeof StaffPortfolioFileSchema>;

export const StaffPortfolioItemSchema = z.object({
  id: IdSchema,
  orgId: IdSchema,
  schoolId: IdSchema,
  schoolName: z.string().optional().default(""),
  academicYearId: IdSchema,
  academicYearTitle: z.string().optional().default(""),
  termId: IdSchema,
  termTitle: z.string().optional().default(""),

  ownerUid: IdSchema,
  ownerPersonId: IdSchema,
  ownerDisplayName: IdSchema,
  ownerRoleKey: MembershipRole,

  kind: StaffPortfolioItemKindSchema,
  title: IdSchema,
  description: z.string().optional().default(""),
  occurredAt: TimestampMsSchema,
  providerName: z.string().optional().default(""),
  trainingHours: z.number().nonnegative().optional(),

  file: StaffPortfolioFileSchema,
  status: StaffPortfolioItemStatusSchema.default("SUBMITTED"),
  submittedAt: TimestampMsSchema,
  createdAt: TimestampMsSchema,
  updatedAt: TimestampMsSchema,
  archivedAt: TimestampMsSchema.optional(),
  archivedByUid: z.string().optional().default(""),
  archivedByPersonId: z.string().optional().default(""),
});
export type StaffPortfolioItem = z.infer<typeof StaffPortfolioItemSchema>;

export const StaffPortfolioListFiltersSchema = z.object({
  schoolId: z.string().trim().optional().default(""),
  ownerPersonId: z.string().trim().optional().default(""),
  kind: StaffPortfolioItemKindSchema.optional(),
  academicYearId: z.string().trim().optional().default(""),
  termId: z.string().trim().optional().default(""),
});
export type StaffPortfolioListFilters = z.infer<typeof StaffPortfolioListFiltersSchema>;
