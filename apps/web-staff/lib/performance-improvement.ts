import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  type QueryConstraint,
} from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import {
  PerformanceImprovementPlanSchema,
  PerformanceImprovementSettingsSchema,
  PerformanceImprovementSignalSchema,
  type PerformanceImprovementPlan,
  type PerformanceImprovementSettings,
  type PerformanceImprovementSignal,
} from "@takween/contracts";

import { db, functions } from "@/lib/firebase";

export type PerformanceImprovementWorkspace = {
  signals: PerformanceImprovementSignal[];
  plans: PerformanceImprovementPlan[];
  pendingSignalsCount: number;
  activePlansCount: number;
  completedPlansCount: number;
  escalatedPlansCount: number;
  settingsBySchoolId: Record<string, PerformanceImprovementSettings>;
};

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

async function loadCollectionByQueries(params: {
  path: string;
  constraintGroups: QueryConstraint[][];
}): Promise<Array<{ id: string; data: Record<string, unknown> }>> {
  const ref = collection(db, params.path);
  const snapshots = await Promise.all(
    params.constraintGroups.map((constraints) =>
      getDocs(query(ref, ...constraints)),
    ),
  );
  const rows = new Map<string, { id: string; data: Record<string, unknown> }>();

  for (const snapshot of snapshots) {
    for (const document of snapshot.docs) {
      rows.set(document.id, {
        id: document.id,
        data: document.data() as Record<string, unknown>,
      });
    }
  }

  return Array.from(rows.values());
}

export async function buildPerformanceImprovementWorkspace(params: {
  orgId: string;
  personId: string;
  schoolIds: string[];
  canManage: boolean;
}): Promise<PerformanceImprovementWorkspace> {
  const schoolIds = uniqueStrings(params.schoolIds);
  const constraintGroups: QueryConstraint[][] = params.canManage
    ? schoolIds.map((schoolId) => [where("schoolId", "==", schoolId)])
    : [[where("targetPersonId", "==", params.personId)]];

  if (constraintGroups.length === 0) {
    return {
      signals: [],
      plans: [],
      pendingSignalsCount: 0,
      activePlansCount: 0,
      completedPlansCount: 0,
      escalatedPlansCount: 0,
      settingsBySchoolId: {},
    };
  }

  const [signalRows, planRows, settingsSnapshots] = await Promise.all([
    params.canManage
      ? loadCollectionByQueries({
          path: `orgs/${params.orgId}/performanceImprovementSignals`,
          constraintGroups,
        })
      : Promise.resolve([]),
    loadCollectionByQueries({
      path: `orgs/${params.orgId}/performanceImprovementPlans`,
      constraintGroups,
    }),
    params.canManage
      ? Promise.all(
          schoolIds.map((schoolId) =>
            getDoc(
              doc(
                db,
                `orgs/${params.orgId}/performanceImprovementSettings/${schoolId}`,
              ),
            ),
          ),
        )
      : Promise.resolve([]),
  ]);

  const signals = signalRows
    .map((row) =>
      PerformanceImprovementSignalSchema.safeParse({
        id: row.id,
        ...row.data,
      }),
    )
    .filter((result) => result.success)
    .map((result) => result.data)
    .sort((left, right) => right.updatedAt - left.updatedAt);

  const plans = planRows
    .map((row) =>
      PerformanceImprovementPlanSchema.safeParse({
        id: row.id,
        ...row.data,
      }),
    )
    .filter((result) => result.success)
    .map((result) => result.data)
    .sort((left, right) => right.updatedAt - left.updatedAt);

  const settingsBySchoolId: Record<
    string,
    PerformanceImprovementSettings
  > = {};

  for (let index = 0; index < schoolIds.length; index += 1) {
    const schoolId = schoolIds[index];
    const snapshot = settingsSnapshots[index];
    const parsed = PerformanceImprovementSettingsSchema.safeParse({
      id: schoolId,
      orgId: params.orgId,
      schoolId,
      ...(snapshot?.data() ?? {}),
      updatedAt:
        typeof snapshot?.data()?.updatedAt === "number"
          ? snapshot.data()?.updatedAt
          : 0,
    });

    if (parsed.success) settingsBySchoolId[schoolId] = parsed.data;
  }

  return {
    signals,
    plans,
    pendingSignalsCount: signals.filter(
      (signal) => signal.status === "NEEDS_REVIEW",
    ).length,
    activePlansCount: plans.filter(
      (plan) => plan.status === "ACTIVE" || plan.status === "FOLLOW_UP",
    ).length,
    completedPlansCount: plans.filter(
      (plan) => plan.status === "CLOSED_IMPROVED",
    ).length,
    escalatedPlansCount: plans.filter(
      (plan) => plan.status === "ESCALATED",
    ).length,
    settingsBySchoolId,
  };
}

export async function createPerformanceImprovementPlan(params: {
  orgId: string;
  signalId: string;
  objective: string;
  actions: string[];
  targetScore: number;
  durationDays: number;
}): Promise<{ planId: string; created: boolean }> {
  const callable = httpsCallable<
    typeof params,
    { ok: true; planId: string; created: boolean }
  >(functions, "createPerformanceImprovementPlan");
  const result = await callable(params);

  return {
    planId: result.data.planId,
    created: result.data.created,
  };
}

export async function dismissPerformanceImprovementSignal(params: {
  orgId: string;
  signalId: string;
  note: string;
}): Promise<void> {
  const callable = httpsCallable<typeof params, { ok: true }>(
    functions,
    "dismissPerformanceImprovementSignal",
  );
  await callable(params);
}

export type PerformanceImprovementPlanMutation =
  | "COMPLETE_ACTION"
  | "RECORD_FOLLOW_UP"
  | "CLOSE_IMPROVED"
  | "ESCALATE";

export async function updatePerformanceImprovementPlan(params: {
  orgId: string;
  planId: string;
  mutation: PerformanceImprovementPlanMutation;
  actionId?: string;
  score?: number;
  note?: string;
}): Promise<{ status: string }> {
  const callable = httpsCallable<
    typeof params,
    { ok: true; planId: string; status: string }
  >(functions, "updatePerformanceImprovementPlan");
  const result = await callable(params);
  return { status: result.data.status };
}

export async function updatePerformanceImprovementSettings(params: {
  orgId: string;
  schoolId: string;
  lowScoreThreshold: number;
  lowCycleCountThreshold: number;
  weakItemPercentageThreshold: number;
  weakItemOccurrenceThreshold: number;
  defaultTargetScore: number;
  defaultDurationDays: number;
}): Promise<void> {
  const callable = httpsCallable<typeof params, { ok: true }>(
    functions,
    "updatePerformanceImprovementSettings",
  );
  await callable(params);
}
