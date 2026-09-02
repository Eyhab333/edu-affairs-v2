import type { PersonSupervisionScope } from "@takween/contracts";
import { getPersonSupervisionSchoolIds } from "@takween/domain";

/** Client-side visibility hint only; the Callable remains authoritative. */
export function canAccessStaffWork(params: {
  orgId?: string | null;
  personId?: string | null;
  scopes?: readonly PersonSupervisionScope[];
}) {
  const orgId = String(params.orgId || "").trim();
  const personId = String(params.personId || "").trim();
  return !!orgId && !!personId && getPersonSupervisionSchoolIds({
    scopes: params.scopes ?? [],
    orgId,
    personId,
    capability: "STAFF_WORK_VIEW",
  }).length > 0;
}
