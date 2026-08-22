import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { deleteObject, getBlob, ref, uploadBytes } from "firebase/storage";
import {
  PdfResourceAcknowledgementReportSchema,
  PdfResourceAcknowledgementSchema,
  PdfResourceSchema,
  type ClassSubjectOffering,
  type MembershipRole,
  type PdfResource,
  type PdfResourceAcknowledgement,
  type PdfResourceAcknowledgementReport,
} from "@takween/contracts";
import {
  canStaffAcknowledgePdfResource,
  isStaffTargetedByPdfResource,
  isTeacherTargetedByPdfResource,
  resolveActiveTeacherOfferingIds,
  TEACHER_PDF_RESOURCE_ROLE_KEYS,
} from "@takween/domain";

import { db, functions, storage } from "@/lib/firebase";
import type { StaffActorData } from "@/lib/staff-actor";

export const PDF_RESOURCE_MANAGEMENT_ROLES = new Set<MembershipRole>([
  "platform_owner",
  "platform_admin",
  "org_owner",
  "org_admin",
]);

export function canManagePdfResources(roles: MembershipRole[]) {
  return roles.some((role) => PDF_RESOURCE_MANAGEMENT_ROLES.has(role));
}

function currentMembership(actor: StaffActorData) {
  return actor.memberships.find((item) => item.roleKey || item.role);
}

function staffContext(actor: StaffActorData) {
  const membership = currentMembership(actor);
  const roleKey = membership?.roleKey ?? membership?.role;

  return {
    orgId: actor.orgId,
    personId: actor.personId,
    roleKeys: roleKey ? [roleKey] : [],
    schoolIds: actor.schools.map((school) => school.id),
    canAccessAllSchools:
      !!roleKey &&
      (canManagePdfResources([roleKey]) ||
        membership?.scopes?.canAccessAllSchools === true),
  };
}

function parseResources(rows: Array<{ id: string; data: Record<string, unknown> }>) {
  return rows.flatMap((row) => {
    const parsed = PdfResourceSchema.safeParse({ id: row.id, ...row.data });
    return parsed.success ? [parsed.data] : [];
  });
}

export async function listMyPdfResources(actor: StaffActorData): Promise<{
  resources: PdfResource[];
  acknowledgementsByResourceId: Record<string, PdfResourceAcknowledgement>;
}> {
  if (!currentMembership(actor) || !actor.personId) {
    return { resources: [], acknowledgementsByResourceId: {} };
  }

  const callable = httpsCallable<{ orgId: string }, PdfResource[]>(
    functions,
    "listMyPdfResources",
  );
  const result = await callable({ orgId: actor.orgId });
  const resources = result.data
    .flatMap((resource) => {
      const parsed = PdfResourceSchema.safeParse(resource);
      return parsed.success ? [parsed.data] : [];
    })
    .filter((resource) => isStaffTargetedByPdfResource(resource, staffContext(actor)));

  const items = await Promise.all(
    resources.filter((resource) => resource.requiresAcknowledgement).map(async (resource) => {
      const acknowledgement = await getDoc(doc(db, "orgs", actor.orgId, "pdfResources", resource.id, "acknowledgements", actor.personId));
      if (!acknowledgement.exists()) return null;
      const parsed = PdfResourceAcknowledgementSchema.safeParse({ id: acknowledgement.id, ...acknowledgement.data() });
      return parsed.success ? parsed.data : null;
    }),
  );

  return {
    resources,
    acknowledgementsByResourceId: Object.fromEntries(
      items.filter((item): item is PdfResourceAcknowledgement => !!item).map((item) => [item.resourceId, item]),
    ),
  };
}

function activeTeacherAssignments(actor: StaffActorData, now: number) {
  return actor.teacherAssignments.filter(
    (assignment) =>
      assignment.status === "ACTIVE" &&
      assignment.startAt <= now &&
      (!assignment.endAt || assignment.endAt >= now),
  );
}

export function isTeacherPdfResourceActor(actor: StaffActorData) {
  return actor.roles.some((role) => TEACHER_PDF_RESOURCE_ROLE_KEYS.has(role));
}

export async function listMyTeachingPdfResources(actor: StaffActorData) {
  if (!actor.personId || !isTeacherPdfResourceActor(actor)) return [];

  const callable = httpsCallable<{ orgId: string }, PdfResource[]>(
    functions,
    "listMyTeachingPdfResources",
  );
  const result = await callable({ orgId: actor.orgId });
  const now = Date.now();
  const assignments = activeTeacherAssignments(actor, now);
  const teacherOfferingIds = resolveActiveTeacherOfferingIds({
    assignments: actor.teacherAssignments,
    classLinks: actor.teacherAssignmentClassLinks,
    now,
  });

  return result.data.flatMap((resource) => {
    const parsed = PdfResourceSchema.safeParse(resource);
    if (!parsed.success) return [];

    return isTeacherTargetedByPdfResource(parsed.data, {
      orgId: actor.orgId,
      personId: actor.personId,
      roleKeys: actor.roles,
      schoolIds: Array.from(new Set(assignments.map((item) => item.schoolId))),
      academicYearIds: Array.from(new Set(assignments.map((item) => item.academicYearId))),
      termIds: Array.from(new Set(assignments.map((item) => item.termId).filter(Boolean))),
      teacherOfferingIds,
    })
      ? [parsed.data]
      : [];
  });
}

