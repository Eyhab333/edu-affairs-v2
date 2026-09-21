/*
 * Read-only inspection for KG Quran and Count and Calculate templates.
 *
 * Usage:
 *   node scripts/kindergarten/inspect-kg-quran-count-trackers.cjs
 *
 * This script never writes to Firestore. It reads template collections and
 * narrowly queries measurement batches only by discovered template IDs.
 */

"use strict";

const admin = require("firebase-admin");
const fs = require("node:fs");
const path = require("node:path");

const ORG_ID = "takween";
const SCHOOL_TYPE = "KG";
const TARGET_GRADES = ["kg1", "kg2", "kg3"];
const TARGET_SUBJECTS = ["QURAN", "COUNT_AND_CALCULATE"];
const TEMPLATE_COLLECTIONS = [
  { name: "studentAssessmentTemplates", templateType: "ASSESSMENT" },
  { name: "studentTrackerTemplates", templateType: "TRACKER" },
];
const REPORT_PATH = path.resolve(
  process.cwd(),
  "scripts",
  "kindergarten",
  "inspect-kg-quran-count-trackers-report.json",
);

if (process.argv.length > 2) {
  throw new Error(
    "This inspection is read-only and accepts no options. There is no --apply mode.",
  );
}

function initAdmin() {
  if (admin.apps.length > 0) return;

  const serviceAccountPath = path.resolve(
    process.env.SERVICE_ACCOUNT_PATH ||
      path.join(process.cwd(), "service-account.json"),
  );
  const serviceAccount = require(serviceAccountPath);

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    projectId: serviceAccount.project_id,
  });
}

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeKey(value) {
  return text(value).replace(/[\s-]+/g, "_").toUpperCase();
}

function normalizeTitle(value) {
  return text(value).replace(/\s+/g, " ").toLowerCase();
}

function toPlain(value) {
  if (value === undefined) return undefined;
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(toPlain);
  if (typeof value.toDate === "function") return value.toDate().toISOString();

  return Object.fromEntries(
    Object.entries(value)
      .map(([key, entryValue]) => [key, toPlain(entryValue)])
      .filter(([, entryValue]) => entryValue !== undefined),
  );
}

function dataOf(snapshot) {
  return {
    id: snapshot.id,
    path: snapshot.ref.path,
    ...(snapshot.data() || {}),
  };
}

function targetSubjectFor(data) {
  const subjectKey = normalizeKey(data.subjectKey);
  const subjectId = normalizeKey(data.subjectId);
  const titleFields = [data.subjectTitle, data.title]
    .map(normalizeTitle)
    .join(" ");
  const code = normalizeKey(data.code || data.templateCode);

  if (
    ["QURAN", "KG_QURAN"].includes(subjectKey) ||
    ["QURAN", "KG_QURAN"].includes(subjectId) ||
    code.includes("QURAN") ||
    titleFields.includes("القرآن") ||
    titleFields.includes("القران")
  ) {
    return "QURAN";
  }

  if (
    ["COUNT_AND_CALCULATE", "NUMBERS", "KG_NUMBERS", "COUNT_CALCULATE"].includes(subjectKey) ||
    ["COUNT_AND_CALCULATE", "NUMBERS", "KG_NUMBERS", "COUNT_CALCULATE"].includes(subjectId) ||
    code.includes("COUNT_AND_CALCULATE") ||
    code.includes("NUMBERS") ||
    titleFields.includes("نعد ونحسب") ||
    titleFields.includes("الأرقام") ||
    titleFields.includes("الارقام")
  ) {
    return "COUNT_AND_CALCULATE";
  }

  return "";
}

function isEffectiveActive(data) {
  const status = normalizeKey(data.status);
  const inactiveStatuses = new Set([
    "INACTIVE",
    "ARCHIVED",
    "DEPRECATED",
    "DISABLED",
    "ENDED",
    "CLOSED",
  ]);

  return data.isActive === true && !inactiveStatuses.has(status);
}

