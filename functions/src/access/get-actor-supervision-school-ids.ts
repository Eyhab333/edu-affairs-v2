import { getFirestore } from "firebase-admin/firestore";

import {
  PersonSupervisionScopeSchema,
  type PersonSupervisionScope,
} from "@takween/contracts";
import { getPersonSupervisionSchoolIds } from "@takween/domain";

export async function getActorSupervisionSchoolIds(params: {
  orgId: string;
  personId: string;
}) {
  const snapshot = await getFirestore()
    .collection(`orgs/${params.orgId}/personSupervisionScopes`)
    .where("personId", "==", params.personId)
    .get();

  const scopes = snapshot.docs.flatMap((document) => {
    const parsed = PersonSupervisionScopeSchema.safeParse({
      id: document.id,
      ...document.data(),
    });

    return parsed.success ? [parsed.data] : [];
  }) as PersonSupervisionScope[];

  return getPersonSupervisionSchoolIds({
    scopes,
    orgId: params.orgId,
    personId: params.personId,
    capability: "TEACHER_WORK_VIEW",
  });
}
