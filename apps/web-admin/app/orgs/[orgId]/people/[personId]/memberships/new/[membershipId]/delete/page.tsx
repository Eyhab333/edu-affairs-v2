"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { AlertTriangle, ArrowLeft, Loader2, Trash2 } from "lucide-react";
import { deleteDoc, doc, getDoc } from "firebase/firestore";
import { toast } from "sonner";

import { db } from "@/lib/firebase";
import { useRequireAuth } from "@/hooks/use-require-auth";
import { useDocumentLoader } from "@/hooks/use-document-loader";

import PageHero from "@/components/shared/PageHero";
import FormSection from "@/components/shared/FormSection";
import { Button } from "@/components/ui/button";

type PageData = {
  person: {
    id: string;
    displayName: string;
  };
  membership: {
    id: string;
    role?: string;
    roleKey?: string;
    title?: string;
  };
};

function getRoleLabel(role: string) {
  return role || "بدون دور";
}

export default function DeleteMembershipPage() {
  const router = useRouter();
  const params = useParams<{ orgId: string; personId: string; membershipId: string }>();
  const orgId = params.orgId;
  const personId = params.personId;
  const membershipId = params.membershipId;

  const { user, checkingAuth } = useRequireAuth();

  const [deleting, setDeleting] = useState(false);

  const loadPageData = useCallback(async (): Promise<PageData | null> => {
    const personRef = doc(db, `orgs/${orgId}/people/${personId}`);
    const membershipRef = doc(db, `orgs/${orgId}/memberships/${membershipId}`);

    const [personSnap, membershipSnap] = await Promise.all([
      getDoc(personRef),
      getDoc(membershipRef),
    ]);

    if (!personSnap.exists() || !membershipSnap.exists()) {
      return null;
    }

    const membership = membershipSnap.data() as {
      personId?: string;
      role?: string;
      roleKey?: string;
      title?: string;
    };

    if (membership.personId !== personId) {
      return null;
    }

    return {
      person: {
        id: personSnap.id,
        displayName:
          (personSnap.data() as { displayName?: string }).displayName ?? personSnap.id,
      },
      membership: {
        id: membershipSnap.id,
        ...membership,
      },
    };
  }, [orgId, personId, membershipId]);

  const { data, loading, error, notFound } = useDocumentLoader<PageData>({
    enabled: !!user,
    loader: loadPageData,
    deps: [orgId, personId, membershipId],
  });

  useEffect(() => {
    if (error) {
      toast.error("تعذر تحميل صفحة الحذف");
    }
  }, [error]);

  async function handleDelete() {
    setDeleting(true);

    try {
      const ref = doc(db, `orgs/${orgId}/memberships/${membershipId}`);
      await deleteDoc(ref);

      toast.success("تم حذف العضوية بنجاح");
      router.push(`/orgs/${orgId}/people/${personId}`);
      router.refresh();
    } catch {
      toast.error("تعذر حذف العضوية");
    } finally {
      setDeleting(false);
    }
  }

  if (checkingAuth || loading) {
    return (
      <div className="space-y-6">
        <div className="h-24 animate-pulse rounded-3xl bg-muted" />
        <div className="h-[320px] animate-pulse rounded-2xl bg-muted" />
      </div>
    );
  }

  if (notFound) {
    return (
      <PageHero
        badge="حذف عضوية"
        badgeIcon={<Trash2 className="h-3.5 w-3.5" />}
        title="تعذر العثور على العضوية"
        description="قد تكون العضوية غير موجودة أو لا تتبع هذا الشخص."
        actions={
          <Button asChild variant="outline">
            <Link href={`/orgs/${orgId}/people/${personId}`}>
              <ArrowLeft className="h-4 w-4" />
              العودة
            </Link>
          </Button>
        }
      />
    );
  }

  return (
    <div className="space-y-6">
      <PageHero
        badge="حذف عضوية"
        badgeIcon={<Trash2 className="h-3.5 w-3.5" />}
        title="تأكيد حذف العضوية"
        description={`الشخص: ${data?.person.displayName ?? ""}`}
        actions={
          <Button asChild variant="outline">
            <Link href={`/orgs/${orgId}/people/${personId}`}>
              <ArrowLeft className="h-4 w-4" />
              العودة
            </Link>
          </Button>
        }
      />

      <FormSection
        title="تحذير"
        description="سيتم حذف هذه العضوية نهائيًا من المؤسسة."
        contentClassName="space-y-4"
      >
        <div className="rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-4 text-sm text-destructive">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4" />
            <div>
              هذا الإجراء نهائي. إذا كنت تريد فقط إيقاف العضوية، فالأفضل العودة
              إلى صفحة التعديل وتعطيلها بدل حذفها.
            </div>
          </div>
        </div>

        <div className="rounded-2xl border bg-card px-4 py-4 text-sm">
          <div className="font-medium">
            {getRoleLabel(String(data?.membership.roleKey || data?.membership.role || ""))}
          </div>
          <div className="mt-1 text-muted-foreground">
            {data?.membership.title || "بدون مسمى إضافي"}
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            variant="destructive"
            onClick={handleDelete}
            disabled={deleting}
          >
            {deleting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                جارٍ الحذف...
              </>
            ) : (
              <>
                <Trash2 className="h-4 w-4" />
                تأكيد الحذف
              </>
            )}
          </Button>

          <Button asChild variant="outline">
            <Link href={`/orgs/${orgId}/people/${personId}`}>
              إلغاء
            </Link>
          </Button>
        </div>
      </FormSection>
    </div>
  );
}