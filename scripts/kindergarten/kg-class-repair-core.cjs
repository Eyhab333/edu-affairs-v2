"use strict";

const admin = require("firebase-admin");
const fs = require("node:fs");
const path = require("node:path");

const ORG_ID = "takween";
const ACADEMIC_YEAR_ID = "ay-1448";
const APPLY_TOKEN = "APPLY_KG_CLASS_REPAIR";
const SOURCE = "KG_CLASS_REPAIR";
const VERSION = 1;

const DESIRED_CLASSES = Object.freeze({
  "kg-01": [
    ["kg1-a", "kg1", "فصل النجوم"],
    ["kg2-a", "kg2", "فصل الغيوم"],
    ["kg2-b", "kg2", "فصل الخزامى"],
    ["kg3-a", "kg3", "فصل الكادي"],
    ["kg3-b", "kg3", "فصل الأرجوان"],
    ["kg3-c", "kg3", "فصل الياسمين"],
    ["kg3-d", "kg3", "فصل الإكليل"],
    ["kg3-e", "kg3", "فصل اللافندر"],
    ["kg3-f", "kg3", "فصل السوسن"],
    ["kg3-g", "kg3", "فصل الزهور"],
  ],
  "kg-02": [
    ["kg1-a", "kg1", "فصل الكادي"],
    ["kg2-a", "kg2", "فصل الورود"],
    ["kg2-b", "kg2", "فصل الأوركيد"],
    ["kg3-a", "kg3", "فصل الفل"],
    ["kg3-b", "kg3", "فصل التوليب"],
    ["kg3-c", "kg3", "فصل البيلسان"],
    ["kg3-d", "kg3", "فصل الإكليل"],
    ["kg3-e", "kg3", "فصل الياسمين"],
    ["kg3-f", "kg3", "فصل النرجس"],
  ],
  "kg-03": [
    ["kg1-a", "kg1", "فصل المرح"],
    ["kg2-a", "kg2", "فصل الفل"],
    ["kg2-b", "kg2", "فصل التوليب"],
    ["kg3-a", "kg3", "فصل السحاب"],
    ["kg3-b", "kg3", "فصل المروج"],
    ["kg3-c", "kg3", "فصل الغيوم"],
    ["kg3-d", "kg3", "فصل النجوم"],
    ["kg3-e", "kg3", "فصل الأصحاب"],
  ],
  "kg-04": [
    ["kg1-a", "kg1", "فصل الوهج"],
    ["kg2-a", "kg2", "فصل الألوان"],
    ["kg2-b", "kg2", "فصل الغيوم"],
    ["kg3-a", "kg3", "فصل الفرح"],
    ["kg3-b", "kg3", "فصل النجوم"],
    ["kg3-c", "kg3", "فصل البالونات"],
    ["kg3-d", "kg3", "فصل المرح"],
  ],
});

const SCHOOL_IDS = Object.freeze(Object.keys(DESIRED_CLASSES));
const REPORT_PATH = path.resolve(
  process.env.KG_CLASS_REPAIR_REPORT ||
    path.join(process.cwd(), "scripts", "kindergarten", "kg-class-repair-report.json"),
);

function text(value) {
  return typeof value === "string" ? value.trim() : value == null ? "" : String(value).trim();
}

