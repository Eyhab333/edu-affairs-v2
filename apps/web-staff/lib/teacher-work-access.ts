import { canReviewStaffPortfolio } from "@takween/domain";

import type { StaffActorData } from "@/lib/staff-actor";

/**
 * Teacher-work monitoring is for school leadership and educational
 * supervision. Keep this aligned with the existing portfolio-review roles;
 * data access remains enforced by Firestore rules and the actor's school scope.
 */
export function canAccessTeacherWork(actor: StaffActorData) {
  return actor.schools.length > 0 && canReviewStaffPortfolio(actor.roles);
}