function isDeprecated(data) {
  const status = normalizeKey(data.status);
  const searchable = [
    data.code,
    data.templateCode,
    data.title,
    data.kind,
    data.templateKind,
  ]
    .map((value) => text(value).toLowerCase())
    .join(" ");

  return (
    data.isActive === false ||
    data.isArchived === true ||
    ["INACTIVE", "ARCHIVED", "DEPRECATED", "ENDED", "DISABLED"].includes(status) ||
    /\blegacy\b|\bold\b|\bdeprecated\b/.test(searchable)
  );
}

function pickMatchingFields(data, pattern) {
  return Object.fromEntries(
    Object.entries(data)
      .filter(([key]) => pattern.test(key))
      .map(([key, value]) => [key, toPlain(value)]),
  );
}

function getTemplateItems(data) {
  return (Array.isArray(data.templateItems) ? data.templateItems : [])
    .map((item, index) => ({ item: item || {}, index }))
    .sort((left, right) => {
      const leftOrder = typeof left.item.order === "number" ? left.item.order : 0;
      const rightOrder = typeof right.item.order === "number" ? right.item.order : 0;
      return leftOrder - rightOrder || left.index - right.index;
    })
    .map(({ item }) => ({
      order: typeof item.order === "number" ? item.order : 0,
      itemKey: text(item.itemKey),
      itemId: text(item.itemId),
      itemTitle: text(item.itemTitle || item.title),
      title: text(item.title),
      category: text(item.category),
      valueType: text(item.valueType),
      maxScore: typeof item.maxScore === "number" ? item.maxScore : null,
      weight: typeof item.weight === "number" ? item.weight : null,
      affectsTotal: typeof item.affectsTotal === "boolean" ? item.affectsTotal : null,
    }));
}

function createTemplateRecord(data, source) {
  const templateItems = getTemplateItems(data);
  const hasCompleteItemScores =
    templateItems.length > 0 &&
    templateItems.every((item) => typeof item.maxScore === "number");
  const itemMaxScoreSum = hasCompleteItemScores
    ? templateItems.reduce((sum, item) => sum + item.maxScore, 0)
    : null;

  return {
    firestorePath: data.path,
    templateCollection: source.name,
    templateType: text(data.templateKind) || source.templateType,
    targetSubjectKey: targetSubjectFor(data),
    id: data.id,
    code: text(data.code || data.templateCode),
    title: text(data.title),
    kind: text(data.kind),
    orgId: text(data.orgId),
    schoolType: text(data.schoolType),
    schoolId: text(data.schoolId),
    academicYearId: text(data.academicYearId),
    gradeId: text(data.gradeId),
    subjectKey: text(data.subjectKey),
    subjectId: text(data.subjectId),
    subjectTitle: text(data.subjectTitle),
    status: text(data.status),
    isActive: data.isActive === true,
    effectiveActive: isEffectiveActive(data),
    order: typeof data.order === "number" ? data.order : null,
    maxScore: typeof data.maxScore === "number" ? data.maxScore : null,
    itemMaxScore: typeof data.itemMaxScore === "number" ? data.itemMaxScore : null,
    itemMaxScoreSum,
    evaluatorRoleKey: text(data.evaluatorRoleKey),
    isContinuous: typeof data.isContinuous === "boolean" ? data.isContinuous : null,
    defaultLessonTitle: text(data.defaultLessonTitle),
    requiresLearningLossFollowUp: data.requiresLearningLossFollowUp === true,
    learningLossThresholdPercentage:
      typeof data.learningLossThresholdPercentage === "number"
        ? data.learningLossThresholdPercentage
        : null,
    learningLossThresholdFields: pickMatchingFields(data, /learningLoss|threshold/i),
    assessmentSlot: text(data.assessmentSlot),
    measurementFields: {
      assessmentKind: text(data.assessmentKind),
      assessmentType: text(data.assessmentType),
      measurementType: text(data.measurementType),
      measurementKind: text(data.measurementKind),
      trackerKind: text(data.trackerKind),
      scoreType: text(data.scoreType),
    },
    templateItemsCount: templateItems.length,
    templateItems,
    deprecated: isDeprecated(data),
  };
}

function addWarning(warnings, type, message, templates) {
  warnings.push({
    type,
    message,
    templates: templates.map((template) => ({
      id: template.id,
      code: template.code,
      title: template.title,
      firestorePath: template.firestorePath,
    })),
  });
}

function chunk(values, size) {
  const chunks = [];
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }
  return chunks;
}

