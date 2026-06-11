"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  MembershipRole,
  MembershipSchema,
  MembershipScopeType,
} from "@takween/contracts";
import { ArrowLeft, Loader2, Plus, ShieldCheck } from "lucide-react";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  setDoc,
} from "firebase/firestore";
import { toast } from "sonner";

import { db } from "@/lib/firebase";
import { useRequireAuth } from "@/hooks/use-require-auth";
import { useDocumentLoader } from "@/hooks/use-document-loader";

import PageHero from "@/components/shared/PageHero";
import FormSection from "@/components/shared/FormSection";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type SchoolTypeValue = "PRIMARY" | "KG";
type SchoolTrackValue = "BOYS" | "GIRLS" | "MIXED";

type SchoolRow = {
  id: string;
  name: string;
  profile?: {
    schoolType?: SchoolTypeValue;
    track?: SchoolTrackValue;
  };
};

type PersonOption = {
  id: string;
  displayName: string;
};

type PageData = {
  person: {
    id: string;
    displayName: string;
  };
  schools: SchoolRow[];
  people: PersonOption[];
};

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "حدث خطأ غير متوقع";
}

function getRoleLabel(role: string) {
  return role;
}

function getScopeTypeLabel(scopeType: string) {
  switch (scopeType) {
    case "ORG":
      return "المؤسسة";
    case "SCHOOL":
      return "المدرسة";
    case "ACADEMIC_YEAR":
      return "السنة الدراسية";
    case "GRADE":
      return "الصف/المستوى";
    case "CLASS":
      return "الفصل";
    case "STREAM":
      return "المسار";
    case "SUBJECT":
      return "المادة";
    case "ROUTE":
      return "المسار/الخط";
    case "COMMITTEE":
      return "اللجنة";
    default:
      return scopeType;
  }
}

function getPersonLabel(person: PersonOption) {
  return person.displayName || person.id;
}

function generateId(prefix: string) {
  return `${prefix}-${Date.now()}`;
}

