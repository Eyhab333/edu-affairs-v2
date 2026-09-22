import { collection, doc, getDocs, setDoc } from "firebase/firestore";
import { deleteObject, getBlob, ref, uploadBytes } from "firebase/storage";
import {
  StaffPdfFileSchema,
  type StaffPdfFile,
  type StaffPdfFileCategoryKey,
} from "@takween/contracts";
import {
  canBrowseStaffPdfFilesInScope,
  canViewStaffPdfFile,
  hasActiveKindergartenValuesTeacherAssignment,
  type StaffPdfFileViewer,
} from "@takween/domain";

import { db, storage } from "@/lib/firebase";
import { getErrorDetails, getErrorMessage } from "@/lib/error-message";
import type { StaffActorData } from "@/lib/staff-actor";

export const STAFF_PDF_FILE_MAX_BYTES = 20 * 1024 * 1024;

/* Temporary PDF-center-only exception for scope-target presentation. */
const PDF_SCOPE_TARGET_EXCLUDED_PERSON_IDS = new Set([
  "p-a-almansur",
]);

export type StaffPdfFileCategoryVisibility =
  | "ALL_STAFF"
  | "KG_VALUES_TEACHER";

export type StaffPdfFileCategory = {
  key: StaffPdfFileCategoryKey;
  slug: string;
  title: string;
  description: string;
  href: string;
  visibility: StaffPdfFileCategoryVisibility;
};

export const staffPdfFileCategories: StaffPdfFileCategory[] = [
  {
    key: "WORK_DOCUMENTATION",
    slug: "work-documentation",
    title: "توثيق عمل",
    description: "رفع وحفظ ملفات توثيق الأعمال بصيغة PDF",
    href: "/staff/pdf-files/work-documentation",
    visibility: "ALL_STAFF",
  },
  {
    key: "KG_VALUE_1",
    slug: "kg-value-1",
    title: "القيمة الأولى",
    description: "رفع وحفظ ملفات القيمة الأولى بصيغة PDF",
    href: "/staff/pdf-files/kg-value-1",
    visibility: "KG_VALUES_TEACHER",
  },
  {
    key: "KG_VALUE_2",
    slug: "kg-value-2",
    title: "القيمة الثانية",
    description: "رفع وحفظ ملفات القيمة الثانية بصيغة PDF",
    href: "/staff/pdf-files/kg-value-2",
    visibility: "KG_VALUES_TEACHER",
  },
  {
    key: "KG_VALUE_3",
    slug: "kg-value-3",
    title: "القيمة الثالثة",
    description: "رفع وحفظ ملفات القيمة الثالثة بصيغة PDF",
    href: "/staff/pdf-files/kg-value-3",
    visibility: "KG_VALUES_TEACHER",
  },
  {
    key: "KG_VALUE_4",
    slug: "kg-value-4",
    title: "القيمة الرابعة",
    description: "رفع وحفظ ملفات القيمة الرابعة بصيغة PDF",
    href: "/staff/pdf-files/kg-value-4",
    visibility: "KG_VALUES_TEACHER",
  },
];

function uniqueStrings(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.map((value) => String(value || "").trim()).filter(Boolean)));
}

function safePdfFileName(name: string) {
  const sanitized = name
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "") || "document.pdf";
  return sanitized.toLowerCase().endsWith(".pdf") ? sanitized : `${sanitized}.pdf`;
}

function ownerDisplayName(actor: StaffActorData) {
  return actor.person?.displayName || actor.userProfile?.displayName || actor.userProfile?.email || "موظف";
}

function ownerSchoolIds(actor: StaffActorData) {
  return uniqueStrings([
    ...actor.schools.map((school) => school.id),
    ...actor.visibleClasses.map((classItem) => classItem.schoolId),
    ...actor.operationalAssignments.map((assignment) => assignment.schoolId),
    ...actor.teacherAssignments.map((assignment) => assignment.schoolId),
  ]);
}