function upper(value) {
  return text(value).toUpperCase();
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function dataOf(snapshot) {
  const raw = snapshot.data() || {};
  return { docId: snapshot.id, path: snapshot.ref.path, raw, ...raw };
}

function isActiveClass(item) {
  return item.isArchived !== true;
}

function isActiveOffering(item) {
  return upper(item.status) === "ACTIVE" && item.isArchived !== true && item.isActive !== false;
}

function classKey(schoolId, classId) {
  return `${schoolId}|${classId}`;
}

function gradeKey(schoolId, gradeId) {
  return `${schoolId}|${gradeId}`;
}

function offeringIdentityKey(item) {
  const subjectKey = upper(item.subjectKey);
  if (subjectKey) return `KEY:${subjectKey}`;
  const subjectId = text(item.subjectId);
  return subjectId ? `ID:${subjectId}` : "";
}

function subjectSlug(item) {
  const metadata = item.metadata && typeof item.metadata === "object" ? item.metadata : {};
  const raw = text(
    item.subjectSlug ||
      item.subjectSuffix ||
      metadata.subjectSlug ||
      metadata.subjectSuffix ||
      item.subjectId ||
      item.subjectKey,
  ).replace(/^subject[-_]/i, "");
  return raw
    .toLowerCase()
    .replace(/_/g, "-")
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function expectedOfferingId(target, template) {
  const slug = subjectSlug(template);
  return slug ? `${target.schoolId}-${target.classId}-${slug}` : "";
}

function offeringTemplateFingerprint(item) {
  const fields = [
    "subjectId",
    "subjectKey",
    "subjectTitleSnapshot",
    "subjectTitle",
    "displayName",
    "shortLabel",
    "status",
    "isActive",
    "isArchived",
    "startAt",
    "endAt",
    "order",
    "offeringKind",
    "enabledModuleKeys",
    "gradingPolicy",
    "assessmentPolicy",
    "curriculumPolicy",
    "curriculumPlanId",
    "questionBankId",
    "resourceFolderId",
    "note",
  ];
  return stable(Object.fromEntries(fields.map((field) => [
    field,
    field === "isArchived" && item[field] === undefined
      ? false
      : field === "isActive" && item[field] === undefined
        ? true
        : item[field],
  ])));
}

function initAdmin() {
  if (admin.apps.length > 0) return;
  const serviceAccountPath = path.resolve(
    process.env.SERVICE_ACCOUNT_PATH || path.join(process.cwd(), "service-account.json"),
  );
  if (!fs.existsSync(serviceAccountPath)) {
    throw new Error(`Service account not found: ${serviceAccountPath}`);
  }
  const serviceAccount = require(serviceAccountPath);
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    projectId: serviceAccount.project_id,
  });
}

async function getCollection(db, collectionPath) {
  const snapshot = await db.collection(collectionPath).get();
  return snapshot.docs.map(dataOf);
}

function desiredTargets() {
  return SCHOOL_IDS.flatMap((schoolId) => DESIRED_CLASSES[schoolId].map(([classId, gradeId, title]) => ({
    schoolId,
    classId,
    gradeId,
    title,
    sectionLabel: title.replace(/^فصل\s*/, ""),
  })));
}

function classPayload(target, now) {
  const match = target.classId.match(/^kg[1-3]-([a-z])$/i);
  if (!match) return null;
  return {
    id: target.classId,
    orgId: ORG_ID,
    schoolId: target.schoolId,
    academicYearId: ACADEMIC_YEAR_ID,
    gradeId: target.gradeId,
    streamId: "",
    code: target.classId.toUpperCase(),
    title: target.title,
    sectionLabel: target.sectionLabel,
    order: match[1].toLowerCase().charCodeAt(0) - 96,
    isArchived: false,
    createdAt: now,
    updatedAt: now,
  };
}

function offeringPayload(template, target, offeringId, now) {
  const payload = clone(template.raw || template);
  delete payload.teacherAssignmentIds;
  delete payload.teacherPersonIds;
  delete payload.teacherAssignmentClassLinks;
  payload.id = offeringId;
  payload.orgId = ORG_ID;
  payload.schoolId = target.schoolId;
  payload.academicYearId = ACADEMIC_YEAR_ID;
  payload.classId = target.classId;
  payload.gradeId = target.gradeId;
  payload.status = "ACTIVE";
  payload.isActive = true;
  payload.isArchived = false;
  payload.createdAt = now;
  payload.updatedAt = now;
  payload.metadata = {
    ...(payload.metadata && typeof payload.metadata === "object" ? payload.metadata : {}),
    repairedBy: SOURCE,
    repairVersion: VERSION,
  };
  return payload;
}

