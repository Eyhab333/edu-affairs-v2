"use client";

import { useMemo, useState, useEffect } from "react";

import { toast } from "sonner";
import {
  MonitorPlay,
  ShieldCheck,
  Clipboard,
  ExternalLink,
  Pause,
  Play,
  Square,
} from "lucide-react";

import type {
  ClassroomDisplayPhotoFallbackMode,
  ClassroomDisplayPrivacyMode,
  MembershipRole,
  ClassroomDisplayThemeKey,
  ClassroomDisplaySession,
  ClassroomDisplaySessionStatus,
} from "@takween/contracts";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

import {
  createClassroomDisplaySession,
  findReusableClassroomDisplaySession,
  updateClassroomDisplaySessionStatus,
  updateClassroomDisplaySessionTheme,
} from "@/lib/classroom-display-sessions";

const classroomDisplayThemeOptions: Array<{
  value: ClassroomDisplayThemeKey;
  label: string;
  emoji: string;
  description: string;
}> = [
  {
    value: "STARS",
    label: "نجوم",
    emoji: "⭐",
    description: "شكل عام مناسب لكل الفصول",
  },
  {
    value: "SPACE",
    label: "فضاء",
    emoji: "🚀",
    description: "كواكب ونجوم وحماس",
  },
  {
    value: "OCEAN",
    label: "بحر",
    emoji: "🐬",
    description: "ألوان هادئة ومبهجة",
  },
  {
    value: "FOREST",
    label: "غابة",
    emoji: "🌳",
    description: "طبيعة وحيوانات لطيفة",
  },
  {
    value: "STADIUM",
    label: "ملعب",
    emoji: "⚽",
    description: "منافسة وأبطال",
  },
  {
    value: "CANDY",
    label: "ألوان",
    emoji: "🍭",
    description: "ألوان مرحة جدًا",
  },
];

type ClassroomDisplayLaunchCardProps = {
  orgId: string;
  startedByPersonId: string;
  startedByRoleKey?: MembershipRole;
  classId: string;
  offeringId: string;
  schoolId: string;
  academicYearId: string;
  gradeId: string;
  subjectKey: string;
  subjectTitle: string;
  termId: string;
  termTitle: string;
  termShortTitle: string;
  studentsCount: number;
  feedItemsCount: number;
};

function isReusableSessionStatus(status: ClassroomDisplaySessionStatus) {
  return status === "ACTIVE" || status === "PAUSED";
}

