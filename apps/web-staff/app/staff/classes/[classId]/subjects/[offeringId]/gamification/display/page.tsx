"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { ArrowRight, Loader2, MonitorPlay, RefreshCw } from "lucide-react";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
} from "firebase/firestore";

import type {
  Person,
  Student,
  StudentEnrollment,
  StudentGamificationEvent,
} from "@takween/contracts";
import {
  buildClassroomDisplayGamificationFeed,
  filterEventsForClassroomDisplayView,
} from "@takween/domain";

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
import { getStaffActorPrimaryRole } from "@/lib/staff-actor";
import { ClassroomDisplayLaunchCard } from "./_components/classroom-display-launch-card";
import { GamificationDisplayFeed } from "./_components/gamification-display-feed";

type StudentDisplayRow = {
  studentId: string;
  displayName: string;
};

function getSearchValue(searchParams: URLSearchParams, key: string) {
  return searchParams.get(key)?.trim() ?? "";
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "حدث خطأ غير متوقع";
}

function getTextField(source: unknown, keys: string[]) {
  if (!source || typeof source !== "object") return "";

  const record = source as Record<string, unknown>;

  for (const key of keys) {
    const value = record[key];

    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }

  return "";
}

function getStudentDisplayName(params: {
  person: Person | null;
  student: Student | null;
  studentId: string;
}) {
  return (
    getTextField(params.person, ["displayName", "fullName", "nameAr", "name"]) ||
    getTextField(params.student, [
      "displayName",
      "fullName",
      "nameAr",
      "name",
      "studentName",
    ]) ||
    params.studentId ||
    "طالب"
  );
}

async function loadClassStudents(params: {
  orgId: string;
  schoolId: string;
  academicYearId: string;
  classId: string;
}) {
  const enrollmentsRef = collection(
    db,
    `orgs/${params.orgId}/studentEnrollments`,
  );

  const enrollmentsSnap = await getDocs(
    query(enrollmentsRef, where("classId", "==", params.classId)),
  );

  const enrollments = enrollmentsSnap.docs
    .map((item) => ({
      id: item.id,
      ...(item.data() as Omit<StudentEnrollment, "id">),
    }))
    .filter((enrollment) => {
      if (enrollment.status !== "ACTIVE") return false;

      if (
        params.schoolId &&
        enrollment.schoolId &&
        enrollment.schoolId !== params.schoolId
      ) {
        return false;
      }

      if (
        params.academicYearId &&
        enrollment.academicYearId &&
        enrollment.academicYearId !== params.academicYearId
      ) {
        return false;
      }

      return true;
    });

  const rows = await Promise.all(
    enrollments.map(async (enrollment): Promise<StudentDisplayRow> => {
      const studentRef = doc(
        db,
        `orgs/${params.orgId}/students/${enrollment.studentId}`,
      );
      const studentSnap = await getDoc(studentRef);

      const student = studentSnap.exists()
        ? ({
            id: studentSnap.id,
            ...(studentSnap.data() as Omit<Student, "id">),
          } as Student)
        : null;

      const personId = student?.personId ?? "";

      const person =
        personId.length > 0
          ? await getDoc(doc(db, `orgs/${params.orgId}/people/${personId}`))
          : null;

      const personData =
        person && person.exists()
          ? ({
              id: person.id,
              ...(person.data() as Omit<Person, "id">),
            } as Person)
          : null;

      return {
        studentId: enrollment.studentId,
        displayName: getStudentDisplayName({
          person: personData,
          student,
          studentId: enrollment.studentId,
        }),
      };
    }),
  );

  return rows.sort((a, b) => a.displayName.localeCompare(b.displayName, "ar"));
}

