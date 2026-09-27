import type { PersonSupervisionScope } from "@takween/contracts";

/** Client-side navigation hint only. Admin Work callables remain authoritative. */
export function canAccessAdminWork(params: {
  orgId?: string | null;
  personId?: string | null;
  roles?: readonly string[];
  scopes?: readonly PersonSupervisionScope[];
}) {
  const orgId = String(params.orgId || "").trim();
  const personId = String(params.personId || "").trim();
  const isPrincipal = (params.roles ?? []).some((role) =>
    ["BOYS_PRINCIPAL", "GIRLS_PRINCIPAL", "KG_PRINCIPAL"].includes(role),
  );
  const now = Date.now();
  const hasScope = (params.scopes ?? []).some((scope) => {
    // A visibility hint must not depend on package declarations that can be
    // older than the deployed capability schema. Callables remain authoritative.
    const raw = scope as unknown as {
      orgId?: string;
      personId?: string;
      capability?: string;
      isActive?: boolean;
      startAt?: number;
      endAt?: number;
    };
    return raw.orgId === orgId && raw.personId === personId && raw.capability === "ADMIN_WORK_VIEW" && raw.isActive !== false && !(typeof raw.startAt === "number" && raw.startAt > now) && !(typeof raw.endAt === "number" && raw.endAt < now);
  });
  return !!orgId && !!personId && isPrincipal && hasScope;
}
