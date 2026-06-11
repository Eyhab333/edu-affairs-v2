"use client";

import { useCallback } from "react";
import { doc, getDoc } from "firebase/firestore";

import { db } from "@/lib/firebase";
import { useDocumentLoader } from "@/hooks/use-document-loader";

export type OrgSummary = {
  id: string;
  nameAr?: string;
  nameEn?: string;
  shortName?: string;
  status?: string;
};

export function getOrgDisplayName(org: OrgSummary | null | undefined, fallback: string) {
  return org?.nameAr ?? org?.shortName ?? org?.nameEn ?? fallback;
}

export function useOrgSummary(orgId: string, enabled = true) {
  const loadOrg = useCallback(async (): Promise<OrgSummary | null> => {
    const ref = doc(db, `orgs/${orgId}`);
    const snap = await getDoc(ref);

    if (!snap.exists()) {
      return null;
    }

    return {
      id: snap.id,
      ...(snap.data() as Omit<OrgSummary, "id">),
    };
  }, [orgId]);

  return useDocumentLoader<OrgSummary>({
    enabled,
    loader: loadOrg,
    deps: [orgId],
  });
}