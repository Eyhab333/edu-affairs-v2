import type { PersonSupervisionScope } from "@takween/contracts";
import { getPersonSupervisionSchoolIds, isAdminWorkPrincipal } from "@takween/domain";

/** Client-side navigation hint only. Admin Work callables remain authoritative. */
export function canAccessAdminWork(params: {
  orgId?: string | null;
  personId?: string | null;
  roles?: readonly string[];
  scopes?: readonly PersonSupervisionScope[];
}) {
  const orgId = String(params.orgId || "").trim();
  const personId = String(params.personId || "").trim();
  return !!orgId && !!personId && (params.roles ?? []).some((role) => isAdminWorkPrincipal(role as never)) && getPersonSupervisionSchoolIds({
    scopes: params.scopes ?? [], orgId, personId, capability: "ADMIN_WORK_VIEW",
  }).length > 0;
}
