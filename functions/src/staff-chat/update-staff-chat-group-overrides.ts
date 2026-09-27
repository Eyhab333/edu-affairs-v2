import { getFirestore } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";

import {
  canManageOrg,
  ensureStaffChatGroupDefinitions,
  getActiveMembership,
  readRequiredString,
  validateOverrideUids,
} from "./shared";

const REGION = "me-central2";

export const updateStaffChatGroupOverrides = onCall(
  { region: REGION },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError("unauthenticated", "You must be signed in.");
    }

    const input = (request.data ?? {}) as Record<string, unknown>;
    const orgId = readRequiredString(input.orgId, "orgId");
    const groupId = readRequiredString(input.groupId, "groupId");
    const manualIncludedUids = validateOverrideUids(
      input.manualIncludedUids,
      "manualIncludedUids",
    );
    const manualExcludedUids = validateOverrideUids(
      input.manualExcludedUids,
      "manualExcludedUids",
    );

    if (manualIncludedUids.some((item) => manualExcludedUids.includes(item))) {
      throw new HttpsError(
        "invalid-argument",
        "A UID cannot be both manually included and manually excluded.",
      );
    }

    const db = getFirestore();
    const membership = await getActiveMembership({ db, orgId, uid });
    if (!canManageOrg(membership)) {
      throw new HttpsError(
        "permission-denied",
        "Organization management permission is required.",
      );
    }

    await ensureStaffChatGroupDefinitions({ db, orgId });
    const groupRef = db.doc(`orgs/${orgId}/staffChatGroups/${groupId}`);
    const groupSnapshot = await groupRef.get();
    if (!groupSnapshot.exists) {
      throw new HttpsError("not-found", "Staff chat group not found.");
    }

    await groupRef.update({
      manualIncludedUids,
      manualExcludedUids,
      updatedAt: Date.now(),
    });

    return { ok: true, groupId, manualIncludedUids, manualExcludedUids };
  },
);