function addBlocker(blockers, item) {
  const blocker = {
    schoolId: item.schoolId || "",
    gradeId: item.gradeId || "",
    classId: item.classId || "",
    subjectKey: item.subjectKey || "",
    type: item.type || "BLOCKED",
    message: item.message,
  };
  const fingerprint = stable(blocker);
  if (!blockers.some((existing) => stable(existing) === fingerprint)) blockers.push(blocker);
}

async function loadState(db) {
  const orgSnapshot = await db.doc(`orgs/${ORG_ID}`).get();
  const contexts = new Map();

  await Promise.all(SCHOOL_IDS.map(async (schoolId) => {
    const schoolRef = db.doc(`orgs/${ORG_ID}/schools/${schoolId}`);
    const yearRef = db.doc(`orgs/${ORG_ID}/schools/${schoolId}/academicYears/${ACADEMIC_YEAR_ID}`);
    const [schoolSnapshot, yearSnapshot, grades, classes] = await Promise.all([
      schoolRef.get(),
      yearRef.get(),
      getCollection(db, `orgs/${ORG_ID}/schools/${schoolId}/academicYears/${ACADEMIC_YEAR_ID}/grades`),
      getCollection(db, `orgs/${ORG_ID}/schools/${schoolId}/academicYears/${ACADEMIC_YEAR_ID}/classes`),
    ]);
    contexts.set(schoolId, {
      school: schoolSnapshot.exists ? dataOf(schoolSnapshot) : null,
      year: yearSnapshot.exists ? dataOf(yearSnapshot) : null,
      grades,
      classes,
    });
  }));

  return {
    orgExists: orgSnapshot.exists,
    contexts,
    offerings: await getCollection(db, `orgs/${ORG_ID}/classSubjectOfferings`),
  };
}

