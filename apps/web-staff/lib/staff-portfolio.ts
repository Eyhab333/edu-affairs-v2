import { httpsCallable } from "firebase/functions";
import { ref, uploadBytes } from "firebase/storage";
import {
  StaffPortfolioItemSchema,
  type StaffPortfolioItem,
  type StaffPortfolioItemKind,
  type StaffPortfolioListFilters,
} from "@takween/contracts";
import {
  canReviewStaffPortfolio,
  isStaffPortfolioTeacherRole,
} from "@takween/domain";

import { functions, storage } from "@/lib/firebase";
import type { StaffActorData } from "@/lib/staff-actor";

const MAX_PDF_BYTES = 25 * 1024 * 1024;

function parseItems(items: unknown[]): StaffPortfolioItem[] {
  return items.flatMap((item) => {
    const parsed = StaffPortfolioItemSchema.safeParse(item);
    return parsed.success ? [parsed.data] : [];
  });
}

export function canUseMyStaffPortfolio(actor: StaffActorData) {
  return actor.roles.some(isStaffPortfolioTeacherRole);
}

export function canReviewTeacherPortfolios(actor: StaffActorData) {
  return canReviewStaffPortfolio(actor.roles);
}

export function validatePortfolioPdf(file: File) {
  if (file.type !== "application/pdf" || !file.name.toLowerCase().endsWith(".pdf")) {
    throw new Error("يُسمح برفع ملفات PDF فقط.");
  }
  if (file.size <= 0 || file.size > MAX_PDF_BYTES) {
    throw new Error("الحد الأقصى لحجم الملف هو 25 ميجابايت.");
  }
}

export async function listMyStaffPortfolioItems(actor: StaffActorData) {
  const callable = httpsCallable<{ orgId: string }, StaffPortfolioItem[]>(functions, "listMyStaffPortfolioItems");
  const result = await callable({ orgId: actor.orgId });
  return parseItems(result.data);
}

export async function listTeacherPortfolioItems(params: { actor: StaffActorData; filters: StaffPortfolioListFilters }) {
  const callable = httpsCallable<{ orgId: string; filters: StaffPortfolioListFilters }, StaffPortfolioItem[]>(functions, "listTeacherPortfolioItems");
  const result = await callable({ orgId: params.actor.orgId, filters: params.filters });
  return parseItems(result.data);
}

export async function submitStaffPortfolioItem(params: {
  actor: StaffActorData;
  kind: StaffPortfolioItemKind;
  title: string;
  description: string;
  occurredAt: number;
  academicYearId: string;
  termId: string;
  providerName: string;
  trainingHours?: number;
  file: File;
}) {
  validatePortfolioPdf(params.file);
  const begin = httpsCallable<Record<string, unknown>, StaffPortfolioItem>(functions, "beginStaffPortfolioItem");
  const started = await begin({
    orgId: params.actor.orgId,
    kind: params.kind,
    title: params.title.trim(),
    description: params.description.trim(),
    occurredAt: params.occurredAt,
    academicYearId: params.academicYearId,
    termId: params.termId,
    providerName: params.providerName.trim(),
    trainingHours: params.trainingHours,
    originalName: params.file.name,
    sizeBytes: params.file.size,
  });
  const item = StaffPortfolioItemSchema.parse(started.data);
  await uploadBytes(ref(storage, item.file.storagePath), params.file, { contentType: "application/pdf" });
  const complete = httpsCallable<{ orgId: string; itemId: string }, void>(functions, "completeStaffPortfolioUpload");
  await complete({ orgId: params.actor.orgId, itemId: item.id });
  return item;
}

export async function archiveStaffPortfolioItem(actor: StaffActorData, itemId: string) {
  const callable = httpsCallable<{ orgId: string; itemId: string }, void>(functions, "archiveStaffPortfolioItem");
  await callable({ orgId: actor.orgId, itemId });
}

export async function getStaffPortfolioFileUrl(actor: StaffActorData, itemId: string) {
  const callable = httpsCallable<{ orgId: string; itemId: string }, { url: string; originalName: string }>(functions, "getStaffPortfolioFileUrl");
  return (await callable({ orgId: actor.orgId, itemId })).data;
}
