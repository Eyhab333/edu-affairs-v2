/* eslint-disable no-console */

const admin = require("firebase-admin");
const path = require("path");

const CONFIG = {
  orgId: "takween",
  schoolIds: ["mrb-boys-sayh", "mrb-boys-faleh"],
  teacherRoleKeys: ["BOYS_TEACHER", "TEACHER"],
  supervisors: [
    {
      email: "s.sayed@qz.org.sa",
      teacherNames: [
        "محمود محمد ابوالدهب",
        "حامد السيد السيد نافع",
        "محمد مصطفى الصادق",
        "عبدالله بن محمد مطفى عتاب",
        "عبدالله سليمان عبدالله الدهش",
        "خالد أحمد الفنيسان",
        "سعود احمد سعود الحمد",
        "طلال ناصر الهزاني",
        "فيصل فهد النافع",
        "فيصل فهد عبدالعزيز الفهد",
        "عبدالرحمن إبراهيم عبدالرحمن السمحان",
        "خالد سعود عبدالعزيز الحمد",
        "عبدالرحمن حمد عبدالرحمن الجاسر",
        "عبدالله محمود احمد منصور",
        "خالد محمد الشاذلي معتمد",
      ],
    },
    {
      email: "n-alshaya@qz.org.sa",
      teacherNames: [
        "محمد سيد م بيومي",
        "أحمد محمد عبدالله النتيفي",
        "احمد محرم فؤاد فتاح",
        "خالد محمد محمد حنفي",
      ],
    },
  ],
};

function initAdmin() {
  if (admin.apps.length) return;

  const serviceAccountPath = path.resolve(process.cwd(), "service-account.json");
  const serviceAccount = require(serviceAccountPath);
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    projectId: serviceAccount.project_id,
  });
}

function asString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeEmail(value) {
  return asString(value).toLowerCase();
}

