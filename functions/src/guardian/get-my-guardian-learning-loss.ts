import { onCall } from "firebase-functions/v2/https";

import { assertGuardianStudentAccess } from "./guardian-student-access";

const REGION = "me-central2";

type FirestoreData = Record<string, unknown>;

type GuardianLearningLossSkill = {
  title: string;
  description: string;
  domain: string;
  severity: string;
};

type GuardianRemediationAction = {
  title: string;
  description: string;
  status: string;
  dueAt: number | null;
  completedAt: number | null;
};

function readString(data: FirestoreData, key: string): string {
  const value = data[key];
  return typeof value === "string" ? value.trim() : "";
}

function readNumber(data: FirestoreData, key: string): number | null {
  const value = data[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readRow(value: unknown): FirestoreData {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as FirestoreData)
    : {};
}

function isTechnicalIdentifier(value: string): boolean {
  return /^[a-z0-9]+(?:[-_][a-z0-9]+)+$/i.test(value);
}

function readableValue(value: unknown): string {
  const result = typeof value === "string" ? value.trim() : "";
  return result && !isTechnicalIdentifier(result) ? result : "";
}

function skills(value: unknown): GuardianLearningLossSkill[] {
  return (Array.isArray(value) ? value : []).map((item) => {
    const data = readRow(item);
    return {
      title: readString(data, "title"),
      description: readString(data, "description"),
      domain: readString(data, "domain"),
      severity: readString(data, "severity"),
    };
  });
}

function remediationActions(value: unknown): GuardianRemediationAction[] {
  return (Array.isArray(value) ? value : []).map((item) => {
    const data = readRow(item);
    return {
      title: readString(data, "title"),
      description: readString(data, "description"),
      status: readString(data, "status"),
      dueAt: readNumber(data, "dueAt"),
      completedAt: readNumber(data, "completedAt"),
    };
  });
}

function lastFollowUpAt(params: {
  actions: GuardianRemediationAction[];
  firstCheckMeasuredAt: number | null;
  secondCheckMeasuredAt: number | null;
}): number | null {
  const values = [
    ...params.actions.map((action) => action.completedAt),
    params.firstCheckMeasuredAt,
    params.secondCheckMeasuredAt,
  ].filter((value): value is number => value !== null);

  return values.length ? Math.max(...values) : null;
}

function offeringKey(data: FirestoreData): string {
  return [
    readString(data, "schoolId"),
    readString(data, "academicYearId"),
    readString(data, "classId"),
    readString(data, "subjectKey"),
  ].join("::");
}

function unique(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function resolveSubjectTitle(params: {
  plan: FirestoreData;
  offeringById: Map<string, FirestoreData>;
  offeringByClassSubject: Map<string, FirestoreData>;
}): string {
  const offering =
    params.offeringById.get(readString(params.plan, "classSubjectOfferingId")) ||
    params.offeringByClassSubject.get(offeringKey(params.plan));

  return (
    readableValue(offering?.displayName) ||
    readableValue(offering?.shortLabel) ||
    readableValue(offering?.subjectTitleSnapshot) ||
    readString(params.plan, "subjectKey") ||
    "مادة غير محددة"
  );
}

/** Returns guardian-safe learning-loss plans for one linked child only. */
export const getMyGuardianLearningLoss = onCall(
  { region: REGION, cors: true, memory: "1GiB", minInstances: 1 },
  async (request) => {
    const context = await assertGuardianStudentAccess(
      request.auth?.uid,
      request.data?.studentId,
    );

    const plansSnapshot = await context.db
      .collection(`orgs/${context.orgId}/studentLearningLossPlans`)
      .where("studentId", "==", context.studentId)
      .get();
    const plans = plansSnapshot.docs.map((document) => ({
      id: document.id,
      data: document.data() as FirestoreData,
    }));

    const offeringIds = unique(
      plans.map(({ data }) => readString(data, "classSubjectOfferingId")),
    );
    const offeringDocuments = offeringIds.length
      ? await context.db.getAll(
          ...offeringIds.map((offeringId) =>
            context.db.doc(
              `orgs/${context.orgId}/classSubjectOfferings/${offeringId}`,
            ),
          ),
        )
      : [];
    const offerings = offeringDocuments
      .filter((document) => document.exists)
      .map((document) => ({
        id: document.id,
        data: document.data() as FirestoreData,
      }))
      .filter(({ data }) => data.isArchived !== true);
    const initiallyResolvedOfferingIds = new Set(
      offerings.map(({ id }) => id),
    );
    const fallbackSchoolIds = unique(
      plans
        .filter(
          ({ data }) =>
            !initiallyResolvedOfferingIds.has(
              readString(data, "classSubjectOfferingId"),
            ),
        )
        .map(({ data }) => readString(data, "schoolId")),
    );
    const fallbackSnapshots = await Promise.all(
      fallbackSchoolIds.map((schoolId) =>
        context.db
          .collection(`orgs/${context.orgId}/classSubjectOfferings`)
          .where("schoolId", "==", schoolId)
          .get(),
      ),
    );
    for (const snapshot of fallbackSnapshots) {
      for (const document of snapshot.docs) {
        const data = document.data() as FirestoreData;
        if (data.isArchived !== true) offerings.push({ id: document.id, data });
      }
    }
    const offeringById = new Map(offerings.map(({ id, data }) => [id, data]));
    const offeringByClassSubject = new Map(
      offerings.map(({ data }) => [offeringKey(data), data]),
    );

    const mappedPlans = plans
      .map(({ id, data }) => {
        const actions = remediationActions(data.remediationActions);
        const firstCheckMeasuredAt = readNumber(data, "firstCheckMeasuredAt");
        const secondCheckMeasuredAt = readNumber(data, "secondCheckMeasuredAt");

        return {
          planId: id,
          studentId: context.studentId,
          subjectKey: readString(data, "subjectKey"),
          subjectTitle: resolveSubjectTitle({
            plan: data,
            offeringById,
            offeringByClassSubject,
          }),
          status: readString(data, "status") || "ACTIVE",
          sourceType: readString(data, "sourceType"),
          sourceTitle: readString(data, "sourceTitle"),
          sourceKind: readString(data, "sourceKind"),
          planTitle: readString(data, "planTitle"),
          planText: readString(data, "planText"),
          planStartAt: readNumber(data, "planStartAt"),
          planEndAt: readNumber(data, "planEndAt"),
          lostSkills: skills(data.lostSkills),
          remediationActions: actions,
          baselineScore: readNumber(data, "baselineScore"),
          baselineMaxScore: readNumber(data, "baselineMaxScore"),
          baselineMeasuredAt: readNumber(data, "baselineMeasuredAt"),
          firstCheckScore: readNumber(data, "firstCheckScore"),
          firstCheckMaxScore: readNumber(data, "firstCheckMaxScore"),
          firstCheckMeasuredAt,
          secondCheckScore: readNumber(data, "secondCheckScore"),
          secondCheckMaxScore: readNumber(data, "secondCheckMaxScore"),
          secondCheckMeasuredAt,
          improvementIndicator: readString(data, "improvementIndicator") || "UNKNOWN",
          improvementDelta: readNumber(data, "improvementDelta"),
          improvementPercentage: readNumber(data, "improvementPercentage"),
          lastFollowUpAt: lastFollowUpAt({
            actions,
            firstCheckMeasuredAt,
            secondCheckMeasuredAt,
          }),
          createdAt: readNumber(data, "createdAt"),
          updatedAt: readNumber(data, "updatedAt"),
        };
      })
      .sort((left, right) => {
        const leftDate = left.lastFollowUpAt ?? left.planStartAt ?? 0;
        const rightDate = right.lastFollowUpAt ?? right.planStartAt ?? 0;
        return rightDate - leftDate;
      });

    return { plans: mappedPlans };
  },
);
