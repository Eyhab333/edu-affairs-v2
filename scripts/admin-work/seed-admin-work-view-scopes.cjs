/* eslint-disable no-console */

// Preview: node scripts/admin-work/seed-admin-work-view-scopes.cjs
// Apply:   node scripts/admin-work/seed-admin-work-view-scopes.cjs --apply
const admin = require("firebase-admin");
const path = require("path");

const APPLY = process.argv.includes("--apply");
const ORG_ID = process.argv.find((item) => item.startsWith("--orgId="))?.slice("--orgId=".length) || "takween";
const CAPABILITY = "ADMIN_WORK_VIEW";
const PRINCIPAL_ROLES = ["BOYS_PRINCIPAL", "GIRLS_PRINCIPAL", "KG_PRINCIPAL"];

function active(data) {
  const now = Date.now();
  return data.isActive !== false && data.active !== false && data.status !== "INACTIVE" && !(typeof data.startAt === "number" && data.startAt > now) && !(typeof data.endAt === "number" && data.endAt < now);
}
function schoolIds(data) {
  return [...new Set([
    data.scopeType === "SCHOOL" && typeof data.scopeId === "string" ? data.scopeId : "",
    ...(Array.isArray(data.scopes?.schoolIds) ? data.scopes.schoolIds.filter((item) => typeof item === "string") : []),
  ].filter(Boolean))];
}
function matchingSchool(role, schoolId, school) {
  const profile = school.profile || {};
  const track = profile.track || profile.gender;
  if (role === "BOYS_PRINCIPAL") return profile.schoolType === "PRIMARY" && track === "BOYS";
  if (role === "GIRLS_PRINCIPAL") return schoolId === "mrb-girls" && profile.schoolType === "PRIMARY" && track === "GIRLS";
  return role === "KG_PRINCIPAL" && profile.schoolType === "KG";
}
function init() {
  if (admin.apps.length) return;
  const serviceAccount = require(path.resolve(process.cwd(), "scripts/service-account.json"));
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount), projectId: serviceAccount.project_id });
}
function assert(value, message) { if (!value) throw new Error(message); }

async function main() {
  init();
  const db = admin.firestore();
  console.log(APPLY ? "Admin Work scopes - APPLY mode" : "Admin Work scopes - PREVIEW mode (read-only)");
  const membershipSnapshots = await Promise.all(PRINCIPAL_ROLES.map(async (role) => {
    const [roleKeySnapshots, roleSnapshots] = await Promise.all([
      db.collectionGroup("orgMemberships").where("orgId", "==", ORG_ID).where("roleKey", "==", role).get(),
      db.collectionGroup("orgMemberships").where("orgId", "==", ORG_ID).where("role", "==", role).get(),
    ]);
    return [...new Map([...roleKeySnapshots.docs, ...roleSnapshots.docs].map((document) => [document.ref.path, document])).values()];
  }));
  const candidates = [];
  for (let index = 0; index < membershipSnapshots.length; index += 1) {
    const role = PRINCIPAL_ROLES[index];
    for (const document of membershipSnapshots[index]) {
      const membership = document.data() || {};
      if (!active(membership)) continue;
      assert(typeof membership.personId === "string" && membership.personId, `Missing personId for ${document.ref.path}`);
      for (const schoolId of schoolIds(membership)) {
        const schoolSnapshot = await db.doc(`orgs/${ORG_ID}/schools/${schoolId}`).get();
        assert(schoolSnapshot.exists, `School not found: ${schoolId}`);
        const school = schoolSnapshot.data() || {};
        if (!matchingSchool(role, schoolId, school)) continue;
        const personSnapshot = await db.doc(`orgs/${ORG_ID}/people/${membership.personId}`).get();
        assert(personSnapshot.exists, `Person not found: ${membership.personId}`);
        candidates.push({ role, personId: membership.personId, personName: personSnapshot.data()?.displayName || "موظف غير محدد", schoolId, schoolName: school.name || schoolId });
      }
    }
  }
  const unique = [...new Map(candidates.map((item) => [`${item.personId}:${item.schoolId}`, item])).values()];
  if (!unique.length) throw new Error("No active, school-aligned principal memberships were found. No scopes will be written.");
  const writes = [];
  for (const candidate of unique) {
    const scopeId = `${candidate.personId}__${CAPABILITY}__${candidate.schoolId}`;
    const ref = db.doc(`orgs/${ORG_ID}/personSupervisionScopes/${scopeId}`);
    const existing = await ref.get();
    const now = Date.now();
    const desired = { id: scopeId, orgId: ORG_ID, personId: candidate.personId, capability: CAPABILITY, schoolId: candidate.schoolId, subjectScope: "ALL_SUBJECTS", subjectKeys: [], isActive: true, createdAt: typeof existing.data()?.createdAt === "number" ? existing.data().createdAt : now, updatedAt: now };
    console.log(JSON.stringify({ candidate, existing: existing.exists ? existing.data() : null, desired }, null, 2));
    writes.push({ ref, desired, candidate });
  }
  if (!APPLY) { console.log(`PREVIEW COMPLETE: ${writes.length} scopes. No writes performed. Re-run with --apply to create/update scopes.`); return; }
  const batch = db.batch(); for (const item of writes) batch.set(item.ref, item.desired, { merge: true }); await batch.commit();
  for (const item of writes) { const data = (await item.ref.get()).data() || {}; assert(data.capability === CAPABILITY && data.personId === item.candidate.personId && data.schoolId === item.candidate.schoolId && data.subjectScope === "ALL_SUBJECTS" && Array.isArray(data.subjectKeys) && !data.subjectKeys.length && data.isActive === true, `Verification failed for ${item.ref.id}`); }
  console.log(`ADMIN_WORK_VIEW scopes provisioned successfully: ${writes.length}.`);
}
main().catch((error) => { console.error("ADMIN_WORK_VIEW scope provisioning failed:", error); process.exitCode = 1; });
