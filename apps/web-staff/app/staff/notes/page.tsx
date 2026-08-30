"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  CheckCircle2,
  Clock3,
  Eye,
  FileText,
  Loader2,
  MessageSquare,
  School,
  Search,
  Tag,
  Users,
} from "lucide-react";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
} from "firebase/firestore";

import type {
  Class as SchoolClass,
  Person,
  Student,
  StudentNote,
} from "@takween/contracts";
import { calculateStudentNotesSummary } from "@takween/domain";

import { useStaffActor } from "@/components/staff/staff-actor-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { db } from "@/lib/firebase";
import { getVisibleStudents } from "@/lib/visible-students";

type LoadState = {
  loading: boolean;
  error: string | null;
};

type NoteStatusFilter = "ALL" | StudentNote["status"];
type NotePriorityFilter = "ALL" | StudentNote["priority"];
type NoteCategoryFilter = "ALL" | StudentNote["category"];

type BadgeVariant = "default" | "secondary" | "destructive" | "outline";

type StudentNoteRow = StudentNote & {
  studentDisplayName: string;
};

const STATUS_OPTIONS: Array<{
  value: NoteStatusFilter;
  label: string;
}> = [
  { value: "ALL", label: "كل الحالات" },
  { value: "ACTIVE", label: "نشطة" },
  { value: "NEEDS_FOLLOW_UP", label: "تحتاج متابعة" },
  { value: "RESOLVED", label: "محلولة" },
  { value: "ARCHIVED", label: "مؤرشفة" },
  { value: "CANCELLED", label: "ملغاة" },
];

const PRIORITY_OPTIONS: Array<{
  value: NotePriorityFilter;
  label: string;
}> = [
  { value: "ALL", label: "كل الأولويات" },
  { value: "INFO", label: "معلومة" },
  { value: "FOLLOW_UP", label: "تحتاج متابعة" },
  { value: "IMPORTANT", label: "مهمة" },
  { value: "URGENT", label: "عاجلة" },
];

const CATEGORY_OPTIONS: Array<{
  value: NoteCategoryFilter;
  label: string;
}> = [
  { value: "ALL", label: "كل التصنيفات" },
  { value: "GENERAL", label: "عامة" },
  { value: "EDUCATIONAL", label: "تعليمية" },
  { value: "BEHAVIORAL", label: "سلوكية" },
  { value: "ADMINISTRATIVE", label: "إدارية" },
  { value: "ATTENDANCE", label: "حضور" },
  { value: "TRANSPORT", label: "نقل" },
  { value: "GUARDIAN_COMMUNICATION", label: "تواصل ولي أمر" },
  { value: "LEARNING_LOSS", label: "فاقد تعليمي" },
  { value: "POSITIVE", label: "إيجابية / تحفيزية" },
  { value: "CARE", label: "رعائية" },
  { value: "FOLLOW_UP", label: "متابعة" },
  { value: "CUSTOM", label: "مخصصة" },
];

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "حدث خطأ غير متوقع";
}

