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