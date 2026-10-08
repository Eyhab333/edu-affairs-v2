import { httpsCallable } from "firebase/functions";

import { functions } from "@/lib/firebase";

export type SpecialMeasurementSummarySource = {
  schools: Array<{ id: string; name: string }>;
  classes: Array<Record<string, unknown> & { id: string }>;
  templates: Array<Record<string, unknown> & { id: string }>;
  batches: Array<Record<string, unknown> & { id: string }>;
  teacherDirectory: Array<{
    assignmentId: string;
    teacherPersonId: string;
    teacherName: string;
  }>;
};

const getSummarySource = httpsCallable<
  { orgId: string; academicYearId: string; termId: string },
  SpecialMeasurementSummarySource
>(functions, "getSpecialStaffMeasurementSummarySource");

export async function loadSpecialMeasurementSummarySource(params: {
  orgId: string;
  academicYearId: string;
  termId: string;
}): Promise<SpecialMeasurementSummarySource> {
  return (await getSummarySource(params)).data;
}