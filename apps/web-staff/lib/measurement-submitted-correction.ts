import type { MembershipRole } from "@takween/contracts";
import { canReviewStaffPortfolio } from "@takween/domain";

type SubmittedMeasurementBatchForCorrection = {
  status?: string;
  schoolId?: string;
  classId?: string;
  createdByPersonId?: string;
};

/**
 * Submitted measurement batches remain immutable for ordinary teachers.
 * The original owner may correct their own batch. Established review roles may
 * correct a batch only when its class is within their visible scope.
 */
export function canCorrectSubmittedMeasurementBatch(params: {
  batch: SubmittedMeasurementBatchForCorrection;
  actorPersonId?: string;
  actorUid?: string;
  actorRoles?: readonly string[];
  hasVisibleClassAccess: boolean;
}): boolean {
  const { batch } = params;

  if (batch.status !== "SUBMITTED") return false;

  // Batches are normally owned by a person. Older/current creation flows use
  // the authenticated uid only when a person record is unavailable, so retain
  // that same canonical fallback without mixing the two identities otherwise.
  const actorOwnerId =
    params.actorPersonId?.trim() || params.actorUid?.trim();
  const isOriginalOwner = Boolean(
    actorOwnerId && batch.createdByPersonId === actorOwnerId,
  );

  if (isOriginalOwner) return true;

  if (!batch.schoolId || !batch.classId || !params.hasVisibleClassAccess) {
    return false;
  }

  return canReviewStaffPortfolio(
    (params.actorRoles ?? []) as MembershipRole[],
  );
}