function buildClassPlan(state, now, blockers) {
  const actions = [];
  const validTargets = [];
  const targetList = desiredTargets();

  for (const target of targetList) {
    const context = state.contexts.get(target.schoolId);
    const school = context?.school;
    const schoolName = text(school?.name || school?.title || target.schoolId);
    const actionBase = {
      scope: "class",
      schoolId: target.schoolId,
      schoolName,
      gradeId: target.gradeId,
      classId: target.classId,
      title: target.title,
      path: `orgs/${ORG_ID}/schools/${target.schoolId}/academicYears/${ACADEMIC_YEAR_ID}/classes/${target.classId}`,
    };

    if (!state.orgExists) {
      addBlocker(blockers, { ...target, type: "ORG_NOT_FOUND", message: `Organization ${ORG_ID} was not found.` });
      actions.push({ ...actionBase, action: "BLOCKED", reason: "organization not found" });
      continue;
    }
    if (!school) {
      addBlocker(blockers, { ...target, type: "SCHOOL_NOT_FOUND", message: `School ${target.schoolId} was not found.` });
      actions.push({ ...actionBase, action: "BLOCKED", reason: "school not found" });
      continue;
    }
    if (text(school.orgId) !== ORG_ID || upper(school.profile?.schoolType || school.schoolType) !== "KG") {
      addBlocker(blockers, { ...target, type: "SCHOOL_SCOPE", message: "School does not validate as a KG school in the target organization." });
      actions.push({ ...actionBase, action: "BLOCKED", reason: "school scope mismatch" });
      continue;
    }
    if (!context.year || text(context.year.orgId) !== ORG_ID || text(context.year.schoolId) !== target.schoolId || text(context.year.id || context.year.docId) !== ACADEMIC_YEAR_ID) {
      addBlocker(blockers, { ...target, type: "ACADEMIC_YEAR_SCOPE", message: "Academic-year document is missing or does not match the target scope." });
      actions.push({ ...actionBase, action: "BLOCKED", reason: "academic year scope mismatch" });
      continue;
    }
    const grades = context.grades.filter((grade) => text(grade.docId) === target.gradeId);
    if (grades.length !== 1 || text(grades[0].orgId) !== ORG_ID || text(grades[0].schoolId) !== target.schoolId || text(grades[0].academicYearId) !== ACADEMIC_YEAR_ID || text(grades[0].id) !== target.gradeId || grades[0].isArchived === true) {
      addBlocker(blockers, { ...target, type: "GRADE_SCOPE", message: "Grade document is missing, duplicated, archived, or outside the target scope." });
      actions.push({ ...actionBase, action: "BLOCKED", reason: "grade scope mismatch" });
      continue;
    }

    const matches = context.classes.filter((item) => text(item.docId) === target.classId);
    if (matches.length > 1) {
      addBlocker(blockers, { ...target, type: "DUPLICATE_CLASS", message: "More than one class document matched the target class ID." });
      actions.push({ ...actionBase, action: "BLOCKED", reason: "duplicate class" });
      continue;
    }
    if (matches.length === 0) {
      const payload = classPayload(target, now);
      if (!payload) {
        addBlocker(blockers, { ...target, type: "CLASS_ID_FORMAT", message: "Target class ID cannot produce a deterministic class payload." });
        actions.push({ ...actionBase, action: "BLOCKED", reason: "invalid class ID" });
        continue;
      }
      actions.push({ ...actionBase, action: "CREATE", payload });
      validTargets.push({ ...target, schoolName, existing: null });
      continue;
    }

    const existing = matches[0];
    const identityValid = text(existing.docId) === target.classId && text(existing.id) === target.classId && text(existing.orgId) === ORG_ID && text(existing.schoolId) === target.schoolId && text(existing.academicYearId) === ACADEMIC_YEAR_ID && text(existing.gradeId) === target.gradeId;
    if (!identityValid || !isActiveClass(existing)) {
      addBlocker(blockers, { ...target, type: "CLASS_CONTEXT", message: "Existing class identity, grade, scope, or active state is ambiguous." });
      actions.push({ ...actionBase, action: "BLOCKED", reason: "existing class context is unsafe" });
      continue;
    }

    const needsUpdate = text(existing.title) !== target.title || text(existing.sectionLabel) !== target.sectionLabel;
    const patch = needsUpdate ? { title: target.title, sectionLabel: target.sectionLabel, updatedAt: now } : null;
    actions.push({ ...actionBase, action: needsUpdate ? "UPDATE" : "KEEP", payload: patch, existingTitle: text(existing.title) });
    validTargets.push({ ...target, schoolName, existing });
  }

  return { actions, validTargets };
}

