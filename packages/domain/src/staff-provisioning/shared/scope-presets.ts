import type { StaffProvisioningScopeProfile } from "../types";

export const SINGLE_SCHOOL_SCOPE = {
  scopeType: "SCHOOL",
  canAccessAllSchools: false,
} satisfies StaffProvisioningScopeProfile;


// الموظف يعمل داخل مدرسة واحدة فقط
// ولا يرى باقي مدارس المؤسسة
