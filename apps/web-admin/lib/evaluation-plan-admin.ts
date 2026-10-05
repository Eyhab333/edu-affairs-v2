import { httpsCallable } from "firebase/functions";
import type {
  EvaluationAdminPlanChangeApplyResult,
  EvaluationAdminPlanChangeInput,
  EvaluationAdminPlanChangePreview,
} from "@takween/contracts";

import { functions } from "@/lib/firebase";

export async function previewEvaluationPlanChange(
  input: EvaluationAdminPlanChangeInput,
): Promise<EvaluationAdminPlanChangePreview> {
  const call = httpsCallable<
    EvaluationAdminPlanChangeInput,
    EvaluationAdminPlanChangePreview
  >(functions, "adminPreviewEvaluationPlanChange");

  return (await call(input)).data;
}

export async function applyEvaluationPlanChange(
  input: EvaluationAdminPlanChangeInput & { previewFingerprint: string },
): Promise<EvaluationAdminPlanChangeApplyResult> {
  const call = httpsCallable<
    EvaluationAdminPlanChangeInput & { previewFingerprint: string },
    EvaluationAdminPlanChangeApplyResult
  >(functions, "adminApplyEvaluationPlanChange");

  return (await call(input)).data;
}