export function getSelectedTeachingOfferings(params: {
  offerings: ClassSubjectOffering[];
  schoolIds: string[];
  academicYearId: string;
  gradeId: string;
  subjectKey: string;
}) {
  const schoolIds = new Set(params.schoolIds);

  return params.offerings.filter(
    (offering) =>
      offering.status === "ACTIVE" &&
      offering.isArchived !== true &&
      schoolIds.has(offering.schoolId) &&
      offering.academicYearId === params.academicYearId &&
      offering.gradeId === params.gradeId &&
      offering.subjectKey === params.subjectKey,
  );
}

export async function acknowledgePdfResource(params: {
  actor: StaffActorData;
  resource: PdfResource;
}): Promise<PdfResourceAcknowledgement> {
  const membership = currentMembership(params.actor);
  const roleKey = membership?.roleKey ?? membership?.role;
  const context = staffContext(params.actor);
  if (!params.actor.personId || !roleKey || !canStaffAcknowledgePdfResource(params.resource, context)) {
    throw new Error("لا يمكن تسجيل الإقرار لهذا المستند.");
  }

  const acknowledgement = PdfResourceAcknowledgementSchema.parse({
    id: params.actor.personId,
    orgId: params.actor.orgId,
    resourceId: params.resource.id,
    actorKind: "STAFF",
    actorId: params.actor.personId,
    uid: params.actor.uid,
    personId: params.actor.personId,
    displayName: params.actor.person?.displayName || params.actor.userProfile?.displayName || params.actor.userProfile?.email || params.actor.personId,
    roleKey,
    schoolId: params.resource.audience.schoolIds.find((id) => context.schoolIds.includes(id)) ?? context.schoolIds[0] ?? "",
    acknowledgedAt: Date.now(),
  });
  await setDoc(doc(db, "orgs", params.actor.orgId, "pdfResources", params.resource.id, "acknowledgements", params.actor.personId), acknowledgement);
  return acknowledgement;
}

export async function listManagedPdfResources(orgId: string): Promise<PdfResource[]> {
  const snapshot = await getDocs(collection(db, "orgs", orgId, "pdfResources"));
  return parseResources(snapshot.docs.map((item) => ({ id: item.id, data: item.data() as Record<string, unknown> }))).sort(
    (left, right) => right.publishedAt - left.publishedAt,
  );
}

function safePdfFileName(name: string) {
  const sanitized = name.trim().replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^[-.]+|[-.]+$/g, "") || "document.pdf";
  return sanitized.toLowerCase().endsWith(".pdf") ? sanitized : `${sanitized}.pdf`;
}

export async function publishPdfResource(params: {
  actor: StaffActorData;
  title: string;
  description: string;
  targetRoleKeys: MembershipRole[];
  schoolIds: string[];
  requiresAcknowledgement: boolean;
  file: File;
}): Promise<PdfResource> {
  if (!canManagePdfResources(params.actor.roles)) throw new Error("ليس لديك صلاحية نشر المستندات.");
  if (params.file.type !== "application/pdf") throw new Error("يُسمح برفع ملفات PDF فقط.");
  if (params.file.size > 25 * 1024 * 1024) throw new Error("الحد الأقصى لحجم الملف هو 25 ميجابايت.");

  const resourceRef = doc(collection(db, "orgs", params.actor.orgId, "pdfResources"));
  const fileName = safePdfFileName(params.file.name);
  const storagePath = `orgs/${params.actor.orgId}/pdfResources/${resourceRef.id}/${fileName}`;
  const fileRef = ref(storage, storagePath);
  await uploadBytes(fileRef, params.file, { contentType: "application/pdf" });

  const now = Date.now();
  const resource = PdfResourceSchema.parse({
    id: resourceRef.id, orgId: params.actor.orgId, kind: "JOB_TASKS",
    title: params.title.trim(), description: params.description.trim(),
    audience: { kind: "STAFF_ROLES", academicYearId: "", termId: "", targetRoleKeys: Array.from(new Set(params.targetRoleKeys)), schoolIds: Array.from(new Set(params.schoolIds)), gradeIds: [], classIds: [], subjectKeys: [] },
    requiresAcknowledgement: params.requiresAcknowledgement, status: "PUBLISHED",
    file: { storagePath, originalName: params.file.name.trim() || fileName, contentType: "application/pdf", sizeBytes: params.file.size },
    publishedAt: now, publishedByUid: params.actor.uid, publishedByPersonId: params.actor.personId,
    publishedByDisplayName: params.actor.person?.displayName || params.actor.userProfile?.displayName || params.actor.userProfile?.email || "",
    createdAt: now, updatedAt: now,
  });
  try {
    await setDoc(resourceRef, resource);
  } catch (error) {
    try { await deleteObject(fileRef); } catch { /* best effort cleanup */ }
    throw error;
  }
  return resource;
}

