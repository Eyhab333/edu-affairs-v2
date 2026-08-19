import {
  getFirestore,
  type DocumentReference,
  type Firestore,
} from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";

type FirestoreData = Record<string, unknown>;

export type GuardianStudentContext = {
  db: Firestore;
  uid: string;
  personId: string;
  orgId: string;
  guardianId: string;
  studentId: string;
};

function readString(data: FirestoreData | undefined, key: string): string {
  const value = data?.[key];
  return typeof value === "string" ? value.trim() : "";
}

function resolveOrgId(ref: DocumentReference): string {
  const orgRef = ref.parent.parent;
  if (!orgRef || orgRef.parent.id !== "orgs") return "";
  return orgRef.id;
}

function isActiveLink(data: FirestoreData, now: number): boolean {
  if (data.active === false || data.isActive === false || data.isArchived === true) {
    return false;
  }
  const status = readString(data, "status");
  if (["INACTIVE", "DELETED", "CANCELLED"].includes(status)) return false;

  const startAt = typeof data.startAt === "number" ? data.startAt : 0;
  const endAt = typeof data.endAt === "number" ? data.endAt : 0;
  return startAt <= now && (endAt <= 0 || endAt >= now);
}

/** Validates both the authenticated guardian and the requested student link. */
export async function assertGuardianStudentAccess(
  uidInput: string | undefined,
  studentIdInput: unknown,
): Promise<GuardianStudentContext> {
  const uid = uidInput?.trim();
  if (!uid) throw new HttpsError("unauthenticated", "Authentication required.");

  const studentId = typeof studentIdInput === "string" ? studentIdInput.trim() : "";
  if (!studentId) throw new HttpsError("invalid-argument", "studentId is required.");

  const db = getFirestore();
  const userSnapshot = await db.doc(`users/${uid}`).get();
  const personId = readString(userSnapshot.data() as FirestoreData | undefined, "personId");
  if (!userSnapshot.exists || !personId) {
    throw new HttpsError("failed-precondition", "Guardian profile is not linked to a person.");
  }

  const guardianSnapshot = await db.collectionGroup("guardians").where("personId", "==", personId).get();
  const now = Date.now();

  for (const guardianDocument of guardianSnapshot.docs) {
    const orgId = resolveOrgId(guardianDocument.ref);
    const guardian = guardianDocument.data() as FirestoreData;
    if (!orgId || guardian.isArchived === true) continue;
    const declaredOrgId = readString(guardian, "orgId");
    if (declaredOrgId && declaredOrgId !== orgId) continue;

    const linkedUids = ["uid", "authUid", "userUid"]
      .map((key) => readString(guardian, key))
      .filter(Boolean);
    if (linkedUids.length > 0 && !linkedUids.includes(uid)) continue;

    const links = await db
      .collection(`orgs/${orgId}/guardianLinks`)
      .where("guardianId", "==", guardianDocument.id)
      .get();

    if (links.docs.some((link) => {
      const data = link.data() as FirestoreData;
      const linkOrgId = readString(data, "orgId");
      const linkUid = readString(data, "guardianUid");
      return readString(data, "studentId") === studentId &&
        (!linkOrgId || linkOrgId === orgId) &&
        (!linkUid || linkUid === uid) &&
        isActiveLink(data, now);
    })) {
      return { db, uid, personId, orgId, guardianId: guardianDocument.id, studentId };
    }
  }

  throw new HttpsError("permission-denied", "Guardian is not linked to this student.");
}
