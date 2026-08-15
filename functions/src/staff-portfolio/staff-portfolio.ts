import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import {
  MembershipRole,
  StaffPortfolioItemKindSchema,
  StaffPortfolioItemSchema,
  StaffPortfolioListFiltersSchema,
  TeacherAssignmentSchema,
  type MembershipRole as MembershipRoleType,
  type StaffPortfolioItem,
} from "@takween/contracts";
import {
  canReadStaffPortfolioItem,
  canReviewStaffPortfolio,
  isStaffPortfolioTeacherRole,
  validateStaffPortfolioKindFields,
} from "@takween/domain";

const REGION = "me-central2";
const MAX_PDF_BYTES = 25 * 1024 * 1024;
type Row = Record<string, unknown>;

function text(value: unknown) { return typeof value === "string" ? value.trim() : ""; }
function number(value: unknown) { return typeof value === "number" && Number.isFinite(value) ? value : undefined; }
function row(value: unknown): Row { return value && typeof value === "object" && !Array.isArray(value) ? value as Row : {}; }
function roleOf(membership: Row): MembershipRoleType | undefined {
  const result = MembershipRole.safeParse(text(membership.roleKey) || text(membership.role));
  return result.success ? result.data : undefined;
}
function membershipActive(membership: Row, now: number) {
  if (membership.isActive === false || membership.active === false) return false;
  const startAt = number(membership.startAt); const endAt = number(membership.endAt);
  return !(startAt !== undefined && startAt > now) && !(endAt !== undefined && endAt < now);
}
function schoolIdsOf(membership: Row) {
  const scopes = row(membership.scopes);
  const ids = Array.isArray(scopes.schoolIds) ? scopes.schoolIds.filter((id): id is string => typeof id === "string" && !!id.trim()).map((id) => id.trim()) : [];
  if (text(membership.scopeType) === "SCHOOL" && text(membership.scopeId)) ids.push(text(membership.scopeId));
  return Array.from(new Set(ids));
}
function allSchools(membership: Row, role: MembershipRoleType) {
  const scopes = row(membership.scopes);
  return ["platform_owner", "platform_admin", "org_owner", "org_admin"].includes(role) || scopes.canAccessAllSchools === true || text(membership.scopeType) === "ORG";
}
function assertId(value: unknown, field: string) {
  const result = text(value);
  if (!result || result.includes("/")) throw new HttpsError("invalid-argument", `${field} is required.`);
  return result;
}
async function caller(orgId: string, uid: string) {
  const snapshot = await getFirestore().doc(`users/${uid}/orgMemberships/${orgId}`).get();
  if (!snapshot.exists) throw new HttpsError("permission-denied", "Organization membership was not found.");
  const membership = snapshot.data() ?? {};
  const now = Date.now(); const role = roleOf(membership); const personId = text(membership.personId);
  if (!role || !personId || !membershipActive(membership, now)) throw new HttpsError("permission-denied", "An active staff membership is required.");
  return { membership, role, personId, schoolIds: schoolIdsOf(membership), canAccessAllSchools: allSchools(membership, role) };
}
async function supervisedTeacherPersonIds(orgId: string, supervisorPersonId: string) {
  const db = getFirestore(); const now = Date.now();
  const [assignmentSnapshot, membershipSnapshot] = await Promise.all([
    db.collection(`orgs/${orgId}/teacherAssignments`).where("supervisorPersonId", "==", supervisorPersonId).get(),
    db.collectionGroup("orgMemberships").where("orgId", "==", orgId).get(),
  ]);
  const ids = new Set<string>();
  assignmentSnapshot.docs.forEach((doc) => {
    const parsed = TeacherAssignmentSchema.safeParse({ id: doc.id, ...doc.data() });
    if (parsed.success && parsed.data.status === "ACTIVE" && parsed.data.startAt <= now && (!parsed.data.endAt || parsed.data.endAt >= now)) ids.add(parsed.data.teacherPersonId);
  });
  membershipSnapshot.docs.forEach((doc) => {
    const data = doc.data(); const role = roleOf(data); const personId = text(data.personId);
    if (text(data.supervisorPersonId) === supervisorPersonId && role && isStaffPortfolioTeacherRole(role) && personId && membershipActive(data, now)) ids.add(personId);
  });
  return ids;
}
async function allowedItems(params: { orgId: string; uid: string; ownOnly?: boolean; filters?: unknown }) {
  const actor = await caller(params.orgId, params.uid);
  if (params.ownOnly && !isStaffPortfolioTeacherRole(actor.role)) throw new HttpsError("permission-denied", "A teacher membership is required.");
  if (!params.ownOnly && !canReviewStaffPortfolio([actor.role])) throw new HttpsError("permission-denied", "Portfolio review access is required.");
  const filters = StaffPortfolioListFiltersSchema.parse(params.filters ?? {});
  const supervised = await supervisedTeacherPersonIds(params.orgId, actor.personId);
  const snapshot = await getFirestore().collection(`orgs/${params.orgId}/staffPortfolioItems`).get();
  return snapshot.docs.flatMap((doc) => {
    const parsed = StaffPortfolioItemSchema.safeParse({ id: doc.id, orgId: params.orgId, ...doc.data() });
    if (!parsed.success || (doc.data().uploadPending === true)) return [];
    const item = parsed.data;
    const permitted = params.ownOnly ? item.ownerUid === params.uid && item.ownerPersonId === actor.personId : canReadStaffPortfolioItem({ item, actor: { uid: params.uid, personId: actor.personId, roles: [actor.role], schoolIds: actor.schoolIds, canAccessAllSchools: actor.canAccessAllSchools }, supervisedTeacherPersonIds: supervised });
    if (!permitted) return [];
    if (filters.schoolId && item.schoolId !== filters.schoolId) return [];
    if (filters.ownerPersonId && item.ownerPersonId !== filters.ownerPersonId) return [];
    if (filters.kind && item.kind !== filters.kind) return [];
    if (filters.academicYearId && item.academicYearId !== filters.academicYearId) return [];
    if (filters.termId && item.termId !== filters.termId) return [];
    return [item];
  }).sort((a, b) => b.submittedAt - a.submittedAt);
}

