import type { MembershipRole } from "@takween/contracts";

import { hasOrgWideAccess } from "./access";

export type SpecialStaffReportingAccess = Readonly<{
  schoolIds: readonly string[];
  canAccessReports: true;
  canAccessCentralMeasurementSummary: true;
  canAccessKgMeasurementSummary: true;
}>;

type SpecialStaffReportingRule = Readonly<{
  personIds?: readonly string[];
  uids?: readonly string[];
  schoolIds: readonly string[];
}>;

const SPECIAL_STAFF_REPORTING_RULES: readonly SpecialStaffReportingRule[] = [
  {
    personIds: ["p-a-almansur"],
    schoolIds: ["mrb-girls", "kg-01", "kg-02", "kg-03", "kg-04"],
  },
  {
    personIds: ["p-malrameh"],
    schoolIds: ["kg-01", "kg-02", "kg-03", "kg-04"],
  },
  {
    personIds: ["p-f-alhamaad"],
    schoolIds: ["kg-01", "kg-02", "kg-03", "kg-04"],
  },
  {
    personIds: ["p-s-sayed"],
    schoolIds: ["mrb-girls", "mrb-boys-sayh", "mrb-boys-faleh"],
  },
  {
    // This historic identifier may be stored either as a person ID or Firebase UID.
    personIds: ["staff-ZKSVVOeoJOhUhIu4HDFapMwApo83"],
    uids: ["staff-ZKSVVOeoJOhUhIu4HDFapMwApo83"],
    schoolIds: ["mrb-girls"],
  },
];

const FULL_STAFF_REPORTING_ROLE_KEYS = new Set<MembershipRole>([
  "BOYS_PRINCIPAL",
  "GIRLS_PRINCIPAL",
  "KG_PRINCIPAL",
  "BOYS_VP",
  "BOYS_EDU_VP",
  "BOYS_STUDENTS_VP",
  "BOYS_TEACHERS_VP",
  "GIRLS_VP",
  "KG_VP",
  "ORG_SUPERVISION_HEAD",
  "BOYS_SUPERVISION_HEAD",
  "EDU_SUPERVISOR",
  "BOYS_EDU_SUPERVISOR",
  "GIRLS_EDU_SUPERVISOR",
  "KG_EDU_SUPERVISOR",
]);

function normalizeId(value: string | undefined) {
  return value?.trim() || "";
}

function uniqueSchoolIds(values: readonly string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

/**
 * Narrow, read-only reporting access for named Takween staff.
 * This intentionally does not affect organization-wide access, memberships,
 * visible classes, or any write capability.
 */
export function getSpecialStaffReportingAccess(params: {
  orgId: string;
  personId?: string;
  uid?: string;
}): SpecialStaffReportingAccess | null {
  if (normalizeId(params.orgId) !== "takween") return null;

  const personId = normalizeId(params.personId);
  const uid = normalizeId(params.uid);
  const rule = SPECIAL_STAFF_REPORTING_RULES.find(
    (candidate) =>
      (personId.length > 0 && candidate.personIds?.includes(personId)) ||
      (uid.length > 0 && candidate.uids?.includes(uid)),
  );

  if (!rule) return null;

  return Object.freeze({
    schoolIds: Object.freeze(uniqueSchoolIds(rule.schoolIds)),
    canAccessReports: true as const,
    canAccessCentralMeasurementSummary: true as const,
    canAccessKgMeasurementSummary: true as const,
  });
}

/**
 * Controls which report surfaces an actor may open. It intentionally does not
 * resolve or expand the actor's school, class, or supervision data scope.
 */
export function hasFullStaffReportingAccess(params: {
  orgId: string;
  personId?: string;
  uid?: string;
  roles?: readonly MembershipRole[];
}): boolean {
  return (
    hasOrgWideAccess(params.roles) ||
    Boolean(
      params.roles?.some((role) => FULL_STAFF_REPORTING_ROLE_KEYS.has(role)),
    ) ||
    getSpecialStaffReportingAccess(params)?.canAccessReports === true
  );
}
