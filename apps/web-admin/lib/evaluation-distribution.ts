export type DistributionMembership = {
  id: string;
  personId?: string;
  role?: string;
  roleKey?: string;
  isActive?: boolean;
  scopeType?: string;
  scopeId?: string;
  schoolId?: string;
  scopes?: {
    schoolIds?: string[];
    canAccessAllSchools?: boolean;
  };

  // روابط أدق اختيارية داخل العضوية
  directEvaluatorPersonId?: string;
  supervisorPersonId?: string;
  managerPersonId?: string;
  principalPersonId?: string;
  vicePrincipalPersonId?: string;
};

export type DistributionPolicy = {
  id: string;
  evaluatorRoleKey: string;
  targetRoleKey: string;
  schoolId?: string;
  scopeType?: string;
  scopeId?: string;
  canEvaluate?: boolean;
  isActive?: boolean;
};

export type DistributionPlan = {
  id: string;
  title: string;
  evaluatorRoleKey: string;
  targetRoleKey: string;
  targetKind: string;
  templateKey: string;
  schoolId?: string;
};

export type DistributionCycle = {
  id: string;
  planId: string;
  schoolId?: string;
  academicYearId: string;
  label: string;
  isOpen?: boolean;
  isLocked?: boolean;
};

export type DistributionSubmission = {
  id: string;
  planId: string;
  cycleId?: string;
  targetPersonId?: string;
  targetTeacherPersonId?: string;
};

export type DistributionPerson = {
  id: string;
  displayName?: string;
};

export type DistributionTargetAssignment = {
  id: string;
  schoolId?: string;
  targetPersonId: string;
  evaluatorPersonId: string;
  evaluatorRoleKey?: string;
  targetRoleKey?: string;
  relationType?: string;
  priority?: number;
  isActive?: boolean;
  notes?: string;
};

export type DistributionActor = {
  personId: string;
  displayName: string;
};

export type DistributionAssignmentSource =
  | "TARGET_ASSIGNMENT"
  | "MEMBERSHIP_LINK"
  | "ROLE_FALLBACK";

export type DistributionAssignment = {
  evaluatorPersonId: string;
  evaluatorDisplayName: string;
  targetPersonId: string;
  targetDisplayName: string;
  submissionId: string;
  sourceType: DistributionAssignmentSource;
  sourceLabel: string;
};