function buildOfferingPlan(state, classPlan, now, blockers) {
  const actions = [];
  const allOfferings = state.offerings;
  const offeringById = new Map(allOfferings.map((item) => [text(item.docId || item.id), item]));
  const validExistingClasses = [];
  const contexts = state.contexts;

  for (const schoolId of SCHOOL_IDS) {
    const context = contexts.get(schoolId);
    for (const item of context?.classes || []) {
      if (text(item.orgId) === ORG_ID && text(item.schoolId) === schoolId && text(item.academicYearId) === ACADEMIC_YEAR_ID && text(item.docId) === text(item.id) && isActiveClass(item)) {
        validExistingClasses.push(item);
      }
    }
  }

  const scopedOfferings = allOfferings.filter((item) => SCHOOL_IDS.includes(text(item.schoolId)) && text(item.orgId) === ORG_ID && text(item.academicYearId) === ACADEMIC_YEAR_ID);
  const templates = new Map();

  for (const offering of scopedOfferings) {
    const sourceClass = validExistingClasses.find((item) => item.schoolId === offering.schoolId && item.id === offering.classId && item.gradeId === offering.gradeId);
    if (!sourceClass || !isActiveOffering(offering)) continue;
    if (text(offering.docId) !== text(offering.id)) {
      addBlocker(blockers, { schoolId: offering.schoolId, gradeId: offering.gradeId, classId: offering.classId, type: "OFFERING_DOCUMENT_ID", message: "Active KG offering document ID does not match its stored ID." });
      continue;
    }
    const identity = offeringIdentityKey(offering);
    if (!identity) {
      addBlocker(blockers, { schoolId: offering.schoolId, gradeId: offering.gradeId, classId: offering.classId, type: "OFFERING_IDENTITY", message: "Active KG offering has neither subjectKey nor subjectId." });
      continue;
    }
    const key = `${gradeKey(offering.schoolId, offering.gradeId)}|${identity}`;
    const list = templates.get(key) || [];
    list.push(offering);
    templates.set(key, list);
  }

  const templateByGrade = new Map();
  for (const [key, candidates] of templates.entries()) {
    const fingerprints = new Set(candidates.map(offeringTemplateFingerprint));
    const [schoolId, gradeId] = key.split("|");
    const identity = key.slice(`${schoolId}|${gradeId}|`.length);
    if (fingerprints.size > 1) {
      addBlocker(blockers, { schoolId, gradeId, subjectKey: identity, type: "OFFERING_TEMPLATE_AMBIGUOUS", message: "Active KG offerings for the same school, grade, and subject disagree on their model or modules." });
      continue;
    }
    const group = templateByGrade.get(gradeKey(schoolId, gradeId)) || new Map();
    group.set(identity, candidates[0]);
    templateByGrade.set(gradeKey(schoolId, gradeId), group);
  }

  const classActionByKey = new Map(classPlan.actions.map((item) => [classKey(item.schoolId, item.classId), item]));
  for (const target of classPlan.validTargets) {
    const classAction = classActionByKey.get(classKey(target.schoolId, target.classId));
    const existingTargetOfferings = scopedOfferings.filter((item) => text(item.schoolId) === target.schoolId && text(item.academicYearId) === ACADEMIC_YEAR_ID && text(item.gradeId) === target.gradeId && text(item.classId) === target.classId);
    const wrongGradeOfferings = scopedOfferings.filter((item) => text(item.schoolId) === target.schoolId && text(item.academicYearId) === ACADEMIC_YEAR_ID && text(item.classId) === target.classId && text(item.gradeId) !== target.gradeId);
    if (wrongGradeOfferings.length > 0) {
      addBlocker(blockers, { ...target, type: "OFFERING_CLASS_GRADE_MISMATCH", message: "Offerings exist for the target class ID under a different grade." });
      actions.push({ scope: "offering", schoolId: target.schoolId, schoolName: target.schoolName, gradeId: target.gradeId, classId: target.classId, subjectKey: "*", action: "BLOCKED", reason: "offering grade mismatch" });
    }
    const activeByIdentity = new Map();
    const inactiveByIdentity = new Map();

    for (const offering of existingTargetOfferings) {
      if (text(offering.docId) !== text(offering.id)) {
        addBlocker(blockers, { ...target, subjectKey: offeringIdentityKey(offering), type: "OFFERING_DOCUMENT_ID", message: "Target KG offering document ID does not match its stored ID." });
        actions.push({ scope: "offering", schoolId: target.schoolId, schoolName: target.schoolName, gradeId: target.gradeId, classId: target.classId, subjectKey: offeringIdentityKey(offering) || "*", offeringId: offering.id, action: "BLOCKED", reason: "offering document ID mismatch" });
        continue;
      }
      const identity = offeringIdentityKey(offering);
      if (!identity) continue;
      const destination = isActiveOffering(offering) ? activeByIdentity : inactiveByIdentity;
      const list = destination.get(identity) || [];
      list.push(offering);
      destination.set(identity, list);
    }

    for (const [identity, list] of activeByIdentity.entries()) {
      if (list.length > 1) {
        addBlocker(blockers, { ...target, subjectKey: identity, type: "DUPLICATE_ACTIVE_OFFERING", message: "More than one active offering matches the target class and subject." });
        actions.push({ scope: "offering", schoolId: target.schoolId, schoolName: target.schoolName, gradeId: target.gradeId, classId: target.classId, subjectKey: identity, action: "BLOCKED", reason: "duplicate active offering" });
      } else {
        actions.push({ scope: "offering", schoolId: target.schoolId, schoolName: target.schoolName, gradeId: target.gradeId, classId: target.classId, subjectKey: identity, offeringId: list[0].id, action: "KEEP" });
      }
    }

    const templateGroup = templateByGrade.get(gradeKey(target.schoolId, target.gradeId)) || new Map();
    if (templateGroup.size === 0) {
      addBlocker(blockers, { ...target, type: "OFFERING_TEMPLATE_MISSING", message: "No active same-school, same-grade KG offering exists to supply subject/module configuration." });
      actions.push({ scope: "offering", schoolId: target.schoolId, schoolName: target.schoolName, gradeId: target.gradeId, classId: target.classId, subjectKey: "*", action: "BLOCKED", reason: "no offering template" });
      continue;
    }

    for (const [identity, template] of templateGroup.entries()) {
      if (activeByIdentity.has(identity)) continue;
      const inactive = inactiveByIdentity.get(identity) || [];
      if (inactive.length > 0) {
        addBlocker(blockers, { ...target, subjectKey: identity, type: "INACTIVE_OFFERING_COLLISION", message: "An inactive or archived offering already occupies the target class and subject; repair will not revive or duplicate it." });
        actions.push({ scope: "offering", schoolId: target.schoolId, schoolName: target.schoolName, gradeId: target.gradeId, classId: target.classId, subjectKey: identity, offeringId: inactive[0].id, action: "BLOCKED", reason: "inactive offering collision" });
        continue;
      }
      const offeringId = expectedOfferingId(target, template);
      if (!offeringId) {
        addBlocker(blockers, { ...target, subjectKey: identity, type: "OFFERING_ID_FORMAT", message: "Existing offering ID does not support the deterministic KG offering ID convention." });
        actions.push({ scope: "offering", schoolId: target.schoolId, schoolName: target.schoolName, gradeId: target.gradeId, classId: target.classId, subjectKey: identity, action: "BLOCKED", reason: "offering ID convention unavailable" });
        continue;
      }
      const collision = offeringById.get(offeringId);
      if (collision) {
        addBlocker(blockers, { ...target, subjectKey: identity, type: "OFFERING_ID_COLLISION", message: `Deterministic offering ID ${offeringId} already exists outside the expected active target offering.` });
        actions.push({ scope: "offering", schoolId: target.schoolId, schoolName: target.schoolName, gradeId: target.gradeId, classId: target.classId, subjectKey: identity, offeringId, action: "BLOCKED", reason: "offering ID collision" });
        continue;
      }
      const payload = offeringPayload(template, target, offeringId, now);
      actions.push({ scope: "offering", schoolId: target.schoolId, schoolName: target.schoolName, gradeId: target.gradeId, classId: target.classId, subjectKey: identity, offeringId, action: "CREATE", payload });
    }

    if (classAction?.action === "BLOCKED") {
      addBlocker(blockers, { ...target, type: "CLASS_BLOCKED", message: "Offerings were not planned because the target class is blocked." });
    }
  }

  return actions;
}

