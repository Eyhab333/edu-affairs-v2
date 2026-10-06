export const KG_MEASUREMENT_SUBJECTS = [
  "LEARNING_GARDENS",
  "QURAN",
  "COUNT_AND_CALCULATE",
] as const;

export type KgMeasurementSubject = (typeof KG_MEASUREMENT_SUBJECTS)[number];

export const KG_EVALUATOR_ROLES = [
  "KG_TEACHER",
  "KG_VP",
  "EDU_SUPERVISOR",
] as const;

export type KgEvaluatorRole = (typeof KG_EVALUATOR_ROLES)[number];

export type KgRoleWeight = {
  roleKey: KgEvaluatorRole;
  weight: number;
};

export const KG_MEASUREMENT_WEIGHTS: Record<
  KgMeasurementSubject,
  KgRoleWeight[]
> = {
  LEARNING_GARDENS: [
    { roleKey: "KG_TEACHER", weight: 40 },
    { roleKey: "KG_VP", weight: 30 },
    { roleKey: "EDU_SUPERVISOR", weight: 30 },
  ],
  QURAN: [
    { roleKey: "KG_TEACHER", weight: 50 },
    { roleKey: "KG_VP", weight: 50 },
  ],
  COUNT_AND_CALCULATE: [
    { roleKey: "KG_TEACHER", weight: 50 },
    { roleKey: "KG_VP", weight: 50 },
  ],
};

export type KgRoleComponentInput = {
  expectedMeasurementCount: number;
  measurementPercentages: Array<number | null>;
};

export type KgRoleComponent = {
  roleKey: KgEvaluatorRole;
  weight: number;
  expectedMeasurementCount: number;
  completedMeasurementCount: number;
  currentPercentage: number | null;
  isComplete: boolean;
};

export type KgWeightedMeasurementSummary = {
  roles: KgRoleComponent[];
  finalPercentage: number | null;
  provisionalPercentage: number | null;
  isComplete: boolean;
  missingConfiguredRoles: KgEvaluatorRole[];
};

function isFinitePercentage(value: number | null): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function assertWeightsTotal(subjectKey: KgMeasurementSubject) {
  const total = KG_MEASUREMENT_WEIGHTS[subjectKey].reduce(
    (sum, role) => sum + role.weight,
    0,
  );

  if (total !== 100) {
    throw new Error(`KG measurement weights for ${subjectKey} must total 100.`);
  }
}

export function isKgMeasurementSubject(
  value: string,
): value is KgMeasurementSubject {
  return KG_MEASUREMENT_SUBJECTS.includes(value as KgMeasurementSubject);
}

export function getKgSubjectLabel(subjectKey: KgMeasurementSubject) {
  switch (subjectKey) {
    case "LEARNING_GARDENS":
      return "بساتين المعرفة";
    case "QURAN":
      return "القرآن الكريم";
    case "COUNT_AND_CALCULATE":
      return "نعد ونحسب";
  }
}

export function getKgEvaluatorRoleLabel(roleKey: KgEvaluatorRole) {
  switch (roleKey) {
    case "KG_TEACHER":
      return "المعلمة";
    case "KG_VP":
      return "الوكيلة";
    case "EDU_SUPERVISOR":
      return "المشرفة";
  }
}

export function calculateKgWeightedMeasurementSummary(params: {
  subjectKey: KgMeasurementSubject;
  roleInputs: Partial<Record<KgEvaluatorRole, KgRoleComponentInput>>;
}): KgWeightedMeasurementSummary {
  assertWeightsTotal(params.subjectKey);

  const roles = KG_MEASUREMENT_WEIGHTS[params.subjectKey].map((config) => {
    const input = params.roleInputs[config.roleKey] ?? {
      expectedMeasurementCount: 0,
      measurementPercentages: [],
    };
    const completedPercentages = input.measurementPercentages.filter(
      isFinitePercentage,
    );
    const completedMeasurementCount = completedPercentages.length;

    return {
      roleKey: config.roleKey,
      weight: config.weight,
      expectedMeasurementCount: input.expectedMeasurementCount,
      completedMeasurementCount,
      currentPercentage:
        completedMeasurementCount > 0
          ? completedPercentages.reduce((sum, value) => sum + value, 0) /
            completedMeasurementCount
          : null,
      isComplete:
        input.expectedMeasurementCount > 0 &&
        completedMeasurementCount === input.expectedMeasurementCount,
    };
  });

  const missingConfiguredRoles = roles
    .filter((role) => role.expectedMeasurementCount === 0)
    .map((role) => role.roleKey);
  const isComplete = roles.every((role) => role.isComplete);
  const finalPercentage = isComplete
    ? roles.reduce(
        (sum, role) => sum + (role.currentPercentage ?? 0) * (role.weight / 100),
        0,
      )
    : null;
  const availableRoles = roles.filter(
    (role) => role.currentPercentage !== null,
  );
  const availableWeight = availableRoles.reduce(
    (sum, role) => sum + role.weight,
    0,
  );
  const provisionalPercentage =
    availableWeight > 0
      ? availableRoles.reduce(
          (sum, role) =>
            sum + (role.currentPercentage ?? 0) * role.weight,
          0,
        ) / availableWeight
      : null;

  return {
    roles,
    finalPercentage,
    provisionalPercentage,
    isComplete,
    missingConfiguredRoles,
  };
}
