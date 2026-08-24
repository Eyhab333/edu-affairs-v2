import { z } from "zod";

export const MembershipRole = z.enum([
  /**
   * Access / admin roles
   */
  "platform_owner",
  "platform_admin",
  "org_owner",
  "org_admin",
  "school_admin",
  "school_manager",
  "staff",
  "teacher",
  "viewer",

  /**
   * Org / leadership
   */
  "ORG_CHAIR",
  "ORG_CEO",
  "ORG_CEO_ASSIST",
  "ORG_SUPERVISION_HEAD",

  /**
   * Shared operational roles
   */
  "ADMIN_SUPERVISOR",
  "ADMIN_ASSISTANT",
  "MEDIA_SPECIALIST",
  "HR_SPECIALIST",
  "ACTIVITY_COORD",
  "SCHOOL_MONITOR",
  "NURSERY_CAREGIVER",
  "FINANCE_COLLECTOR",

  "EDU_SUPERVISOR",
  "VALUES_COORD",

  /**
   * Boys school roles
   */
  "BOYS_SUPERVISION_HEAD",
  "BOYS_PRINCIPAL",
  "BOYS_VP",
  "BOYS_EDU_VP",
  "BOYS_STUDENT_GUIDE",
  "BOYS_STUDENTS_VP",
  "BOYS_TEACHERS_VP",
  "BOYS_EDU_SUPERVISOR",
  "BOYS_TEACHER",

  /**
   * Girls school roles
   */
  "GIRLS_PRINCIPAL",
  "GIRLS_VP",
  "GIRLS_STUDENT_COUNSELOR",
  "GIRLS_EDU_SUPERVISOR",
  "GIRLS_TEACHER",

  /**
   * KG roles
   */
  "KG_EDU_SUPERVISOR",
  "KG_VALUES_COORD",
  "KG_PRINCIPAL",
  "KG_VP",
  "KG_TEACHER",

  /**
   * Transport / guardians
   */
  "BUS_SUPERVISOR",
  "GUARDIAN",
]);

export type MembershipRole = z.infer<typeof MembershipRole>;