function summarize(actions) {
  return actions.reduce((result, item) => {
    result[item.action] = (result[item.action] || 0) + 1;
    return result;
  }, {});
}

function schoolSummaries(classActions, offeringActions, blockers) {
  return SCHOOL_IDS.map((schoolId) => {
    const actions = [...classActions, ...offeringActions].filter((item) => item.schoolId === schoolId);
    const blockerCount = blockers.filter((item) => item.schoolId === schoolId).length;
    return { schoolId, schoolName: actions[0]?.schoolName || schoolId, ...summarize(actions), BLOCKED: Math.max(summarize(actions).BLOCKED || 0, blockerCount) };
  });
}

function printPlan(report) {
  console.log(`KG class repair: ${report.metadata.mode}`);
  console.log(`Target: ${ORG_ID} / ${ACADEMIC_YEAR_ID}`);
  console.log(`Firestore writes performed: ${report.metadata.firestoreWritesPerformed ? report.summary.writes : 0}`);
  for (const school of report.schoolSummaries) {
    console.log(`\n${school.schoolId} — ${school.schoolName}`);
    console.table([{ CREATE: school.CREATE || 0, UPDATE: school.UPDATE || 0, KEEP: school.KEEP || 0, BLOCKED: school.BLOCKED || 0 }]);
    console.table(report.actions.filter((item) => item.schoolId === school.schoolId).map((item) => ({
      scope: item.scope,
      gradeId: item.gradeId,
      classId: item.classId,
      subjectKey: item.subjectKey || "",
      action: item.action,
      reason: item.reason || "",
    })));
  }
  console.log("Summary:");
  console.table([report.summary]);
  if (report.blockers.length > 0) {
    console.log("BLOCKED details:");
    console.dir(report.blockers, { depth: null });
  }
}

