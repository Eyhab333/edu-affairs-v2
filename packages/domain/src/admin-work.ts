import type { MembershipRole, SchoolProfile } from "@takween/contracts";

export type AdminWorkRoleInfo = {
  roleKey: MembershipRole;
  roleLabel: string;
};

/**
 * Returns the Admin Work role presentation for one specific school profile.
 * PRIMARY/MIXED is deliberately unsupported in V1 rather than guessed.
 */
export function getAdminWorkRoleInfo(
  profile: Pick<SchoolProfile, "schoolType" | "track" | "gender"> | null | undefined,
  roleKey: MembershipRole | null | undefined,
): AdminWorkRoleInfo | null {
  if (!profile || !roleKey) return null;
  const track = profile.track ?? profile.gender;
  const labels: Partial<Record<MembershipRole, string>> =
    profile.schoolType === "KG"
      ? {
          KG_VP: "وكيلة",
          ADMIN_ASSISTANT: "إدارية",
          MEDIA_SPECIALIST: "إعلامية",
        }
      : profile.schoolType === "PRIMARY" && track === "BOYS"
        ? {
            BOYS_VP: "وكيل المدرسة",
            ADMIN_ASSISTANT: "مساعد إداري",
            ACTIVITY_COORD: "رائد نشاط",
            MEDIA_SPECIALIST: "إعلامي",
            BOYS_STUDENT_GUIDE: "موجه طلابي",
            BOYS_EDU_VP: "وكيل تعليمي",
          }
        : profile.schoolType === "PRIMARY" && track === "GIRLS"
          ? {
              GIRLS_VP: "وكيلة",
              GIRLS_STUDENT_COUNSELOR: "موجهة طلابية",
              ADMIN_ASSISTANT: "إدارية",
              ACTIVITY_COORD: "رائدة نشاط",
              MEDIA_SPECIALIST: "إعلامية",
              SCHOOL_MONITOR: "مراقبة",
            }
          : {};
  const roleLabel = labels[roleKey];
  return roleLabel ? { roleKey, roleLabel } : null;
}

export function isAdminWorkPrincipal(roleKey: MembershipRole | null | undefined) {
  return roleKey === "BOYS_PRINCIPAL" || roleKey === "GIRLS_PRINCIPAL" || roleKey === "KG_PRINCIPAL";
}