export default function NewMembershipPage() {
  const router = useRouter();
  const params = useParams<{ orgId: string; personId: string }>();
  const orgId = params.orgId;
  const personId = params.personId;

  const { user, checkingAuth } = useRequireAuth();

  const [roleKey, setRoleKey] = useState("");
  const [title, setTitle] = useState("");
  const [department, setDepartment] = useState("");
  const [scopeType, setScopeType] = useState("ORG");
  const [scopeId, setScopeId] = useState("");
  const [startAt, setStartAt] = useState("");
  const [endAt, setEndAt] = useState("");
  const [isActive, setIsActive] = useState(true);

  const [directEvaluatorPersonId, setDirectEvaluatorPersonId] = useState("");
  const [supervisorPersonId, setSupervisorPersonId] = useState("");
  const [managerPersonId, setManagerPersonId] = useState("");
  const [principalPersonId, setPrincipalPersonId] = useState("");
  const [vicePrincipalPersonId, setVicePrincipalPersonId] = useState("");

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const loadPageData = useCallback(async (): Promise<PageData | null> => {
    const personRef = doc(db, `orgs/${orgId}/people/${personId}`);
    const schoolsRef = collection(db, `orgs/${orgId}/schools`);
    const peopleRef = collection(db, `orgs/${orgId}/people`);

    const [personSnap, schoolsSnap, peopleSnap] = await Promise.all([
      getDoc(personRef),
      getDocs(query(schoolsRef, orderBy("name", "asc"))),
      getDocs(query(peopleRef)),
    ]);

    if (!personSnap.exists()) {
      return null;
    }

    const people = peopleSnap.docs
      .map((item) => {
        const data = item.data() as { displayName?: string };
        return {
          id: item.id,
          displayName: data.displayName ?? item.id,
        };
      })
      .sort((a, b) => a.displayName.localeCompare(b.displayName, "ar"));

    return {
      person: {
        id: personSnap.id,
        displayName:
          (personSnap.data() as { displayName?: string }).displayName ??
          personSnap.id,
      },
      schools: schoolsSnap.docs.map((item) => ({
        id: item.id,
        ...(item.data() as Omit<SchoolRow, "id">),
      })),
      people,
    };
  }, [orgId, personId]);

  const { data, loading, error, notFound } = useDocumentLoader<PageData>({
    enabled: !!user,
    loader: loadPageData,
    deps: [orgId, personId],
  });

  const roleOptions = useMemo(() => [...MembershipRole.options], []);
  const scopeTypeOptions = useMemo(() => [...MembershipScopeType.options], []);

  async function save() {
    setSaving(true);
    setSaveError(null);

    try {
      const nowMs = Date.now();
      const membershipId = generateId("membership");

      const payload = {
        id: membershipId,
        orgId,
        personId,
        role: roleKey || undefined,
        roleKey: roleKey || undefined,
        title: title.trim(),
        department: department.trim(),
        scopes:
          scopeType === "SCHOOL" && scopeId
            ? {
                schoolIds: [scopeId],
              }
            : {},
        permissions: {},
        scopeType,
        scopeId: scopeType === "ORG" ? "" : scopeId.trim(),

        directEvaluatorPersonId: directEvaluatorPersonId || "",
        supervisorPersonId: supervisorPersonId || "",
        managerPersonId: managerPersonId || "",
        principalPersonId: principalPersonId || "",
        vicePrincipalPersonId: vicePrincipalPersonId || "",

        startAt: startAt ? new Date(startAt).getTime() : undefined,
        endAt: endAt ? new Date(endAt).getTime() : undefined,
        isActive,
        createdAt: nowMs,
        updatedAt: nowMs,
      };

      const parsed = MembershipSchema.safeParse(payload);

      if (!parsed.success) {
        throw new Error(
          parsed.error.issues.map((issue) => issue.message).join("\n")
        );
      }

      const ref = doc(db, `orgs/${orgId}/memberships/${membershipId}`);
      await setDoc(ref, parsed.data);

      toast.success("تم إنشاء العضوية بنجاح");
      router.push(`/orgs/${orgId}/people/${personId}`);
      router.refresh();
    } catch (error: unknown) {
      const message = getErrorMessage(error);
      setSaveError(message);
      toast.error("تعذر إنشاء العضوية");
    } finally {
      setSaving(false);
    }
  }

  if (checkingAuth || loading) {
    return (
      <div className="space-y-6">
        <div className="h-24 animate-pulse rounded-3xl bg-muted" />
        <div className="h-[860px] animate-pulse rounded-2xl bg-muted" />
      </div>
    );
  }

  if (notFound) {
    return (
      <PageHero
        badge="إضافة عضوية"
        badgeIcon={<ShieldCheck className="h-3.5 w-3.5" />}
        title="تعذر العثور على الشخص"
        description="قد لا يكون هذا الشخص موجودًا."
        actions={
          <Button asChild variant="outline">
            <Link href={`/orgs/${orgId}/people`}>
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
        badge="إضافة عضوية"
        badgeIcon={<ShieldCheck className="h-3.5 w-3.5" />}
        title="إضافة عضوية تشغيلية"
        description={`الشخص: ${data?.person.displayName ?? ""}`}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline">
              <Link href={`/orgs/${orgId}/people/${personId}`}>
                <ArrowLeft className="h-4 w-4" />
                العودة
              </Link>
            </Button>

            <Button onClick={save} disabled={saving}>
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  جارٍ الحفظ...
                </>
              ) : (
                <>
                  <Plus className="h-4 w-4" />
                  إنشاء العضوية
                </>
              )}
            </Button>
          </div>
        }
      />

      <FormSection
        title="بيانات العضوية"
        description="أدخل الدور والنطاق وحالة التفعيل."
        contentClassName="space-y-4"
      >
        {error || saveError ? (
          <div className="whitespace-pre-line rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error ?? saveError}
          </div>
        ) : null}

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <label className="text-sm font-medium">الدور</label>
            <select
              value={roleKey}
              onChange={(e) => setRoleKey(e.target.value)}
              className="h-10 rounded-xl border bg-background px-3 text-sm outline-none"
            >
              <option value="">اختر</option>
              {roleOptions.map((item) => (
                <option key={item} value={item}>
                  {getRoleLabel(item)}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">المسمى التشغيلي</label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <label className="text-sm font-medium">الإدارة / القسم</label>
            <Input
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">نوع النطاق</label>
            <select
              value={scopeType}
              onChange={(e) => {
                setScopeType(e.target.value);
                if (e.target.value === "ORG") {
                  setScopeId("");
                }
              }}
              className="h-10 rounded-xl border bg-background px-3 text-sm outline-none"
            >
              {scopeTypeOptions.map((item) => (
                <option key={item} value={item}>
                  {getScopeTypeLabel(item)}
                </option>
              ))}
            </select>
          </div>
        </div>

        {scopeType !== "ORG" ? (
          <div className="space-y-2">
            <label className="text-sm font-medium">معرّف النطاق</label>

            {scopeType === "SCHOOL" ? (
              <select
                value={scopeId}
                onChange={(e) => setScopeId(e.target.value)}
                className="h-10 rounded-xl border bg-background px-3 text-sm outline-none"
              >
                <option value="">اختر المدرسة</option>
                {(data?.schools ?? []).map((school) => (
                  <option key={school.id} value={school.id}>
                    {school.name}
                  </option>
                ))}
              </select>
            ) : (
              <Input
                value={scopeId}
                onChange={(e) => setScopeId(e.target.value)}
                placeholder="اكتب scopeId"
              />
            )}
          </div>
        ) : null}

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <label className="text-sm font-medium">بداية العضوية</label>
            <Input
              type="date"
              value={startAt}
              onChange={(e) => setStartAt(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">نهاية العضوية</label>
            <Input
              type="date"
              value={endAt}
              onChange={(e) => setEndAt(e.target.value)}
            />
          </div>
        </div>

        <div className="rounded-2xl border px-4 py-4">
          <label className="flex cursor-pointer items-center justify-between gap-4">
            <div className="text-sm font-medium">العضوية فعّالة</div>
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              className="h-4 w-4 accent-primary"
            />
          </label>
        </div>
      </FormSection>

      <FormSection
        title="علاقات التقييم والإدارة"
        description="املأ هذه الحقول من البداية لتسهيل bootstrap والتوزيع."
        contentClassName="space-y-4"
      >
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <label className="text-sm font-medium">المقيّم المباشر</label>
            <select
              value={directEvaluatorPersonId}
              onChange={(e) => setDirectEvaluatorPersonId(e.target.value)}
              className="h-10 rounded-xl border bg-background px-3 text-sm outline-none"
            >
              <option value="">بدون</option>
              {(data?.people ?? []).map((person) => (
                <option key={person.id} value={person.id}>
                  {getPersonLabel(person)}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">المشرف المباشر</label>
            <select
              value={supervisorPersonId}
              onChange={(e) => setSupervisorPersonId(e.target.value)}
              className="h-10 rounded-xl border bg-background px-3 text-sm outline-none"
            >
              <option value="">بدون</option>
              {(data?.people ?? []).map((person) => (
                <option key={person.id} value={person.id}>
                  {getPersonLabel(person)}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <div className="space-y-2">
            <label className="text-sm font-medium">المدير / المديرة</label>
            <select
              value={managerPersonId}
              onChange={(e) => setManagerPersonId(e.target.value)}
              className="h-10 rounded-xl border bg-background px-3 text-sm outline-none"
            >
              <option value="">بدون</option>
              {(data?.people ?? []).map((person) => (
                <option key={person.id} value={person.id}>
                  {getPersonLabel(person)}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">قائد/ة المدرسة</label>
            <select
              value={principalPersonId}
              onChange={(e) => setPrincipalPersonId(e.target.value)}
              className="h-10 rounded-xl border bg-background px-3 text-sm outline-none"
            >
              <option value="">بدون</option>
              {(data?.people ?? []).map((person) => (
                <option key={person.id} value={person.id}>
                  {getPersonLabel(person)}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">الوكيل/ة</label>
            <select
              value={vicePrincipalPersonId}
              onChange={(e) => setVicePrincipalPersonId(e.target.value)}
              className="h-10 rounded-xl border bg-background px-3 text-sm outline-none"
            >
              <option value="">بدون</option>
              {(data?.people ?? []).map((person) => (
                <option key={person.id} value={person.id}>
                  {getPersonLabel(person)}
                </option>
              ))}
            </select>
          </div>
        </div>
      </FormSection>
    </div>
  );
}