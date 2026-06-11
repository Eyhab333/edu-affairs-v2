import {
  membershipMatchesSchool,
  type DistributionMembership,
  type DistributionPerson,
  type DistributionTargetAssignment,
} from "@/lib/evaluation-distribution";

export type BootstrapPlan = {
  id: string;
  title: string;
  schoolId?: string;
  evaluatorRoleKey: string;
  targetRoleKey: string;
  isActive?: boolean;
};

export type BootstrapProposal = {
  key: string;
  schoolId: string;
  schoolLabel: string;
  targetPersonId: string;
  targetDisplayName: string;
  targetRoleKey: string;
  evaluatorPersonId: string;
  evaluatorDisplayName: string;
  evaluatorRoleKey: string;
  relationType: string;
  priority: number;
  sourceType: "DIRECT_LINK" | "UNIQUE_ROLE_MATCH";
  sourcePlanIds: string[];
  sourcePlanTitles: string[];
};

export type BootstrapSkippedRow = BootstrapProposal & {
  reason: "EXISTS";
};

export type BootstrapUnresolvedRow = {
  key: string;
  schoolId: string;
  schoolLabel: string;
  targetPersonId: string;
  targetDisplayName: string;
  targetRoleKey: string;
  evaluatorRoleKey: string;
  sourcePlanIds: string[];
  sourcePlanTitles: string[];
  reason:
    | "NO_SCHOOL_SCOPE"
    | "NO_EVALUATOR_MATCH"
    | "MULTIPLE_EVALUATORS"
    | "MISSING_TARGET_PERSON";
};

export type BootstrapPreview = {
  proposed: BootstrapProposal[];
  skippedExisting: BootstrapSkippedRow[];
  unresolved: BootstrapUnresolvedRow[];
  stats: {
    plansCount: number;
    targetsSeen: number;
    proposedCount: number;
    skippedCount: number;
    unresolvedCount: number;
    directLinkCount: number;
    uniqueRoleMatchCount: number;
  };
  issues: string[];
};

function resolveRoleKey(membership: DistributionMembership) {
  return String(membership.roleKey || membership.role || "").trim();
}

function resolveDisplayName(
  peopleMap: Map<string, string>,
  personId: string
) {
  return peopleMap.get(personId) || personId;
}

function uniqueStrings(values: string[]) {
  return [...new Set(values.map((item) => String(item || "").trim()).filter(Boolean))];
}

function getMembershipSchoolIds(membership: DistributionMembership) {
  const directSchoolId = String(membership.schoolId || "").trim();
  const scopeType = String(membership.scopeType || "").trim();
  const scopeId = String(membership.scopeId || "").trim();
  const schoolIds = Array.isArray(membership.scopes?.schoolIds)
    ? membership.scopes?.schoolIds
    : [];

  return uniqueStrings([
    directSchoolId,
    scopeType === "SCHOOL" ? scopeId : "",
    ...schoolIds,
  ]);
}

function buildExistingKeys(existingAssignments: DistributionTargetAssignment[]) {
  const keys = new Set<string>();

  for (const row of existingAssignments) {
    if (row.isActive === false) continue;

    const schoolId = String(row.schoolId || "").trim();
    const targetPersonId = String(row.targetPersonId || "").trim();
    const evaluatorPersonId = String(row.evaluatorPersonId || "").trim();
    const evaluatorRoleKey = String(row.evaluatorRoleKey || "").trim();
    const targetRoleKey = String(row.targetRoleKey || "").trim();

    if (!schoolId || !targetPersonId || !evaluatorPersonId) continue;

    keys.add(
      `${schoolId}|${targetPersonId}|${targetRoleKey}|${evaluatorPersonId}|${evaluatorRoleKey}`
    );
  }

  return keys;
}

function appendPlanMeta<T extends { sourcePlanIds: string[]; sourcePlanTitles: string[] }>(
  row: T,
  plan: BootstrapPlan
) {
  if (!row.sourcePlanIds.includes(plan.id)) {
    row.sourcePlanIds.push(plan.id);
  }

  if (!row.sourcePlanTitles.includes(plan.title)) {
    row.sourcePlanTitles.push(plan.title);
  }
}