function normalizeArabicName(value) {
  return asString(value)
    .normalize("NFKD")
    .replace(/[\u064B-\u065F\u0670]/g, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/[^\u0621-\u063A\u0641-\u064A0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function nameTokens(value) {
  return new Set(normalizeArabicName(value).split(" ").filter(Boolean));
}

function similarity(left, right) {
  const leftTokens = nameTokens(left);
  const rightTokens = nameTokens(right);
  const intersection = [...leftTokens].filter((token) => rightTokens.has(token)).length;
  const union = new Set([...leftTokens, ...rightTokens]).size;
  return union ? intersection / union : 0;
}

function isActive(data) {
  const status = asString(data.status).toUpperCase();
  return (
    data.isActive !== false &&
    data.active !== false &&
    !["DISABLED", "ENDED", "INACTIVE", "REVOKED", "REMOVED"].includes(status)
  );
}

function uniqueDocuments(documents) {
  return Array.from(
    new Map(documents.map((document) => [document.ref.path, document])).values(),
  );
}

function membershipCoversSchool(data, schoolId) {
  return (
    asString(data.schoolId) === schoolId ||
    asString(data.scopeId) === schoolId ||
    data.scopes?.schoolIds?.includes(schoolId) ||
    data.scopes?.canAccessAllSchools === true
  );
}

async function loadSchoolTeacherPersonIds(db, orgRoot, schoolId) {
  const membershipsRef = db.collection(`${orgRoot}/memberships`);
  const [bySchoolId, byScopeId, bySchoolIds, users] = await Promise.all([
    membershipsRef.where("schoolId", "==", schoolId).get(),
    membershipsRef.where("scopeId", "==", schoolId).get(),
    membershipsRef.where("scopes.schoolIds", "array-contains", schoolId).get(),
    db.collection("users").where("schoolIds", "array-contains", schoolId).get(),
  ]);
  const nestedMemberships = users.empty
    ? []
    : await db.getAll(
        ...users.docs.map((user) =>
          db.doc(`users/${user.id}/orgMemberships/${CONFIG.orgId}`),
        ),
      );

  return new Set(
    uniqueDocuments([
      ...bySchoolId.docs,
      ...byScopeId.docs,
      ...bySchoolIds.docs,
      ...nestedMemberships.filter((membership) => membership.exists),
    ])
      .filter((membership) => {
        const data = membership.data();
        const roleKey = asString(data.roleKey || data.role).toUpperCase();
        return (
          isActive(data) &&
          CONFIG.teacherRoleKeys.includes(roleKey) &&
          membershipCoversSchool(data, schoolId)
        );
      })
      .map((membership) => asString(membership.data().personId))
      .filter(Boolean),
  );
}

async function inspectSupervisor(db, orgRoot, supervisor) {
  const authUser = await admin.auth().getUserByEmail(supervisor.email);
  const [user, membership] = await Promise.all([
    db.doc(`users/${authUser.uid}`).get(),
    db.doc(`users/${authUser.uid}/orgMemberships/${CONFIG.orgId}`).get(),
  ]);
  const personId = asString(
    membership.data()?.personId || user.data()?.personId,
  );
  const [person, operations] = await Promise.all([
    db.doc(`${orgRoot}/people/${personId}`).get(),
    db.collection(`${orgRoot}/operationalAssignments`)
      .where("actorPersonId", "==", personId)
      .get(),
  ]);
  const membershipData = membership.data() || {};

  return {
    uid: authUser.uid,
    personId,
    displayName: asString(person.data()?.displayName || user.data()?.displayName),
    email: normalizeEmail(authUser.email),
    roleKey: asString(membershipData.roleKey || membershipData.role).toUpperCase(),
    active: membership.exists && isActive(membershipData),
    manageEvaluations: membershipData.permissions?.manageEvaluations === true,
    schoolIds: CONFIG.schoolIds.filter((schoolId) =>
      membershipCoversSchool(membershipData, schoolId),
    ),
    operationalAssignments: operations.docs
      .filter((document) => isActive(document.data()))
      .map((document) => ({
        id: document.id,
        schoolId: asString(document.data().schoolId || document.data().scopeId),
        operationKind: asString(document.data().operationKind),
      })),
    requestedTeacherNames: supervisor.teacherNames,
  };
}

async function main() {
  initAdmin();

  const db = admin.firestore();
  const orgRoot = `orgs/${CONFIG.orgId}`;
  const [peopleSnapshot, supervisors, ...schoolTeacherSets] = await Promise.all([
    db.collection(`${orgRoot}/people`).get(),
    Promise.all(
      CONFIG.supervisors.map((supervisor) =>
        inspectSupervisor(db, orgRoot, supervisor),
      ),
    ),
    ...CONFIG.schoolIds.map((schoolId) =>
      loadSchoolTeacherPersonIds(db, orgRoot, schoolId),
    ),
  ]);
  const people = peopleSnapshot.docs.map((document) => ({
    personId: document.id,
    displayName: asString(document.data().displayName),
    email: normalizeEmail(document.data().email),
    schools: CONFIG.schoolIds.filter((schoolId, index) =>
      schoolTeacherSets[index].has(document.id),
    ),
  }));

  const report = supervisors.map((supervisor) => ({
    evaluator: {
      uid: supervisor.uid,
      personId: supervisor.personId,
      displayName: supervisor.displayName,
      email: supervisor.email,
      roleKey: supervisor.roleKey,
      active: supervisor.active,
      manageEvaluations: supervisor.manageEvaluations,
      schoolIds: supervisor.schoolIds,
      operationalAssignments: supervisor.operationalAssignments,
    },
    requestedTeachers: supervisor.requestedTeacherNames.map((requestedName) => {
      const normalizedRequested = normalizeArabicName(requestedName);
      const exact = people.filter(
        (person) => normalizeArabicName(person.displayName) === normalizedRequested,
      );
      const candidates = (exact.length ? exact : people)
        .map((person) => ({
          ...person,
          similarity: similarity(requestedName, person.displayName),
        }))
        .filter((person) => exact.length || person.similarity >= 0.45)
        .sort((left, right) => right.similarity - left.similarity)
        .slice(0, 5);

      return { requestedName, exact: exact.length === 1, candidates };
    }),
  }));

  console.log("Boys educational supervisor teacher readiness (read-only)");
  console.dir({ supervisors: report }, { depth: 10 });
}

main().catch((error) => {
  console.error("Educational supervisor teacher readiness inspection failed:");
  console.error(error);
  process.exitCode = 1;
});