export const listMyStaffPortfolioItems = onCall({ region: REGION, cors: true, invoker: "public" }, async (request): Promise<StaffPortfolioItem[]> => {
  if (!request.auth?.uid) throw new HttpsError("unauthenticated", "Authentication is required.");
  return allowedItems({ orgId: assertId(request.data?.orgId, "orgId"), uid: request.auth.uid, ownOnly: true });
});

export const listTeacherPortfolioItems = onCall({ region: REGION, cors: true, invoker: "public" }, async (request): Promise<StaffPortfolioItem[]> => {
  if (!request.auth?.uid) throw new HttpsError("unauthenticated", "Authentication is required.");
  return allowedItems({ orgId: assertId(request.data?.orgId, "orgId"), uid: request.auth.uid, filters: request.data?.filters });
});

export const beginStaffPortfolioItem = onCall({ region: REGION, cors: true, invoker: "public" }, async (request): Promise<StaffPortfolioItem> => {
  if (!request.auth?.uid) throw new HttpsError("unauthenticated", "Authentication is required.");
  const orgId = assertId(request.data?.orgId, "orgId"); const actor = await caller(orgId, request.auth.uid);
  if (!isStaffPortfolioTeacherRole(actor.role)) throw new HttpsError("permission-denied", "A teacher membership is required.");
  const kind = StaffPortfolioItemKindSchema.parse(request.data?.kind);
  const title = assertId(request.data?.title, "title"); const academicYearId = assertId(request.data?.academicYearId, "academicYearId"); const termId = assertId(request.data?.termId, "termId");
  const occurredAt = number(request.data?.occurredAt); const sizeBytes = number(request.data?.sizeBytes); const originalName = assertId(request.data?.originalName, "originalName");
  if (!occurredAt || occurredAt < 0 || !Number.isInteger(occurredAt)) throw new HttpsError("invalid-argument", "occurredAt is required.");
  if (!sizeBytes || !Number.isInteger(sizeBytes) || sizeBytes > MAX_PDF_BYTES) throw new HttpsError("invalid-argument", "A PDF up to 25 MB is required.");
  if (!originalName.toLowerCase().endsWith(".pdf")) throw new HttpsError("invalid-argument", "Only PDF files are accepted.");
  const providerName = text(request.data?.providerName); const trainingHours = number(request.data?.trainingHours);
  if (validateStaffPortfolioKindFields({ kind, providerName, trainingHours }).length) throw new HttpsError("invalid-argument", "Professional development details are invalid for this item kind.");
  const assignments = await getFirestore().collection(`orgs/${orgId}/teacherAssignments`).where("teacherPersonId", "==", actor.personId).get();
  const active = assignments.docs.flatMap((doc) => { const parsed = TeacherAssignmentSchema.safeParse({ id: doc.id, ...doc.data() }); return parsed.success && parsed.data.status === "ACTIVE" && parsed.data.academicYearId === academicYearId && (!parsed.data.termId || parsed.data.termId === termId) ? [parsed.data] : []; });
  const schoolId = active.map((assignment) => assignment.schoolId).sort()[0];
  if (!schoolId) throw new HttpsError("permission-denied", "No active teacher assignment matches the selected academic context.");
  const db = getFirestore(); const [schoolDoc, academicYearDoc, termDoc] = await Promise.all([db.doc(`orgs/${orgId}/schools/${schoolId}`).get(), db.doc(`orgs/${orgId}/schools/${schoolId}/academicYears/${academicYearId}`).get(), db.doc(`orgs/${orgId}/academicYears/${academicYearId}/terms/${termId}`).get()]);
  if (!termDoc.exists || text(termDoc.data()?.academicYearId) !== academicYearId) throw new HttpsError("invalid-argument", "The selected term is not valid.");
  const itemRef = db.collection(`orgs/${orgId}/staffPortfolioItems`).doc();
  const safeName = originalName.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^[-.]+|[-.]+$/g, "") || "evidence.pdf";
  const now = Date.now();
  const item = StaffPortfolioItemSchema.parse({ id: itemRef.id, orgId, schoolId, schoolName: text(schoolDoc.data()?.name), academicYearId, academicYearTitle: text(academicYearDoc.data()?.title), termId, termTitle: text(termDoc.data()?.title), ownerUid: request.auth.uid, ownerPersonId: actor.personId, ownerDisplayName: text(request.auth.token?.name) || text(actor.membership.displayName) || actor.personId, ownerRoleKey: actor.role, kind, title, description: text(request.data?.description), occurredAt, providerName: kind === "PROFESSIONAL_DEVELOPMENT" ? providerName : "", trainingHours: kind === "PROFESSIONAL_DEVELOPMENT" ? trainingHours : undefined, file: { storagePath: `orgs/${orgId}/staffPortfolioItems/${itemRef.id}/${safeName}`, originalName, contentType: "application/pdf", sizeBytes }, status: "SUBMITTED", submittedAt: now, createdAt: now, updatedAt: now, archivedByUid: "", archivedByPersonId: "" });
  await itemRef.set({ ...item, uploadPending: true });
  return item;
});