export function ClassroomDisplayLaunchCard({
  orgId,
  startedByPersonId,
  startedByRoleKey,
  classId,
  offeringId,
  schoolId,
  academicYearId,
  gradeId,
  subjectKey,
  subjectTitle,
  termId,
  termTitle,
  termShortTitle,
  studentsCount,
  feedItemsCount,
}: ClassroomDisplayLaunchCardProps) {
  const [launching, setLaunching] = useState(false);
  const [privacyMode, setPrivacyMode] =
    useState<ClassroomDisplayPrivacyMode>("NICKNAME");

  const [photoFallbackMode, setPhotoFallbackMode] =
    useState<ClassroomDisplayPhotoFallbackMode>("AVATAR");

  const [showLeaderboard, setShowLeaderboard] = useState(true);
  const [showGamificationFeed, setShowGamificationFeed] = useState(true);
  const [showChallenge, setShowChallenge] = useState(false);
  const [showTimer, setShowTimer] = useState(false);
  const [showLessonGoal, setShowLessonGoal] = useState(true);
  const [showStudentPhotos, setShowStudentPhotos] = useState(false);

  const [lessonGoal, setLessonGoal] = useState("");
  const [encouragementMessage, setEncouragementMessage] = useState("");
  const [displayThemeKey, setDisplayThemeKey] =
    useState<ClassroomDisplayThemeKey>("STARS");

  const [activeSession, setActiveSession] =
    useState<ClassroomDisplaySession | null>(null);

  const [updatingSessionStatus, setUpdatingSessionStatus] = useState(false);
  const [loadingReusableSession, setLoadingReusableSession] = useState(false);
  const canLaunch = useMemo(() => {
    return Boolean(
      orgId &&
      startedByPersonId &&
      classId &&
      offeringId &&
      schoolId &&
      academicYearId &&
      subjectKey &&
      termId,
    );
  }, [academicYearId, classId, offeringId, schoolId, subjectKey, termId]);

  function buildDisplaySessionUrl(sessionId: string, themeOverride?: string) {
    return `/display/classroom/sessions/${sessionId}?orgId=${encodeURIComponent(
      orgId,
    )}&theme=${encodeURIComponent(
      themeOverride ?? activeSession?.displayThemeKey ?? displayThemeKey,
    )}`;
  }

  function openDisplaySession(sessionId: string, themeOverride?: string) {
    window.open(
      buildDisplaySessionUrl(sessionId, themeOverride),
      "_blank",
      "noopener,noreferrer",
    );
  }

  async function openSessionWithSelectedTheme(
    session: ClassroomDisplaySession,
  ) {
    const now = Date.now();

    const nextSession =
      session.displayThemeKey === displayThemeKey
        ? session
        : {
            ...session,
            displayThemeKey,
            updatedAt: now,
          };

    if (session.displayThemeKey !== displayThemeKey) {
      await updateClassroomDisplaySessionTheme({
        orgId,
        sessionId: session.id,
        displayThemeKey,
      });
    }

    setActiveSession(nextSession);
    openDisplaySession(nextSession.id, nextSession.displayThemeKey);
  }

  async function copyDisplaySessionLink() {
    if (!activeSession) return;

    const url = `${window.location.origin}${buildDisplaySessionUrl(
      activeSession.id,
      activeSession.displayThemeKey ?? displayThemeKey,
    )}`;

    try {
      await navigator.clipboard.writeText(url);
      toast.success("تم نسخ رابط شاشة الطلاب.");
    } catch {
      toast.error("تعذر نسخ الرابط.");
    }
  }

  async function handleUpdateSessionStatus(
    nextStatus: ClassroomDisplaySessionStatus,
  ) {
    if (!activeSession) return;

    setUpdatingSessionStatus(true);

    try {
      await updateClassroomDisplaySessionStatus({
        orgId,
        sessionId: activeSession.id,
        status: nextStatus,
      });

      const now = Date.now();

      setActiveSession((current) =>
        current
          ? {
              ...current,
              status: nextStatus,
              updatedAt: now,
              ...(nextStatus === "ENDED" ? { endedAt: now } : {}),
              ...(nextStatus === "ACTIVE" ? { lastHeartbeatAt: now } : {}),
            }
          : current,
      );

      if (nextStatus === "PAUSED") {
        toast.success("تم إيقاف شاشة الطلاب مؤقتًا.");
      } else if (nextStatus === "ACTIVE") {
        toast.success("تم استئناف شاشة الطلاب.");
      } else if (nextStatus === "ENDED") {
        toast.success("تم إنهاء جلسة شاشة الطلاب.");
      }
    } catch {
      toast.error("تعذر تحديث حالة الجلسة.");
    } finally {
      setUpdatingSessionStatus(false);
    }
  }

  useEffect(() => {
    let cancelled = false;

    async function loadReusableSession() {
      if (!orgId || !schoolId || !academicYearId || !termId) return;
      if (!classId || !offeringId) return;

      setLoadingReusableSession(true);

      try {
        const session = await findReusableClassroomDisplaySession({
          orgId,
          schoolId,
          academicYearId,
          termId,
          classId,
          classSubjectOfferingId: offeringId,
          subjectKey,
        });

        if (cancelled) return;

        setActiveSession(session);
      } catch {
        if (!cancelled) {
          toast.error("تعذر فحص الجلسة النشطة الحالية.");
        }
      } finally {
        if (!cancelled) {
          setLoadingReusableSession(false);
        }
      }
    }

    void loadReusableSession();

    return () => {
      cancelled = true;
    };
  }, [
    academicYearId,
    classId,
    offeringId,
    orgId,
    schoolId,
    subjectKey,
    termId,
  ]);

  async function handleLaunch() {
    if (!canLaunch) {
      toast.error("لا يمكن إطلاق شاشة الطلاب؛ توجد بيانات ناقصة.");
      return;
    }

    setLaunching(true);

    try {
      if (activeSession && isReusableSessionStatus(activeSession.status)) {
        await openSessionWithSelectedTheme(activeSession);
        toast.success("تم فتح الجلسة الحالية بالثيم المختار.");
        return;
      }

      const reusableSession = await findReusableClassroomDisplaySession({
        orgId,
        schoolId,
        academicYearId,
        termId,
        classId,
        classSubjectOfferingId: offeringId,
        subjectKey,
      });

      if (reusableSession) {
        await openSessionWithSelectedTheme(reusableSession);
        toast.success("تم العثور على جلسة نشطة وفتحها بالثيم المختار.");
        return;
      }

      const session = await createClassroomDisplaySession({
        orgId,
        schoolId,
        academicYearId,

        termId,
        termTitle,
        termShortTitle,

        classId,
        gradeId,
        streamId: "",

        subjectKey,
        classSubjectOfferingId: offeringId,

        startedByPersonId,
        startedByRoleKey,

        privacyMode,
        showStudentPhotos,
        photoFallbackMode,

        showLeaderboard,
        showGamificationFeed,
        showChallenge,
        showTimer,
        showLessonGoal,

        lessonGoal,
        encouragementMessage,
        displayThemeKey,
      });

      toast.success("تم إنشاء جلسة شاشة الفصل");

      setActiveSession(session);

      openDisplaySession(session.id, session.displayThemeKey);

      toast.success("تم فتح شاشة الطلاب في تبويب جديد.");
    } catch (error) {
      console.error(error);
      toast.error("تعذر إنشاء جلسة شاشة الفصل");
    } finally {
      setLaunching(false);
    }
  }

  return (
    <Card className="border-primary/20">
      <CardHeader>
        <div className="flex flex-col justify-between gap-3 md:flex-row md:items-start">
          <div className="flex items-start gap-3">
            <div className="flex size-12 shrink-0 items-center justify-center rounded-3xl bg-primary/10 text-primary">
              <MonitorPlay className="size-6" />
            </div>

            <div>
              <CardTitle>إطلاق شاشة الطلاب</CardTitle>
              <CardDescription className="mt-1 leading-6">
                إعدادات شاشة الفصل لهذه المادة قبل فتحها على الشاشة الكبيرة.
              </CardDescription>
            </div>
          </div>

          <Badge variant={canLaunch ? "secondary" : "destructive"}>
            {canLaunch ? "جاهزة للإطلاق" : "ينقصها سياق"}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-5">
        <div className="grid gap-3 md:grid-cols-4">
          <Info
            label="المادة"
            value={subjectTitle || subjectKey || "غير محدد"}
          />
          <Info label="الطلاب" value={studentsCount.toLocaleString("ar-SA")} />
          <Info
            label="أحداث التحفيز"
            value={feedItemsCount.toLocaleString("ar-SA")}
          />
          <Info
            label="الفصل الدراسي"
            value={termShortTitle || termTitle || termId || "غير محدد"}
          />
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <Field label="نمط الخصوصية">
            <select
              value={privacyMode}
              onChange={(event) =>
                setPrivacyMode(
                  event.target.value as ClassroomDisplayPrivacyMode,
                )
              }
              className="h-10 w-full rounded-xl border border-input bg-background px-3 text-sm"
            >
              <option value="FULL_NAME">الاسم الكامل</option>
              <option value="NICKNAME">الاسم المختصر</option>
              <option value="INITIALS_ONLY">الأحرف الأولى</option>
              <option value="AVATAR_ONLY">أفاتار فقط</option>
              <option value="DISPLAY_ALIAS">اسم عرض</option>
              <option value="ANONYMOUS_NUMBER">طالب رقم</option>
            </select>
          </Field>

          <Field label="بديل الصورة">
            <select
              value={photoFallbackMode}
              onChange={(event) =>
                setPhotoFallbackMode(
                  event.target.value as ClassroomDisplayPhotoFallbackMode,
                )
              }
              className="h-10 w-full rounded-xl border border-input bg-background px-3 text-sm"
            >
              <option value="INITIALS">الأحرف الأولى</option>
              <option value="AVATAR">أفاتار</option>
              <option value="ALIAS">اللقب</option>
              <option value="ANONYMOUS_NUMBER">طالب رقم</option>
            </select>
          </Field>

          <Field label="صور الطلاب">
            <label className="flex h-10 items-center gap-2 rounded-xl border border-input px-3 text-sm">
              <input
                type="checkbox"
                checked={showStudentPhotos}
                onChange={(event) => setShowStudentPhotos(event.target.checked)}
              />
              عرض الصور لمن لديه موافقة
            </label>
          </Field>
        </div>

        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-5">
          <Toggle
            label="الترتيب"
            checked={showLeaderboard}
            onChange={setShowLeaderboard}
          />
          <Toggle
            label="Feed التحفيز"
            checked={showGamificationFeed}
            onChange={setShowGamificationFeed}
          />
          <Toggle
            label="تحدي الحصة"
            checked={showChallenge}
            onChange={setShowChallenge}
          />
          <Toggle label="المؤقت" checked={showTimer} onChange={setShowTimer} />
          <Toggle
            label="هدف الحصة"
            checked={showLessonGoal}
            onChange={setShowLessonGoal}
          />
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <Field label="هدف الحصة">
            <input
              value={lessonGoal}
              onChange={(event) => setLessonGoal(event.target.value)}
              placeholder="مثال: إتقان قراءة الكلمات الجديدة"
              className="h-10 w-full rounded-xl border border-input bg-background px-3 text-sm"
            />
          </Field>

          <Field label="رسالة تشجيعية">
            <input
              value={encouragementMessage}
              onChange={(event) => setEncouragementMessage(event.target.value)}
              placeholder="مثال: أنتم نجوم اليوم"
              className="h-10 w-full rounded-xl border border-input bg-background px-3 text-sm"
            />
          </Field>
        </div>

        {!canLaunch ? (
          <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-sm leading-7 text-destructive">
            لا يمكن الإطلاق الآن؛ تأكد من وجود schoolId و academicYearId و
            subjectKey و termId في الرابط.
          </div>
        ) : null}

        <div className="grid gap-3">
          <div>
            <p className="text-sm font-bold">شكل شاشة الطلاب</p>
            <p className="text-xs text-muted-foreground">
              اختر الشكل المناسب لعمر الطلاب وطبيعة الحصة.
            </p>
          </div>

          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {classroomDisplayThemeOptions.map((option) => {
              const selected = displayThemeKey === option.value;

              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setDisplayThemeKey(option.value)}
                  className={`rounded-2xl border p-3 text-right transition ${
                    selected
                      ? "border-primary bg-primary/10"
                      : "border-border bg-background hover:bg-muted"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-2xl">{option.emoji}</span>
                    <span className="font-black">{option.label}</span>
                  </div>

                  <p className="mt-1 text-xs text-muted-foreground">
                    {option.description}
                  </p>
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex flex-col justify-between gap-3 rounded-2xl border border-border bg-muted/30 p-4 md:flex-row md:items-center">
          <div className="flex items-start gap-2 text-sm leading-7 text-muted-foreground">
            <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" />
          </div>

          <Button
            type="button"
            onClick={handleLaunch}
            disabled={!canLaunch || launching}
          >
            <MonitorPlay className="size-4" />
            {activeSession && isReusableSessionStatus(activeSession.status)
              ? "فتح الجلسة الحالية"
              : "فتح شاشة الطلاب"}
          </Button>
        </div>

        {loadingReusableSession ? (
          <div className="rounded-2xl border bg-muted/40 p-3 text-sm text-muted-foreground">
            جارٍ فحص وجود جلسة شاشة طلاب نشطة...
          </div>
        ) : null}

        {activeSession ? (
          <div className="rounded-2xl border bg-muted/40 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-black">الجلسة الحالية</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  الحالة الحالية: {activeSession.status}
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => openDisplaySession(activeSession.id)}
                >
                  <ExternalLink className="ml-2 size-4" />
                  فتح الشاشة
                </Button>

                <Button
                  type="button"
                  variant="outline"
                  onClick={copyDisplaySessionLink}
                >
                  <Clipboard className="ml-2 size-4" />
                  نسخ الرابط
                </Button>

                {activeSession.status === "ACTIVE" ? (
                  <Button
                    type="button"
                    variant="outline"
                    disabled={updatingSessionStatus}
                    onClick={() => handleUpdateSessionStatus("PAUSED")}
                  >
                    <Pause className="ml-2 size-4" />
                    إيقاف مؤقت
                  </Button>
                ) : null}

                {activeSession.status === "PAUSED" ? (
                  <Button
                    type="button"
                    variant="outline"
                    disabled={updatingSessionStatus}
                    onClick={() => handleUpdateSessionStatus("ACTIVE")}
                  >
                    <Play className="ml-2 size-4" />
                    استئناف
                  </Button>
                ) : null}

                {activeSession.status !== "ENDED" ? (
                  <Button
                    type="button"
                    variant="destructive"
                    disabled={updatingSessionStatus}
                    onClick={() => handleUpdateSessionStatus("ENDED")}
                  >
                    <Square className="ml-2 size-4" />
                    إنهاء
                  </Button>
                ) : null}
              </div>
            </div>
          </div>
        ) : null}

        <div className="hidden">
          {JSON.stringify({
            classId,
            offeringId,
            schoolId,
            academicYearId,
            gradeId,
            subjectKey,
            privacyMode,
            photoFallbackMode,
            showLeaderboard,
            showGamificationFeed,
            showChallenge,
            showTimer,
            showLessonGoal,
            showStudentPhotos,
            lessonGoal,
            encouragementMessage,
          })}
        </div>
      </CardContent>
    </Card>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border bg-background/80 p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 break-all text-sm font-bold">{value}</p>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="space-y-2">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-background/80 p-3 text-sm">
      <span>{label}</span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
    </label>
  );
}