export type DistributionPreview = {
  matchingPoliciesCount: number;
  evaluators: DistributionActor[];
  targets: DistributionActor[];
  skippedExistingTargets: DistributionActor[];
  unresolvedTargets: DistributionActor[];
  assignments: DistributionAssignment[];
  directTargetAssignmentCount: number;
  membershipLinkCount: number;
  fallbackAssignmentCount: number;
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

export function membershipMatchesSchool(
  membership: DistributionMembership,
  schoolId: string
) {
  const scopeType = String(membership.scopeType || "").trim();
  const scopeId = String(membership.scopeId || "").trim();
  const directSchoolId = String(membership.schoolId || "").trim();
  const schoolIds = Array.isArray(membership.scopes?.schoolIds)
    ? membership.scopes?.schoolIds
    : [];

  if (membership.scopes?.canAccessAllSchools) return true;
  if (scopeType === "ORG") return true;
  if (scopeType === "SCHOOL" && scopeId === schoolId) return true;
  if (directSchoolId && directSchoolId === schoolId) return true;
  if (schoolIds.includes(schoolId)) return true;

  return false;
}

export function policyMatchesSchool(
  policy: DistributionPolicy,
  schoolId: string
) {
  const scopeType = String(policy.scopeType || "").trim();
  const scopeId = String(policy.scopeId || "").trim();
  const directSchoolId = String(policy.schoolId || "").trim();

  if (!scopeType && !scopeId && !directSchoolId) return true;
  if (scopeType === "ORG") return true;
  if (scopeType === "SCHOOL" && scopeId === schoolId) return true;
  if (directSchoolId && directSchoolId === schoolId) return true;

  return false;
}

function targetAssignmentMatchesSchool(
  assignment: DistributionTargetAssignment,
  schoolId: string
) {
  const directSchoolId = String(assignment.schoolId || "").trim();
  if (!directSchoolId) return true;
  return directSchoolId === schoolId;
}

function dedupeActors(
  memberships: DistributionMembership[],
  peopleMap: Map<string, string>
) {
  const seen = new Set<string>();
  const result: DistributionActor[] = [];

  for (const membership of memberships) {
    const personId = String(membership.personId || "").trim();
    if (!personId || seen.has(personId)) continue;

    seen.add(personId);
    result.push({
      personId,
      displayName: resolveDisplayName(peopleMap, personId),
    });
  }

  return result.sort((a, b) =>
    a.displayName.localeCompare(b.displayName, "ar")
  );
}

function buildEligibleEvaluatorMaps(args: {
  evaluatorMemberships: DistributionMembership[];
  peopleMap: Map<string, string>;
}) {
  const evaluatorMembershipsByPerson = new Map<string, DistributionMembership[]>();
  const evaluatorActors: DistributionActor[] = [];

  for (const membership of args.evaluatorMemberships) {
    const personId = String(membership.personId || "").trim();
    if (!personId) continue;

    if (!evaluatorMembershipsByPerson.has(personId)) {
      evaluatorMembershipsByPerson.set(personId, []);
      evaluatorActors.push({
        personId,
        displayName: resolveDisplayName(args.peopleMap, personId),
      });
    }

    evaluatorMembershipsByPerson.get(personId)!.push(membership);
  }

  evaluatorActors.sort((a, b) =>
    a.displayName.localeCompare(b.displayName, "ar")
  );

  return {
    evaluatorMembershipsByPerson,
    evaluatorActors,
  };
}

function pickEvaluatorFromMembershipLinks(args: {
  targetMembership: DistributionMembership;
  evaluatorMembershipsByPerson: Map<string, DistributionMembership[]>;
}) {
  const candidates = [
    args.targetMembership.directEvaluatorPersonId,
    args.targetMembership.supervisorPersonId,
    args.targetMembership.managerPersonId,
    args.targetMembership.principalPersonId,
    args.targetMembership.vicePrincipalPersonId,
  ]
    .map((item) => String(item || "").trim())
    .filter(Boolean);

  for (const personId of candidates) {
    if (args.evaluatorMembershipsByPerson.has(personId)) {
      return personId;
    }
  }

  return "";
}

export function buildCycleDistributionPreview(args: {
  schoolId: string;
  plan: DistributionPlan;
  cycle: DistributionCycle;
  memberships: DistributionMembership[];
  policies: DistributionPolicy[];
  people: DistributionPerson[];
  existingSubmissions: DistributionSubmission[];
  targetAssignments?: DistributionTargetAssignment[];
}) {
  const {
    schoolId,
    plan,
    cycle,
    memberships,
    policies,
    people,
    existingSubmissions,
    targetAssignments = [],
  } = args;

  const peopleMap = new Map(
    people.map((item) => [item.id, item.displayName || item.id])
  );

  const matchingPolicies = policies.filter(
    (policy) =>
      policy.isActive !== false &&
      policy.canEvaluate !== false &&
      policy.evaluatorRoleKey === plan.evaluatorRoleKey &&
      policy.targetRoleKey === plan.targetRoleKey &&
      policyMatchesSchool(policy, schoolId)
  );

  const evaluatorMemberships = memberships.filter(
    (membership) =>
      membership.isActive !== false &&
      !!membership.personId &&
      resolveRoleKey(membership) === plan.evaluatorRoleKey &&
      membershipMatchesSchool(membership, schoolId)
  );

  const targetMemberships = memberships.filter(
    (membership) =>
      membership.isActive !== false &&
      !!membership.personId &&
      resolveRoleKey(membership) === plan.targetRoleKey &&
      membershipMatchesSchool(membership, schoolId)
  );

  const { evaluatorMembershipsByPerson, evaluatorActors } =
    buildEligibleEvaluatorMaps({
      evaluatorMemberships,
      peopleMap,
    });

  const targets = dedupeActors(targetMemberships, peopleMap);

  const existingTargetIds = new Set(
    existingSubmissions
      .filter(
        (item) => item.planId === plan.id && String(item.cycleId || "") === cycle.id
      )
      .map((item) => item.targetPersonId || item.targetTeacherPersonId || "")
      .filter(Boolean)
  );

  const skippedExistingTargets = targets.filter((item) =>
    existingTargetIds.has(item.personId)
  );

  const creatableTargetMemberships = targetMemberships.filter((membership) => {
    const personId = String(membership.personId || "").trim();
    return personId && !existingTargetIds.has(personId);
  });

  const directAssignmentsByTarget = new Map<string, DistributionTargetAssignment[]>();
  for (const item of targetAssignments) {
    if (item.isActive === false) continue;
    if (!item.targetPersonId || !item.evaluatorPersonId) continue;
    if (!targetAssignmentMatchesSchool(item, schoolId)) continue;

    if (item.evaluatorRoleKey && item.evaluatorRoleKey !== plan.evaluatorRoleKey) {
      continue;
    }

    if (item.targetRoleKey && item.targetRoleKey !== plan.targetRoleKey) {
      continue;
    }

    if (!evaluatorMembershipsByPerson.has(item.evaluatorPersonId)) {
      continue;
    }

    if (!directAssignmentsByTarget.has(item.targetPersonId)) {
      directAssignmentsByTarget.set(item.targetPersonId, []);
    }

    directAssignmentsByTarget.get(item.targetPersonId)!.push(item);
  }

  for (const [, rows] of directAssignmentsByTarget.entries()) {
    rows.sort((a, b) => {
      const aPriority = Number(a.priority ?? 9999);
      const bPriority = Number(b.priority ?? 9999);
      if (aPriority !== bPriority) return aPriority - bPriority;
      return String(a.relationType || "").localeCompare(String(b.relationType || ""), "ar");
    });
  }

  const assignments: DistributionAssignment[] = [];
  const unresolvedTargets: DistributionActor[] = [];

  let directTargetAssignmentCount = 0;
  let membershipLinkCount = 0;
  let fallbackAssignmentCount = 0;
  let fallbackIndex = 0;

  for (const targetMembership of creatableTargetMemberships) {
    const targetPersonId = String(targetMembership.personId || "").trim();
    if (!targetPersonId) continue;

    const targetDisplayName = resolveDisplayName(peopleMap, targetPersonId);

    const directRows = directAssignmentsByTarget.get(targetPersonId) || [];
    const directRow = directRows[0];

    if (directRow) {
      assignments.push({
        evaluatorPersonId: directRow.evaluatorPersonId,
        evaluatorDisplayName: resolveDisplayName(
          peopleMap,
          directRow.evaluatorPersonId
        ),
        targetPersonId,
        targetDisplayName,
        submissionId: `submission-${cycle.id}-${targetPersonId}`,
        sourceType: "TARGET_ASSIGNMENT",
        sourceLabel: directRow.relationType || "DIRECT_LINK",
      });
      directTargetAssignmentCount += 1;
      continue;
    }

    const linkedEvaluatorPersonId = pickEvaluatorFromMembershipLinks({
      targetMembership,
      evaluatorMembershipsByPerson,
    });

    if (linkedEvaluatorPersonId) {
      assignments.push({
        evaluatorPersonId: linkedEvaluatorPersonId,
        evaluatorDisplayName: resolveDisplayName(peopleMap, linkedEvaluatorPersonId),
        targetPersonId,
        targetDisplayName,
        submissionId: `submission-${cycle.id}-${targetPersonId}`,
        sourceType: "MEMBERSHIP_LINK",
        sourceLabel: "MEMBERSHIP_LINK",
      });
      membershipLinkCount += 1;
      continue;
    }

    if (evaluatorActors.length > 0) {
      const evaluator = evaluatorActors[fallbackIndex % evaluatorActors.length];
      fallbackIndex += 1;

      assignments.push({
        evaluatorPersonId: evaluator.personId,
        evaluatorDisplayName: evaluator.displayName,
        targetPersonId,
        targetDisplayName,
        submissionId: `submission-${cycle.id}-${targetPersonId}`,
        sourceType: "ROLE_FALLBACK",
        sourceLabel: "ROLE_FALLBACK",
      });
      fallbackAssignmentCount += 1;
      continue;
    }

    unresolvedTargets.push({
      personId: targetPersonId,
      displayName: targetDisplayName,
    });
  }

  const issues: string[] = [];
  if (matchingPolicies.length === 0) {
    issues.push("لا توجد Evaluator Policies مطابقة لهذه الخطة وهذه المدرسة.");
  }
  if (evaluatorActors.length === 0) {
    issues.push("لا يوجد مقيّمون نشطون مطابقون لدور المقيّم داخل هذه المدرسة.");
  }
  if (targets.length === 0) {
    issues.push("لا يوجد مستهدفون نشطون مطابقون للدور المستهدف داخل هذه المدرسة.");
  }
  if (
    assignments.length === 0 &&
    targets.length > 0 &&
    skippedExistingTargets.length === targets.length
  ) {
    issues.push("كل المستهدفين لديهم Draft Submissions موجودة بالفعل لهذه الدورة.");
  }
  if (unresolvedTargets.length > 0) {
    issues.push("بعض المستهدفين لم يُعثر لهم على مقيّم مناسب.");
  }

  return {
    matchingPoliciesCount: matchingPolicies.length,
    evaluators: evaluatorActors,
    targets,
    skippedExistingTargets,
    unresolvedTargets,
    assignments,
    directTargetAssignmentCount,
    membershipLinkCount,
    fallbackAssignmentCount,
    issues,
  } satisfies DistributionPreview;
}