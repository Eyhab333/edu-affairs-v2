import type { MembershipRole, StaffPortfolioItem, StaffPortfolioItemKind } from "@takween/contracts";

export const STAFF_PORTFOLIO_TEACHER_ROLE_KEYS = new Set<MembershipRole>([
  "teacher", "BOYS_TEACHER", "GIRLS_TEACHER", "KG_TEACHER",
]);

export const STAFF_PORTFOLIO_SUPERVISOR_ROLE_KEYS = new Set<MembershipRole>([
  "EDU_SUPERVISOR", "BOYS_EDU_SUPERVISOR", "GIRLS_EDU_SUPERVISOR", "KG_EDU_SUPERVISOR",
]);

export const STAFF_PORTFOLIO_SCHOOL_MANAGEMENT_ROLE_KEYS = new Set<MembershipRole>([
  "school_admin", "school_manager", "BOYS_PRINCIPAL", "BOYS_VP", "BOYS_EDU_VP", "BOYS_TEACHERS_VP",
  "GIRLS_PRINCIPAL", "GIRLS_VP", "KG_PRINCIPAL", "KG_VP",
]);

export const STAFF_PORTFOLIO_SUPERVISION_HEAD_ROLE_KEYS = new Set<MembershipRole>([
  "ORG_SUPERVISION_HEAD", "BOYS_SUPERVISION_HEAD",
]);

export const STAFF_PORTFOLIO_ORG_ADMIN_ROLE_KEYS = new Set<MembershipRole>([
  "platform_owner", "platform_admin", "org_owner", "org_admin",
]);

export function isStaffPortfolioTeacherRole(role: MembershipRole | undefined) {
  return !!role && STAFF_PORTFOLIO_TEACHER_ROLE_KEYS.has(role);
}

export function canReviewStaffPortfolio(roles: MembershipRole[]) {
  return roles.some((role) =>
    STAFF_PORTFOLIO_SUPERVISOR_ROLE_KEYS.has(role) ||
    STAFF_PORTFOLIO_SCHOOL_MANAGEMENT_ROLE_KEYS.has(role) ||
    STAFF_PORTFOLIO_SUPERVISION_HEAD_ROLE_KEYS.has(role) ||
    STAFF_PORTFOLIO_ORG_ADMIN_ROLE_KEYS.has(role),
  );
}

export type StaffPortfolioDomainIssue = "providerName" | "trainingHours";

export function validateStaffPortfolioKindFields(params: {
  kind: StaffPortfolioItemKind;
  providerName?: string;
  trainingHours?: number;
}): StaffPortfolioDomainIssue[] {
  const issues: StaffPortfolioDomainIssue[] = [];
  if (params.kind === "INITIATIVE" && (params.providerName?.trim() || params.trainingHours !== undefined)) {
    issues.push("providerName", "trainingHours");
  }
  if (params.trainingHours !== undefined && (!Number.isFinite(params.trainingHours) || params.trainingHours < 0)) {
    issues.push("trainingHours");
  }
  return Array.from(new Set(issues));
}

export function canReadStaffPortfolioItem(params: {
  item: StaffPortfolioItem;
  actor: { uid: string; personId: string; roles: MembershipRole[]; schoolIds: string[]; canAccessAllSchools: boolean };
  supervisedTeacherPersonIds: Set<string>;
}): boolean {
  const { item, actor } = params;
  if (item.ownerUid === actor.uid && item.ownerPersonId === actor.personId && actor.roles.some(isStaffPortfolioTeacherRole)) return true;
  if (actor.roles.some((role) => STAFF_PORTFOLIO_ORG_ADMIN_ROLE_KEYS.has(role))) return true;
  if (actor.roles.some((role) => STAFF_PORTFOLIO_SUPERVISOR_ROLE_KEYS.has(role)) && params.supervisedTeacherPersonIds.has(item.ownerPersonId)) return true;
  const schoolInScope = actor.canAccessAllSchools || actor.schoolIds.includes(item.schoolId);
  if (!schoolInScope) return false;
  if (actor.roles.some((role) => STAFF_PORTFOLIO_SCHOOL_MANAGEMENT_ROLE_KEYS.has(role) || STAFF_PORTFOLIO_SUPERVISION_HEAD_ROLE_KEYS.has(role))) return true;
  return false;
}