function isPermissionError(error: unknown) {
  const { code } = getErrorDetails(error);
  return code === "permission-denied" || code.endsWith("/unauthorized") || code.endsWith("/permission-denied");
}

export function getStaffPdfFileCategory(key: string | null | undefined) {
  return (
    staffPdfFileCategories.find(
      (category) => category.key === key || category.slug === key,
    ) ?? null
  );
}

export function canAccessStaffPdfFileCategory(
  actor: StaffActorData,
  category: StaffPdfFileCategory,
) {
  if (category.visibility === "ALL_STAFF") return true;

  return hasActiveKindergartenValuesTeacherAssignment({
    personId: actor.personId,
    assignments: actor.teacherAssignments,
  });
}

export function getVisibleStaffPdfFileCategories(actor: StaffActorData) {
  return staffPdfFileCategories.filter((category) =>
    canAccessStaffPdfFileCategory(actor, category),
  );
}

export function validateStaffPdfFile(file: File) {
  if (file.type !== "application/pdf" || !file.name.toLowerCase().endsWith(".pdf")) {
    throw new Error("يُسمح برفع ملفات PDF فقط.");
  }
  if (file.size <= 0) throw new Error("ملف PDF المختار فارغ.");
  if (file.size > STAFF_PDF_FILE_MAX_BYTES) {
    throw new Error("الحد الأقصى لحجم ملف PDF هو 20 ميجابايت.");
  }
}

export function getStaffPdfFileViewer(params: {
  actor: StaffActorData;
  supervisionScopes?: StaffPdfFileViewer["supervisionScopes"];
}): StaffPdfFileViewer {
  return {
    orgId: params.actor.orgId,
    uid: params.actor.uid,
    personId: params.actor.personId,
    roles: params.actor.roles,
    schoolIds: ownerSchoolIds(params.actor),
    operationalAssignments: params.actor.operationalAssignments,
    supervisionScopes: params.supervisionScopes,
  };
}

export function canBrowseStaffPdfFiles(params: {
  actor: StaffActorData;
  supervisionScopes?: StaffPdfFileViewer["supervisionScopes"];
}) {
  return canBrowseStaffPdfFilesInScope(getStaffPdfFileViewer(params));
}

export function filterVisibleStaffPdfFiles(params: {
  actor: StaffActorData;
  files: StaffPdfFile[];
  supervisionScopes?: StaffPdfFileViewer["supervisionScopes"];
}) {
  const viewer = getStaffPdfFileViewer(params);
  return params.files.filter((file) => canViewStaffPdfFile({ viewer, file }));
}

export function excludeFromPdfScopeTarget(personId: string) {
  return PDF_SCOPE_TARGET_EXCLUDED_PERSON_IDS.has(personId);
}

/**
 * Applies only to the "ضمن نطاقي" target list. It deliberately does not
 * affect an owner's own files or any underlying authorization decision.
 */
export function filterStaffPdfFilesForScopeTargets(files: StaffPdfFile[]) {
  return files.filter((file) => !excludeFromPdfScopeTarget(file.ownerPersonId));
}

export async function listStaffPdfFiles(params: {
  orgId: string;
  categoryKey: StaffPdfFileCategoryKey;
}) {
  const snapshot = await getDocs(collection(db, "orgs", params.orgId, "staffPdfFiles"));
  return snapshot.docs
    .flatMap((document) => {
      const parsed = StaffPdfFileSchema.safeParse({ id: document.id, ...document.data() });
      return parsed.success && parsed.data.categoryKey === params.categoryKey ? [parsed.data] : [];
    })
    .sort((left, right) => right.createdAt - left.createdAt);
}