async function commitWrites(db, writes) {
  for (let offset = 0; offset < writes.length; offset += 400) {
    const batch = db.batch();
    const chunk = writes.slice(offset, offset + 400);
    for (const write of chunk) {
      const ref = db.doc(write.path);
      if (write.operation === "CREATE") batch.create(ref, write.payload);
      else batch.set(ref, write.payload, { merge: true });
    }
    await batch.commit();
  }
}

async function runRepair({ apply = false } = {}) {
  initAdmin();
  const db = admin.firestore();
  const now = Date.now();
  const state = await loadState(db);
  const blockers = [];
  const classPlan = buildClassPlan(state, now, blockers);
  const offeringActions = buildOfferingPlan(state, classPlan, now, blockers);
  const classActions = classPlan.actions;
  const writes = [
    ...classActions.filter((item) => item.action === "CREATE" || item.action === "UPDATE").map((item) => ({ operation: item.action, path: item.path, payload: item.payload })),
    ...offeringActions.filter((item) => item.action === "CREATE").map((item) => ({ operation: "CREATE", path: `orgs/${ORG_ID}/classSubjectOfferings/${item.offeringId}`, payload: item.payload })),
  ];

  const report = {
    metadata: {
      generatedAt: new Date().toISOString(),
      mode: apply ? "APPLY" : "DRY_RUN",
      orgId: ORG_ID,
      academicYearId: ACADEMIC_YEAR_ID,
      source: SOURCE,
      version: VERSION,
      writesPerformed: false,
      writeCollections: ["schools/*/academicYears/*/classes", "classSubjectOfferings"],
      protectedCollectionsNotWritten: ["teacherAssignments", "teacherAssignmentClassLinks", "operationalAssignments", "memberships", "people", "users"],
    },
    desiredClasses: desiredTargets(),
    schoolSummaries: schoolSummaries(classActions, offeringActions, blockers),
    actions: [...classActions, ...offeringActions].map(({ payload, ...item }) => item),
    blockers,
    summary: {
      classes: summarize(classActions),
      offerings: summarize(offeringActions),
      writes: writes.length,
      blocked: blockers.length,
    },
    _writes: writes,
  };

  if (apply && blockers.length === 0 && writes.length > 0) {
    await commitWrites(db, writes);
    report.metadata.writesPerformed = true;
  }

  fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
  fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2), "utf8");
  printPlan(report);
  console.log(`Report: ${REPORT_PATH}`);

  if (apply && blockers.length > 0) {
    process.exitCode = 1;
  }
  return report;
}

module.exports = {
  APPLY_TOKEN,
  runRepair,
};
