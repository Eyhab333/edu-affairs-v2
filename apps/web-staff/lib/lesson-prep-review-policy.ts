const TAKWEEN_REVIEWER_IDS = new Set([
  "p-s-sayed",
  "p-n-alshaya",
  "staff-NOFByrx0XLVovqxuFjfwRWSokgs1",
]);

const KINDERGARTEN_REVIEWER_IDS = new Set([
  "p-t-altwala",
  "p-malrameh",
  "p-f-alhamaad",
  "p-a-almansur",
]);

const TAKWEEN_SCHOOL_IDS = [
  "mrb-boys-sayh",
  "mrb-boys-faleh",
  "mrb-girls",
] as const;

const KINDERGARTEN_SCHOOL_IDS = [
  "kg-01",
  "kg-02",
  "kg-03",
  "kg-04",
] as const;

export function getLessonPrepReviewSchoolIds(
  personId?: string | null,
): readonly string[] {
  const normalizedPersonId = String(personId || "").trim();

  if (TAKWEEN_REVIEWER_IDS.has(normalizedPersonId)) {
    return [...TAKWEEN_SCHOOL_IDS];
  }

  if (KINDERGARTEN_REVIEWER_IDS.has(normalizedPersonId)) {
    return [...KINDERGARTEN_SCHOOL_IDS];
  }

  return [];
}

export function canReviewLessonPrepAtSchool(params: {
  personId?: string | null;
  schoolId?: string | null;
}) {
  const schoolId = String(params.schoolId || "").trim();

  return getLessonPrepReviewSchoolIds(params.personId).includes(schoolId);
}
