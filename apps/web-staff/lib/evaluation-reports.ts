import { httpsCallable } from "firebase/functions";
import type {
  EvaluationReportOverview,
  EvaluationReportPersonDetail,
  EvaluationReportRequest,
} from "@takween/contracts";

import { functions } from "@/lib/firebase";

const getOverview = httpsCallable<
  EvaluationReportRequest,
  EvaluationReportOverview
>(functions, "getEvaluationReportOverview");

const getPersonDetail = httpsCallable<
  EvaluationReportRequest & { targetPersonId: string },
  EvaluationReportPersonDetail
>(functions, "getEvaluationReportPersonDetail");

export async function loadEvaluationReportOverview(
  params: EvaluationReportRequest,
): Promise<EvaluationReportOverview> {
  return (await getOverview(params)).data;
}

export async function loadEvaluationReportPersonDetail(
  params: EvaluationReportRequest & { targetPersonId: string },
): Promise<EvaluationReportPersonDetail> {
  return (await getPersonDetail(params)).data;
}
