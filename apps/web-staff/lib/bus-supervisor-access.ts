import type { MembershipRole } from "@takween/contracts";

/**
 * A standalone bus supervisor has no other staff role. Their workspace is
 * intentionally limited to Transport, even before a route is assigned.
 */
export function isStandaloneBusSupervisor(
  roles: readonly MembershipRole[],
) {
  return roles.length === 1 && roles[0] === "BUS_SUPERVISOR";
}
