import { z } from "zod";

import { MembershipRole } from "./membership-role";

const TimestampMsSchema = z.number().int().nonnegative();
const NonEmptyStringSchema = z.string().trim().min(1);

export const StaffChatGroupKind = z.enum(["SCHOOL", "SPECIAL"]);
export type StaffChatGroupKind = z.infer<typeof StaffChatGroupKind>;

export const StaffChatGroupStatus = z.enum(["ACTIVE", "ARCHIVED"]);
export type StaffChatGroupStatus = z.infer<typeof StaffChatGroupStatus>;

/**
 * These are evaluated against the caller's canonical org membership. Lists
 * are intentionally data, rather than scattered conditionals, so each group
 * can be adjusted later without changing its identity or messages.
 */
export const StaffChatAutomaticRuleSchema = z.object({
  orgUnitIds: z.array(NonEmptyStringSchema).default([]),
  positionCodes: z.array(NonEmptyStringSchema).default([]),
  roleKeys: z.array(MembershipRole).default([]),
});
export type StaffChatAutomaticRule = z.infer<
  typeof StaffChatAutomaticRuleSchema
>;

export const StaffChatGroupSchema = z.object({
  id: NonEmptyStringSchema,
  orgId: NonEmptyStringSchema,
  type: z.literal("STAFF_GROUP").default("STAFF_GROUP"),
  status: StaffChatGroupStatus.default("ACTIVE"),
  isInternal: z.literal(true).default(true),

  groupKind: StaffChatGroupKind,
  displayName: NonEmptyStringSchema,
  schoolId: z.string().trim().default(""),
  automaticRule: StaffChatAutomaticRuleSchema.default({}),

  /** Stable Firebase Auth UIDs; never display names or email addresses. */
  manualIncludedUids: z.array(NonEmptyStringSchema).default([]),
  manualExcludedUids: z.array(NonEmptyStringSchema).default([]),

  lastMessageSummary: z.string().default(""),
  lastMessageAt: TimestampMsSchema.optional(),
  lastMessageSenderUid: z.string().default(""),
  lastMessageSenderPersonId: z.string().default(""),
  lastMessageType: z.literal("TEXT").default("TEXT"),

  createdAt: TimestampMsSchema,
  updatedAt: TimestampMsSchema,
});
export type StaffChatGroup = z.infer<typeof StaffChatGroupSchema>;

export const StaffChatMessageSchema = z.object({
  id: NonEmptyStringSchema,
  orgId: NonEmptyStringSchema,
  groupId: NonEmptyStringSchema,
  type: z.literal("TEXT").default("TEXT"),
  status: z.literal("SENT").default("SENT"),
  senderUid: NonEmptyStringSchema,
  senderPersonId: NonEmptyStringSchema,
  senderRoleKey: z.string().default(""),
  senderDisplayName: NonEmptyStringSchema,
  body: NonEmptyStringSchema,
  createdAt: TimestampMsSchema,
  updatedAt: TimestampMsSchema,
});
export type StaffChatMessage = z.infer<typeof StaffChatMessageSchema>;
