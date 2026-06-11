import { collection, doc, getDoc, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";

export type UserOrgMembership = {
  orgId: string;
  role?: string;
  isActive?: boolean;
};

export type OrgRecord = {
  id: string;
  role?: string;
  nameAr?: string;
  nameEn?: string;
  shortName?: string;
  status?: string;
  [key: string]: unknown;
};

const LEGACY_ORG_ID_STORAGE_KEY = "orgId";

function getOrgStorageKey(uid: string) {
  return `orgId:${uid}`;
}

export function getOrgId(uid?: string): string | null {
  if (typeof window === "undefined") return null;

  if (uid) {
    const scopedValue = localStorage.getItem(getOrgStorageKey(uid));
    if (scopedValue) return scopedValue;
  }

  return localStorage.getItem(LEGACY_ORG_ID_STORAGE_KEY);
}

export function setOrgId(uid: string, orgId: string): void {
  if (typeof window === "undefined") return;

  localStorage.setItem(getOrgStorageKey(uid), orgId);
  localStorage.removeItem(LEGACY_ORG_ID_STORAGE_KEY);
}

export function clearOrgId(uid?: string): void {
  if (typeof window === "undefined") return;

  if (uid) {
    localStorage.removeItem(getOrgStorageKey(uid));
  }

  localStorage.removeItem(LEGACY_ORG_ID_STORAGE_KEY);
}

function resolveMembershipIsActive(data: {
  isActive?: boolean;
  active?: boolean;
}) {
  if (typeof data.isActive === "boolean") return data.isActive;
  if (typeof data.active === "boolean") return data.active;
  return true;
}

export async function getUserOrgMemberships(
  uid: string
): Promise<UserOrgMembership[]> {
  if (!uid) return [];

  const membershipsRef = collection(db, "users", uid, "orgMemberships");
  const snap = await getDocs(membershipsRef);

  return snap.docs
    .map((d) => {
      const data = d.data() as Omit<UserOrgMembership, "orgId"> & {
        orgId?: string;
        active?: boolean;
      };

      return {
        orgId: data.orgId || d.id,
        role: data.role,
        isActive: resolveMembershipIsActive(data),
      };
    })
    .filter((membership) => !!membership.orgId && membership.isActive !== false);
}

export async function getAvailableOrgsForUser(
  uid: string
): Promise<OrgRecord[]> {
  const memberships = await getUserOrgMemberships(uid);

  const orgsRaw = await Promise.all(
    memberships.map(async (membership) => {
      try {
        const orgRef = doc(db, "orgs", membership.orgId);
        const orgSnap = await getDoc(orgRef);

        if (!orgSnap.exists()) return null;

        return {
          id: orgSnap.id,
          ...orgSnap.data(),
          role: membership.role,
        } as OrgRecord;
      } catch (error) {
        console.error(`Failed to load org ${membership.orgId}`, error);
        return null;
      }
    })
  );

  const orgs = orgsRaw.filter((org): org is OrgRecord => org !== null);

  return orgs.sort((a, b) => {
    const aName = a.nameAr ?? a.shortName ?? a.nameEn ?? a.id;
    const bName = b.nameAr ?? b.shortName ?? b.nameEn ?? b.id;
    return aName.localeCompare(bName, "ar");
  });
}

export async function ensureSelectedOrgId(uid: string): Promise<string | null> {
  const memberships = await getUserOrgMemberships(uid);

  if (!memberships.length) {
    clearOrgId(uid);
    return null;
  }

  const storedOrgId = getOrgId(uid);
  const allowedOrgIds = new Set(
    memberships.map((membership) => membership.orgId)
  );

  if (storedOrgId && allowedOrgIds.has(storedOrgId)) {
    setOrgId(uid, storedOrgId);
    return storedOrgId;
  }

  const nextOrgId = memberships[0].orgId;
  setOrgId(uid, nextOrgId);
  return nextOrgId;
}