export async function uploadStaffPdfFile(params: {
  actor: StaffActorData;
  categoryKey: StaffPdfFileCategoryKey;
  title: string;
  description: string;
  file: File;
}) {
  const category = getStaffPdfFileCategory(params.categoryKey);
  if (!category || !canAccessStaffPdfFileCategory(params.actor, category)) {
    throw new Error("هذه الفئة غير متاحة لحسابك الحالي.");
  }

  const title = params.title.trim();
  const ownerPersonId = params.actor.personId.trim();
  if (!title) throw new Error("أدخل عنوان الملف.");
  if (!ownerPersonId) throw new Error("يتطلب رفع الملف ربط حسابك بملف موظف.");
  validateStaffPdfFile(params.file);

  const fileRef = doc(collection(db, "orgs", params.actor.orgId, "staffPdfFiles"));
  const safeFileName = safePdfFileName(params.file.name);
  const storagePath = `orgs/${params.actor.orgId}/staff-pdf-files/${ownerPersonId}/${params.categoryKey}/${fileRef.id}/${safeFileName}`;
  const storageRef = ref(storage, storagePath);

  try {
    await uploadBytes(storageRef, params.file, { contentType: "application/pdf" });
  } catch (error) {
    if (isPermissionError(error)) {
      throw new Error("ليس لديك صلاحية لرفع الملفات في المؤسسة الحالية.");
    }
    throw new Error("تعذر رفع ملف PDF. حاول مرة أخرى.");
  }

  const now = Date.now();
  const record = StaffPdfFileSchema.parse({
    id: fileRef.id,
    orgId: params.actor.orgId,
    categoryKey: params.categoryKey,
    ownerPersonId,
    ownerUid: params.actor.uid,
    ownerDisplayName: ownerDisplayName(params.actor),
    ownerSchoolIds: ownerSchoolIds(params.actor),
    ownerOrgUnitIds: [],
    ownerRoleKeys: params.actor.roles,
    ownerOperationalAssignmentIds: uniqueStrings(params.actor.operationalAssignments.map((assignment) => assignment.id)),
    title,
    description: params.description.trim(),
    originalFileName: params.file.name.trim() || safeFileName,
    storagePath,
    contentType: "application/pdf",
    sizeBytes: params.file.size,
    status: "ACTIVE",
    createdAt: now,
    updatedAt: now,
  });

  try {
    await setDoc(fileRef, record);
  } catch (error) {
    try { await deleteObject(storageRef); } catch { /* best-effort upload cleanup */ }
    if (isPermissionError(error)) {
      throw new Error("ليس لديك صلاحية لحفظ بيانات الملف في المؤسسة الحالية.");
    }
    throw new Error("تعذر حفظ بيانات ملف PDF. لم يتم الاحتفاظ بالرفع.");
  }

  return record;
}

async function getStaffPdfBlob(file: StaffPdfFile) {
  try {
    return await getBlob(ref(storage, file.storagePath));
  } catch (error) {
    if (isPermissionError(error)) {
      throw new Error("ليس لديك صلاحية لعرض هذا الملف.");
    }
    throw new Error("تعذر الوصول إلى ملف PDF. حاول مرة أخرى.");
  }
}

export async function viewStaffPdfFile(file: StaffPdfFile) {
  const url = URL.createObjectURL(await getStaffPdfBlob(file));
  window.open(url, "_blank", "noopener,noreferrer");
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export async function downloadStaffPdfFile(file: StaffPdfFile) {
  const url = URL.createObjectURL(await getStaffPdfBlob(file));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = file.originalFileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

export function getStaffPdfFileErrorMessage(error: unknown) {
  if (error instanceof Error && /[\u0600-\u06FF]/.test(error.message)) return error.message;
  return getErrorMessage(error);
}

export function formatStaffPdfFileSize(sizeBytes: number) {
  if (sizeBytes < 1024 * 1024) return `${Math.max(1, Math.round(sizeBytes / 1024))} كيلوبايت`;
  return `${(sizeBytes / (1024 * 1024)).toFixed(1)} ميجابايت`;
}
