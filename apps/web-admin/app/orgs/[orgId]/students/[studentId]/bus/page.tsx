"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";

export default function StudentBusPage() {
  const router = useRouter();
  const params = useParams<{ orgId: string; studentId: string }>();

  useEffect(() => {
    router.replace(
      `/orgs/${params.orgId}/students/${params.studentId}/transport`
    );
  }, [router, params.orgId, params.studentId]);

  return null;
}