async function loadUsage(db, templateIds) {
  const uniqueIds = Array.from(new Set(templateIds.filter(Boolean)));
  const referencesByTemplateId = Object.fromEntries(
    uniqueIds.map((templateId) => [templateId, []]),
  );

  if (uniqueIds.length === 0) {
    return {
      available: true,
      collection: "studentMeasurementBatches",
      queriedTemplateIds: [],
      countsByTemplateId: {},
      referencesByTemplateId,
    };
  }

  try {
    const batchesRef = db.collection(`orgs/${ORG_ID}/studentMeasurementBatches`);
    for (const ids of chunk(uniqueIds, 30)) {
      const snapshot = await batchesRef.where("templateId", "in", ids).get();
      snapshot.docs.forEach((document) => {
        const data = document.data() || {};
        const templateId = text(data.templateId);
        if (!referencesByTemplateId[templateId]) return;

        referencesByTemplateId[templateId].push({
          id: document.id,
          firestorePath: document.ref.path,
          status: text(data.status),
          batchKind: text(data.batchKind),
          schoolId: text(data.schoolId),
          academicYearId: text(data.academicYearId),
          gradeId: text(data.gradeId),
          classId: text(data.classId),
          subjectKey: text(data.subjectKey),
        });
      });
    }

    return {
      available: true,
      collection: "studentMeasurementBatches",
      queriedTemplateIds: uniqueIds,
      countsByTemplateId: Object.fromEntries(
        Object.entries(referencesByTemplateId).map(([templateId, entries]) => [
          templateId,
          entries.length,
        ]),
      ),
      referencesByTemplateId,
    };
  } catch (error) {
    return {
      available: false,
      collection: "studentMeasurementBatches",
      queriedTemplateIds: uniqueIds,
      countsByTemplateId: {},
      referencesByTemplateId: {},
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function summaryFor(templates) {
  return {
    totalMatchingTemplates: templates.length,
    active: templates.filter((template) => template.effectiveActive).length,
    inactive: templates.filter((template) => !template.effectiveActive).length,
    assessmentTemplatesCount: templates.filter((template) => template.templateType === "ASSESSMENT").length,
    trackerTemplatesCount: templates.filter((template) => template.templateType === "TRACKER").length,
    ids: templates.map((template) => template.id),
    titles: templates.map((template) => template.title),
    kinds: templates.map((template) => template.kind),
    maxScore: templates.map((template) => template.maxScore),
    templateItemsCount: templates.map((template) => template.templateItemsCount),
    academicYearId: templates.map((template) => template.academicYearId),
    schoolId: templates.map((template) => template.schoolId),
    templates: templates.map((template) => ({
      id: template.id,
      title: template.title,
      kind: template.kind,
      templateType: template.templateType,
      maxScore: template.maxScore,
      templateItemsCount: template.templateItemsCount,
      academicYearId: template.academicYearId,
      schoolId: template.schoolId,
      firestorePath: template.firestorePath,
    })),
  };
}

function createSummaryBySubjectAndGrade(templates) {
  return Object.fromEntries(
    TARGET_SUBJECTS.map((subjectKey) => [
      subjectKey,
      Object.fromEntries(
        TARGET_GRADES.map((gradeId) => [
          gradeId,
          summaryFor(
            templates.filter(
              (template) =>
                template.targetSubjectKey === subjectKey &&
                template.gradeId.toLowerCase() === gradeId,
            ),
          ),
        ]),
      ),
    ]),
  );
}

function findWarnings(templates, usage) {
  const warnings = [];
  const byId = new Map();
  const byCode = new Map();
  const byKind = new Map();
  const activeTrackersBySubjectGrade = new Map();

  for (const template of templates) {
    const addTo = (map, key) => {
      const entries = map.get(key) || [];
      entries.push(template);
      map.set(key, entries);
    };

    addTo(byId, template.id);
    if (template.code) addTo(byCode, template.code);

    const scope = [
      template.targetSubjectKey,
      template.gradeId.toLowerCase() || "(missing)",
      template.templateType,
      normalizeKey(template.kind) || "(missing)",
    ].join("|");
    addTo(byKind, scope);

    if (template.templateType === "TRACKER" && template.effectiveActive) {
      addTo(
        activeTrackersBySubjectGrade,
        `${template.targetSubjectKey}|${template.gradeId.toLowerCase() || "(missing)"}`,
      );
    }

    if (!template.schoolId) {
      addWarning(warnings, "GENERIC_SCHOOL_TEMPLATE", "Template uses generic schoolId \"\".", [template]);
    } else {
      addWarning(warnings, "SCHOOL_SPECIFIC_TEMPLATE", `Template is limited to schoolId \"${template.schoolId}\".`, [template]);
    }

    if (!template.academicYearId) {
      addWarning(warnings, "GENERIC_ACADEMIC_YEAR_TEMPLATE", "Template has academicYearId \"\".", [template]);
    } else {
      addWarning(warnings, "ACADEMIC_YEAR_SPECIFIC_TEMPLATE", `Template is limited to academicYearId \"${template.academicYearId}\".`, [template]);
    }

    if (!template.gradeId) {
      addWarning(warnings, "MISSING_GRADE_ID", "Template is missing gradeId.", [template]);
    } else if (!TARGET_GRADES.includes(template.gradeId.toLowerCase())) {
      addWarning(warnings, "UNEXPECTED_GRADE_ID", `Expected kg1, kg2, or kg3 but found \"${template.gradeId}\".`, [template]);
    }

    const exactSubjectKey = normalizeKey(template.subjectKey);
    if (!TARGET_SUBJECTS.includes(exactSubjectKey)) {
      addWarning(
        warnings,
        "LEGACY_OR_UNEXPECTED_SUBJECT_KEY",
        `Stored subjectKey \"${template.subjectKey || "(missing)"}\" is matched as ${template.targetSubjectKey}.`,
        [template],
      );
    }

    if (
      typeof template.maxScore === "number" &&
      typeof template.itemMaxScoreSum === "number" &&
      Math.abs(template.maxScore - template.itemMaxScoreSum) > 0.000001
    ) {
      addWarning(
        warnings,
        "MAX_SCORE_MISMATCH",
        `maxScore (${template.maxScore}) differs from the sum of item max scores (${template.itemMaxScoreSum}).`,
        [template],
      );
    }

    const visibleTitles = new Map();
    const itemKeys = new Map();
    const itemIds = new Map();
    for (const item of template.templateItems) {
      const visibleTitle = normalizeTitle(item.itemTitle || item.title);
      if (visibleTitle) {
        const entries = visibleTitles.get(visibleTitle) || [];
        entries.push(item);
        visibleTitles.set(visibleTitle, entries);
      }
      if (item.itemKey) {
        const entries = itemKeys.get(item.itemKey) || [];
        entries.push(item);
        itemKeys.set(item.itemKey, entries);
      }
      if (item.itemId) {
        const entries = itemIds.get(item.itemId) || [];
        entries.push(item);
        itemIds.set(item.itemId, entries);
      }
    }
    for (const [title, items] of visibleTitles) {
      if (items.length > 1) addWarning(warnings, "DUPLICATE_VISIBLE_ITEM_TITLE", `Duplicate visible item title \"${title}\".`, [template]);
    }
    for (const [itemKey, items] of itemKeys) {
      if (items.length > 1) addWarning(warnings, "DUPLICATE_ITEM_KEY", `Duplicate itemKey \"${itemKey}\".`, [template]);
    }
    for (const [itemId, items] of itemIds) {
      if (items.length > 1) addWarning(warnings, "DUPLICATE_ITEM_ID", `Duplicate itemId \"${itemId}\".`, [template]);
    }

    if (template.deprecated) {
      addWarning(warnings, "INACTIVE_OR_DEPRECATED_TEMPLATE", "Template appears inactive, archived, ended, disabled, or deprecated.", [template]);
    }

    if ((usage.countsByTemplateId[template.id] || 0) > 0) {
      addWarning(warnings, "TEMPLATE_ALREADY_USED", `Template is referenced by ${usage.countsByTemplateId[template.id]} studentMeasurementBatches.`, [template]);
    }
  }

  for (const [id, entries] of byId) {
    if (entries.length > 1) addWarning(warnings, "DUPLICATE_TEMPLATE_ID", `Template ID \"${id}\" appears ${entries.length} times across inspected collections.`, entries);
  }
  for (const [code, entries] of byCode) {
    if (entries.length > 1) addWarning(warnings, "DUPLICATE_TEMPLATE_CODE", `Template code \"${code}\" appears ${entries.length} times.`, entries);
  }
  for (const [scope, entries] of byKind) {
    if (entries.length > 1) addWarning(warnings, "MULTIPLE_TEMPLATES_SAME_KIND", `Multiple templates share subject/grade/type/kind: ${scope}.`, entries);
  }
  for (const [scope, entries] of activeTrackersBySubjectGrade) {
    if (entries.length > 1) addWarning(warnings, "MULTIPLE_ACTIVE_TRACKERS_FOR_SUBJECT_GRADE", `Multiple active trackers match ${scope}.`, entries);
  }

  return warnings;
}

function printReport(report) {
  console.log("\nKG Quran and Count and Calculate template inspection");
  console.log("=".repeat(58));
  console.log(`Matching templates: ${report.templates.length}`);

  for (const subjectKey of TARGET_SUBJECTS) {
    console.log(`\n${subjectKey}:`);
    for (const gradeId of TARGET_GRADES) {
      const summary = report.summaryBySubjectAndGrade[subjectKey][gradeId];
      console.log(`  ${gradeId}: ${summary.totalMatchingTemplates} total (${summary.trackerTemplatesCount} trackers)`);
      for (const template of summary.templates.filter((item) => item.templateType === "TRACKER")) {
        console.log(`    - ${template.id} | ${template.title || "(untitled)"} | ${template.kind || "(missing kind)"}`);
      }
    }
  }

  console.log(`\nWarnings: ${report.warnings.length}`);
  for (const warning of report.warnings) {
    console.log(`  - [${warning.type}] ${warning.message}`);
  }

  if (report.usage.available) {
    const references = Object.values(report.usage.countsByTemplateId).reduce((sum, count) => sum + count, 0);
    console.log(`\nTargeted measurement-batch references: ${references}`);
  } else {
    console.log(`\nBatch usage unavailable: ${report.usage.error}`);
  }
  console.log(`JSON report: ${REPORT_PATH}`);
}

async function main() {
  initAdmin();
  const db = admin.firestore();
  const snapshots = await Promise.all(
    TEMPLATE_COLLECTIONS.map(async (source) => ({
      source,
      snapshot: await db.collection(`orgs/${ORG_ID}/${source.name}`).get(),
    })),
  );

  const templates = snapshots
    .flatMap(({ source, snapshot }) =>
      snapshot.docs
        .map(dataOf)
        .filter((data) =>
          text(data.orgId) === ORG_ID &&
          normalizeKey(data.schoolType) === SCHOOL_TYPE &&
          Boolean(targetSubjectFor(data)),
        )
        .map((data) => createTemplateRecord(data, source)),
    )
    .sort((left, right) =>
      left.targetSubjectKey.localeCompare(right.targetSubjectKey, "en") ||
      left.gradeId.localeCompare(right.gradeId, "en") ||
      (left.order ?? 0) - (right.order ?? 0) ||
      left.firestorePath.localeCompare(right.firestorePath, "en"),
    );

  const usage = await loadUsage(db, templates.map((template) => template.id));
  templates.forEach((template) => {
    template.usageCount = usage.countsByTemplateId[template.id] ?? null;
  });

  const report = {
    metadata: {
      generatedAt: new Date().toISOString(),
      orgId: ORG_ID,
      schoolType: SCHOOL_TYPE,
      targetSubjects: TARGET_SUBJECTS,
      targetGrades: TARGET_GRADES,
      readOnly: true,
      collectionsInspected: [
        ...TEMPLATE_COLLECTIONS.map((source) => source.name),
        "studentMeasurementBatches (targeted templateId lookups only)",
      ],
    },
    templates,
    summaryBySubjectAndGrade: createSummaryBySubjectAndGrade(templates),
    warnings: findWarnings(templates, usage),
    usage,
  };

  fs.writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  printReport(report);
}

main().catch((error) => {
  console.error("Inspection failed. No Firestore writes were attempted.");
  console.error(error);
  process.exitCode = 1;
});