export async function publishTeachingPdfResource(params: {
  actor: StaffActorData;
  kind: "ENRICHMENT_MATERIAL" | "CURRICULUM_DISTRIBUTION";
  title: string;
  description: string;
  targetRoleKeys: MembershipRole[];
  schoolIds: string[];
  academicYearId: string;
  termId: string;
  gradeId: string;
  subjectKey: string;
  classIds: string[];
  classSubjectOfferingIds: string[];
  file: File;
}): Promise<PdfResource> {
  if (!canManagePdfResources(params.actor.roles)) throw new Error("ليس لديك صلاحية نشر المستندات.");
  if (!params.targetRoleKeys.every((role) => TEACHER_PDF_RESOURCE_ROLE_KEYS.has(role))) {
    throw new Error("المصادر التعليمية تستهدف أدوار المعلمين فقط.");
  }
  if (params.file.type !== "application/pdf") throw new Error("يُسمح برفع ملفات PDF فقط.");
  if (params.file.size > 25 * 1024 * 1024) throw new Error("الحد الأقصى لحجم الملف هو 25 ميجابايت.");

  const resourceRef = doc(collection(db, "orgs", params.actor.orgId, "pdfResources"));
  const fileName = safePdfFileName(params.file.name);
  const storagePath = `orgs/${params.actor.orgId}/pdfResources/${resourceRef.id}/${fileName}`;
  const fileRef = ref(storage, storagePath);
  const schoolIds = Array.from(new Set(params.schoolIds.map((schoolId) => schoolId.trim()).filter(Boolean)));
  if (schoolIds.length === 0) {
    throw new Error("At least one school is required for a teaching PDF resource.");
  }
  const selectedOfferings = getSelectedTeachingOfferings({
    offerings: params.actor.classSubjectOfferings,
    schoolIds,
    academicYearId: params.academicYearId,
    gradeId: params.gradeId,
    subjectKey: params.subjectKey,
  }).filter((offering) => params.classSubjectOfferingIds.includes(offering.id));
  const selectedOfferingIds = Array.from(new Set(selectedOfferings.map((offering) => offering.id)));
  const classIds = Array.from(new Set(selectedOfferings.map((offering) => offering.classId)));
  if (selectedOfferingIds.length === 0) {
    throw new Error("At least one teaching offering is required for a teaching PDF resource.");
  }
  await uploadBytes(fileRef, params.file, { contentType: "application/pdf" });
  const now = Date.now();
  const resource = PdfResourceSchema.parse({
    id: resourceRef.id, orgId: params.actor.orgId, kind: params.kind,
    title: params.title.trim(), description: params.description.trim(),
    audience: {
      kind: "STAFF_ROLES", academicYearId: params.academicYearId, termId: params.termId,
      targetRoleKeys: Array.from(new Set(params.targetRoleKeys)), schoolIds,
      gradeIds: [params.gradeId], classIds,
      subjectKeys: [params.subjectKey],
      classSubjectOfferingIds: selectedOfferingIds,
    },
    requiresAcknowledgement: false, status: "PUBLISHED",
    file: { storagePath, originalName: params.file.name.trim() || fileName, contentType: "application/pdf", sizeBytes: params.file.size },
    publishedAt: now, publishedByUid: params.actor.uid, publishedByPersonId: params.actor.personId,
    publishedByDisplayName: params.actor.person?.displayName || params.actor.userProfile?.displayName || params.actor.userProfile?.email || "",
    createdAt: now, updatedAt: now,
  });
  try {
    await setDoc(resourceRef, resource);
  } catch (error) {
    try { await deleteObject(fileRef); } catch { /* best effort cleanup */ }
    throw error;
  }
  return resource;
}

export async function archivePdfResource(params: { actor: StaffActorData; resourceId: string }) {
  if (!canManagePdfResources(params.actor.roles)) throw new Error("ليس لديك صلاحية أرشفة المستندات.");
  const now = Date.now();
  await updateDoc(doc(db, "orgs", params.actor.orgId, "pdfResources", params.resourceId), {
    status: "ARCHIVED", archivedAt: now, archivedByUid: params.actor.uid,
    archivedByPersonId: params.actor.personId, updatedAt: now,
  });
}

export async function getPdfResourceAcknowledgementReport(params: { orgId: string; resourceId: string }) {
  const callable = httpsCallable<typeof params, PdfResourceAcknowledgementReport>(functions, "getPdfResourceAcknowledgementReport");
  const result = await callable(params);
  return PdfResourceAcknowledgementReportSchema.parse(result.data);
}

async function getPdfBlob(resource: PdfResource) {
  return getBlob(ref(storage, resource.file.storagePath));
}

export async function viewPdfResource(resource: PdfResource) {
  const url = URL.createObjectURL(await getPdfBlob(resource));
  window.open(url, "_blank", "noopener,noreferrer");
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export async function downloadPdfResource(resource: PdfResource) {
  const url = URL.createObjectURL(await getPdfBlob(resource));
  const anchor = document.createElement("a");
  anchor.href = url; anchor.download = resource.file.originalName;
  document.body.appendChild(anchor); anchor.click(); anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}
