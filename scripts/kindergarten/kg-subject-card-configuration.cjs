"use strict";

/*
 * Shared KG subject-card configuration.
 *
 * The staff card deliberately hides NOTES, CURRICULUM_PLAN, and RESOURCES.
 * Keeping the same complete module set as primary subjects therefore exposes
 * exactly these seven operations on KG cards:
 * measurement, learning loss, lesson prep, question bank, homework, and
 * gamification, and virtual classes.
 */

const KG_SUBJECT_CARD_MODULE_KEYS = Object.freeze([
  "ASSESSMENTS",
  "LEARNING_LOSS",
  "HOMEWORK",
  "LESSON_PREP",
  "QUESTION_BANK",
  "CURRICULUM_PLAN",
  "RESOURCES",
  "GAMIFICATION",
  "VIRTUAL_CLASSES",
  "NOTES",
]);

function value(value, fallback) {
  return value === undefined || value === null ? fallback : value;
}

function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function buildKgSubjectCardConfiguration(offering = {}) {
  const existingAssessmentPolicy = offering.assessmentPolicy && typeof offering.assessmentPolicy === "object"
    ? offering.assessmentPolicy
    : {};
  const existingCurriculumPolicy = offering.curriculumPolicy && typeof offering.curriculumPolicy === "object"
    ? offering.curriculumPolicy
    : {};

  const curriculumPlanId = String(value(existingCurriculumPolicy.curriculumPlanId, offering.curriculumPlanId || ""));
  const questionBankId = String(value(existingCurriculumPolicy.questionBankId, offering.questionBankId || ""));
  const resourceFolderId = String(value(existingCurriculumPolicy.resourceFolderId, offering.resourceFolderId || ""));

  return {
    enabledModuleKeys: [...KG_SUBJECT_CARD_MODULE_KEYS],
    assessmentPolicy: {
      ...existingAssessmentPolicy,
      assessmentTemplateIds: Array.isArray(existingAssessmentPolicy.assessmentTemplateIds)
        ? existingAssessmentPolicy.assessmentTemplateIds
        : [],
      trackerTemplateIds: Array.isArray(existingAssessmentPolicy.trackerTemplateIds)
        ? existingAssessmentPolicy.trackerTemplateIds
        : [],
      allowedAssessmentSlotKeys: Array.isArray(existingAssessmentPolicy.allowedAssessmentSlotKeys)
        ? existingAssessmentPolicy.allowedAssessmentSlotKeys
        : [],
      allowLearningLoss: true,
      requiresReview: value(existingAssessmentPolicy.requiresReview, false),
      note: String(value(existingAssessmentPolicy.note, "")),
    },
    curriculumPolicy: {
      ...existingCurriculumPolicy,
      curriculumPlanId,
      questionBankId,
      resourceFolderId,
      lessonPrepRequired: true,
      homeworkEnabled: true,
      resourcesEnabled: true,
      questionBankEnabled: true,
      lessonPrepReviewMode: String(value(existingCurriculumPolicy.lessonPrepReviewMode, "APPROVAL_REQUIRED")),
      note: String(value(existingCurriculumPolicy.note, "")),
    },
    curriculumPlanId,
    questionBankId,
    resourceFolderId,
  };
}

function hasKgSubjectCardConfiguration(offering = {}) {
  const expected = buildKgSubjectCardConfiguration(offering);
  return stable(offering.enabledModuleKeys || []) === stable(expected.enabledModuleKeys) &&
    stable(offering.assessmentPolicy || {}) === stable(expected.assessmentPolicy) &&
    stable(offering.curriculumPolicy || {}) === stable(expected.curriculumPolicy) &&
    String(offering.curriculumPlanId || "") === expected.curriculumPlanId &&
    String(offering.questionBankId || "") === expected.questionBankId &&
    String(offering.resourceFolderId || "") === expected.resourceFolderId;
}

module.exports = {
  KG_SUBJECT_CARD_MODULE_KEYS,
  buildKgSubjectCardConfiguration,
  hasKgSubjectCardConfiguration,
};
