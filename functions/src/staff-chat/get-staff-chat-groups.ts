import { getFirestore } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";

import {
  type FirestoreRecord,
  STAFF_CHAT_GROUP_DEFINITIONS,
  ensureStaffChatGroupDefinitions,
  getActiveMembership,
  matchesStaffChatGroup,
  readRequiredString,
} from "./shared";

const REGION = "me-central2";

export const getStaffChatGroups = onCall(
  { region: REGION },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError("unauthenticated", "You must be signed in.");
    }

    const input = (request.data ?? {}) as Record<string, unknown>;
    const orgId = readRequiredString(input.orgId, "orgId");
    const db = getFirestore();
    const membership = await getActiveMembership({ db, orgId, uid });

    // The definitions are server-owned and idempotently materialized only
    // when an organization first opens this feature.
    await ensureStaffChatGroupDefinitions({ db, orgId });

    const snapshots = await db.getAll(
      ...STAFF_CHAT_GROUP_DEFINITIONS.map(({ id }) =>
        db.doc(`orgs/${orgId}/staffChatGroups/${id}`),
      ),
    );

    return {
      groups: snapshots
        .filter((snapshot) => snapshot.exists)
        .map(
          (snapshot) =>
            ({ id: snapshot.id, ...(snapshot.data() ?? {}) }) as FirestoreRecord,
        )
        .filter((group) => matchesStaffChatGroup({ uid, membership, group })),
    };
  },
);
