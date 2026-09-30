import type { MembershipRole, PersonSupervisionScope } from "@takween/contracts";
import { getPersonSupervisionSchoolIds, hasOrgWideAccess } from "@takween/domain";

/** Client-side visibility hint only; the Callable remains authoritative. */
export function canAccessStaffWork(params: {
  orgId?: string | null;
  personId?: string | null;
  roles?: readonly MembershipRole[];
  scopes?: readonly PersonSupervisionScope[];
}) {
  const orgId = String(params.orgId || "").trim();
  const personId = String(params.personId || "").trim();
  return !!orgId && !!personId && (hasOrgWideAccess(params.roles) || getPersonSupervisionSchoolIds({
    scopes: params.scopes ?? [],
    orgId,
    personId,
    capability: "STAFF_WORK_VIEW",
  }).length > 0);
}
