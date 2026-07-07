"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import {
  ArrowRight,
  BadgePlus,
  CheckCircle2,
  History,
  Loader2,
  MonitorPlay,
  Save,
  Search,
  Sparkles,
  Trophy,
  Users,
} from "lucide-react";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  writeBatch,
} from "firebase/firestore";
import { toast } from "sonner";

import type {
  GamificationBadge,
  GamificationReason,
  MembershipRole,
  Person,
  Student,
  StudentEnrollment,
  StudentGamificationEvent,
  StudentGamificationEventType,
  StudentGamificationEventVisibility,
  StudentGamificationValueKind,
  GamificationAchievementRule,
  GamificationLevelRule,
} from "@takween/contracts";
import {
  buildBulkStudentGamificationEvents,
  buildStudentGamificationLeaderboard,
  filterGamificationBadgesForContext,
  filterManualGamificationReasonsForContext,
  resolveGamificationBadgeDefaults,
  resolveGamificationReasonDefaults,
  calculateStudentGamificationLevel,
  resolveUnlockedGamificationAchievements,
  buildUnlockedAchievementRewardEvents,
  type StudentGamificationLeaderboardSortBy,
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

type StudentGamificationRow = {
  studentId: string;
  enrollmentId: string;
  personId: string;
  displayName: string;
  nationalId?: string;
  schoolId: string;
  academicYearId: string;
  gradeId?: string;
  streamId?: string;
  classId?: string;
};

const MANUAL_REASON_VALUE = "__manual__";

const EVENT_TYPE_OPTIONS: Array<{
  value: StudentGamificationEventType;
  label: string;
}> = [
  { value: "POINTS_ADD", label: "إضافة نقاط" },
  { value: "XP_ADD", label: "إضافة XP" },
  { value: "BADGE_AWARDED", label: "منح شارة" },
  { value: "POSITIVE_NOTE", label: "ملاحظة إيجابية" },
  { value: "QUEST_COMPLETED", label: "إنجاز مهمة" },
];

const VISIBILITY_OPTIONS: Array<{
  value: StudentGamificationEventVisibility;
  label: string;
  description: string;
}> = [
  {
    value: "EVERYONE",
    label: "يظهر للجميع",
    description: ".",
  },
  {
    value: "STAFF_ONLY",
    label: "للموظفين فقط",
    description: "لا تظهر للطالب أو ولي الأمر.",
  },
  {
    value: "STUDENT_DISPLAY",
    label: "تظهر للطالب",
    description: "مناسبة لشاشة الفصل لاحقًا.",
  },
  {
    value: "GUARDIAN_VISIBLE",
    label: "تظهر لولي الأمر",
    description: "تظهر لاحقًا في تطبيق ولي الأمر.",
  },
  {
    value: "PUBLIC_LEADERBOARD",
    label: "لوحة الترتيب",
    description: "تصلح للترتيب العام لاحقًا.",
  },
];

const LEADERBOARD_SORT_OPTIONS: Array<{
  value: StudentGamificationLeaderboardSortBy;
  label: string;
}> = [
  { value: "POINTS", label: "النقاط" },
  { value: "XP", label: "XP" },
  { value: "BADGES", label: "الشارات" },
  { value: "TOTAL_VALUE", label: "القيمة الإجمالية" },
  { value: "LATEST_EVENT", label: "آخر نشاط" },
];

function getSearchValue(searchParams: URLSearchParams, key: string) {
  return searchParams.get(key)?.trim() ?? "";
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "حدث خطأ غير متوقع";
}

function getStudentDisplayName(params: {
  person: Person | null;
  student: Student | null;
  studentId: string;
}) {
  return (
    params.person?.displayName ||
    params.student?.id ||
    params.studentId ||
    "طالب"
  );
}

function toggleSetItem(source: Set<string>, item: string) {
  const next = new Set(source);

  if (next.has(item)) {
    next.delete(item);
  } else {
    next.add(item);
  }

  return next;
}

function buildBadgeKey(value: string) {
  return value
    .trim()
    .replace(/[^a-zA-Z0-9\u0600-\u06FF_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function formatEventType(type: StudentGamificationEventType) {
  return EVENT_TYPE_OPTIONS.find((item) => item.value === type)?.label ?? type;
}

function formatVisibility(visibility: StudentGamificationEventVisibility) {
  return (
    VISIBILITY_OPTIONS.find((item) => item.value === visibility)?.label ??
    visibility
  );
}

function isAchievementRewardEvent(event: StudentGamificationEvent) {
  return (
    event.category === "ACHIEVEMENT_REWARD" ||
    event.reasonKey?.startsWith("achievement-unlocked:")
  );
}

function formatEventDate(value: number | undefined | null) {
  if (!value) return "غير محدد";

  return new Intl.DateTimeFormat("ar-SA", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function resolveValueKindFromEventType(
  eventType: StudentGamificationEventType,
): StudentGamificationValueKind {
  if (eventType === "XP_ADD" || eventType === "XP_REMOVE") return "XP";

  if (eventType === "POINTS_ADD" || eventType === "POINTS_REMOVE") {
    return "POINTS";
  }

  if (eventType === "BADGE_AWARDED" || eventType === "BADGE_REVOKED") {
    return "BADGE_VALUE";
  }

  if (eventType === "STREAK_UPDATED") return "STREAK";
  if (eventType === "LEVEL_UP") return "LEVEL";

  return "CUSTOM";
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
    enrollments.map(async (enrollment): Promise<StudentGamificationRow> => {
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
        enrollmentId: enrollment.id,
        personId,
        displayName: getStudentDisplayName({
          person: personData,
          student,
          studentId: enrollment.studentId,
        }),
        nationalId: personData?.nationalId,
        schoolId: enrollment.schoolId,
        academicYearId: enrollment.academicYearId,
        gradeId: enrollment.gradeId ?? "",
        streamId: enrollment.streamId ?? "",
        classId: enrollment.classId ?? "",
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

async function loadGamificationCatalog(params: {
  orgId: string;
  schoolId: string;
  academicYearId: string;
  termId: string;
  gradeId: string;
  classId: string;
  subjectKey: string;
  offeringId: string;
}) {
  const [reasonsSnap, badgesSnap] = await Promise.all([
    getDocs(collection(db, `orgs/${params.orgId}/gamificationReasons`)),
    getDocs(collection(db, `orgs/${params.orgId}/gamificationBadges`)),
  ]);

  const rawReasons = reasonsSnap.docs.map((item) => ({
    id: item.id,
    ...(item.data() as Omit<GamificationReason, "id">),
  })) as GamificationReason[];

  const rawBadges = badgesSnap.docs.map((item) => ({
    id: item.id,
    ...(item.data() as Omit<GamificationBadge, "id">),
  })) as GamificationBadge[];

  const context = {
    orgId: params.orgId,
    schoolId: params.schoolId,
    academicYearId: params.academicYearId,
    termId: params.termId,
    gradeId: params.gradeId,
    classId: params.classId,
    subjectKey: params.subjectKey,
    classSubjectOfferingId: params.offeringId,
  };

  return {
    reasons: filterManualGamificationReasonsForContext(rawReasons, context),
    badges: filterGamificationBadgesForContext(rawBadges, context),
  };
}

async function loadGamificationRules(params: { orgId: string }) {
  const [levelRulesSnap, achievementRulesSnap] = await Promise.all([
    getDocs(collection(db, `orgs/${params.orgId}/gamificationLevelRules`)),
    getDocs(
      collection(db, `orgs/${params.orgId}/gamificationAchievementRules`),
    ),
  ]);

  const levelRules = levelRulesSnap.docs.map((item) => ({
    id: item.id,
    ...(item.data() as Omit<GamificationLevelRule, "id">),
  })) as GamificationLevelRule[];

  const achievementRules = achievementRulesSnap.docs.map((item) => ({
    id: item.id,
    ...(item.data() as Omit<GamificationAchievementRule, "id">),
  })) as GamificationAchievementRule[];

  return {
    levelRules,
    achievementRules,
  };
}

export default function SubjectGamificationPage() {
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

  const currentTermForGamification =
    actor?.currentTermsByAcademicYear?.[academicYearId] ?? null;

  const termId =
    getSearchValue(searchParams, "termId") ||
    currentTermForGamification?.id ||
    "";

  const termTitle =
    getSearchValue(searchParams, "termTitle") ||
    currentTermForGamification?.title ||
    "";

  const termShortTitle =
    getSearchValue(searchParams, "termShortTitle") ||
    currentTermForGamification?.shortTitle ||
    "";

  const [students, setStudents] = useState<StudentGamificationRow[]>([]);
  const [events, setEvents] = useState<StudentGamificationEvent[]>([]);
  const [reasons, setReasons] = useState<GamificationReason[]>([]);
  const [badges, setBadges] = useState<GamificationBadge[]>([]);

  const [levelRules, setLevelRules] = useState<GamificationLevelRule[]>([]);
  const [achievementRules, setAchievementRules] = useState<
    GamificationAchievementRule[]
  >([]);

  const [selectedStudentIds, setSelectedStudentIds] = useState<Set<string>>(
    () => new Set(),
  );

  const [searchText, setSearchText] = useState("");
  const [leaderboardSortBy, setLeaderboardSortBy] =
    useState<StudentGamificationLeaderboardSortBy>("POINTS");

  const [loading, setLoading] = useState(true);
  const [loadingEvents, setLoadingEvents] = useState(true);
  const [loadingCatalog, setLoadingCatalog] = useState(true);

  const [loadingRules, setLoadingRules] = useState(true);

  const [saving, setSaving] = useState(false);

  const [error, setError] = useState("");
  const [eventsError, setEventsError] = useState("");
  const [catalogError, setCatalogError] = useState("");
  const [rulesError, setRulesError] = useState("");
  const [selectedReasonId, setSelectedReasonId] = useState(MANUAL_REASON_VALUE);
  const [selectedBadgeId, setSelectedBadgeId] = useState("");

  const [eventType, setEventType] =
    useState<StudentGamificationEventType>("POINTS_ADD");
  const [visibility, setVisibility] =
    useState<StudentGamificationEventVisibility>("EVERYONE");
  const [valueText, setValueText] = useState("5");
  const [reasonTitle, setReasonTitle] = useState("مشاركة مميزة");
  const [note, setNote] = useState("");

  const loadStudents = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      if (!actor?.orgId) {
        setStudents([]);
        setError("لم يتم تحديد المؤسسة الحالية.");
        return;
      }

      if (!classId) {
        setStudents([]);
        setError("لم يتم تحديد الفصل.");
        return;
      }

      const rows = await loadClassStudents({
        orgId: actor.orgId,
        schoolId,
        academicYearId,
        classId,
      });

      setStudents(rows);
      setSelectedStudentIds(new Set());
    } catch (error: unknown) {
      setStudents([]);
      setSelectedStudentIds(new Set());
      setError(getErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }, [actor?.orgId, schoolId, academicYearId, classId]);

  const loadEvents = useCallback(async () => {
    setLoadingEvents(true);
    setEventsError("");

    try {
      if (!actor?.orgId) {
        setEvents([]);
        setEventsError("لم يتم تحديد المؤسسة الحالية.");
        return;
      }

      const rows = await loadSubjectGamificationEvents({
        orgId: actor.orgId,
        schoolId,
        academicYearId,
        termId,
        classId,
        subjectKey,
        offeringId,
      });

      setEvents(rows);
    } catch (error: unknown) {
      setEvents([]);
      setEventsError(getErrorMessage(error));
    } finally {
      setLoadingEvents(false);
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

  const loadCatalog = useCallback(async () => {
    setLoadingCatalog(true);
    setCatalogError("");

    try {
      if (!actor?.orgId) {
        setReasons([]);
        setBadges([]);
        setCatalogError("لم يتم تحديد المؤسسة الحالية.");
        return;
      }

      const result = await loadGamificationCatalog({
        orgId: actor.orgId,
        schoolId,
        academicYearId,
        termId,
        gradeId,
        classId,
        subjectKey,
        offeringId,
      });

      setReasons(result.reasons);
      setBadges(result.badges);
    } catch (error: unknown) {
      setReasons([]);
      setBadges([]);
      setCatalogError(getErrorMessage(error));
    } finally {
      setLoadingCatalog(false);
    }
  }, [
    actor?.orgId,
    schoolId,
    academicYearId,
    termId,
    gradeId,
    classId,
    subjectKey,
    offeringId,
  ]);

  const loadRules = useCallback(async () => {
    setLoadingRules(true);
    setRulesError("");

    try {
      if (!actor?.orgId) {
        setLevelRules([]);
        setAchievementRules([]);
        setRulesError("لم يتم تحديد المؤسسة الحالية.");
        return;
      }

      const result = await loadGamificationRules({
        orgId: actor.orgId,
      });

      setLevelRules(result.levelRules);
      setAchievementRules(result.achievementRules);
    } catch (error: unknown) {
      setLevelRules([]);
      setAchievementRules([]);
      setRulesError(getErrorMessage(error));
    } finally {
      setLoadingRules(false);
    }
  }, [actor?.orgId]);

  useEffect(() => {
    void loadStudents();
  }, [loadStudents]);

  useEffect(() => {
    void loadEvents();
  }, [loadEvents]);

  useEffect(() => {
    void loadCatalog();
  }, [loadCatalog]);

  useEffect(() => {
    void loadRules();
  }, [loadRules]);

  const selectedReason = useMemo(() => {
    if (selectedReasonId === MANUAL_REASON_VALUE) return null;

    return reasons.find((reason) => reason.id === selectedReasonId) ?? null;
  }, [reasons, selectedReasonId]);

  const selectedReasonDefaults = useMemo(() => {
    if (!selectedReason) return null;

    return resolveGamificationReasonDefaults(selectedReason);
  }, [selectedReason]);

  const selectedBadge = useMemo(() => {
    if (selectedBadgeId) {
      return badges.find((badge) => badge.id === selectedBadgeId) ?? null;
    }

    if (selectedReasonDefaults?.badgeId) {
      return (
        badges.find((badge) => badge.id === selectedReasonDefaults.badgeId) ??
        null
      );
    }

    if (selectedReasonDefaults?.badgeKey) {
      return (
        badges.find((badge) => badge.key === selectedReasonDefaults.badgeKey) ??
        null
      );
    }

    return null;
  }, [badges, selectedBadgeId, selectedReasonDefaults]);

  const selectedBadgeDefaults = useMemo(() => {
    if (!selectedBadge) return null;

    return resolveGamificationBadgeDefaults(selectedBadge);
  }, [selectedBadge]);

  const studentNameById = useMemo(() => {
    const map = new Map<string, string>();

    for (const student of students) {
      map.set(student.studentId, student.displayName);
    }

    return map;
  }, [students]);

  const studentDisplayNamesById = useMemo(() => {
    return Object.fromEntries(
      students.map((student) => [student.studentId, student.displayName]),
    );
  }, [students]);

  const leaderboardRows = useMemo(() => {
    return buildStudentGamificationLeaderboard({
      events,
      studentDisplayNamesById,
      sortBy: leaderboardSortBy,
      limit: 10,
      context: {
        orgId: actor?.orgId ?? "",
        schoolId,
        academicYearId,
        termId,
        gradeId,
        classId,
        subjectKey,
        classSubjectOfferingId: offeringId,
      },
    });
  }, [
    events,
    studentDisplayNamesById,
    leaderboardSortBy,
    actor?.orgId,
    schoolId,
    academicYearId,
    termId,
    gradeId,
    classId,
    subjectKey,
    offeringId,
  ]);

  const progressByStudentId = useMemo(() => {
    const map = new Map<
      string,
      {
        level: ReturnType<typeof calculateStudentGamificationLevel>;
        achievements: ReturnType<
          typeof resolveUnlockedGamificationAchievements
        >;
      }
    >();

    if (!actor?.orgId) return map;

    for (const row of leaderboardRows) {
      const context = {
        orgId: actor.orgId,
        schoolId,
        academicYearId,
        termId,
        gradeId,
        streamId: row.streamId,
        classId,
        subjectKey,
        classSubjectOfferingId: offeringId,
      };

      const level = calculateStudentGamificationLevel({
        studentId: row.studentId,
        events,
        levelRules,
        context,
      });

      const achievements = resolveUnlockedGamificationAchievements({
        studentId: row.studentId,
        events,
        achievementRules,
        levelRules,
        context,
      });

      map.set(row.studentId, {
        level,
        achievements,
      });
    }

    return map;
  }, [
    actor?.orgId,
    leaderboardRows,
    events,
    levelRules,
    achievementRules,
    schoolId,
    academicYearId,
    termId,
    gradeId,
    classId,
    subjectKey,
    offeringId,
  ]);

  const filteredStudents = useMemo(() => {
    const keyword = searchText.trim().toLowerCase();

    if (!keyword) return students;

    return students.filter((student) => {
      return (
        student.displayName.toLowerCase().includes(keyword) ||
        student.studentId.toLowerCase().includes(keyword) ||
        String(student.nationalId ?? "")
          .toLowerCase()
          .includes(keyword)
      );
    });
  }, [students, searchText]);

  const selectedRows = useMemo(() => {
    return students.filter((student) =>
      selectedStudentIds.has(student.studentId),
    );
  }, [students, selectedStudentIds]);

  const activeEvents = useMemo(() => {
    return events.filter((event) => event.status === "ACTIVE");
  }, [events]);

  const totalPoints = useMemo(() => {
    return activeEvents.reduce((total, event) => {
      if (event.valueKind !== "POINTS") return total;
      return total + event.value;
    }, 0);
  }, [activeEvents]);

  const totalXp = useMemo(() => {
    return activeEvents.reduce((total, event) => {
      if (event.valueKind !== "XP") return total;
      return total + event.value;
    }, 0);
  }, [activeEvents]);

  const allFilteredSelected =
    filteredStudents.length > 0 &&
    filteredStudents.every((student) =>
      selectedStudentIds.has(student.studentId),
    );

  const selectedVisibilityOption = VISIBILITY_OPTIONS.find(
    (item) => item.value === visibility,
  );

  const numericValue = Number(valueText);
  const valueIsValid = Number.isFinite(numericValue) && numericValue >= 0;

  function handleSelectReason(nextReasonId: string) {
    setSelectedReasonId(nextReasonId);

    if (nextReasonId === MANUAL_REASON_VALUE) {
      return;
    }

    const reason = reasons.find((item) => item.id === nextReasonId);
    if (!reason) return;

    const defaults = resolveGamificationReasonDefaults(reason);

    setReasonTitle(defaults.reasonTitle);
    setEventType(defaults.eventType);
    setValueText(String(defaults.value));
    setVisibility(defaults.visibility);

    if (defaults.badgeId) {
      setSelectedBadgeId(defaults.badgeId);
      return;
    }

    if (defaults.badgeKey) {
      const badgeByKey = badges.find(
        (badge) => badge.key === defaults.badgeKey,
      );
      setSelectedBadgeId(badgeByKey?.id ?? "");
      return;
    }

    setSelectedBadgeId("");
  }

  function handleToggleStudent(studentId: string) {
    setSelectedStudentIds((current) => toggleSetItem(current, studentId));
  }

  function handleToggleFilteredStudents() {
    setSelectedStudentIds((current) => {
      const next = new Set(current);

      if (allFilteredSelected) {
        for (const student of filteredStudents) {
          next.delete(student.studentId);
        }
      } else {
        for (const student of filteredStudents) {
          next.add(student.studentId);
        }
      }

      return next;
    });
  }

  function handleClearSelection() {
    setSelectedStudentIds(new Set());
  }

  async function handleCreateGamificationEvents() {
    if (!actor?.orgId) {
      toast.error("لم يتم تحديد المؤسسة الحالية.");
      return;
    }

    const createdByPersonId = actor.personId || actor.uid;

    if (!createdByPersonId) {
      toast.error("لم يتم تحديد المستخدم الحالي.");
      return;
    }

    if (selectedRows.length === 0) {
      toast.error("اختر طالبًا واحدًا على الأقل.");
      return;
    }

    if (!reasonTitle.trim()) {
      toast.error("اكتب سبب التحفيز.");
      return;
    }

    if (!valueIsValid) {
      toast.error("قيمة النقاط يجب أن تكون رقمًا صحيحًا أو موجبًا.");
      return;
    }

    if (!termId) {
      toast.error("لا يمكن إنشاء تحفيز قبل تحديد الفصل الدراسي الحالي.");
      return;
    }
    
    setSaving(true);

    try {
      const occurredAt = Date.now();

      const reasonKey =
        selectedReasonDefaults?.reasonKey ||
        buildBadgeKey(reasonTitle) ||
        "manual-gamification";

      const badgeKey =
        selectedBadgeDefaults?.badgeKey ||
        selectedReasonDefaults?.badgeKey ||
        (eventType === "BADGE_AWARDED" ? buildBadgeKey(reasonTitle) : "");

      const badgeTitle =
        selectedBadgeDefaults?.badgeTitle ||
        (eventType === "BADGE_AWARDED" ? reasonTitle.trim() : "");

      const valueKind =
        selectedReasonDefaults?.valueKind ??
        selectedBadgeDefaults?.valueKind ??
        resolveValueKindFromEventType(eventType);

      const newEvents = buildBulkStudentGamificationEvents({
        context: {
          orgId: actor.orgId,
          schoolId,
          academicYearId,
          termId,
          termTitle,
          termShortTitle,
          gradeId,
          classId,
          subjectKey,
          classSubjectOfferingId: offeringId,
        },
        students: selectedRows.map((student) => ({
          studentId: student.studentId,
          enrollmentId: student.enrollmentId,
          gradeId: student.gradeId,
          streamId: student.streamId,
          classId: student.classId,
        })),
        actor: {
          createdByPersonId,
          createdByRoleKey: actor.roles?.[0] as MembershipRole | undefined,
        },
        eventType,
        visibility,
        title: reasonTitle.trim(),
        description: note.trim(),

        reasonKey,
        reasonTitle: reasonTitle.trim(),

        category:
          selectedReasonDefaults?.category ||
          selectedBadgeDefaults?.category ||
          "SUBJECT_GAMIFICATION",
        categoryTitle:
          selectedReasonDefaults?.categoryTitle ||
          selectedBadgeDefaults?.categoryTitle ||
          "تحفيز المادة",

        value: numericValue,
        valueKind,

        badgeKey,
        badgeTitle,

        groupEventTitle: `تحفيز جماعي - ${subjectTitle}`,
        occurredAt,

        sourceType: "CLASS_SUBJECT_OFFERING",
        sourceId: offeringId,
        sourcePath: `orgs/${actor.orgId}/classSubjectOfferings/${offeringId}`,

        note: note.trim(),
      });

      const allEventsAfterManualReward = [...events, ...newEvents];

      const achievementRewardEvents = selectedRows.flatMap((student) =>
        buildUnlockedAchievementRewardEvents({
          context: {
            orgId: actor.orgId,
            schoolId,
            academicYearId,
            termId,
            termTitle,
            termShortTitle,
            gradeId,
            classId,
            subjectKey,
            classSubjectOfferingId: offeringId,
          },
          student: {
            studentId: student.studentId,
            enrollmentId: student.enrollmentId,
            gradeId: student.gradeId,
            streamId: student.streamId,
            classId: student.classId,
          },
          actor: {
            createdByPersonId,
            createdByRoleKey: actor.roles?.[0] as MembershipRole | undefined,
          },
          events: allEventsAfterManualReward,
          achievementRules,
          levelRules,
          occurredAt: occurredAt + 1,
          sourcePathPrefix: `orgs/${actor.orgId}/gamificationAchievementRules`,
        }),
      );

      const allEventsToSave = [...newEvents, ...achievementRewardEvents];

      const batch = writeBatch(db);

      for (const event of allEventsToSave) {
        const eventRef = doc(
          db,
          `orgs/${actor.orgId}/studentGamificationEvents/${event.id}`,
        );

        batch.set(eventRef, event);
      }

      await batch.commit();

      const manualCount = newEvents.length;
      const rewardCount = achievementRewardEvents.length;

      toast.success(
        rewardCount > 0
          ? `تم إنشاء ${manualCount.toLocaleString(
              "ar-SA",
            )} تحفيز و ${rewardCount.toLocaleString("ar-SA")} مكافأة إنجاز.`
          : `تم إنشاء ${manualCount.toLocaleString("ar-SA")} حدث تحفيز بنجاح.`,
      );

      setSelectedStudentIds(new Set());
      setNote("");

      await loadEvents();
    } catch (error: unknown) {
      toast.error(getErrorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-center">
        <div className="space-y-2">
          <Badge variant="secondary" className="w-fit">
            التحفيز المرتبط بالمادة
          </Badge>

          <div className="space-y-1">
            <h1 className="text-2xl font-bold text-foreground">
              تحفيز الطلاب — {subjectTitle}
            </h1>

            <p className="text-sm leading-6 text-muted-foreground">
              اختر طالبًا أو مجموعة طلاب، ثم اختر سببًا جاهزًا أو أدخل سببًا
              يدويًا.
            </p>
          </div>
        </div>

        <Button asChild variant="outline">
          <Link href={`/staff/classes/${classId}`}>
            <ArrowRight className="size-4" />
            العودة للفصل
          </Link>
        </Button>

        <Button asChild variant="outline">
          <Link
            href={`/staff/classes/${classId}/subjects/${offeringId}/gamification/display?${searchParams.toString()}`}
          >
            <MonitorPlay className="size-4" />
            معاينة الشاشة
          </Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-start gap-3">
            <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <Sparkles className="size-5" />
            </div>

            <div className="space-y-1">
              <CardTitle>سياق التحفيز</CardTitle>
              <CardDescription>
                هذا السياق سيُحفظ داخل StudentGamificationEvent.
              </CardDescription>
            </div>
          </div>
        </CardHeader>

        <CardContent>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-2xl border border-border bg-muted/30 p-4">
              <p className="text-xs text-muted-foreground">الفصل</p>
              <p className="mt-1 break-all text-sm font-semibold text-foreground">
                {classId}
              </p>
            </div>

            <div className="rounded-2xl border border-border bg-muted/30 p-4">
              <p className="text-xs text-muted-foreground">مادة الفصل</p>
              <p className="mt-1 break-all text-sm font-semibold text-foreground">
                {offeringId}
              </p>
            </div>

            <div className="rounded-2xl border border-border bg-muted/30 p-4">
              <p className="text-xs text-muted-foreground">مفتاح المادة</p>
              <p className="mt-1 break-all text-sm font-semibold text-foreground">
                {subjectKey || "غير محدد"}
              </p>
            </div>

            <div className="rounded-2xl border border-border bg-muted/30 p-4">
              <p className="text-xs text-muted-foreground">الفصل الدراسي</p>
              <p className="mt-1 break-all text-sm font-semibold text-foreground">
                {termShortTitle || termTitle || termId || "غير محدد"}
              </p>
            </div>
          </div>

          <div className="mt-3 grid gap-3 md:grid-cols-3">
            <div className="rounded-2xl border border-border bg-muted/20 p-4">
              <p className="text-xs text-muted-foreground">المدرسة</p>
              <p className="mt-1 break-all text-sm font-semibold">
                {schoolId || "غير محدد"}
              </p>
            </div>

            <div className="rounded-2xl border border-border bg-muted/20 p-4">
              <p className="text-xs text-muted-foreground">السنة الدراسية</p>
              <p className="mt-1 break-all text-sm font-semibold">
                {academicYearId || "غير محدد"}
              </p>
            </div>

            <div className="rounded-2xl border border-border bg-muted/20 p-4">
              <p className="text-xs text-muted-foreground">الصف</p>
              <p className="mt-1 break-all text-sm font-semibold">
                {gradeId || "غير محدد"}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <section className="grid gap-4 lg:grid-cols-[1fr_380px]">
        <Card>
          <CardHeader>
            <div className="flex flex-col justify-between gap-3 md:flex-row md:items-center">
              <div className="space-y-1">
                <CardTitle className="flex items-center gap-2">
                  <Users className="size-5 text-primary" />
                  طلاب الفصل
                </CardTitle>
                <CardDescription>
                  اختر الطلاب الذين تريد تحفيزهم داخل مادة {subjectTitle}.
                </CardDescription>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleToggleFilteredStudents}
                  disabled={loading || filteredStudents.length === 0}
                >
                  {allFilteredSelected
                    ? "إلغاء تحديد المعروض"
                    : "تحديد المعروض"}
                </Button>

                <Button
                  type="button"
                  variant="ghost"
                  onClick={handleClearSelection}
                  disabled={selectedStudentIds.size === 0}
                >
                  مسح التحديد
                </Button>
              </div>
            </div>
          </CardHeader>

          <CardContent className="space-y-4">
            <div className="relative">
              <Search className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={searchText}
                onChange={(event) => setSearchText(event.target.value)}
                placeholder="ابحث باسم الطالب أو رقم الطالب..."
                className="h-11 w-full rounded-2xl border border-input bg-background pr-10 pl-3 text-sm outline-none ring-offset-background transition focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              />
            </div>

            {loading ? (
              <div className="flex min-h-52 items-center justify-center rounded-3xl border border-dashed border-border">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" />
                  جارٍ تحميل طلاب الفصل...
                </div>
              </div>
            ) : error ? (
              <div className="rounded-3xl border border-destructive/30 bg-destructive/5 p-5 text-sm leading-7 text-destructive">
                {error}
              </div>
            ) : filteredStudents.length === 0 ? (
              <div className="rounded-3xl border border-dashed border-border p-8 text-center">
                <h3 className="font-bold">لا يوجد طلاب مطابقون</h3>
                <p className="mt-2 text-sm leading-7 text-muted-foreground">
                  لم يتم العثور على طلاب لهذا الفصل أو لهذا البحث.
                </p>
              </div>
            ) : (
              <div className="overflow-hidden rounded-3xl border border-border">
                <div className="grid grid-cols-[44px_1fr_140px] gap-3 border-b border-border bg-muted/40 px-4 py-3 text-xs font-semibold text-muted-foreground">
                  <div />
                  <div>الطالب</div>
                  <div className="hidden text-center md:block">الحالة</div>
                </div>

                <div className="divide-y divide-border">
                  {filteredStudents.map((student) => {
                    const selected = selectedStudentIds.has(student.studentId);

                    return (
                      <button
                        key={student.studentId}
                        type="button"
                        onClick={() => handleToggleStudent(student.studentId)}
                        className="grid w-full grid-cols-[44px_1fr] gap-3 px-4 py-3 text-right transition hover:bg-muted/40 md:grid-cols-[44px_1fr_140px]"
                      >
                        <span
                          className={[
                            "mt-1 flex size-6 items-center justify-center rounded-lg border",
                            selected
                              ? "border-primary bg-primary text-primary-foreground"
                              : "border-border bg-background text-transparent",
                          ].join(" ")}
                        >
                          <CheckCircle2 className="size-4" />
                        </span>

                        <span className="min-w-0">
                          <span className="block truncate text-sm font-semibold text-foreground">
                            {student.displayName}
                          </span>

                          <span className="mt-1 block break-all text-xs text-muted-foreground">
                            studentId: {student.studentId}
                          </span>
                        </span>

                        <span className="hidden items-center justify-center md:flex">
                          <Badge variant={selected ? "default" : "secondary"}>
                            {selected ? "مختار" : "غير مختار"}
                          </Badge>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">إنشاء التحفيز</CardTitle>
              <CardDescription>
                اختر سببًا جاهزًا من الكتالوج أو استخدم الإدخال اليدوي.
              </CardDescription>
            </CardHeader>

            <CardContent className="space-y-4">
              <div className="rounded-3xl border border-border bg-muted/30 p-5 text-center">
                <p className="text-4xl font-bold text-foreground">
                  {selectedStudentIds.size.toLocaleString("ar-SA")}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">طالب مختار</p>
              </div>

              {catalogError ? (
                <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-3 text-xs leading-6 text-destructive">
                  {catalogError}
                </div>
              ) : null}

              <div className="space-y-2">
                <label className="text-sm font-semibold">سبب جاهز</label>
                <select
                  value={selectedReasonId}
                  onChange={(event) => handleSelectReason(event.target.value)}
                  disabled={loadingCatalog}
                  className="h-11 w-full rounded-2xl border border-input bg-background px-3 text-sm outline-none ring-offset-background transition focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  <option value={MANUAL_REASON_VALUE}>
                    إدخال يدوي بدون كتالوج
                  </option>

                  {reasons.map((reason) => (
                    <option key={reason.id} value={reason.id}>
                      {reason.title}
                    </option>
                  ))}
                </select>

                <p className="text-xs leading-6 text-muted-foreground">
                  {loadingCatalog
                    ? "جارٍ تحميل كتالوج التحفيز..."
                    : reasons.length > 0
                      ? "اختيار سبب جاهز يملأ النوع والقيمة والظهور تلقائيًا."
                      : "لا توجد أسباب جاهزة مطابقة للسياق، يمكنك استخدام الإدخال اليدوي."}
                </p>
              </div>

              {badges.length > 0 ? (
                <div className="space-y-2">
                  <label className="text-sm font-semibold">شارة اختيارية</label>
                  <select
                    value={selectedBadgeId}
                    onChange={(event) => setSelectedBadgeId(event.target.value)}
                    className="h-11 w-full rounded-2xl border border-input bg-background px-3 text-sm outline-none ring-offset-background transition focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  >
                    <option value="">بدون شارة</option>

                    {badges.map((badge) => (
                      <option key={badge.id} value={badge.id}>
                        {badge.emoji ? `${badge.emoji} ` : ""}
                        {badge.title}
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}

              <div className="space-y-2">
                <label className="text-sm font-semibold">نوع التحفيز</label>
                <select
                  value={eventType}
                  onChange={(event) =>
                    setEventType(
                      event.target.value as StudentGamificationEventType,
                    )
                  }
                  className="h-11 w-full rounded-2xl border border-input bg-background px-3 text-sm outline-none ring-offset-background transition focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  {EVENT_TYPE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-semibold">القيمة</label>
                <input
                  type="number"
                  min={0}
                  value={valueText}
                  onChange={(event) => setValueText(event.target.value)}
                  className="h-11 w-full rounded-2xl border border-input bg-background px-3 text-sm outline-none ring-offset-background transition focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                />
                <p className="text-xs leading-6 text-muted-foreground">
                  في النقاط و XP تمثل القيمة العددية. في الشارة يمكن تركها 0.
                </p>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-semibold">سبب التحفيز</label>
                <input
                  value={reasonTitle}
                  onChange={(event) => setReasonTitle(event.target.value)}
                  placeholder="مثال: مشاركة مميزة"
                  className="h-11 w-full rounded-2xl border border-input bg-background px-3 text-sm outline-none ring-offset-background transition focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-semibold">الظهور</label>
                <select
                  value={visibility}
                  onChange={(event) =>
                    setVisibility(
                      event.target.value as StudentGamificationEventVisibility,
                    )
                  }
                  className="h-11 w-full rounded-2xl border border-input bg-background px-3 text-sm outline-none ring-offset-background transition focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  {VISIBILITY_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>

                {selectedVisibilityOption ? (
                  <p className="text-xs leading-6 text-muted-foreground">
                    {selectedVisibilityOption.description}
                  </p>
                ) : null}
              </div>

              {selectedReason ? (
                <div className="rounded-2xl border border-border bg-muted/30 p-3">
                  <p className="text-xs font-semibold text-muted-foreground">
                    بيانات السبب المختار
                  </p>
                  <p className="mt-2 text-sm font-semibold">
                    {selectedReason.title}
                  </p>
                  <p className="mt-1 text-xs leading-6 text-muted-foreground">
                    {selectedReason.description || "بدون وصف"}
                  </p>
                </div>
              ) : null}

              {selectedBadge ? (
                <div className="rounded-2xl border border-border bg-muted/30 p-3">
                  <p className="text-xs font-semibold text-muted-foreground">
                    الشارة المختارة
                  </p>
                  <p className="mt-2 text-sm font-semibold">
                    {selectedBadge.emoji ? `${selectedBadge.emoji} ` : ""}
                    {selectedBadge.title}
                  </p>
                  <p className="mt-1 text-xs leading-6 text-muted-foreground">
                    {selectedBadge.description || "بدون وصف"}
                  </p>
                </div>
              ) : null}

              <div className="space-y-2">
                <label className="text-sm font-semibold">ملاحظة اختيارية</label>
                <textarea
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  rows={4}
                  placeholder="اكتب ملاحظة قصيرة إن وجدت..."
                  className="w-full resize-none rounded-2xl border border-input bg-background px-3 py-3 text-sm outline-none ring-offset-background transition focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                />
              </div>

              <Button
                type="button"
                className="w-full"
                disabled={
                  saving ||
                  loading ||
                  selectedRows.length === 0 ||
                  !reasonTitle.trim() ||
                  !valueIsValid
                }
                onClick={handleCreateGamificationEvents}
              >
                {saving ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Save className="size-4" />
                )}
                حفظ التحفيز
              </Button>
            </CardContent>
          </Card>
        </div>
      </section>

      <Card>
        <CardHeader>
          <div className="flex flex-col justify-between gap-3 md:flex-row md:items-center">
            <div className="space-y-1">
              <CardTitle className="flex items-center gap-2">
                <Trophy className="size-5 text-primary" />
                لوحة الترتيب داخل المادة
              </CardTitle>
              <CardDescription>
                ترتيب الطلاب حسب أحداث التحفيز النشطة داخل هذه المادة.
              </CardDescription>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">الترتيب حسب</span>

              <select
                value={leaderboardSortBy}
                onChange={(event) =>
                  setLeaderboardSortBy(
                    event.target.value as StudentGamificationLeaderboardSortBy,
                  )
                }
                className="h-10 rounded-2xl border border-input bg-background px-3 text-sm outline-none ring-offset-background transition focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                {LEADERBOARD_SORT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </CardHeader>

        <CardContent>
          {loadingEvents ? (
            <div className="flex min-h-40 items-center justify-center rounded-3xl border border-dashed border-border">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                جارٍ تجهيز لوحة الترتيب...
              </div>
            </div>
          ) : leaderboardRows.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-border p-8 text-center">
              <div className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
                <Trophy className="size-6" />
              </div>
              <h3 className="mt-4 font-bold">لا توجد بيانات ترتيب بعد</h3>
              <p className="mt-2 text-sm leading-7 text-muted-foreground">
                عند إنشاء أحداث تحفيز للطلاب ستظهر لوحة الترتيب هنا.
              </p>
            </div>
          ) : (
            <div className="overflow-hidden rounded-3xl border border-border">
              <div className="grid grid-cols-[70px_1fr_120px_120px_120px] gap-3 border-b border-border bg-muted/40 px-4 py-3 text-xs font-semibold text-muted-foreground">
                <div>الترتيب</div>
                <div>الطالب</div>
                <div className="text-center">النقاط</div>
                <div className="text-center">XP</div>
                <div className="text-center">الشارات</div>
              </div>

              <div className="divide-y divide-border">
                {leaderboardRows.map((row) => {
                  const progress = progressByStudentId.get(row.studentId);
                  const currentLevel = progress?.level.currentLevel;
                  const nextLevel = progress?.level.nextLevel;
                  const unlockedAchievements =
                    progress?.achievements.unlocked ?? [];

                  return (
                    <div
                      key={row.studentId}
                      className="grid grid-cols-[70px_1fr] gap-3 px-4 py-4 md:grid-cols-[70px_1fr_120px_120px_120px]"
                    >
                      <div>
                        <div className="flex size-10 items-center justify-center rounded-2xl bg-primary/10 text-sm font-bold text-primary">
                          #{row.rank}
                        </div>
                      </div>

                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold">
                          {row.studentDisplayName}
                        </p>

                        <div className="mt-2 flex flex-wrap gap-2">
                          {currentLevel ? (
                            <Badge variant="default">
                              {currentLevel.emoji
                                ? `${currentLevel.emoji} `
                                : ""}
                              {currentLevel.title}
                            </Badge>
                          ) : (
                            <Badge variant="secondary">بدون مستوى</Badge>
                          )}

                          {unlockedAchievements.length > 0 ? (
                            <Badge variant="outline">
                              {unlockedAchievements.length.toLocaleString(
                                "ar-SA",
                              )}{" "}
                              إنجاز
                            </Badge>
                          ) : null}
                        </div>

                        {nextLevel ? (
                          <div className="mt-3 space-y-1">
                            <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                              <span>
                                التالي:{" "}
                                {nextLevel.emoji ? `${nextLevel.emoji} ` : ""}
                                {nextLevel.title}
                              </span>
                              <span>
                                {progress?.level.progressToNextLevelPercentage.toLocaleString(
                                  "ar-SA",
                                )}
                                %
                              </span>
                            </div>

                            <div className="h-2 overflow-hidden rounded-full bg-muted">
                              <div
                                className="h-full rounded-full bg-primary transition-all"
                                style={{
                                  width: `${progress?.level.progressToNextLevelPercentage ?? 0}%`,
                                }}
                              />
                            </div>
                          </div>
                        ) : currentLevel ? (
                          <p className="mt-2 text-xs text-muted-foreground">
                            وصل إلى أعلى مستوى متاح حاليًا.
                          </p>
                        ) : null}

                        <p className="mt-2 text-xs text-muted-foreground">
                          {row.activeEvents.toLocaleString("ar-SA")} حدث نشط
                        </p>

                        <p className="mt-1 text-xs text-muted-foreground">
                          آخر تحفيز: {formatEventDate(row.latestEventAt)}
                        </p>

                        {unlockedAchievements.length > 0 ? (
                          <div className="mt-3 flex flex-wrap gap-2">
                            {unlockedAchievements
                              .slice(0, 3)
                              .map((achievement) => (
                                <Badge
                                  key={achievement.ruleId}
                                  variant="secondary"
                                >
                                  {achievement.emoji
                                    ? `${achievement.emoji} `
                                    : ""}
                                  {achievement.title}
                                </Badge>
                              ))}
                          </div>
                        ) : null}
                      </div>

                      <div className="hidden items-center justify-center md:flex">
                        <Badge variant="secondary">
                          {row.totalPoints.toLocaleString("ar-SA")}
                        </Badge>
                      </div>

                      <div className="hidden items-center justify-center md:flex">
                        <Badge variant="secondary">
                          {row.totalXp.toLocaleString("ar-SA")}
                        </Badge>
                      </div>

                      <div className="hidden items-center justify-center md:flex">
                        <Badge variant="outline">
                          {row.netBadgeCount.toLocaleString("ar-SA")}
                        </Badge>
                      </div>

                      <div className="col-span-2 grid grid-cols-3 gap-2 md:hidden">
                        <div className="rounded-2xl bg-muted/40 p-2 text-center">
                          <p className="text-xs text-muted-foreground">نقاط</p>
                          <p className="font-bold">
                            {row.totalPoints.toLocaleString("ar-SA")}
                          </p>
                        </div>

                        <div className="rounded-2xl bg-muted/40 p-2 text-center">
                          <p className="text-xs text-muted-foreground">XP</p>
                          <p className="font-bold">
                            {row.totalXp.toLocaleString("ar-SA")}
                          </p>
                        </div>

                        <div className="rounded-2xl bg-muted/40 p-2 text-center">
                          <p className="text-xs text-muted-foreground">شارات</p>
                          <p className="font-bold">
                            {row.netBadgeCount.toLocaleString("ar-SA")}
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex flex-col justify-between gap-3 md:flex-row md:items-center">
            <div className="space-y-1">
              <CardTitle className="flex items-center gap-2">
                <History className="size-5 text-primary" />
                سجل التحفيز داخل المادة
              </CardTitle>
              <CardDescription>
                آخر أحداث التحفيز المرتبطة بهذه المادة وهذا الفصل الدراسي.
              </CardDescription>
            </div>

            {rulesError ? (
              <div className="mb-4 rounded-2xl border border-destructive/30 bg-destructive/5 p-3 text-xs leading-6 text-destructive">
                {rulesError}
              </div>
            ) : null}

            {loadingRules ? (
              <div className="mb-4 rounded-2xl border border-border bg-muted/30 p-3 text-xs leading-6 text-muted-foreground">
                جارٍ تحميل قواعد المستويات والإنجازات...
              </div>
            ) : null}

            <Button
              type="button"
              variant="outline"
              onClick={() => void loadEvents()}
              disabled={loadingEvents}
            >
              {loadingEvents ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <History className="size-4" />
              )}
              تحديث السجل
            </Button>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-2xl border border-border bg-muted/30 p-4">
              <p className="text-xs text-muted-foreground">إجمالي الأحداث</p>
              <p className="mt-1 text-2xl font-bold">
                {events.length.toLocaleString("ar-SA")}
              </p>
            </div>

            <div className="rounded-2xl border border-border bg-muted/30 p-4">
              <p className="text-xs text-muted-foreground">إجمالي النقاط</p>
              <p className="mt-1 text-2xl font-bold">
                {totalPoints.toLocaleString("ar-SA")}
              </p>
            </div>

            <div className="rounded-2xl border border-border bg-muted/30 p-4">
              <p className="text-xs text-muted-foreground">إجمالي XP</p>
              <p className="mt-1 text-2xl font-bold">
                {totalXp.toLocaleString("ar-SA")}
              </p>
            </div>
          </div>

          {loadingEvents ? (
            <div className="flex min-h-40 items-center justify-center rounded-3xl border border-dashed border-border">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                جارٍ تحميل سجل التحفيز...
              </div>
            </div>
          ) : eventsError ? (
            <div className="rounded-3xl border border-destructive/30 bg-destructive/5 p-5 text-sm leading-7 text-destructive">
              {eventsError}
            </div>
          ) : events.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-border p-8 text-center">
              <div className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
                <Trophy className="size-6" />
              </div>
              <h3 className="mt-4 font-bold">لا يوجد سجل تحفيز بعد</h3>
              <p className="mt-2 text-sm leading-7 text-muted-foreground">
                عند حفظ أول تحفيز لهذه المادة سيظهر هنا.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {events.map((event) => {
                const achievementReward = isAchievementRewardEvent(event);

                return (
                  <div
                    key={event.id}
                    className={[
                      "rounded-3xl border p-4 transition",
                      achievementReward
                        ? "border-amber-300 bg-amber-50/70 dark:border-amber-900 dark:bg-amber-950/20"
                        : "border-border bg-background",
                    ].join(" ")}
                  >
                    <div className="flex flex-col justify-between gap-3 md:flex-row md:items-start">
                      <div className="min-w-0 space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          {achievementReward ? (
                            <Badge className="bg-amber-500 text-black hover:bg-amber-500">
                              🎉 مكافأة إنجاز
                            </Badge>
                          ) : null}

                          <Badge variant="secondary">
                            {formatEventType(event.eventType)}
                          </Badge>

                          <Badge
                            variant={
                              event.status === "ACTIVE" ? "default" : "outline"
                            }
                          >
                            {event.status}
                          </Badge>

                          <Badge variant="outline">
                            {formatVisibility(event.visibility)}
                          </Badge>
                        </div>

                        <div>
                          <h3 className="truncate text-sm font-bold">
                            {studentNameById.get(event.studentId) ??
                              event.studentId}
                          </h3>

                          <p className="mt-1 text-sm leading-7 text-muted-foreground">
                            {event.reasonTitle ||
                              event.title ||
                              event.description ||
                              "تحفيز بدون سبب مكتوب"}
                          </p>

                          {achievementReward ? (
                            <p className="mt-2 rounded-2xl border border-amber-200 bg-amber-100/70 p-3 text-xs leading-6 text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
                              أُنشئ هذا الحدث تلقائيًا بعد تحقق شرط إنجاز
                              للطالب.
                            </p>
                          ) : null}
                        </div>

                        {event.badgeTitle ? (
                          <p className="rounded-2xl bg-muted/40 p-3 text-xs leading-6 text-muted-foreground">
                            الشارة: {event.badgeTitle}
                          </p>
                        ) : null}

                        {event.note ? (
                          <p className="rounded-2xl bg-muted/40 p-3 text-xs leading-6 text-muted-foreground">
                            {event.note}
                          </p>
                        ) : null}
                      </div>

                      <div className="shrink-0 space-y-2 text-right md:min-w-44">
                        <div className="rounded-2xl border border-border bg-background/70 p-3">
                          <p className="text-xs text-muted-foreground">
                            القيمة
                          </p>
                          <p className="mt-1 text-xl font-bold">
                            {event.value.toLocaleString("ar-SA")}{" "}
                            <span className="text-xs font-normal text-muted-foreground">
                              {event.valueKind}
                            </span>
                          </p>
                        </div>

                        <p className="text-xs text-muted-foreground">
                          {formatEventDate(event.occurredAt)}
                        </p>
                      </div>
                    </div>

                    <div className="mt-3 border-t border-border pt-3">
                      <p className="break-all text-xs text-muted-foreground">
                        eventId: {event.id}
                      </p>

                      {achievementReward ? (
                        <p className="mt-1 break-all text-xs text-muted-foreground">
                          achievementRuleId: {event.sourceId || "غير محدد"}
                        </p>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