async function loadSubjectGamificationEvents(params: {
  orgId: string;
  schoolId: string;
  academicYearId: string;
  termId: string;
  classId: string;
  subjectKey: string;
  offeringId: string;
}) {
  const eventsRef = collection(
    db,
    `orgs/${params.orgId}/studentGamificationEvents`,
  );

  const eventsSnap = await getDocs(
    query(eventsRef, where("classSubjectOfferingId", "==", params.offeringId)),
  );

  return eventsSnap.docs
    .map((item) => ({
      id: item.id,
      ...(item.data() as Omit<StudentGamificationEvent, "id">),
    }))
    .filter((event) => {
      if (params.schoolId && event.schoolId !== params.schoolId) return false;

      if (
        params.academicYearId &&
        event.academicYearId !== params.academicYearId
      ) {
        return false;
      }

      if (params.termId && event.termId !== params.termId) return false;
      if (params.classId && event.classId !== params.classId) return false;

      if (params.subjectKey && event.subjectKey !== params.subjectKey) {
        return false;
      }

      return true;
    })
    .sort((a, b) => (b.occurredAt ?? 0) - (a.occurredAt ?? 0));
}

export default function SubjectGamificationDisplayPreviewPage() {
  const params = useParams<{
    classId: string;
    offeringId: string;
  }>();

  const searchParams = useSearchParams();
  const { actor } = useStaffActor();

  const classId = params.classId;
  const offeringId = params.offeringId;

  const schoolId = getSearchValue(searchParams, "schoolId");
  const academicYearId = getSearchValue(searchParams, "academicYearId");
  const gradeId = getSearchValue(searchParams, "gradeId");

  const subjectKey = getSearchValue(searchParams, "subjectKey");
  const subjectTitle =
    getSearchValue(searchParams, "subjectTitle") || subjectKey || "المادة";

  // const termId = getSearchValue(searchParams, "termId");
  // const termTitle = getSearchValue(searchParams, "termTitle");
  // const termShortTitle = getSearchValue(searchParams, "termShortTitle");

  const currentTermForDisplay =
    actor?.currentTermsByAcademicYear?.[academicYearId] ?? null;

  const termId =
    getSearchValue(searchParams, "termId") || currentTermForDisplay?.id || "";

  const termTitle =
    getSearchValue(searchParams, "termTitle") ||
    currentTermForDisplay?.title ||
    "";

  const termShortTitle =
    getSearchValue(searchParams, "termShortTitle") ||
    currentTermForDisplay?.shortTitle ||
    "";

  const [students, setStudents] = useState<StudentDisplayRow[]>([]);
  const [events, setEvents] = useState<StudentGamificationEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      if (!actor?.orgId) {
        setStudents([]);
        setEvents([]);
        setError("لم يتم تحديد المؤسسة الحالية.");
        return;
      }

      const [studentRows, eventRows] = await Promise.all([
        loadClassStudents({
          orgId: actor.orgId,
          schoolId,
          academicYearId,
          classId,
        }),
        loadSubjectGamificationEvents({
          orgId: actor.orgId,
          schoolId,
          academicYearId,
          termId,
          classId,
          subjectKey,
          offeringId,
        }),
      ]);

      setStudents(studentRows);
      setEvents(eventRows);
    } catch (error: unknown) {
      setStudents([]);
      setEvents([]);
      setError(getErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }, [
    actor?.orgId,
    schoolId,
    academicYearId,
    termId,
    classId,
    subjectKey,
    offeringId,
  ]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const studentDisplayNamesById = useMemo(() => {
    return Object.fromEntries(
      students.map((student) => [student.studentId, student.displayName]),
    );
  }, [students]);

  const feed = useMemo(() => {
    const displayEvents = filterEventsForClassroomDisplayView(events);

    return buildClassroomDisplayGamificationFeed({
      events: displayEvents,
      studentDisplayNamesById,
      subjectTitlesByKey: subjectKey
        ? {
            [subjectKey]: subjectTitle,
          }
        : {},
      limit: 20,
      context: {
        orgId: actor?.orgId ?? "",
        schoolId,
        academicYearId,
        termId,
        termTitle,
        termShortTitle,
        gradeId,
        classId,
        subjectKey,
        subjectTitle,
        classSubjectOfferingId: offeringId,
      },
    });
  }, [
    events,
    studentDisplayNamesById,
    subjectKey,
    subjectTitle,
    actor?.orgId,
    schoolId,
    academicYearId,
    termId,
    termTitle,
    termShortTitle,
    gradeId,
    classId,
    offeringId,
  ]);

  const backHref = `/staff/classes/${classId}/subjects/${offeringId}/gamification?${searchParams.toString()}`;

  const actorPersonId = actor?.personId || actor?.uid || "";
  const actorPrimaryRole = getStaffActorPrimaryRole(actor) || undefined;

  return (
    <div className="min-h-[calc(100vh-6rem)] space-y-4">
      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-center">
        <div className="space-y-2">
          <Badge variant="secondary" className="w-fit">
            معاينة شاشة الفصل
          </Badge>

          <div>
            <h1 className="text-2xl font-bold text-foreground">
              شاشة التحفيز — {subjectTitle}
            </h1>

            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              معاينة مؤقتة لما سيظهر لاحقًا على شاشة الفصل الكبيرة.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => void loadData()}
            disabled={loading}
          >
            {loading ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <RefreshCw className="size-4" />
            )}
            تحديث
          </Button>

          <Button asChild variant="outline">
            <Link href={backHref}>
              <ArrowRight className="size-4" />
              العودة للتحفيز
            </Link>
          </Button>
        </div>
      </div>

      <Card className="overflow-hidden border-primary/20 bg-gradient-to-br from-background via-background to-primary/5">
        <CardHeader>
          <div className="flex items-start gap-3">
            <div className="flex size-12 shrink-0 items-center justify-center rounded-3xl bg-primary/10 text-primary">
              <MonitorPlay className="size-6" />
            </div>

            <div className="space-y-1">
              <CardTitle className="text-xl">Feed التحفيز المباشر</CardTitle>
              <CardDescription>
                يظهر فقط ما يناسب شاشة الفصل حسب visibility الخاصة بالحدث.
              </CardDescription>
            </div>
          </div>
        </CardHeader>

        <CardContent>
          <div className="grid gap-3 md:grid-cols-4">
            <div className="rounded-3xl border border-border bg-background/80 p-4">
              <p className="text-xs text-muted-foreground">عدد العناصر</p>
              <p className="mt-1 text-3xl font-bold">
                {feed.totalItems.toLocaleString("ar-SA")}
              </p>
            </div>

            <div className="rounded-3xl border border-border bg-background/80 p-4">
              <p className="text-xs text-muted-foreground">الفصل</p>
              <p className="mt-1 break-all text-sm font-bold">
                {classId || "غير محدد"}
              </p>
            </div>

            <div className="rounded-3xl border border-border bg-background/80 p-4">
              <p className="text-xs text-muted-foreground">المادة</p>
              <p className="mt-1 break-all text-sm font-bold">{subjectTitle}</p>
            </div>

            <div className="rounded-3xl border border-border bg-background/80 p-4">
              <p className="text-xs text-muted-foreground">الفصل الدراسي</p>
              <p className="mt-1 break-all text-sm font-bold">
                {termShortTitle || termTitle || termId || "غير محدد"}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <ClassroomDisplayLaunchCard
        orgId={actor?.orgId ?? ""}
        startedByPersonId={actorPersonId}
        startedByRoleKey={actorPrimaryRole}
        classId={classId}
        offeringId={offeringId}
        schoolId={schoolId}
        academicYearId={academicYearId}
        gradeId={gradeId}
        subjectKey={subjectKey}
        subjectTitle={subjectTitle}
        termId={termId}
        termTitle={termTitle}
        termShortTitle={termShortTitle}
        studentsCount={students.length}
        feedItemsCount={feed.totalItems}
      />

      <GamificationDisplayFeed loading={loading} error={error} feed={feed} />
    </div>
  );
}