function formatDateTime(value?: number) {
  if (!value) return "غير محدد";

  return new Intl.DateTimeFormat("ar-SA", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function getStatusLabel(status: StudentNote["status"]) {
  switch (status) {
    case "ACTIVE":
      return "نشطة";
    case "NEEDS_FOLLOW_UP":
      return "تحتاج متابعة";
    case "RESOLVED":
      return "محلولة";
    case "ARCHIVED":
      return "مؤرشفة";
    case "CANCELLED":
      return "ملغاة";
    default:
      return status;
  }
}

function getStatusVariant(status: StudentNote["status"]): BadgeVariant {
  if (status === "ACTIVE") return "default";
  if (status === "NEEDS_FOLLOW_UP") return "secondary";
  if (status === "RESOLVED") return "outline";
  if (status === "CANCELLED") return "destructive";
  return "outline";
}

function getPriorityLabel(priority: StudentNote["priority"]) {
  switch (priority) {
    case "INFO":
      return "معلومة";
    case "FOLLOW_UP":
      return "متابعة";
    case "IMPORTANT":
      return "مهمة";
    case "URGENT":
      return "عاجلة";
    default:
      return priority;
  }
}

function getPriorityVariant(priority: StudentNote["priority"]): BadgeVariant {
  if (priority === "URGENT") return "destructive";
  if (priority === "IMPORTANT") return "secondary";
  if (priority === "FOLLOW_UP") return "outline";
  return "default";
}

function getCategoryLabel(category: StudentNote["category"]) {
  return (
    CATEGORY_OPTIONS.find((item) => item.value === category)?.label ?? category
  );
}

function getVisibilityLabel(visibility: StudentNote["visibility"]) {
  switch (visibility) {
    case "PRIVATE_TO_AUTHOR":
      return "خاص بالكاتب";
    case "STAFF_ONLY":
      return "الطاقم الداخلي";
    case "STAFF_INTERNAL":
      return "داخلي للطاقم";
    case "SCHOOL_LEADERSHIP":
      return "قيادة المدرسة";
    case "ADMIN_ONLY":
      return "الإدارة فقط";
    case "STUDENT_SUPPORT_TEAM":
      return "فريق الدعم الطلابي";
    case "TRANSPORT_TEAM":
      return "فريق النقل";
    case "GUARDIAN_VISIBLE":
      return "ظاهر لولي الأمر لاحقًا";
    case "PARENT_VISIBLE":
      return "ولي الأمر";
    default:
      return visibility;
  }
}

function getClassMap(classes: SchoolClass[]) {
  return new Map(classes.map((item) => [item.id, item]));
}

function getClassLabel(classMap: Map<string, SchoolClass>, classId: string) {
  const classInfo = classMap.get(classId);
  return classInfo?.title || classInfo?.code || classId || "غير محدد";
}

function isNoteVisibleToActor(note: StudentNote, visibleClassIds: Set<string>) {
  if (!note.classId) return true;
  return visibleClassIds.has(note.classId);
}

async function loadPersonName(params: {
  orgId: string;
  personId: string;
}): Promise<string> {
  if (!params.personId) return "";

  try {
    const personRef = doc(db, "orgs", params.orgId, "people", params.personId);

    const personSnap = await getDoc(personRef);

    if (!personSnap.exists()) return "";

    const person = {
      id: personSnap.id,
      ...(personSnap.data() as Omit<Person, "id">),
    };

    return person.displayName || "";
  } catch (error) {
    console.warn("Failed to load person name", error);
    return "";
  }
}

async function loadStudentDisplayName(params: {
  orgId: string;
  studentId: string;
}): Promise<string> {
  const roster = await getVisibleStudents({ orgId: params.orgId });

  return (
    roster.rows.find((row) => row.studentId === params.studentId)?.displayName ||
    params.studentId
  );
}

async function attachStudentNames(params: {
  orgId: string;
  notes: StudentNote[];
}): Promise<StudentNoteRow[]> {
  const uniqueStudentIds = Array.from(
    new Set(params.notes.map((note) => note.studentId).filter(Boolean)),
  );

  const namePairs = await Promise.all(
    uniqueStudentIds.map(async (studentId) => {
      const displayName = await loadStudentDisplayName({
        orgId: params.orgId,
        studentId,
      });

      return [studentId, displayName] as const;
    }),
  );

  const nameByStudentId = new Map(namePairs);

  return params.notes.map((note) => ({
    ...note,
    studentDisplayName: nameByStudentId.get(note.studentId) ?? note.studentId,
  }));
}

function SummaryCard({
  title,
  value,
  description,
  icon,
}: {
  title: string;
  value: number;
  description?: string;
  icon?: React.ReactNode;
}) {
  return (
    <Card>
      <CardContent className="flex items-center justify-between gap-3 p-4">
        <div>
          <p className="text-xs text-muted-foreground">{title}</p>
          <p className="mt-1 text-2xl font-bold">{value}</p>
          {description ? (
            <p className="mt-1 text-xs text-muted-foreground">{description}</p>
          ) : null}
        </div>

        {icon ? (
          <div className="flex size-10 items-center justify-center rounded-2xl bg-accent text-accent-foreground">
            {icon}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

export default function StaffNotesCenterPage() {
  const { actor } = useStaffActor();

  const [notes, setNotes] = useState<StudentNoteRow[]>([]);
  const [statusFilter, setStatusFilter] = useState<NoteStatusFilter>("ALL");
  const [priorityFilter, setPriorityFilter] =
    useState<NotePriorityFilter>("ALL");
  const [categoryFilter, setCategoryFilter] =
    useState<NoteCategoryFilter>("ALL");
  const [searchText, setSearchText] = useState("");

  const [loadState, setLoadState] = useState<LoadState>({
    loading: true,
    error: null,
  });

  const visibleClassIds = useMemo(() => {
    return new Set(actor.visibleClasses.map((item) => item.id));
  }, [actor.visibleClasses]);

  const classMap = useMemo(() => {
    return getClassMap(actor.visibleClasses);
  }, [actor.visibleClasses]);

  const loadNotes = useCallback(async () => {
    setLoadState({
      loading: true,
      error: null,
    });

    try {
      const notesRef = collection(db, "orgs", actor.orgId, "studentNotes");

      const snap = await getDocs(
        query(notesRef, orderBy("recordedAt", "desc"), limit(200)),
      );

      const loadedNotes = snap.docs
        .map((item) => ({
          id: item.id,
          ...(item.data() as Omit<StudentNote, "id">),
        }))
        .filter((item) => item.orgId === actor.orgId)
        .filter((item) => isNoteVisibleToActor(item, visibleClassIds));

      const withNames = await attachStudentNames({
        orgId: actor.orgId,
        notes: loadedNotes,
      });

      setNotes(withNames);

      setLoadState({
        loading: false,
        error: null,
      });
    } catch (error) {
      setNotes([]);
      setLoadState({
        loading: false,
        error: getErrorMessage(error),
      });
    }
  }, [actor.orgId, visibleClassIds]);

  useEffect(() => {
    void loadNotes();
  }, [loadNotes]);

  const filteredNotes = useMemo(() => {
    const normalizedSearch = searchText.trim().toLowerCase();

    return notes.filter((note) => {
      if (statusFilter !== "ALL" && note.status !== statusFilter) {
        return false;
      }

      if (priorityFilter !== "ALL" && note.priority !== priorityFilter) {
        return false;
      }

      if (categoryFilter !== "ALL" && note.category !== categoryFilter) {
        return false;
      }

      if (!normalizedSearch) return true;

      const haystack = [
        note.studentDisplayName,
        note.studentId,
        note.title,
        note.body,
        note.classId,
        getClassLabel(classMap, note.classId),
        note.tags.join(" "),
      ]
        .join(" ")
        .toLowerCase();

      return haystack.includes(normalizedSearch);
    });
  }, [
    categoryFilter,
    classMap,
    notes,
    priorityFilter,
    searchText,
    statusFilter,
  ]);

  const summary = useMemo(() => {
    return calculateStudentNotesSummary(notes);
  }, [notes]);

  const filteredSummary = useMemo(() => {
    return calculateStudentNotesSummary(filteredNotes);
  }, [filteredNotes]);

  const notesNeedingFollowUp = useMemo(() => {
    return notes
      .filter((note) => note.status === "NEEDS_FOLLOW_UP")
      .sort((a, b) => (a.followUpAt ?? 0) - (b.followUpAt ?? 0))
      .slice(0, 6);
  }, [notes]);

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-5">
          <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary">Milestone 10F</Badge>
                <Badge variant="outline">مركز الملاحظات</Badge>
              </div>

              <h1 className="text-2xl font-bold">الملاحظات الطلابية</h1>

              <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
                مركز عام لمتابعة ملاحظات الطلاب حسب الفصول المرئية، الحالة،
                الأولوية، التصنيف، وما يحتاج متابعة.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" onClick={loadNotes}>
                {loadState.loading ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Clock3 className="size-4" />
                )}
                تحديث
              </Button>

              <Button asChild variant="outline">
                <Link href="/staff/classes">
                  <ArrowRight className="size-4" />
                  فصولي
                </Link>
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {loadState.error ? (
        <Card className="border-destructive/30 bg-destructive/10">
          <CardContent className="p-4 text-sm text-destructive">
            تعذر تحميل الملاحظات: {loadState.error}
          </CardContent>
        </Card>
      ) : null}

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <SummaryCard
          title="إجمالي الملاحظات"
          value={summary.totalCount}
          description="آخر 200 ملاحظة ضمن النطاق"
          icon={<MessageSquare className="size-5" />}
        />

        <SummaryCard
          title="تحتاج متابعة"
          value={summary.needsFollowUpCount}
          description="ملاحظات مفتوحة للمتابعة"
          icon={<Clock3 className="size-5" />}
        />

        <SummaryCard
          title="عاجلة"
          value={summary.urgentCount}
          description="حسب الأولوية"
          icon={<FileText className="size-5" />}
        />

        <SummaryCard
          title="نتائج الفلتر"
          value={filteredSummary.totalCount}
          description="الملاحظات المعروضة الآن"
          icon={<Search className="size-5" />}
        />
      </section>

      <section className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
        <SummaryCard title="نشطة" value={summary.activeCount} />
        <SummaryCard title="محلولة" value={summary.resolvedCount} />
        <SummaryCard title="مؤرشفة" value={summary.archivedCount} />
        <SummaryCard title="مهمة" value={summary.importantCount} />
        <SummaryCard title="متابعة" value={summary.followUpCount} />
        <SummaryCard title="معلومة" value={summary.infoCount} />
      </section>

      <Card>
        <CardContent className="grid gap-3 p-4 lg:grid-cols-[1.2fr_0.8fr_0.8fr_0.8fr]">
          <label className="space-y-1">
            <span className="text-sm font-medium">بحث</span>
            <div className="relative">
              <Search className="absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type="search"
                value={searchText}
                onChange={(event) => setSearchText(event.target.value)}
                placeholder="ابحث باسم الطالب، نص الملاحظة، الفصل، الوسوم..."
                className="w-full rounded-xl border border-border bg-background py-2 pe-3 ps-9 text-sm outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          </label>

          <label className="space-y-1">
            <span className="text-sm font-medium">الحالة</span>
            <select
              value={statusFilter}
              onChange={(event) =>
                setStatusFilter(event.target.value as NoteStatusFilter)
              }
              className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            >
              {STATUS_OPTIONS.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-1">
            <span className="text-sm font-medium">الأولوية</span>
            <select
              value={priorityFilter}
              onChange={(event) =>
                setPriorityFilter(event.target.value as NotePriorityFilter)
              }
              className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            >
              {PRIORITY_OPTIONS.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-1">
            <span className="text-sm font-medium">التصنيف</span>
            <select
              value={categoryFilter}
              onChange={(event) =>
                setCategoryFilter(event.target.value as NoteCategoryFilter)
              }
              className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            >
              {CATEGORY_OPTIONS.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Clock3 className="size-5 text-primary" />
            <CardTitle>أقرب ملاحظات تحتاج متابعة</CardTitle>
          </div>

          <CardDescription>
            عرض مختصر لأهم الملاحظات المفتوحة للمتابعة.
          </CardDescription>
        </CardHeader>

        <CardContent>
          {!notesNeedingFollowUp.length ? (
            <div className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
              لا توجد ملاحظات تحتاج متابعة حاليًا.
            </div>
          ) : (
            <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
              {notesNeedingFollowUp.map((note) => (
                <div
                  key={note.id}
                  className="rounded-2xl border border-border p-3"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={getPriorityVariant(note.priority)}>
                      {getPriorityLabel(note.priority)}
                    </Badge>
                    <Badge variant="outline">
                      {formatDateTime(note.followUpAt)}
                    </Badge>
                  </div>

                  <p className="mt-3 font-medium">{note.studentDisplayName}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {getClassLabel(classMap, note.classId)}
                  </p>
                  <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">
                    {note.body}
                  </p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Users className="size-5 text-primary" />
            <CardTitle>آخر الملاحظات</CardTitle>
          </div>

          <CardDescription>
            يتم عرض آخر 200 ملاحظة ضمن الفصول المرئية ثم تطبيق الفلاتر محليًا.
          </CardDescription>
        </CardHeader>

        <CardContent>
          {loadState.loading ? (
            <div className="flex items-center justify-center gap-2 rounded-2xl border border-dashed border-border p-8 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              جارٍ تحميل الملاحظات...
            </div>
          ) : !filteredNotes.length ? (
            <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
              لا توجد ملاحظات مطابقة للفلاتر الحالية.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-border">
              <table className="w-full min-w-[1180px] text-sm">
                <thead className="bg-muted/50">
                  <tr className="text-right">
                    <th className="px-3 py-3 font-medium">الطالب</th>
                    <th className="px-3 py-3 font-medium">الفصل</th>
                    <th className="px-3 py-3 font-medium">التصنيف</th>
                    <th className="px-3 py-3 font-medium">الأولوية</th>
                    <th className="px-3 py-3 font-medium">الحالة</th>
                    <th className="px-3 py-3 font-medium">الظهور</th>
                    <th className="px-3 py-3 font-medium">الملاحظة</th>
                    <th className="px-3 py-3 font-medium">المتابعة</th>
                    <th className="px-3 py-3 font-medium">وسوم</th>
                    <th className="px-3 py-3 font-medium">إجراءات</th>
                  </tr>
                </thead>

                <tbody>
                  {filteredNotes.map((note) => (
                    <tr key={note.id} className="border-t border-border">
                      <td className="px-3 py-3">
                        <div className="font-medium">
                          {note.studentDisplayName}
                        </div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          {note.studentId}
                        </div>
                      </td>

                      <td className="px-3 py-3">
                        <div className="font-medium">
                          {getClassLabel(classMap, note.classId)}
                        </div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          {note.classId || "—"}
                        </div>
                      </td>

                      <td className="px-3 py-3">
                        <Badge variant="outline">
                          {getCategoryLabel(note.category)}
                        </Badge>
                      </td>

                      <td className="px-3 py-3">
                        <Badge variant={getPriorityVariant(note.priority)}>
                          {getPriorityLabel(note.priority)}
                        </Badge>
                      </td>

                      <td className="px-3 py-3">
                        <Badge variant={getStatusVariant(note.status)}>
                          {getStatusLabel(note.status)}
                        </Badge>
                      </td>

                      <td className="px-3 py-3">
                        <Badge variant="outline">
                          <Eye className="size-3" />
                          {getVisibilityLabel(note.visibility)}
                        </Badge>
                      </td>

                      <td className="max-w-[320px] px-3 py-3">
                        {note.title ? (
                          <p className="font-medium">{note.title}</p>
                        ) : null}
                        <p className="line-clamp-2 text-muted-foreground">
                          {note.body}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {formatDateTime(note.recordedAt)}
                        </p>
                      </td>

                      <td className="px-3 py-3">
                        {note.followUpStatus === "NEEDED" ? (
                          <div>
                            <Badge variant="secondary">تحتاج متابعة</Badge>
                            <p className="mt-1 text-xs text-muted-foreground">
                              {formatDateTime(note.followUpAt)}
                            </p>
                          </div>
                        ) : note.followUpStatus === "DONE" ? (
                          <Badge variant="outline">تمت</Badge>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>

                      <td className="px-3 py-3">
                        {note.tags.length ? (
                          <div className="flex max-w-[220px] flex-wrap gap-1">
                            {note.tags.slice(0, 4).map((tag) => (
                              <Badge key={tag} variant="secondary">
                                <Tag className="size-3" />
                                {tag}
                              </Badge>
                            ))}
                          </div>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>

                      <td className="px-3 py-3">
                        <div className="flex flex-wrap gap-2">
                          <Button asChild size="sm" variant="outline">
                            <Link href={`/staff/notes/${note.id}`}>تفاصيل</Link>
                          </Button>

                          {note.classId ? (
                            <Button asChild size="sm" variant="outline">
                              <Link
                                href={`/staff/classes/${note.classId}/notes`}
                              >
                                ملاحظات الفصل
                              </Link>
                            </Button>
                          ) : null}

                          {note.classId ? (
                            <Button asChild size="sm" variant="outline">
                              <Link href={`/staff/classes/${note.classId}`}>
                                <School className="size-4" />
                                الفصل
                              </Link>
                            </Button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>حالة الخطوة</CardTitle>
          <CardDescription>
            مركز الملاحظات العام يعمل الآن للقراءة والمتابعة والفلترة.
          </CardDescription>
        </CardHeader>

        <CardContent className="flex flex-wrap gap-2">
          <Badge variant="secondary">10C صفحة ملاحظات الفصل ✅</Badge>
          <Badge variant="secondary">10E حفظ StudentNote ✅</Badge>
          <Badge variant="secondary">10F مركز عام للملاحظات ✅</Badge>
          <Badge variant="outline">
            التالي: 10G صفحة عرض/تفاصيل الملاحظة أو إغلاق Milestone 10
          </Badge>
        </CardContent>
      </Card>
    </div>
  );
}
