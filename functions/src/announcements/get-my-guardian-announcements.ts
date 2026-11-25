import { getFirestore } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { SchoolAnnouncementSchema, isSchoolAnnouncementVisibleAt } from "@takween/contracts";
import { getMyGuardianChildren } from "../guardian/get-my-guardian-children";

export const getMyGuardianAnnouncements = onCall(
  { region: "me-central2", cors: true, memory: "512MiB", minInstances: 0 },
  async (request) => {
    if (!request.auth?.uid) throw new HttpsError("unauthenticated", "Authentication required.");
    // The existing resolver derives both guardian links and active enrollments
    // from the authenticated identity; no client-provided scope is accepted.
    const { children } = await getMyGuardianChildren.run(request);
    const activeChildren = children.filter((child) => child.orgId && child.schoolId);
    const orgIds = [...new Set(activeChildren.map((child) => child.orgId))];
    const db = getFirestore();
    const snapshots = await Promise.all(orgIds.map((orgId) =>
      db.collection(`orgs/${orgId}/schoolAnnouncements`).where("status", "==", "PUBLISHED").get(),
    ));
    const now = Date.now();
    const items = snapshots.flatMap((snapshot, index) => snapshot.docs.flatMap((doc) => {
      const parsed = SchoolAnnouncementSchema.safeParse({ ...doc.data(), id: doc.id });
      if (!parsed.success) return [];
      const item = parsed.data;
      if (item.orgId !== orgIds[index] || !isSchoolAnnouncementVisibleAt(item, now)) return [];
      const schoolIds = item.audience.schoolIds.length ? item.audience.schoolIds : [item.schoolId];
      const matches = activeChildren.filter((child) => {
        if (child.orgId !== item.orgId || !schoolIds.includes(child.schoolId)) return false;
        if (item.academicYearId && child.academicYearId !== item.academicYearId) return false;
        switch (item.audience.scope) {
          case "SCHOOL": return true;
          case "GRADES": return item.audience.gradeIds.includes(child.gradeId);
          case "CLASSES": return item.audience.classIds.includes(child.classId);
          case "STUDENTS": return item.audience.studentIds.includes(child.studentId);
        }
      });
      if (!matches.length) return [];
      return [{
        id: item.id, title: item.title, content: item.content, priority: item.priority,
        imageUrl: item.imageUrl ?? "", attachments: item.attachments,
        publishedAt: item.publishedAt ?? item.createdAt,
        schoolNames: [...new Set(matches.map((child) => child.schoolName).filter(Boolean))],
        children: [...new Set(matches.map((child) => child.studentName).filter(Boolean))],
      }];
    }));
    items.sort((a, b) => b.publishedAt - a.publishedAt);
    return { items };
  },
);
