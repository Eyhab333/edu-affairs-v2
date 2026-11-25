import { httpsCallable } from "firebase/functions";
import {
  SchoolAnnouncementSchema,
  type SchoolAnnouncement,
  type SchoolAnnouncementStatus,
} from "@takween/contracts";

import { functions } from "@/lib/firebase";

type SchoolOption = { id: string; name: string };
export type AnnouncementAudienceOptions = {
  grades: Array<{ id: string; name: string }>;
  classes: Array<{ id: string; label: string; gradeId: string }>;
  students: Array<{ id: string; name: string; classId: string; gradeId: string }>;
  nextCursor: string | null;
};

export type SchoolAnnouncementDraftInput = {
  title: string;
  content: string;
  priority: "NORMAL" | "IMPORTANT" | "URGENT";
  imageUrl?: string;
  attachments: Array<{
    title: string;
    url: string;
    contentType?: string;
    sizeBytes?: number;
  }>;
  audience: {
    scope: "SCHOOL" | "GRADES" | "CLASSES" | "STUDENTS";
    schoolIds?: string[];
    gradeIds: string[];
    classIds: string[];
    studentIds: string[];
  };
  publicationStartsAt?: number;
  publicationEndsAt?: number;
  academicYearId?: string;
  termId?: string;
};

const callable = httpsCallable<Record<string, unknown>, unknown>(
  functions,
  "staffSchoolAnnouncements",
);

async function call<T>(input: Record<string, unknown>) {
  return (await callable(input)).data as T;
}

function parseAnnouncement(value: unknown) {
  const parsed = SchoolAnnouncementSchema.safeParse(value);
  if (!parsed.success) throw new Error("تعذر قراءة استجابة الإعلان. تحقق من تحديث خدمة الإعلانات.");
  return parsed.data;
}

export async function listAnnouncementSchools(orgId: string) {
  const response = await call<{ schools?: unknown[] }>({ action: "listSchools", orgId });
  return Array.isArray(response.schools)
    ? response.schools.flatMap((item) => {
        const value = item as Partial<SchoolOption>;
        return typeof value.id === "string" && typeof value.name === "string"
          ? [{ id: value.id, name: value.name }]
          : [];
      })
    : [];
}

export async function listSchoolAnnouncements(params: {
  orgId: string;
  schoolId?: string;
  status?: SchoolAnnouncementStatus | "";
}) {
  const response = await call<{ items?: unknown[] }>({ action: "list", ...params });
  return Array.isArray(response.items)
    ? response.items.flatMap((item) => {
        try {
          return [parseAnnouncement(item)];
        } catch {
          return [];
        }
      })
    : [];
}

export async function getAnnouncementAudienceOptions(params: {
  orgId: string;
  schoolIds: string[];
}): Promise<AnnouncementAudienceOptions> {
  const response = await call<Partial<AnnouncementAudienceOptions>>({
    action: "audienceOptions",
    ...params,
  });
  return {
    grades: Array.isArray(response.grades) ? response.grades : [],
    classes: Array.isArray(response.classes) ? response.classes : [],
    students: Array.isArray(response.students) ? response.students : [],
    nextCursor: typeof response.nextCursor === "string" ? response.nextCursor : null,
  };
}

export async function createSchoolAnnouncement(params: {
  orgId: string;
  item: SchoolAnnouncementDraftInput;
}) {
  const response = await call<{ item: unknown }>({ action: "create", ...params });
  return parseAnnouncement(response.item);
}

export async function updateSchoolAnnouncement(params: {
  orgId: string;
  announcementId: string;
  item: SchoolAnnouncementDraftInput;
}) {
  const response = await call<{ item: unknown }>({ action: "update", ...params });
  return parseAnnouncement(response.item);
}

export async function publishSchoolAnnouncement(params: {
  orgId: string;
  announcementId: string;
}) {
  const response = await call<{ item: unknown }>({ action: "publish", ...params });
  return parseAnnouncement(response.item);
}

export async function archiveSchoolAnnouncement(params: {
  orgId: string;
  announcementId: string;
}) {
  const response = await call<{ item: unknown }>({ action: "archive", ...params });
  return parseAnnouncement(response.item);
}

export type { SchoolAnnouncement };
