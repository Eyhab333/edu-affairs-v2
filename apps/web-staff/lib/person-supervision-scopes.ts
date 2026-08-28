import { collection, getDocs, query, where } from "firebase/firestore";
import { PersonSupervisionScopeSchema, type PersonSupervisionScope } from "@takween/contracts";

import { db } from "@/lib/firebase";

export async function loadPersonSupervisionScopes(params: {
  orgId: string;
  personId: string;
}) {
  if (!params.orgId || !params.personId) return [] as PersonSupervisionScope[];

  const snapshot = await getDocs(
    query(
      collection(db, "orgs", params.orgId, "personSupervisionScopes"),
      where("personId", "==", params.personId),
    ),
  );

  return snapshot.docs.flatMap((document) => {
    const parsed = PersonSupervisionScopeSchema.safeParse({
      id: document.id,
      ...document.data(),
    });
    return parsed.success ? [parsed.data] : [];
  });
}
