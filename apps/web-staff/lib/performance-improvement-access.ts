import type { MembershipRole } from "@takween/contracts";

import type { StaffActorData } from "@/lib/staff-actor";

const FULL_MANAGEMENT_ROLES = new Set<MembershipRole>([
  "platform_owner",
  "platform_admin",
  "org_owner",
  "org_admin",
]);

const TEACHER_ROLES = new Set<MembershipRole>([
  "teacher",
  "BOYS_TEACHER",
  "GIRLS_TEACHER",
  "KG_TEACHER",
]);

/**
 * Mirrors the evaluation backend access rule for the management workspace.
 * MY_EVALUATIONS is intentionally not sufficient: teachers may use that
 * module for their own evaluations, but they cannot manage improvement plans.
 */
export function canAccessPerformanceImprovement(actor: StaffActorData): boolean {
  const membership = actor.memberships.find(
    (item) => item.orgId === actor.orgId && item.isActive !== false,
  );

  if (!membership) return false;

  const roleKey = membership.roleKey ?? membership.role;

  if (roleKey && TEACHER_ROLES.has(roleKey)) return false;

  return Boolean(
    membership.permissions?.manageEvaluations ||
      membership.permissions?.manageOrg ||
      (roleKey && FULL_MANAGEMENT_ROLES.has(roleKey)),
  );
}
