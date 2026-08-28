import type { PersonSupervisionScope } from "@takween/contracts";
import {
  getPersonSupervisionSchoolIds,
  getPersonSupervisionSubjectScope,
  hasPersonSupervisionSubjectAccess,
} from "@takween/domain";

const KINDERGARTEN_REVIEWER_IDS = new Set([
  "p-t-altwala",
  "p-malrameh",
  "p-f-alhamaad",
  "p-a-almansur",
]);

const KINDERGARTEN_SCHOOL_IDS = [
  "kg-01",
  "kg-02",
  "kg-03",
  "kg-04",
] as const;
const KINDERGARTEN_SCHOOL_ID_SET = new Set<string>(KINDERGARTEN_SCHOOL_IDS);

export function getLessonPrepReviewSchoolIds(
  params: {
    orgId?: string | null;
    personId?: string | null;
    scopes?: readonly PersonSupervisionScope[];
  },
): readonly string[] {
  const personId = String(params.personId || "").trim();
  const orgId = String(params.orgId || "").trim();
  const kindergartenSchoolIds = KINDERGARTEN_REVIEWER_IDS.has(personId)
    ? [...KINDERGARTEN_SCHOOL_IDS]
    : [];
  const scopedSchoolIds = orgId
    ? getPersonSupervisionSchoolIds({
        scopes: params.scopes ?? [],
        orgId,
        personId,
        capability: "LESSON_PREP_REVIEW",
      })
    : [];

  return Array.from(new Set([...kindergartenSchoolIds, ...scopedSchoolIds]));
}

export function getLessonPrepReviewQueryScopes(params: {
  orgId?: string | null;
  personId?: string | null;
  scopes?: readonly PersonSupervisionScope[];
}) {
  const personId = String(params.personId || "").trim();
  const orgId = String(params.orgId || "").trim();
  const queryScopes = new Map<string, { schoolId: string; subjectKey?: string }>();

  if (KINDERGARTEN_REVIEWER_IDS.has(personId)) {
    for (const schoolId of KINDERGARTEN_SCHOOL_IDS) {
      queryScopes.set(schoolId, { schoolId });
    }
  }

  for (const schoolId of getLessonPrepReviewSchoolIds(params)) {
    if (!orgId || KINDERGARTEN_SCHOOL_ID_SET.has(schoolId)) continue;
    const subjectScope = getPersonSupervisionSubjectScope({
      scopes: params.scopes ?? [],
      request: {
        orgId,
        personId,
        capability: "LESSON_PREP_REVIEW",
        schoolId,
      },
    });

    if (subjectScope.allSubjects) {
      queryScopes.set(schoolId, { schoolId });
      continue;
    }

    for (const subjectKey of subjectScope.subjectKeys) {
      queryScopes.set(`${schoolId}:${subjectKey}`, { schoolId, subjectKey });
    }
  }

  return [...queryScopes.values()];
}

export function canReviewLessonPrepAtSchool(params: {
  orgId?: string | null;
  personId?: string | null;
  schoolId?: string | null;
  subjectKey?: string | null;
  scopes?: readonly PersonSupervisionScope[];
}) {
  const personId = String(params.personId || "").trim();
  const schoolId = String(params.schoolId || "").trim();
  const subjectKey = String(params.subjectKey || "").trim();
  const orgId = String(params.orgId || "").trim();

  return (
    (KINDERGARTEN_REVIEWER_IDS.has(personId) &&
      KINDERGARTEN_SCHOOL_ID_SET.has(schoolId)) ||
    (!!orgId &&
      !!subjectKey &&
      hasPersonSupervisionSubjectAccess({
        scopes: params.scopes ?? [],
        request: {
          orgId,
          personId,
          capability: "LESSON_PREP_REVIEW",
          schoolId,
          subjectKey,
        },
      }))
  );
}