export const completeStaffPortfolioUpload = onCall({ region: REGION, cors: true, invoker: "public" }, async (request): Promise<void> => {
  if (!request.auth?.uid) throw new HttpsError("unauthenticated", "Authentication is required.");
  const orgId = assertId(request.data?.orgId, "orgId"); const itemId = assertId(request.data?.itemId, "itemId"); const actor = await caller(orgId, request.auth.uid);
  const ref = getFirestore().doc(`orgs/${orgId}/staffPortfolioItems/${itemId}`); const snapshot = await ref.get();
  const parsed = StaffPortfolioItemSchema.safeParse({ id: itemId, orgId, ...snapshot.data() });
  if (!snapshot.exists || !parsed.success || parsed.data.ownerUid !== request.auth.uid || parsed.data.ownerPersonId !== actor.personId || snapshot.data()?.uploadPending !== true) throw new HttpsError("permission-denied", "This upload is not available.");
  const file = getStorage().bucket().file(parsed.data.file.storagePath); const [exists] = await file.exists(); if (!exists) throw new HttpsError("failed-precondition", "Upload the PDF before completing the item.");
  const [metadata] = await file.getMetadata();
  if (metadata.contentType !== "application/pdf" || Number(metadata.size) !== parsed.data.file.sizeBytes || Number(metadata.size) > MAX_PDF_BYTES) throw new HttpsError("invalid-argument", "Uploaded file metadata does not match the portfolio item.");
  await ref.update({ uploadPending: false, updatedAt: Date.now() });
});

export const archiveStaffPortfolioItem = onCall({ region: REGION, cors: true, invoker: "public" }, async (request): Promise<void> => {
  if (!request.auth?.uid) throw new HttpsError("unauthenticated", "Authentication is required.");
  const orgId = assertId(request.data?.orgId, "orgId"); const itemId = assertId(request.data?.itemId, "itemId"); const actor = await caller(orgId, request.auth.uid);
  const ref = getFirestore().doc(`orgs/${orgId}/staffPortfolioItems/${itemId}`); const snapshot = await ref.get(); const parsed = StaffPortfolioItemSchema.safeParse({ id: itemId, orgId, ...snapshot.data() });
  if (!parsed.success || parsed.data.ownerUid !== request.auth.uid || parsed.data.ownerPersonId !== actor.personId || !isStaffPortfolioTeacherRole(actor.role)) throw new HttpsError("permission-denied", "Only the owner may archive this portfolio item.");
  const now = Date.now(); await ref.update({ status: "ARCHIVED", archivedAt: now, archivedByUid: request.auth.uid, archivedByPersonId: actor.personId, updatedAt: now });
});

export const getStaffPortfolioFileUrl = onCall({ region: REGION, cors: true, invoker: "public" }, async (request): Promise<{ url: string; originalName: string }> => {
  if (!request.auth?.uid) throw new HttpsError("unauthenticated", "Authentication is required.");
  const orgId = assertId(request.data?.orgId, "orgId"); const itemId = assertId(request.data?.itemId, "itemId"); const actor = await caller(orgId, request.auth.uid); const items = await allowedItems({ orgId, uid: request.auth.uid, ownOnly: isStaffPortfolioTeacherRole(actor.role) }); const item = items.find((candidate) => candidate.id === itemId);
  if (!item) throw new HttpsError("permission-denied", "You cannot access this portfolio evidence.");
  const [url] = await getStorage().bucket().file(item.file.storagePath).getSignedUrl({ action: "read", expires: Date.now() + 5 * 60 * 1000, responseDisposition: `inline; filename="${item.file.originalName.replace(/[\"\\r\\n]/g, "")}"` });
  return { url, originalName: item.file.originalName };
});
