import { z } from "zod";

import { MembershipRole } from "./membership-role";

export const StaffPdfFileCategoryKey = z.enum([
  "WORK_DOCUMENTATION",
  "KG_VALUE_1",
  "KG_VALUE_2",
  "KG_VALUE_3",
  "KG_VALUE_4",
]);
export type StaffPdfFileCategoryKey = z.infer<typeof StaffPdfFileCategoryKey>;

export const StaffPdfFileStatus = z.enum(["ACTIVE", "ARCHIVED"]);
export type StaffPdfFileStatus = z.infer<typeof StaffPdfFileStatus>;

export const StaffPdfFileSchema = z.object({
  id: z.string().trim().min(1),
  orgId: z.string().trim().min(1),
  categoryKey: StaffPdfFileCategoryKey,

  ownerPersonId: z.string().trim().min(1),
  ownerUid: z.string().trim().min(1),
  ownerDisplayName: z.string().trim().min(1),
  ownerSchoolIds: z.array(z.string().trim().min(1)).default([]),
  ownerOrgUnitIds: z.array(z.string().trim().min(1)).default([]),
  ownerRoleKeys: z.array(MembershipRole).default([]),
  ownerOperationalAssignmentIds: z.array(z.string().trim().min(1)).default([]),

  title: z.string().trim().min(1),
  description: z.string().trim().default(""),

  originalFileName: z.string().trim().min(1),
  storagePath: z.string().trim().min(1),
  contentType: z.literal("application/pdf"),
  sizeBytes: z.number().int().positive(),

  status: StaffPdfFileStatus.default("ACTIVE"),
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
});

export type StaffPdfFile = z.infer<typeof StaffPdfFileSchema>;