function pickDirectEvaluatorCandidate(args: {
  targetMembership: DistributionMembership;
  evaluatorMemberships: DistributionMembership[];
}) {
  const candidateIds = uniqueStrings([
    String(args.targetMembership.directEvaluatorPersonId || ""),
    String(args.targetMembership.supervisorPersonId || ""),
    String(args.targetMembership.managerPersonId || ""),
    String(args.targetMembership.principalPersonId || ""),
    String(args.targetMembership.vicePrincipalPersonId || ""),
  ]);

  for (const personId of candidateIds) {
    const matched = args.evaluatorMemberships.find(
      (membership) => String(membership.personId || "").trim() === personId
    );

    if (matched) {
      return {
        personId,
        relationType: "DIRECT_LINK",
        priority: 1,
      };
    }
  }

  return null;
}

export function buildEvaluationAssignmentsBootstrapPreview(args: {
  schools: Array<{ id: string; name: string }>;
  people: DistributionPerson[];
  memberships: DistributionMembership[];
  plans: BootstrapPlan[];
  existingAssignments: DistributionTargetAssignment[];
}) {
  const { schools, people, memberships, plans, existingAssignments } = args;

  const peopleMap = new Map(
    people.map((item) => [item.id, item.displayName || item.id])
  );
  const schoolMap = new Map(schools.map((item) => [item.id, item.name]));

  const existingKeys = buildExistingKeys(existingAssignments);

  const proposedMap = new Map<string, BootstrapProposal>();
  const skippedMap = new Map<string, BootstrapSkippedRow>();
  const unresolvedMap = new Map<string, BootstrapUnresolvedRow>();

  const activePlans = plans.filter(
    (plan) =>
      plan.isActive !== false &&
      String(plan.evaluatorRoleKey || "").trim() &&
      String(plan.targetRoleKey || "").trim()
  );

  const seenTargets = new Set<string>();
  let directLinkCount = 0;
  let uniqueRoleMatchCount = 0;

  for (const plan of activePlans) {
    const targetMemberships = memberships.filter(
      (membership) =>
        membership.isActive !== false &&
        !!membership.personId &&
        resolveRoleKey(membership) === plan.targetRoleKey
    );

    const evaluatorMembershipsBySchool = new Map<string, DistributionMembership[]>();

    for (const membership of memberships) {
      if (
        membership.isActive === false ||
        !membership.personId ||
        resolveRoleKey(membership) !== plan.evaluatorRoleKey
      ) {
        continue;
      }

      const membershipSchoolIds = getMembershipSchoolIds(membership);
      for (const schoolId of membershipSchoolIds) {
        if (!schoolId) continue;
        if (!evaluatorMembershipsBySchool.has(schoolId)) {
          evaluatorMembershipsBySchool.set(schoolId, []);
        }
        evaluatorMembershipsBySchool.get(schoolId)!.push(membership);
      }
    }

    for (const targetMembership of targetMemberships) {
      const targetPersonId = String(targetMembership.personId || "").trim();

      if (!targetPersonId) {
        const unresolvedKey = `missing-person|${plan.id}|${targetMembership.id}`;
        if (!unresolvedMap.has(unresolvedKey)) {
          unresolvedMap.set(unresolvedKey, {
            key: unresolvedKey,
            schoolId: "",
            schoolLabel: "—",
            targetPersonId: "",
            targetDisplayName: "—",
            targetRoleKey: plan.targetRoleKey,
            evaluatorRoleKey: plan.evaluatorRoleKey,
            sourcePlanIds: [plan.id],
            sourcePlanTitles: [plan.title],
            reason: "MISSING_TARGET_PERSON",
          });
        }
        continue;
      }

      seenTargets.add(targetPersonId);

      const targetDisplayName = resolveDisplayName(peopleMap, targetPersonId);

      const membershipSchoolIds = getMembershipSchoolIds(targetMembership);
      const effectiveSchoolIds = uniqueStrings(
        plan.schoolId
          ? membershipSchoolIds.filter((schoolId) => schoolId === plan.schoolId)
          : membershipSchoolIds
      );

      if (effectiveSchoolIds.length === 0) {
        const unresolvedKey = `no-school|${targetPersonId}|${plan.targetRoleKey}|${plan.evaluatorRoleKey}|${plan.schoolId || "ORG"}`;
        const existing = unresolvedMap.get(unresolvedKey);

        if (existing) {
          appendPlanMeta(existing, plan);
        } else {
          unresolvedMap.set(unresolvedKey, {
            key: unresolvedKey,
            schoolId: plan.schoolId || "",
            schoolLabel: plan.schoolId ? schoolMap.get(plan.schoolId) || plan.schoolId : "—",
            targetPersonId,
            targetDisplayName,
            targetRoleKey: plan.targetRoleKey,
            evaluatorRoleKey: plan.evaluatorRoleKey,
            sourcePlanIds: [plan.id],
            sourcePlanTitles: [plan.title],
            reason: "NO_SCHOOL_SCOPE",
          });
        }

        continue;
      }

      for (const schoolId of effectiveSchoolIds) {
        const schoolLabel = schoolMap.get(schoolId) || schoolId;

        const evaluatorMemberships = (evaluatorMembershipsBySchool.get(schoolId) || []).filter(
          (membership) => membershipMatchesSchool(membership, schoolId)
        );

        const directCandidate = pickDirectEvaluatorCandidate({
          targetMembership,
          evaluatorMemberships,
        });

        let chosenEvaluatorPersonId = "";
        let relationType = "";
        let priority = 0;
        let sourceType: "DIRECT_LINK" | "UNIQUE_ROLE_MATCH" | "" = "";

        if (directCandidate) {
          chosenEvaluatorPersonId = directCandidate.personId;
          relationType = directCandidate.relationType;
          priority = directCandidate.priority;
          sourceType = "DIRECT_LINK";
        } else {
          const uniqueEvaluatorIds = uniqueStrings(
            evaluatorMemberships.map((membership) => String(membership.personId || ""))
          );

          if (uniqueEvaluatorIds.length === 1) {
            chosenEvaluatorPersonId = uniqueEvaluatorIds[0];
            relationType = "UNIQUE_ROLE_MATCH";
            priority = 20;
            sourceType = "UNIQUE_ROLE_MATCH";
          } else if (uniqueEvaluatorIds.length === 0) {
            const unresolvedKey = `no-evaluator|${schoolId}|${targetPersonId}|${plan.targetRoleKey}|${plan.evaluatorRoleKey}`;
            const existing = unresolvedMap.get(unresolvedKey);

            if (existing) {
              appendPlanMeta(existing, plan);
            } else {
              unresolvedMap.set(unresolvedKey, {
                key: unresolvedKey,
                schoolId,
                schoolLabel,
                targetPersonId,
                targetDisplayName,
                targetRoleKey: plan.targetRoleKey,
                evaluatorRoleKey: plan.evaluatorRoleKey,
                sourcePlanIds: [plan.id],
                sourcePlanTitles: [plan.title],
                reason: "NO_EVALUATOR_MATCH",
              });
            }
            continue;
          } else {
            const unresolvedKey = `multiple-evaluators|${schoolId}|${targetPersonId}|${plan.targetRoleKey}|${plan.evaluatorRoleKey}`;
            const existing = unresolvedMap.get(unresolvedKey);

            if (existing) {
              appendPlanMeta(existing, plan);
            } else {
              unresolvedMap.set(unresolvedKey, {
                key: unresolvedKey,
                schoolId,
                schoolLabel,
                targetPersonId,
                targetDisplayName,
                targetRoleKey: plan.targetRoleKey,
                evaluatorRoleKey: plan.evaluatorRoleKey,
                sourcePlanIds: [plan.id],
                sourcePlanTitles: [plan.title],
                reason: "MULTIPLE_EVALUATORS",
              });
            }
            continue;
          }
        }

        const evaluatorDisplayName = resolveDisplayName(
          peopleMap,
          chosenEvaluatorPersonId
        );

        const proposalKey = `${schoolId}|${targetPersonId}|${plan.targetRoleKey}|${chosenEvaluatorPersonId}|${plan.evaluatorRoleKey}`;

        if (existingKeys.has(proposalKey)) {
          const existing = skippedMap.get(proposalKey);

          if (existing) {
            appendPlanMeta(existing, plan);
          } else {
            skippedMap.set(proposalKey, {
              key: proposalKey,
              schoolId,
              schoolLabel,
              targetPersonId,
              targetDisplayName,
              targetRoleKey: plan.targetRoleKey,
              evaluatorPersonId: chosenEvaluatorPersonId,
              evaluatorDisplayName,
              evaluatorRoleKey: plan.evaluatorRoleKey,
              relationType,
              priority,
              sourceType,
              sourcePlanIds: [plan.id],
              sourcePlanTitles: [plan.title],
              reason: "EXISTS",
            });
          }

          continue;
        }

        const existingProposal = proposedMap.get(proposalKey);

        if (existingProposal) {
          appendPlanMeta(existingProposal, plan);
        } else {
          proposedMap.set(proposalKey, {
            key: proposalKey,
            schoolId,
            schoolLabel,
            targetPersonId,
            targetDisplayName,
            targetRoleKey: plan.targetRoleKey,
            evaluatorPersonId: chosenEvaluatorPersonId,
            evaluatorDisplayName,
            evaluatorRoleKey: plan.evaluatorRoleKey,
            relationType,
            priority,
            sourceType,
            sourcePlanIds: [plan.id],
            sourcePlanTitles: [plan.title],
          });

          if (sourceType === "DIRECT_LINK") directLinkCount += 1;
          if (sourceType === "UNIQUE_ROLE_MATCH") uniqueRoleMatchCount += 1;
        }
      }
    }
  }

  const proposed = [...proposedMap.values()].sort((a, b) => {
    if (a.schoolLabel !== b.schoolLabel) {
      return a.schoolLabel.localeCompare(b.schoolLabel, "ar");
    }
    if (a.targetDisplayName !== b.targetDisplayName) {
      return a.targetDisplayName.localeCompare(b.targetDisplayName, "ar");
    }
    return a.evaluatorDisplayName.localeCompare(b.evaluatorDisplayName, "ar");
  });

  const skippedExisting = [...skippedMap.values()].sort((a, b) => {
    if (a.schoolLabel !== b.schoolLabel) {
      return a.schoolLabel.localeCompare(b.schoolLabel, "ar");
    }
    return a.targetDisplayName.localeCompare(b.targetDisplayName, "ar");
  });

  const unresolved = [...unresolvedMap.values()].sort((a, b) => {
    if (a.schoolLabel !== b.schoolLabel) {
      return a.schoolLabel.localeCompare(b.schoolLabel, "ar");
    }
    return a.targetDisplayName.localeCompare(b.targetDisplayName, "ar");
  });

  const issues: string[] = [];
  if (activePlans.length === 0) {
    issues.push("لا توجد Plans نشطة صالحة للاعتماد في الـ bootstrap.");
  }
  if (proposed.length === 0 && unresolved.length > 0) {
    issues.push("تعذر اقتراح روابط تلقائية لبعض أو كل المستهدفين. راجع unresolved.");
  }

  return {
    proposed,
    skippedExisting,
    unresolved,
    stats: {
      plansCount: activePlans.length,
      targetsSeen: seenTargets.size,
      proposedCount: proposed.length,
      skippedCount: skippedExisting.length,
      unresolvedCount: unresolved.length,
      directLinkCount,
      uniqueRoleMatchCount,
    },
    issues,
  } satisfies BootstrapPreview;
}